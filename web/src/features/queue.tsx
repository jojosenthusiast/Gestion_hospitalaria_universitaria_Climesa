import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ExportMenu } from '../components/export-menu';
import { SearchPicker, type PickerItem } from '../components/search-picker';
import { StatusBadge, ActionButton, AreaTag, CrudButton, PriorityBadge, ReadOnlyBadge, type Priority } from '../components/system';
import { Icon, Notice } from '../components/ui';
import { HoldCountdown } from '../components/countdown';
import { can, type AccessProfile, type Api, type Space } from '../lib/api';
import { MOVE_PATH, SERVICE_AREA, canUndoCall, destinations, localTime, moveFor, type BoardColumn, type QueueMoveAction } from '../lib/queue-moves';
import { NO_SHOW_DELAY_MS, patientPicker } from './appointments';
import { useQuickAction } from './personal/accion';
import { FrontDeskDialog } from './front-desk';
import { readHashParams, writeHashParams } from '../lib/hash-params';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Select, WriteError, formatDateTime, isVersionConflict, useAction, useData, type Remote } from './common';
import { LiveSearch, matches } from './listas/chips';
import { patientFacts } from './listas/patient-facts';
import { Segmented } from '../components/segmented';
import { formatDuration, formatTime, plural } from '../lib/format';
import { COLUMNS, COLUMN_LABEL, COLUMN_TONE, boardSummary, columnOf, waitingSplit, waitingSplitText, serviceNames, sortColumn, waitLevel, waitMinutes, waitUntilCall, type BoardTicket, type Column } from './listas/queue-board';
import './listas/lists.css';
import { CategoryBadges, type CategoryRef } from '../components/category';
import { QueueCardMenu, type CardMenuItem } from './queue/card-menu';
import './queue/queue.css';

type QueueAction = 'llamar' | 'atender' | 'completar' | 'no_se_presento';
/** FILA-01/CITA-04: the server says which actions the reader may take now (`allowedActions`) and why the others are blocked. */
type QueueTicket = BoardTicket & { fecha: string; patientAge?: number | null; patientSex?: string | null; categories?: CategoryRef[]; patientId?: string | null; officeId?: string | null; officeCode?: string | null; version: number; consultationId?: string | null; consultationState?: string | null;
  area?: string; priority?: Priority; appointmentAt?: string | null; walkIn?: boolean;
  /** R7 U1 (D-1, B-4): the appointment whose arrival issued this number, its doctor, and until when the issuer may void it. */
  appointmentId?: string | null; appointmentDoctorName?: string | null; arrivalFromAppointment?: boolean; voidableUntil?: string | null;
  maxCalls?: number; callsForAbsence?: number; allowedActions?: QueueAction[]; blockedActions?: { action: QueueAction; reason: string }[]; undoActions?: string[] };
/** `GET /fila/siguiente`: who goes next in one area by the documented rule (RN-FILA-SIGUIENTE). */
export type NextProposal = { service: string; area: string; rule: string; proposal: { id: string; numero: number; area: string; patientName?: string | null; priority: Priority; appointmentAt?: string | null; version: number; reason: string; reasonText: string } | null };
type CallResult = { id: string; version: number; state: string; llamados: number; numero?: number; ownAppointment?: boolean; appointmentAt?: string | null };
/** B-5: the caller's service and consulting room from the shift in progress (`GET /fila/mi-puesto`). */
type MyPost = { service: string | null; area: string | null; areaName: string | null; officeId: string | null; officeCode: string | null };
/** Last reversible move, offered as "Deshacer" where it happened (S4: undo for what is reversible). */
type Undo = { ticketId: string; label: string; version: number };

const services = Object.entries(serviceNames);
const finalNames: Record<string, string> = { atendido: 'Atendido', no_se_presento: 'No se presentó', cerrado: 'Anulado' };
/** Audit D44: how long a queue toast stays before it closes by itself. */
const TOAST_MS = 8000;
/** Audit D49: the export file carries the day it was taken (El Salvador date). */
const dayStamp = (now: number) => new Date(now - 6 * 3_600_000).toISOString().slice(0, 10);
/** Audit D48: the exported wait runs from issue to the first call; a number never called and no longer waiting shows «—». */
const waitText = (ticket: QueueTicket, now: number) => { const minutes = waitUntilCall(ticket, now); return minutes === null ? '—' : minutesText(minutes); };
/** Audit D47: a finished number exports its real outcome (Atendido, No se presentó, Anulado), not the column name. */
const exportState = (ticket: QueueTicket) => columnOf(ticket) === 'cerrado' ? finalNames[ticket.state] ?? ticket.state : COLUMN_LABEL[columnOf(ticket)];
/**
 * Audit D43: once the calls run out, «Llamar de nuevo» stays on the card, disabled with its reason, so «Iniciar atención»
 * never slides under the pointer.
 */
