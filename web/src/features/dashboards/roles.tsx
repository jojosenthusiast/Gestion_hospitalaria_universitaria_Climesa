import type { ReactNode } from 'react';
import { MoreLink } from '../../components/fold';
import { BarChart, HBarList, type Tone } from '../../components/charts';
import { can, roleNames, staffTypeNames, type AccessProfile, type Appointment, type AuditRow, type Shift } from '../../lib/api';
import { formatDate, formatDateTime, formatDuration, formatPercent, formatRelative, formatTime, joinParts, minutesSince, plural } from '../../lib/format';
import { StatusBadge } from '../../components/system';
import type { Remote } from '../common';
import { isUnclosed, milestoneNames, priorityLevel, priorityNames, stateNames as unitStateNames, typeNames } from '../ambulance/types';
import { isPendingCategoryRequest } from '../listas/requests';
import { shownState } from '../listas/schedule';
import type { IndicatorSeries } from '../metrics';
import type { AdmissionRow, DashboardData, LabOrderRow, QueueTicket, Source, StockRow } from './data';
import { unitPlural } from '../inventory/model';
import { auditActionLabel } from './labels';
import { coverageTodayGroup } from './coverage-tray';
import { needsStaffLink } from '../personal/filters';
import { waitingSplit, waitingSplitText } from '../listas/queue-board';
import { BedTypeBreakdown, bedTypeCounts } from '../../components/bed-types';
import { AttentionList, Panel, PanelState, isToday, localDay, timeLabel, type Figure, type QuickAction, type TrayGroupSpec } from './parts';

export type RoleId = 'ADM' | 'JOP' | 'DPD' | 'REC' | 'ENF' | 'MED' | 'LAB' | 'PAR' | 'PAC';
export type Ctx = { d: DashboardData; profile: AccessProfile };
/**
 * R4a (S2): every role uses the «panel del día» pattern. `tray` feeds the ONE pending tray, `figures` the day's
 * figures (each datum once, never also a tray count), `panels` only content that is not a repeated number.
 */
export type RoleDashboard = { title: string; needs: Source[]; actions: QuickAction[]; tray: (c: Ctx) => TrayGroupSpec[]; figures: (c: Ctx) => Figure[]; panels?: (c: Ctx) => ReactNode };

