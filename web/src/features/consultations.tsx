import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { ApiError, can, type AccessProfile, type Api } from '../lib/api';
import { loadDraft, useLocalDraft } from '../lib/drafts';
import { ClinicalHistoryDialog } from './clinical-history';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { newIntentKey, withIntentKey } from './intent';

export type Consultation = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  start: string;
  end: string;
  reason?: string | null;
  appointmentState: string;
  consultationId?: string | null;
  consultationState?: string | null;
  consultationReason?: string | null;
  physicalExam?: string | null;
  plan?: string | null;
  version?: number | null;
  startedAt?: string | null;
  signedAt?: string | null;
  /** Set when the consultation was started from a queue number instead of an appointment. */
  ticketNumber?: number | null;
};

/** Row of `GET /fila`; `consultationId` is present only for the consultation this doctor started from the number. */
export type QueueConsultationTicket = {
  id: string; numero: number; service: string; state: string; patientId?: string | null; patientName?: string | null; issuedAt: string;
  consultationId?: string | null; consultationState?: string | null;
};

type ConsultationDetail = { consultation: { id: string; patientId: string; appointmentId?: string | null; reason?: string | null; physicalExam?: string | null; plan?: string | null; state: string; version: number; patientName?: string | null } };

/** `consultaId` of a 409 `consulta_ya_iniciada`: the API sends it only when the open consultation is the doctor's own. */
export function resumableConsultationId(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== 'consulta_ya_iniciada') return null;
  const id = error.details?.consultaId;
  return typeof id === 'string' && id ? id : null;
}

const consultationFromHash = () => { try { return new URLSearchParams(location.hash.split('?')[1] ?? '').get('consulta'); } catch { return null; } };

export function ConsultationsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Consultation[]>(api, '/consultas/agenda', version, can(profile, 'consulta.iniciar'));
  const [selected, setSelected] = useState<Consultation | null>(null), [history, setHistory] = useState<Consultation | null>(null);
  const historyAllowed = can(profile, 'expediente.ver');
  const queueAllowed = can(profile, 'consulta.iniciar') && can(profile, 'fila.ver');
  const queue = useData<QueueConsultationTicket[]>(api, '/fila', version, queueAllowed);
  // `#/consultas?consulta=<id>` (from the queue board) reopens that consultation.
  const [resuming, setResuming] = useState<{ id: string; ticket?: QueueConsultationTicket } | null>(() => { const id = consultationFromHash(); return id ? { id } : null; });
  const [startError, setStartError] = useState<ApiError | null>(null), [starting, setStarting] = useState<string | null>(null);
  const intents = useRef(new Map<string, string>());
  /** Starts the consultation of a called number, or resumes the doctor's own one (listed id or 409 with `consultaId`). */
  async function attend(ticket: QueueConsultationTicket) {
    setStartError(null);
    if (ticket.consultationId) { setResuming({ id: ticket.consultationId, ticket }); return; }
    const key = intents.current.get(ticket.id) ?? newIntentKey(); intents.current.set(ticket.id, key);
    setStarting(ticket.id);
    try {
      const started = await withIntentKey(key, () => api.write<{ id: string }>('/consultas', { ticketId: ticket.id }, 'POST'));
      intents.current.delete(ticket.id);
      setResuming({ id: started.id, ticket }); queue.refresh();
    } catch (error) {
      const own = resumableConsultationId(error);
      if (own) { intents.current.delete(ticket.id); setResuming({ id: own, ticket }); }
      else setStartError(error instanceof ApiError ? error : new ApiError('No se pudo iniciar la consulta.'));
    } finally { setStarting(null); }
  }
  const closeResumed = () => { setResuming(null); if (consultationFromHash()) window.history.replaceState(null, '', '#/consultas'); };
  return <>
    <Heading eyebrow="Atención / Medicina" title="Mi consultorio" description="Agenda propia, consultas abiertas y cierre clínico de cada cita." />
    <section className="data-workbench">
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Agenda del médico</caption><thead><tr><th>Horario</th><th>Paciente</th><th>Cita</th><th>Consulta</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.appointmentId}><td data-label="Horario"><strong>{formatDateTime(row.start)}</strong><small>{formatDateTime(row.end)}</small></td><td data-label="Paciente">{row.patientName}</td><td data-label="Cita"><Tag value={row.appointmentState} /></td><td data-label="Consulta"><Tag value={row.consultationState ?? 'pendiente'} /></td><td data-label="Acción"><div className="row-actions"><button className="row-action" onClick={() => setSelected(row)}>{row.consultationState === 'firmada' ? 'Ver consulta' : row.consultationId ? 'Continuar' : 'Iniciar consulta'} <Icon name="arrow" size={16} /></button>{historyAllowed && <button className="row-action" aria-label={`Historial clínico de ${row.patientName}`} onClick={() => setHistory(row)}>Historial</button>}</div></td></tr>)}</tbody></table> : <Empty title="No hay citas en tu agenda" description="Las citas confirmadas aparecerán aquí para iniciar su atención." />}</RemoteState>
    </section>
    {queueAllowed && <section className="data-workbench" aria-labelledby="consultorio-fila"><h2 id="consultorio-fila">Fila del día: llamados y en atención</h2>
      <WriteError error={startError} onReload={queue.refresh} reloadLabel="Recargar la fila" />
      <RemoteState state={queue}>{rows => { const active = rows.filter(row => row.state === 'llamado' || row.state === 'en_atencion').sort((a, b) => a.numero - b.numero); return active.length ? <table className="record-table"><caption className="sr-only">Números llamados y en atención</caption><thead><tr><th>Número</th><th>Paciente</th><th>Fila</th><th>Consulta</th><th>Acción</th></tr></thead><tbody>{active.map(row => <tr key={row.id}><td data-label="Número"><strong className="mono-data">N.º {row.numero}</strong></td><td data-label="Paciente">{row.patientName || 'Paciente no identificado'}</td><td data-label="Fila"><Tag value={row.state} /></td><td data-label="Consulta"><Tag value={row.consultationState ?? 'pendiente'} /></td><td data-label="Acción"><button className="row-action" disabled={starting !== null} onClick={() => void attend(row)}>{starting === row.id ? 'Abriendo…' : row.consultationState === 'firmada' ? 'Ver consulta' : row.consultationId ? 'Retomar consulta' : 'Iniciar consulta'} <Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table> : <Empty title="Nadie en atención" description="Los números llamados aparecerán aquí para iniciar o retomar su consulta." />; }}</RemoteState>
    </section>}
    {resuming && <ResumedConsultation api={api} profile={profile} id={resuming.id} ticket={resuming.ticket} onClose={closeResumed} onSaved={() => { closeResumed(); queue.refresh(); data.refresh(); }} />}
    {history && <ClinicalHistoryDialog api={api} patientId={history.patientId} patientName={history.patientName} version={version} onClose={() => setHistory(null)} />}
    {selected && <ConsultationDialog api={api} profile={profile} item={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); data.refresh(); }} />}
  </>;
}