const callBlocked = (ticket: QueueTicket) => {
  const blocked = ticket.blockedActions ?? [];
  if (ticket.state !== 'llamado' || (ticket.allowedActions ?? []).includes('llamar') || blocked.some(item => item.action === 'llamar')) return blocked;
  return [...blocked, { action: 'llamar' as QueueAction, reason: `Ya se llamó ${ticket.llamados} ${ticket.llamados === 1 ? 'vez' : 'veces'}${ticket.maxCalls ? ` de ${ticket.maxCalls}` : ''}.` }];
};
const actionPath: Record<QueueAction, string> = { llamar: 'llamar', atender: 'atender', completar: 'completar', no_se_presento: 'no-se-presento' };
const minutesText = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
const areaOfTicket = (ticket: Pick<QueueTicket, 'area' | 'service'>) => ticket.area ?? SERVICE_AREA[ticket.service] ?? 'GEN';
const ticketCode = (ticket: Pick<QueueTicket, 'area' | 'service' | 'numero'>) => `${areaOfTicket(ticket)} ${ticket.numero}`;

export function QueuePage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [service, setService] = useState('todos'), [query, setQuery] = useState(''), [issueOpen, setIssueOpen] = useState(false);
  const data = useData<QueueTicket[]>(api, '/fila', version, can(profile, 'fila.ver'));
  const manage = can(profile, 'fila.gestionar'), call = can(profile, 'fila.llamar'), issue = can(profile, 'fila.emitir');
  const readOnly = !manage && !call && !issue;
  // Mirrors the API (`seesWholeQueue`): only staff who read the whole queue get "who goes next"; a patient's own
  // queue (context `propio`) would get 403.
  const wholeQueue = profile.permissions.some(p => p.code === 'fila.ver' && p.context !== 'propio');
  const action = useAction(api);
  // Optimistic column while a move is in flight; cleared on success (the refresh brings the real state) and on error (reverts).
  const [pending, setPending] = useState<Record<string, BoardColumn>>({});
  // R7 U1: each called card keeps its own «Deshacer» (several numbers can be called in a row); the line on top says the last one.
  const [undos, setUndos] = useState<Record<string, Undo>>({});
  const [moveError, setMoveError] = useState<{ ticketId: string | null; text: string } | null>(null), [failedId, setFailedId] = useState<string | null>(null), [tick, setTick] = useState(0);
  const [closing, setClosing] = useState<QueueTicket | null>(null), [voiding, setVoiding] = useState<QueueTicket | null>(null);
  // Audit D31/D44: every call and undo says what happened in one toast line; it closes by itself or with «Cerrar aviso»,
  // so it never stays over the cards.
  const [toast, setToast] = useState<{ text: string; undo?: Undo } | null>(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), TOAST_MS); return () => clearTimeout(timer); }, [toast]);
  const remember = (item: Undo) => { setUndos(current => ({ ...current, [item.ticketId]: item })); setToast({ text: item.label, undo: item }); };
  const forget = (ticketId: string) => { setUndos(current => { const next = { ...current }; delete next[ticketId]; return next; }); setToast(current => current?.undo?.ticketId === ticketId ? null : current); };
  const refresh = () => { data.refresh(); setTick(value => value + 1); };
  // Quick actions: `emitir` opens the front desk (with `paciente=<id>` from the patient record, already chosen);
  // `llamar` preselects the caller's service and consulting room from the shift in progress (B-5).
  const [quick, consumeQuick] = useQuickAction();
  const [deskPatient, setDeskPatient] = useState<string | null>(null), [office, setOffice] = useState('');
  const post = useData<MyPost>(api, '/fila/mi-puesto', 0, call && quick === 'llamar');
  useEffect(() => {
    if (quick === 'emitir' && issue) { setDeskPatient(readHashParams().get('paciente')); writeHashParams({ paciente: null }); setIssueOpen(true); }
    if (quick && quick !== 'llamar') consumeQuick();
  }, [quick, issue, consumeQuick]);
  useEffect(() => {
    if (quick !== 'llamar' || post.loading) return;
    if (post.data?.service) setService(post.data.service);
    if (post.data?.officeId) setOffice(post.data.officeId);
    consumeQuick();
  }, [quick, post.loading, post.data, consumeQuick]);

  // D-3, the same as «No asistió» in Citas: «No se presentó» is held 8 s with «Deshacer»; only then is it sent, with the
  // live version. Leaving the page sends what is pending.
  const [absences, setAbsences] = useState<Record<string, number>>({});
  const absenceTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>()), heldTickets = useRef(new Map<string, QueueTicket>());
  const liveTickets = useRef<QueueTicket[]>([]);
  liveTickets.current = Array.isArray(data.data) ? data.data : [];
  const dropAbsence = (id: string) => { clearTimeout(absenceTimers.current.get(id)); absenceTimers.current.delete(id); heldTickets.current.delete(id); setAbsences(current => { const next = { ...current }; delete next[id]; return next; }); };
  const sendAbsence = useRef<(ticket: QueueTicket) => void>(() => undefined);
  sendAbsence.current = ticket => { dropAbsence(ticket.id); void move(liveTickets.current.find(t => t.id === ticket.id) ?? ticket, 'cerrado', true); };
  useEffect(() => () => { for (const [id, timer] of absenceTimers.current) { clearTimeout(timer); const held = heldTickets.current.get(id); if (held) sendAbsence.current(held); } }, []);
  function holdAbsence(ticket: QueueTicket) {
    heldTickets.current.set(ticket.id, ticket);
    setAbsences(current => ({ ...current, [ticket.id]: Date.now() + NO_SHOW_DELAY_MS }));
    absenceTimers.current.set(ticket.id, setTimeout(() => sendAbsence.current(ticket), NO_SHOW_DELAY_MS));
  }

  async function transition(ticket: QueueTicket, path: string, method = 'POST', extra: Record<string, unknown> = {}) {
    setMoveError(null); setFailedId(null);
    const result = await action.run<CallResult>(`/fila/${ticket.id}/${path}`, { version: ticket.version, ...extra }, method);
    if (result) {
      if (path === 'llamar' && result.version) remember({ ticketId: ticket.id, label: result.llamados > 1 ? `Llamaste de nuevo ${ticketCode(ticket)} (${result.llamados}${ticket.maxCalls ? ` de ${ticket.maxCalls}` : ''}).` : `Llamaste ${ticketCode(ticket)}.`, version: result.version });
      else forget(ticket.id);
      refresh();
    } else setFailedId(ticket.id);
    return !!result;
  }
  /** Drag, keyboard and the card menu end here: the server decides, the card shows where it goes meanwhile. */
  async function move(ticket: QueueTicket, to: BoardColumn, confirmed = false): Promise<boolean> {
    const check = moveFor(ticket, to);
    if (!check.allowed) { setMoveError({ ticketId: ticket.id, text: check.reason }); return false; }
    // R7 U1: completing asks first, naming the patient; «No se presentó» waits 8 s with «Deshacer» (D-3).
    if (to === 'cerrado' && !confirmed) { if (check.action === 'no_se_presento') holdAbsence(ticket); else setClosing(ticket); return false; }
    setPending(current => ({ ...current, [ticket.id]: to }));
    const done = await transition(ticket, MOVE_PATH[check.action]);
    setPending(current => { const next = { ...current }; delete next[ticket.id]; return next; });
    return done;
  }
  /** Audit D42: undo reads the live version of the card, so it works after a refresh too, and says where the number went. */
  async function undoCall(item: Undo | null) {
    if (!item) return;
    const ticket = liveTickets.current.find(t => t.id === item.ticketId);
    setMoveError(null); setFailedId(null); setToast(null);
    if (ticket && ticket.llamados <= 1) setPending(current => ({ ...current, [item.ticketId]: 'espera' }));
    const done = await action.run<CallResult>(`/fila/${item.ticketId}/deshacer-llamado`, { version: Math.max(ticket?.version ?? 0, item.version) });
    setPending(current => { const next = { ...current }; delete next[item.ticketId]; return next; });
    if (done) {
      forget(item.ticketId); refresh();
      const code = ticket ? ticketCode(ticket) : 'el número';
      setToast({ text: done.state === 'en_espera' ? `Se deshizo el llamado: ${code} volvió a En espera.` : `Se deshizo un llamado de ${code}: quedan ${done.llamados}.` });
    } else setFailedId(item.ticketId);
  }
  /** B-3: the issuer voids a number issued by mistake, while the server allows it. */
  async function voidTicket(ticket: QueueTicket) {
    setMoveError(null); setFailedId(null);
    if (await action.run(`/fila/${ticket.id}/anular`, { version: ticket.version })) { setVoiding(null); setToast({ text: `Se anuló ${ticketCode(ticket)}.` }); refresh(); } else setFailedId(ticket.id);
  }
  async function changePriority(ticket: QueueTicket, priority: Priority) {
    setMoveError(null);
    if (await action.run(`/fila/${ticket.id}/prioridad`, { version: ticket.version, priority })) refresh();
  }
  /** FILA-02 + RN-FILA-SIGUIENTE: the server calls the number its rule proposes for the area. */
  async function callNext(serviceCode: string, officeId: string) {
    setMoveError(null); setFailedId(null);
    const result = await action.run<CallResult>('/fila/llamar-siguiente', officeId ? { service: serviceCode, officeId } : { service: serviceCode });
    if (result) {
      // D-2: a doctor's own booked patient goes first; the line says so.
      const own = result.ownAppointment && result.appointmentAt ? ` Tu cita de las ${localTime(result.appointmentAt)}.` : '';
      if (result.version && result.numero) remember({ ticketId: result.id, label: `Llamaste ${SERVICE_AREA[serviceCode] ?? ''} ${result.numero}.${own}`, version: result.version });
      refresh();
    }
  }
  // El reloj se lee al pintar; cada evento en vivo vuelve a pintar el tablero (sin temporizadores).
  const now = Date.now();
  const loaded = Array.isArray(data.data) ? data.data : [];
  // R4a: «Llamar siguiente» is never hidden behind a filter. With «Todos» it works on the first service that has
  // someone waiting (in the order of the service list), and the line says which service that is.
  const nextService = service !== 'todos' ? service : services.find(([value]) => loaded.some(t => t.service === value && t.state === 'en_espera'))?.[0] ?? null;
  const showNext = !!nextService && wholeQueue && !readOnly;
  const loadedVisible = loaded.filter(t => (service === 'todos' || t.service === service) && matches(query, String(t.numero), t.patientName, serviceNames[t.service], ticketCode(t)));
  const waitingNext = loaded.filter(t => t.service === nextService && t.state === 'en_espera').length;
  // One request for «Quién sigue»: the panel and the bottom dock read the same server proposal.
  const next = useData<NextProposal>(api, `/fila/siguiente?service=${nextService ?? ''}`, version + tick, showNext);
  const summaryShown = !!data.data && (loaded.length > 0 || call || issue);
  return <>
    <CompactHeader breadcrumb="Atención / Flujo de llegada" title="Fila del día" actions={<>
      {readOnly && <ReadOnlyBadge who="Recepción, Asistencia o Medicina" what="la fila del día" />}
      </>}/>
    {/* Owner batch 2 (S28): the summary and the line's actions sit on top, so a long board never hides them. */}
    {summaryShown && <QueueSummary visible={loadedVisible} now={now} proposal={showNext && next.data && !Array.isArray(next.data) && next.data.service === nextService ? next.data.proposal : null}
            onCallNext={call && showNext && nextService ? () => void callNext(nextService, office) : null} callDisabled={action.busy || waitingNext === 0}
            onIssue={issue ? () => setIssueOpen(true) : null} />}
    {toast && !action.error && <div className="qb-undo" role="status"><span>{toast.text}</span>{toast.undo && undos[toast.undo.ticketId] && <button className="row-action" disabled={action.busy} onClick={() => void undoCall(toast.undo!)}><Icon name="retry" size={16} />Deshacer</button>}
      <button type="button" className="icon-button qb-undo-close" aria-label="Cerrar aviso" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}
    <section className="data-workbench" aria-label="Tablero de la fila">
      <RemoteState state={data}>{all => {
        const visible = loadedVisible;
        const shown = visible.map(t => ({ ...t, column: (pending[t.id] ?? columnOf(t)) as Column }));
        const summary = boardSummary(visible, now);
        const exportTable = () => ({ filename: `fila-del-dia-${dayStamp(now)}`, title: 'Fila del día', subtitle: `${visible.length} números`, columns: ['Número', 'Servicio', 'Paciente', 'Prioridad', 'Cita', 'Estado', 'Llamados', 'Emitido', 'Espera'], rows: visible.map(t => [ticketCode(t), serviceNames[t.service] ?? t.service, t.patientName ?? 'Paciente no identificado', PRIORITY_LABEL[t.priority ?? 'rutina'], t.appointmentAt ? localTime(t.appointmentAt) : 'Sin cita', exportState(t), t.llamados, formatDateTime(t.issuedAt, { withYear: true }), waitText(t, now)]) });
        return <>
          <div className="cl-toolbar qb-toolbar">
            <LiveSearch label="Buscar en la fila" placeholder="Número o paciente" value={query} onChange={setQuery} />
            <Segmented label="Servicio" value={service} onChange={setService} options={[{ value: 'todos', label: 'Todos', count: all.length }, ...services.map(([value, label]) => ({ value, label, count: all.filter(t => t.service === value).length }))]} />
            <span className="qb-toolbar-end">{query.trim() && <button type="button" className="cl-link-button" onClick={() => setQuery('')}>Quitar filtros</button>}<ExportMenu table={exportTable} disabled={!visible.length} /></span>
          </div>
          {showNext && nextService
            && <NextPanel api={api} profile={profile} service={nextService} named={service === 'todos'} next={next} canCall={call} waiting={waitingNext} office={office} onOffice={setOffice} />}
          {/* A failed card action shows on its card; the line here stays for version conflicts (reload) and the panel. */}
          {(!failedId || isVersionConflict(action.error)) && <WriteError error={action.error} onReload={refresh} reloadLabel="Recargar la fila" />}
          {moveError && !moveError.ticketId && <Notice kind="info">{moveError.text}</Notice>}
          {visible.length ? <div className="qb-board">{COLUMNS.map(column => <Lane key={column} column={column} tickets={sortColumn(shown.filter(t => t.column === column), column)} now={now} busy={action.busy} call={call} manage={manage} issue={issue}
              pendingIds={pending} averageWait={column === 'espera' ? summary.averageWait : 0} current={id => all.find(t => t.id === id) ?? null} undos={undos} held={absences} onUndoAbsence={dropAbsence}
              cardError={id => failedId === id && action.error && !isVersionConflict(action.error) ? action.error.message : moveError?.ticketId === id ? moveError.text : null}
              onTransition={transition} onMove={async (ticket, to) => { await move(ticket, to); }} onPriority={changePriority} onUndo={item => void undoCall(item)} onVoid={ticket => setVoiding(ticket)} />)}</div>
            : <Empty title={all.length ? 'Ningún número coincide con los filtros' : 'La fila está vacía'} description={all.length ? 'Quita algún filtro para ver todos los números del día.' : 'Los números emitidos para este día aparecerán aquí.'} />}
        </>;
      }}</RemoteState>
    </section>
    {issueOpen && (profile.patientId && !manage
      ? <IssueDialog api={api} profile={profile} onClose={() => setIssueOpen(false)} onSaved={() => { setIssueOpen(false); refresh(); }} />
      : <FrontDeskDialog api={api} patientId={deskPatient} onClose={() => { setIssueOpen(false); setDeskPatient(null); }} onIssued={refresh} />)}
    {closing && <Dialog title="Cerrar número" onClose={() => setClosing(null)} busy={action.busy}><div className="module-form">
      <p>{closing.state === 'en_atencion' ? 'Completar' : 'Marcar «No se presentó» a'} <strong>{ticketCode(closing)} · {closing.patientName || 'Paciente no identificado'}</strong>. El número sale de la fila y no se puede deshacer.</p>
      {/* Sweep U6: the dialog stays open until the server answers, so a failure is shown here, not lost. */}
      <WriteError error={action.error} onReload={() => { setClosing(null); refresh(); }} reloadLabel="Recargar la fila" />
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setClosing(null)} disabled={action.busy}>Volver</button>
        <button type="button" className="primary-button" disabled={action.busy} onClick={async () => { const ticket = (data.data ?? []).find(t => t.id === closing.id) ?? closing; if (await move(ticket, 'cerrado', true)) setClosing(null); }}>{closing.state === 'en_atencion' ? 'Completar' : 'No se presentó'}</button></div></div></Dialog>}
    {/* Audit D30: voiding a number asks first, naming it. */}
    {voiding && <VoidDialog code={ticketCode(voiding)} patient={voiding.patientName} busy={action.busy} error={action.error} onClose={() => setVoiding(null)}
      onConfirm={() => void voidTicket((data.data ?? []).find(t => t.id === voiding.id) ?? voiding)} />}
  </>;
}

