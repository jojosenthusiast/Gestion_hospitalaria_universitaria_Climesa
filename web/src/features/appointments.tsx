import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import { CategoryBadges, CategoryGlyph, type CategoryRef } from '../components/category';
import { readHashParams, writeHashParams } from '../lib/hash-params';
import { can, type AccessProfile, type Api, type Appointment as BaseAppointment } from '../lib/api';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData, type Remote } from './common';
import './appointments.css';
import './front-desk.css';

/** CITA-04: actions the server accepts now for the reader, and the blocked ones with their reason (contract `AccionCita`). */
export type AppointmentAction = 'confirmar' | 'rechazar' | 'cancelar' | 'reprogramar' | 'no_asistio' | 'aceptar_reprogramacion' | 'rechazar_reprogramacion' | 'iniciar_consulta';
type Reschedule = { id: string; start: string; end: string; state: string; origin: string; reason?: string | null; rejectionReason?: string | null; version: number };
type Appointment = BaseAppointment & { categories?: CategoryRef[]; allowedActions?: AppointmentAction[]; blockedActions?: { action: AppointmentAction; reason: string }[]; cancelableUntil?: string | null; reschedule?: Reschedule | null; rescheduledFromId?: string | null; rescheduledToId?: string | null;
  /** R7 U1: the queue number of the arrival (D-1) and the cancel reason (D-8). */
  arrival?: { id: string; numero: number; state: string } | null; cancelReasonCode?: CancelCode | null; cancelReason?: string | null };
/** D-8: the patient's quick cancel reasons (`AppointmentCancelDto.reasonCode`). */
type CancelCode = 'ya_no_lo_necesito' | 'no_puedo_a_esa_hora' | 'otro';
const CANCEL_CODES: [CancelCode, string][] = [['ya_no_lo_necesito', 'Ya no lo necesito'], ['no_puedo_a_esa_hora', 'No puedo a esa hora'], ['otro', 'Otro motivo']];
/** D-3: «No asistió» waits this long on the client before it is sent, so it can be undone. */
export const NO_SHOW_DELAY_MS = 8000;
type Issued = { id: string; numero: number; area?: string; service: string; ahead?: number };
/** A-1: `GET /citas/solicitudes-categoria/{id}/sugerencia`. */
type Suggestion = { found: boolean; doctorId: string | null; doctorName: string | null; specialty: string | null; date: string | null; start: string | null; end: string | null };
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

/** #15: on a phone, reception starts on one day (with day navigation) instead of every date on one long page. */
const defaultRange = (staff: boolean): Range => staff && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches ? 'dia' : 'todas';