const open = (state: string) => !['cancelada', 'rechazada', 'no_asistio'].includes(state);
const todays = (rows: Appointment[]) => rows.filter(a => isToday(a.start) && open(a.state)).sort((a, b) => a.start.localeCompare(b.start));
const tickets = (rows: QueueTicket[], state: string) => rows.filter(t => t.state === state);
const fig = <T,>(id: string, label: string, state: Remote<T>, read: (data: T) => number | string | null, extra: Partial<Figure> = {}): Figure => ({ id, label, state: state as Remote<unknown>, value: state.data ? read(state.data) : null, ...extra });
const grid = (children: ReactNode) => <div className="dash-grid">{children}</div>;
/** Owner batch 5 (S4): «En espera» says how many came to the queue today and how many have an appointment. */
const waitingFigure = (d: DashboardData) => fig('espera', 'En espera', d.queue, r => waitingSplit(r).total, { href: '#/fila', detail: d.queue.data ? waitingSplitText(waitingSplit(d.queue.data)) : undefined });
/** Owner batch 5 (S4): free beds per room type under the total, read from the bed board when the account has it. */
const freeByType = (d: DashboardData) => d.beds.data ? <BedTypeBreakdown counts={bedTypeCounts(d.beds.data.map(b => ({ category: b.category, free: b.state === 'libre' })))} /> : undefined;
const shiftText = (s: Shift) => `${isToday(s.start) ? 'Hoy' : formatDate(s.start, { withYear: false })} · ${timeLabel(s.start)}–${timeLabel(s.end)} · ${s.area}`;
const nextShift = (rows: Shift[]) => [...rows].filter(s => s.state !== 'cancelado' && new Date(s.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0];
const PRIORITY_ORDER: Record<string, number> = { emergencia: 0, urgente: 1, rutina: 2 };
const asRemote = <T,>(remote: Remote<T>) => remote as Remote<unknown>;

type TimelineItem = { id: string; start: string; end?: string; title: string; detail?: string; tag: ReactNode };
/** R3: `limit` rows at most; the rest folds behind «Ver N más», a link to the full screen (`moreHref`). */
function Timeline({ items: all, limit = 8, moreHref }: { items: TimelineItem[]; limit?: number; moreHref?: string }) {
  const now = Date.now(), items = all.slice(0, limit);
  return <><ol className="timeline">{items.map(item => {
    const current = new Date(item.start).getTime() <= now && (!item.end || new Date(item.end).getTime() > now);
    return <li key={item.id} className={current ? 'is-now' : undefined}><time dateTime={item.start}>{timeLabel(item.start)}</time><div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div>{item.tag}</li>;
  })}</ol>{moreHref && <MoreLink count={all.length - items.length} href={moreHref} />}</>;
}

/** Today's agenda, still to come first: a past confirmed appointment reads «Vencida», never «Confirmada» hours later (W-REC-7). */
function AppointmentsToday({ appts }: { appts: Remote<Appointment[]> }) {
  return <Panel title="Agenda de hoy" icon="calendar" action={{ label: 'Abrir citas', href: '#/citas' }}>
    <PanelState state={appts} empty={rows => todays(rows).length === 0 ? 'No hay citas para hoy.' : null}>{rows => {
      const now = Date.now(), list = todays(rows), ahead = list.filter(a => Date.parse(a.end) >= now), past = list.filter(a => Date.parse(a.end) < now);
      return <Timeline moreHref="#/citas" items={[...ahead, ...past].map(a => ({ id: a.id, start: a.start, end: a.end, title: a.patientName, detail: a.doctorName, tag: <StatusBadge value={shownState(a, now)} /> }))} />;
    }}</PanelState>
  </Panel>;
}

/** R7 F3: today's (or the next) own shift, with the way to «Mis turnos» (the calendar filtered to this person). */
export function MyShift({ shifts }: { shifts: Remote<Shift[]> }) {
  return <Panel title="Mi turno" icon="clock" action={{ label: 'Ver mis turnos', href: '#/turnos?persona=yo' }}>
    <PanelState state={shifts} empty={rows => nextShift(rows) ? null : 'No tienes turnos publicados próximos.'}>{rows => {
      const next = nextShift(rows)!, active = new Date(next.start).getTime() <= Date.now();
      return <div className="my-shift"><StatusBadge value={active ? 'en_curso' : 'publicado'} label={active ? 'En curso' : 'Próximo'} /><strong>{shiftText(next)}</strong></div>;
    }}</PanelState>
  </Panel>;
}

/** Shifts that put someone at work right now: published or in progress, already started and not over. */
const onShiftNow = (rows: (Shift & { staffType?: string | null })[], now = Date.now()) => rows.filter(s => (s.state === 'publicado' || s.state === 'en_curso') && Date.parse(s.start) <= now && Date.parse(s.end) > now);

/**
 * Owner obs 3/14: an account without a staff record (Administración, Jefatura de Operaciones) has no shift of its own,
 * so instead of an empty «Mi turno» it sees who is at work now: people on shift per role (counts only, no names) and,
 * when the pending tray does not already list them, today's coverage holes. The link opens today in Turnos · Día.
 */
export function OnShiftNow({ shifts, gapsToday }: { shifts: Remote<Shift[]>; gapsToday?: number | null }) {
  return <Panel title="De turno ahora" icon="users" action={{ label: 'Ver turnos de hoy', href: '#/turnos?dia=hoy' }}>
    <PanelState state={shifts} empty={rows => onShiftNow(rows).length === 0 ? 'Nadie está de turno en este momento.' : null}>{rows => {
      const now = onShiftNow(rows), by = new Map<string, number>();
      for (const s of now as (Shift & { staffType?: string | null })[]) { const type = s.staffType ?? 'otro'; by.set(type, (by.get(type) ?? 0) + 1); }
      return <div className="on-shift-now">
        <p className="on-shift-total"><strong>{now.length}</strong> {now.length === 1 ? 'persona de turno' : 'personas de turno'}</p>
        <ul className="on-shift-roles" aria-label="De turno por rol">
          {[...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([type, count]) => <li key={type}><span>{staffTypeNames[type] ?? type}</span><strong>{count}</strong></li>)}
        </ul>
        {typeof gapsToday === 'number' && <p className="on-shift-gaps">{gapsToday === 0 ? 'Sin huecos de cobertura por cubrir hoy.' : <a className="row-action" href="#/turnos?dia=hoy">{gapsToday === 1 ? '1 turno por cubrir hoy' : `${gapsToday} turnos por cubrir hoy`}</a>}</p>}
      </div>;
    }}</PanelState>
  </Panel>;
}

/** Zero stock reads «Agotado» (urgent), never «Bajo mínimo» with the waiting clock (coordinator, prod). */
const stockState = (r: { disponible: number; vencido: number; bajo_minimo: boolean }) => r.disponible <= 0 ? { tag: 'Agotado', status: 'agotado' } : r.vencido > 0 ? { tag: 'Vencido', status: 'vencido' } : r.bajo_minimo ? { tag: 'Bajo mínimo', status: 'bajo_minimo' } : { tag: 'Por vencer', status: 'por_vencer' };
const unitsOf = unitPlural;
/** `/inventario/existencias` returns one row per lot and warehouse, repeating the article columns: keep one row per article. */
const perArticle = (rows: StockRow[]) => [...new Map(rows.map(r => [r.articulo_id, { ...r, minimo: Number(r.minimo), disponible: Number(r.disponible), vencido: Number(r.vencido) }])).values()];
/** Same window as the API (`EXPIRING_DAYS`): active stock of lots that expire within 30 days, per article. */
const EXPIRING_DAYS = 30;
/** `/inventario/existencias` also carries each lot's expiry and quantity (StockResponse). */
const expiringSoon = (rows: (StockRow & { expiresAt?: string | null; quantity?: string | number | null })[]) => {
  const today = localDay(), limit = localDay(new Date(Date.now() + EXPIRING_DAYS * 86400000)), soon = new Map<string, number>();
  for (const r of rows) {
    const day = r.expiresAt?.slice(0, 10), quantity = Number(r.quantity ?? 0);
    if (day && day >= today && day <= limit && quantity > 0) soon.set(r.articulo_id, (soon.get(r.articulo_id) ?? 0) + quantity);
  }
  return soon;
};
const lowStock = (d: DashboardData): TrayGroupSpec => {
  const soon = expiringSoon(d.stock.data ?? []);
  return {
    id: 'inventario', title: 'Inventario bajo el mínimo', href: '#/inventario', masculine: true, state: asRemote(d.stock),
    items: perArticle(d.stock.data ?? []).filter(r => r.bajo_minimo || r.vencido > 0 || soon.has(r.articulo_id)).map(r => ({ id: r.articulo_id, title: r.nombre, detail: [(r.bajo_minimo || r.disponible <= 0) && `Quedan ${plural(r.disponible, r.unidad, unitsOf(r.unidad))} · mínimo ${r.minimo}`, r.vencido > 0 && `${plural(r.vencido, r.unidad, unitsOf(r.unidad))} vencidos`, soon.has(r.articulo_id) && `${plural(soon.get(r.articulo_id) as number, r.unidad, unitsOf(r.unidad))} por vencer`].filter(Boolean).join(' · '), tone: 'warn' as Tone, href: '#/inventario', action: 'Ver', ...stockState(r) })),
  };
};
/**
 * «Despachar» only when this person may dispatch and the unit can leave now (the request's «Confirmar y despachar» is
 * enabled); otherwise the row opens the request to read it.
 */
const pendingAmbulance = (d: DashboardData, profile: AccessProfile): TrayGroupSpec => {
  const s = d.ambulance.data, canDispatch = can(profile, 'ambulancia.despachar') && s?.unit.state === 'disponible' && !s.dispatchBlock;
  return {
    id: 'ambulancia', title: 'Ambulancia por confirmar', href: '#/ambulancia', state: asRemote(d.ambulance),
    items: (s?.pendingRequests ?? []).map(r => ({ id: `r-${r.id}`, title: r.reason, detail: `${r.address} · ${formatRelative(r.createdAt)}`, tone: 'urgent' as Tone, href: '#/ambulancia', action: canDispatch ? 'Despachar' : 'Ver solicitud', area: 'AMB' as const })),
  };
};
/** A service still open 12 h after dispatch blocks every new dispatch; whoever may close it (Jefatura) sees it on Inicio. */
export const unclosedAmbulance = (d: DashboardData): TrayGroupSpec => {
  const s = d.ambulance.data?.activeService;
  const stuck = s && s.allowedActions?.includes('cerrar') && isUnclosed(s.dispatchedAt) ? [s] : [];
  return { id: 'ambulancia-sin-cierre', title: 'Servicio de ambulancia sin cierre', href: '#/ambulancia', masculine: true, state: asRemote(d.ambulance),
    items: stuck.map(x => ({ id: `u-${x.id}`, title: `${typeNames[x.type] ?? x.type} · ${x.origin}`, detail: `Despachado ${formatRelative(x.dispatchedAt)}; la unidad no puede salir a otro servicio`, tone: 'urgent' as Tone, href: '#/ambulancia', action: 'Cerrar', area: 'AMB' as const, tag: 'Sin cierre', status: 'vencido' })) };
};
/** R7 G3: an admission the doctor indicated in the consultation; Recepción only picks the bed. */
const indicated = (a: AdmissionRow) => a.state === 'pendiente_cama' && a.origin === 'consulta';
const indicatedAdmissions = (d: DashboardData): TrayGroupSpec => ({
  id: 'ingresos-indicados', title: 'Ingresos indicados', href: '#/hospitalizacion', state: asRemote(d.admissions),
  items: (d.admissions.data ?? []).filter(indicated).map(a => ({ id: `i-${a.id}`, title: a.patientName, detail: [a.attendingDoctorName, a.isolation ? 'Aislamiento' : null, a.motive].filter(Boolean).join(' · ') || undefined, tone: 'warn' as Tone, href: `#/hospitalizacion?ingresar=${a.id}`, action: 'Ingresar', tag: 'Indicado', status: 'pendiente_cama' })),
});
const noBed = (d: DashboardData): TrayGroupSpec => ({
  id: 'sin-cama', title: 'Admisiones sin cama', href: '#/hospitalizacion', state: asRemote(d.admissions),
  items: (d.admissions.data ?? []).filter(a => a.state === 'pendiente_cama' && !indicated(a)).map(a => ({ id: `a-${a.id}`, title: a.patientName, tone: 'warn' as Tone, href: `#/hospitalizacion?ingresar=${a.id}`, action: 'Asignar cama', tag: 'Sin cama', status: 'pendiente_cama' })),
});

const labCount = (rows: LabOrderRow[], state: string) => rows.filter(o => o.state === state).length;
const pendingReview = (rows: LabOrderRow[]) => rows.filter(o => o.state === 'completado' && !o.reviewedAt);
// D3: the lab's turnaround comes from GET /laboratorio/tiempo-entrega (same rule as /metricas/tiempo_laboratorio,
// external reports excluded), never from the completed orders of the list, which is capped to the latest 300.
const turnaroundDay = (series: IndicatorSeries, day: string) => series.serie?.find(p => p.fecha === day);
const minutesText = (value: number | null | undefined) => value == null ? null : formatDuration(Math.round(value));
const occupancy = (b: { camas: { total: number; libres: number } }) => b.camas.total ? Math.round(((b.camas.total - b.camas.libres) / b.camas.total) * 100) : null;

// ───────────────────────────── ADM · administración del sistema (sin contenido clínico)
const adm: RoleDashboard = {
  title: 'Administración del sistema',
  needs: ['users', 'staff', 'board'],
  actions: [
    { id: 'invitar', label: 'Invitar persona', hint: 'Crea la cuenta y envía el correo de activación', icon: 'userPlus', href: '#/personal?accion=invitar', permission: 'usuarios.invitar' },
    { id: 'espacio', label: 'Agregar espacio', hint: 'Planta, habitación o cama del edificio', icon: 'building', href: '#/espacios?accion=crear', permission: 'espacios.configurar' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores del hospital por día', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  tray: ({ d }) => [{
    id: 'cuentas', title: 'Cuentas sin personal vinculado', href: '#/personal?cuenta=sin_ficha', state: asRemote(d.users),
    items: (d.users.data ?? []).filter(u => needsStaffLink(u)).map(u => ({ id: u.id, title: u.name || u.email, detail: u.roles.map(r => roleNames[r] ?? r).join(' · '), tone: 'warn' as Tone, href: `#/personal?cuenta=sin_ficha&vincular=${u.id}`, action: 'Vincular' })),
  }],
  figures: ({ d }) => [
    fig('cuentas-activas', 'Cuentas activas', d.users, u => u.filter(x => x.state === 'activo').length, { href: '#/personal?cuenta=con' }),
    fig('cuentas-inactivas', 'Cuentas desactivadas', d.users, u => u.filter(x => x.state !== 'activo').length || null),
    fig('personal', 'Personal activo', d.staff, s => s.filter(x => x.active).length, { href: '#/personal' }),
    fig('ocupacion', 'Ocupación de camas', d.board, b => { const p = occupancy(b); return p === null ? null : formatPercent(p); }, { href: '#/camas' }),
    fig('turnos', 'Turnos en curso', d.board, b => b.turnosEnCurso, { href: '#/turnos' }),
  ],
  panels: ({ d }) => grid(<>
    <Panel title="Cuentas activas por rol" icon="users">
      <PanelState state={d.users} empty={rows => rows.length === 0 ? 'Sin cuentas todavía.' : null}>{rows => {
        const by = new Map<string, number>(); rows.filter(r => r.state === 'activo').forEach(r => r.roles.forEach(role => by.set(role, (by.get(role) ?? 0) + 1)));
        return <HBarList title="Cuentas activas por rol" data={[...by].sort((a, b) => b[1] - a[1]).map(([role, value]) => ({ label: roleNames[role] ?? role, value, tone: 'primary' as Tone }))} />;
      }}</PanelState>
    </Panel>
    <Panel title="Personal activo por función" icon="user" action={{ label: 'Abrir personal', href: '#/personal' }}>
      <PanelState state={d.staff} empty={rows => rows.length === 0 ? 'No hay personal registrado.' : null}>{rows => {
        const by = new Map<string, number>(); rows.filter(r => r.active).forEach(r => by.set(r.type, (by.get(r.type) ?? 0) + 1));
        return <HBarList title="Personal activo por función" data={[...by].sort((a, b) => b[1] - a[1]).map(([type, value]) => ({ label: staffTypeNames[type] ?? type, value, tone: 'info' as Tone }))} />;
      }}</PanelState>
    </Panel>
  </>),
};

// ───────────────────────────── JOP · operación (agregados, sin nombres)
const jop: RoleDashboard = {
  title: 'Operación del hospital',
  needs: ['board', 'queue', 'beds', 'admissions', 'stock', 'ambulance'],
  actions: [
    { id: 'admision', label: 'Nueva admisión', hint: 'Ingresar a un paciente para hospitalizar', icon: 'bed', href: '#/hospitalizacion?accion=admision', permission: 'admision.crear' },
    { id: 'turno', label: 'Planificar turno', hint: 'Asignar personal a un área', icon: 'calendar', href: '#/turnos?accion=planificar', permission: 'turnos.planificar' },
    { id: 'aviso', label: 'Publicar aviso', hint: 'Comunicado para el personal o la pantalla pública', icon: 'megaphone', href: '#/avisos?accion=publicar', permission: 'avisos.publicar' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores con gráficos y exportación', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  tray: ({ d, profile }) => [
    coverageTodayGroup(d),
    indicatedAdmissions(d), noBed(d), unclosedAmbulance(d), pendingAmbulance(d, profile), lowStock(d),
  ],
  figures: ({ d }) => [
    fig('camas-libres', 'Camas libres', d.board, b => b.camas.libres, { href: '#/camas', of: d.board.data ? `de ${d.board.data.camas.total}` : undefined, detail: freeByType(d) }),
    fig('limpieza', 'En limpieza', d.board, b => b.camas.limpieza),
    waitingFigure(d),
    fig('llamados', 'Llamados', d.board, b => b.fila.llamados),
    fig('lab-pendiente', 'Órdenes por tomar', d.board, b => b.laboratorio.pendiente, { href: '#/laboratorio' }),
    fig('lab-proceso', 'Órdenes en proceso', d.board, b => b.laboratorio.enProceso),
    fig('turnos', 'Turnos en curso', d.board, b => b.turnosEnCurso, { href: '#/turnos' }),
  ],
};

// ───────────────────────────── DPD · protección de datos
const AUDIT_LIMIT = 200;
const failedEvents = (rows: AuditRow[]) => rows.filter(r => r.result !== 'exito');
const FAILED_HREF = '#/auditoria?resultado=denegado,fallido';
/** W04 · DPD: «cadena de auditoría por verificar» while nobody ran `auditoria.verificar` today (read from the latest events). */
const chainUnverified = (d: DashboardData): TrayGroupSpec => ({
  id: 'cadena', title: 'Cadena sin verificar hoy', href: '#/auditoria?accion=verificar', state: asRemote(d.audit),
  items: d.audit.data && !d.audit.data.some(r => r.action === 'auditoria.verificar' && isToday(r.at))
    ? [{ id: 'cadena', title: 'Integridad de la bitácora', detail: 'Nadie la ha verificado hoy', tone: 'warn' as Tone, href: '#/auditoria?accion=verificar', action: 'Verificar' }] : [],
});
const dpd: RoleDashboard = {
  title: 'Protección de datos',
  needs: ['audit', 'users'],
  actions: [
    { id: 'buscar', label: 'Buscar en la auditoría', hint: 'Por persona, paciente, acción o fecha', icon: 'search', href: '#/auditoria', permission: 'auditoria.ver' },
    { id: 'cadena', label: 'Verificar la cadena', hint: 'Comprueba que nadie alteró la bitácora', icon: 'shield', href: '#/auditoria?accion=verificar', permission: 'auditoria.ver' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores agregados', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  tray: ({ d }) => [chainUnverified(d), {
    id: 'denegados', title: 'Eventos denegados o fallidos', href: FAILED_HREF, masculine: true, state: asRemote(d.audit),
    items: failedEvents(d.audit.data ?? []).map(r => ({ id: r.seq, title: auditActionLabel(r.action), detail: `${roleNames[r.role] ?? r.role} · ${formatDateTime(r.at, { short: true })}`, tone: 'urgent' as Tone, href: FAILED_HREF, action: 'Revisar', tag: r.result === 'denegado' ? 'Denegado' : 'Fallido', status: r.result === 'denegado' ? 'denegado' : 'fallido' })),
  }],
  figures: ({ d }) => [
    // The list holds the latest 200 events: at the cap the real total is larger, so it reads «200+» (W-DPD-1).
    fig('eventos-hoy', 'Eventos de hoy', d.audit, r => { const n = r.filter(x => isToday(x.at)).length; return n >= AUDIT_LIMIT ? `${AUDIT_LIMIT}+` : n; }, { href: '#/auditoria' }),
    fig('cuentas-activas', 'Cuentas activas', d.users, u => u.filter(x => x.state === 'activo').length),
  ],
  panels: ({ d }) => grid(<Panel title="Acciones más frecuentes" icon="chart">
    <PanelState state={d.audit} empty={rows => rows.length === 0 ? 'Sin actividad para graficar.' : null}>{rows => {
      const by = new Map<string, number>(); rows.forEach(r => { const label = auditActionLabel(r.action); by.set(label, (by.get(label) ?? 0) + 1); });
      return <HBarList title="Acciones auditadas más frecuentes" data={[...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value, tone: 'primary' as Tone }))} />;
    }}</PanelState>
  </Panel>),
};