/**
 * R4a: one line on top of the board. «Quién sigue» names the number the server rule proposes (the rule itself is the
 * tooltip, not printed text), with the consulting room for the call. «Llamar siguiente» lives in the bottom dock.
 */
function NextPanel({ api, profile, service, named, next, canCall, waiting, office, onOffice }: { api: Api; profile: AccessProfile; service: string; named: boolean; next: Remote<NextProposal>; canCall: boolean; waiting: number; office: string; onOffice: (office: string) => void }) {
  const rooms = useData<Space[]>(api, '/espacios', 0, canCall && can(profile, 'espacios.ver'));
  const offices = Array.isArray(rooms.data) ? rooms.data.filter(space => space.type === 'consultorio' && space.active) : [];
  const result = next.data && !Array.isArray(next.data) && next.data.service === service ? next.data : null;
  const proposal = result?.proposal ?? null;
  return <section className="qb-next" aria-label="Quién sigue" title={result ? `Orden: ${result.rule}` : undefined}>
    <div className="qb-next-main">
      <span className="qb-next-label">Quién sigue{named && <> en {serviceNames[service] ?? service}</>}</span>
      {proposal
        ? <div className="qb-next-ticket"><AreaTag code={proposal.area || SERVICE_AREA[service] || 'GEN'} /><strong className="qb-number qb-number-lg mono-data">{proposal.numero}</strong>
            <div className="qb-next-who"><span>{proposal.patientName || 'Paciente no identificado'}</span><small>{proposal.reasonText}</small></div>
            {proposal.priority !== 'rutina' && <PriorityBadge value={proposal.priority} />}</div>
        : next.error ? <Notice kind="error">{next.error.message}</Notice>
                // The server proposes only whom this account may call (a doctor sees their own patients): others may still wait.
        : <p className="muted">{next.loading || !result ? 'Calculando…' : waiting > 0 ? `Esperan ${waiting} ${waiting === 1 ? 'paciente' : 'pacientes'} de otros médicos.` : 'Nadie espera en este servicio.'}</p>}
    </div>
    {canCall && offices.length > 0 && <div className="qb-next-actions">
      <label className="qb-office"><span className="sr-only">Consultorio</span><select aria-label="Consultorio" value={office} onChange={event => onOffice(event.target.value)}><option value="">Sin consultorio</option>{offices.map(room => <option key={room.id} value={room.id}>{room.code} · {room.name}</option>)}</select></label>
    </div>}
  </section>;
}