export function AppointmentsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Appointment[]>(api, '/citas', version);
  const [create, setCreate] = useState(false);
  // Acción rápida del tablero: #/citas?accion=agendar abre el formulario.
  const [quick, consumeQuick] = useQuickAction(), canSchedule = can(profile, 'citas.agendar'), canRequest = can(profile, 'citas.solicitar');
  // Fase 2, flujo A: el paciente pide por motivo (#/citas?accion=solicitar desde su inicio).
  const [asking, setAsking] = useState(false), [sent, setSent] = useState(false);
  // R7 U1: from the patient record, `#/citas?accion=agendar&paciente=<id>` opens the form with the patient fixed.
  const [prefilled, setPrefilled] = useState<string | null>(null);
  useEffect(() => {
    if (quick === 'agendar' && canSchedule) { setPrefilled(readHashParams().get('paciente')); writeHashParams({ paciente: null }); setCreate(true); }
    if (quick === 'solicitar' && canRequest) setAsking(true);
    if (quick) consumeQuick();
  }, [quick, canSchedule, canRequest, consumeQuick]);
  const requests = useData<CategoryRequest[]>(api, '/citas/solicitudes-categoria', version, canSchedule || canRequest);
  const [selected, setSelected] = useState<{ appointment: Appointment; action: Dialogued } | null>(null);
  const direct = useAction(api), arrive = useAction(api);
  const canArrive = can(profile, 'fila.emitir');
  const [arrived, setArrived] = useState<{ appointmentId: string; text: string } | null>(null);
  /** D-1: reception registers the arrival from the appointment; the number is linked to it. */
  async function registerArrival(row: Appointment) {
    setArrived(null);
    const issued = await arrive.run<Issued>('/fila', { service: 'consulta_general', patientId: row.patientId, appointmentId: row.id });
    if (issued) { setArrived({ appointmentId: row.id, text: `Llegada registrada: ${row.patientName} tiene el número ${issued.area ?? 'CON'} ${issued.numero}${issued.ahead === undefined ? '' : issued.ahead === 0 ? ', nadie antes' : `, ${issued.ahead} antes`}.` }); data.refresh(); }
  }
  // D-3: «No asistió» is held for 8 s with «Deshacer»; only then is it sent. Leaving the page sends what is pending.
  const [noShows, setNoShows] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const sendNoShow = useRef<(row: Appointment) => void>(() => undefined);
  // The row is read again when the hold ends: a refresh during the 8 s brings the live version (and state) to send.
  const noShow = useAction(api), [noShowChanged, setNoShowChanged] = useState(false);
  const liveRows = useRef<Appointment[]>([]);
  liveRows.current = Array.isArray(data.data) ? data.data : [];
  sendNoShow.current = row => {
    timers.current.delete(row.id); setNoShows(current => { const next = { ...current }; delete next[row.id]; return next; });
    const live = liveRows.current.find(item => item.id === row.id) ?? row;
    setNoShowChanged(false);
    if (live.state !== row.state) { setNoShowChanged(true); data.refresh(); return; }
    void noShow.run(`/citas/${row.id}/no-asistio`, { version: live.version }).then(ok => { data.refresh(); if (!ok) setNoShowChanged(true); });
  };
  const pendingRows = useRef(new Map<string, Appointment>());
  useEffect(() => () => { for (const [id, timer] of timers.current) { clearTimeout(timer); const row = pendingRows.current.get(id); if (row) sendNoShow.current(row); } }, []);
  function holdNoShow(row: Appointment) {
    pendingRows.current.set(row.id, row);
    setNoShows(current => ({ ...current, [row.id]: true }));
    timers.current.set(row.id, setTimeout(() => { pendingRows.current.delete(row.id); sendNoShow.current(row); }, NO_SHOW_DELAY_MS));
  }
  function undoNoShow(row: Appointment) {
    clearTimeout(timers.current.get(row.id)); timers.current.delete(row.id); pendingRows.current.delete(row.id);
    setNoShows(current => { const next = { ...current }; delete next[row.id]; return next; });
  }
  /** One-click actions (CITA-06): confirm, no-show and accepting a reschedule need no form. */
  async function runDirect(row: Appointment, name: AppointmentAction) {
    if (name === 'no_asistio') { holdNoShow(row); return; }
    const path = name === 'confirmar' ? `/citas/solicitudes/${row.id}/confirmar` : `/citas/reprogramaciones/${row.reschedule!.id}/aceptar`;
    const body = name === 'aceptar_reprogramacion' ? { version: row.reschedule!.version } : { version: row.version };
    if (await direct.run(path, body)) data.refresh();
  }
  const [query, setQuery] = useState(''), [state, setState] = useState<StateFilter>('proximas'), [range, setRange] = useState<Range>(() => defaultRange(canSchedule)), [day, setDay] = useState(todayKey()), [doctor, setDoctor] = useState<PickerItem | null>(null);
  const reload = () => { setCreate(false); setPrefilled(null); setSelected(null); data.refresh(); };
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
  const filtered = state !== 'proximas' || range !== defaultRange(canSchedule) || !!doctor || !!query.trim();
  const clear = () => { setState('proximas'); setRange(defaultRange(canSchedule)); setDoctor(null); setQuery(''); };
  // Today and what comes next first; past days fold at the bottom (W-REC-14).
  const agenda = groupAgenda(rows), today = todayKey();
  const [phoneAgenda] = useState(() => typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(max-width: 767px)').matches);
  const [openDoctors, setOpenDoctors] = useState<Record<string, boolean>>({});
  const ahead = agenda.filter(g => g.day >= today), past = agenda.filter(g => g.day < today).reverse();
  const exportTable = () => ({ filename: 'citas', title: 'Citas', subtitle: plural(rows.length, 'cita', 'citas'), columns: ['Fecha', 'Horario', 'Paciente', 'Médico', 'Estado', 'Motivo'], rows: rows.map(a => [formatDate(a.start), timeRange(a.start, a.end), a.patientName, a.doctorName, stateName(shownState(a, now)), a.reason ?? '']) });
  // #15: on a phone a busy day is a page per doctor; each doctor folds to its header (the first stays open).
  const doctorOpen = (day: string, doctorId: string, index: number) => !phoneAgenda || (openDoctors[`${day}:${doctorId}`] ?? (index === 0 && day === (ahead[0]?.day ?? today)));
  const dayGroup = (group: typeof agenda[number]) => <section className="ag-day" key={group.day} aria-label={formatDayHeading(group.day)}><h3>{formatDayHeading(group.day)}{group.day === today && <small> · hoy</small>}</h3>
    {group.doctors.map((d, index) => { const open = doctorOpen(group.day, d.doctorId, index); return <div className="ag-doctor" key={d.doctorId}>
      {phoneAgenda
        ? <header><button type="button" className="ag-doctor-toggle" aria-expanded={open} onClick={() => setOpenDoctors(current => ({ ...current, [`${group.day}:${d.doctorId}`]: !open }))}><strong><Icon name="steth" size={16} /> {d.doctorName}</strong><small>{plural(d.items.length, 'cita', 'citas')}</small><Icon name="chevron" size={16} /></button></header>
        : <header><strong><Icon name="steth" size={16} /> {d.doctorName}</strong><small>{plural(d.items.length, 'cita', 'citas')}</small></header>}
      {open && d.items.map(row => { const shown = shownState(row, now); return <div className={`ag-slot${shown !== row.state ? ' is-overdue' : ''}`} key={row.id}>
        <span className="ag-time">{timeRange(row.start, row.end)}<small>{minutesBetween(row.start, row.end)} min</small></span>
        <span className="ag-who"><strong>{row.patientName}<CategoryBadges categories={row.categories} /></strong>{row.reason && <small>{row.reason}</small>}
          {row.state === 'cancelada' && (row.cancelReasonCode || row.cancelReason) && <small>Motivo: {[CANCEL_CODES.find(([code]) => code === row.cancelReasonCode)?.[1], row.cancelReason].filter(Boolean).join(' · ')}</small>}</span>
        <StatusBadge value={shown} />
        {noShows[row.id]
          ? <div className="row-actions ag-held" role="status"><small>Se marcará «No asistió» en unos segundos.</small><button type="button" className="row-action" onClick={() => undoNoShow(row)}><Icon name="retry" size={16} />Deshacer</button></div>
          : <div className="ag-row-end">
            {row.arrival ? <span className="qb-cita" title="Número de fila de la llegada"><Icon name="check" size={14} />Llegó · CON {row.arrival.numero}</span>
              : canArrive && row.state === 'confirmada' && dayKey(row.start) === today && <button type="button" className="row-action ag-arrive" disabled={arrive.busy} aria-label={`Registrar llegada · ${row.patientName}`} onClick={() => void registerArrival(row)}>{arrive.busy ? 'Registrando…' : 'Registrar llegada'}</button>}
            <AppointmentRowActions row={row} busy={direct.busy} onDirect={name => void runDirect(row, name)} onDialog={name => setSelected({ appointment: row, action: name })} /></div>}
        {arrived?.appointmentId === row.id && <Notice kind="success">{arrived.text}</Notice>}</div>; })}</div>; })}</section>;
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
        {noShowChanged && (!noShow.error || noShow.error.status === 409) ? <Notice kind="error">La cita cambió mientras esperaba; no se marcó «No asistió».</Notice> : <WriteError error={noShow.error} />}
        <WriteError error={arrive.error} />
        {rows.length ? <>
          {ahead.map(dayGroup)}
          {past.length > 0 && (ahead.length ? <details className="ag-past"><summary>Días anteriores · {plural(past.reduce((n, g) => n + g.doctors.reduce((m, d) => m + d.items.length, 0), 0), 'cita', 'citas')}</summary>{past.map(dayGroup)}</details> : past.map(dayGroup))}</>
          : <Empty title={all.length ? 'Ninguna cita coincide con los filtros' : 'No hay citas en el rango actual'} description={all.length ? 'Quita algún filtro o cambia el rango.' : 'Las solicitudes o citas agendadas aparecerán aquí.'} />}
      </>}</RemoteState>
    </section>
    {create && <AppointmentForm api={api} version={version} patientId={prefilled} onClose={() => { setCreate(false); setPrefilled(null); }} onSaved={reload} />}
    {asking && <CategoryRequestForm api={api} version={version} onClose={() => setAsking(false)} onSaved={() => { setAsking(false); setSent(true); requests.refresh(); }} />}
    {selected && (selected.action === 'reprogramar'
      ? <RescheduleDialog api={api} appointment={selected.appointment} onClose={() => setSelected(null)} onSaved={reload} />
      : <ReasonDialog api={api} appointment={selected.appointment} action={selected.action} patientOnly={!profile.permissions.some(p => p.code === 'citas.cancelar' && p.context !== 'propio')} onClose={() => setSelected(null)} onSaved={reload} />)}
  </>;
}

