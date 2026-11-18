import type { ReactNode } from 'react';
import { BarChart, HBarList, type Tone } from '../../components/charts';
import { roleNames, staffTypeNames, type AccessProfile, type Appointment, type AuditRow, type Shift } from '../../lib/api';
import { formatDate, formatDuration, formatPercent, formatRelative, formatTime, minutesSince, plural } from '../../lib/format';
import { StatusBadge } from '../../components/system';
import type { Remote } from '../common';
import { milestoneNames, priorityLevel, priorityNames, stateNames as unitStateNames } from '../ambulance/types';
import { isPendingCategoryRequest } from '../listas/requests';
import { shownState } from '../listas/schedule';
import type { AdmissionRow, DashboardData, LabOrderRow, QueueTicket, Source, StockRow } from './data';
import { unitPlural } from '../inventory/model';
import { auditActionLabel } from './labels';
import { AttentionList, Panel, PanelState, isToday, localDay, minutesBetween, timeLabel, type Figure, type QuickAction, type TrayGroupSpec } from './parts';

export type RoleId = 'ADM' | 'JOP' | 'DPD' | 'REC' | 'AST' | 'ENF' | 'MED' | 'LAB' | 'PAR' | 'PAC';
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
const shiftText = (s: Shift) => `${isToday(s.start) ? 'Hoy' : formatDate(s.start, { withYear: false })} · ${timeLabel(s.start)}–${timeLabel(s.end)} · ${s.area}`;
const nextShift = (rows: Shift[]) => [...rows].filter(s => s.state !== 'cancelado' && new Date(s.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0];
const PRIORITY_ORDER: Record<string, number> = { emergencia: 0, urgente: 1, rutina: 2 };
const asRemote = <T,>(remote: Remote<T>) => remote as Remote<unknown>;

function Timeline({ items }: { items: { id: string; start: string; end?: string; title: string; detail?: string; tag: ReactNode }[] }) {
  const now = Date.now();
  return <ol className="timeline">{items.map(item => {
    const current = new Date(item.start).getTime() <= now && (!item.end || new Date(item.end).getTime() > now);
    return <li key={item.id} className={current ? 'is-now' : undefined}><time dateTime={item.start}>{timeLabel(item.start)}</time><div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div>{item.tag}</li>;
  })}</ol>;
}

/** Today's agenda, still to come first: a past confirmed appointment reads «Vencida», never «Confirmada» hours later (W-REC-7). */
function AppointmentsToday({ appts }: { appts: Remote<Appointment[]> }) {
  return <Panel title="Agenda de hoy" icon="calendar" action={{ label: 'Abrir citas', href: '#/citas' }}>
    <PanelState state={appts} empty={rows => todays(rows).length === 0 ? 'No hay citas para hoy.' : null}>{rows => {
      const now = Date.now(), list = todays(rows), ahead = list.filter(a => Date.parse(a.end) >= now), past = list.filter(a => Date.parse(a.end) < now);
      return <Timeline items={[...ahead, ...past].slice(0, 8).map(a => ({ id: a.id, start: a.start, end: a.end, title: a.patientName, detail: a.doctorName, tag: <StatusBadge value={shownState(a, now)} /> }))} />;
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

/** Zero stock reads «Agotado» (urgent), never «Bajo mínimo» with the waiting clock (coordinator, prod). */
const stockState = (r: { disponible: number; vencido: number }) => r.disponible <= 0 ? { tag: 'Agotado', status: 'agotado' } : r.vencido > 0 ? { tag: 'Vencido', status: 'vencido' } : { tag: 'Bajo mínimo', status: 'bajo_minimo' };
const unitsOf = unitPlural;
/** `/inventario/existencias` returns one row per lot and warehouse, repeating the article columns: keep one row per article. */
const perArticle = (rows: StockRow[]) => [...new Map(rows.map(r => [r.articulo_id, { ...r, minimo: Number(r.minimo), disponible: Number(r.disponible), vencido: Number(r.vencido) }])).values()];
const lowStock = (d: DashboardData): TrayGroupSpec => ({
  id: 'inventario', title: 'Inventario bajo el mínimo', href: '#/inventario', masculine: true, state: asRemote(d.stock),
  items: perArticle(d.stock.data ?? []).filter(r => r.bajo_minimo || r.vencido > 0).map(r => ({ id: r.articulo_id, title: r.nombre, detail: [(r.bajo_minimo || r.disponible <= 0) && `Quedan ${plural(r.disponible, r.unidad, unitsOf(r.unidad))} · mínimo ${r.minimo}`, r.vencido > 0 && `${r.vencido} vencidos`].filter(Boolean).join(' · '), tone: 'warn' as Tone, href: '#/inventario', action: 'Ver', ...stockState(r) })),
});
const pendingAmbulance = (d: DashboardData): TrayGroupSpec => ({
  id: 'ambulancia', title: 'Ambulancia por confirmar', href: '#/ambulancia', state: asRemote(d.ambulance),
  items: (d.ambulance.data?.pendingRequests ?? []).map(r => ({ id: `r-${r.id}`, title: r.reason, detail: `${r.address} · ${formatRelative(r.createdAt)}`, tone: 'urgent' as Tone, href: '#/ambulancia', action: 'Despachar', area: 'AMB' as const })),
});
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
const turnaround = (rows: LabOrderRow[]) => rows.filter(o => o.completedAt).map(o => ({ day: localDay(o.completedAt as string), minutes: minutesBetween(o.createdAt, o.completedAt as string) }));
const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
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
    id: 'cuentas', title: 'Cuentas sin personal vinculado', href: '#/personal?cuenta=con', state: asRemote(d.users),
    items: (d.users.data ?? []).filter(u => u.state === 'activo' && !u.staffId && u.roles.some(r => ['REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR'].includes(r))).map(u => ({ id: u.id, title: u.name || u.email, detail: u.roles.map(r => roleNames[r] ?? r).join(' · '), tone: 'warn' as Tone, href: '#/personal?cuenta=con', action: 'Vincular' })),
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
  needs: ['board', 'admissions', 'stock', 'ambulance'],
  actions: [
    { id: 'admision', label: 'Nueva admisión', hint: 'Ingresar a un paciente para hospitalizar', icon: 'bed', href: '#/hospitalizacion?accion=admision', permission: 'admision.crear' },
    { id: 'turno', label: 'Planificar turno', hint: 'Asignar personal a un área', icon: 'calendar', href: '#/turnos?accion=planificar', permission: 'turnos.planificar' },
    { id: 'aviso', label: 'Publicar aviso', hint: 'Comunicado para el personal o la pantalla pública', icon: 'megaphone', href: '#/avisos?accion=publicar', permission: 'avisos.publicar' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores con gráficos y exportación', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  tray: ({ d }) => [
    { id: 'huecos', title: 'Huecos de cobertura', href: '#/turnos', masculine: true, state: asRemote(d.board),
      items: (d.board.data?.cobertura.detalle ?? []).map((g, i) => ({ id: `gap-${i}`, title: `${g.area} · ${roleNames[g.rol] ?? g.rol}`, detail: `${timeLabel(g.inicio)}–${timeLabel(g.fin)} · ${g.actuales} de ${plural(g.requeridos, 'persona', 'personas')}`, tone: 'warn' as Tone, href: '#/turnos?accion=planificar', action: 'Planificar' })) },
    indicatedAdmissions(d), noBed(d), pendingAmbulance(d), lowStock(d),
  ],
  figures: ({ d }) => [
    fig('camas-libres', 'Camas libres', d.board, b => b.camas.libres, { href: '#/camas', of: d.board.data ? `de ${d.board.data.camas.total}` : undefined }),
    fig('limpieza', 'En limpieza', d.board, b => b.camas.limpieza),
    fig('espera', 'En espera', d.board, b => b.fila.enEspera, { href: '#/fila' }),
    fig('llamados', 'Llamados', d.board, b => b.fila.llamados),
    fig('lab-pendiente', 'Órdenes por tomar', d.board, b => b.laboratorio.pendiente, { href: '#/laboratorio' }),
    fig('lab-proceso', 'Órdenes en proceso', d.board, b => b.laboratorio.enProceso),
    fig('turnos', 'Turnos en curso', d.board, b => b.turnosEnCurso, { href: '#/turnos' }),
  ],
};

// ───────────────────────────── DPD · protección de datos
const AUDIT_LIMIT = 200;
const failedEvents = (rows: AuditRow[]) => rows.filter(r => r.result !== 'exito');
const dpd: RoleDashboard = {
  title: 'Protección de datos',
  needs: ['audit', 'users'],
  actions: [
    { id: 'buscar', label: 'Buscar en la auditoría', hint: 'Por persona, paciente, acción o fecha', icon: 'search', href: '#/auditoria', permission: 'auditoria.ver' },
    { id: 'cadena', label: 'Verificar la cadena', hint: 'Comprueba que nadie alteró la bitácora', icon: 'shield', href: '#/auditoria?accion=verificar', permission: 'auditoria.ver' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores agregados', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  tray: ({ d }) => [{
    id: 'denegados', title: 'Eventos denegados o fallidos', href: '#/auditoria', masculine: true, state: asRemote(d.audit),
    items: failedEvents(d.audit.data ?? []).map(r => ({ id: r.seq, title: auditActionLabel(r.action), detail: `${roleNames[r.role] ?? r.role} · ${formatTime(r.at)}`, tone: 'urgent' as Tone, href: '#/auditoria', action: 'Revisar', tag: r.result === 'denegado' ? 'Denegado' : 'Fallido', status: r.result === 'denegado' ? 'denegado' : 'fallido' })),
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
  needs: ['summary', 'queue', 'appts', 'apptRequests', 'links', 'admissions', 'ambulance'],
  actions: [
    { id: 'registrar', label: 'Registrar paciente', hint: 'Busca primero y registra si no existe', icon: 'userPlus', href: '#/pacientes?accion=registrar', permission: 'pacientes.registrar' },
    { id: 'agendar', label: 'Agendar cita', hint: 'Paciente, médico y horario disponible', icon: 'calendar', href: '#/citas?accion=agendar', permission: 'citas.agendar' },
    { id: 'emitir', label: 'Emitir número', hint: 'Número de fila para quien llega', icon: 'queue', href: '#/fila?accion=emitir', permission: 'fila.emitir', primary: true },
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'megaphone', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'ambulancia', label: 'Solicitar ambulancia', hint: 'Registrar una solicitud de traslado', icon: 'ambulance', href: '#/ambulancia?accion=solicitud', permission: 'ambulancia.solicitar' },
  ],
  tray: ({ d }) => [
    // S8: asked appointments and requests by category both wait on Recepción: one group, one count (same as Citas).
    { id: 'solicitudes', title: 'Solicitudes de cita', href: '#/citas', state: requestsState(d),
      items: [
        ...(d.apptRequests.data ?? []).filter(isPendingCategoryRequest).map(r => ({ id: `s-${r.id}`, title: r.patientName ?? 'Paciente', detail: `${r.categories.map(c => c.name).join(', ')}${r.note ? ` · ${r.note}` : ''} · ${formatRelative(r.createdAt)}`, tone: 'warn' as Tone, href: `#/citas?asignar=${r.id}`, action: 'Asignar', tag: 'Por asignar', status: 'pendiente' })),
        ...(d.appts.data ?? []).filter(a => a.state === 'solicitada').map(a => ({ id: `c-${a.id}`, title: a.patientName, detail: `${formatDate(a.start, { withYear: false })}, ${timeLabel(a.start)} · ${a.doctorName}`, tone: 'warn' as Tone, href: '#/citas', action: 'Confirmar', tag: 'Por confirmar', status: 'solicitada' })),
      ] },
    { id: 'vinculaciones', title: 'Vinculaciones por verificar', href: '#/vinculaciones', state: asRemote(d.links),
      items: (d.links.data ?? []).map(l => ({ id: `l-${l.id}`, title: l.account.name, detail: l.candidate ? `Expediente ${l.candidate.record}` : 'Sin expediente sugerido', tone: 'info' as Tone, href: '#/vinculaciones', action: 'Verificar' })) },
    indicatedAdmissions(d), noBed(d), pendingAmbulance(d),
  ],
  figures: ({ d }) => [
    fig('espera', 'En espera', d.queue, r => tickets(r, 'en_espera').length, { href: '#/fila' }),
    fig('llamados', 'Llamados', d.queue, r => tickets(r, 'llamado').length, { href: '#/fila' }),
    fig('citas-hoy', 'Citas de hoy', d.appts, r => todays(r).length, { href: '#/citas' }),
    fig('camas-libres', 'Camas libres', d.summary, s => s.beds ? s.beds.free : null, { href: '#/camas', of: d.summary.data?.beds ? `de ${d.summary.data.beds.total}` : undefined }),
    fig('pacientes', 'Pacientes activos', d.summary, s => s.patients ? s.patients.active : null, { href: '#/pacientes' }),
  ],
  panels: ({ d }) => grid(<AppointmentsToday appts={d.appts} />),
};

// ───────────────────────────── AST · asistencia en consultorio
const priorityOf = (t: QueueTicket) => PRIORITY_ORDER[(t as QueueTicket & { priority?: string }).priority ?? 'rutina'] ?? 2;
const ast: RoleDashboard = {
  title: 'Asistencia',
  needs: ['queue', 'myShifts'],
  actions: [
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'megaphone', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'buscar', label: 'Buscar paciente', hint: 'Por nombre, DUI o expediente', icon: 'search', href: '#/pacientes', permission: 'pacientes.buscar' },
  ],
  tray: () => [],
  figures: ({ d }) => [
    fig('espera', 'En espera', d.queue, r => tickets(r, 'en_espera').length, { href: '#/fila' }),
    fig('llamados', 'Llamados', d.queue, r => tickets(r, 'llamado').length),
    fig('atendidos', 'Atendidos hoy', d.queue, r => tickets(r, 'atendido').length),
  ],
  panels: ({ d }) => grid(<>
    {/* WC-51: same order as the queue rule (emergencies, then urgent, then arrival number), never by issue time alone. */}
    <Panel title="Quién sigue" icon="megaphone" action={{ label: 'Abrir la fila', href: '#/fila' }}>
      <PanelState state={d.queue}>{rows => <AttentionList empty="Nadie espera ahora." items={tickets(rows, 'en_espera').sort((a, b) => priorityOf(a) - priorityOf(b) || a.numero - b.numero).map(t => ({ id: t.id, title: t.patientName ?? `Número ${t.numero}`, detail: `Número ${t.numero} · espera ${formatDuration(minutesSince(t.issuedAt))}`, tone: 'info' as Tone, href: '#/fila?accion=llamar', action: 'Llamar' }))} />}</PanelState>
    </Panel>
    <MyShift shifts={d.myShifts} />
  </>),
};

// ───────────────────────────── ENF · mi planta
const enf: RoleDashboard = {
  title: 'Mi planta',
  needs: ['beds', 'admissions', 'stock', 'myShifts'],
  actions: [
    { id: 'limpieza', label: 'Registrar limpieza', hint: 'Marca una cama limpia para su verificación', icon: 'bed', href: '#/camas?accion=limpieza', permission: 'camas.registrar_limpieza' },
    { id: 'hospitalizados', label: 'Ver hospitalizados', hint: 'Pacientes con cama asignada', icon: 'users', href: '#/hospitalizacion', permission: 'admision.ver' },
  ],
  tray: ({ d }) => [{
    id: 'limpiezas', title: 'Limpiezas por registrar o verificar', href: '#/camas', state: asRemote(d.beds),
    items: (d.beds.data ?? []).filter(b => b.cleaningPending || (b.cleaningCompleted && !b.cleanedByCurrentUser && b.state === 'limpieza')).map(b => ({ id: b.id, title: `Cama ${b.code}`, detail: b.room, tone: 'warn' as Tone, href: '#/camas', action: b.cleaningPending ? 'Registrar' : 'Verificar', tag: b.cleaningPending ? 'Por limpiar' : 'Por verificar', status: 'limpieza' })),
  }, lowStock(d)],
  figures: ({ d }) => [
    fig('ocupadas', 'Camas ocupadas', d.beds, r => r.filter(b => b.state === 'ocupada').length, { href: '#/camas', of: d.beds.data ? `de ${d.beds.data.length}` : undefined }),
    fig('bloqueadas', 'Bloqueadas', d.beds, r => r.filter(b => b.state === 'bloqueada').length || null),
    fig('hospitalizados', 'Hospitalizados', d.admissions, r => r.filter(a => a.state === 'hospitalizado').length, { href: '#/hospitalizacion' }),
  ],
  panels: ({ d }) => grid(<MyShift shifts={d.myShifts} />),
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
    items: pendingReview(d.lab.data ?? []).map(o => ({ id: o.id, title: o.patientName ?? 'Paciente', detail: o.items.map(i => i.name).join(', '), tone: 'warn' as Tone, href: '#/laboratorio', action: 'Revisar', tag: o.priority === 'urgente' ? 'Urgente' : undefined, status: o.priority === 'urgente' ? 'urgente' : undefined })),
  }],
  figures: ({ d }) => [
    fig('citas-hoy', 'Citas de hoy', d.agenda, r => r.filter(a => isToday(a.start)).length, { href: '#/consultas' }),
    fig('espera', 'En espera', d.queue, r => tickets(r, 'en_espera').length, { href: '#/fila' }),
    fig('hospitalizados', 'Hospitalizados', d.admissions, r => r.filter(a => a.state === 'hospitalizado').length, { href: '#/hospitalizacion' }),
  ],
  panels: ({ d }) => grid(<>
    <Panel title="Mi agenda de hoy" icon="calendar" action={{ label: 'Abrir mi consultorio', href: '#/consultas' }}>
      <PanelState state={d.agenda} empty={rows => rows.filter(a => isToday(a.start)).length === 0 ? 'No tienes citas para hoy.' : null}>{rows => <Timeline items={rows.filter(a => isToday(a.start)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8).map(a => ({ id: a.appointmentId, start: a.start, end: a.end, title: a.patientName, detail: a.reason ?? undefined, tag: <StatusBadge value={a.consultationState ?? shownState({ state: a.appointmentState, end: a.end })} /> }))} />}</PanelState>
    </Panel>
    <MyShift shifts={d.myShifts} />
  </>),
};

// ───────────────────────────── LAB · laboratorio
const LAB_GOAL_MIN = 60;
const lab: RoleDashboard = {
  title: 'Laboratorio',
  needs: ['lab', 'stock', 'myShifts'],
  actions: [
    { id: 'muestra', label: 'Tomar muestra', hint: 'Confirma la identidad y pasa la orden a proceso', icon: 'drop', href: '#/laboratorio?accion=muestra', permission: 'laboratorio.procesar' },
    { id: 'inventario', label: 'Ver inventario', hint: 'Reactivos, lotes y mínimos', icon: 'inventory', href: '#/inventario', permission: 'inventario.ver' },
  ],
  tray: ({ d }) => [{
    id: 'muestras', title: 'Muestras por tomar', href: '#/laboratorio', state: asRemote(d.lab),
    items: (d.lab.data ?? []).filter(o => o.state === 'pendiente').sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2) || a.createdAt.localeCompare(b.createdAt)).map(o => ({ id: o.id, title: o.patientName ?? 'Paciente', detail: `${o.items.map(i => i.name).join(', ')} · ${formatRelative(o.createdAt)}`, tone: 'warn' as Tone, href: '#/laboratorio?accion=muestra', action: 'Tomar muestra', tag: o.priority === 'urgente' ? 'Urgente' : undefined, status: o.priority === 'urgente' ? 'urgente' : undefined })),
  }, lowStock(d)],
  figures: ({ d }) => {
    const today = d.lab.data ? turnaround(d.lab.data).filter(t => t.day === localDay()).map(t => t.minutes) : [];
    return [
      fig('lab-proceso', 'En proceso', d.lab, r => labCount(r, 'en_proceso'), { href: '#/laboratorio' }),
      fig('lab-hoy', 'Completadas hoy', d.lab, () => today.length),
      fig('lab-revision', 'Sin revisión médica', d.lab, r => pendingReview(r).length),
      // W-LAB-2: no «—» card when nothing was completed today.
      fig('lab-tiempo', 'Tiempo promedio hoy', d.lab, () => { const avg = average(today); return avg === null ? null : formatDuration(avg); }),
    ];
  },
  panels: ({ d }) => {
    const days = Array.from({ length: 7 }, (_, i) => localDay(new Date(Date.now() - (6 - i) * 86400000)));
    return grid(<Panel title="Tiempo de entrega (7 días)" icon="clock">
      <PanelState state={d.lab}>{r => { const t = turnaround(r); return <BarChart title="Tiempo promedio de entrega por día" unit="min" threshold={{ value: LAB_GOAL_MIN, label: `Meta ${LAB_GOAL_MIN} min` }} empty="Aún no hay órdenes completadas en la semana." data={days.map(day => { const v = average(t.filter(x => x.day === day).map(x => x.minutes)); return { label: `${day.slice(8)}/${day.slice(5, 7)}`, value: v, tone: v == null ? undefined : (v >= LAB_GOAL_MIN * 2 ? 'urgent' : v >= LAB_GOAL_MIN ? 'warn' : 'ok') as Tone }; })} />; }}</PanelState>
    </Panel>);
  },
};