// ───────────────────────────── REC · recepción
/** Requests group stays loading until both sources answer; an error of either shows with its retry. */
const requestsState = (d: DashboardData): Remote<unknown> => {
  const appts = asRemote(d.appts), requests = asRemote(d.apptRequests);
  return appts.error ? appts : requests.error ? requests : !appts.data ? appts : requests.loading && !requests.data ? requests : appts;
};
const rec: RoleDashboard = {
  title: 'Recepción',
  needs: ['summary', 'queue', 'beds', 'appts', 'apptRequests', 'admissions', 'ambulance'],
  actions: [
    { id: 'registrar', label: 'Registrar paciente', hint: 'Busca primero y registra si no existe', icon: 'userPlus', href: '#/pacientes?accion=registrar', permission: 'pacientes.registrar' },
    { id: 'agendar', label: 'Agendar cita', hint: 'Paciente, médico y horario disponible', icon: 'calendar', href: '#/citas?accion=agendar', permission: 'citas.agendar' },
    { id: 'emitir', label: 'Emitir número', hint: 'Número de fila para quien llega', icon: 'queue', href: '#/fila?accion=emitir', permission: 'fila.emitir', primary: true },
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'megaphone', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'ambulancia', label: 'Solicitar ambulancia', hint: 'Registrar una solicitud de traslado', icon: 'ambulance', href: '#/ambulancia?accion=solicitud', permission: 'ambulancia.solicitar' },
  ],
  tray: ({ d, profile }) => [
    // S8: asked appointments and requests by category both wait on Recepción: one group, one count (same as Citas).
    { id: 'solicitudes', title: 'Solicitudes de cita', href: '#/citas?vista=solicitudes', state: requestsState(d),
      items: [
        ...(d.apptRequests.data ?? []).filter(isPendingCategoryRequest).map(r => ({ id: `s-${r.id}`, title: r.patientName ?? 'Paciente', detail: joinParts(r.categories.map(c => c.name).join(', '), r.note, formatRelative(r.createdAt)), tone: 'warn' as Tone, href: `#/citas?asignar=${r.id}`, action: 'Asignar', tag: 'Por asignar', status: 'pendiente' })),
        ...(d.appts.data ?? []).filter(a => a.state === 'solicitada').map(a => ({ id: `c-${a.id}`, title: a.patientName, detail: `${formatDate(a.start, { withYear: false })}, ${timeLabel(a.start)} · ${a.doctorName}`, tone: 'warn' as Tone, href: '#/citas?vista=solicitudes', action: 'Confirmar', tag: 'Por confirmar', status: 'solicitada' })),
      ] },
    indicatedAdmissions(d), noBed(d), pendingAmbulance(d, profile),
  ],
  figures: ({ d }) => [
    waitingFigure(d),
    fig('llamados', 'Llamados', d.queue, r => tickets(r, 'llamado').length, { href: '#/fila' }),
    fig('citas-hoy', 'Citas de hoy', d.appts, r => todays(r).length, { href: '#/citas' }),
    fig('camas-libres', 'Camas libres', d.summary, s => s.beds ? s.beds.free : null, { href: '#/camas', of: d.summary.data?.beds ? `de ${d.summary.data.beds.total}` : undefined, detail: freeByType(d) }),
    fig('pacientes', 'Pacientes activos', d.summary, s => s.patients ? s.patients.active : null, { href: '#/pacientes' }),
  ],
  panels: ({ d }) => grid(<AppointmentsToday appts={d.appts} />),
};