/** Búsqueda de pacientes para los selectores: sin tildes, paginada y con solo lo necesario (id, expediente, nombre, edad). */
export const patientPicker = (api: Api) => async (query: string, offset: number): Promise<PickerPage> => {
  const page = await api.request<PickerPatient>(`/pacientes/selector?query=${encodeURIComponent(query)}&limit=10&offset=${offset}`);
  return { hasMore: page.hasMore, items: page.items.map(p => ({ id: p.id, label: p.fullName, detail: `Expediente ${p.record}${typeof p.age === 'number' ? ` · ${p.age} años` : ''}` })) };
};
const slotNames: Record<SlotState, string> = { libre: 'Libre', ocupado: 'Ocupado', sin_turno: 'Sin turno', pasado: 'Pasó' };

function AppointmentForm({ api, version, patientId, onClose, onSaved }: { api: Api; version: number; patientId?: string | null; onClose: () => void; onSaved: () => void }) {
  const fixed = useData<{ id: string; record: string; fullName: string }>(api, `/pacientes/${patientId}`, 0, !!patientId);
  useEffect(() => { if (fixed.data) setPatient({ id: fixed.data.id, label: fixed.data.fullName, detail: `Expediente ${fixed.data.record}` }); }, [fixed.data]);
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
  const missing = new Intl.ListFormat('es', { type: 'conjunction' }).format([!patient && 'el paciente', !doctorId && 'el médico', !selectedSlot && 'una franja libre'].filter((part): part is string => !!part));
  async function save(e: FormEvent) { e.preventDefault(); if (!selectedSlot || !patient) return; if (await action.run('/citas', { patientId: patient.id, doctorId, start: selectedSlot.start, end: selectedSlot.end, reason: reason || undefined })) onSaved(); }
  return <Dialog title="Agendar cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">Busca al paciente por nombre, DUI o expediente (sin importar tildes), elige un médico con turno y toca una franja libre de 20 minutos.</p><WriteError error={action.error} onReload={onSaved} />
    <div className="form-grid">{patientId ? <div className="select-field"><span className="eyebrow">Paciente</span><p className="ag-fixed-patient">{patient ? <><strong>{patient.label}</strong> <small>{patient.detail}</small></> : 'Cargando paciente…'}</p></div>
      : <SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." />}<Field label="Fecha" type="date" value={date} onChange={value => setDate(value)} required /><SearchPicker label="Médico" value={doctor} onChange={setDoctor} items={doctorItems} required emptyText={catalogs.loading ? 'Cargando médicos…' : 'No hay médicos que coincidan.'} hint="Los médicos sin turno ese día aparecen apagados." /></div>
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

/**
 * Reception still writes the reason (the API keeps the text for the audit), but the usual ones are one tap away: a
 * phrase fills the field and stays editable. Each phrase has 10 or more characters.
 */
const REASON_PRESETS: Record<'rechazar' | 'cancelar' | 'rechazar_reprogramacion', string[]> = {
  cancelar: ['El paciente llamó para cancelar', 'El médico no estará disponible', 'La cita se agendó por error', 'El paciente ya fue atendido'],
  rechazar: ['No hay médico disponible en esa fecha', 'El caso necesita ir a Emergencia', 'Solicitud repetida'],
  rechazar_reprogramacion: ['El horario pedido ya no está libre', 'El médico no atiende en ese horario'],
};

function ReasonDialog({ api, appointment, action: kind, patientOnly = false, onClose, onSaved }: { api: Api; appointment: Appointment; action: 'rechazar' | 'cancelar' | 'rechazar_reprogramacion'; patientOnly?: boolean; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), [code, setCode] = useState<CancelCode | ''>('');
  // D-8: the patient cancels with a quick reason (no text, «Otro» asks a few words); reception keeps writing it.
  const quick = kind === 'cancelar' && patientOnly;
  const ready = quick ? !!code && (code !== 'otro' || reason.trim().length >= 3) : reason.trim().length >= 10;
  const action = useAction(api);
  const title = kind === 'cancelar' ? 'Cancelar cita' : kind === 'rechazar' ? 'Rechazar solicitud' : 'Rechazar nuevo horario';
  async function save(e: FormEvent) {
    e.preventDefault();
    const result = quick ? await action.run(`/citas/${appointment.id}/cancelar`, { version: appointment.version, reasonCode: code, ...(code === 'otro' ? { reason: reason.trim() } : {}) })
      : kind === 'cancelar' ? await action.run(`/citas/${appointment.id}/cancelar`, { version: appointment.version, reason })
      : kind === 'rechazar' ? await action.run(`/citas/solicitudes/${appointment.id}/rechazar`, { version: appointment.version, rejectionReason: reason })
      : await action.run(`/citas/reprogramaciones/${appointment.reschedule!.id}/rechazar`, { version: appointment.reschedule!.version, rejectionReason: reason });
    if (result) onSaved();
  }
  return <Dialog title={title} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><dl className="ag-summary"><div><dt>Paciente</dt><dd>{appointment.patientName}</dd></div><div><dt>Médico</dt><dd>{appointment.doctorName}</dd></div><div><dt>Horario</dt><dd>{formatDateTime(appointment.start)}</dd></div>{kind === 'rechazar_reprogramacion' && appointment.reschedule && <div><dt>Pide</dt><dd>{formatDateTime(appointment.reschedule.start)}</dd></div>}</dl><WriteError error={action.error} onReload={onSaved} />
    {quick ? <>
      <fieldset className="fd-chips"><legend>¿Por qué cancelas?</legend>{CANCEL_CODES.map(([value, label]) => <label key={value} className={`fd-chip${code === value ? ' is-on' : ''}`}><input type="radio" name="motivo-cancelacion" value={value} checked={code === value} onChange={() => setCode(value)} />{label}</label>)}</fieldset>
      {code === 'otro' && <Field label="Cuéntanos brevemente" value={reason} onChange={setReason} minLength={3} maxLength={500} required autoFocus />}</>
      : <><div className="fd-chips" role="group" aria-label="Motivos frecuentes">{REASON_PRESETS[kind].map(text => <button key={text} type="button" className={`fd-chip${reason === text ? ' is-on' : ''}`} onClick={() => setReason(text)}>{text}</button>)}</div>
        <Field label={kind === 'cancelar' ? 'Motivo de cancelación' : 'Motivo del rechazo'} value={reason} onChange={setReason} minLength={10} maxLength={500} required autoFocus /><ReasonCounter value={reason} /></>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!ready} label={title} /></div></form></Dialog>;
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
    ? <button type="button" key={item.start} className={`slot slot-libre${item.start === value ? ' is-selected' : ''}`} aria-pressed={item.start === value} aria-label={`${timeOnly(item.start)}, ${slotNames.libre}`} onClick={() => onChange(item.start)}><strong>{timeOnly(item.start)}</strong></button>
    : <button type="button" key={item.start} className={`slot slot-${item.estado}`} disabled aria-label={`${timeOnly(item.start)}, no disponible: ${item.motivo ?? slotNames[item.estado]}`}><strong>{timeOnly(item.start)}</strong><small>{item.motivo ?? slotNames[item.estado]}</small></button>)}</div>;
}
const SlotLegend = () => <ul className="slot-legend" aria-label="Leyenda"><li><i className="slot-key slot-libre" />Libre</li><li><i className="slot-key slot-ocupado" />Ocupado</li><li><i className="slot-key slot-sin_turno" />Sin turno</li><li><i className="slot-key slot-pasado" />Ya pasó</li></ul>;

