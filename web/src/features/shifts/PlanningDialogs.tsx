import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { RoleChip, roleIdentity } from '../../components/identity';
import { Field, Notice } from '../../components/ui';
import { roleNames, type Api } from '../../lib/api';
import { Dialog, SaveButton, WriteError, formatDateTime, useAction, useData } from '../common';
import { KIND_LABEL, eligibleFor, localDay, localMs, suggestKind, type CatalogStaff, type ShiftCatalog, type ShiftRow } from './rules';
import { timeRange } from './ShiftWeek';
import { dayTitle } from './ShiftDayList';
import { applyTemplate, bulkItems, templateFromWeek, toBatch, type BatchGap, type BatchResult, type PreviewItem, type WeekTemplate } from './plan';
import type { WeekDay } from './week';

/**
 * Fase 2, flujo F (S12): diálogos de planificación en lote. Todo lote pasa por la vista previa: la API valida cada turno
 * con las reglas de un turno suelto (`POST /turnos/lote/validar`) y, sin conflictos, lo crea como BORRADOR, todo o nada
 * (`POST /turnos/lote`). Los borradores se ven en el calendario y salen al personal con "Publicar semana".
 */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const LOAD_JUSTIFY = 'horas_semanales_excedidas';
type Validation = { resultados: BatchResult[]; huecos: BatchGap[] };

/** Fechas `yyyy-MM-dd` de `from` a `to`, ambas incluidas (máximo 31). */
function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let at = localMs(from, '12:00'); from && to && at <= localMs(to, '12:00') && out.length < 31; at += 86_400_000) out.push(localDay(at));
  return out;
}

/**
 * Vista previa de un lote: un renglón por turno con su resultado (sin conflictos, o el mismo motivo que daría un turno
 * suelto). Se puede quitar un turno o cambiar la persona; un cambio de persona pide validar de nuevo antes de crear.
 * `initial` ya validado (el generador) no se vuelve a pedir al abrir.
 */