// ───────────────────────────── Estación de asistencia (Lote 5 S10: Asistencia se unió a Enfermería)
const priorityOf = (t: QueueTicket) => PRIORITY_ORDER[(t as QueueTicket & { priority?: string }).priority ?? 'rutina'] ?? 2;
/** The old assistant station, now part of Enfermería. It shows only to an account that reads the queue (`fila.ver`). */
const stationFigures = (d: DashboardData): Figure[] => [
  waitingFigure(d),
  fig('llamados', 'Llamados', d.queue, r => tickets(r, 'llamado').length),
  fig('atendidos', 'Atendidos hoy', d.queue, r => tickets(r, 'atendido').length),
];
/* WC-51: same order as the queue rule (emergencies, then urgent, then arrival number), never by issue time alone. */
const WhoIsNext = ({ d }: { d: DashboardData }) => <Panel title="Quién sigue" icon="megaphone" action={{ label: 'Abrir la fila', href: '#/fila' }}>
  <PanelState state={d.queue}>{rows => <AttentionList empty="Nadie espera ahora." moreHref="#/fila" items={tickets(rows, 'en_espera').sort((a, b) => priorityOf(a) - priorityOf(b) || a.numero - b.numero).map(t => ({ id: t.id, title: t.patientName ?? `Número ${t.numero}`, detail: `Número ${t.numero} · espera ${formatDuration(minutesSince(t.issuedAt))}`, tone: 'info' as Tone, href: '#/fila?accion=llamar', action: 'Llamar' }))} />}</PanelState>
