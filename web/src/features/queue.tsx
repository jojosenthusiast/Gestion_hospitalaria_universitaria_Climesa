import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { ExportMenu } from '../components/export-menu';
import { SearchPicker, type PickerItem } from '../components/search-picker';
import { AreaTag, PriorityBadge, type Priority } from '../components/system';
import { Icon, Notice } from '../components/ui';
import { can, type AccessProfile, type Api, type Space } from '../lib/api';
import { MOVE_LABEL, MOVE_PATH, SERVICE_AREA, destinations, localTime, moveFor, type BoardColumn, type QueueMoveAction } from '../lib/queue-moves';
import { patientPicker } from './appointments';
import { useQuickAction } from './personal/accion';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { COLUMNS, COLUMN_LABEL, COLUMN_TONE, boardSummary, columnOf, serviceNames, sortColumn, waitLevel, waitMinutes, type BoardTicket, type Column } from './listas/queue-board';
import './listas/lists.css';

type QueueAction = 'llamar' | 'atender' | 'completar' | 'no_se_presento';
/** FILA-01/CITA-04: the server says which actions the reader may take now (`allowedActions`) and why the others are blocked. */
type QueueTicket = BoardTicket & { fecha: string; patientId?: string | null; officeId?: string | null; officeCode?: string | null; version: number; consultationId?: string | null; consultationState?: string | null;
  area?: string; priority?: Priority; appointmentAt?: string | null; walkIn?: boolean;
  maxCalls?: number; callsForAbsence?: number; allowedActions?: QueueAction[]; blockedActions?: { action: QueueAction; reason: string }[]; undoActions?: string[] };
/** `GET /fila/siguiente`: who goes next in one area by the documented rule (RN-FILA-SIGUIENTE). */
export type NextProposal = { service: string; area: string; rule: string; proposal: { id: string; numero: number; area: string; patientName?: string | null; priority: Priority; appointmentAt?: string | null; version: number; reason: string; reasonText: string } | null };
type CallResult = { id: string; version: number; state: string; llamados: number; numero?: number };
/** Last reversible move, offered as "Deshacer" where it happened (S4: undo for what is reversible). */
type Undo = { ticketId: string; label: string; version: number };

const services = Object.entries(serviceNames);
const finalNames: Record<string, string> = { atendido: 'Atendido', no_se_presento: 'No se presentó', cerrado: 'Cerrado sin atender' };
const actionPath: Record<QueueAction, string> = { llamar: 'llamar', atender: 'atender', completar: 'completar', no_se_presento: 'no-se-presento' };
const minutesText = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
const areaOfTicket = (ticket: Pick<QueueTicket, 'area' | 'service'>) => ticket.area ?? SERVICE_AREA[ticket.service] ?? 'GEN';
const ticketCode = (ticket: Pick<QueueTicket, 'area' | 'service' | 'numero'>) => `${areaOfTicket(ticket)} ${ticket.numero}`;

