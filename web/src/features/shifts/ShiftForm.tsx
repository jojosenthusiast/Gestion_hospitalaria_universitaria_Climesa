import { useMemo, useState, type FormEvent } from 'react';
import { AreaChip, RoleChip, areaIdentity, roleIdentity } from '../../components/identity';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { Field, Notice } from '../../components/ui';
import type { Api, Shift, ShiftInput } from '../../lib/api';
import { Dialog, SaveButton, WriteError, useAction } from '../common';
import { DURATION, KIND_LABEL, LOAD, conflictsFor, durationProblem, eligibleFor, endOf, hoursBetween, loadFor, localDay, localMs, localTime, suggestKind, type CatalogStaff, type ShiftCatalog, type ShiftKind } from './rules';
import './shifts.css';

/** `draft` prellena un turno nuevo con lo que la pantalla ya sabe (por ejemplo, el suplente de una ausencia). */
export type ShiftDraft = { areaId: string; start: string; end: string; type: string; staffId: string };
type Props = { api: Api; shift: Shift | null; draft?: ShiftDraft; catalog: ShiftCatalog; shifts: Shift[]; onClose: () => void; onSaved: (id?: string) => void };
/** Códigos con los que la API pide un motivo de emergencia para superar la carga (CARGA-01/02). */
const LOAD_CODES = ['carga_semanal_excedida', 'dias_seguidos_excedidos'];

const KINDS: ShiftKind[] = ['diurno', 'nocturno', 'guardia'];

/**
 * Asignar turno de punta a punta: 1) área del turno, 2) fecha y horario, 3) personal elegible para esa área y rol.
 * El personal se busca escribiendo; las personas con conflicto aparecen apagadas con su motivo y los conflictos de
 * la persona elegida se listan en línea. La API vuelve a validar todo (traslape, descanso, 4–24 h, inscripción).
 */
