import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AreaChip, RoleChip, roleIdentity } from '../../components/identity';
import { ExportMenu } from '../../components/export-menu';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { Icon, Notice } from '../../components/ui';
import { can, type AccessProfile, type Api, type Shift } from '../../lib/api';
import { exportName, type ExportTable } from '../../lib/export';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Tag, WriteError, formatDateTime, isVersionConflict, useAction, useData } from '../common';
import { useQuickAction } from '../personal/accion';
import { Field } from '../../components/ui';
import { ShiftForm, type ShiftDraft } from './ShiftForm';
import { CrewCoverageAlert } from './CrewCoverageAlert';
import { AreaCoverageAlert } from './AreaCoverageAlert';
import { AttendanceDialog } from './AttendanceDialog';
import { SpecialistsWeek } from './SpecialistsWeek';
import { KIND_LABEL, attendanceLabel, can as allows, type CatalogArea, type CatalogRole, type CatalogStaff, type ShiftCatalog, type ShiftRow } from './rules';
import './shifts.css';

type Sort = 'recientes' | 'antiguos' | 'persona';
const PAGE = 25;
const STATES: [string, string][] = [['borrador', 'Borradores'], ['pendiente', 'Pendientes de iniciar'], ['en_curso', 'En curso'], ['sin_confirmar', 'Sin entrada marcada'], ['completado', 'Completados'], ['ausente', 'Ausencias'], ['cancelado', 'Cancelados']];
const ATTENDANCE_ACTIONS = ['marcar_presente', 'marcar_ausente', 'deshacer_asistencia'] as const;
const EMPTY_CATALOG: ShiftCatalog = { roles: [], areas: [], staff: [] };

/** Si el catálogo no se puede leer, las opciones se arman con los turnos cargados: peor que el catálogo, pero la pantalla sigue útil. */
function fallbackCatalog(rows: ShiftRow[]): ShiftCatalog {
  const roles = new Map<string, CatalogRole>(), areas = new Map<string, CatalogArea>(), staff = new Map<string, CatalogStaff>();
  for (const t of rows) {
    if (t.staffType) roles.set(t.staffType, { code: t.staffType, name: roleIdentity(t.staffType).label });
    areas.set(t.areaId, { id: t.areaId, parentId: null, type: 'area', code: '', name: t.area });
    staff.set(t.staffId, { id: t.staffId, name: t.person, type: t.staffType ?? 'otro', specialty: null, areaId: null, area: null, registrations: [] });
  }
  return { roles: [...roles.values()], areas: [...areas.values()], staff: [...staff.values()] };
}

