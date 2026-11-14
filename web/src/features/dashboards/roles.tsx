import type { ReactNode } from 'react';
import { BarChart, Donut, Gauge, HBarList, type Tone } from '../../components/charts';
import { roleNames, staffTypeNames, type AccessProfile, type Appointment, type AuditRow, type Shift } from '../../lib/api';
import { Tag, type Remote } from '../common';
import { BoardView, bedSegments, occupancyTone } from '../tablero';
import type { DashboardData, LabOrderRow, QueueTicket, Source } from './data';
import { AttentionList, Kpi, KpiRow, Panel, PanelState, isToday, localDay, minutesBetween, plural, timeLabel, toneFor, type AttentionItem, type QuickAction } from './parts';

export type RoleId = 'ADM' | 'JOP' | 'DPD' | 'REC' | 'AST' | 'ENF' | 'MED' | 'LAB' | 'PAR' | 'PAC';
export type Ctx = { d: DashboardData; profile: AccessProfile };
export type RoleDashboard = { title: string; description: string; needs: Source[]; actions: QuickAction[]; render: (c: Ctx) => ReactNode };

/** Valor de una cifra mientras llega: «…» cargando, «—» si la fuente falló (el resto del inicio sigue funcionando). */
const num = <T,>(remote: Remote<T>, read: (data: T) => number | string): string | number => remote.data ? read(remote.data) : remote.error ? '—' : '…';
const open = (state: string) => !['cancelada', 'rechazada', 'no_asistio'].includes(state);
const todays = (rows: Appointment[]) => rows.filter(a => isToday(a.start) && open(a.state)).sort((a, b) => a.start.localeCompare(b.start));
const tickets = (rows: QueueTicket[], state: string) => rows.filter(t => t.state === state);
const grid = (children: ReactNode) => <div className="dash-grid">{children}</div>;
const shiftText = (s: Shift) => `${isToday(s.start) ? 'Hoy' : new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'America/El_Salvador' }).format(new Date(s.start))} · ${timeLabel(s.start)}–${timeLabel(s.end)} · ${s.area}`;
const nextShift = (rows: Shift[]) => [...rows].filter(s => s.state !== 'cancelado' && new Date(s.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start))[0];

function QueuePanel({ queue }: { queue: Remote<QueueTicket[]> }) {
  return <Panel title="Fila del día por estado" icon="queue" action={{ label: 'Abrir la fila', href: '#/fila' }} hint="Cuántas personas hay en cada paso: espera, llamado, atención.">
    <PanelState state={queue} empty={rows => rows.length === 0 ? 'Todavía no se han emitido números hoy.' : null}>{rows => <HBarList title="Números de hoy por estado" total={rows.length} data={[
      { label: 'En espera', value: tickets(rows, 'en_espera').length, tone: 'warn' }, { label: 'Llamados', value: tickets(rows, 'llamado').length, tone: 'info' },
      { label: 'En atención', value: tickets(rows, 'en_atencion').length, tone: 'primary' }, { label: 'Atendidos', value: tickets(rows, 'atendido').length, tone: 'ok' },
      { label: 'No se presentó', value: tickets(rows, 'no_se_presento').length, tone: 'slate' }]} />}</PanelState>
  </Panel>;
}

function Timeline({ items }: { items: { id: string; start: string; end?: string; title: string; detail?: string; tag: ReactNode }[] }) {
  const now = Date.now();
  return <ol className="timeline">{items.map(item => {
    const current = new Date(item.start).getTime() <= now && (!item.end || new Date(item.end).getTime() > now);
    return <li key={item.id} className={current ? 'is-now' : undefined}><time dateTime={item.start}>{timeLabel(item.start)}</time><div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div>{item.tag}{current && <span className="timeline-now">Ahora</span>}</li>;
  })}</ol>;
}

function AppointmentsToday({ appts, href = '#/citas' }: { appts: Remote<Appointment[]>; href?: string }) {
  return <Panel title="Citas de hoy" icon="calendar" action={{ label: 'Abrir citas', href }} hint="Línea del día: cada cita con su hora y estado.">
    <PanelState state={appts} empty={rows => todays(rows).length === 0 ? 'No hay citas para hoy.' : null}>{rows => <Timeline items={todays(rows).slice(0, 8).map(a => ({ id: a.id, start: a.start, end: a.end, title: a.patientName, detail: a.doctorName ? `con ${a.doctorName}` : undefined, tag: <Tag value={a.state} /> }))} />}</PanelState>
  </Panel>;
}

function MyShift({ shifts }: { shifts: Remote<Shift[]> }) {
  return <Panel title="Mi turno" icon="clock" action={{ label: 'Ver turnos', href: '#/turnos' }}>
    <PanelState state={shifts} empty={rows => nextShift(rows) ? null : 'No tienes turnos publicados próximos.'}>{rows => {
      const next = nextShift(rows)!, now = Date.now(), active = new Date(next.start).getTime() <= now;
      return <div className="my-shift"><Tag value={active ? 'en_curso' : 'publicado'} label={active ? 'En curso' : 'Próximo'} /><strong>{shiftText(next)}</strong></div>;
    }}</PanelState>
  </Panel>;
}

function LowStock({ d, tone = 'warn' as Tone }: { d: DashboardData; tone?: Tone }) {
  return <Panel title="Inventario bajo el mínimo" icon="inventory" action={{ label: 'Abrir inventario', href: '#/inventario' }} hint="Artículos con menos existencias que su mínimo o con lotes vencidos.">
    <PanelState state={d.stock}>{rows => {
      const items: AttentionItem[] = rows.filter(r => r.bajo_minimo || r.vencido > 0).map(r => ({ id: r.articulo_id, title: r.nombre, detail: `${r.disponible} disponibles · mínimo ${r.minimo}${r.vencido > 0 ? ` · ${r.vencido} vencidos` : ''}`, tone: r.vencido > 0 ? 'danger' : tone, href: '#/inventario', action: 'Ver', tag: r.vencido > 0 ? 'Vencido' : 'Bajo mínimo' }));
      return <AttentionList items={items} empty="Todo el inventario está sobre su mínimo." />;
    }}</PanelState>
  </Panel>;
}