export function QueuePage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [service, setService] = useState('todos'), [query, setQuery] = useState(''), [issueOpen, setIssueOpen] = useState(false);
  const data = useData<QueueTicket[]>(api, '/fila', version, can(profile, 'fila.ver'));
  const manage = can(profile, 'fila.gestionar'), call = can(profile, 'fila.llamar'), issue = can(profile, 'fila.emitir');
  const readOnly = !manage && !call && !issue;
  const action = useAction(api);
  // Optimistic column while a move is in flight; cleared on success (the refresh brings the real state) and on error (reverts).
  const [pending, setPending] = useState<Record<string, BoardColumn>>({});
  const [undo, setUndo] = useState<Undo | null>(null), [moveError, setMoveError] = useState<string | null>(null), [tick, setTick] = useState(0);
  const refresh = () => { data.refresh(); setTick(value => value + 1); };
  // Quick actions from the dashboards: `emitir` opens the issue form; `llamar` lands here, where the service is chosen.
  const [quick, consumeQuick] = useQuickAction();
  useEffect(() => { if (quick === 'emitir' && issue) setIssueOpen(true); if (quick) consumeQuick(); }, [quick, issue, consumeQuick]);

  async function transition(ticket: QueueTicket, path: string, method = 'POST', extra: Record<string, unknown> = {}) {
    setMoveError(null); setUndo(null);
    const result = await action.run<CallResult>(`/fila/${ticket.id}/${path}`, { version: ticket.version, ...extra }, method);
    if (result) {
      if (path === 'llamar' && result.version) setUndo({ ticketId: ticket.id, label: `Llamaste ${ticketCode(ticket)}.`, version: result.version });
      refresh();
    }
    return !!result;
  }
  /** Drag, keyboard and the card menu end here: the server decides, the card shows where it goes meanwhile. */
  async function move(ticket: QueueTicket, to: BoardColumn) {
    const check = moveFor(ticket, to);
    if (!check.allowed) { setMoveError(`${ticketCode(ticket)}: ${check.reason}`); return; }
    setPending(current => ({ ...current, [ticket.id]: to }));
    await transition(ticket, MOVE_PATH[check.action]);
    setPending(current => { const next = { ...current }; delete next[ticket.id]; return next; });
  }
  async function undoLast() {
    if (!undo) return;
    const done = await action.run(`/fila/${undo.ticketId}/deshacer-llamado`, { version: undo.version });
    if (done) { setUndo(null); refresh(); }
  }
  async function changePriority(ticket: QueueTicket, priority: Priority) {
    setMoveError(null);
    if (await action.run(`/fila/${ticket.id}/prioridad`, { version: ticket.version, priority })) refresh();
  }
  /** FILA-02 + RN-FILA-SIGUIENTE: the server calls the number its rule proposes for the area. */
  async function callNext(serviceCode: string, officeId: string) {
    setMoveError(null); setUndo(null);
    const result = await action.run<CallResult>('/fila/llamar-siguiente', officeId ? { service: serviceCode, officeId } : { service: serviceCode });
    if (result) {
      if (result.version && result.numero) setUndo({ ticketId: result.id, label: `Llamaste ${SERVICE_AREA[serviceCode] ?? ''} ${result.numero}.`, version: result.version });
      refresh();
    }
  }
  // El reloj se lee al pintar; cada evento en vivo vuelve a pintar el tablero (sin temporizadores).
  const now = Date.now();
  const filters = [...(service !== 'todos' ? [{ key: 'servicio', label: serviceNames[service] ?? service, remove: () => setService('todos') }] : []), ...(query.trim() ? [{ key: 'texto', label: `«${query.trim()}»`, remove: () => setQuery('') }] : [])];
  return <>
    <CompactHeader breadcrumb="Atención / Flujo de llegada" title="Fila del día" actions={issue && <button className="primary-button" onClick={() => setIssueOpen(true)}><Icon name="plus" size={18}/>Emitir número</button>}/>
    <section className="data-workbench" aria-label="Tablero de la fila">
      <RemoteState state={data}>{all => {
        const visible = all.filter(t => (service === 'todos' || t.service === service) && matches(query, String(t.numero), t.patientName, serviceNames[t.service], ticketCode(t)));
        const shown = visible.map(t => ({ ...t, column: (pending[t.id] ?? columnOf(t)) as Column }));
        const summary = boardSummary(visible, now);
        const exportTable = () => ({ filename: 'fila-del-dia', title: 'Fila del día', subtitle: `${visible.length} números`, columns: ['Número', 'Servicio', 'Paciente', 'Prioridad', 'Cita', 'Estado', 'Llamados', 'Emitido', 'Espera'], rows: visible.map(t => [ticketCode(t), serviceNames[t.service] ?? t.service, t.patientName ?? 'Paciente no identificado', PRIORITY_LABEL[t.priority ?? 'rutina'], t.appointmentAt ? localTime(t.appointmentAt) : 'Sin cita', COLUMN_LABEL[columnOf(t)], t.llamados, formatDateTime(t.issuedAt), minutesText(waitMinutes(t, now))]) });
        const waitingHere = all.some(t => t.service === service && t.state === 'en_espera');
        return <>
          {readOnly && <p className="qb-readonly"><Icon name="eye" size={18} />Vista de solo lectura: aquí sigues la fila, pero llamar y atender corresponde a Recepción, Asistencia y Medicina.</p>}
          <ListToolbar trailing={<ExportMenu table={exportTable} disabled={!visible.length} />}><LiveSearch label="Buscar en la fila" placeholder="Número o paciente" value={query} onChange={setQuery} /></ListToolbar>
          <div className="cl-filter-row"><span className="cl-filter-label">Servicio</span><ChipGroup label="Servicio" value={service} onChange={setService} options={[{ value: 'todos', label: 'Todos', count: all.length }, ...services.map(([value, label]) => ({ value, label, count: all.filter(t => t.service === value).length }))]} /></div>
          <ActiveFilters filters={filters} onClear={() => { setService('todos'); setQuery(''); }} />
          {service !== 'todos'
            ? <NextPanel api={api} profile={profile} service={service} version={version + tick} busy={action.busy} canCall={call} waiting={waitingHere} onCallNext={callNext} />
            : !readOnly && <p className="muted qb-hint">Elige un servicio para ver quién pasa después y llamar al siguiente número.</p>}
          <div className="qb-counts" aria-label="Resumen de la fila">{COLUMNS.map(column => <div key={column} className={`qb-count tone-${COLUMN_TONE[column]}`}><strong>{summary.counts[column]}</strong><span>{COLUMN_LABEL[column]}</span></div>)}
            <div className="qb-count tone-muted"><strong>{summary.averageWait} min</strong><span>Espera promedio · máxima {minutesText(summary.longestWait)}</span></div></div>
          <WriteError error={action.error} onReload={refresh} reloadLabel="Recargar la fila" />
          {moveError && <Notice kind="info">{moveError}</Notice>}
          {undo && !action.error && <div className="qb-undo" role="status"><span>{undo.label}</span><button className="row-action" disabled={action.busy} onClick={() => void undoLast()}><Icon name="retry" size={16} />Deshacer</button></div>}
          {visible.length ? <div className="qb-board">{COLUMNS.map(column => <Lane key={column} column={column} tickets={sortColumn(shown.filter(t => t.column === column), column)} now={now} busy={action.busy} call={call} manage={manage}
              pendingIds={pending} onTransition={transition} onMove={move} onPriority={changePriority} />)}</div>
            : <Empty title={all.length ? 'Ningún número coincide con los filtros' : 'La fila está vacía'} description={all.length ? 'Quita algún filtro para ver todos los números del día.' : 'Los números emitidos para este día aparecerán aquí.'} />}
        </>;
      }}</RemoteState>
    </section>
    {issueOpen && <IssueDialog api={api} profile={profile} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); refresh(); }} />}
  </>;
}