</Panel>;

// ───────────────────────────── ENF · mi planta
const enf: RoleDashboard = {
  title: 'Mi planta',
  needs: ['beds', 'admissions', 'stock', 'myShifts', 'queue'],
  actions: [
    { id: 'limpieza', label: 'Registrar limpieza', hint: 'Marca una cama limpia para su verificación', icon: 'bed', href: '#/camas?accion=limpieza', permission: 'camas.registrar_limpieza' },
    { id: 'hospitalizados', label: 'Ver hospitalizados', hint: 'Pacientes con cama asignada', icon: 'users', href: '#/hospitalizacion', permission: 'admision.ver' },
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'megaphone', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'buscar', label: 'Buscar paciente', hint: 'Por nombre, DUI o expediente', icon: 'search', href: '#/pacientes', permission: 'pacientes.buscar' },
  ],
  tray: ({ d }) => [{
    id: 'limpiezas', title: 'Limpiezas por registrar o verificar', href: '#/camas', state: asRemote(d.beds),
    items: (d.beds.data ?? []).filter(b => b.cleaningPending || (b.cleaningCompleted && !b.cleanedByCurrentUser && b.state === 'limpieza')).map(b => ({ id: b.id, title: `Cama ${b.code}`, detail: b.room, tone: 'warn' as Tone, href: '#/camas', action: b.cleaningPending ? 'Registrar' : 'Verificar', tag: b.cleaningPending ? 'Por limpiar' : 'Por verificar', status: 'limpieza' })),
  }, lowStock(d)],
  figures: ({ d, profile }) => [
    fig('ocupadas', 'Camas ocupadas', d.beds, r => r.filter(b => b.state === 'ocupada').length, { href: '#/camas', of: d.beds.data ? `de ${d.beds.data.length}` : undefined }),
    fig('bloqueadas', 'Bloqueadas', d.beds, r => r.filter(b => b.state === 'bloqueada').length || null),
    fig('hospitalizados', 'Hospitalizados', d.admissions, r => r.filter(a => a.state === 'hospitalizado').length, { href: '#/hospitalizacion' }),
    ...(can(profile, 'fila.ver') ? stationFigures(d) : []),
  ],
  panels: ({ d, profile }) => grid(<>{can(profile, 'fila.ver') && <WhoIsNext d={d} />}<MyShift shifts={d.myShifts} /></>),
};