export function ShiftsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<ShiftRow[]>(api, '/turnos', version);
  const remote = useData<ShiftCatalog>(api, '/turnos/catalogo', version);
  const plan = can(profile, 'turnos.planificar');
  const all = data.data ?? [];
  const catalog = remote.data ?? (remote.error ? fallbackCatalog(all) : EMPTY_CATALOG);

  const [open, setOpen] = useState(false), [editing, setEditing] = useState<Shift | null>(null), [cancelling, setCancelling] = useState<Shift | null>(null);
  const [marking, setMarking] = useState<ShiftRow | null>(null), [draft, setDraft] = useState<ShiftDraft | undefined>(undefined), [view, setView] = useState<'plan' | 'especialistas'>('plan');
  const [person, setPerson] = useState<PickerItem | null>(null), [role, setRole] = useState('todos'), [area, setArea] = useState('todos'), [state, setState] = useState('todos');
  const [sort, setSort] = useState<Sort>('recientes'), [panel, setPanel] = useState(false), [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(() => new Date());
  const [quick, consumeQuick] = useQuickAction();
  // Reloj local para pasar de "pendiente" a "en curso" sin pedir datos; no consulta la red.
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!quick) return; if (quick === 'planificar' && plan) { setEditing(null); setOpen(true); } consumeQuick(); }, [quick, plan, consumeQuick]);
  useEffect(() => setShown(PAGE), [person, role, area, state, sort]);

  const staffById = useMemo(() => new Map(catalog.staff.map(p => [p.id, p])), [catalog.staff]);
  const typeOf = (t: ShiftRow) => t.staffType ?? staffById.get(t.staffId)?.type;
  const effective = (t: ShiftRow) => {
    if (t.state !== 'publicado') return t.state;
    const start = Date.parse(t.start), end = Date.parse(t.end), at = now.valueOf();
    return at < start ? 'pendiente' : at < end ? 'en_curso' : 'completado';
  };
  const personItems = useMemo<PickerItem[]>(() => catalog.staff.map(p => ({ id: p.id, label: p.name, detail: [roleIdentity(p.type).label, p.area].filter(Boolean).join(' · ') })), [catalog.staff]);

  const rows = useMemo(() => {
    const out = all.filter(t => (!person || t.staffId === person.id) && (role === 'todos' || typeOf(t) === role) && (area === 'todos' || t.areaId === area) && (state === 'todos' || effective(t) === state || (state === 'sin_confirmar' && t.attendance === 'sin_confirmar')));
    const by = { recientes: (a: Shift, b: Shift) => Date.parse(b.start) - Date.parse(a.start), antiguos: (a: Shift, b: Shift) => Date.parse(a.start) - Date.parse(b.start), persona: (a: Shift, b: Shift) => a.person.localeCompare(b.person, 'es') || Date.parse(a.start) - Date.parse(b.start) }[sort];
    return [...out].sort(by);
  }, [all, person, role, area, state, sort, staffById, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const active: { key: string; label: string; clear: () => void }[] = [
    ...(person ? [{ key: 'persona', label: `Persona: ${person.label}`, clear: () => setPerson(null) }] : []),
    ...(role !== 'todos' ? [{ key: 'rol', label: `Rol: ${catalog.roles.find(r => r.code === role)?.name ?? roleIdentity(role).label}`, clear: () => setRole('todos') }] : []),
    ...(area !== 'todos' ? [{ key: 'area', label: `Área: ${catalog.areas.find(a => a.id === area)?.name ?? 'Área'}`, clear: () => setArea('todos') }] : []),
    ...(state !== 'todos' ? [{ key: 'estado', label: `Estado: ${STATES.find(s => s[0] === state)?.[1] ?? state}`, clear: () => setState('todos') }] : []),
  ];
  const clearAll = () => { setPerson(null); setRole('todos'); setArea('todos'); setState('todos'); };

  const table = (): ExportTable => ({
    filename: exportName('turnos'), title: 'Turnos del personal', subtitle: active.length ? active.map(a => a.label).join(' · ') : 'Todos los turnos',
    columns: ['Persona', 'Rol', 'Área', 'Inicio', 'Fin', 'Tipo', 'Estado', 'Asistencia'],
    rows: rows.map(t => [t.person, roleIdentity(typeOf(t)).label, t.area, formatDateTime(t.start), formatDateTime(t.end), KIND_LABEL[t.type] ?? t.type, STATES.find(s => s[0] === effective(t))?.[1] ?? effective(t), attendanceLabel(t) ?? '']),
  });

  const jornada = new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/El_Salvador' }).format(now);
  const toggle = (current: string, value: string, set: (v: string) => void) => set(current === value ? 'todos' : value);
  // ASIS-01: turnos en curso sin entrada marcada después del margen; la API avisa a JOP en vivo.
  const unconfirmed = all.filter(t => t.attendance === 'sin_confirmar' && t.state === 'en_curso');
  const assignSubstitute = (shift: ShiftRow, staffId: string) => { setMarking(null); setEditing(null); setDraft({ areaId: shift.areaId, start: new Date(Math.max(Date.now() + 5 * 60_000, Date.parse(shift.start))).toISOString(), end: shift.end, type: shift.type, staffId }); setOpen(true); data.refresh(); };

  return <>
    <Heading eyebrow="Operaciones / Jornada" title="Turnos" description="La jornada se abre automáticamente a las 00:00. Asigna horarios según el área, el rol y la disponibilidad real del personal."
      actions={<>
        <ExportMenu table={table} disabled={!rows.length} />
        {plan && view === 'plan' && <button className="primary-button" onClick={() => { setEditing(null); setDraft(undefined); setOpen(true); }}><Icon name="plus" size={18} />Asignar turno</button>}
      </>} />
    <div className="shift-views" role="group" aria-label="Vista">
      <button type="button" className="shift-pill" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>Planificación</button>
      <button type="button" className="shift-pill" aria-pressed={view === 'especialistas'} onClick={() => setView('especialistas')}>Especialistas de la semana</button>
    </div>
    {view === 'especialistas' ? <SpecialistsWeek api={api} version={version} /> : <>
    <div className="planning-window"><strong>Jornada laboral abierta</strong><span>{jornada} · Asignaciones habilitadas durante toda la jornada. El sistema controla traslapes y descansos.</span></div>
    {unconfirmed.length > 0 && <Notice kind="info">{unconfirmed.length === 1 ? 'Un turno en curso no tiene' : `${unconfirmed.length} turnos en curso no tienen`} la entrada marcada. Confirma la asistencia o registra la ausencia para que no cuenten como de turno.{' '}
      <button type="button" className="secondary-button" onClick={() => { setState('sin_confirmar'); setPanel(false); }}>Ver turnos sin entrada</button></Notice>}
    {data.data && remote.data && <CrewCoverageAlert shifts={all} typeOf={typeOf} now={now} onPlan={plan ? () => { setEditing(null); setOpen(true); } : undefined} />}
    <AreaCoverageAlert api={api} version={version} now={now} onPlan={plan ? () => { setEditing(null); setDraft(undefined); setOpen(true); } : undefined} />
    <section className="data-workbench">
      <div className="shift-toolbar">
        <div className="shift-toolbar-row">
          <SearchPicker label="Buscar persona" value={person} onChange={setPerson} items={personItems} placeholder="Escribe un nombre" />
          <button type="button" className="secondary-button" aria-expanded={panel} aria-controls="shift-filters" onClick={() => setPanel(v => !v)}><Icon name="grid" size={18} />Filtros{active.length > 0 && ` (${active.length})`}</button>
          <div className="select-field"><label htmlFor="shift-sort">Ordenar por</label>
            <select id="shift-sort" value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="recientes">Más recientes</option><option value="antiguos">Más antiguos</option><option value="persona">Persona (A–Z)</option></select></div>
        </div>
        {panel && <div id="shift-filters" className="shift-filter-panel">
          <fieldset className="shift-filter-group"><legend>Rol del personal</legend><div className="shift-pills">
            {catalog.roles.map(r => <button key={r.code} type="button" className="shift-pill" aria-pressed={role === r.code} onClick={() => toggle(role, r.code, setRole)}><RoleChip code={r.code} label={r.name} /></button>)}
          </div></fieldset>
          <fieldset className="shift-filter-group"><legend>Área de trabajo</legend><div className="shift-pills">
            {catalog.areas.map(a => <button key={a.id} type="button" className="shift-pill" aria-pressed={area === a.id} onClick={() => toggle(area, a.id, setArea)}><AreaChip name={a.name} type={a.type} /></button>)}
          </div></fieldset>
          <fieldset className="shift-filter-group"><legend>Estado del turno</legend><div className="shift-pills">
            {STATES.map(([code, name]) => <button key={code} type="button" className="shift-pill" aria-pressed={state === code} onClick={() => toggle(state, code, setState)}>{name}</button>)}
          </div></fieldset>
        </div>}
        {active.length > 0 && <div className="shift-active" aria-label="Filtros activos">
          {active.map(a => <button key={a.key} type="button" className="shift-active-chip" aria-label={`Quitar filtro ${a.label}`} onClick={a.clear}>{a.label}<Icon name="close" size={14} /></button>)}
          <button type="button" className="secondary-button" onClick={clearAll}>Quitar filtros</button>
        </div>}
        <p className="shift-count" role="status">{rows.length} de {all.length} turnos</p>
      </div>
      <RemoteState state={data}>{() => rows.length ? <>
        <table className="record-table"><caption className="sr-only">Planificación de turnos</caption>
          <thead><tr><th>Persona</th><th>Inicio</th><th>Fin</th><th>Tipo</th><th>Estado</th><th>Asistencia</th>{plan && <th>Acción</th>}</tr></thead>
          <tbody>{rows.slice(0, shown).map(t => {
            const st = effective(t);
            return <tr key={t.id}>
              <td data-label="Persona y área"><div className="shift-who"><strong>{t.person}</strong><span className="shift-chips"><RoleChip code={typeOf(t)} /><AreaChip name={t.area} /></span></div></td>
              <td data-label="Inicio">{formatDateTime(t.start)}</td><td data-label="Fin">{formatDateTime(t.end)}</td>
              <td data-label="Tipo">{KIND_LABEL[t.type] ?? t.type}</td><td data-label="Estado"><Tag value={st} label={st === 'ausente' ? 'Ausente' : undefined} /></td>
              <td data-label="Asistencia">{attendanceLabel(t) ?? '—'}</td>
              {plan && <td data-label="Acción">
                {allows(t, 'editar') && <button className="row-action" onClick={() => { setEditing(t); setDraft(undefined); setOpen(true); }}>Editar <Icon name="arrow" size={16} /></button>}
                {allows(t, 'cancelar') && <button className="row-action" aria-label={`Cancelar turno de ${t.person}`} onClick={() => setCancelling(t)}>Cancelar turno</button>}
                {ATTENDANCE_ACTIONS.some(a => allows(t, a)) && <button className="row-action" aria-label={`Asistencia de ${t.person}`} onClick={() => setMarking(t)}>Asistencia</button>}
              </td>}
            </tr>;
          })}</tbody></table>
        {rows.length > shown && <button type="button" className="secondary-button shift-more" onClick={() => setShown(n => n + PAGE)}>Mostrar más ({rows.length - shown} restantes)</button>}
      </> : <Empty title="Sin turnos en esta vista" description="Ajusta los filtros o la búsqueda para consultar otros horarios." />}</RemoteState>
    </section>
    </>}
    {open && <ShiftForm api={api} shift={editing} draft={editing ? undefined : draft} catalog={catalog} shifts={all} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); data.refresh(); }} />}
    {marking && <AttendanceDialog api={api} shift={marking} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); data.refresh(); }} onAssignSubstitute={plan ? id => assignSubstitute(marking, id) : undefined} />}
    {cancelling && <CancelShiftForm api={api} shift={cancelling} onClose={() => { setCancelling(null); data.refresh(); }} onSaved={() => { setCancelling(null); data.refresh(); }} />}
  </>;
}

