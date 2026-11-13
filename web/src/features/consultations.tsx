import { useEffect, useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { ClinicalHistoryDialog } from './clinical-history';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';

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
};

export function ConsultationsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Consultation[]>(api, '/consultas/agenda', version, can(profile, 'consulta.iniciar'));
  const [selected, setSelected] = useState<Consultation | null>(null), [history, setHistory] = useState<Consultation | null>(null);
  const historyAllowed = can(profile, 'expediente.ver');
  return <>
    <Heading eyebrow="Atención / Medicina" title="Mi consultorio" description="Agenda propia, consultas abiertas y cierre clínico de cada cita." />
    <section className="data-workbench">
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Agenda del médico</caption><thead><tr><th>Horario</th><th>Paciente</th><th>Cita</th><th>Consulta</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.appointmentId}><td data-label="Horario"><strong>{formatDateTime(row.start)}</strong><small>{formatDateTime(row.end)}</small></td><td data-label="Paciente">{row.patientName}</td><td data-label="Cita"><Tag value={row.appointmentState} /></td><td data-label="Consulta"><Tag value={row.consultationState ?? 'pendiente'} /></td><td data-label="Acción"><div className="row-actions"><button className="row-action" onClick={() => setSelected(row)}>{row.consultationState === 'firmada' ? 'Ver consulta' : row.consultationId ? 'Continuar' : 'Iniciar consulta'} <Icon name="arrow" size={16} /></button>{historyAllowed && <button className="row-action" aria-label={`Historial clínico de ${row.patientName}`} onClick={() => setHistory(row)}>Historial</button>}</div></td></tr>)}</tbody></table> : <Empty title="No hay citas en tu agenda" description="Las citas confirmadas aparecerán aquí para iniciar su atención." />}</RemoteState>
    </section>
    {history && <ClinicalHistoryDialog api={api} profile={profile} patientId={history.patientId} patientName={history.patientName} agenda={data.data ?? []} version={version} onClose={() => setHistory(null)} />}
    {selected && <ConsultationDialog api={api} profile={profile} item={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); data.refresh(); }} />}
  </>;
}

function TextArea({ label, value, onChange, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean }) {
  return <label className="field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled} rows={4} maxLength={10000} /></label>;
}