// ───────────────────────────── MED · mi día
const med: RoleDashboard = {
  title: 'Mi día',
  needs: ['agenda', 'lab', 'queue', 'admissions', 'myShifts'],
  actions: [
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'megaphone', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'consulta', label: 'Iniciar consulta', hint: 'Abre tu agenda y atiende al paciente', icon: 'steth', href: '#/consultas', permission: 'consulta.iniciar' },
    { id: 'examen', label: 'Pedir examen', hint: 'Orden de laboratorio para un paciente', icon: 'lab', href: '#/laboratorio?accion=orden', permission: 'laboratorio.ordenar' },
  ],
  tray: ({ d }) => [{
    id: 'liberar', title: 'Resultados por liberar', href: '#/laboratorio', masculine: true, state: asRemote(d.lab),
    items: pendingReview(d.lab.data ?? []).map(o => ({ id: o.id, title: o.patientName ?? 'Paciente', detail: o.items.map(i => i.name).join(', '), tone: 'warn' as Tone, href: '#/laboratorio', action: 'Revisar', status: o.priority === 'urgente' || o.priority === 'emergencia' ? o.priority : undefined })),
  }],
  figures: ({ d }) => [
    fig('citas-hoy', 'Citas de hoy', d.agenda, r => r.filter(a => isToday(a.start)).length, { href: '#/consultas' }),
    waitingFigure(d),
    fig('hospitalizados', 'Hospitalizados', d.admissions, r => r.filter(a => a.state === 'hospitalizado').length, { href: '#/hospitalizacion' }),
  ],
  panels: ({ d }) => grid(<>
    <Panel title="Mi agenda de hoy" icon="calendar" action={{ label: 'Abrir mi consultorio', href: '#/consultas' }}>
      <PanelState state={d.agenda} empty={rows => rows.filter(a => isToday(a.start)).length === 0 ? 'No tienes citas para hoy.' : null}>{rows => <Timeline moreHref="#/consultas" items={rows.filter(a => isToday(a.start)).sort((a, b) => a.start.localeCompare(b.start)).map(a => ({ id: a.appointmentId, start: a.start, end: a.end, title: a.patientName, detail: a.reason ?? undefined, tag: <StatusBadge value={a.consultationState ?? shownState({ state: a.appointmentState, end: a.end })} /> }))} />}</PanelState>
    </Panel>
    <MyShift shifts={d.myShifts} />
  </>),
};