export function BatchPreview({ api, catalog, items: start, initial, onClose, onCreated }: {
  api: Api; catalog: ShiftCatalog; items: PreviewItem[]; initial?: Validation; onClose: () => void; onCreated: (count: number) => void;
}) {
  const [items, setItems] = useState(() => initial ? start.map((item, index) => ({ ...item, result: initial.resultados.find(r => r.index === index) })) : start);
  const [gaps, setGaps] = useState<BatchGap[]>(initial?.huecos ?? []);
  const [stale, setStale] = useState(!initial);
  const [justification, setJustification] = useState('');
  const check = useAction(api), create = useAction(api);
  const staff = useMemo(() => new Map(catalog.staff.map(p => [p.id, p])), [catalog.staff]);

  const apply = (list: PreviewItem[], validation: Validation) => {
    setItems(list.map((item, index) => ({ ...item, result: validation.resultados.find(r => r.index === index) })));
    setGaps(validation.huecos ?? []);
    setStale(false);
  };
  const body = (list: PreviewItem[]) => ({ items: toBatch(list), ...(justification.trim().length >= 10 ? { justification: justification.trim() } : {}) });
  const validate = async (list = items) => { const result = await check.run<Validation>('/turnos/lote/validar', body(list)); if (result) apply(list, result); };
  // A batch without a prior server result is validated once when the preview opens.
  useEffect(() => { if (!initial && items.length) void validate(); }, []);

  const remove = (key: string) => setItems(list => list.filter(i => i.key !== key));
  const reassign = (key: string, staffId: string) => { setItems(list => list.map(i => i.key === key ? { ...i, staffId, person: staff.get(staffId)?.name ?? i.person, result: undefined, replaces: undefined } : i)); setStale(true); };
  const failed = items.filter(i => i.result && !i.result.ok);
  const fills = items.filter(i => i.fill).length;
  // Gaps from the generator carry why they stay open; a revalidated batch only lists them.
  const explained = gaps.some(g => g.mensaje);
  const gapsTitle = explained ? 'Huecos que quedan sin cubrir' : 'Huecos de cobertura con estos borradores';
  const needsJustification = items.some(i => i.result?.codigo === LOAD_JUSTIFY);
  const blocked = !items.length || stale || failed.length > 0 || check.busy;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (blocked) return;
    const saved = await create.run<{ creados: number }>('/turnos/lote', body(items));
    if (saved) { onCreated(saved.creados); return; }
  }
  // Un 409 lote_con_conflictos trae el resultado de cada turno: se marca en su renglón.
  useEffect(() => {
    const results = create.error?.code === 'lote_con_conflictos' ? create.error.details?.resultados as BatchResult[] | undefined : undefined;
    if (results) setItems(list => list.map((item, index) => ({ ...item, result: results.find(r => r.index === index) })));
  }, [create.error]);

  const days = [...new Set(items.map(i => localDay(Date.parse(i.start))))].sort();
  const today = localDay(Date.now());
  const label = `Crear ${plural(items.length, 'borrador', 'borradores')}`;
  return <Dialog title="Vista previa de los borradores" onClose={onClose} busy={create.busy}>
    <form className="module-form shift-preview" onSubmit={save} noValidate>
      {create.error?.code !== 'lote_con_conflictos' && <WriteError error={create.error} />}
      <WriteError error={check.error} />
      <p className="shift-preview-summary" role="status">
        {check.busy ? 'Validando con las reglas de descanso, tope de 7 días y ausencias…'
          : stale ? 'Hay cambios sin validar.'
          : failed.length ? `${plural(failed.length, 'turno tiene', 'turnos tienen')} conflicto. Quítalos o cambia la persona y vuelve a validar.`
          : `${plural(items.length, 'turno', 'turnos')} sin conflictos${fills ? `, ${plural(fills, 'agregado', 'agregados')} para cubrir el mínimo del área` : ''}. Se crean como borrador; nadie los ve hasta publicar la semana.`}
      </p>
      {!items.length && <Notice kind="info">No quedan turnos en la vista previa.</Notice>}
      {days.map(day => <section key={day} className="shift-preview-day" aria-label={dayTitle(day, today)}>
        <h3>{dayTitle(day, today)}</h3>
        <ul className="shift-preview-list">
          {items.filter(i => localDay(Date.parse(i.start)) === day).map(i => {
            const person = staff.get(i.staffId);
            const options = eligibleFor(catalog.staff, catalog.areas, i.areaId, person?.type ?? 'todos', false);
            return <li key={i.key} className={`shift-preview-item${i.result && !i.result.ok ? ' has-conflict' : ''}`}>
              <div className="shift-preview-who">
                <strong>{i.person}</strong>
                <span className="shift-preview-time">{timeRange(i.start, i.end)} · {KIND_LABEL[i.type] ?? i.type}</span>
                {i.replaces && <span className="shift-preview-note">Reemplaza a {staff.get(i.replaces)?.name ?? 'otra persona'}, que no podía.</span>}
                {i.fill && <span className="shift-preview-fill">Cubre el mínimo del área</span>}
              </div>
              <div className="shift-preview-result">
                {!i.result ? <span className="shift-preview-pending">{stale ? 'Sin validar' : 'Validando…'}</span>
                  : i.result.ok ? <span className="shift-preview-ok">Sin conflictos</span>
                  : <span className="shift-preview-error" role="note">{i.result.mensaje ?? 'Tiene un conflicto.'}</span>}
              </div>
              <div className="shift-preview-actions">
                {options.length > 1 && <select aria-label={`Persona del turno de ${i.person}`} value={i.staffId} onChange={e => reassign(i.key, e.target.value)}>
                  {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>}
                <button type="button" className="row-action" aria-label={`Quitar el turno de ${i.person} del ${dayTitle(day, today)}`} onClick={() => remove(i.key)}>Quitar</button>
              </div>
            </li>;
          })}
        </ul>
      </section>)}
      {gaps.length > 0 && <section className="shift-preview-gaps" aria-label={gapsTitle}>
        <h3>{gapsTitle}</h3>
        <ul>{gaps.slice(0, 8).map((g, k) => <li key={k}>{g.area} · {roleNames[g.role] ?? g.role}: {formatDateTime(g.start)} a {formatDateTime(g.end)} ({g.actual} de {g.required})
          {g.mensaje && <span className="shift-preview-note">{g.mensaje}</span>}</li>)}</ul>
        {gaps.length > 8 && <p className="form-hint">Y {plural(gaps.length - 8, 'hueco más', 'huecos más')}.</p>}
      </section>}
      {needsJustification && <Field label="Justificación de más de 44 h diurnas en la semana" value={justification} onChange={setJustification} minLength={10} maxLength={500}
        hint="Se guarda en cada turno que la necesite. Luego vuelve a validar." />}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={create.busy}>Cancelar</button>
        <button type="button" className="secondary-button" onClick={() => void validate()} disabled={check.busy || !items.length}>Validar de nuevo</button>
        <SaveButton busy={create.busy} label={label} disabled={blocked} />
      </div>
    </form>
  </Dialog>;
}

