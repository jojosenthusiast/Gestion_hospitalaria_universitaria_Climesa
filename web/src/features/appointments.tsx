import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { ExportMenu } from '../components/export-menu';
import { ActionButton, StatusBadge, statusNames } from '../components/system';
import { Segmented } from '../components/segmented';
import { formatDate, formatDayHeading, formatRelative, plural } from '../lib/format';
import { isPendingCategoryRequest } from './listas/requests';
import { ChipGroup, LiveSearch, matches } from './listas/chips';
import { addDays, dayKey, groupAgenda, minutesBetween, shownState, timeRange, weekOf } from './listas/schedule';
import './listas/lists.css';
import { SearchPicker, type PickerItem, type PickerPage } from '../components/search-picker';
import { useQuickAction } from './personal/accion';
import { can, type AccessProfile, type Api, type Appointment as BaseAppointment } from '../lib/api';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData, type Remote } from './common';
import './appointments.css';

/** CITA-04: actions the server accepts now for the reader, and the blocked ones with their reason (contract `AccionCita`). */
export type AppointmentAction = 'confirmar' | 'rechazar' | 'cancelar' | 'reprogramar' | 'no_asistio' | 'aceptar_reprogramacion' | 'rechazar_reprogramacion' | 'iniciar_consulta';
type Reschedule = { id: string; start: string; end: string; state: string; origin: string; reason?: string | null; rejectionReason?: string | null; version: number };
type Appointment = BaseAppointment & { allowedActions?: AppointmentAction[]; blockedActions?: { action: AppointmentAction; reason: string }[]; cancelableUntil?: string | null; reschedule?: Reschedule | null; rescheduledFromId?: string | null; rescheduledToId?: string | null };
const ACTION_LABEL: Record<AppointmentAction, string> = { confirmar: 'Confirmar', rechazar: 'Rechazar', cancelar: 'Cancelar', reprogramar: 'Reprogramar', no_asistio: 'No asistió', aceptar_reprogramacion: 'Aceptar nuevo horario', rechazar_reprogramacion: 'Rechazar nuevo horario', iniciar_consulta: 'Iniciar consulta' };
const ROW_ACTIONS: AppointmentAction[] = ['confirmar', 'rechazar', 'aceptar_reprogramacion', 'rechazar_reprogramacion', 'reprogramar', 'cancelar', 'no_asistio'];
type Dialogued = 'rechazar' | 'cancelar' | 'reprogramar' | 'rechazar_reprogramacion';
const localIso = (value: string) => new Date(`${value}-06:00`).toISOString();
// La fecha inicial es hoy en El Salvador: abrir en mañana dejaba la cita "de hoy" para el día siguiente.
const localInput = (date = new Date()) => {
  const local = new Date(date.valueOf() - 6 * 3_600_000);
  return local.toISOString().slice(0, 16);
};
type SlotState = 'libre' | 'ocupado' | 'sin_turno' | 'pasado';
type Slot = { start: string; end: string; estado: SlotState; motivo: string | null };
type Availability = { durationMinutes: number; workPeriods: { start: string; end: string }[]; slots: { start: string; end: string }[]; franjas: Slot[] };
type CatalogDoctor = { id: string; givenNames: string; surnames: string; specialty?: string | null; area?: string | null; active: boolean; tieneTurno?: boolean | null; motivo?: string | null };
type PickerPatient = { items: { id: string; record: string; fullName: string; age?: number | null }[]; hasMore: boolean };
const timeOnly = (value: string) => new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/El_Salvador' }).format(new Date(value));

type Range = 'todas' | 'hoy' | 'semana' | 'dia';
const todayKey = () => dayKey(new Date().toISOString());
type StateFilter = 'proximas' | 'vencida' | 'atendida' | 'todas' | 'solicitada' | 'no_asistio' | 'reprogramada' | 'cancelada' | 'rechazada';
/** R4a: four visible states; the rest in «Más». «Próximas» are live appointments whose time has not passed yet. */
const VISIBLE_STATES: [StateFilter, string][] = [['proximas', 'Próximas'], ['vencida', 'Vencidas'], ['atendida', 'Atendidas'], ['todas', 'Todas']];
const MORE_STATES: [StateFilter, string][] = [['solicitada', 'Solicitadas'], ['no_asistio', 'No asistió'], ['reprogramada', 'Reprogramadas'], ['cancelada', 'Canceladas'], ['rechazada', 'Rechazadas']];
const STATE_FILTERS = [...VISIBLE_STATES, ...MORE_STATES];
const RANGES: [Range, string][] = [['todas', 'Todas las fechas'], ['hoy', 'Hoy'], ['semana', 'Semana'], ['dia', 'Un día']];
const isLive = (state: string) => state === 'solicitada' || state === 'confirmada';
const inState = (a: { state: string; end: string }, filter: StateFilter, now: number) => {
  const shown = shownState(a, now);
  return filter === 'todas' || (filter === 'proximas' ? isLive(shown) : shown === filter);
};