type SummaryProposal = NonNullable<NextProposal['proposal']>;
/**
 * Owner batch 2 (S28): one compact line under the title. Who is being seen, who goes next (the server proposal when
 * there is one, else the head of the line) with the area tag, the average and longest wait, and «Llamar siguiente» /
 * «Emitir número» at its end. It used to be a dock under the board; with many numbers the reader had to scroll to it.
 * On a wide screen it stays under the hospital header while the board scrolls. Buttons the account cannot use are absent.
 */
export function QueueSummary({ visible, now, proposal, onCallNext, callDisabled, onIssue }: { visible: QueueTicket[]; now: number; proposal: SummaryProposal | null; onCallNext: (() => void) | null; callDisabled: boolean; onIssue: (() => void) | null }) {
  // Audit D41: «En atención» names who is in attention; a number that was only called reads «Llamado».
  const latest = (state: string) => visible.filter(t => t.state === state).sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt))[0] ?? null;
  const serving = latest('en_atencion') ?? latest('llamado');
  const waiting = sortColumn(visible.filter(t => t.state === 'en_espera'), 'espera');
  const summary = boardSummary(visible, now);
  const nextArea = proposal ? proposal.area || 'GEN' : waiting[0] ? areaOfTicket(waiting[0]) : null;
  const nextNumber = proposal?.numero ?? waiting[0]?.numero ?? null;
  return <section className="qb-summary" aria-label="Resumen de atención">
    <div className="qb-summary-stats">
      <div className="qb-summary-stat"><span className="qb-summary-label">{serving?.state === 'llamado' ? 'Llamado' : 'En atención'}</span>
        <span className="qb-summary-value">{serving ? <><AreaTag code={areaOfTicket(serving)} /><strong className="mono-data">{serving.numero}</strong></> : <strong className="qb-summary-none">Nadie</strong>}</span></div>
      <div className="qb-summary-stat"><span className="qb-summary-label">Sigue</span>
        <span className="qb-summary-value">{nextNumber !== null && nextArea ? <><AreaTag code={nextArea} /><strong className="mono-data">{nextNumber}</strong></> : <strong className="qb-summary-none">Nadie</strong>}
          {waiting.length > 0 && <small>{waiting.length} en espera · {waitingSplitText(waitingSplit(waiting))}</small>}</span></div>
      <div className="qb-summary-stat qb-summary-wait"><span className="qb-summary-label">Espera promedio</span>
        <span className="qb-summary-value"><strong>{formatDuration(summary.averageWait)}</strong><small>Máxima {formatDuration(summary.longestWait)}</small></span></div>
    </div>
    {(onCallNext || onIssue) && <div className="qb-summary-actions">
      {onCallNext && <button type="button" className="secondary-button" disabled={callDisabled} onClick={onCallNext}><Icon name="megaphone" size={18} />Llamar siguiente</button>}
      {onIssue && <CrudButton kind="create" label="Emitir número" onClick={onIssue} />}
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
  if (ticket.state === 'llamado') return `Llamado ${ticket.llamados} ${ticket.maxCalls ? `de ${ticket.maxCalls}` : ticket.llamados === 1 ? 'vez' : 'veces'}${room}`;
  if (ticket.state === 'en_atencion') return `Presente, en atención${room}`;
  return finalNames[ticket.state] ?? ticket.state;
}

