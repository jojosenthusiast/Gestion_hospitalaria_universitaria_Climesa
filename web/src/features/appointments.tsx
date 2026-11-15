import { useEffect, useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { ExportMenu } from '../components/export-menu';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { APPOINTMENT_STATE_TONE, addDays, dayKey, dayLabel, groupAgenda, minutesBetween, timeRange, weekOf } from './listas/schedule';
import './listas/lists.css';
import { SearchPicker, type PickerItem, type PickerPage } from '../components/search-picker';
import { useQuickAction } from './personal/accion';
import { can, type AccessProfile, type Api, type Appointment as BaseAppointment } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData } from './common';
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
const STATE_FILTERS = [['activas', 'Activas'], ['solicitada', 'Solicitadas'], ['confirmada', 'Confirmadas'], ['atendida', 'Atendidas'], ['no_asistio', 'No asistió'], ['vencida', 'Vencidas'], ['reprogramada', 'Reprogramadas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']] as const;
const isLive = (state: string) => state === 'solicitada' || state === 'confirmada';

export function AppointmentsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Appointment[]>(api, '/citas', version);
  const [create, setCreate] = useState(false);
  // Acción rápida del tablero: #/citas?accion=agendar abre el formulario.
  const [quick, consumeQuick] = useQuickAction(), canSchedule = can(profile, 'citas.agendar');
  useEffect(() => { if (quick === 'agendar' && canSchedule) setCreate(true); if (quick) consumeQuick(); }, [quick, canSchedule, consumeQuick]);
  const [selected, setSelected] = useState<{ appointment: Appointment; action: Dialogued } | null>(null);
  const direct = useAction(api);
  /** One-click actions (CITA-06): confirm, no-show and accepting a reschedule need no form. */
  async function runDirect(row: Appointment, name: AppointmentAction) {
    const path = name === 'confirmar' ? `/citas/solicitudes/${row.id}/confirmar` : name === 'no_asistio' ? `/citas/${row.id}/no-asistio` : `/citas/reprogramaciones/${row.reschedule!.id}/aceptar`;
    const body = name === 'aceptar_reprogramacion' ? { version: row.reschedule!.version } : { version: row.version };
    if (await direct.run(path, body)) data.refresh();
  }
  const [query, setQuery] = useState(''), [state, setState] = useState<string>('activas'), [range, setRange] = useState<Range>('todas'), [day, setDay] = useState(todayKey()), [doctor, setDoctor] = useState<PickerItem | null>(null);
  const reload = () => { setCreate(false); setSelected(null); data.refresh(); };
  const all = data.data ?? [];
  const window = range === 'hoy' ? { from: todayKey(), to: todayKey() } : range === 'semana' ? weekOf(day) : range === 'dia' ? { from: day, to: day } : null;
  const rows = all.filter(a => (state === 'todas' || (state === 'activas' ? isLive(a.state) : a.state === state)) && (!doctor || a.doctorId === doctor.id)
    && (!window || (dayKey(a.start) >= window.from && dayKey(a.start) <= window.to)) && matches(query, a.patientName, a.doctorName, a.reason));
  const doctorItems: PickerItem[] = [...new Map(all.map(a => [a.doctorId, a.doctorName])).entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const stateName = (value: string) => STATE_FILTERS.find(([key]) => key === value)?.[1] ?? value;
  const filters = [
    ...(state !== 'activas' ? [{ key: 'estado', label: stateName(state), remove: () => setState('activas') }] : []),
    ...(range !== 'todas' ? [{ key: 'rango', label: range === 'hoy' ? 'Hoy' : range === 'semana' ? `Semana del ${window?.from}` : `Día ${day}`, remove: () => setRange('todas') }] : []),
    ...(doctor ? [{ key: 'medico', label: doctor.label, remove: () => setDoctor(null) }] : []),
    ...(query.trim() ? [{ key: 'texto', label: `«${query.trim()}»`, remove: () => setQuery('') }] : []),
  ];
  const clear = () => { setState('activas'); setRange('todas'); setDoctor(null); setQuery(''); };
  const agenda = groupAgenda(rows);
  const exportTable = () => ({ filename: 'citas', title: 'Citas', subtitle: `${rows.length} citas`, columns: ['Fecha', 'Horario', 'Paciente', 'Médico', 'Estado', 'Motivo'], rows: rows.map(a => [dayLabel(dayKey(a.start)), timeRange(a.start, a.end), a.patientName, a.doctorName, stateName(a.state), a.reason ?? '']) });
  return <>
    <Heading eyebrow="Atención / Agenda" title="Citas" description="Agenda, solicitudes y cancelaciones con estados claros para cada participante."
      actions={can(profile, 'citas.agendar') && <button className="primary-button" onClick={() => setCreate(true)}><Icon name="plus" size={18} />Agendar cita</button>} />
    <section className="data-workbench" aria-label="Agenda de citas">
      <RemoteState state={data}>{() => <>
        <ListToolbar trailing={<ExportMenu table={exportTable} disabled={!rows.length} />}>
          <LiveSearch label="Buscar citas" placeholder="Paciente, médico o motivo" value={query} onChange={setQuery} />
          <div className="cl-doctor-filter"><SearchPicker label="Médico" value={doctor} onChange={setDoctor} items={doctorItems} minChars={0} placeholder="Todos los médicos" emptyText="Ningún médico con citas coincide." /></div>
        </ListToolbar>
        <div className="cl-filter-row"><span className="cl-filter-label">Estado</span><ChipGroup label="Estado de la cita" value={state} onChange={setState} options={STATE_FILTERS.map(([value, label]) => ({ value, label, count: all.filter(a => value === 'todas' || (value === 'activas' ? isLive(a.state) : a.state === value)).length }))} />
          <span className="cl-filter-label">Cuándo</span><ChipGroup label="Rango de fechas" value={range} onChange={setRange} options={[{ value: 'todas', label: 'Todas' }, { value: 'hoy', label: 'Hoy' }, { value: 'semana', label: 'Semana' }, { value: 'dia', label: 'Un día' }]} />
          {(range === 'dia' || range === 'semana') && <span className="cl-day-nav"><button type="button" className="row-action" aria-label={range === 'semana' ? 'Semana anterior' : 'Día anterior'} onClick={() => setDay(addDays(day, range === 'semana' ? -7 : -1))}>‹</button><Field label="Fecha de referencia" type="date" value={day} onChange={value => value && setDay(value)} /><button type="button" className="row-action" aria-label={range === 'semana' ? 'Semana siguiente' : 'Día siguiente'} onClick={() => setDay(addDays(day, range === 'semana' ? 7 : 1))}>›</button></span>}
        </div>
        <ActiveFilters filters={filters} onClear={clear} />
        <WriteError error={direct.error} onReload={data.refresh} reloadLabel="Recargar las citas" />
        {rows.length ? <>
          <p className="cl-count" aria-live="polite">{rows.length} de {all.length} citas, agrupadas por día y por médico.</p>
          {agenda.map(group => <section className="ag-day" key={group.day} aria-label={dayLabel(group.day)}><h3>{dayLabel(group.day)}</h3>
            {group.doctors.map(d => <div className="ag-doctor" key={d.doctorId}><header><strong><Icon name="steth" size={16} /> {d.doctorName}</strong><small>{d.items.length} cita(s)</small></header>
              {d.items.map(row => <div className={`ag-slot tone-${APPOINTMENT_STATE_TONE[row.state] ?? 'info'}`} key={row.id}>
                <span className="ag-time">{timeRange(row.start, row.end)}<small>{minutesBetween(row.start, row.end)} min</small></span>
                <span><strong>{row.patientName}</strong>{row.reason && <small className="muted"> · {row.reason}</small>}</span>
                <Tag value={row.state} />
                <AppointmentRowActions row={row} busy={direct.busy} onDirect={name => void runDirect(row, name)} onDialog={name => setSelected({ appointment: row, action: name })} /></div>)}</div>)}</section>)}</>
          : <Empty title={all.length ? 'Ninguna cita coincide con los filtros' : 'No hay citas en el rango actual'} description={all.length ? 'Quita algún filtro o cambia el rango.' : 'Las solicitudes o citas agendadas aparecerán aquí.'} />}
      </>}</RemoteState>
    </section>
    {create && <AppointmentForm api={api} version={version} onClose={() => setCreate(false)} onSaved={reload} />}
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
  const [availability, setAvailability] = useState<Availability | null>(null), [availabilityError, setAvailabilityError] = useState<string | null>(null), [availabilityLoading, setAvailabilityLoading] = useState(false);
  const action = useAction(api);
  const doctorId = doctor?.id ?? '';
  // Los médicos (pocos) se piden con el día elegido para saber quién tiene turno; los pacientes se buscan mientras se escribe.
  const catalogs = useData<{ doctors: CatalogDoctor[] }>(api, `/citas/catalogos?date=${encodeURIComponent(date)}`, version);
  const doctorItems: PickerItem[] = (catalogs.data?.doctors ?? []).filter(d => d.active).map(d => ({ id: d.id, label: `${d.givenNames} ${d.surnames}`, detail: [d.specialty ?? 'Medicina general', d.area].filter(Boolean).join(' · '), disabled: d.tieneTurno === false, reason: d.tieneTurno === false ? 'Sin turno' : undefined }));
  useEffect(() => {
    let active = true;
    setSlot(''); setAvailability(null); setAvailabilityError(null);
    if (!doctorId || !date) return () => { active = false; };
    setAvailabilityLoading(true);
    api.request<Availability>(`/citas/disponibilidad?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`)
      .then(result => { if (active) setAvailability(result); })
      .catch(error => { if (active) setAvailabilityError(error instanceof Error ? error.message : 'No se pudo consultar la disponibilidad.'); })
      .finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [api, doctorId, date]);
  const franjas = availability?.franjas ?? [];
  const selectedSlot = franjas.find(item => item.start === slot && item.estado === 'libre');
  const freeCount = franjas.filter(item => item.estado === 'libre').length;
  const missing = [!patient && 'el paciente', !doctorId && 'el médico', !selectedSlot && 'una franja libre'].filter(Boolean).join(', ');
  async function save(e: FormEvent) { e.preventDefault(); if (!selectedSlot || !patient) return; if (await action.run('/citas', { patientId: patient.id, doctorId, start: selectedSlot.start, end: selectedSlot.end, reason: reason || undefined })) onSaved(); }
  return <Dialog title="Agendar cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">Busca al paciente por nombre, DUI o expediente (sin importar tildes), elige un médico con turno y toca una franja libre de 20 minutos. La API vuelve a validar el horario al confirmar.</p><WriteError error={action.error} onReload={onSaved} />
    <div className="form-grid"><SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." /><Field label="Fecha" type="date" value={date} onChange={value => setDate(value)} required /><SearchPicker label="Médico" value={doctor} onChange={setDoctor} items={doctorItems} required emptyText={catalogs.loading ? 'Cargando médicos…' : 'No hay médicos que coincidan.'} hint="Los médicos sin turno ese día aparecen apagados." /></div>
    <section className="slot-section" aria-label="Horarios del día" aria-busy={availabilityLoading}><span className="eyebrow">Horario</span>
      {!doctorId ? <p className="form-hint">Elige un médico para ver sus horarios del día.</p> : availabilityLoading ? <p className="form-hint" role="status">Consultando horarios…</p> : <>
        {availability?.workPeriods.length ? <p className="form-hint">Jornada publicada: {availability.workPeriods.map(period => `${timeOnly(period.start)}–${timeOnly(period.end)}`).join(' · ')}</p> : <p className="form-hint">Este médico no tiene una jornada publicada para esta fecha: prueba con otro día u otro médico.</p>}
        <div className="slot-grid" role="group" aria-label="Franjas del día">{franjas.map(item => item.estado === 'libre'
          ? <button type="button" key={item.start} className={`slot slot-libre${item.start === slot ? ' is-selected' : ''}`} aria-pressed={item.start === slot} onClick={() => setSlot(item.start)}><strong>{timeOnly(item.start)}</strong><small>{slotNames.libre}</small></button>
          : <button type="button" key={item.start} className={`slot slot-${item.estado}`} disabled aria-label={`${timeOnly(item.start)}, no disponible: ${item.motivo ?? slotNames[item.estado]}`}><strong>{timeOnly(item.start)}</strong><small>{item.motivo ?? slotNames[item.estado]}</small></button>)}</div>
        {franjas.length > 0 && <ul className="slot-legend" aria-label="Leyenda"><li><i className="slot-key slot-libre" />Libre</li><li><i className="slot-key slot-ocupado" />Ocupado</li><li><i className="slot-key slot-sin_turno" />Sin turno</li><li><i className="slot-key slot-pasado" />Ya pasó</li></ul>}
        {franjas.length > 0 && freeCount === 0 && <Notice kind="info">No quedan franjas libres este día. Prueba con otra fecha.</Notice>}</>}
    </section>
    <Field label="Motivo · opcional" value={reason} onChange={setReason} maxLength={500} />
    {availabilityError && <Notice kind="error">{availabilityError}</Notice>}{missing && <p className="form-hint" role="status">Para confirmar falta elegir {missing}.</p>}{selectedSlot && <Notice kind="info">Horario elegido: {timeOnly(selectedSlot.start)}–{timeOnly(selectedSlot.end)}. Si otra persona lo ocupa antes de confirmar, el sistema te pedirá seleccionar otro.</Notice>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} disabled={!selectedSlot || !patient} label="Confirmar cita" /></div></form></Dialog>;
}

const isDialogued = (name: AppointmentAction): name is Dialogued => name === 'rechazar' || name === 'cancelar' || name === 'reprogramar' || name === 'rechazar_reprogramacion';

/** CITA-04: buttons come from the server's `allowedActions`; blocked ones are shown disabled with their reason. */
function AppointmentRowActions({ row, busy, onDirect, onDialog }: { row: Appointment; busy: boolean; onDirect: (name: AppointmentAction) => void; onDialog: (name: Dialogued) => void }) {
  const allowed = row.allowedActions ?? [], blocked = row.blockedActions ?? [];
  const pending = row.reschedule?.state === 'pendiente' ? row.reschedule : null;
  return <div className="row-actions">
    {pending && <small className="form-hint">Pide cambiar a {formatDateTime(pending.start)}{pending.reason ? ` · ${pending.reason}` : ''}</small>}
    {row.reschedule?.state === 'rechazada' && <small className="form-hint">Reprogramación rechazada: {row.reschedule.rejectionReason}</small>}
    {row.state === 'reprogramada' && <small className="form-hint">Se movió a otra franja.</small>}
    {ROW_ACTIONS.map(name => allowed.includes(name)
      ? <button key={name} className="row-action" disabled={busy} aria-label={`${ACTION_LABEL[name]} · ${row.patientName}`} onClick={() => isDialogued(name) ? onDialog(name) : onDirect(name)}>{ACTION_LABEL[name]}</button>
      : null)}
    {blocked.filter(item => ROW_ACTIONS.includes(item.action)).map(item => <small key={item.action} className="form-hint" title={item.reason}>{ACTION_LABEL[item.action]}: {item.reason}</small>)}
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
  const [availability, setAvailability] = useState<Availability | null>(null), [error, setError] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const action = useAction(api);
  useEffect(() => {
    let active = true;
    setSlot(''); setAvailability(null); setError(null); setLoading(true);
    api.request<Availability>(`/citas/disponibilidad?doctorId=${encodeURIComponent(appointment.doctorId)}&date=${encodeURIComponent(date)}`)
      .then(result => { if (active) setAvailability(result); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se pudo consultar la disponibilidad.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, appointment.doctorId, date]);
  const franjas = availability?.franjas ?? [];
  const chosen = franjas.find(item => item.start === slot && item.estado === 'libre');
  async function save(e: FormEvent) { e.preventDefault(); if (!chosen) return; if (await action.run(`/citas/${appointment.id}/reprogramar`, { version: appointment.version, start: chosen.start, end: chosen.end })) onSaved(); }
  return <Dialog title="Reprogramar cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{appointment.patientName}</strong> · {appointment.doctorName}<br />Horario actual: {formatDateTime(appointment.start)}. Elige una franja libre del mismo médico.</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Fecha" type="date" value={date} onChange={value => value && setDate(value)} required />
    <section className="slot-section" aria-label="Horarios del día" aria-busy={loading}>
      {loading ? <p className="form-hint" role="status">Consultando horarios…</p> : <div className="slot-grid" role="group" aria-label="Franjas del día">{franjas.map(item => item.estado === 'libre'
        ? <button type="button" key={item.start} className={`slot slot-libre${item.start === slot ? ' is-selected' : ''}`} aria-pressed={item.start === slot} onClick={() => setSlot(item.start)}><strong>{timeOnly(item.start)}</strong><small>{slotNames.libre}</small></button>
        : <button type="button" key={item.start} className={`slot slot-${item.estado}`} disabled aria-label={`${timeOnly(item.start)}, no disponible: ${item.motivo ?? slotNames[item.estado]}`}><strong>{timeOnly(item.start)}</strong><small>{item.motivo ?? slotNames[item.estado]}</small></button>)}</div>}
      {!loading && franjas.length > 0 && !franjas.some(item => item.estado === 'libre') && <Notice kind="info">No quedan franjas libres este día. Prueba con otra fecha.</Notice>}
    </section>
    {error && <Notice kind="error">{error}</Notice>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!chosen} label="Reprogramar" /></div></form></Dialog>;
}