export function ShiftForm({ api, shift, draft, catalog, shifts, onClose, onSaved }: Props) {
  const action = useAction(api);
  const base = shift ?? draft;
  const [areaId, setAreaId] = useState(base?.areaId ?? '');
  const [date, setDate] = useState(base ? localDay(Date.parse(base.start)) : '');
  const [startTime, setStartTime] = useState(base ? localTime(Date.parse(base.start)) : '');
  const [endTime, setEndTime] = useState(base ? localTime(Date.parse(base.end)) : '');
  const [kind, setKind] = useState<ShiftKind>((base?.type as ShiftKind) ?? 'diurno');
  const [kindTouched, setKindTouched] = useState(Boolean(base));
  const [staffId, setStaffId] = useState(base?.staffId ?? '');
  const [role, setRole] = useState('todos');
  const [others, setOthers] = useState(false);
  const [note, setNote] = useState(shift?.justification ?? '');
  const [reason, setReason] = useState('');
  const [emergency, setEmergency] = useState('');
  const askEmergency = LOAD_CODES.includes(action.error?.code ?? '') || emergency.length > 0;

  const startMs = date && startTime ? localMs(date, startTime) : NaN;
  const endMs = date && startTime && endTime ? endOf(date, startTime, endTime) : NaN;
  const chosenKind = kindTouched || !Number.isFinite(startMs) || !Number.isFinite(endMs) ? kind : suggestKind(startMs, endMs);
  const durationIssue = durationProblem(startMs, endMs, chosenKind);
  const nextDay = Number.isFinite(startMs) && Number.isFinite(endMs) && localDay(endMs - 1) !== localDay(startMs);
  const isGuard24 = chosenKind === 'guardia' && Number.isFinite(startMs) && Number.isFinite(endMs) && hoursBetween(startMs, endMs) === 24;
  /** Guardia de 24 h en un clic: misma hora de inicio y de fin (termina al día siguiente), tipo guardia. RN-13 pide luego 12 h de descanso. */
  const guard24 = () => { const at = startTime || '07:00'; setStartTime(at); setEndTime(at); setKind('guardia'); setKindTouched(true); };

  const areaItems = useMemo<PickerItem[]>(() => catalog.areas.map(a => ({ id: a.id, label: a.name, detail: areaIdentity(a.name, a.type).label })), [catalog.areas]);
  const areaValue = areaItems.find(i => i.id === areaId) ?? (shift && areaId === shift.areaId ? { id: shift.areaId, label: shift.area } : null);
  const roleOptions = useMemo(() => catalog.roles, [catalog.roles]);
  const pool = useMemo(() => eligibleFor(catalog.staff, catalog.areas, areaId, role, others), [catalog, areaId, role, others]);
  const chosen: CatalogStaff | undefined = catalog.staff.find(p => p.id === staffId);
  const conflictsOf = (person: CatalogStaff) => conflictsFor(person, startMs, endMs, chosenKind, shifts, shift?.id);
  const staffItems = useMemo<PickerItem[]>(() => pool.map(p => {
    const found = conflictsFor(p, startMs, endMs, chosenKind, shifts, shift?.id);
    return { id: p.id, label: p.name, detail: [roleIdentity(p.type).label, p.specialty, p.area].filter(Boolean).join(' · '), disabled: found.length > 0, reason: found[0]?.text };
  }), [pool, startMs, endMs, chosenKind, shifts, shift?.id]);
  const staffValue = staffItems.find(i => i.id === staffId) ?? (chosen ? { id: chosen.id, label: chosen.name, detail: roleIdentity(chosen.type).label } : shift && staffId === shift.staffId ? { id: shift.staffId, label: shift.person } : null);
  const chosenConflicts = chosen ? conflictsOf(chosen) : [];
  const incomplete = !areaId || !date || !startTime || !endTime || !staffId || (Boolean(shift) && reason.trim().length < 10);
  const missing = [!areaId && 'el área', !date && 'la fecha', !startTime && 'la hora de inicio', !endTime && 'la hora de fin', !staffId && 'la persona', Boolean(shift) && reason.trim().length < 10 && 'el motivo del cambio (10 caracteres)'].filter(Boolean).join(', ');
  const load = chosen ? loadFor(chosen.id, startMs, endMs, shifts, shift?.id) : null;
  const overLoad = Boolean(load && (load.hours7Days > LOAD.maxHours7Days || load.daysInRow > LOAD.maxDaysInRow));
  const emergencyMissing = askEmergency && emergency.trim().length < 10;
  const blocked = incomplete || Boolean(durationIssue) || chosenConflicts.length > 0 || emergencyMissing;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (blocked) return;
    // Cancelar se hace con su propio diálogo (PATCH con state=cancelado, que no mueve el turno).
    const body: ShiftInput & { version?: number; reason?: string; emergencyReason?: string } = {
      staffId, areaId, start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), type: chosenKind, ...(note.trim() ? { justification: note.trim() } : {}),
      ...(emergency.trim() ? { emergencyReason: emergency.trim() } : {}),
      ...(shift ? { version: shift.version, reason: reason.trim() } : {}),
    };
    const saved = await action.run<{ id?: string }>(shift ? `/turnos/${shift.id}` : '/turnos', body, shift ? 'PATCH' : 'POST');
    if (saved) onSaved(saved.id ?? shift?.id);
  }

  return <Dialog title={shift ? 'Editar turno' : 'Asignar turno'} onClose={onClose} busy={action.busy}>
    <form className="module-form shift-form" onSubmit={save}>
      <WriteError error={action.error} />
      <fieldset className="shift-step">
        <legend><span className="shift-step-number">1</span>Área del turno</legend>
        <SearchPicker label="Área" value={areaValue} items={areaItems} required placeholder="Escribe: Emergencia, Consulta, Laboratorio…"
          onChange={item => { setAreaId(item?.id ?? ''); if (item && staffId && !eligibleFor(catalog.staff, catalog.areas, item.id, 'todos', others).some(p => p.id === staffId)) setStaffId(''); }} />
        {areaId && <p className="shift-summary"><AreaChip name={areaValue?.label} type={catalog.areas.find(a => a.id === areaId)?.type} /></p>}
      </fieldset>

      <fieldset className="shift-step">
        <legend><span className="shift-step-number">2</span>Fecha y horario</legend>
        <div className="form-grid">
          <Field label="Fecha de inicio" type="date" value={date} onChange={setDate} required />
          <Field label="Hora de inicio" type="time" value={startTime} onChange={setStartTime} required />
          <Field label="Hora de fin" type="time" value={endTime} onChange={setEndTime} required hint={nextDay ? 'Termina el día siguiente.' : undefined} />
        </div>
        <div className="shift-presets">
          <button type="button" className="shift-pill" aria-pressed={isGuard24} onClick={guard24}>Guardia 24 h</button>
          <span className="form-hint">Misma hora de inicio y fin; después pide 12 h de descanso.</span>
        </div>
        <div className="shift-kind" role="radiogroup" aria-label="Tipo de turno">

          {KINDS.map(k => <label key={k} className={`shift-kind-option${chosenKind === k ? ' is-selected' : ''}`}>
            <input type="radio" name="shift-kind" value={k} checked={chosenKind === k} onChange={() => { setKind(k); setKindTouched(true); }} />{KIND_LABEL[k]}
          </label>)}
        </div>
        {Number.isFinite(startMs) && Number.isFinite(endMs) && <p className={`shift-duration${durationIssue ? ' is-error' : ''}`} role={durationIssue ? 'alert' : 'status'}>
          Duración: <strong>{Math.round(hoursBetween(startMs, endMs) * 10) / 10} h</strong> · {durationIssue ?? `permitido de ${DURATION.min} a ${chosenKind === 'diurno' ? DURATION.max : DURATION.maxLong} h`}
        </p>}
      </fieldset>

      <fieldset className="shift-step">
        <legend><span className="shift-step-number">3</span>Personal</legend>
        <div className="shift-role-filter" role="group" aria-label="Filtrar personal por rol">
          <button type="button" className="shift-pill" aria-pressed={role === 'todos'} onClick={() => setRole('todos')}>Todos</button>
          {roleOptions.map(r => <button key={r.code} type="button" className="shift-pill" aria-pressed={role === r.code} onClick={() => { setRole(r.code); if (chosen && chosen.type !== r.code) setStaffId(''); }}><RoleChip code={r.code} label={r.name} /></button>)}
        </div>
        <SearchPicker label="Persona" value={staffValue} items={staffItems} required
          hint={areaId ? `${pool.length} ${pool.length === 1 ? 'persona elegible' : 'personas elegibles'}${others ? '' : ' para esta área'}.` : 'Elige primero el área del turno.'}
          disabled={!areaId} placeholder="Escribe un nombre" emptyText="Nadie coincide. Prueba con otro rol o incluye personal de otras áreas."
          onChange={item => setStaffId(item?.id ?? '')} />
        <label className="check-field"><input type="checkbox" checked={others} onChange={event => setOthers(event.target.checked)} />Incluir personal de otras áreas (cobertura)</label>
        {chosen && <p className="shift-summary"><RoleChip code={chosen.type} />{chosen.area && <AreaChip name={chosen.area} />}{chosen.specialty && <span className="shift-specialty">{chosen.specialty}</span>}</p>}
        {chosenConflicts.length > 0 && <Notice kind="error">{chosenConflicts.map(c => c.text).join('. ')}. Elige otra persona u otro horario.</Notice>}
        {chosen && chosenConflicts.length === 0 && Number.isFinite(endMs) && <Notice kind="success">Sin conflictos de traslape ni descanso con los turnos cargados.</Notice>}
        {load && Number.isFinite(endMs) && <p className={`shift-load${overLoad ? ' is-error' : ''}`} role="status">
          Carga con este turno: <strong>{load.hours7Days} h</strong> de {LOAD.maxHours7Days} h en 7 días · <strong>{load.daysInRow}</strong> {load.daysInRow === 1 ? 'día seguido' : 'días seguidos'} de {LOAD.maxDaysInRow}
          {overLoad && '. Supera el tope: solo se asigna en una emergencia, con su motivo.'}
        </p>}
        <Field label="Observación · opcional" value={note} onChange={setNote} maxLength={500} hint="Si la persona supera las 44 h diurnas semanales, escribe aquí una justificación de al menos 10 caracteres." />
      </fieldset>

      {(askEmergency || overLoad) && <fieldset className="shift-step">
        <legend>Excepción por emergencia</legend>
        <Field label="Motivo de la emergencia" value={emergency} onChange={setEmergency} minLength={10} maxLength={500} required={askEmergency}
          hint="Queda en el turno y en la auditoría. Úsalo solo si no hay otra persona disponible." />
      </fieldset>}

      {shift && <fieldset className="shift-step">
        <legend>Cambio de un turno existente</legend>
        <Field label="Motivo del cambio" value={reason} onChange={setReason} minLength={10} maxLength={500} required />
      </fieldset>}

      {(missing || emergencyMissing) && <p className="form-hint" role="status">Para guardar falta indicar {[missing, emergencyMissing && 'el motivo de la emergencia (10 caracteres)'].filter(Boolean).join(', ')}.</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button>
        <SaveButton busy={action.busy} label={shift ? 'Guardar turno' : 'Asignar turno'} disabled={blocked} />
      </div>
    </form>
  </Dialog>;
}