const labCount = (rows: LabOrderRow[], state: string) => rows.filter(o => o.state === state).length;
const pendingReview = (rows: LabOrderRow[]) => rows.filter(o => o.state === 'completado' && !o.reviewedAt);
const turnaround = (rows: LabOrderRow[]) => rows.filter(o => o.completedAt).map(o => ({ day: localDay(o.completedAt as string), minutes: minutesBetween(o.createdAt, o.completedAt as string) }));
const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
const labStateChart = (rows: LabOrderRow[]) => <HBarList title="Órdenes de laboratorio por estado" total={rows.length} data={[
  { label: 'Pendiente de muestra', value: labCount(rows, 'pendiente'), tone: 'warn' }, { label: 'En proceso', value: labCount(rows, 'en_proceso'), tone: 'info' },
  { label: 'Completado', value: labCount(rows, 'completado'), tone: 'ok' }, { label: 'Cancelado', value: labCount(rows, 'cancelado'), tone: 'slate' }]} />;

// ───────────────────────────── ADM · administración del sistema (sin contenido clínico)
const adm: RoleDashboard = {
  title: 'Administración del sistema', description: 'Cuentas, personal y espacios del hospital. Aquí no hay información clínica.',
  needs: ['users', 'staff', 'board'],
  actions: [
    { id: 'invitar', label: 'Invitar persona', hint: 'Crea la cuenta y envía el correo de activación', icon: 'userPlus', href: '#/personal?accion=invitar', permission: 'usuarios.invitar' },
    { id: 'espacio', label: 'Agregar espacio', hint: 'Planta, habitación o cama del edificio', icon: 'building', href: '#/espacios?accion=crear', permission: 'espacios.configurar' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores del hospital por día', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  render: ({ d }) => <>
    <KpiRow>
      <Kpi icon="shield" label="Cuentas activas" value={num(d.users, u => u.filter(x => x.state === 'activo').length)} sub={d.users.data ? plural(d.users.data.filter(x => x.state !== 'activo').length, 'cuenta desactivada', 'cuentas desactivadas') : undefined} tone="ok" href="#/usuarios" />
      <Kpi icon="user" label="Personal activo" value={num(d.staff, s => s.filter(x => x.active).length)} sub="Registros de personal vigentes" tone="info" href="#/personal" />
      <Kpi icon="bed" label="Ocupación de camas" value={num(d.board, b => b.camas.total ? `${Math.round(((b.camas.total - b.camas.libres) / b.camas.total) * 100)} %` : '—')} sub={d.board.data ? `${d.board.data.camas.libres} de ${d.board.data.camas.total} libres` : undefined} tone={d.board.data && d.board.data.camas.total ? occupancyTone(Math.round(((d.board.data.camas.total - d.board.data.camas.libres) / d.board.data.camas.total) * 100)) : 'neutral'} />
      <Kpi icon="clock" label="Turnos en curso" value={num(d.board, b => b.turnosEnCurso)} sub="Personas trabajando ahora" tone="neutral" />
    </KpiRow>
    {grid(<>
      <Panel title="Ocupación de camas" icon="bed" hint="Camas que no están libres. Verde hasta 70 %, ámbar hasta 90 %, rojo por encima.">
        <PanelState state={d.board} empty={b => b.camas.total === 0 ? 'Todavía no hay camas registradas.' : null}>{b => { const percent = Math.round(((b.camas.total - b.camas.libres) / b.camas.total) * 100); return <Gauge title="Ocupación de camas" value={percent} tone={occupancyTone(percent)} caption={`${b.camas.libres} de ${b.camas.total} camas libres`} />; }}</PanelState>
      </Panel>
      <Panel title="Cuentas por estado" icon="shield" action={{ label: 'Abrir usuarios', href: '#/usuarios' }} hint="Cuántas cuentas pueden ingresar y cuántas están desactivadas.">
        <PanelState state={d.users} empty={rows => rows.length === 0 ? 'Todavía no hay cuentas. Invita a la primera persona.' : null}>{rows => <Donut title="Cuentas por estado" centerLabel="cuentas" segments={[{ label: 'Activas', value: rows.filter(r => r.state === 'activo').length, tone: 'ok' }, { label: 'Desactivadas', value: rows.filter(r => r.state !== 'activo').length, tone: 'slate' }]} />}</PanelState>
      </Panel>
      <Panel title="Cuentas por rol" icon="users" hint="Una persona puede tener varios roles.">
        <PanelState state={d.users} empty={rows => rows.length === 0 ? 'Sin cuentas todavía.' : null}>{rows => {
          const by = new Map<string, number>(); rows.filter(r => r.state === 'activo').forEach(r => r.roles.forEach(role => by.set(role, (by.get(role) ?? 0) + 1)));
          return <HBarList title="Cuentas activas por rol" data={[...by].sort((a, b) => b[1] - a[1]).map(([role, value]) => ({ label: roleNames[role] ?? role, value, tone: 'primary' as Tone }))} />;
        }}</PanelState>
      </Panel>
      <Panel title="Personal por función" icon="user" action={{ label: 'Abrir personal', href: '#/personal' }}>
        <PanelState state={d.staff} empty={rows => rows.length === 0 ? 'No hay personal registrado.' : null}>{rows => {
          const by = new Map<string, number>(); rows.filter(r => r.active).forEach(r => by.set(r.type, (by.get(r.type) ?? 0) + 1));
          return <HBarList title="Personal activo por función" data={[...by].sort((a, b) => b[1] - a[1]).map(([type, value]) => ({ label: staffTypeNames[type] ?? type, value, tone: 'info' as Tone }))} />;
        }}</PanelState>
      </Panel>
      <Panel title="Cuentas por completar" icon="alert" hint="Cuentas de trabajo sin personal vinculado: sin ese vínculo no pueden operar.">
        <PanelState state={d.users}>{rows => <AttentionList empty="Todas las cuentas de trabajo tienen su personal vinculado." items={rows.filter(u => u.state === 'activo' && !u.staffId && u.roles.some(r => ['REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR'].includes(r))).map(u => ({ id: u.id, title: u.name || u.email, detail: u.roles.map(r => roleNames[r] ?? r).join(' · '), tone: 'warn' as Tone, href: '#/usuarios', action: 'Vincular' }))} />}</PanelState>
      </Panel>
    </>)}
  </>,
};

// ───────────────────────────── JOP · operación (agregados, sin nombres)
const jop: RoleDashboard = {
  title: 'Operación del hospital', description: 'El día del hospital en una sola vista: camas, fila, laboratorio, ambulancia y cobertura de turnos.',
  needs: ['board', 'admissions', 'stock', 'ambulance'],
  actions: [
    { id: 'admision', label: 'Nueva admisión', hint: 'Ingresar a un paciente para hospitalizar', icon: 'bed', href: '#/hospitalizacion?accion=admision', permission: 'admision.crear' },
    { id: 'turno', label: 'Planificar turno', hint: 'Asignar personal a un área', icon: 'calendar', href: '#/turnos?accion=planificar', permission: 'turnos.planificar' },
    { id: 'aviso', label: 'Publicar aviso', hint: 'Comunicado para la pantalla pública', icon: 'megaphone', href: '#/avisos?accion=publicar', permission: 'avisos.publicar' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores con gráficos y exportación', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  render: ({ d }) => {
    const b = d.board.data, pct = b && b.camas.total ? Math.round(((b.camas.total - b.camas.libres) / b.camas.total) * 100) : null, noBed = d.admissions.data?.filter(a => a.state === 'pendiente_cama').length;
    return <>
      <KpiRow>
        <Kpi icon="bed" label="Camas libres" value={num(d.board, x => x.camas.libres)} sub={b ? `de ${b.camas.total} · ${b.camas.limpieza} en limpieza` : undefined} tone={pct == null ? 'neutral' : occupancyTone(pct)} href="#/camas" />
        <Kpi icon="users" label="Admisiones sin cama" value={num(d.admissions, rows => rows.filter(a => a.state === 'pendiente_cama').length)} sub={noBed ? 'Esperan que se les asigne una cama' : 'Ninguna espera cama'} tone={noBed ? 'warn' : 'ok'} href="#/hospitalizacion" />
        <Kpi icon="queue" label="En fila ahora" value={num(d.board, x => x.fila.enEspera + x.fila.llamados)} sub={b ? `${b.fila.enEspera} en espera · ${b.fila.llamados} llamados` : undefined} tone={b ? toneFor(b.fila.enEspera, 8, 15) : 'neutral'} href="#/fila" />
        <Kpi icon="lab" label="Órdenes abiertas" value={num(d.board, x => x.laboratorio.pendiente + x.laboratorio.enProceso)} sub={b ? `${b.laboratorio.pendiente} por tomar · ${b.laboratorio.enProceso} en proceso` : undefined} tone={b ? toneFor(b.laboratorio.pendiente, 6, 12) : 'neutral'} href="#/laboratorio" />
      </KpiRow>
      {grid(<>
        <Panel title="Requiere tu atención" icon="alert" hint="Huecos de cobertura, admisiones y solicitudes que esperan una decisión.">
          <PanelState state={d.board}>{board => {
            const items: AttentionItem[] = board.cobertura.detalle.map((g, i) => ({ id: `gap-${i}`, title: `${g.area} · ${roleNames[g.rol] ?? g.rol}`, detail: `${timeLabel(g.inicio)}–${timeLabel(g.fin)} · ${g.actuales} de ${g.requeridos} personas`, tone: 'warn', href: '#/turnos?accion=planificar', action: 'Planificar', tag: 'Hueco de cobertura' }));
            if (noBed) items.push({ id: 'sin-cama', title: plural(noBed, 'admisión sin cama', 'admisiones sin cama'), detail: 'Asigna una cama para que el paciente pase a hospitalización.', tone: 'warn', href: '#/hospitalizacion', action: 'Asignar cama' });
            const pending = d.ambulance.data?.pendingRequests?.length ?? 0;
            if (pending) items.push({ id: 'amb', title: plural(pending, 'solicitud de ambulancia', 'solicitudes de ambulancia'), detail: 'Esperan confirmación o despacho.', tone: 'danger', href: '#/ambulancia', action: 'Despachar' });
            return <AttentionList items={items} empty="Cobertura completa y sin solicitudes pendientes." />;
          }}</PanelState>
        </Panel>
        <LowStock d={d} />
      </>)}
      <PanelState state={d.board}>{board => <BoardView board={board} />}</PanelState>
    </>;
  },
};

// ───────────────────────────── DPD · protección de datos
const resultTone: Record<string, Tone> = { exito: 'ok', denegado: 'danger', fallido: 'urgent' };
const auditBy = (rows: AuditRow[], result: string) => rows.filter(r => r.result === result);
const dpd: RoleDashboard = {
  title: 'Protección de datos', description: 'Quién vio qué y cuándo. La auditoría registra metadatos, nunca valores clínicos.',
  needs: ['audit', 'users', 'board'],
  actions: [
    { id: 'buscar', label: 'Buscar en la auditoría', hint: 'Por persona, paciente, acción o fecha', icon: 'search', href: '#/auditoria', permission: 'auditoria.ver' },
    { id: 'cadena', label: 'Verificar la cadena', hint: 'Comprueba que nadie alteró la bitácora', icon: 'shield', href: '#/auditoria?accion=verificar', permission: 'auditoria.ver' },
    { id: 'metricas', label: 'Ver métricas', hint: 'Indicadores agregados', icon: 'chart', href: '#/metricas', permission: 'metricas.ver' },
  ],
  render: ({ d }) => <>
    <KpiRow>
      <Kpi icon="audit" label="Eventos recientes" value={num(d.audit, r => r.length)} sub="Últimos eventos auditados" tone="info" href="#/auditoria" />
      <Kpi icon="clock" label="Eventos de hoy" value={num(d.audit, r => r.filter(x => isToday(x.at)).length)} sub="Desde las 00:00 (hora de El Salvador)" tone="neutral" />
      <Kpi icon="alert" label="Accesos denegados" value={num(d.audit, r => auditBy(r, 'denegado').length)} sub={d.audit.data && auditBy(d.audit.data, 'denegado').length ? 'Revísalos: alguien intentó entrar sin permiso' : 'Sin intentos denegados'} tone={d.audit.data && auditBy(d.audit.data, 'denegado').length ? 'danger' : 'ok'} href="#/auditoria" />
      <Kpi icon="shield" label="Cuentas activas" value={num(d.users, u => u.filter(x => x.state === 'activo').length)} sub="Pueden ingresar al sistema" tone="ok" />
    </KpiRow>
    {grid(<>
      <Panel title="Resultado de los eventos" icon="audit" hint="Correcto, denegado por permisos o fallido.">
        <PanelState state={d.audit} empty={rows => rows.length === 0 ? 'Todavía no hay actividad auditada.' : null}>{rows => <Donut title="Eventos por resultado" centerLabel="eventos" segments={['exito', 'denegado', 'fallido'].map(k => ({ label: k === 'exito' ? 'Correctos' : k === 'denegado' ? 'Denegados' : 'Fallidos', value: auditBy(rows, k).length, tone: resultTone[k] }))} />}</PanelState>
      </Panel>
      <Panel title="Acciones más frecuentes" icon="chart">
        <PanelState state={d.audit} empty={rows => rows.length === 0 ? 'Sin actividad para graficar.' : null}>{rows => {
          const by = new Map<string, number>(); rows.forEach(r => by.set(r.action, (by.get(r.action) ?? 0) + 1));
          return <HBarList title="Acciones auditadas más frecuentes" data={[...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value, tone: 'primary' as Tone }))} />;
        }}</PanelState>
      </Panel>
      <Panel title="Requiere tu atención" icon="alert" action={{ label: 'Abrir auditoría', href: '#/auditoria' }} hint="Eventos denegados o fallidos más recientes.">
        <PanelState state={d.audit}>{rows => <AttentionList empty="No hay eventos denegados ni fallidos." items={rows.filter(r => r.result !== 'exito').map(r => ({ id: r.seq, title: r.action, detail: `${r.role} · ${timeLabel(r.at)}`, tone: resultTone[r.result] ?? 'warn', href: '#/auditoria', action: 'Revisar', tag: r.result === 'denegado' ? 'Denegado' : 'Fallido' }))} />}</PanelState>
      </Panel>
    </>)}
  </>,
};

// ───────────────────────────── REC · recepción
const rec: RoleDashboard = {
  title: 'Recepción', description: 'Pacientes, fila, citas y camas: lo que llega a la puerta y lo que espera una respuesta tuya.',
  needs: ['summary', 'queue', 'appts', 'links', 'admissions', 'ambulance'],
  actions: [
    { id: 'registrar', label: 'Registrar paciente', hint: 'Busca primero y registra si no existe', icon: 'userPlus', href: '#/pacientes?accion=registrar', permission: 'pacientes.registrar' },
    { id: 'agendar', label: 'Agendar cita', hint: 'Paciente, médico y horario disponible', icon: 'calendar', href: '#/citas?accion=agendar', permission: 'citas.agendar' },
    { id: 'emitir', label: 'Emitir número', hint: 'Número de fila para quien llega', icon: 'queue', href: '#/fila?accion=emitir', permission: 'fila.emitir' },
    { id: 'ambulancia', label: 'Solicitar ambulancia', hint: 'Registrar una solicitud de traslado', icon: 'ambulance', href: '#/ambulancia?accion=solicitud', permission: 'ambulancia.solicitar' },
  ],
  render: ({ d }) => <>
    <KpiRow>
      <Kpi icon="queue" label="En espera en la fila" value={num(d.queue, r => tickets(r, 'en_espera').length)} sub={d.queue.data ? `${tickets(d.queue.data, 'llamado').length} llamados` : undefined} tone={d.queue.data ? toneFor(tickets(d.queue.data, 'en_espera').length, 8, 15) : 'neutral'} href="#/fila" />
      <Kpi icon="calendar" label="Citas de hoy" value={num(d.appts, r => todays(r).length)} sub={d.appts.data ? `${d.appts.data.filter(a => a.state === 'solicitada').length} por confirmar` : undefined} tone="info" href="#/citas" />
      <Kpi icon="bed" label="Camas libres" value={num(d.summary, s => s.beds ? s.beds.free : '—')} sub={d.summary.data?.beds ? `de ${d.summary.data.beds.total} camas` : undefined} tone={d.summary.data?.beds?.free === 0 ? 'danger' : 'ok'} href="#/camas" />
      <Kpi icon="users" label="Pacientes activos" value={num(d.summary, s => s.patients ? s.patients.active : '—')} sub="Expedientes vigentes" tone="neutral" href="#/pacientes" />
    </KpiRow>
    {grid(<>
      <Panel title="Requiere tu atención" icon="alert" hint="Cada fila tiene su botón: resuélvelo desde aquí.">
        <AttentionList empty="No hay vinculaciones, solicitudes ni admisiones esperando." items={[
          ...(d.links.data ?? []).map(l => ({ id: `l-${l.id}`, title: l.account.name, detail: `Pide vincular su cuenta${l.candidate ? ` con el expediente ${l.candidate.record}` : ''}`, tone: 'info' as Tone, href: '#/vinculaciones', action: 'Verificar', tag: 'Vinculación' })),
          ...(d.appts.data ?? []).filter(a => a.state === 'solicitada').map(a => ({ id: `c-${a.id}`, title: a.patientName, detail: `Solicita cita el ${new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'short', timeZone: 'America/El_Salvador' }).format(new Date(a.start))} a las ${timeLabel(a.start)}`, tone: 'warn' as Tone, href: '#/citas', action: 'Confirmar', tag: 'Cita solicitada' })),
          ...(d.admissions.data ?? []).filter(a => a.state === 'pendiente_cama').map(a => ({ id: `a-${a.id}`, title: a.patientName, detail: 'Admisión sin cama asignada', tone: 'warn' as Tone, href: '#/hospitalizacion', action: 'Asignar cama', tag: 'Sin cama' })),
          ...(d.ambulance.data?.pendingRequests ?? []).map(r => ({ id: `r-${r.id}`, title: r.reason, detail: r.address, tone: 'danger' as Tone, href: '#/ambulancia', action: 'Despachar', tag: 'Ambulancia' })),
        ]} />
      </Panel>
      <QueuePanel queue={d.queue} />
      <AppointmentsToday appts={d.appts} />
    </>)}
  </>,
};

// ───────────────────────────── AST · asistencia en consultorio
const ast: RoleDashboard = {
  title: 'Mi consultorio', description: 'La fila de quienes esperan y tu turno de hoy.',
  needs: ['queue', 'myShifts'],
  actions: [
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'queue', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'buscar', label: 'Buscar paciente', hint: 'Por nombre, DUI o expediente', icon: 'search', href: '#/pacientes', permission: 'pacientes.buscar' },
  ],
  render: ({ d }) => <>
    <KpiRow>
      <Kpi icon="queue" label="En espera" value={num(d.queue, r => tickets(r, 'en_espera').length)} sub="Esperan ser llamados" tone={d.queue.data ? toneFor(tickets(d.queue.data, 'en_espera').length, 6, 12) : 'neutral'} href="#/fila" />
      <Kpi icon="megaphone" label="Llamados" value={num(d.queue, r => tickets(r, 'llamado').length)} sub="Ya se les llamó" tone="info" />
      <Kpi icon="check" label="Atendidos hoy" value={num(d.queue, r => tickets(r, 'atendido').length)} sub="Pasaron por consulta" tone="ok" />
      <Kpi icon="clock" label="Mi próximo turno" value={d.myShifts.data ? (nextShift(d.myShifts.data) ? timeLabel(nextShift(d.myShifts.data)!.start) : '—') : d.myShifts.error ? '—' : '…'} sub={d.myShifts.data && nextShift(d.myShifts.data) ? nextShift(d.myShifts.data)!.area : 'Sin turnos publicados'} tone="neutral" href="#/turnos" />
    </KpiRow>
    {grid(<>
      <Panel title="Quién sigue" icon="alert" action={{ label: 'Abrir la fila', href: '#/fila' }} hint="Los más antiguos en espera, para llamarlos en orden.">
        <PanelState state={d.queue}>{rows => <AttentionList empty="Nadie espera ahora." items={tickets(rows, 'en_espera').sort((a, b) => a.issuedAt.localeCompare(b.issuedAt)).map(t => ({ id: t.id, title: `Número ${t.numero}`, detail: `${t.patientName ?? 'Sin nombre registrado'} · espera desde las ${timeLabel(t.issuedAt)}`, tone: (minutesBetween(t.issuedAt, new Date().toISOString()) >= 30 ? 'warn' : 'info') as Tone, href: '#/fila?accion=llamar', action: 'Llamar', tag: `${minutesBetween(t.issuedAt, new Date().toISOString())} min` }))} />}</PanelState>
      </Panel>
      <QueuePanel queue={d.queue} />
      <MyShift shifts={d.myShifts} />
    </>)}
  </>,
};

