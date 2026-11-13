import { useEffect, useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData } from './common';

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
  const [selected, setSelected] = useState<Consultation | null>(null);
  return <>
    <Heading eyebrow="Atención / Medicina" title="Mi consultorio" description="Agenda propia, consultas abiertas y cierre clínico de cada cita." />
    <section className="data-workbench">
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Agenda del médico</caption><thead><tr><th>Horario</th><th>Paciente</th><th>Cita</th><th>Consulta</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.appointmentId}><td data-label="Horario"><strong>{formatDateTime(row.start)}</strong><small>{formatDateTime(row.end)}</small></td><td data-label="Paciente">{row.patientName}</td><td data-label="Cita"><Tag value={row.appointmentState} /></td><td data-label="Consulta"><Tag value={row.consultationState ?? 'pendiente'} /></td><td data-label="Acción"><button className="row-action" onClick={() => setSelected(row)}>{row.consultationState === 'firmada' ? 'Ver consulta' : row.consultationId ? 'Continuar' : 'Iniciar consulta'} <Icon name="arrow" size={16} /></button></td></tr>)}</tbody></table> : <Empty title="No hay citas en tu agenda" description="Las citas confirmadas aparecerán aquí para iniciar su atención." />}</RemoteState>
    </section>
    {selected && <ConsultationDialog api={api} profile={profile} item={selected} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); data.refresh(); }} />}
  </>;
}

function TextArea({ label, value, onChange, required = false, disabled = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean }) {
  return <label className="field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} required={required} disabled={disabled} rows={4} maxLength={10000} /></label>;
}

function ConsultationDialog({ api, profile, item, onClose, onSaved }: { api: Api; profile: AccessProfile; item: Consultation; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(item.consultationReason ?? item.reason ?? ''), [physicalExam, setPhysicalExam] = useState(item.physicalExam ?? ''), [plan, setPlan] = useState(item.plan ?? '');
  const [systolic, setSystolic] = useState(''), [diastolic, setDiastolic] = useState(''), [heartRate, setHeartRate] = useState(''), [temperature, setTemperature] = useState(''), [oxygenSaturation, setOxygenSaturation] = useState('');
  const [version, setVersion] = useState(item.version ?? 1);
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
    await action.run(`/consultas/${item.consultationId}/signos`, body);
    setSystolic(''); setDiastolic(''); setHeartRate(''); setTemperature(''); setOxygenSaturation('');
  }
  const existing = !!item.consultationId;
  return <Dialog title={signed ? 'Consulta firmada' : existing ? 'Continuar consulta' : 'Iniciar consulta'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={existing ? saveDraft : start}><p>Paciente: <strong>{item.patientName}</strong><br />Cita: {formatDateTime(item.start)} · 20 minutos</p><WriteError error={action.error} />{signed && <Notice kind="info">Esta consulta está firmada. Los cambios posteriores deben registrarse como addendum.</Notice>}<Field label="Motivo de consulta" value={reason} onChange={setReason} maxLength={2000} required disabled={signed} autoFocus={!signed} /><TextArea label="Examen físico" value={physicalExam} onChange={setPhysicalExam} disabled={signed} /><TextArea label="Plan" value={plan} onChange={setPlan} required={!signed} disabled={signed} />{existing && can(profile, 'signos.registrar') && <section className="inline-form-section"><h3>Signos vitales</h3><div className="form-grid"><Field label="PA sistólica" type="number" value={systolic} onChange={setSystolic} min={40} max={300} /><Field label="PA diastólica" type="number" value={diastolic} onChange={setDiastolic} min={20} max={200} /><Field label="Frecuencia cardiaca" type="number" value={heartRate} onChange={setHeartRate} min={20} max={250} /><Field label="Temperatura °C" type="number" value={temperature} onChange={setTemperature} min={30} max={45} step="0.1" /><Field label="Sat. O₂" type="number" value={oxygenSaturation} onChange={setOxygenSaturation} min={40} max={100} /></div><button type="button" className="secondary-button" onClick={() => void saveVitals()} disabled={action.busy || ![systolic, diastolic, heartRate, temperature, oxygenSaturation].some(Boolean)}>Registrar signos</button></section>}{!signed && <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button>{existing && <button type="button" className="secondary-button" onClick={() => void sign()} disabled={action.busy || !reason.trim() || !plan.trim()}>Firmar consulta</button>}<SaveButton busy={action.busy} label={existing ? 'Guardar borrador' : 'Iniciar consulta'} /></div>}{signed && <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>}</form></Dialog>;
}

function numberOrUndefined(value: string) { const parsed = Number(value); return value.trim() && Number.isFinite(parsed) ? parsed : undefined; }