/** Top of the screen: who goes next in the chosen area (server rule) and "Llamar siguiente", optionally to a consulting room. */
function NextPanel({ api, profile, service, version, busy, canCall, waiting, onCallNext }: { api: Api; profile: AccessProfile; service: string; version: number; busy: boolean; canCall: boolean; waiting: boolean; onCallNext: (service: string, officeId: string) => Promise<void> }) {
  const next = useData<NextProposal>(api, `/fila/siguiente?service=${service}`, version);
  const rooms = useData<Space[]>(api, '/espacios', 0, canCall && can(profile, 'espacios.ver'));
  const [office, setOffice] = useState('');
  const offices = Array.isArray(rooms.data) ? rooms.data.filter(space => space.type === 'consultorio' && space.active) : [];
  const result = next.data && !Array.isArray(next.data) ? next.data : null;
  const proposal = result?.proposal ?? null;
  return <section className="qb-next" aria-label="Quién pasa después">
    <div className="qb-next-main">
      <span className="qb-next-label">Quién pasa después</span>
      {proposal
        ? <div className="qb-next-ticket"><AreaTag code={proposal.area || SERVICE_AREA[service] || 'GEN'} /><strong className="qb-number qb-number-lg mono-data">{proposal.numero}</strong>
            <div className="qb-next-who"><span>{proposal.patientName || 'Paciente no identificado'}</span><small>{proposal.reasonText}</small></div>
            {proposal.priority !== 'rutina' && <PriorityBadge value={proposal.priority} />}</div>
        : <p className="muted">{next.loading && !next.data ? 'Calculando…' : 'Nadie espera en este servicio.'}</p>}
      {result && <small className="qb-rule">Regla: {result.rule}</small>}
    </div>
    {canCall && <div className="qb-next-actions">
      {offices.length > 0 && <Select label="Consultorio" value={office} onChange={setOffice}><option value="">Sin asignar</option>{offices.map(room => <option key={room.id} value={room.id}>{room.code} · {room.name}</option>)}</Select>}
      <button className="primary-button" disabled={busy || !waiting} onClick={() => void onCallNext(service, office)}><Icon name="megaphone" size={18} />Llamar siguiente</button>
    </div>}
  </section>;
}