// ───────────────────────────── ENF · mi planta
const enf: RoleDashboard = {
  title: 'Mi planta', description: 'Camas, limpiezas por registrar o verificar, hospitalizados e insumos.',
  needs: ['beds', 'admissions', 'stock', 'myShifts'],
  actions: [
    { id: 'limpieza', label: 'Registrar limpieza', hint: 'Marca una cama limpia para su verificación', icon: 'bed', href: '#/camas?accion=limpieza', permission: 'camas.registrar_limpieza' },
    { id: 'hospitalizados', label: 'Ver hospitalizados', hint: 'Pacientes con cama asignada', icon: 'users', href: '#/hospitalizacion', permission: 'admision.ver' },
  ],
  render: ({ d }) => {
    const by = (state: string) => d.beds.data?.filter(b => b.state === state).length ?? 0;
    return <>
      <KpiRow>
        <Kpi icon="bed" label="Camas ocupadas" value={num(d.beds, r => r.filter(b => b.state === 'ocupada').length)} sub={d.beds.data ? `de ${d.beds.data.length} camas` : undefined} tone="info" href="#/camas" />
        <Kpi icon="drop" label="En limpieza" value={num(d.beds, r => r.filter(b => b.state === 'limpieza').length)} sub="Esperan limpieza o verificación" tone={by('limpieza') ? 'warn' : 'ok'} href="#/camas" />
        <Kpi icon="lock" label="Bloqueadas" value={num(d.beds, r => r.filter(b => b.state === 'bloqueada').length)} sub="Fuera de servicio" tone="neutral" />
        <Kpi icon="users" label="Hospitalizados" value={num(d.admissions, r => r.filter(a => a.state === 'hospitalizado').length)} sub="Con cama asignada" tone="ok" href="#/hospitalizacion" />
      </KpiRow>
      {grid(<>
        <Panel title="Camas por estado" icon="bed" action={{ label: 'Abrir camas', href: '#/camas' }}>
          <PanelState state={d.beds} empty={rows => rows.length === 0 ? 'No hay camas registradas.' : null}>{rows => <Donut title="Camas por estado" centerLabel="camas" segments={bedSegments({ libres: rows.filter(b => b.state === 'libre').length, ocupadas: rows.filter(b => b.state === 'ocupada').length, limpieza: rows.filter(b => b.state === 'limpieza').length, bloqueadas: rows.filter(b => b.state === 'bloqueada').length, reservadas: rows.filter(b => b.state === 'reservada').length })} />}</PanelState>
        </Panel>
        <Panel title="Requiere tu atención" icon="alert" hint="Limpiezas por registrar y limpiezas que otra persona debe verificar.">
          <PanelState state={d.beds}>{rows => <AttentionList empty="No hay limpiezas pendientes." items={rows.filter(b => b.cleaningPending || (b.cleaningCompleted && !b.cleanedByCurrentUser && b.state === 'limpieza')).map(b => ({ id: b.id, title: `Cama ${b.code}`, detail: `${b.room} · ${b.cleaningPending ? 'limpieza solicitada' : 'limpieza lista, falta verificar'}`, tone: 'warn' as Tone, href: '#/camas', action: b.cleaningPending ? 'Registrar' : 'Verificar', tag: b.cleaningPending ? 'Por limpiar' : 'Por verificar' }))} />}</PanelState>
        </Panel>
        <LowStock d={d} />
        <MyShift shifts={d.myShifts} />
      </>)}
    </>;
  },
};

