import { useEffect, useRef, useState } from 'react';
import { handOffPatientSearch } from './patient-handoff';
import { SearchPicker, type PickerItem, type PickerPage } from '../components/search-picker';
import { AreaTag, PriorityBadge, type Priority } from '../components/system';
import { Icon, Notice } from '../components/ui';
import { type Api } from '../lib/api';
import { SERVICE_AREA, localTime } from '../lib/queue-moves';
import { serviceNames } from './listas/queue-board';
import { Dialog, WriteError, useAction } from './common';
import './front-desk.css';

/**
 * R7 U1, journey B1 (odd/tasks/fase2-recorridos-auditoria.md): the front desk. One search; each result says whether
 * the patient has an appointment today or already holds a number (`GET /pacientes/selector`, B-2). With an
 * appointment the primary action is «Registrar llegada» (D-1: issues the number linked to the appointment); without
 * one, «Emitir número» with the service and priority as chips. The issued number stays on screen, large, with how
 * many wait before it, and «Anular» while the server allows it (B-3).
 */
export type DeskAppointment = { id: string; start: string; doctorId: string; doctorName: string };
export type DeskTicket = { id: string; service: string; numero: number; state: string; appointmentId: string | null };
export type DeskPatient = { id: string; record: string; fullName: string; age?: number | null; appointmentToday?: DeskAppointment | null; ticketToday?: DeskTicket | null };
export type IssuedNumber = { id: string; numero: number; service: string; area?: string; state: string; version: number; priority?: Priority; patientName?: string | null; appointmentId?: string | null; ahead?: number; voidableUntil?: string };

const SERVICES = Object.entries(serviceNames);
const PRIORITIES: Priority[] = ['rutina', 'urgente', 'emergencia'];
const PRIORITY_LABEL: Record<Priority, string> = { rutina: 'Rutina', urgente: 'Urgente', emergencia: 'Emergencia' };
const TICKET_STATE: Record<string, string> = { en_espera: 'en espera', llamado: 'llamado', en_atencion: 'en atención' };
export const deskCode = (ticket: { service: string; numero: number; area?: string }) => `${ticket.area ?? SERVICE_AREA[ticket.service] ?? 'GEN'} ${ticket.numero}`;
const aheadText = (ahead: number | undefined) => ahead === undefined ? '' : ahead === 0 ? 'Nadie antes' : ahead === 1 ? '1 antes' : `${ahead} antes`;

/** What the result line says under the name: the appointment of today or the live number. */
export function deskDetail(p: DeskPatient) {
  const parts = [`Expediente ${p.record}`];
  if (typeof p.age === 'number') parts.push(`${p.age} años`);
  if (p.ticketToday) parts.push(`Ya tiene ${deskCode(p.ticketToday)} (${TICKET_STATE[p.ticketToday.state] ?? p.ticketToday.state})`);
  else if (p.appointmentToday) parts.push(`Cita hoy ${localTime(p.appointmentToday.start)} con ${p.appointmentToday.doctorName}`);
  return parts.join(' · ');
}

/** Paged patient search that keeps the full result, so choosing a row knows its appointment and number of today. */
function useDeskSearch(api: Api) {
  const seen = useRef(new Map<string, DeskPatient>());
  const search = async (query: string, offset: number): Promise<PickerPage> => {
    const page = await api.request<{ items: DeskPatient[]; hasMore: boolean }>(`/pacientes/selector?query=${encodeURIComponent(query)}&limit=10&offset=${offset}`);
    for (const item of page.items) seen.current.set(item.id, item);
    return { hasMore: page.hasMore, items: page.items.map(p => ({ id: p.id, label: p.fullName, detail: deskDetail(p) })) };
  };
  return { search, of: (id: string | undefined) => (id ? seen.current.get(id) : undefined) };
}