type CancelResult = { id: string; version: number; huecos?: { area: string; role: string; start: string; end: string }[] };
/**
 * Cancela con `PATCH /turnos/{id}` y `state:'cancelado'`; la API exige versión y motivo de al menos 10 caracteres.
 * Si el médico tiene citas en ese horario la API responde `turno_con_citas` con la lista (MA-TUR-05); si la cancelación
 * deja huecos de cobertura, se muestran antes de cerrar (RN-15).
 */
function CancelShiftForm({api,shift,onClose,onSaved}:{api:Api;shift:Shift;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),[gaps,setGaps]=useState<CancelResult['huecos']|null>(null),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<10){setProblem('Indica el motivo de la cancelación, de al menos 10 caracteres.');return;}setProblem('');const body={staffId:shift.staffId,areaId:shift.areaId,start:shift.start,end:shift.end,type:shift.type,state:'cancelado',version:shift.version,reason:reason.trim()};const saved=await action.run<CancelResult>(`/turnos/${shift.id}`,body,'PATCH');if(!saved)return;if(saved.huecos?.length)setGaps(saved.huecos);else onSaved();}
 const appointments=action.error?.code==='turno_con_citas'?((action.error.details?.citas as {id:string;start:string}[]|undefined)??[]):[];
 if(gaps)return <Dialog title="Turno cancelado" onClose={onSaved}><div className="module-form"><Notice kind="info">El turno quedó cancelado y deja huecos de cobertura. Asigna a otra persona para cubrirlos.</Notice><ul className="attendance-followup">{gaps.slice(0,6).map((g,i)=><li key={i}>{g.area} · {roleIdentity(g.role).label}: {formatDateTime(g.start)} a {formatDateTime(g.end)}</li>)}</ul><div className="dialog-actions"><button type="button" className="primary-button" onClick={onSaved}>Listo</button></div></div></Dialog>;
 return <Dialog title="Cancelar turno" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{isVersionConflict(action.error)?<><Notice kind="error">El turno cambió. Cierra y vuelve a abrirlo para ver su estado actual; la cancelación no se guardó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:appointments.length?<Notice kind="error">El médico tiene {appointments.length===1?'una cita':`${appointments.length} citas`} en este turno ({appointments.map(c=>formatDateTime(c.start)).join(', ')}). Pide a Recepción que las reprograme o cancele desde Citas, con aviso al paciente, y vuelve a intentar.</Notice>:<WriteError error={action.error}/>}<p>Se cancelará el turno de <strong>{shift.person}</strong> en {shift.area}, del {formatDateTime(shift.start)} al {formatDateTime(shift.end)}. El registro se conserva con tu motivo.</p><Field label="Motivo de la cancelación" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus error={problem||undefined}/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Cancelar turno"/></div></form></Dialog>;
}