// ───────────────────────────── MED · mi día
const med: RoleDashboard = {
  title: 'Mi día', description: 'Tus citas, los resultados que esperan tu revisión y los pacientes hospitalizados.',
  needs: ['agenda', 'lab', 'queue', 'admissions', 'myShifts'],
  actions: [
    { id: 'llamar', label: 'Llamar siguiente', hint: 'Llama al próximo número en espera', icon: 'queue', href: '#/fila?accion=llamar', permission: 'fila.llamar' },
    { id: 'consulta', label: 'Iniciar consulta', hint: 'Abre tu agenda y atiende al paciente', icon: 'steth', href: '#/consultas', permission: 'consulta.iniciar' },
    { id: 'examen', label: 'Pedir examen', hint: 'Orden de laboratorio para un paciente', icon: 'lab', href: '#/laboratorio?accion=orden', permission: 'laboratorio.ordenar' },
  ],
  render: ({ d }) => <>
    <KpiRow>
      <Kpi icon="calendar" label="Citas de hoy" value={num(d.agenda, r => r.filter(a => isToday(a.start)).length)} sub={d.agenda.data ? `${d.agenda.data.filter(a => isToday(a.start) && a.consultationState === 'firmada').length} ya firmadas` : undefined} tone="info" href="#/consultas" />
      <Kpi icon="queue" label="En espera" value={num(d.queue, r => tickets(r, 'en_espera').length)} sub="Pacientes en la fila" tone={d.queue.data ? toneFor(tickets(d.queue.data, 'en_espera').length, 6, 12) : 'neutral'} href="#/fila" />
      <Kpi icon="lab" label="Resultados por revisar" value={num(d.lab, r => pendingReview(r).length)} sub="Completados que el paciente aún no ve" tone={d.lab.data && pendingReview(d.lab.data).length ? 'warn' : 'ok'} href="#/laboratorio" />
      <Kpi icon="bed" label="Hospitalizados" value={num(d.admissions, r => r.filter(a => a.state === 'hospitalizado').length)} sub="Con cama asignada" tone="neutral" href="#/hospitalizacion" />
    </KpiRow>
    {grid(<>
      <Panel title="Mi agenda de hoy" icon="calendar" action={{ label: 'Abrir mi consultorio', href: '#/consultas' }} hint="Línea del día con el estado de cada consulta.">
        <PanelState state={d.agenda} empty={rows => rows.filter(a => isToday(a.start)).length === 0 ? 'No tienes citas para hoy.' : null}>{rows => <Timeline items={rows.filter(a => isToday(a.start)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8).map(a => ({ id: a.appointmentId, start: a.start, end: a.end, title: a.patientName, detail: a.reason ?? undefined, tag: <Tag value={a.consultationState ?? a.appointmentState} /> }))} />}</PanelState>
      </Panel>
      <Panel title="Resultados por revisar" icon="alert" action={{ label: 'Abrir laboratorio', href: '#/laboratorio' }} hint="Cuando los revisas, el paciente puede ver sus valores.">
        <PanelState state={d.lab}>{rows => <AttentionList empty="No hay resultados esperando revisión." items={pendingReview(rows).map(o => ({ id: o.id, title: o.patientName ?? 'Paciente', detail: o.items.map(i => i.name).join(', '), tone: (o.priority === 'urgente' ? 'urgent' : 'warn') as Tone, href: '#/laboratorio', action: 'Revisar', tag: o.priority === 'urgente' ? 'Urgente' : 'Completado' }))} />}</PanelState>
      </Panel>
      <Panel title="Mis órdenes por estado" icon="lab">
        <PanelState state={d.lab} empty={rows => rows.length === 0 ? 'Todavía no hay órdenes de laboratorio.' : null}>{rows => labStateChart(rows)}</PanelState>
      </Panel>
      <MyShift shifts={d.myShifts} />
    </>)}
  </>,
};