export function AppointmentsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Appointment[]>(api, '/citas', version);
  const [create, setCreate] = useState(false);
  // Acción rápida del tablero: #/citas?accion=agendar abre el formulario.
  const [quick, consumeQuick] = useQuickAction(), canSchedule = can(profile, 'citas.agendar'), canRequest = can(profile, 'citas.solicitar');
  // Fase 2, flujo A: el paciente pide por motivo (#/citas?accion=solicitar desde su inicio).
  const [asking, setAsking] = useState(false), [sent, setSent] = useState(false);
  useEffect(() => { if (quick === 'agendar' && canSchedule) setCreate(true); if (quick === 'solicitar' && canRequest) setAsking(true); if (quick) consumeQuick(); }, [quick, canSchedule, canRequest, consumeQuick]);
  const requests = useData<CategoryRequest[]>(api, '/citas/solicitudes-categoria', version, canSchedule || canRequest);
  const [selected, setSelected] = useState<{ appointment: Appointment; action: Dialogued } | null>(null);
  const direct = useAction(api);
  /** One-click actions (CITA-06): confirm, no-show and accepting a reschedule need no form. */
  async function runDirect(row: Appointment, name: AppointmentAction) {
    const path = name === 'confirmar' ? `/citas/solicitudes/${row.id}/confirmar` : name === 'no_asistio' ? `/citas/${row.id}/no-asistio` : `/citas/reprogramaciones/${row.reschedule!.id}/aceptar`;
    const body = name === 'aceptar_reprogramacion' ? { version: row.reschedule!.version } : { version: row.version };
    if (await direct.run(path, body)) data.refresh();
  }
  const [query, setQuery] = useState(''), [state, setState] = useState<StateFilter>('proximas'), [range, setRange] = useState<Range>('todas'), [day, setDay] = useState(todayKey()), [doctor, setDoctor] = useState<PickerItem | null>(null);
  const reload = () => { setCreate(false); setSelected(null); data.refresh(); };
  const all = data.data ?? [];
  const now = Date.now();
  const window = range === 'hoy' ? { from: todayKey(), to: todayKey() } : range === 'semana' ? weekOf(day) : range === 'dia' ? { from: day, to: day } : null;
  const rows = all.filter(a => inState(a, state, now) && (!doctor || a.doctorId === doctor.id)
    && (!window || (dayKey(a.start) >= window.from && dayKey(a.start) <= window.to)) && matches(query, a.patientName, a.doctorName, a.reason));
  const doctorItems: PickerItem[] = [...new Map(all.map(a => [a.doctorId, a.doctorName])).entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const stateName = (value: string) => STATE_FILTERS.find(([key]) => key === value)?.[1] ?? statusNames[value] ?? 'Otro estado';
  // S8: «Solicitadas» counts what waits on Recepción, the same number as the requests tray (asked + by category).
  const pendingRequests = (requests.data ?? []).filter(isPendingCategoryRequest);
  const countOf = (filter: StateFilter) => all.filter(a => inState(a, filter, now)).length + (filter === 'solicitada' && canSchedule ? pendingRequests.length : 0);
  const filtered = state !== 'proximas' || range !== 'todas' || !!doctor || !!query.trim();
  const clear = () => { setState('proximas'); setRange('todas'); setDoctor(null); setQuery(''); };
  // Today and what comes next first; past days fold at the bottom (W-REC-14).
  const agenda = groupAgenda(rows), today = todayKey();
  const ahead = agenda.filter(g => g.day >= today), past = agenda.filter(g => g.day < today).reverse();
  const exportTable = () => ({ filename: 'citas', title: 'Citas', subtitle: plural(rows.length, 'cita', 'citas'), columns: ['Fecha', 'Horario', 'Paciente', 'Médico', 'Estado', 'Motivo'], rows: rows.map(a => [formatDate(a.start), timeRange(a.start, a.end), a.patientName, a.doctorName, stateName(shownState(a, now)), a.reason ?? '']) });
  const dayGroup = (group: typeof agenda[number]) => <section className="ag-day" key={group.day} aria-label={formatDayHeading(group.day)}><h3>{formatDayHeading(group.day)}{group.day === today && <small> · hoy</small>}</h3>
    {group.doctors.map(d => <div className="ag-doctor" key={d.doctorId}><header><strong><Icon name="steth" size={16} /> {d.doctorName}</strong><small>{plural(d.items.length, 'cita', 'citas')}</small></header>
      {d.items.map(row => { const shown = shownState(row, now); return <div className={`ag-slot${shown !== row.state ? ' is-overdue' : ''}`} key={row.id}>
        <span className="ag-time">{timeRange(row.start, row.end)}<small>{minutesBetween(row.start, row.end)} min</small></span>
        <span className="ag-who"><strong>{row.patientName}</strong>{row.reason && <small>{row.reason}</small>}</span>
        <StatusBadge value={shown} />
        <AppointmentRowActions row={row} busy={direct.busy} onDirect={name => void runDirect(row, name)} onDialog={name => setSelected({ appointment: row, action: name })} /></div>; })}</div>)}</section>;
  return <>
    <CompactHeader breadcrumb="Atención / Agenda" title="Citas" actions={<>
      {canSchedule && <button className="primary-button" onClick={() => setCreate(true)}><Icon name="plus" size={18}/>Agendar cita</button>}
      {canRequest && <button className={canSchedule ? 'secondary-button' : 'primary-button'} onClick={() => setAsking(true)}><Icon name="plus" size={18}/>Pedir una cita</button>}</>}/>
    {canSchedule && <RequestInbox api={api} version={version} requests={requests} asked={all.filter(a => a.state === 'solicitada')} busy={direct.busy} onDirect={(row, name) => void runDirect(row, name)} onDialog={(row, name) => setSelected({ appointment: row, action: name })} onAssigned={data.refresh} />}
    {canRequest && <MyRequests api={api} requests={requests} sent={sent} />}
    <section className="data-workbench" aria-label="Agenda de citas">
      <RemoteState state={data}>{() => <>
        <div className="cl-toolbar ag-toolbar">
          <LiveSearch label="Buscar citas" placeholder="Paciente, médico o motivo" value={query} onChange={setQuery} />
          <Segmented label="Estado de la cita" value={state} onChange={setState}
            options={VISIBLE_STATES.map(([value, label]) => ({ value, label, count: countOf(value) }))}
            more={MORE_STATES.map(([value, label]) => ({ value, label, count: countOf(value) }))} />
          <label className="ag-range"><span className="sr-only">Fechas</span><select value={range} onChange={event => setRange(event.target.value as Range)}>{RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {(range === 'dia' || range === 'semana') && <span className="cl-day-nav"><button type="button" className="row-action" aria-label={range === 'semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => setDay(addDays(day, range === 'semana' ? -7 : -1))}>‹</button><label><span className="sr-only">Fecha de referencia</span><input type="date" value={day} onChange={event => event.target.value && setDay(event.target.value)} /></label><button type="button" className="row-action" aria-label={range === 'semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => setDay(addDays(day, range === 'semana' ? 7 : 1))}>›</button></span>}
          <div className="cl-doctor-filter"><SearchPicker label="Médico" value={doctor} onChange={setDoctor} items={doctorItems} minChars={0} placeholder="Todos los médicos" emptyText="Ningún médico con citas coincide." /></div>
          <span className="ag-toolbar-end">{filtered && <button type="button" className="cl-link-button" onClick={clear}>Quitar filtros</button>}<ExportMenu table={exportTable} disabled={!rows.length} /></span>
        </div>
        <WriteError error={direct.error} onReload={data.refresh} reloadLabel="Recargar las citas" />
        {rows.length ? <>
          {ahead.map(dayGroup)}
          {past.length > 0 && (ahead.length ? <details className="ag-past"><summary>Días anteriores · {plural(past.reduce((n, g) => n + g.doctors.reduce((m, d) => m + d.items.length, 0), 0), 'cita', 'citas')}</summary>{past.map(dayGroup)}</details> : past.map(dayGroup))}</>
          : <Empty title={all.length ? 'Ninguna cita coincide con los filtros' : 'No hay citas en el rango actual'} description={all.length ? 'Quita algún filtro o cambia el rango.' : 'Las solicitudes o citas agendadas aparecerán aquí.'} />}
      </>}</RemoteState>
    </section>
    {create && <AppointmentForm api={api} version={version} onClose={() => setCreate(false)} onSaved={reload} />}
    {asking && <CategoryRequestForm api={api} version={version} onClose={() => setAsking(false)} onSaved={() => { setAsking(false); setSent(true); requests.refresh(); }} />}
    {selected && (selected.action === 'reprogramar'
      ? <RescheduleDialog api={api} appointment={selected.appointment} onClose={() => setSelected(null)} onSaved={reload} />
      : <ReasonDialog api={api} appointment={selected.appointment} action={selected.action} onClose={() => setSelected(null)} onSaved={reload} />)}
  </>;
}

/** Búsqueda de pacientes para los selectores: sin tildes, paginada y con solo lo necesario (id, expediente, nombre, edad). */
export const patientPicker = (api: Api) => async (query: string, offset: number): Promise<PickerPage> => {
  const page = await api.request<PickerPatient>(`/pacientes/selector?query=${encodeURIComponent(query)}&limit=10&offset=${offset}`);
  return { hasMore: page.hasMore, items: page.items.map(p => ({ id: p.id, label: p.fullName, detail: `Expediente ${p.record}${typeof p.age === 'number' ? ` · ${p.age} años` : ''}` })) };
};
const slotNames: Record<SlotState, string> = { libre: 'Libre', ocupado: 'Ocupado', sin_turno: 'Sin turno', pasado: 'Pasó' };

function AppointmentForm({ api, version, onClose, onSaved }: { api: Api; version: number; onClose: () => void; onSaved: () => void }) {
  const [patient, setPatient] = useState<PickerItem | null>(null), [doctor, setDoctor] = useState<PickerItem | null>(null), [date, setDate] = useState(localInput().slice(0, 10)), [slot, setSlot] = useState(''), [reason, setReason] = useState('');
  const action = useAction(api);
  const doctorId = doctor?.id ?? '';
  // Los médicos (pocos) se piden con el día elegido para saber quién tiene turno; los pacientes se buscan mientras se escribe.
  const catalogs = useData<{ doctors: CatalogDoctor[] }>(api, `/citas/catalogos?date=${encodeURIComponent(date)}`, version);
  const doctorItems: PickerItem[] = (catalogs.data?.doctors ?? []).filter(d => d.active).map(d => ({ id: d.id, label: `${d.givenNames} ${d.surnames}`, detail: [d.specialty ?? 'Medicina general', d.area].filter(Boolean).join(' · '), disabled: d.tieneTurno === false, reason: d.tieneTurno === false ? 'Sin turno' : undefined }));
  const { availability, error: availabilityError, loading: availabilityLoading } = useAvailability(api, doctorId, date);
  useEffect(() => setSlot(''), [doctorId, date]);
  const franjas = availability?.franjas ?? [];
  const selectedSlot = franjas.find(item => item.start === slot && item.estado === 'libre');
  const freeCount = franjas.filter(item => item.estado === 'libre').length;
  const missing = [!patient && 'el paciente', !doctorId && 'el médico', !selectedSlot && 'una franja libre'].filter(Boolean).join(', ');
  async function save(e: FormEvent) { e.preventDefault(); if (!selectedSlot || !patient) return; if (await action.run('/citas', { patientId: patient.id, doctorId, start: selectedSlot.start, end: selectedSlot.end, reason: reason || undefined })) onSaved(); }
  return <Dialog title="Agendar cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">Busca al paciente por nombre, DUI o expediente (sin importar tildes), elige un médico con turno y toca una franja libre de 20 minutos.</p><WriteError error={action.error} onReload={onSaved} />
    <div className="form-grid"><SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." /><Field label="Fecha" type="date" value={date} onChange={value => setDate(value)} required /><SearchPicker label="Médico" value={doctor} onChange={setDoctor} items={doctorItems} required emptyText={catalogs.loading ? 'Cargando médicos…' : 'No hay médicos que coincidan.'} hint="Los médicos sin turno ese día aparecen apagados." /></div>
    <section className="slot-section" aria-label="Horarios del día" aria-busy={availabilityLoading}><span className="eyebrow">Horario</span>
      {!doctorId ? <p className="form-hint">Elige un médico para ver sus horarios del día.</p> : availabilityLoading ? <p className="form-hint" role="status">Consultando horarios…</p> : <>
        {availability?.workPeriods.length ? <p className="form-hint">Jornada publicada: {availability.workPeriods.map(period => `${timeOnly(period.start)}–${timeOnly(period.end)}`).join(' · ')}</p> : <p className="form-hint">Este médico no tiene una jornada publicada para esta fecha: prueba con otro día u otro médico.</p>}
        <SlotGrid franjas={franjas} value={slot} onChange={setSlot} />
        {franjas.length > 0 && <SlotLegend />}
        {franjas.length > 0 && freeCount === 0 && <Notice kind="info">No quedan franjas libres este día. Prueba con otra fecha.</Notice>}</>}
    </section>
    <Field label="Motivo · opcional" value={reason} onChange={setReason} maxLength={500} />
    {availabilityError && <Notice kind="error">{availabilityError}</Notice>}{missing && <p className="form-hint" role="status">Para confirmar falta elegir {missing}.</p>}{selectedSlot && <Notice kind="info">Horario elegido: {timeOnly(selectedSlot.start)}–{timeOnly(selectedSlot.end)}. Si otra persona lo ocupa antes de confirmar, el sistema te pedirá seleccionar otro.</Notice>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} disabled={!selectedSlot || !patient} label="Confirmar cita" /></div></form></Dialog>;
}

const isDialogued = (name: AppointmentAction): name is Dialogued => name === 'rechazar' || name === 'cancelar' || name === 'reprogramar' || name === 'rechazar_reprogramacion';

/** CITA-04, R1: buttons come from the server's `allowedActions`; a blocked action is not drawn and its reason is not body text. */
function AppointmentRowActions({ row, busy, onDirect, onDialog }: { row: Appointment; busy: boolean; onDirect: (name: AppointmentAction) => void; onDialog: (name: Dialogued) => void }) {
  const allowed = row.allowedActions ?? [], blocked = row.blockedActions ?? [];
  const pending = row.reschedule?.state === 'pendiente' ? row.reschedule : null;
  return <div className="row-actions">
    {pending && <small className="form-hint">Pide cambiar a {formatDateTime(pending.start)}{pending.reason ? ` · ${pending.reason}` : ''}</small>}
    {row.reschedule?.state === 'rechazada' && <small className="form-hint">Reprogramación rechazada: {row.reschedule.rejectionReason}</small>}
    {row.state === 'reprogramada' && <small className="form-hint">Se movió a otra franja.</small>}
    {ROW_ACTIONS.map(name => <ActionButton key={name} action={name} allowed={allowed} blocked={blocked} disabled={busy} aria-label={`${ACTION_LABEL[name]} · ${row.patientName}`} onClick={() => isDialogued(name) ? onDialog(name) : onDirect(name)}>{ACTION_LABEL[name]}</ActionButton>)}
  </div>;
}

/** CITA-08: live counter that only warns while characters are missing. */
export function ReasonCounter({ value, min = 10, max = 500 }: { value: string; min?: number; max?: number }) {
  const length = value.trim().length;
  return <p className="form-hint" aria-live="polite">{length < min ? `Faltan ${min - length} caracteres (mínimo ${min}).` : `${length}/${max} ✓`}</p>;
}

function ReasonDialog({ api, appointment, action: kind, onClose, onSaved }: { api: Api; appointment: Appointment; action: 'rechazar' | 'cancelar' | 'rechazar_reprogramacion'; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const action = useAction(api);
  const title = kind === 'cancelar' ? 'Cancelar cita' : kind === 'rechazar' ? 'Rechazar solicitud' : 'Rechazar nuevo horario';
  async function save(e: FormEvent) {
    e.preventDefault();
    const result = kind === 'cancelar' ? await action.run(`/citas/${appointment.id}/cancelar`, { version: appointment.version, reason })
      : kind === 'rechazar' ? await action.run(`/citas/solicitudes/${appointment.id}/rechazar`, { version: appointment.version, rejectionReason: reason })
      : await action.run(`/citas/reprogramaciones/${appointment.reschedule!.id}/rechazar`, { version: appointment.reschedule!.version, rejectionReason: reason });
    if (result) onSaved();
  }
  return <Dialog title={title} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p>Paciente: <strong>{appointment.patientName}</strong><br />Horario: {formatDateTime(appointment.start)}{kind === 'rechazar_reprogramacion' && appointment.reschedule && <><br />Pide: {formatDateTime(appointment.reschedule.start)}</>}</p><WriteError error={action.error} onReload={onSaved} />
    <Field label={kind === 'cancelar' ? 'Motivo de cancelación' : 'Motivo del rechazo'} value={reason} onChange={setReason} minLength={10} maxLength={500} required autoFocus /><ReasonCounter value={reason} />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={reason.trim().length < 10} label={title} /></div></form></Dialog>;
}

/** CITA-02: a free slot of the same doctor; reception applies it, the patient's request waits for a decision. */
function RescheduleDialog({ api, appointment, onClose, onSaved }: { api: Api; appointment: Appointment; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(dayKey(appointment.start)), [slot, setSlot] = useState('');
  const action = useAction(api);
  const { availability, error, loading } = useAvailability(api, appointment.doctorId, date);
  useEffect(() => setSlot(''), [date]);
  const franjas = availability?.franjas ?? [];
  const chosen = franjas.find(item => item.start === slot && item.estado === 'libre');
  async function save(e: FormEvent) { e.preventDefault(); if (!chosen) return; if (await action.run(`/citas/${appointment.id}/reprogramar`, { version: appointment.version, start: chosen.start, end: chosen.end })) onSaved(); }
  return <Dialog title="Reprogramar cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{appointment.patientName}</strong> · {appointment.doctorName}<br />Horario actual: {formatDateTime(appointment.start)}. Elige una franja libre del mismo médico.</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Fecha" type="date" value={date} onChange={value => value && setDate(value)} required />
    <section className="slot-section" aria-label="Horarios del día" aria-busy={loading}>
      {loading ? <p className="form-hint" role="status">Consultando horarios…</p> : <SlotGrid franjas={franjas} value={slot} onChange={setSlot} />}
      {!loading && franjas.length > 0 && !franjas.some(item => item.estado === 'libre') && <Notice kind="info">No quedan franjas libres este día. Prueba con otra fecha.</Notice>}
    </section>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!chosen} label="Reprogramar" /></div></form></Dialog>;
}

/** Franjas de un médico en un día; se vuelve a pedir al cambiar médico o fecha y nunca muestra la respuesta de otra consulta. */
function useAvailability(api: Api, doctorId: string, date: string) {
  const [availability, setAvailability] = useState<Availability | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setAvailability(null); setError(null);
    if (!doctorId || !date) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    api.request<Availability>(`/citas/disponibilidad?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`)
      .then(result => { if (active) setAvailability(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se pudo consultar la disponibilidad.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, doctorId, date]);
  return { availability, error, loading };
}

function SlotGrid({ franjas, value, onChange }: { franjas: Slot[]; value: string; onChange: (start: string) => void }) {
  return <div className="slot-grid" role="group" aria-label="Franjas del día">{franjas.map(item => item.estado === 'libre'
    ? <button type="button" key={item.start} className={`slot slot-libre${item.start === value ? ' is-selected' : ''}`} aria-pressed={item.start === value} onClick={() => onChange(item.start)}><strong>{timeOnly(item.start)}</strong><small>{slotNames.libre}</small></button>
    : <button type="button" key={item.start} className={`slot slot-${item.estado}`} disabled aria-label={`${timeOnly(item.start)}, no disponible: ${item.motivo ?? slotNames[item.estado]}`}><strong>{timeOnly(item.start)}</strong><small>{item.motivo ?? slotNames[item.estado]}</small></button>)}</div>;
}
const SlotLegend = () => <ul className="slot-legend" aria-label="Leyenda"><li><i className="slot-key slot-libre" />Libre</li><li><i className="slot-key slot-ocupado" />Ocupado</li><li><i className="slot-key slot-sin_turno" />Sin turno</li><li><i className="slot-key slot-pasado" />Ya pasó</li></ul>;

// ───────────── Fase 2, flujo A (S8): solicitud de cita por motivo y bandeja de Recepción ─────────────

type Franja = 'manana' | 'tarde' | 'cualquiera';
type CategoryRef = { code: string; name: string; icon: string };
type Category = CategoryRef & { description: string; specialties: string[]; keywords: string };
type RequestAction = 'asignar' | 'rechazar' | 'cancelar';
type CategoryRequest = {
  id: string; patientId: string; patientName: string | null; record: string | null; categories: CategoryRef[]; specialties: string[]; franja: Franja; note: string | null;
  preferredDoctorId: string | null; preferredDoctorName: string | null; state: 'pendiente' | 'asignada' | 'rechazada' | 'cancelada'; rejectionReason: string | null;
  appointment: { id: string; doctorId: string; doctorName: string; start: string; end: string } | null; createdAt: string; version: number;
  allowedActions: RequestAction[]; blockedActions: { action: RequestAction; reason: string }[];
};
const FRANJA_LABEL: Record<Franja, string> = { manana: 'Mañana', tarde: 'Tarde', cualquiera: 'Cualquier hora' };
/** Horas locales (El Salvador, UTC-6) de cada franja preferida: mañana 07-12, tarde 12-17. */
const FRANJA_HOURS: Record<Franja, [number, number]> = { manana: [7, 12], tarde: [12, 17], cualquiera: [0, 24] };
const inFranja = (iso: string, franja: Franja) => { const hour = (new Date(iso).getUTCHours() + 18) % 24; const [from, to] = FRANJA_HOURS[franja]; return hour >= from && hour < to; };
const REQUEST_STATE: Record<CategoryRequest['state'], { value: string; label: string }> = {
  pendiente: { value: 'en_espera', label: 'Por asignar' }, asignada: { value: 'confirmada', label: 'Cita asignada' },
  rechazada: { value: 'rechazada', label: 'Rechazada' }, cancelada: { value: 'cancelada', label: 'Retirada' },
};

/** Ícono de cada motivo (clave estable de la API); mismo trazo que `Icon`. Las claves desconocidas usan el estetoscopio. */
const GLYPHS: Record<string, ReactNode> = {
  nino: <><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" /><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" /></>,
  mujer: <><circle cx="12" cy="9" r="5" /><path d="M12 14v8M9 19h6" /></>,
  corazon: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  hueso: <path d="M17 10c.7-.7 1.7 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .8.7 1.8 0 2.5l-7 7c-.7.7-1.7 0-2.5 0a2.5 2.5 0 0 0 0 5c.3 0 .5.2.5.5a2.5 2.5 0 1 0 5 0c0-.8-.7-1.8 0-2.5z" />,
  piel: <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />,
  ojo: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  oido: <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />,
  mente: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" /></>,
  neuro: <path d="M13 2 4 14h8l-1 8 9-12h-8z" />,
  digestivo: <path d="M4 3v6a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V3M7.5 3v18M20 15V3a5 5 0 0 0-4 5v5c0 1.1.9 2 2 2zm0 0v6" />,
  rinon: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  alergia: <path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H3M9.6 4.6A2 2 0 1 1 11 8H3M12.6 19.4A2 2 0 1 0 14 16H3" />,
  cirugia: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
};
function CategoryGlyph({ icon, size = 20 }: { icon: string; size?: number }) {
  if (!GLYPHS[icon]) return <Icon name="steth" size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{GLYPHS[icon]}</svg>;
}
const CategoryList = ({ categories }: { categories: CategoryRef[] }) => <ul className="rq-cats">{categories.map(c => <li key={c.code}><CategoryGlyph icon={c.icon} size={16} />{c.name}</li>)}</ul>;

/**
 * Bandeja de pendientes de Recepción (R4a, S8): everything that waits on Recepción in one list and one count, the
 * same count as «Solicitadas»: requests by category (assign doctor and time, prefilled) and appointments the patient
 * asked with a doctor and time (confirm or reject, server actions). Oldest first.
 */
function RequestInbox({ api, version, requests, asked, busy, onDirect, onDialog, onAssigned }: { api: Api; version: number; requests: Remote<CategoryRequest[]>; asked: Appointment[]; busy: boolean; onDirect: (row: Appointment, name: AppointmentAction) => void; onDialog: (row: Appointment, name: Dialogued) => void; onAssigned: () => void }) {
  const [open, setOpen] = useState<string | null>(null), [rejecting, setRejecting] = useState<CategoryRequest | null>(null), [done, setDone] = useState<string | null>(null);
  const pending = (requests.data ?? []).filter(isPendingCategoryRequest);
  const total = pending.length + asked.length;
  const finish = (message: string) => { setOpen(null); setRejecting(null); setDone(message); requests.refresh(); onAssigned(); };
  return <section className="rq-inbox" aria-label="Solicitudes por asignar">
    <header className="rq-head"><h2>Solicitudes por asignar</h2>{requests.data && <span className="rq-count" aria-label={`${total} pendientes`}>{total}</span>}</header>
    {done && <Notice kind="success">{done}</Notice>}
    <RemoteState state={requests} skeletonRows={2}>{() => total ? <ol className="rq-list">{pending.map(r => <li key={r.id} className="rq-row">
      <div className="rq-main">
        <p className="rq-who"><strong>{r.patientName ?? 'Paciente'}</strong>{r.record && <code>{r.record}</code>}<small className="muted">{formatRelative(r.createdAt)}</small></p>
        <CategoryList categories={r.categories} />
        {r.note && <p className="rq-note">{r.note}</p>}
        <p className="rq-meta">Prefiere: <strong>{FRANJA_LABEL[r.franja]}</strong>{r.preferredDoctorName && <> · con {r.preferredDoctorName}</>}</p>
      </div>
      <div className="row-actions">
        {r.allowedActions.includes('asignar') && <button type="button" className="row-action rq-primary" aria-expanded={open === r.id} aria-label={`Asignar · ${r.patientName ?? 'Paciente'}`} onClick={() => setOpen(open === r.id ? null : r.id)}>Asignar</button>}
        {r.allowedActions.includes('rechazar') && <button type="button" className="row-action" aria-label={`Rechazar · ${r.patientName ?? 'Paciente'}`} onClick={() => setRejecting(r)}>Rechazar</button>}
      </div>
      {open === r.id && <AssignPanel api={api} version={version} request={r} onCancel={() => setOpen(null)} onSaved={message => finish(message)} />}
    </li>)}
    {asked.map(a => <li key={a.id} className="rq-row">
      <div className="rq-main">
        <p className="rq-who"><strong>{a.patientName}</strong><small className="muted">{formatDate(a.start, { withYear: false })}, {timeOnly(a.start)}</small></p>
        <p className="rq-meta">Con <strong>{a.doctorName}</strong>{a.reason && <> · {a.reason}</>}</p>
      </div>
      <div className="row-actions">
        {(['confirmar', 'rechazar'] as const).map(name => <ActionButton key={name} action={name} allowed={a.allowedActions ?? []} blocked={a.blockedActions ?? []} disabled={busy} className={name === 'confirmar' ? 'row-action rq-primary' : 'row-action'} aria-label={`${ACTION_LABEL[name]} · ${a.patientName}`} onClick={() => name === 'confirmar' ? onDirect(a, name) : onDialog(a, name)}>{ACTION_LABEL[name]}</ActionButton>)}
      </div>
    </li>)}</ol> : <p className="rq-empty" role="status"><Icon name="check" size={18} />Al día: no hay solicitudes por asignar.</p>}</RemoteState>
    {rejecting && <RejectRequestDialog api={api} request={rejecting} onClose={() => setRejecting(null)} onSaved={() => finish('Solicitud rechazada; el paciente verá el motivo.')} />}
  </section>;
}

/** Prellenado: el médico que prefiere el paciente o el primero con turno de las especialidades sugeridas, y la primera franja libre dentro de la franja pedida. */
function AssignPanel({ api, version, request, onCancel, onSaved }: { api: Api; version: number; request: CategoryRequest; onCancel: () => void; onSaved: (message: string) => void }) {
  const [date, setDate] = useState(localInput().slice(0, 10)), [doctor, setDoctor] = useState<PickerItem | null>(null), [touched, setTouched] = useState(false), [slot, setSlot] = useState(''), [wholeDay, setWholeDay] = useState(request.franja === 'cualquiera');
  const action = useAction(api);
  const catalogs = useData<{ doctors: CatalogDoctor[] }>(api, `/citas/catalogos?date=${encodeURIComponent(date)}`, version);
  const suggested = (d: CatalogDoctor) => request.specialties.includes(d.specialty ?? 'Medicina general');
  const doctors = (catalogs.data?.doctors ?? []).filter(d => d.active).sort((a, b) => Number(suggested(b)) - Number(suggested(a)));
  const items: PickerItem[] = doctors.map(d => ({ id: d.id, label: `${d.givenNames} ${d.surnames}`, detail: [suggested(d) ? 'Sugerido' : null, d.specialty ?? 'Medicina general'].filter(Boolean).join(' · '), disabled: d.tieneTurno === false, reason: d.tieneTurno === false ? 'Sin turno' : undefined }));
  useEffect(() => {
    if (touched || !catalogs.data) return;
    const pick = items.find(i => i.id === request.preferredDoctorId && !i.disabled) ?? items.find(i => !i.disabled && doctors.find(d => d.id === i.id && suggested(d))) ?? null;
    setDoctor(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogs.data, touched]);
  const doctorId = doctor?.id ?? '';
  const { availability, error, loading } = useAvailability(api, doctorId, date);
  const franjas = (availability?.franjas ?? []).filter(f => wholeDay || inFranja(f.start, request.franja));
  useEffect(() => { setSlot(franjas.find(f => f.estado === 'libre')?.start ?? ''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, wholeDay]);
  const chosen = franjas.find(f => f.start === slot && f.estado === 'libre');
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!chosen || !doctor) return;
    if (await action.run(`/citas/solicitudes-categoria/${request.id}/asignar`, { version: request.version, doctorId, start: chosen.start, end: chosen.end })) onSaved(`Cita asignada: ${request.patientName ?? 'paciente'} con ${doctor.label}, ${formatDateTime(chosen.start)}.`);
  }
  return <form className="rq-assign" onSubmit={save} aria-label={`Asignar médico y hora a ${request.patientName ?? 'paciente'}`}>
    <WriteError error={action.error} onReload={onCancel} reloadLabel="Cerrar y actualizar la bandeja" />
    <div className="form-grid"><Field label="Fecha" type="date" value={date} onChange={value => value && setDate(value)} required />
      <SearchPicker label="Médico" value={doctor} onChange={item => { setTouched(true); setDoctor(item); }} items={items} minChars={0} required emptyText={catalogs.loading ? 'Cargando médicos…' : 'No hay médicos que coincidan.'} hint={request.specialties.length ? `Sugeridos: ${request.specialties.join(', ')}` : undefined} /></div>
    <section className="slot-section" aria-label="Horarios del día" aria-busy={loading}>
      <p className="form-hint">{wholeDay ? 'Todo el día.' : `Solo la franja que pidió: ${FRANJA_LABEL[request.franja].toLowerCase()}.`} {request.franja !== 'cualquiera' && <button type="button" className="cl-link-button" onClick={() => setWholeDay(!wholeDay)}>{wholeDay ? `Solo ${FRANJA_LABEL[request.franja].toLowerCase()}` : 'Ver todo el día'}</button>}</p>
      {!doctorId ? <p className="form-hint">Elige un médico para ver sus horarios.</p> : loading ? <p className="form-hint" role="status">Consultando horarios…</p> : <SlotGrid franjas={franjas} value={slot} onChange={setSlot} />}
      {!loading && doctorId && availability && !franjas.some(f => f.estado === 'libre') && <Notice kind="info">No quedan franjas libres {wholeDay ? 'este día' : 'en esa franja'}. Prueba otra fecha, otro médico o todo el día.</Notice>}
    </section>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={action.busy}>Cerrar</button><SaveButton busy={action.busy} disabled={!chosen || !doctor} label="Confirmar cita" /></div>
  </form>;
}

function RejectRequestDialog({ api, request, onClose, onSaved }: { api: Api; request: CategoryRequest; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run(`/citas/solicitudes-categoria/${request.id}/rechazar`, { version: request.version, rejectionReason: reason.trim() })) onSaved(); }
  return <Dialog title="Rechazar solicitud" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p>Paciente: <strong>{request.patientName}</strong><br />Motivo: {request.categories.map(c => c.name).join(', ')}{request.note && <><br />Nota: {request.note}</>}</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Motivo del rechazo (lo verá el paciente)" value={reason} onChange={setReason} minLength={10} maxLength={500} required autoFocus /><ReasonCounter value={reason} />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={reason.trim().length < 10} label="Rechazar solicitud" /></div></form></Dialog>;
}

/** Lo que el paciente pidió y en qué quedó: pendientes arriba; retirar solo si el servidor lo permite. */
function MyRequests({ api, requests, sent }: { api: Api; requests: Remote<CategoryRequest[]>; sent: boolean }) {
  const action = useAction(api);
  const rows = requests.data ?? [];
  if (!sent && !rows.length) return null;
  async function withdraw(r: CategoryRequest) { if (await action.run(`/citas/solicitudes-categoria/${r.id}/cancelar`, { version: r.version })) requests.refresh(); }
  return <section className="rq-inbox" aria-label="Mis solicitudes">
    <header className="rq-head"><h2>Mis solicitudes</h2></header>
    {sent && <Notice kind="success">Solicitud enviada. Recepción te asignará médico y hora; te avisaremos aquí.</Notice>}
    <WriteError error={action.error} onReload={requests.refresh} reloadLabel="Actualizar mis solicitudes" />
    <RemoteState state={requests} skeletonRows={1}>{() => <ol className="rq-list">{rows.map(r => <li key={r.id} className="rq-row">
      <div className="rq-main">
        <CategoryList categories={r.categories} />
        <p className="rq-meta"><Tag value={REQUEST_STATE[r.state].value} label={REQUEST_STATE[r.state].label} /> {FRANJA_LABEL[r.franja]}{r.note && <> · {r.note}</>}</p>
        {r.appointment && <p className="rq-note">Cita con {r.appointment.doctorName}, {formatDateTime(r.appointment.start)}.</p>}
        {r.state === 'rechazada' && r.rejectionReason && <p className="rq-note">{r.rejectionReason}</p>}
      </div>
      {r.allowedActions.includes('cancelar') && <div className="row-actions"><button type="button" className="row-action" disabled={action.busy} aria-label={`Retirar solicitud · ${r.categories.map(c => c.name).join(', ')}`} onClick={() => void withdraw(r)}>Retirar solicitud</button></div>}
    </li>)}</ol>}</RemoteState>
  </section>;
}

/** El paciente elige el motivo (no el médico): una a tres categorías con búsqueda, su franja y una nota breve. */
function CategoryRequestForm({ api, version, onClose, onSaved }: { api: Api; version: number; onClose: () => void; onSaved: () => void }) {
  const [query, setQuery] = useState(''), [picked, setPicked] = useState<string[]>([]), [franja, setFranja] = useState<Franja>('cualquiera'), [note, setNote] = useState(''), [knowsDoctor, setKnowsDoctor] = useState(false), [doctor, setDoctor] = useState<PickerItem | null>(null);
  const action = useAction(api);
  const categories = useData<Category[]>(api, '/citas/categorias', version);
  const catalogs = useData<{ doctors: CatalogDoctor[] }>(api, '/citas/catalogos', version, knowsDoctor);
  const visible = (categories.data ?? []).filter(c => picked.includes(c.code) || matches(query, c.name, c.description, c.keywords, c.specialties.join(' ')));
  const toggle = (code: string) => setPicked(picked.includes(code) ? picked.filter(c => c !== code) : picked.length < 3 ? [...picked, code] : picked);
  const doctorItems: PickerItem[] = (catalogs.data?.doctors ?? []).filter(d => d.active).map(d => ({ id: d.id, label: `${d.givenNames} ${d.surnames}`, detail: d.specialty ?? 'Medicina general' }));
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!picked.length) return;
    const body = { categories: picked, franja, ...(note.trim() ? { note: note.trim() } : {}), ...(knowsDoctor && doctor ? { preferredDoctorId: doctor.id } : {}) };
    if (await action.run('/citas/solicitudes-categoria', body)) onSaved();
  }
  return <Dialog title="Pedir una cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <WriteError error={action.error} onReload={onClose} />
    <fieldset className="rq-fieldset"><legend>¿Por qué necesitas la cita?</legend>
      <LiveSearch label="Buscar motivo" placeholder="Ej.: fiebre, piel, embarazo, presión" value={query} onChange={setQuery} />
      <p className="form-hint" aria-live="polite">{picked.length ? `${picked.length} de 3 elegidos.` : 'Elige uno o hasta tres. Si no sabes cuál, elige Consulta general.'}</p>
      <RemoteState state={categories} skeletonRows={3}>{() => visible.length ? <div className="rq-cat-grid">{visible.map(c => <button type="button" key={c.code} className="rq-cat" aria-pressed={picked.includes(c.code)} disabled={!picked.includes(c.code) && picked.length >= 3} onClick={() => toggle(c.code)}>
        <span className="rq-cat-icon"><CategoryGlyph icon={c.icon} /></span><span><strong>{c.name}</strong><small>{c.description}</small></span></button>)}</div>
        : <p className="form-hint" role="status">Ningún motivo coincide. Prueba otra palabra o elige Consulta general.</p>}</RemoteState>
    </fieldset>
    <div className="rq-fieldset"><span className="eyebrow">Franja preferida</span><ChipGroup label="Franja preferida" value={franja} onChange={setFranja} options={(['manana', 'tarde', 'cualquiera'] as Franja[]).map(value => ({ value, label: FRANJA_LABEL[value] }))} /></div>
    <label className="field"><span>Nota para recepción · opcional</span><textarea value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={280} placeholder="Desde cuándo, qué sientes o qué días no puedes" /></label>
    <p className="form-hint" aria-live="polite">{note.length}/280</p>
    {knowsDoctor
      ? <SearchPicker label="Médico preferido · opcional" value={doctor} onChange={setDoctor} items={doctorItems} placeholder="Escribe su nombre" emptyText={catalogs.loading ? 'Cargando médicos…' : 'Ningún médico con ese nombre.'} hint="Recepción intentará darte cita con él o ella." />
      : <button type="button" className="cl-link-button rq-secondary" onClick={() => setKnowsDoctor(true)}>Ya tengo médico (opcional)</button>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!picked.length} label="Enviar solicitud" /></div>
  </form></Dialog>;
}