const actionLabel = (ticket: QueueTicket, action: QueueAction) => ({ llamar: ticket.state === 'llamado' ? 'Llamar de nuevo' : 'Llamar', atender: 'Iniciar atención', completar: 'Completar', no_se_presento: 'No se presentó' })[action];
const ACTION_ORDER: QueueAction[] = ['llamar', 'atender', 'completar', 'no_se_presento'];
const PRIORITY_LABEL: Record<Priority, string> = { emergencia: 'Emergencia', urgente: 'Urgente', rutina: 'Rutina' };

/** Actual state of the number: waiting, called N of M times, or in attention. */
function stateText(ticket: QueueTicket, call: boolean) {
  const room = ticket.officeCode ? ` · ${ticket.officeCode}` : '';
  if (ticket.state === 'en_espera') return call ? 'En espera' : 'Esperando a que el médico llame';
  if (ticket.state === 'llamado') return `Llamado ${ticket.llamados}${ticket.maxCalls ? ` de ${ticket.maxCalls}` : ''} ${ticket.llamados === 1 ? 'vez' : 'veces'}${room}`;
  if (ticket.state === 'en_atencion') return `Presente, en atención${room}`;
  return finalNames[ticket.state] ?? ticket.state;
}

const DRAG_TYPE = 'application/x-climesa-ticket';
type LaneProps = { column: Column; tickets: (QueueTicket & { column: Column })[]; now: number; busy: boolean; call: boolean; manage: boolean; pendingIds: Record<string, BoardColumn>;
  onTransition: (ticket: QueueTicket, path: string) => Promise<boolean>; onMove: (ticket: QueueTicket, to: BoardColumn) => Promise<void>; onPriority: (ticket: QueueTicket, priority: Priority) => Promise<void> };

function Lane({ column, tickets, now, busy, call, manage, pendingIds, onTransition, onMove, onPriority }: LaneProps) {
  const [over, setOver] = useState(false);
  const dropped = (event: DragEvent) => {
    event.preventDefault(); setOver(false);
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    try { void onMove(JSON.parse(raw) as QueueTicket, column as BoardColumn); } catch { /* foreign drag data */ }
  };
  return <section className={`qb-column${over ? ' is-drop-target' : ''}`} aria-label={COLUMN_LABEL[column]}
    onDragOver={event => { if (Array.from(event.dataTransfer.types ?? []).includes(DRAG_TYPE)) { event.preventDefault(); setOver(true); } }}
    onDragLeave={() => setOver(false)} onDrop={dropped}>
    <h3><span>{COLUMN_LABEL[column]}</span><span className={`cl-stage tone-${COLUMN_TONE[column]}`}>{tickets.length}</span></h3>
    {tickets.length ? <ul>{tickets.map(ticket => {
      const allowed = ticket.allowedActions ?? [];
      const blocked = ticket.blockedActions ?? [];
      const moves = destinations(ticket);
      const changingPriority = manage && ['en_espera', 'llamado'].includes(ticket.state);
      const area = areaOfTicket(ticket);
      return <li key={ticket.id} className={`qb-ticket area-surface area-${area.toLowerCase()}${pendingIds[ticket.id] ? ' is-pending' : ''}`}
        draggable={moves.length > 0 && !busy} aria-busy={pendingIds[ticket.id] ? true : undefined}
        onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ticket)); event.dataTransfer.effectAllowed = 'move'; }}>
      <div className="qb-ticket-head"><span className="qb-code"><AreaTag code={area} /><strong className="qb-number mono-data">{ticket.numero}</strong></span>{waitLevel(ticket, now) !== 'none' ? <span className={`qb-wait sla-${waitLevel(ticket, now)}`}>Espera {minutesText(waitMinutes(ticket, now))}</span> : <span className="qb-wait sla-none">{formatDateTime(ticket.issuedAt)}</span>}</div>
      <span>{ticket.patientName || 'Paciente no identificado'}</span>
      {(ticket.priority && ticket.priority !== 'rutina') || ticket.appointmentAt || ticket.walkIn
        ? <div className="qb-marks">
            {ticket.priority && ticket.priority !== 'rutina' && <PriorityBadge value={ticket.priority} />}
            {ticket.appointmentAt ? <span className="qb-cita"><Icon name="clock" size={14} />Cita {localTime(ticket.appointmentAt)}</span> : ticket.walkIn && <span className="qb-walkin">Sin cita</span>}
          </div> : null}
      <small>{serviceNames[ticket.service] ?? ticket.service} · {stateText(ticket, call)}</small>
      {column === 'cerrado' ? <Tag value={ticket.state} label={finalNames[ticket.state]} /> : null}
      <div className="row-actions">
        {ACTION_ORDER.map(name => allowed.includes(name)
          ? <button key={name} className="row-action" disabled={busy} onClick={() => void onTransition(ticket, actionPath[name])}>{actionLabel(ticket, name)}{name === 'llamar' && <> <Icon name="arrow" size={16} /></>}</button>
          : blocked.find(item => item.action === name) ? <button key={name} className="row-action" disabled title={blocked.find(item => item.action === name)!.reason}>{actionLabel(ticket, name)}</button> : null)}
        {ticket.state === 'en_atencion' && ticket.consultationId && ticket.consultationState === 'abierta' && <a className="row-action" href={`#/consultas?consulta=${ticket.consultationId}`}>Retomar consulta <Icon name="arrow" size={16} /></a>}
        {(moves.length > 0 || changingPriority) && <CardMenu ticket={ticket} moves={moves} priorities={changingPriority} busy={busy} onMove={onMove} onPriority={onPriority} />}
      </div>
      {blocked.map(item => <small key={item.action} className="form-hint">{actionLabel(ticket, item.action)}: {item.reason}</small>)}
      </li>;
    })}</ul> : <p className="muted">Nadie por ahora.</p>}</section>;
}