// ───────────────────────────── LAB · laboratorio
const LAB_GOAL_MIN = 60;
const lab: RoleDashboard = {
  title: 'Laboratorio', description: 'Tu cola de órdenes, los tiempos de entrega y los reactivos que se acaban.',
  needs: ['lab', 'stock', 'myShifts'],
  actions: [
    { id: 'muestra', label: 'Tomar muestra', hint: 'Confirma la identidad y pasa la orden a proceso', icon: 'drop', href: '#/laboratorio?accion=muestra', permission: 'laboratorio.procesar' },
    { id: 'inventario', label: 'Ver inventario', hint: 'Reactivos, lotes y mínimos', icon: 'inventory', href: '#/inventario', permission: 'inventario.ver' },
  ],
  render: ({ d }) => {
    const rows = d.lab.data, today = rows ? turnaround(rows).filter(t => t.day === localDay()).map(t => t.minutes) : [], avg = average(today);
    const days = Array.from({ length: 7 }, (_, i) => localDay(new Date(Date.now() - (6 - i) * 86400000)));
    return <>
      <KpiRow>
        <Kpi icon="clock" label="Por tomar muestra" value={num(d.lab, r => labCount(r, 'pendiente'))} sub="Órdenes esperando la muestra" tone={rows ? toneFor(labCount(rows, 'pendiente'), 6, 12) : 'neutral'} href="#/laboratorio" />
        <Kpi icon="lab" label="En proceso" value={num(d.lab, r => labCount(r, 'en_proceso'))} sub="Con muestra, sin resultados completos" tone="info" href="#/laboratorio" />
        <Kpi icon="check" label="Sin revisión médica" value={num(d.lab, r => pendingReview(r).length)} sub="Completadas, aún no liberadas al paciente" tone="neutral" />
        <Kpi icon="pulse" label="Tiempo promedio hoy" value={avg == null ? '—' : `${avg} min`} sub={avg == null ? 'Aún no hay órdenes completadas hoy' : `Meta: menos de ${LAB_GOAL_MIN} min`} tone={avg == null ? 'neutral' : toneFor(avg, LAB_GOAL_MIN, LAB_GOAL_MIN * 2)} />
      </KpiRow>
      {grid(<>
        <Panel title="Cola por estado" icon="lab" action={{ label: 'Abrir laboratorio', href: '#/laboratorio' }}>
          <PanelState state={d.lab} empty={r => r.length === 0 ? 'Todavía no hay órdenes de laboratorio.' : null}>{r => labStateChart(r)}</PanelState>
        </Panel>
        <Panel title="Tiempo de entrega (7 días)" icon="clock" hint="Minutos promedio entre la orden y el resultado completo. Menos es mejor.">
          <PanelState state={d.lab}>{r => { const t = turnaround(r); return <BarChart title="Tiempo promedio de entrega por día" unit="min" threshold={{ value: LAB_GOAL_MIN, label: `Meta ${LAB_GOAL_MIN} min` }} empty="Aún no hay órdenes completadas en la semana." data={days.map(day => { const v = average(t.filter(x => x.day === day).map(x => x.minutes)); return { label: day.slice(8) + '/' + day.slice(5, 7), value: v, tone: v == null ? undefined : toneFor(v, LAB_GOAL_MIN, LAB_GOAL_MIN * 2) }; })} />; }}</PanelState>
        </Panel>
        <Panel title="Requiere tu atención" icon="alert" hint="Órdenes esperando la muestra, de la más antigua a la más reciente; las urgentes primero.">
          <PanelState state={d.lab}>{r => <AttentionList empty="No hay órdenes esperando muestra." items={r.filter(o => o.state === 'pendiente').sort((a, b) => (a.priority === b.priority ? a.createdAt.localeCompare(b.createdAt) : a.priority === 'urgente' ? -1 : 1)).map(o => ({ id: o.id, title: o.patientName ?? 'Paciente', detail: `${o.items.map(i => i.name).join(', ')} · pedida a las ${timeLabel(o.createdAt)}`, tone: (o.priority === 'urgente' ? 'urgent' : 'warn') as Tone, href: '#/laboratorio?accion=muestra', action: 'Tomar muestra', tag: o.priority === 'urgente' ? 'Urgente' : `${minutesBetween(o.createdAt, new Date().toISOString())} min` }))} />}</PanelState>
        </Panel>
        <LowStock d={d} />
      </>)}
    </>;
  },
};

