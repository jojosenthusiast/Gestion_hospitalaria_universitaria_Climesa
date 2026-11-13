import { useState, type FormEvent } from 'react';
import { Icon, Notice } from '../components/ui';
import { can, type AccessProfile, type Api, type Patient } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, useAction, useData } from './common';

type QueueTicket = { id: string; service: string; fecha: string; numero: number; patientId?: string | null; patientName?: string | null; state: string; officeId?: string | null; llamados: number; version: number; issuedAt: string };
type Catalogs = { patients: Patient[] };
const serviceNames: Record<string, string> = { consulta_general: 'Consulta general', emergencia: 'Emergencia', laboratorio: 'Laboratorio', admisiones: 'Admisiones' };
const services = Object.entries(serviceNames);

export function QueuePage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [service, setService] = useState(''), [issueOpen, setIssueOpen] = useState(false);
  const data = useData<QueueTicket[]>(api, `/fila${service ? `?service=${encodeURIComponent(service)}` : ''}`, version, can(profile, 'fila.ver'));
  const manage = can(profile, 'fila.gestionar'), call = can(profile, 'fila.llamar');
  const action = useAction(api);
  async function transition(ticket: QueueTicket, path: string, method = 'POST', extra: Record<string, unknown> = {}) {
    if (await action.run(`/fila/${ticket.id}/${path}`, { version: ticket.version, ...extra }, method)) data.refresh();
  }
  return <>
    <Heading eyebrow="Atención / Flujo de llegada" title="Fila del día" description="Emisión, llamado y atención de pacientes sin confundir la fila con el horario de la cita." actions={can(profile, 'fila.emitir') && <button className="primary-button" onClick={() => setIssueOpen(true)}><Icon name="plus" size={18} />Emitir número</button>} />
    <section className="data-workbench">
      <div className="table-toolbar"><Select label="Servicio" value={service} onChange={setService}><option value="">Todos los servicios</option>{services.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></div>
      <WriteError error={action.error} />
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Fila del día</caption><thead><tr><th>Número</th><th>Paciente</th><th>Servicio</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{rows.map(ticket => <tr key={ticket.id}><td data-label="Número"><strong className="mono-data">{ticket.numero}</strong><small>{ticket.llamados} llamado(s)</small></td><td data-label="Paciente">{ticket.patientName || 'Paciente no identificado'}</td><td data-label="Servicio">{serviceNames[ticket.service] ?? ticket.service}</td><td data-label="Estado"><Tag value={ticket.state} /></td><td data-label="Acciones"><div className="row-actions">{call && ['en_espera', 'llamado'].includes(ticket.state) && <button className="row-action" disabled={action.busy} onClick={() => void transition(ticket, 'llamar')}>{ticket.state === 'llamado' ? 'Llamar de nuevo' : 'Llamar'} <Icon name="arrow" size={16} /></button>}{manage && ticket.state === 'llamado' && <button className="row-action" disabled={action.busy} onClick={() => void transition(ticket, 'atender')}>Iniciar atención</button>}{manage && ticket.state === 'en_atencion' && <button className="row-action" disabled={action.busy} onClick={() => void transition(ticket, 'completar')}>Completar</button>}{manage && ['en_espera', 'llamado'].includes(ticket.state) && <button className="row-action" disabled={action.busy} onClick={() => void transition(ticket, 'no-se-presento')}>No se presentó</button>}</div></td></tr>)}</tbody></table> : <Empty title="La fila está vacía" description="Los números emitidos para este día aparecerán aquí." />}</RemoteState>
    </section>
    {issueOpen && <IssueDialog api={api} profile={profile} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); data.refresh(); }} />}
  </>;
}

function IssueDialog({ api, profile, onClose, onSaved }: { api: Api; profile: AccessProfile; onClose: () => void; onSaved: () => void }) {
  const own = !!profile.patientId && !can(profile, 'fila.gestionar');
  const action = useAction(api); const [service, setService] = useState('consulta_general'); const [patientId, setPatientId] = useState('');
  const patients = useData<Catalogs>(api, '/citas/catalogos', 0, !own);
  async function save(event: FormEvent) { event.preventDefault(); const body = own ? { service } : { service, patientId }; if (await action.run('/fila', body)) onSaved(); }
  return <Dialog title="Emitir número de fila" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">La fila se asigna al llegar al hospital. Es independiente de la hora de la cita.</p><WriteError error={action.error} /><Select label="Servicio" value={service} onChange={setService} required>{services.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>{!own && <RemoteState state={patients}>{catalog => <Select label="Paciente" value={patientId} onChange={setPatientId} required><option value="">Selecciona un paciente</option>{catalog.patients.filter(patient => patient.active).map(patient => <option value={patient.id} key={patient.id}>{patient.fullName} · {patient.record}</option>)}</Select>}</RemoteState>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Emitir número" disabled={!own && !patientId} /></div></form></Dialog>;
}