// ───────────────────────────── LAB · laboratorio
const LAB_GOAL_MIN = 60;
const lab: RoleDashboard = {
  title: 'Laboratorio',
  needs: ['lab', 'labTurnaround', 'stock', 'myShifts'],
  actions: [
    { id: 'muestra', label: 'Tomar muestra', hint: 'Confirma la identidad y pasa la orden a proceso', icon: 'drop', href: '#/laboratorio?accion=muestra', permission: 'laboratorio.procesar' },
    { id: 'inventario', label: 'Ver inventario', hint: 'Reactivos, lotes y mínimos', icon: 'inventory', href: '#/inventario', permission: 'inventario.ver' },
  ],
  tray: ({ d }) => [{
    id: 'muestras', title: 'Muestras por tomar', href: '#/laboratorio', state: asRemote(d.lab),
    // External orders are done elsewhere: no sample to take here. Each row opens the sample of its own order.
    items: (d.lab.data ?? []).filter(o => o.state === 'pendiente' && !o.external).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) || a.createdAt.localeCompare(b.createdAt)).map(o => ({ id: o.id, title: o.patientName ?? 'Paciente', detail: `${o.items.map(i => i.name).join(', ')} · ${formatRelative(o.createdAt)}`, tone: 'warn' as Tone, href: `#/laboratorio?orden=${o.id}&accion=muestra`, action: 'Tomar muestra', status: o.priority === 'urgente' || o.priority === 'emergencia' ? o.priority : undefined })),
  }, lowStock(d)],
  figures: ({ d }) => {
    return [
      fig('lab-proceso', 'En proceso', d.lab, r => labCount(r, 'en_proceso'), { href: '#/laboratorio' }),
      fig('lab-hoy', 'Completadas hoy', d.labTurnaround, s => turnaroundDay(s, localDay())?.muestras ?? 0),
      fig('lab-revision', 'Sin revisión médica', d.lab, r => pendingReview(r).length),
      // W-LAB-2: no «—» card when nothing was completed today. D2: the median sits next to the average.
      fig('lab-tiempo', 'Tiempo promedio hoy', d.labTurnaround, s => minutesText(turnaroundDay(s, localDay())?.valor)),
      fig('lab-mediana', 'Mediana hoy', d.labTurnaround, s => minutesText(turnaroundDay(s, localDay())?.mediana)),
    ];
  },
  panels: ({ d }) => {
    const days = Array.from({ length: 7 }, (_, i) => localDay(new Date(Date.now() - (6 - i) * 86400000)));
    return grid(<Panel title="Tiempo de entrega (7 días)" icon="clock">
      <PanelState state={d.labTurnaround}>{s => <BarChart title="Tiempo promedio de entrega por día" unit="min" format={formatDuration} threshold={{ value: LAB_GOAL_MIN, label: `Meta ${LAB_GOAL_MIN} min` }} empty="Aún no hay órdenes completadas en la semana." data={days.map(day => { const v = turnaroundDay(s, day)?.valor ?? null; return { label: `${day.slice(8)}/${day.slice(5, 7)}`, value: v == null ? null : Math.round(v), tone: v == null ? undefined : (v >= LAB_GOAL_MIN * 2 ? 'urgent' : v >= LAB_GOAL_MIN ? 'warn' : 'ok') as Tone }; })} />}</PanelState>
    </Panel>);
  },
};