// ───────────────────────────── PAR · atención prehospitalaria
const par: RoleDashboard = {
  title: 'Mi unidad', description: 'El estado de la ambulancia y el servicio en curso.',
  needs: ['ambulance', 'myShifts'],
  actions: [{ id: 'unidad', label: 'Abrir ambulancia', hint: 'Estado, servicio e hitos', icon: 'ambulance', href: '#/ambulancia', permission: 'ambulancia.ver_estado' }],
  render: ({ d }) => {
    const a = d.ambulance.data, stateTone: Tone | 'neutral' = !a ? 'neutral' : a.unit.state === 'disponible' ? 'ok' : a.unit.state === 'en_servicio' ? 'danger' : 'slate';
    return <>
      <KpiRow>
        <Kpi icon="ambulance" label="Estado de la unidad" value={a ? ({ disponible: 'Disponible', en_servicio: 'En servicio', en_mantenimiento: 'En mantenimiento' } as Record<string, string>)[a.unit.state] ?? a.unit.state : d.ambulance.error ? '—' : '…'} sub={a ? `Placa ${a.unit.plate}` : undefined} tone={stateTone} href="#/ambulancia" />
        <Kpi icon="pulse" label="Servicio en curso" value={a ? (a.activeService ? 'Sí' : 'No') : '…'} sub={a?.activeService ? `${a.activeService.origin} → ${a.activeService.destination}` : 'Sin servicio activo'} tone={a?.activeService ? 'danger' : 'ok'} />
        <Kpi icon="alert" label="Solicitudes por atender" value={a ? a.pendingRequests?.length ?? '—' : '…'} sub="Pedidos sin despachar" tone={a?.pendingRequests?.length ? 'warn' : 'ok'} />
      </KpiRow>
      {grid(<>
        <Panel title="Servicio en curso" icon="ambulance" action={{ label: 'Abrir ambulancia', href: '#/ambulancia' }}>
          <PanelState state={d.ambulance} empty={s => s.activeService ? null : 'No hay un servicio en curso. La unidad está lista para recibir uno.'}>{s => <>
            <p className="panel-hint">{s.activeService!.origin} → {s.activeService!.destination} · prioridad {s.activeService!.priority}</p>
            <ol className="stepper">{[...(s.activeService!.milestones ?? []).map(m => ({ key: m.type, label: m.type.replace(/_/g, ' '), done: true, at: m.occurredAt })), ...(s.activeService!.nextMilestones ?? []).map((m, i) => ({ key: `n-${m}`, label: m.replace(/_/g, ' '), done: false, at: i === 0 ? 'siguiente' : '' }))].map(step => <li key={step.key} className={step.done ? 'is-done' : undefined}><span aria-hidden="true">{step.done ? '✓' : '·'}</span><strong>{step.label}</strong>{step.at && <small>{step.done ? timeLabel(step.at) : step.at}</small>}</li>)}</ol>
          </>}</PanelState>
        </Panel>
        <Panel title="Requiere tu atención" icon="alert" hint="Solicitudes de ambulancia que esperan despacho.">
          <PanelState state={d.ambulance}>{s => <AttentionList empty="No hay solicitudes pendientes." items={(s.pendingRequests ?? []).map(r => ({ id: r.id, title: r.reason, detail: r.address, tone: 'danger' as Tone, href: '#/ambulancia', action: 'Ver', tag: timeLabel(r.createdAt) }))} />}</PanelState>
        </Panel>
        <MyShift shifts={d.myShifts} />
      </>)}
    </>;
  },
};

