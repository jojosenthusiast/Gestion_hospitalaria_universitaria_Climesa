import { useState, type FormEvent } from 'react';
import { ExportMenu } from '../components/export-menu';
import { SearchPicker, type PickerItem } from '../components/search-picker';
import { Icon } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { patientPicker } from './appointments';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { COLUMNS, COLUMN_LABEL, COLUMN_TONE, boardSummary, columnOf, serviceNames, sortColumn, waitLevel, waitMinutes, type BoardTicket, type Column } from './listas/queue-board';
import './listas/lists.css';

type QueueTicket = BoardTicket & { fecha: string; patientId?: string | null; officeId?: string | null; version: number; consultationId?: string | null; consultationState?: string | null };
const services = Object.entries(serviceNames);
const finalNames: Record<string, string> = { atendido: 'Atendido', no_se_presento: 'No se presentó' };
const minutesText = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;

export function QueuePage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [service, setService] = useState('todos'), [query, setQuery] = useState(''), [issueOpen, setIssueOpen] = useState(false);
  const data = useData<QueueTicket[]>(api, '/fila', version, can(profile, 'fila.ver'));
  const manage = can(profile, 'fila.gestionar'), call = can(profile, 'fila.llamar'), issue = can(profile, 'fila.emitir');
  const readOnly = !manage && !call && !issue;
  const action = useAction(api);
  async function transition(ticket: QueueTicket, path: string, method = 'POST', extra: Record<string, unknown> = {}) {
    if (await action.run(`/fila/${ticket.id}/${path}`, { version: ticket.version, ...extra }, method)) data.refresh();
  }
  // El reloj se lee al pintar; cada evento en vivo vuelve a pintar el tablero (sin temporizadores).
  const now = Date.now();
  const filters = [...(service !== 'todos' ? [{ key: 'servicio', label: serviceNames[service] ?? service, remove: () => setService('todos') }] : []), ...(query.trim() ? [{ key: 'texto', label: `«${query.trim()}»`, remove: () => setQuery('') }] : [])];
  return <>
    <Heading eyebrow="Atención / Flujo de llegada" title="Fila del día" description="Emisión, llamado y atención de pacientes sin confundir la fila con el horario de la cita." actions={issue && <button className="primary-button" onClick={() => setIssueOpen(true)}><Icon name="plus" size={18} />Emitir número</button>} />
    <section className="data-workbench" aria-label="Tablero de la fila">
      <RemoteState state={data}>{all => {
        const visible = all.filter(t => (service === 'todos' || t.service === service) && matches(query, String(t.numero), t.patientName, serviceNames[t.service]));
        const summary = boardSummary(visible, now);
        const exportTable = () => ({ filename: 'fila-del-dia', title: 'Fila del día', subtitle: `${visible.length} números`, columns: ['Número', 'Servicio', 'Paciente', 'Estado', 'Llamados', 'Emitido', 'Espera'], rows: visible.map(t => [t.numero, serviceNames[t.service] ?? t.service, t.patientName ?? 'Paciente no identificado', COLUMN_LABEL[columnOf(t)], t.llamados, formatDateTime(t.issuedAt), minutesText(waitMinutes(t, now))]) });
        return <>
          {readOnly && <p className="qb-readonly"><Icon name="eye" size={18} />Vista de solo lectura: aquí sigues la fila, pero llamar y atender corresponde a Recepción, Asistencia y Medicina.</p>}
          <ListToolbar trailing={<ExportMenu table={exportTable} disabled={!visible.length} />}><LiveSearch label="Buscar en la fila" placeholder="Número o paciente" value={query} onChange={setQuery} /></ListToolbar>
          <div className="cl-filter-row"><span className="cl-filter-label">Servicio</span><ChipGroup label="Servicio" value={service} onChange={setService} options={[{ value: 'todos', label: 'Todos', count: all.length }, ...services.map(([value, label]) => ({ value, label, count: all.filter(t => t.service === value).length }))]} /></div>
          <ActiveFilters filters={filters} onClear={() => { setService('todos'); setQuery(''); }} />
          <div className="qb-counts" aria-label="Resumen de la fila">{COLUMNS.map(column => <div key={column} className={`qb-count tone-${COLUMN_TONE[column]}`}><strong>{summary.counts[column]}</strong><span>{COLUMN_LABEL[column]}</span></div>)}
            <div className="qb-count tone-muted"><strong>{summary.averageWait} min</strong><span>Espera promedio · máxima {minutesText(summary.longestWait)}</span></div></div>
          <WriteError error={action.error} onReload={data.refresh} reloadLabel="Recargar la fila" />
          {visible.length ? <div className="qb-board">{COLUMNS.map(column => <Lane key={column} column={column} tickets={sortColumn(visible.filter(t => columnOf(t) === column), column)} now={now} busy={action.busy} call={call} manage={manage} onTransition={transition} />)}</div>
            : <Empty title={all.length ? 'Ningún número coincide con los filtros' : 'La fila está vacía'} description={all.length ? 'Quita algún filtro para ver todos los números del día.' : 'Los números emitidos para este día aparecerán aquí.'} />}
        </>;
      }}</RemoteState>
    </section>
    {issueOpen && <IssueDialog api={api} profile={profile} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); data.refresh(); }} />}
  </>;
}

