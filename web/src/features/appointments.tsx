import { useEffect, useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { can, type AccessProfile, type Api, type Appointment, type Patient, type Staff } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';

const localIso = (value: string) => new Date(`${value}-06:00`).toISOString();
const localInput = (date = new Date(Date.now() + 86_400_000)) => {
  const local = new Date(date.valueOf() - 6 * 3_600_000);
  return local.toISOString().slice(0, 16);
};
type Availability = { durationMinutes: number; workPeriods: { start: string; end: string }[]; slots: { start: string; end: string }[] };
const timeOnly = (value: string) => new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/El_Salvador' }).format(new Date(value));

export function AppointmentsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Appointment[]>(api, '/citas', version);
  // W-01: pacientes y médicos salen de /citas/catalogos, que exige citas.agendar (lo tiene REC); /personal exige personal.ver y /pacientes acepta hasta 50.
  const catalogs = useData<{ patients: Patient[]; doctors: Staff[] }>(api, '/citas/catalogos', version, can(profile, 'citas.agendar'));
  const [create, setCreate] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const reload = () => { setCreate(false); setSelected(null); data.refresh(); };
  return <>
    <Heading eyebrow="Atención / Agenda" title="Citas" description="Agenda, solicitudes y cancelaciones con estados claros para cada participante."
      actions={can(profile, 'citas.agendar') && <button className="primary-button" onClick={() => setCreate(true)}><Icon name="plus" size={18} />Agendar cita</button>} />
    <section className="data-workbench">
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Citas registradas</caption><thead><tr><th>Horario</th><th>Paciente</th><th>Médico</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td data-label="Horario"><strong>{formatDateTime(row.start)}</strong><small>{formatDateTime(row.end)}</small></td><td data-label="Paciente">{row.patientName}</td><td data-label="Médico">{row.doctorName}</td><td data-label="Estado"><Tag value={row.state} /></td><td data-label="Acción"><div className="row-actions">{can(profile, 'citas.cancelar') && ['solicitada', 'confirmada'].includes(row.state) && <button className="row-action" onClick={() => setSelected(row)}>Cancelar</button>}{can(profile, 'citas.agendar') && row.state === 'solicitada' && <button className="row-action" onClick={() => setSelected(row)}>Gestionar</button>}</div></td></tr>)}</tbody></table> : <Empty title="No hay citas en el rango actual" description="Las solicitudes o citas agendadas aparecerán aquí." />}</RemoteState>
    </section>
    {create && <AppointmentForm api={api} patients={catalogs.data?.patients ?? []} staff={catalogs.data?.doctors ?? []} onClose={() => setCreate(false)} onSaved={reload} />}
    {selected && <AppointmentAction api={api} appointment={selected} canManage={can(profile, 'citas.agendar')} onClose={() => setSelected(null)} onSaved={reload} />}
  </>;
}