function ConsultationDialog({ api, profile, item, onClose, onSaved }: { api: Api; profile: AccessProfile; item: Consultation; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(item.consultationReason ?? item.reason ?? ''), [physicalExam, setPhysicalExam] = useState(item.physicalExam ?? ''), [plan, setPlan] = useState(item.plan ?? '');
  const [systolic, setSystolic] = useState(''), [diastolic, setDiastolic] = useState(''), [heartRate, setHeartRate] = useState(''), [temperature, setTemperature] = useState(''), [oxygenSaturation, setOxygenSaturation] = useState('');
  const [diagnosisCode, setDiagnosisCode] = useState(''), [diagnosisNote, setDiagnosisNote] = useState(''), [diagnosisPrincipal, setDiagnosisPrincipal] = useState(false);
  const [medication, setMedication] = useState(''), [dose, setDose] = useState(''), [route, setRoute] = useState(''), [frequency, setFrequency] = useState(''), [duration, setDuration] = useState(''), [instructions, setInstructions] = useState('');
  const [version, setVersion] = useState(item.version ?? 1), [notice, setNotice] = useState<string | null>(null);
  const action = useAction(api);
  const signed = item.consultationState === 'firmada';
  useEffect(() => { setReason(item.consultationReason ?? item.reason ?? ''); setPhysicalExam(item.physicalExam ?? ''); setPlan(item.plan ?? ''); setVersion(item.version ?? 1); }, [item]);
  async function start(e: FormEvent) { e.preventDefault(); if (await action.run('/consultas', { appointmentId: item.appointmentId, reason: reason.trim() || undefined })) onSaved(); }
  async function saveDraft(e: FormEvent) { e.preventDefault(); const result = await action.run(`/consultas/${item.consultationId}`, { version, reason, physicalExam, plan }, 'PATCH'); if (result) { setVersion((result as { version: number }).version); } }
  async function sign() {
    const draft = await action.run(`/consultas/${item.consultationId}`, { version, reason, physicalExam, plan }, 'PATCH');
    if (!draft) return;
    const signedResult = await action.run(`/consultas/${item.consultationId}/firmar`, { version: (draft as { version: number }).version });
    if (signedResult) onSaved();
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
  return <Dialog title={signed ? 'Consulta firmada' : existing ? 'Continuar consulta' : 'Iniciar consulta'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={existing ? saveDraft : start}><p>Paciente: <strong>{item.patientName}</strong><br />Cita: {formatDateTime(item.start)} · 20 minutos</p><WriteError error={action.error} />{notice && !action.error && <Notice kind="success">{notice}</Notice>}{signed && <Notice kind="info">Esta consulta está firmada. Los cambios posteriores deben registrarse como addendum.</Notice>}<Field label="Motivo de consulta" value={reason} onChange={setReason} maxLength={2000} required disabled={signed} autoFocus={!signed} /><TextArea label="Examen físico" value={physicalExam} onChange={setPhysicalExam} disabled={signed} /><TextArea label="Plan" value={plan} onChange={setPlan} required={!signed} disabled={signed} />{existing && !signed && can(profile, 'consulta.registrar') && <section className="inline-form-section"><h3>Diagnóstico CIE-10</h3><div className="form-grid"><Field label="Código" value={diagnosisCode} onChange={setDiagnosisCode} maxLength={20} /><Field label="Nota" value={diagnosisNote} onChange={setDiagnosisNote} maxLength={2000} /></div><label className="check-field"><input type="checkbox" checked={diagnosisPrincipal} onChange={event => setDiagnosisPrincipal(event.target.checked)} /> Diagnóstico principal</label><button type="button" className="secondary-button" onClick={() => void saveDiagnosis()} disabled={action.busy || !diagnosisCode.trim()}>Registrar diagnóstico</button></section>}{existing && can(profile, 'signos.registrar') && <section className="inline-form-section"><h3>Signos vitales</h3><div className="form-grid"><Field label="PA sistólica" type="number" value={systolic} onChange={setSystolic} min={40} max={300} /><Field label="PA diastólica" type="number" value={diastolic} onChange={setDiastolic} min={20} max={200} /><Field label="Frecuencia cardiaca" type="number" value={heartRate} onChange={setHeartRate} min={20} max={250} /><Field label="Temperatura °C" type="number" value={temperature} onChange={setTemperature} min={30} max={45} step="0.1" /><Field label="Sat. O₂" type="number" value={oxygenSaturation} onChange={setOxygenSaturation} min={40} max={100} /></div><button type="button" className="secondary-button" onClick={() => void saveVitals()} disabled={action.busy || ![systolic, diastolic, heartRate, temperature, oxygenSaturation].some(Boolean)}>Registrar signos</button></section>}{existing && !signed && can(profile, 'recetas.emitir') && <section className="inline-form-section"><h3>Emitir receta</h3><div className="form-grid"><Field label="Medicamento" value={medication} onChange={setMedication} maxLength={200} /><Field label="Dosis" value={dose} onChange={setDose} maxLength={200} /><Field label="Vía" value={route} onChange={setRoute} maxLength={100} /><Field label="Frecuencia" value={frequency} onChange={setFrequency} maxLength={200} /><Field label="Duración" value={duration} onChange={setDuration} maxLength={100} /></div><TextArea label="Indicaciones" value={instructions} onChange={setInstructions} /><button type="button" className="secondary-button" onClick={() => void savePrescription()} disabled={action.busy || ![medication, dose, route, frequency, duration].every(value => value.trim())}>Emitir receta</button></section>}{existing && item.consultationId && can(profile, 'laboratorio.ordenar') && <LabOrderSection api={api} consultationId={item.consultationId} />}{!signed && <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button>{existing && <button type="button" className="secondary-button" onClick={() => void sign()} disabled={action.busy || !reason.trim() || !plan.trim()}>Firmar consulta</button>}<SaveButton busy={action.busy} label={existing ? 'Guardar borrador' : 'Iniciar consulta'} /></div>}{signed && <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>}</form></Dialog>;
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