// ───────────────────────────── PAR · atención prehospitalaria
const par: RoleDashboard = {
  title: 'Mi unidad',
  needs: ['ambulance', 'myShifts'],
  actions: [{ id: 'unidad', label: 'Abrir ambulancia', hint: 'Estado, servicio e hitos', icon: 'ambulance', href: '#/ambulancia', permission: 'ambulancia.ver_estado' }],
  tray: ({ d, profile }) => [pendingAmbulance(d, profile)],
  figures: ({ d }) => [fig('unidad', 'Estado de la unidad', d.ambulance, a => unitStateNames[a.unit.state] ?? 'Otro estado', { href: '#/ambulancia' })],
  panels: ({ d }) => grid(<>
    <Panel title="Servicio en curso" icon="ambulance" action={{ label: 'Abrir ambulancia', href: '#/ambulancia' }}>
      <PanelState state={d.ambulance} empty={s => s.activeService ? null : 'No hay un servicio en curso.'}>{s => <>
        {/* WC-56: the priority enum and milestone codes become labels. */}
        <p className="panel-meta">{s.activeService!.origin} → {s.activeService!.destination} · <StatusBadge value={priorityLevel(s.activeService!.priority)} label={`Prioridad ${(priorityNames[s.activeService!.priority] ?? 'sin clasificar').toLowerCase()}`} /></p>
        <ol className="stepper">{[...(s.activeService!.milestones ?? []).map(m => ({ key: m.type, label: milestoneNames[m.type] ?? 'Hito', done: true, at: formatTime(m.occurredAt) })), ...(s.activeService!.nextMilestones ?? []).map((m, i) => ({ key: `n-${m}`, label: milestoneNames[m] ?? 'Hito', done: false, at: i === 0 ? 'Siguiente' : '' }))].map(step => <li key={step.key} className={step.done ? 'is-done' : undefined}><span aria-hidden="true">{step.done ? '✓' : '·'}</span><strong>{step.label}</strong>{step.at && <small>{step.at}</small>}</li>)}</ol>
      </>}</PanelState>
    </Panel>
    <MyShift shifts={d.myShifts} />
  </>),
};

// ───────────────────────────── PAC · paciente
const upcoming = (rows: Appointment[]) => rows.filter(a => open(a.state) && new Date(a.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start));
const pac: RoleDashboard = {
  title: 'Mi atención',
  needs: ['appts', 'queue', 'myLab'],
  actions: [{ id: 'cita', label: 'Pedir una cita', hint: 'Elige el motivo; recepción te asigna médico y hora', icon: 'calendar', href: '#/citas?accion=solicitar', permission: 'citas.solicitar' }],
  // R7 C-6: an order sent outside tells the patient where to go and what to bring, until it is done.
  tray: ({ d }) => [{
    id: 'examen-externo', title: 'Exámenes en otro sitio', href: '#/inicio', state: asRemote(d.myLab), masculine: true,
    items: (d.myLab.data ?? []).filter(o => o.external && ['pendiente', 'en_proceso'].includes(o.state)).map(o => ({ id: `ext-${o.id}`, title: `Examen en otro sitio: ${o.externalPlace ?? 'lugar por confirmar'}`, detail: [o.items.map(i => i.name).join(', '), o.externalInstructions].filter(Boolean).join(' · '), tone: 'info' as Tone, href: '#/inicio', action: 'Ver', tag: 'En otro sitio' })),
  }],
  figures: ({ d }) => [
    fig('proxima', 'Próxima cita', d.appts, rows => { const next = upcoming(rows)[0]; return next ? `${formatDate(next.start, { withYear: false })}, ${timeLabel(next.start)}` : 'Sin citas'; }, { href: '#/citas' }),
    fig('mi-numero', 'Mi número en la fila', d.queue, rows => rows.find(t => ['en_espera', 'llamado', 'en_atencion'].includes(t.state))?.numero ?? null),
    fig('examenes', 'Exámenes en curso', d.myLab, r => r.filter(o => ['pendiente', 'en_proceso'].includes(o.state)).length),
    fig('resultados', 'Resultados listos', d.myLab, r => r.filter(o => o.state === 'completado' && o.reviewedAt).length),
  ],
  panels: ({ d }) => grid(<Panel title="Mis próximas citas" icon="calendar" action={{ label: 'Abrir citas', href: '#/citas' }}>
    <PanelState state={d.appts} empty={rows => upcoming(rows).length === 0 ? 'No tienes citas próximas.' : null}>{rows => <Timeline limit={5} moreHref="#/citas" items={upcoming(rows).map(a => ({ id: a.id, start: a.start, end: a.end, title: a.doctorName, detail: formatDate(a.start), tag: <StatusBadge value={a.state} /> }))} />}</PanelState>
  </Panel>),
};

export const roleDashboards: Record<RoleId, RoleDashboard> = { ADM: adm, JOP: jop, DPD: dpd, REC: rec, ENF: enf, MED: med, LAB: lab, PAR: par, PAC: pac };
/** Orden de presentación cuando una cuenta tiene varios roles: primero los de gestión, luego los de trabajo directo. */
export const roleOrder: RoleId[] = ['ADM', 'JOP', 'DPD', 'REC', 'LAB', 'MED', 'ENF', 'PAR', 'PAC'];
/** Lote 5 S10 (owner, 2026-11-19: «Unir en Enfermería»): an account that still has the retired AST role gets Enfermería. */
export const canonicalRole = (role: string) => (role === 'AST' ? 'ENF' : role);