function AppointmentForm({ api, patients, staff, onClose, onSaved }: { api: Api; patients: Patient[]; staff: Staff[]; onClose: () => void; onSaved: () => void }) {
  const [patientId, setPatientId] = useState(''), [doctorId, setDoctorId] = useState(''), [date, setDate] = useState(localInput().slice(0, 10)), [slot, setSlot] = useState(''), [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<Availability | null>(null), [availabilityError, setAvailabilityError] = useState<string | null>(null), [availabilityLoading, setAvailabilityLoading] = useState(false);
  const action = useAction(api);
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
  const selectedSlot = availability?.slots.find(item => item.start === slot);
  async function save(e: FormEvent) { e.preventDefault(); if (!selectedSlot) return; if (await action.run('/citas', { patientId, doctorId, start: selectedSlot.start, end: selectedSlot.end, reason: reason || undefined })) onSaved(); }
  const doctor = staff.find(p => p.id === doctorId);
  return <Dialog title="Agendar cita" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">Selecciona una jornada publicada y una franja disponible de 20 minutos. La API volverá a validar el horario al confirmar.</p><WriteError error={action.error} onReload={onSaved} /><div className="form-grid"><Select label="Paciente" value={patientId} onChange={setPatientId} required><option value="">Selecciona un paciente</option>{patients.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.fullName} · {p.record}</option>)}</Select><Select label="Médico" value={doctorId} onChange={setDoctorId} required><option value="">Selecciona un médico</option>{staff.filter(p => p.active && p.type === 'medico').map(p => <option key={p.id} value={p.id}>{p.givenNames} {p.surnames}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}</Select><Field label="Fecha" type="date" value={date} onChange={value => setDate(value)} required /><div className="form-intro">{doctor && <><strong>{doctor.givenNames} {doctor.surnames}</strong>{doctor.specialty && ` · ${doctor.specialty}`}<br /></>}{availability?.workPeriods.length ? <>Jornada publicada: {availability.workPeriods.map(period => `${timeOnly(period.start)}–${timeOnly(period.end)}`).join(' · ')}</> : doctorId && !availabilityLoading ? 'No hay una jornada publicada para esta fecha.' : 'Selecciona médico y fecha para consultar la jornada.'}</div><Select label="Horario disponible" value={slot} onChange={setSlot} required disabled={!availability || availabilityLoading || availability.slots.length === 0}><option value="">{availabilityLoading ? 'Consultando horarios…' : availability?.slots.length ? 'Selecciona una franja' : 'Sin horarios disponibles'}</option>{availability?.slots.map(item => <option key={item.start} value={item.start}>{timeOnly(item.start)}–{timeOnly(item.end)}</option>)}</Select><Field label="Motivo · opcional" value={reason} onChange={setReason} maxLength={500} /></div>{availabilityError && <Notice kind="error">{availabilityError}</Notice>}{selectedSlot && <Notice kind="info">Horario elegido: {timeOnly(selectedSlot.start)}–{timeOnly(selectedSlot.end)}. Si otra persona lo ocupa antes de confirmar, el sistema te pedirá seleccionar otro.</Notice>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} disabled={!selectedSlot} label="Confirmar cita" /></div></form></Dialog>;
}

function AppointmentAction({ api, appointment, canManage, onClose, onSaved }: { api: Api; appointment: Appointment; canManage: boolean; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(canManage && appointment.state === 'solicitada' ? 'confirmada' : 'cancelada'), [reason, setReason] = useState('');
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); const result = status === 'cancelada' ? await action.run(`/citas/${appointment.id}/cancelar`, { version: appointment.version, reason }) : await action.run(`/citas/solicitudes/${appointment.id}/${status === 'confirmada' ? 'confirmar' : 'rechazar'}`, { version: appointment.version, rejectionReason: reason || undefined }); if (result) onSaved(); }
  const needsReason = status !== 'confirmada';
  return <Dialog title={status === 'cancelada' ? 'Cancelar cita' : 'Gestionar solicitud'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p>Paciente: <strong>{appointment.patientName}</strong><br />Horario: {formatDateTime(appointment.start)}</p><WriteError error={action.error} onReload={onSaved} />{canManage && appointment.state === 'solicitada' && <Select label="Nuevo estado" value={status} onChange={setStatus}><option value="confirmada">Confirmar</option><option value="rechazada">Rechazar</option><option value="cancelada">Cancelar</option></Select>}<Field label={status === 'rechazada' ? 'Motivo del rechazo' : status === 'cancelada' ? 'Motivo de cancelación' : 'Comentario · opcional'} value={reason} onChange={setReason} minLength={needsReason ? 10 : undefined} maxLength={500} required={needsReason} autoFocus />{needsReason && <p className="form-hint">Indica al menos 10 caracteres.</p>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label={status === 'cancelada' ? 'Cancelar cita' : status === 'rechazada' ? 'Rechazar solicitud' : 'Confirmar solicitud'} /></div></form></Dialog>;
}