export function FrontDeskDialog({ api, patientId, onClose, onIssued }: { api: Api; patientId?: string | null; onClose: () => void; onIssued: () => void }) {
  const desk = useDeskSearch(api);
  // B1: the text typed goes to «Registrar paciente nuevo» in memory, never in the address.
  const typed = useRef('');
  const action = useAction(api), voiding = useAction(api);
  const [picked, setPicked] = useState<PickerItem | null>(null), [patient, setPatient] = useState<DeskPatient | null>(null);
  const [service, setService] = useState('consulta_general'), [priority, setPriority] = useState<Priority>('rutina');
  const [issued, setIssued] = useState<IssuedNumber | null>(null), [voided, setVoided] = useState<IssuedNumber | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(!!patientId);

  // Opened from the patient record (`#/fila?accion=emitir&paciente=<id>`): the patient comes already chosen.
  useEffect(() => {
    if (!patientId) return;
    let active = true;
    (async () => {
      try {
        const record = await api.request<{ id: string; record: string; fullName: string }>(`/pacientes/${patientId}`);
        const page = await api.request<{ items: DeskPatient[] }>(`/pacientes/selector?query=${encodeURIComponent(record.record)}&limit=10&offset=0`);
        const found = page.items.find(p => p.id === patientId) ?? { id: record.id, record: record.record, fullName: record.fullName };
        if (active) { setPatient(found); setPicked({ id: found.id, label: found.fullName, detail: deskDetail(found) }); }
      } catch { /* the search stays empty; the person types the name */ }
      finally { if (active) setLoadingPatient(false); }
    })();
    return () => { active = false; };
  }, [api, patientId]);

  function choose(item: PickerItem | null) { setPicked(item); setPatient(item ? desk.of(item.id) ?? null : null); setIssued(null); setVoided(null); }
  async function issue(withAppointment: boolean) {
    if (!patient) return;
    const body = withAppointment && patient.appointmentToday
      ? { service: 'consulta_general', patientId: patient.id, appointmentId: patient.appointmentToday.id }
      : { service, patientId: patient.id, ...(priority !== 'rutina' ? { priority } : {}) };
    const result = await action.run<IssuedNumber>('/fila', body);
    if (result) { setIssued(result); setVoided(null); onIssued(); }
  }
  async function voidIssued() {
    if (!issued) return;
    const result = await voiding.run<{ version: number }>(`/fila/${issued.id}/anular`, { version: issued.version });
    if (result) { setVoided(issued); setIssued(null); onIssued(); }
  }
  function next() { setIssued(null); setVoided(null); setPicked(null); setPatient(null); setService('consulta_general'); setPriority('rutina'); }

  const busy = action.busy || voiding.busy;
  const appointment = patient?.appointmentToday ?? null, holding = patient?.ticketToday ?? null;
  return <Dialog title="Mostrador" onClose={onClose} busy={busy}>
    <div className="module-form fd-desk">
      {issued ? <IssuedCard issued={issued} appointment={appointment} busy={busy} onVoid={() => void voidIssued()} />
        : <>
          <SearchPicker label="Paciente" value={picked} onChange={choose} search={desk.search} autoFocus={!loadingPatient} onQueryChange={text => { typed.current = text; }} required disabled={loadingPatient}
            placeholder={loadingPatient ? 'Cargando paciente…' : 'Nombre, DUI o expediente'} emptyText="No hay pacientes con ese nombre, DUI o expediente." />
          {!picked && <p className="form-hint">¿No aparece? <a className="cl-link-button" href="#/pacientes?accion=registrar" onClick={() => handOffPatientSearch(typed.current)}>Registrar paciente nuevo</a></p>}
          {voided && <Notice kind="success">Se anuló {deskCode(voided)}. Puedes emitir otro número.</Notice>}
          <WriteError error={action.error} />
          {patient && holding && <Notice kind="info">{patient.fullName} ya tiene el número {deskCode(holding)} ({TICKET_STATE[holding.state] ?? holding.state}). No hace falta otro.</Notice>}
          {patient && !holding && appointment && <section className="fd-arrival" aria-label="Cita de hoy">
            <p><Icon name="clock" size={16} /> Cita hoy a las <strong>{localTime(appointment.start)}</strong> con {appointment.doctorName}</p>
            <button type="button" className="primary-button fd-primary" disabled={busy} onClick={() => void issue(true)}>{action.busy ? 'Registrando…' : 'Registrar llegada'}{action.busy ? <span className="spinner" /> : <Icon name="arrow" size={18} />}</button>
            <details className="fd-other"><summary>Emitir otro número sin la cita</summary><ServiceChoice service={service} priority={priority} onService={setService} onPriority={setPriority} />
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void issue(false)}>Emitir número</button></details>
          </section>}
          {patient && !holding && !appointment && <section className="fd-walkin" aria-label="Emitir número">
            <ServiceChoice service={service} priority={priority} onService={setService} onPriority={setPriority} />
            <button type="button" className="primary-button fd-primary" disabled={busy} onClick={() => void issue(false)}>{action.busy ? 'Emitiendo…' : 'Emitir número'}{action.busy ? <span className="spinner" /> : <Icon name="arrow" size={18} />}</button>
          </section>}
        </>}
      <WriteError error={voiding.error} />
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cerrar</button>
        {issued && <button type="button" className="primary-button" onClick={next} disabled={busy}>Siguiente paciente<Icon name="arrow" size={18} /></button>}
      </div>
    </div>
  </Dialog>;
}