function Lane({ column, tickets, now, busy, call, manage, onTransition }: { column: Column; tickets: QueueTicket[]; now: number; busy: boolean; call: boolean; manage: boolean; onTransition: (ticket: QueueTicket, path: string) => Promise<void> }) {
  return <section className="qb-column" aria-label={COLUMN_LABEL[column]}><h3><span>{COLUMN_LABEL[column]}</span><span className={`cl-stage tone-${COLUMN_TONE[column]}`}>{tickets.length}</span></h3>
    {tickets.length ? <ul>{tickets.map(ticket => <li key={ticket.id} className="qb-ticket">
      <div className="qb-ticket-head"><strong className="qb-number mono-data">{ticket.numero}</strong>{waitLevel(ticket, now) !== 'none' ? <span className={`qb-wait sla-${waitLevel(ticket, now)}`}>Espera {minutesText(waitMinutes(ticket, now))}</span> : <span className="qb-wait sla-none">{formatDateTime(ticket.issuedAt)}</span>}</div>
      <span>{ticket.patientName || 'Paciente no identificado'}</span>
      <small>{serviceNames[ticket.service] ?? ticket.service}{ticket.llamados ? ` · ${ticket.llamados} llamado(s)` : ''}</small>
      {column === 'cerrado' ? <Tag value={ticket.state} label={finalNames[ticket.state]} /> : null}
      <div className="row-actions">
        {call && ['en_espera', 'llamado'].includes(ticket.state) && <button className="row-action" disabled={busy} onClick={() => void onTransition(ticket, 'llamar')}>{ticket.state === 'llamado' ? 'Llamar de nuevo' : 'Llamar'} <Icon name="arrow" size={16} /></button>}
        {manage && ticket.state === 'llamado' && <button className="row-action" disabled={busy} onClick={() => void onTransition(ticket, 'atender')}>Iniciar atención</button>}
        {ticket.state === 'en_atencion' && ticket.consultationId && ticket.consultationState === 'abierta' && <a className="row-action" href={`#/consultas?consulta=${ticket.consultationId}`}>Retomar consulta <Icon name="arrow" size={16} /></a>}
        {manage && ticket.state === 'en_atencion' && <button className="row-action" disabled={busy} onClick={() => void onTransition(ticket, 'completar')}>Completar</button>}
        {manage && ['en_espera', 'llamado'].includes(ticket.state) && <button className="row-action" disabled={busy} onClick={() => void onTransition(ticket, 'no-se-presento')}>No se presentó</button>}
      </div></li>)}</ul> : <p className="muted">Nadie por ahora.</p>}</section>;
}

function IssueDialog({ api, profile, onClose, onSaved }: { api: Api; profile: AccessProfile; onClose: () => void; onSaved: () => void }) {
  const own = !!profile.patientId && !can(profile, 'fila.gestionar');
  const action = useAction(api); const [service, setService] = useState('consulta_general'); const [patient, setPatient] = useState<PickerItem | null>(null);
  async function save(event: FormEvent) { event.preventDefault(); const body = own ? { service } : { service, patientId: patient?.id }; if (await action.run('/fila', body)) onSaved(); }
  return <Dialog title="Emitir número de fila" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">La fila se asigna al llegar al hospital. Es independiente de la hora de la cita.</p><WriteError error={action.error} onReload={onSaved} /><Select label="Servicio" value={service} onChange={setService} required>{services.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>{!own && <SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." />}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Emitir número" disabled={!own && !patient} /></div></form></Dialog>;
}
