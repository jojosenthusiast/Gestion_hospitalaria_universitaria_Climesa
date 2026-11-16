import { useEffect, useState, type FormEvent } from 'react';
import { ExportMenu } from '../components/export-menu';
import { SearchPicker, type PickerItem } from '../components/search-picker';
import { Icon } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { patientPicker } from './appointments';
import { useQuickAction } from './personal/accion';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { COLUMNS, COLUMN_LABEL, COLUMN_TONE, boardSummary, columnOf, serviceNames, sortColumn, waitLevel, waitMinutes, type BoardTicket, type Column } from './listas/queue-board';
import './listas/lists.css';

type QueueAction = 'llamar' | 'atender' | 'completar' | 'no_se_presento';
/** FILA-01/CITA-04: the server says which actions the reader may take now (`allowedActions`) and why the others are blocked. */
type QueueTicket = BoardTicket & { fecha: string; patientId?: string | null; officeId?: string | null; version: number; consultationId?: string | null; consultationState?: string | null;
  maxCalls?: number; callsForAbsence?: number; allowedActions?: QueueAction[]; blockedActions?: { action: QueueAction; reason: string }[] };
const services = Object.entries(serviceNames);
const finalNames: Record<string, string> = { atendido: 'Atendido', no_se_presento: 'No se presentó', cerrado: 'Cerrado sin atender' };
const actionPath: Record<QueueAction, string> = { llamar: 'llamar', atender: 'atender', completar: 'completar', no_se_presento: 'no-se-presento' };
const minutesText = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;

export function QueuePage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [service, setService] = useState('todos'), [query, setQuery] = useState(''), [issueOpen, setIssueOpen] = useState(false);
  const data = useData<QueueTicket[]>(api, '/fila', version, can(profile, 'fila.ver'));
  const manage = can(profile, 'fila.gestionar'), call = can(profile, 'fila.llamar'), issue = can(profile, 'fila.emitir');
  const readOnly = !manage && !call && !issue;
  const action = useAction(api);
  // Quick actions from the dashboards: `emitir` opens the issue form; `llamar` lands here, where the service is chosen.
  const [quick, consumeQuick] = useQuickAction();
  useEffect(() => { if (quick === 'emitir' && issue) setIssueOpen(true); if (quick) consumeQuick(); }, [quick, issue, consumeQuick]);
  async function transition(ticket: QueueTicket, path: string, method = 'POST', extra: Record<string, unknown> = {}) {
    if (await action.run(`/fila/${ticket.id}/${path}`, { version: ticket.version, ...extra }, method)) data.refresh();
  }
  /** FILA-02: the server picks the first waiting number of the service (arrival order). */
  async function callNext(serviceCode: string) {
    if (await action.run('/fila/llamar-siguiente', { service: serviceCode })) data.refresh();
  }
  // El reloj se lee al pintar; cada evento en vivo vuelve a pintar el tablero (sin temporizadores).
  const now = Date.now();
  const filters = [...(service !== 'todos' ? [{ key: 'servicio', label: serviceNames[service] ?? service, remove: () => setService('todos') }] : []), ...(query.trim() ? [{ key: 'texto', label: `«${query.trim()}»`, remove: () => setQuery('') }] : [])];
  return <>
    <CompactHeader breadcrumb="Atención / Flujo de llegada" title="Fila del día" actions={issue && <button className="primary-button" onClick={() => setIssueOpen(true)}><Icon name="plus" size={18}/>Emitir número</button>}/>
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
          {call && service !== 'todos' && <div className="row-actions"><button className="primary-button" disabled={action.busy || !all.some(t => t.service === service && t.state === 'en_espera')} onClick={() => void callNext(service)}><Icon name="arrow" size={18} />Llamar siguiente</button></div>}
          {call && service === 'todos' && <p className="muted">Elige un servicio para llamar al siguiente número en espera.</p>}
          <div className="qb-counts" aria-label="Resumen de la fila">{COLUMNS.map(column => <div key={column} className={`qb-count tone-${COLUMN_TONE[column]}`}><strong>{summary.counts[column]}</strong><span>{COLUMN_LABEL[column]}</span></div>)}
            <div className="qb-count tone-muted"><strong>{summary.averageWait} min</strong><span>Espera promedio · máxima {minutesText(summary.longestWait)}</span></div></div>
          <WriteError error={action.error} onReload={data.refresh} reloadLabel="Recargar la fila" />
          {visible.length ? <div className="qb-board">{COLUMNS.map(column => <Lane key={column} column={column} tickets={sortColumn(visible.filter(t => columnOf(t) === column), column)} now={now} busy={action.busy} call={call} onTransition={transition} />)}</div>
            : <Empty title={all.length ? 'Ningún número coincide con los filtros' : 'La fila está vacía'} description={all.length ? 'Quita algún filtro para ver todos los números del día.' : 'Los números emitidos para este día aparecerán aquí.'} />}
        </>;
      }}</RemoteState>
    </section>
    {issueOpen && <IssueDialog api={api} profile={profile} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); data.refresh(); }} />}
  </>;
}