// ───────────── Fase 2, flujo A (S8): solicitud de cita por motivo y bandeja de Recepción ─────────────

type Franja = 'manana' | 'tarde' | 'cualquiera';
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

const CategoryList = ({ categories }: { categories: CategoryRef[] }) => <ul className="rq-cats">{categories.map(c => <li key={c.code}><CategoryGlyph icon={c.icon} size={16} />{c.name}</li>)}</ul>;

/**
 * Bandeja de pendientes de Recepción (R4a, S8): everything that waits on Recepción in one list and one count, the
 * same count as «Solicitadas»: requests by category (assign doctor and time, prefilled) and appointments the patient
 * asked with a doctor and time (confirm or reject, server actions). Oldest first.
 */
const PHONE = '(max-width: 767px)', TRAY_FOLD = 3;
function RequestInbox({ api, version, requests, asked, busy, onDirect, onDialog, onAssigned }: { api: Api; version: number; requests: Remote<CategoryRequest[]>; asked: Appointment[]; busy: boolean; onDirect: (row: Appointment, name: AppointmentAction) => void; onDialog: (row: Appointment, name: Dialogued) => void; onAssigned: () => void }) {
  // #9: Inicio links «Asignar» as #/citas?asignar=<id>; that request opens here and the address is cleaned.
  const [linked] = useState(() => readHashParams().get('asignar'));
  const [open, setOpen] = useState<string | null>(linked), [rejecting, setRejecting] = useState<CategoryRequest | null>(null), [done, setDone] = useState<string | null>(null);
  useEffect(() => { if (linked) writeHashParams({ asignar: null }); }, [linked]);
  const pending = (requests.data ?? []).filter(isPendingCategoryRequest);
  const total = pending.length + asked.length;
  useEffect(() => { if (linked && pending.some(r => r.id === linked)) document.getElementById(`rq-${linked}`)?.scrollIntoView?.({ block: 'center' }); }, [linked, pending.length]);
  // #15: on a phone a long tray folds to its first rows, so the agenda is not pushed thousands of pixels down.
  const [phone] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(PHONE).matches);
  const [expanded, setExpanded] = useState(!!linked);
  const limit = phone && !expanded && total > TRAY_FOLD ? TRAY_FOLD : Infinity;
  const shownPending = pending.slice(0, limit), shownAsked = asked.slice(0, Math.max(0, limit - shownPending.length));
  const finish = (message: string) => { setOpen(null); setRejecting(null); setDone(message); requests.refresh(); onAssigned(); };
  return <section className="rq-inbox" aria-label="Solicitudes por asignar">
    <header className="rq-head"><h2>Solicitudes por asignar</h2>{requests.data && <span className="rq-count" aria-label={`${total} pendientes`}>{total}</span>}</header>
    {done && <Notice kind="success">{done}</Notice>}
    <RemoteState state={requests} skeletonRows={2}>{() => total ? <><ol className="rq-list">{shownPending.map(r => <li key={r.id} id={`rq-${r.id}`} className="rq-row">
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
    {shownAsked.map(a => <li key={a.id} className="rq-row">
      <div className="rq-main">
        <p className="rq-who"><strong>{a.patientName}</strong><small className="muted">{formatDate(a.start, { withYear: false })}, {timeOnly(a.start)}</small></p>
        <p className="rq-meta">Con <strong>{a.doctorName}</strong>{a.reason && <> · {a.reason}</>}</p>
      </div>
      <div className="row-actions">
        {(['confirmar', 'rechazar'] as const).map(name => <ActionButton key={name} action={name} allowed={a.allowedActions ?? []} blocked={a.blockedActions ?? []} disabled={busy} className={name === 'confirmar' ? 'row-action rq-primary' : 'row-action'} aria-label={`${ACTION_LABEL[name]} · ${a.patientName}`} onClick={() => name === 'confirmar' ? onDirect(a, name) : onDialog(a, name)}>{ACTION_LABEL[name]}</ActionButton>)}
      </div>
    </li>)}</ol>{limit < total && <button type="button" className="cl-link-button rq-more" onClick={() => setExpanded(true)}>Ver las {total - limit} restantes</button>}</> : <p className="rq-empty" role="status"><Icon name="check" size={18} />Al día: no hay solicitudes por asignar.</p>}</RemoteState>
    {rejecting && <RejectRequestDialog api={api} request={rejecting} onClose={() => setRejecting(null)} onSaved={() => finish('Solicitud rechazada; el paciente verá el motivo.')} />}
  </section>;
}

/** Prellenado: el médico que prefiere el paciente o el primero con turno de las especialidades sugeridas, y la primera franja libre dentro de la franja pedida. */
function AssignPanel({ api, version, request, onCancel, onSaved }: { api: Api; version: number; request: CategoryRequest; onCancel: () => void; onSaved: (message: string) => void }) {
  const [date, setDate] = useState(localInput().slice(0, 10)), [doctor, setDoctor] = useState<PickerItem | null>(null), [touched, setTouched] = useState(false), [slot, setSlot] = useState(''), [wholeDay, setWholeDay] = useState(request.franja === 'cualquiera');
  const action = useAction(api);
  // A-1: the panel opens on the first day with a gap in the requested time of day, with that doctor (server rule).
  const suggestion = useData<Suggestion>(api, `/citas/solicitudes-categoria/${request.id}/sugerencia`, 0);
  const suggested_ = suggestion.data && !Array.isArray(suggestion.data) && suggestion.data.found ? suggestion.data : null;
  useEffect(() => { if (suggested_?.date && !touched) setDate(suggested_.date); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested_?.date]);
  const firstDay = suggested_?.date && suggested_.date > localInput().slice(0, 10) ? suggested_.date : localInput().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => addDays(firstDay, i));
  const catalogs = useData<{ doctors: CatalogDoctor[] }>(api, `/citas/catalogos?date=${encodeURIComponent(date)}`, version);
  const suggested = (d: CatalogDoctor) => request.specialties.includes(d.specialty ?? 'Medicina general');
  const doctors = (catalogs.data?.doctors ?? []).filter(d => d.active).sort((a, b) => Number(suggested(b)) - Number(suggested(a)));
  const items: PickerItem[] = doctors.map(d => ({ id: d.id, label: `${d.givenNames} ${d.surnames}`, detail: [suggested(d) ? 'Sugerido' : null, d.specialty ?? 'Medicina general'].filter(Boolean).join(' · '), disabled: d.tieneTurno === false, reason: d.tieneTurno === false ? 'Sin turno' : undefined }));
  useEffect(() => {
    if (touched || !catalogs.data) return;
    const pick = (suggested_ && date === suggested_.date ? items.find(i => i.id === suggested_.doctorId && !i.disabled) : undefined)
      ?? items.find(i => i.id === request.preferredDoctorId && !i.disabled) ?? items.find(i => !i.disabled && doctors.find(d => d.id === i.id && suggested(d))) ?? null;
    setDoctor(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogs.data, touched, suggested_?.doctorId]);
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
    {suggestion.loading && !suggestion.data ? <p className="form-hint" role="status">Buscando el primer hueco…</p>
      : suggested_ ? <p className="form-hint">Primer hueco en la franja pedida: <strong>{formatDayHeading(suggested_.date!)}</strong>, {timeOnly(suggested_.start!)} con {suggested_.doctorName}.</p>
      : suggestion.data ? <Notice kind="info">Nadie tiene hueco en esa franja en las próximas 2 semanas. Elige otra fecha o todo el día.</Notice> : null}
    <div className="rq-days" role="group" aria-label="Días">{days.map(day => <button type="button" key={day} className="cl-chip" aria-pressed={date === day} onClick={() => setDate(day)}>{formatDayHeading(day)}</button>)}</div>
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