/** Personas elegibles del área, con casillas; el nombre es la etiqueta, la función va aparte. */
function PeopleChecklist({ people, selected, onChange }: { people: CatalogStaff[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  return <fieldset className="shift-people">
    <legend>Personas ({selected.length} de {people.length})</legend>
    {people.length > 1 && <div className="shift-people-tools">
      <button type="button" className="row-action" onClick={() => onChange(people.map(p => p.id))}>Elegir todas</button>
      <button type="button" className="row-action" onClick={() => onChange([])}>Ninguna</button>
    </div>}
    {people.length === 0 ? <p className="form-hint">Elige un área para ver a su personal.</p> : <ul>
      {people.map(p => <li key={p.id}><label className="check-field"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />{p.name}</label><RoleChip code={p.type} /></li>)}
    </ul>}
  </fieldset>;
}

function AreaSelect({ catalog, value, onChange, label = 'Área de los turnos' }: { catalog: ShiftCatalog; value: string; onChange: (id: string) => void; label?: string }) {
  const id = useId();
  return <div className="select-field"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={e => onChange(e.target.value)} required>
      <option value="">Elige un área</option>
      {catalog.areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select></div>;
}

const PATTERNS: { code: string; label: string; hint: string }[] = [
  { code: 'rotativo', label: 'Mañana, tarde y noche rotativo', hint: 'Tres turnos de 8 h; 5 días de trabajo y 2 de descanso; el turno avanza cada semana.' },
  { code: '12x36', label: '12 h de trabajo y 36 h de descanso', hint: 'Equipos de día y de noche en días alternos.' },
  { code: '24x72', label: 'Guardia 24 h con 72 h de descanso', hint: 'Una guardia cada cuatro días por persona.' },
  { code: 'personalizado', label: 'Personalizado', hint: 'Tú eliges horas por turno, días de trabajo y de descanso.' },
];

/**
 * Generador de rotaciones: personas (o el grupo de una función en el área), un patrón y un rango de fechas. La API
 * reparte las vueltas respetando descanso, tope de 7 días y cobertura, llena la cobertura mínima del área (L13) y
 * devuelve la vista previa con conflictos y los huecos que quedan con su motivo.
 */
export function RotationDialog({ api, catalog, defaultFrom, defaultTo, areaId: presetArea, onClose, onPreview }: {
  api: Api; catalog: ShiftCatalog; defaultFrom: string; defaultTo: string; areaId?: string; onClose: () => void;
  onPreview: (items: PreviewItem[], validation: Validation) => void;
}) {
  const [areaId, setAreaId] = useState(presetArea ?? ''), [people, setPeople] = useState<string[]>([]), [role, setRole] = useState('');
  const [pattern, setPattern] = useState('rotativo'), [from, setFrom] = useState(defaultFrom), [to, setTo] = useState(defaultTo);
  const [startTime, setStartTime] = useState('07:00'), [hours, setHours] = useState('8'), [workDays, setWorkDays] = useState('5'), [restDays, setRestDays] = useState('2');
  const action = useAction(api);
  const pool = useMemo(() => areaId ? eligibleFor(catalog.staff, catalog.areas, areaId, role || 'todos', false) : [], [catalog, areaId, role]);
  const custom = pattern === 'personalizado';
  const missing = [!areaId && 'el área', !people.length && !role && 'las personas o la función', (!from || !to) && 'las fechas'].filter(Boolean).join(', ');

  async function preview(event: FormEvent) {
    event.preventDefault();
    if (missing) return;
    const result = await action.run<{ items: (PreviewItem & { ok: boolean; codigo?: string; mensaje?: string; reemplazaA?: string; origen?: string })[]; huecos: BatchGap[] }>('/turnos/generar', {
      areaId, ...(people.length ? { staffIds: people } : { role }), pattern, from, to, startTime,
      ...(custom ? { hours: Number(hours), workDays: Number(workDays), restDays: Number(restDays) } : {}),
    });
    if (!result) return;
    const items = result.items.map((i, index) => ({ key: `g-${index}`, staffId: i.staffId, person: i.person, areaId: i.areaId, start: i.start, end: i.end, type: i.type, replaces: i.reemplazaA, fill: i.origen === 'cobertura' }));
    onPreview(items, { resultados: result.items.map((i, index) => ({ index, ok: i.ok, codigo: i.codigo, mensaje: i.mensaje })), huecos: result.huecos });
  }

  return <Dialog title="Generar rotación" onClose={onClose} busy={action.busy}>
    <form className="module-form shift-form" onSubmit={preview} noValidate>
      <WriteError error={action.error} />
      <fieldset className="shift-step"><legend><span className="shift-step-number">1</span>Quiénes</legend>
        <AreaSelect catalog={catalog} value={areaId} onChange={id => { setAreaId(id); setPeople([]); }} />
        <div className="select-field"><label htmlFor="rotation-role">Función del grupo</label>
          <select id="rotation-role" value={role} onChange={e => { setRole(e.target.value); setPeople([]); }}>
            <option value="">Todas las funciones</option>
            {catalog.roles.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select></div>
        <PeopleChecklist people={pool} selected={people} onChange={setPeople} />
        {!people.length && role && <p className="form-hint">Sin personas marcadas se usa todo el grupo de {roleIdentity(role).label} asignado al área.</p>}
      </fieldset>
      <fieldset className="shift-step"><legend><span className="shift-step-number">2</span>Patrón</legend>
        <div className="shift-patterns" role="radiogroup" aria-label="Patrón de la rotación">
          {PATTERNS.map(p => <label key={p.code} className={`shift-pattern${pattern === p.code ? ' is-selected' : ''}`}>
            <input type="radio" name="rotation-pattern" value={p.code} checked={pattern === p.code} onChange={() => setPattern(p.code)} />
            <span><strong>{p.label}</strong><span className="form-hint">{p.hint}</span></span>
          </label>)}
        </div>
        <div className="form-grid">
          <Field label="Hora de inicio" type="time" value={startTime} onChange={setStartTime} required />
          {custom && <><Field label="Horas por turno" type="number" min={4} max={24} value={hours} onChange={setHours} required />
            <Field label="Días de trabajo" type="number" min={1} max={6} value={workDays} onChange={setWorkDays} required />
            <Field label="Días de descanso" type="number" min={1} max={6} value={restDays} onChange={setRestDays} required /></>}
        </div>
      </fieldset>
      <fieldset className="shift-step"><legend><span className="shift-step-number">3</span>Fechas</legend>
        <div className="form-grid">
          <Field label="Desde" type="date" value={from} onChange={setFrom} required />
          <Field label="Hasta" type="date" value={to} onChange={setTo} required hint="Hasta 31 días." />
        </div>
      </fieldset>
      {missing && <p className="form-hint" role="status">Para generar falta indicar {missing}.</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button>
        <SaveButton busy={action.busy} label="Ver vista previa" disabled={Boolean(missing)} />
      </div>
    </form>
  </Dialog>;
}

/** Asignación masiva: el mismo horario a varias personas en uno o más días. */
export function BulkDialog({ catalog, defaultDate, areaId: presetArea, onClose, onPreview }: {
  catalog: ShiftCatalog; defaultDate: string; areaId?: string; onClose: () => void; onPreview: (items: PreviewItem[]) => void;
}) {
  const [areaId, setAreaId] = useState(presetArea ?? ''), [people, setPeople] = useState<string[]>([]);
  const [from, setFrom] = useState(defaultDate), [to, setTo] = useState(defaultDate), [startTime, setStartTime] = useState('07:00'), [endTime, setEndTime] = useState('15:00');
  const pool = useMemo(() => areaId ? eligibleFor(catalog.staff, catalog.areas, areaId, 'todos', false) : [], [catalog, areaId]);
  const dates = datesBetween(from, to);
  const startMs = from && startTime ? localMs(from, startTime) : NaN;
  let endMs = from && endTime ? localMs(from, endTime) : NaN;
  if (endMs <= startMs) endMs += 86_400_000;
  const type = Number.isFinite(startMs) && Number.isFinite(endMs) ? suggestKind(startMs, endMs) : 'diurno';
  const missing = [!areaId && 'el área', !people.length && 'las personas', !dates.length && 'las fechas', (!startTime || !endTime) && 'el horario'].filter(Boolean).join(', ');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (missing) return;
    const chosen = pool.filter(p => people.includes(p.id)).map(p => ({ id: p.id, name: p.name }));
    onPreview(bulkItems(people.map(id => chosen.find(p => p.id === id)!).filter(Boolean), dates, areaId, startTime, endTime, type));
  };
  return <Dialog title="Asignación masiva" onClose={onClose}>
    <form className="module-form shift-form" onSubmit={submit} noValidate>
      <fieldset className="shift-step"><legend><span className="shift-step-number">1</span>Quiénes</legend>
        <AreaSelect catalog={catalog} value={areaId} onChange={id => { setAreaId(id); setPeople([]); }} />
        <PeopleChecklist people={pool} selected={people} onChange={setPeople} />
      </fieldset>
      <fieldset className="shift-step"><legend><span className="shift-step-number">2</span>Cuándo</legend>
        <div className="form-grid">
          <Field label="Desde" type="date" value={from} onChange={setFrom} required />
          <Field label="Hasta" type="date" value={to} onChange={setTo} required />
          <Field label="Hora de inicio" type="time" value={startTime} onChange={setStartTime} required />
          <Field label="Hora de fin" type="time" value={endTime} onChange={setEndTime} required hint={Number.isFinite(endMs) && localDay(endMs - 1) !== localDay(startMs) ? 'Termina el día siguiente.' : undefined} />
        </div>
        <p className="form-hint" role="status">{plural(people.length * dates.length, 'turno', 'turnos')} · {KIND_LABEL[type]}</p>
      </fieldset>
      {missing && <p className="form-hint" role="status">Para seguir falta indicar {missing}.</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
        <SaveButton busy={false} label="Ver vista previa" disabled={Boolean(missing)} />
      </div>
    </form>
  </Dialog>;
}

/** Plantillas de semana por área: guardar la semana visible de un área y aplicar una plantilla a la semana visible. */
export function TemplatesDialog({ api, catalog, days, rows, version, areaId: presetArea, onClose, onApply }: {
  api: Api; catalog: ShiftCatalog; days: WeekDay[]; rows: ShiftRow[]; version: number; areaId?: string; onClose: () => void; onApply: (items: PreviewItem[]) => void;
}) {
  const list = useData<WeekTemplate[]>(api, '/turnos/plantillas', version);
  const [areaId, setAreaId] = useState(presetArea ?? ''), [name, setName] = useState(''), [saved, setSaved] = useState('');
  const save = useAction(api), retire = useAction(api);
  const shifts = areaId ? templateFromWeek(rows, days, areaId) : [];
  const names = useMemo(() => new Map(catalog.staff.map(p => [p.id, p.name])), [catalog.staff]);
  const canSave = Boolean(areaId) && name.trim().length >= 3 && shifts.length > 0;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    if (await save.run('/turnos/plantillas', { areaId, name: name.trim(), shifts })) { setSaved(`Plantilla "${name.trim()}" guardada con ${plural(shifts.length, 'turno', 'turnos')}.`); setName(''); list.refresh(); }
  }
  const templates = list.data ?? [];
  return <Dialog title="Plantillas de semana" onClose={onClose} busy={save.busy}>
    <div className="module-form">
      <form className="shift-step" onSubmit={submit} noValidate>
        <h3>Guardar esta semana</h3>
        <WriteError error={save.error} />
        {saved && <Notice kind="success">{saved}</Notice>}
        <AreaSelect catalog={catalog} value={areaId} onChange={setAreaId} label="Área de la plantilla" />
        <Field label="Nombre de la plantilla" value={name} onChange={setName} minLength={3} maxLength={80} required
          hint={areaId ? `${plural(shifts.length, 'turno', 'turnos')} de esta semana en el área.` : 'Elige el área cuya semana se guarda.'} />
        <div className="dialog-actions"><SaveButton busy={save.busy} label="Guardar esta semana como plantilla" disabled={!canSave} /></div>
      </form>
      <section className="shift-step" aria-labelledby="templates-title">
        <h3 id="templates-title">Aplicar a la semana que estás viendo</h3>
        <WriteError error={retire.error} />
        {list.loading && !list.data ? <p className="form-hint">Cargando plantillas…</p>
          : !templates.length ? <p className="form-hint">Todavía no hay plantillas guardadas.</p>
          : <ul className="shift-templates">{templates.map(t => <li key={t.id}>
            <div><strong>{t.name}</strong><span className="form-hint">{t.area} · {plural(t.shifts.length, 'turno', 'turnos')}</span></div>
            <button type="button" className="secondary-button" onClick={() => onApply(applyTemplate(t, days, id => names.get(id) ?? 'Persona'))}>Aplicar</button>
            <button type="button" className="row-action" disabled={retire.busy} onClick={async () => { if (await retire.run(`/turnos/plantillas/${t.id}`, { version: t.version }, 'PATCH')) list.refresh(); }}>Retirar</button>
          </li>)}</ul>}
      </section>
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>
    </div>
  </Dialog>;
}

type PublishResult = { published: number; warnings: BatchGap[] };
/** Publicar semana: resume cuántos borradores salen al personal; los huecos que queden se informan después. */
export function PublishWeekDialog({ api, drafts, label, from, to, areaId, areaName, onClose, onPublished }: {
  api: Api; drafts: number; label: string; from: string; to: string; areaId?: string; areaName?: string; onClose: () => void; onPublished: (result: PublishResult) => void;
}) {
  const action = useAction(api);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const result = await action.run<PublishResult>('/turnos/publicar', { from, to, ...(areaId ? { areaId } : {}) });
    if (result) onPublished(result);
  }
  return <Dialog title="Publicar semana" onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={submit}>
      <WriteError error={action.error} />
      <p>Se publicará{drafts === 1 ? '' : 'n'} <strong>{plural(drafts, 'borrador', 'borradores')}</strong> de la semana del {label}{areaName ? ` en ${areaName}` : ''}. Desde ese momento el personal los ve en Mis turnos y la base vuelve a revisar el descanso y el tope de horas de cada uno.</p>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button>
        <SaveButton busy={action.busy} label="Publicar" />
      </div>
    </form>
  </Dialog>;
}

/** Mover un turno publicado: muestra antes y después y pide el motivo (la API lo exige y queda en la auditoría). */
export function MoveDialog({ api, shift, start, end, onClose, onSaved }: {
  api: Api; shift: ShiftRow; start: string; end: string; onClose: () => void; onSaved: (version: number) => void;
}) {
  const action = useAction(api);
  const [reason, setReason] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 10) return;
    const saved = await action.run<{ version: number }>(`/turnos/${shift.id}`, moveBody(shift, start, end, reason.trim()), 'PATCH');
    if (saved) onSaved(saved.version);
  }
  const sameDay = localDay(Date.parse(shift.start)) === localDay(Date.parse(start));
  return <Dialog title="Mover turno" onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={submit} noValidate>
      <WriteError error={action.error} />
      <dl className="shift-detail-list">
        <div><dt>Persona</dt><dd>{shift.person} · {shift.area}</dd></div>
        <div><dt>Antes</dt><dd>{dayTitle(localDay(Date.parse(shift.start)), localDay(Date.now()))}, {timeRange(shift.start, shift.end)}</dd></div>
        <div><dt>Después</dt><dd>{sameDay ? '' : `${dayTitle(localDay(Date.parse(start)), localDay(Date.now()))}, `}{timeRange(start, end)}</dd></div>
      </dl>
      <Field label="Motivo del cambio" value={reason} onChange={setReason} minLength={10} maxLength={500} required autoFocus
        hint="La persona ya ve este turno publicado; el motivo queda en la auditoría." />
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button>
        <SaveButton busy={action.busy} label="Guardar cambio" disabled={reason.trim().length < 10} />
      </div>
    </form>
  </Dialog>;
}

/** Cuerpo de `PATCH /turnos/{id}` para un nuevo horario: misma persona, área, tipo, justificación y excepción. */
export function moveBody(shift: ShiftRow, start: string, end: string, reason: string) {
  return {
    staffId: shift.staffId, areaId: shift.areaId, start, end, type: shift.type, version: shift.version, reason,
    ...(shift.justification ? { justification: shift.justification } : {}), ...(shift.emergencyReason ? { emergencyReason: shift.emergencyReason } : {}),
  };
}