const DRAG_TYPE = 'application/x-climesa-ticket';
type LaneProps = { column: Column; tickets: (QueueTicket & { column: Column })[]; now: number; busy: boolean; call: boolean; manage: boolean; issue: boolean; pendingIds: Record<string, BoardColumn>; averageWait: number;
  current: (id: string) => QueueTicket | null; undos: Record<string, Undo>; held: Record<string, number>; onUndoAbsence: (id: string) => void; cardError: (id: string) => string | null;
  onTransition: (ticket: QueueTicket, path: string) => Promise<boolean>; onMove: (ticket: QueueTicket, to: BoardColumn) => Promise<void>; onPriority: (ticket: QueueTicket, priority: Priority) => Promise<void>;
  onUndo: (item: Undo) => void; onVoid: (ticket: QueueTicket) => void };

const LANE_FOLD = 4;
const LANE_FOLD_WIDE = 6;
function Lane({ column, tickets, now, busy, call, manage, issue, pendingIds, averageWait, current, undos, held, onUndoAbsence, cardError, onTransition, onMove, onPriority, onUndo, onVoid }: LaneProps) {
  const [over, setOver] = useState(false);
  // #15: a long lane shows its first cards; the rest open on «Ver N más» (the page was 6,800 px tall on a phone, and
  // on a desktop a 16-card lane ran 3,500 px under the sticky dock). A phone folds sooner than a desktop.
  const [phone] = useState(() => typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(max-width: 767px)').matches);
  const [unfolded, setUnfolded] = useState(false);
  const fold = phone ? LANE_FOLD : LANE_FOLD_WIDE;
  const shownTickets = !unfolded && tickets.length > fold ? tickets.slice(0, fold) : tickets;
  const dropped = (event: DragEvent) => {
    event.preventDefault(); setOver(false);
    const raw = event.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    // R7 U1: the drag carries only the id; the version is read from the live board at drop time (a live event may have
    // changed the number while it was being dragged).
    try { const ticket = current((JSON.parse(raw) as { id: string }).id); if (ticket) void onMove(ticket, column as BoardColumn); } catch { /* foreign drag data */ }
  };
  return <section className={`qb-column${over ? ' is-drop-target' : ''}`} aria-label={COLUMN_LABEL[column]}
    onDragOver={event => { if (Array.from(event.dataTransfer.types ?? []).includes(DRAG_TYPE)) { event.preventDefault(); setOver(true); } }}
    onDragLeave={() => setOver(false)} onDrop={dropped}>
    <h3><span>{COLUMN_LABEL[column]}</span><span className={`cl-stage tone-${COLUMN_TONE[column]}`} aria-label={plural(tickets.length, 'número', 'números')}>{tickets.length}</span>
      {averageWait > 0 && <small className="qb-avg" title="Espera promedio de quienes esperan">prom. {formatDuration(averageWait)}</small>}</h3>
    {tickets.length ? <><ul>{shownTickets.map(ticket => {
      const allowed = ticket.allowedActions ?? [];
      const blocked = call ? callBlocked(ticket) : ticket.blockedActions ?? [];
      const moves = destinations(ticket);
      const changingPriority = manage && ['en_espera', 'llamado'].includes(ticket.state);
      const area = areaOfTicket(ticket);
      return <li key={ticket.id} className={`qb-ticket area-surface area-${area.toLowerCase()}${pendingIds[ticket.id] ? ' is-pending' : ''}`}
        draggable={moves.length > 0 && !busy} aria-busy={pendingIds[ticket.id] ? true : undefined}
        onDragStart={event => { event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: ticket.id })); event.dataTransfer.effectAllowed = 'move'; }}>
      <div className="qb-ticket-head"><span className="qb-code"><AreaTag code={area} /><strong className="qb-number mono-data">{ticket.numero}</strong></span>{waitLevel(ticket, now) !== 'none' ? <span className={`qb-wait sla-${waitLevel(ticket, now)}`}>Espera {formatDuration(waitMinutes(ticket, now))}</span> : <span className="qb-wait sla-none" title="Hora de emisión">{formatTime(ticket.issuedAt)}</span>}</div>
      <span>{ticket.patientName || 'Paciente no identificado'}<CategoryBadges categories={ticket.categories} />{patientFacts(ticket) && <small className="qb-facts">{patientFacts(ticket)}</small>}</span>
      {/* R4a: booked or walk-in is on every card, so the order of the column reads at a glance. */}
      <div className="qb-marks">
        {ticket.priority && ticket.priority !== 'rutina' && <PriorityBadge value={ticket.priority} />}
        {ticket.appointmentAt ? <span className="qb-cita"><Icon name="clock" size={14} />Cita {localTime(ticket.appointmentAt)}{ticket.appointmentDoctorName ? ` con ${ticket.appointmentDoctorName}` : ''}</span> : <span className="qb-walkin">Sin cita</span>}
        {ticket.arrivalFromAppointment && <span className="qb-walkin">Llegada registrada</span>}
      </div>
      {cardError(ticket.id) && <p className="qb-card-error" role="alert">{cardError(ticket.id)}</p>}
      {/* R4a: a finished number shows its state once, as a badge; the others say it in the line. */}
      {column === 'cerrado'
        ? <span className="qb-final"><small>{serviceNames[ticket.service] ?? ticket.service}</small><StatusBadge value={ticket.state} label={finalNames[ticket.state]} /></span>
        : <small>{serviceNames[ticket.service] ?? ticket.service} · {stateText(ticket, call)}</small>}
      {held[ticket.id] ? <div className="row-actions ag-held" role="status"><HoldCountdown deadline={held[ticket.id]} what="No se presentó" /><button type="button" className="row-action" onClick={() => onUndoAbsence(ticket.id)}><Icon name="retry" size={16} />Deshacer</button></div>
      : <div className="row-actions">
        {/* R1: only allowed actions; «No se presentó» stays visible (disabled, reason as tooltip) because it is the next step after the calls. */}
        {ACTION_ORDER.map(name => <ActionButton key={name} action={name} allowed={allowed} blocked={blocked} showBlocked={name === 'no_se_presento' || (name === 'llamar' && ticket.state === 'llamado')} disabled={busy} onClick={() => void (name === 'no_se_presento' ? onMove(ticket, 'cerrado') : onTransition(ticket, actionPath[name]))}>{actionLabel(ticket, name)}{name === 'llamar' && <> <Icon name="arrow" size={16} /></>}</ActionButton>)}
        {ticket.state === 'en_atencion' && ticket.consultationId && ticket.consultationState === 'abierta' && <a className="row-action" href={`#/consultas?consulta=${ticket.consultationId}`}>Retomar consulta <Icon name="arrow" size={16} /></a>}
        {/* Audit D42: «Deshacer llamado» stays on every called card the server lets this account undo, not only right after the call. */}
        {call && ticket.state === 'llamado' && (canUndoCall(ticket) || !!undos[ticket.id]) && <button type="button" className="row-action" disabled={busy}
          title={ticket.llamados > 1 ? `Quita el último llamado; quedan ${ticket.llamados - 1}.` : 'El número vuelve a En espera.'}
          onClick={() => onUndo(undos[ticket.id] ?? { ticketId: ticket.id, label: '', version: ticket.version })}><Icon name="retry" size={16} />Deshacer llamado</button>}
        <QueueCardMenu label={`Más acciones de ${ticketCode(ticket)}`} disabled={busy} items={cardMenuItems(ticket, { moves, priorities: changingPriority, canVoid: voidable(ticket, issue, now),
          onMove: to => void onMove(ticket, to), onPriority: p => void onPriority(ticket, p), onVoid: () => onVoid(ticket) })} />
      </div>}
      </li>;
    })}</ul>{shownTickets.length < tickets.length && <button type="button" className="cl-link-button qb-more" onClick={() => setUnfolded(true)}>Ver {tickets.length - shownTickets.length} más</button>}</> : <p className="muted">Nadie por ahora.</p>}</section>;
}