/** Keyboard and touch alternative to dragging: a native menu with the moves the server accepts and the priority. */
function CardMenu({ ticket, moves, priorities, busy, onMove, onPriority }: { ticket: QueueTicket; moves: { to: BoardColumn; action: QueueMoveAction }[]; priorities: boolean; busy: boolean; onMove: (ticket: QueueTicket, to: BoardColumn) => Promise<void>; onPriority: (ticket: QueueTicket, priority: Priority) => Promise<void> }) {
  function choose(value: string) {
    const [kind, target] = value.split(':');
    if (kind === 'mover') void onMove(ticket, target as BoardColumn);
    if (kind === 'prioridad') void onPriority(ticket, target as Priority);
  }
  return <select className="qb-menu" value="" disabled={busy} onChange={event => choose(event.target.value)} aria-label={`Mover o cambiar prioridad de ${ticketCode(ticket)}`}>
    <option value="">Mover…</option>
    {moves.length > 0 && <optgroup label="Mover a">{moves.map(item => <option key={item.to} value={`mover:${item.to}`}>{COLUMN_LABEL[item.to as Column]} ({MOVE_LABEL[item.action].toLowerCase()})</option>)}</optgroup>}
    {priorities && <optgroup label="Prioridad">{(['emergencia', 'urgente', 'rutina'] as Priority[]).filter(p => p !== (ticket.priority ?? 'rutina')).map(p => <option key={p} value={`prioridad:${p}`}>{PRIORITY_LABEL[p]}</option>)}</optgroup>}
  </select>;
}

function IssueDialog({ api, profile, onClose, onSaved }: { api: Api; profile: AccessProfile; onClose: () => void; onSaved: () => void }) {
  const own = !!profile.patientId && !can(profile, 'fila.gestionar');
  const action = useAction(api); const [service, setService] = useState('consulta_general'); const [patient, setPatient] = useState<PickerItem | null>(null);
  const [priority, setPriority] = useState<Priority>('rutina');
  async function save(event: FormEvent) {
    event.preventDefault();
    // `rutina` is the server default: the body of a routine number stays as before.
    const body = { service, ...(own ? {} : { patientId: patient?.id }), ...(!own && priority !== 'rutina' ? { priority } : {}) };
    if (await action.run('/fila', body)) onSaved();
  }
  return <Dialog title="Emitir número de fila" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p className="form-intro">El número cuenta desde 1 en cada área. Quien tiene cita hoy queda marcado con su hora.</p><WriteError error={action.error} onReload={onSaved} /><Select label="Servicio" value={service} onChange={setService} required>{services.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>{!own && <SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." />}
    {!own && <fieldset className="choice-list qb-priority-choice"><legend>Prioridad</legend>{(['rutina', 'urgente', 'emergencia'] as Priority[]).map(p => <label className="check-field" key={p}><input type="radio" name="prioridad" value={p} checked={priority === p} onChange={() => setPriority(p)} aria-label={PRIORITY_LABEL[p]} /> <PriorityBadge value={p} /></label>)}<small className="form-hint">Emergencia y urgente pasan antes que las citas y la fila.</small></fieldset>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Emitir número" disabled={!own && !patient} /></div></form></Dialog>;
}