// ───────────────────────────── PAC · paciente
const pac: RoleDashboard = {
  title: 'Mi atención', description: 'Tu próxima cita, tu número en la fila y el estado de tus exámenes.',
  needs: ['appts', 'queue', 'myLab'],
  actions: [{ id: 'cita', label: 'Pedir una cita', hint: 'Elige médico y horario', icon: 'calendar', href: '#/citas?accion=solicitar', permission: 'citas.solicitar' }],
  render: ({ d }) => {
    const upcoming = (rows: Appointment[]) => rows.filter(a => open(a.state) && new Date(a.end).getTime() > Date.now()).sort((a, b) => a.start.localeCompare(b.start));
    const mine = (d.queue.data ?? []).filter(t => ['en_espera', 'llamado', 'en_atencion'].includes(t.state))[0];
    return <>
      <KpiRow>
        <Kpi icon="calendar" label="Próxima cita" value={d.appts.data ? (upcoming(d.appts.data)[0] ? `${new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'short', timeZone: 'America/El_Salvador' }).format(new Date(upcoming(d.appts.data)[0].start))} · ${timeLabel(upcoming(d.appts.data)[0].start)}` : 'Sin citas') : d.appts.error ? '—' : '…'} sub={d.appts.data && upcoming(d.appts.data)[0] ? `con ${upcoming(d.appts.data)[0].doctorName}` : 'Pide una cita cuando la necesites'} tone="info" href="#/citas" />
        <Kpi icon="queue" label="Mi número en la fila" value={d.queue.data ? (mine ? mine.numero : '—') : d.queue.error ? '—' : '…'} sub={mine ? (mine.state === 'llamado' ? 'Es tu turno: pasa al consultorio' : mine.state === 'en_atencion' ? 'Te están atendiendo' : 'Espera a que te llamen') : 'No tienes un número activo'} tone={mine?.state === 'llamado' ? 'ok' : 'neutral'} />
        <Kpi icon="lab" label="Exámenes en curso" value={num(d.myLab, r => r.filter(o => ['pendiente', 'en_proceso'].includes(o.state)).length)} sub="Pendientes o en proceso" tone="info" />
        <Kpi icon="check" label="Resultados listos" value={num(d.myLab, r => r.filter(o => o.state === 'completado' && o.reviewedAt).length)} sub="Tu médico ya los revisó" tone="ok" />
      </KpiRow>
      {grid(<>
        <Panel title="Mis próximas citas" icon="calendar" action={{ label: 'Abrir citas', href: '#/citas' }}>
          <PanelState state={d.appts} empty={rows => upcoming(rows).length === 0 ? 'No tienes citas próximas.' : null}>{rows => <Timeline items={upcoming(rows).slice(0, 5).map(a => ({ id: a.id, start: a.start, end: a.end, title: a.doctorName, detail: new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/El_Salvador' }).format(new Date(a.start)), tag: <Tag value={a.state} /> }))} />}</PanelState>
        </Panel>
        <Panel title="Mis exámenes" icon="lab" hint="Ves el estado siempre; los valores aparecen cuando tu médico los revisa.">
          <PanelState state={d.myLab} empty={rows => rows.length === 0 ? 'No tienes exámenes registrados.' : null}>{rows => <Donut title="Mis exámenes por estado" centerLabel="exámenes" segments={[{ label: 'Pendientes', value: labCount(rows, 'pendiente'), tone: 'warn' }, { label: 'En proceso', value: labCount(rows, 'en_proceso'), tone: 'info' }, { label: 'Completados', value: labCount(rows, 'completado'), tone: 'ok' }, { label: 'Cancelados', value: labCount(rows, 'cancelado'), tone: 'slate' }]} />}</PanelState>
        </Panel>
      </>)}
    </>;
  },
};

export const roleDashboards: Record<RoleId, RoleDashboard> = { ADM: adm, JOP: jop, DPD: dpd, REC: rec, AST: ast, ENF: enf, MED: med, LAB: lab, PAR: par, PAC: pac };
/** Orden de presentación cuando una cuenta tiene varios roles: primero los de gestión, luego los de trabajo directo. */
export const roleOrder: RoleId[] = ['ADM', 'JOP', 'DPD', 'REC', 'LAB', 'MED', 'ENF', 'AST', 'PAR', 'PAC'];