/** Loads an existing consultation by id (started from the queue or reopened by link) and shows the same editor. */
function ResumedConsultation({ api, profile, id, ticket, onClose, onSaved }: { api: Api; profile: AccessProfile; id: string; ticket?: QueueConsultationTicket; onClose: () => void; onSaved: () => void }) {
  const detail = useData<ConsultationDetail>(api, `/consultas/${id}/detalle`, 0);
  const value = detail.data?.consultation;
  if (!value) return <Dialog title="Retomar consulta" onClose={onClose}><RemoteState state={detail}>{() => null}</RemoteState></Dialog>;
  const item: Consultation = { appointmentId: value.appointmentId ?? '', patientId: value.patientId, patientName: value.patientName ?? ticket?.patientName ?? 'Paciente', start: ticket?.issuedAt ?? '', end: '', appointmentState: '', consultationId: value.id, consultationState: value.state, consultationReason: value.reason, physicalExam: value.physicalExam, plan: value.plan, version: value.version, ticketNumber: ticket?.numero ?? null };
  return <ConsultationDialog api={api} profile={profile} item={item} onClose={onClose} onSaved={onSaved} />;
}

type ConsultationDraft = {
  reason: string; physicalExam: string; plan: string; systolic: string; diastolic: string; heartRate: string; temperature: string; oxygenSaturation: string;
  diagnosisCode: string; diagnosisNote: string; diagnosisPrincipal: boolean; medication: string; dose: string; route: string; frequency: string; duration: string; instructions: string;
};

function TextArea({ label, value, onChange, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean }) {
  return <label className="field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled} rows={4} maxLength={10000} /></label>;
}