function ServiceChoice({ service, priority, onService, onPriority }: { service: string; priority: Priority; onService: (value: string) => void; onPriority: (value: Priority) => void }) {
  return <>
    <fieldset className="fd-chips"><legend>Servicio</legend>{SERVICES.map(([value, label]) => <label key={value} className={`fd-chip${service === value ? ' is-on' : ''}`}><input type="radio" name="fd-servicio" value={value} checked={service === value} onChange={() => onService(value)} />{label}</label>)}</fieldset>
    <fieldset className="fd-chips"><legend>Prioridad</legend>{PRIORITIES.map(value => <label key={value} className={`fd-chip${priority === value ? ' is-on' : ''}`}><input type="radio" name="fd-prioridad" value={value} checked={priority === value} onChange={() => onPriority(value)} aria-label={PRIORITY_LABEL[value]} /><PriorityBadge value={value} /></label>)}</fieldset>
  </>;
}

/** Break #5: the number just issued, large, where it was issued. «Anular» only while the server allows it (10 min). */
function IssuedCard({ issued, appointment, busy, onVoid }: { issued: IssuedNumber; appointment: DeskAppointment | null; busy: boolean; onVoid: () => void }) {
  const [, setTick] = useState(0);
  const until = issued.voidableUntil ? Date.parse(issued.voidableUntil) : 0;
  useEffect(() => { if (!until) return; const left = until - Date.now(); if (left <= 0) return; const timer = setTimeout(() => setTick(v => v + 1), left); return () => clearTimeout(timer); }, [until]);
  const voidable = until > Date.now();
  return <section className="fd-issued" role="status" aria-live="polite" aria-label="Número emitido">
    <div className="fd-issued-number"><AreaTag code={issued.area ?? SERVICE_AREA[issued.service] ?? 'GEN'} /><strong className="mono-data">{issued.numero}</strong></div>
    <div className="fd-issued-who">
      <strong>{issued.patientName ?? 'Paciente'}</strong>
      <span>{serviceNames[issued.service] ?? issued.service} · {aheadText(issued.ahead)}</span>
      {issued.appointmentId && appointment && <span className="qb-cita"><Icon name="clock" size={14} />Llegada registrada · cita {localTime(appointment.start)} con {appointment.doctorName}</span>}
      {issued.priority && issued.priority !== 'rutina' && <PriorityBadge value={issued.priority} />}
    </div>
    {voidable && <button type="button" className="danger-link" disabled={busy} onClick={onVoid}>Anular este número</button>}
  </section>;
}