// ───────────────────────────── PAR · atención prehospitalaria
const par: RoleDashboard = {
  title: 'Mi unidad',
  needs: ['ambulance', 'myShifts'],
  actions: [{ id: 'unidad', label: 'Abrir ambulancia', hint: 'Estado, servicio e hitos', icon: 'ambulance', href: '#/ambulancia', permission: 'ambulancia.ver_estado' }],
  tray: ({ d }) => [pendingAmbulance(d)],
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
    <PanelState state={d.appts} empty={rows => upcoming(rows).length === 0 ? 'No tienes citas próximas.' : null}>{rows => <Timeline items={upcoming(rows).slice(0, 5).map(a => ({ id: a.id, start: a.start, end: a.end, title: a.doctorName, detail: formatDate(a.start), tag: <StatusBadge value={a.state} /> }))} />}</PanelState>
  </Panel>),
};

export const roleDashboards: Record<RoleId, RoleDashboard> = { ADM: adm, JOP: jop, DPD: dpd, REC: rec, AST: ast, ENF: enf, MED: med, LAB: lab, PAR: par, PAC: pac };
/** Orden de presentación cuando una cuenta tiene varios roles: primero los de gestión, luego los de trabajo directo. */
export const roleOrder: RoleId[] = ['ADM', 'JOP', 'DPD', 'REC', 'LAB', 'MED', 'ENF', 'AST', 'PAR', 'PAC'];