function ConsultationDialog({ api, profile, item, onClose, onSaved }: { api: Api; profile: AccessProfile; item: Consultation; onClose: () => void; onSaved: () => void }) {
  const signed = item.consultationState === 'firmada';
  // Unsaved fields of an open consultation are kept as a local draft of this user, so leaving or closing the tab loses nothing.
  const userId = profile.user?.id ?? profile.id, draftName = item.consultationId && !signed ? `consulta:${item.consultationId}` : null;
  const [stored] = useState(() => draftName ? loadDraft<ConsultationDraft>(userId, draftName) : null);
  const server = { reason: item.consultationReason ?? item.reason ?? '', physicalExam: item.physicalExam ?? '', plan: item.plan ?? '' };
  const [reason, setReason] = useState(stored?.reason ?? server.reason), [physicalExam, setPhysicalExam] = useState(stored?.physicalExam ?? server.physicalExam), [plan, setPlan] = useState(stored?.plan ?? server.plan);
  const [systolic, setSystolic] = useState(stored?.systolic ?? ''), [diastolic, setDiastolic] = useState(stored?.diastolic ?? ''), [heartRate, setHeartRate] = useState(stored?.heartRate ?? ''), [temperature, setTemperature] = useState(stored?.temperature ?? ''), [oxygenSaturation, setOxygenSaturation] = useState(stored?.oxygenSaturation ?? '');
  const [diagnosisCode, setDiagnosisCode] = useState(stored?.diagnosisCode ?? ''), [diagnosisNote, setDiagnosisNote] = useState(stored?.diagnosisNote ?? ''), [diagnosisPrincipal, setDiagnosisPrincipal] = useState(stored?.diagnosisPrincipal ?? false);
  const [medication, setMedication] = useState(stored?.medication ?? ''), [dose, setDose] = useState(stored?.dose ?? ''), [route, setRoute] = useState(stored?.route ?? ''), [frequency, setFrequency] = useState(stored?.frequency ?? ''), [duration, setDuration] = useState(stored?.duration ?? ''), [instructions, setInstructions] = useState(stored?.instructions ?? '');
  const [version, setVersion] = useState(item.version ?? 1), [notice, setNotice] = useState<string | null>(null), [baseline, setBaseline] = useState(server);
  const action = useAction(api);
  const values: ConsultationDraft = { reason, physicalExam, plan, systolic, diastolic, heartRate, temperature, oxygenSaturation, diagnosisCode, diagnosisNote, diagnosisPrincipal, medication, dose, route, frequency, duration, instructions };
  const localDraft = useLocalDraft(userId, draftName, values, baseline);
  // A newer server version (realtime refresh) becomes the baseline; what the doctor typed stays as the local draft.
  useEffect(() => {
    const local = draftName ? loadDraft<ConsultationDraft>(userId, draftName) : null;
    setReason(local?.reason ?? server.reason); setPhysicalExam(local?.physicalExam ?? server.physicalExam); setPlan(local?.plan ?? server.plan);
    setBaseline(server); setVersion(item.version ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.consultationId, item.version, item.consultationReason, item.physicalExam, item.plan]);
  /** Leaving keeps the local draft; only when it could not be stored does the doctor confirm losing it. */
  function close() { if (localDraft.dirty && localDraft.status === 'sin_guardar' && !window.confirm('Tienes cambios sin guardar. Si sales ahora se perderán. ¿Salir de la consulta?')) return; onClose(); }
  async function start(e: FormEvent) { e.preventDefault(); if (await action.run('/consultas', { appointmentId: item.appointmentId, reason: reason.trim() || undefined })) onSaved(); }
  async function saveDraft(e: FormEvent) { e.preventDefault(); const result = await action.run(`/consultas/${item.consultationId}`, { version, reason, physicalExam, plan }, 'PATCH'); if (result) { setVersion((result as { version: number }).version); setBaseline({ reason, physicalExam, plan }); setNotice('Borrador guardado.'); } }
  async function sign() {
    const draft = await action.run(`/consultas/${item.consultationId}`, { version, reason, physicalExam, plan }, 'PATCH');
    if (!draft) return;
    const signedResult = await action.run(`/consultas/${item.consultationId}/firmar`, { version: (draft as { version: number }).version });
    if (signedResult) { localDraft.clear(); onSaved(); }
  }
  async function saveVitals() {
    if (!item.consultationId) return;
    const body = { systolic: numberOrUndefined(systolic), diastolic: numberOrUndefined(diastolic), heartRate: numberOrUndefined(heartRate), temperature: numberOrUndefined(temperature), oxygenSaturation: numberOrUndefined(oxygenSaturation) };
    setNotice(null);
    // WEB-09: lo escrito se conserva hasta que la API confirma; si falla, el error queda a la vista.
    const saved = await action.run(`/consultas/${item.consultationId}/signos`, body);
    if (!saved) return;
    setSystolic(''); setDiastolic(''); setHeartRate(''); setTemperature(''); setOxygenSaturation('');
    setNotice('Signos vitales registrados.');
  }
  async function saveDiagnosis() {
    if (!item.consultationId || !diagnosisCode.trim()) return;
    const saved = await action.run(`/consultas/${item.consultationId}/diagnosticos`, { code: diagnosisCode.trim(), note: diagnosisNote.trim() || undefined, principal: diagnosisPrincipal });
    if (saved) { setDiagnosisCode(''); setDiagnosisNote(''); setDiagnosisPrincipal(false); setNotice('Diagnóstico registrado.'); }
  }
  async function savePrescription() {
    if (!item.consultationId || !medication.trim() || !dose.trim() || !route.trim() || !frequency.trim() || !duration.trim()) return;
    const saved = await action.run(`/consultas/${item.consultationId}/receta`, { items: [{ medication: medication.trim(), dose: dose.trim(), route: route.trim(), frequency: frequency.trim(), duration: duration.trim(), instructions: instructions.trim() || undefined }] });
    if (saved) { setMedication(''); setDose(''); setRoute(''); setFrequency(''); setDuration(''); setInstructions(''); setNotice('Receta emitida.'); }
  }
  const existing = !!item.consultationId;
  return <Dialog title={signed ? 'Consulta firmada' : existing ? 'Continuar consulta' : 'Iniciar consulta'} onClose={close} busy={action.busy}><form className="module-form" onSubmit={existing ? saveDraft : start}><p>Paciente: <strong>{item.patientName}</strong><br />{item.ticketNumber != null ? `Número de fila N.º ${item.ticketNumber}` : item.appointmentId ? `Cita: ${formatDateTime(item.start)} · 20 minutos` : 'Consulta abierta'}</p><WriteError error={action.error} />{stored && !signed && <Notice kind="info">Recuperamos lo que escribiste y aún no habías guardado.</Notice>}{notice && !action.error && <Notice kind="success">{notice}</Notice>}{signed && <Notice kind="info">Esta consulta está firmada. Los cambios posteriores deben registrarse como addendum.</Notice>}<Field label="Motivo de consulta" value={reason} onChange={setReason} maxLength={2000} required disabled={signed} autoFocus={!signed} /><TextArea label="Examen físico" value={physicalExam} onChange={setPhysicalExam} disabled={signed} /><TextArea label="Plan" value={plan} onChange={setPlan} required={!signed} disabled={signed} />{existing && !signed && can(profile, 'consulta.registrar') && <section className="inline-form-section"><h3>Diagnóstico CIE-10</h3><div className="form-grid"><Field label="Código" value={diagnosisCode} onChange={setDiagnosisCode} maxLength={20} /><Field label="Nota" value={diagnosisNote} onChange={setDiagnosisNote} maxLength={2000} /></div><label className="check-field"><input type="checkbox" checked={diagnosisPrincipal} onChange={event => setDiagnosisPrincipal(event.target.checked)} /> Diagnóstico principal</label><button type="button" className="secondary-button" onClick={() => void saveDiagnosis()} disabled={action.busy || !diagnosisCode.trim()}>Registrar diagnóstico</button></section>}{existing && can(profile, 'signos.registrar') && <section className="inline-form-section"><h3>Signos vitales</h3><div className="form-grid"><Field label="PA sistólica" type="number" value={systolic} onChange={setSystolic} min={40} max={300} /><Field label="PA diastólica" type="number" value={diastolic} onChange={setDiastolic} min={20} max={200} /><Field label="Frecuencia cardiaca" type="number" value={heartRate} onChange={setHeartRate} min={20} max={250} /><Field label="Temperatura °C" type="number" value={temperature} onChange={setTemperature} min={30} max={45} step="0.1" /><Field label="Sat. O₂" type="number" value={oxygenSaturation} onChange={setOxygenSaturation} min={40} max={100} /></div><button type="button" className="secondary-button" onClick={() => void saveVitals()} disabled={action.busy || ![systolic, diastolic, heartRate, temperature, oxygenSaturation].some(Boolean)}>Registrar signos</button></section>}{existing && !signed && can(profile, 'recetas.emitir') && <section className="inline-form-section"><h3>Emitir receta</h3><div className="form-grid"><Field label="Medicamento" value={medication} onChange={setMedication} maxLength={200} /><Field label="Dosis" value={dose} onChange={setDose} maxLength={200} /><Field label="Vía" value={route} onChange={setRoute} maxLength={100} /><Field label="Frecuencia" value={frequency} onChange={setFrequency} maxLength={200} /><Field label="Duración" value={duration} onChange={setDuration} maxLength={100} /></div><TextArea label="Indicaciones" value={instructions} onChange={setInstructions} /><button type="button" className="secondary-button" onClick={() => void savePrescription()} disabled={action.busy || ![medication, dose, route, frequency, duration].every(value => value.trim())}>Emitir receta</button></section>}{existing && item.consultationId && can(profile, 'laboratorio.ordenar') && <LabOrderSection api={api} consultationId={item.consultationId} />}{localDraft.status === 'guardado' && <p className="muted" role="status">Borrador guardado en este equipo.</p>}{localDraft.status === 'sin_guardar' && <Notice kind="error">Tienes cambios sin guardar: este navegador no permitió guardar el borrador.</Notice>}{!signed && <div className="dialog-actions"><button type="button" className="secondary-button" onClick={close} disabled={action.busy}>Cancelar</button>{existing && <button type="button" className="secondary-button" onClick={() => void sign()} disabled={action.busy || !reason.trim() || !plan.trim()}>Firmar consulta</button>}<SaveButton busy={action.busy} label={existing ? 'Guardar borrador' : 'Iniciar consulta'} /></div>}{signed && <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>}</form></Dialog>;
}

/** Examen o panel activo de `GET /laboratorio/catalogo`. */
export type LabExam = { id: string; code: string; name: string; isPanel: boolean; unit?: string | null; resultType?: string | null };

/** REQ-04: la orden nace de la consulta (abierta o firmada) con exámenes del catálogo y su prioridad; la API la manda a la cola de Laboratorio. */
function LabOrderSection({ api, consultationId }: { api: Api; consultationId: string }) {
  const catalog = useData<LabExam[]>(api, '/laboratorio/catalogo', 0);
  const action = useAction(api);
  const [exams, setExams] = useState<string[]>([]), [priority, setPriority] = useState('rutina'), [sent, setSent] = useState(false);
  const toggle = (id: string, checked: boolean) => { setSent(false); setExams(current => checked ? [...current, id] : current.filter(value => value !== id)); };
  async function send() {
    setSent(false);
    // Lo elegido se conserva hasta que la API confirma la orden.
    if (await action.run('/laboratorio/ordenes', { consultationId, exams, priority })) { setExams([]); setPriority('rutina'); setSent(true); }
  }
  return <section className="inline-form-section" aria-labelledby={`lab-order-${consultationId}`}>
    <h3 id={`lab-order-${consultationId}`}>Orden de laboratorio</h3>
    <WriteError error={action.error} />
    {sent && !action.error && <Notice kind="success">Orden enviada al laboratorio. Aparecerá en la cola de Laboratorio.</Notice>}
    <RemoteState state={catalog}>{rows => rows.length ? <>
      <fieldset className="choice-list"><legend>Exámenes y paneles</legend>{rows.map(exam => <label className="check-field" key={exam.id}><input type="checkbox" checked={exams.includes(exam.id)} onChange={event => toggle(exam.id, event.target.checked)} disabled={action.busy} /> <span><strong>{exam.name}</strong> <small className="mono-data">{exam.code}{exam.isPanel ? ' · Panel' : exam.unit ? ` · ${exam.unit}` : ''}</small></span></label>)}</fieldset>
      <Select label="Prioridad" value={priority} onChange={value => { setSent(false); setPriority(value); }} disabled={action.busy}><option value="rutina">Rutina</option><option value="urgente">Urgente</option></Select>
      <button type="button" className="secondary-button" onClick={() => void send()} disabled={action.busy || exams.length === 0}>{action.busy ? 'Enviando…' : 'Enviar orden al laboratorio'}</button>
    </> : <Empty title="Sin exámenes disponibles" description="El catálogo de laboratorio no tiene exámenes activos." />}</RemoteState>
  </section>;
}

function numberOrUndefined(value: string) { const parsed = Number(value); return value.trim() && Number.isFinite(parsed) ? parsed : undefined; }