/** Audit D30: voiding cannot be undone, so it asks first and names the number and the patient. */
export function VoidDialog({ code, patient, busy, error, onClose, onConfirm }: { code: string; patient?: string | null; busy: boolean; error: Remote<unknown>['error']; onClose: () => void; onConfirm: () => void }) {
  return <Dialog title="Anular número" onClose={onClose} busy={busy}><div className="module-form">
    <p>¿Anular <strong>{code} · {patient || 'Paciente no identificado'}</strong>? El número sale de la fila como «Anulado» y no se puede deshacer.</p>
    <WriteError error={error} />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Volver</button>
      <button type="button" className="primary-button" disabled={busy} onClick={onConfirm}>{busy ? 'Anulando…' : 'Anular número'}</button></div></div></Dialog>;
}

/** B-3: «Anular» while the server says this reader issued it and the 10 minutes have not passed. */
const voidable = (ticket: QueueTicket, issue: boolean, now: number) => issue && ticket.state === 'en_espera' && !!ticket.voidableUntil && Date.parse(ticket.voidableUntil) > now;

/**
 * Keyboard and touch alternative to dragging (owner batch 2, S28). A move whose server action is already a button on
 * the card («Llamar», «Iniciar atención», «Completar», «No se presentó») is not repeated here, so the menu only offers
 * what the card does not show: back to waiting, remove one call, void, and the priority.
 */