const actionLabel = (ticket: QueueTicket, action: QueueAction) => ({ llamar: ticket.state === 'llamado' ? 'Llamar de nuevo' : 'Llamar', atender: 'Iniciar atención', completar: 'Completar', no_se_presento: 'No se presentó' })[action];
const ACTION_ORDER: QueueAction[] = ['llamar', 'atender', 'completar', 'no_se_presento'];

/** Actual state of the number: waiting, called N of M times, or in attention. */
function stateText(ticket: QueueTicket, call: boolean) {
  if (ticket.state === 'en_espera') return call ? 'En espera' : 'Esperando a que el médico llame';
  if (ticket.state === 'llamado') return `Llamado ${ticket.llamados}${ticket.maxCalls ? ` de ${ticket.maxCalls}` : ''} ${ticket.llamados === 1 ? 'vez' : 'veces'}`;
  if (ticket.state === 'en_atencion') return 'Presente, en atención';
  return finalNames[ticket.state] ?? ticket.state;
}

function Lane({ column, tickets, now, busy, call, onTransition }: { column: Column; tickets: QueueTicket[]; now: number; busy: boolean; call: boolean; onTransition: (ticket: QueueTicket, path: string) => Promise<void> }) {
  return <section className="qb-column" aria-label={COLUMN_LABEL[column]}><h3><span>{COLUMN_LABEL[column]}</span><span className={`cl-stage tone-${COLUMN_TONE[column]}`}>{tickets.length}</span></h3>
    {tickets.length ? <ul>{tickets.map(ticket => {
      const allowed = ticket.allowedActions ?? [];
      const blocked = ticket.blockedActions ?? [];
      return <li key={ticket.id} className="qb-ticket">
      <div className="qb-ticket-head"><strong className="qb-number mono-data">{ticket.numero}</strong>{waitLevel(ticket, now) !== 'none' ? <span className={`qb-wait sla-${waitLevel(ticket, now)}`}>Espera {minutesText(waitMinutes(ticket, now))}</span> : <span className="qb-wait sla-none">{formatDateTime(ticket.issuedAt)}</span>}</div>
      <span>{ticket.patientName || 'Paciente no identificado'}</span>
      <small>{serviceNames[ticket.service] ?? ticket.service} · {stateText(ticket, call)}</small>
      {column === 'cerrado' ? <Tag value={ticket.state} label={finalNames[ticket.state]} /> : null}
      <div className="row-actions">
        {ACTION_ORDER.map(name => allowed.includes(name)
          ? <button key={name} className="row-action" disabled={busy} onClick={() => void onTransition(ticket, actionPath[name])}>{actionLabel(ticket, name)}{name === 'llamar' && <> <Icon name="arrow" size={16} /></>}</button>
          : blocked.find(item => item.action === name) ? <button key={name} className="row-action" disabled title={blocked.find(item => item.action === name)!.reason}>{actionLabel(ticket, name)}</button> : null)}
        {ticket.state === 'en_atencion' && ticket.consultationId && ticket.consultationState === 'abierta' && <a className="row-action" href={`#/consultas?consulta=${ticket.consultationId}`}>Retomar consulta <Icon name="arrow" size={16} /></a>}
      </div>
      {blocked.map(item => <small key={item.action} className="form-hint">{actionLabel(ticket, item.action)}: {item.reason}</small>)}
      </li>;
    })}</ul> : <p className="muted">Nadie por ahora.</p>}</section>;
}

function IssueDialog({ api, profile, onClose, onSaved }: { api: Api; profile: AccessProfile; onClose: () => void; onSaved: () => void }) {
  const own = !!profile.patientId && !can(profile, 'fila.gestionar');
  const action = useAction(api); const [service, setService] = useState('consulta_general'); const [patient, setPatient] = useState<PickerItem | null>(null);
  async function save(event: FormEvent) { event.preventDefault(); const body = own ? { service } : { service, patientId: patient?.id }; if (await action.run('/fila', body)) onSaved(); }
  return <Dialog title="Emitir número de fila" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">La fila se asigna al llegar al hospital. Es independiente de la hora de la cita.</p><WriteError error={action.error} onReload={onSaved} /><Select label="Servicio" value={service} onChange={setService} required>{services.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>{!own && <SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." />}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Emitir número" disabled={!own && !patient} /></div></form></Dialog>;
}