function cardMenuItems(ticket: QueueTicket, options: { moves: { to: BoardColumn; action: QueueMoveAction }[]; priorities: boolean; canVoid: boolean;
  onMove: (to: BoardColumn) => void; onPriority: (priority: Priority) => void; onVoid: () => void }): CardMenuItem[] {
  const onCard = new Set<string>(ACTION_ORDER.filter(name => (ticket.allowedActions ?? []).includes(name)));
  const items: CardMenuItem[] = options.moves.filter(item => !onCard.has(item.action))
    .map(item => ({ key: `mover:${item.to}`, label: `Mover a ${COLUMN_LABEL[item.to as Column]}`, onSelect: () => options.onMove(item.to) }));
  if (options.canVoid) items.push({ key: 'anular', label: 'Anular número (emitido por error)', onSelect: options.onVoid });
  if (options.priorities) for (const p of (['emergencia', 'urgente', 'rutina'] as Priority[]).filter(p => p !== (ticket.priority ?? 'rutina')))
    items.push({ key: `prioridad:${p}`, label: `Cambiar a ${PRIORITY_LABEL[p]}`, group: 'Prioridad', onSelect: () => options.onPriority(p) });
  return items;
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
  return <Dialog title="Emitir número de fila" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><WriteError error={action.error} onReload={onSaved} /><Select label="Servicio" value={service} onChange={setService} required>{services.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select>{!own && <SearchPicker label="Paciente" value={patient} onChange={setPatient} search={patientPicker(api, 'attend')} required emptyText="No hay pacientes con ese nombre, DUI o expediente." />}
    {!own && <fieldset className="choice-list qb-priority-choice"><legend>Prioridad</legend>{(['rutina', 'urgente', 'emergencia'] as Priority[]).map(p => <label className="check-field" key={p}><input type="radio" name="prioridad" value={p} checked={priority === p} onChange={() => setPriority(p)} aria-label={PRIORITY_LABEL[p]} /> <PriorityBadge value={p} /></label>)}</fieldset>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Emitir número" disabled={!own && !patient} /></div></form></Dialog>;
}
