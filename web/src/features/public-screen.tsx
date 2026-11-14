import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Api } from '../lib/api';
import { Brand } from '../components/ui';
import { PublicApi, categoryNames, publicServices, usePublicLive, useRefreshAt, type PublicDoctors, type PublicNotices, type PublicOccupancy, type PublicQueue } from '../lib/publico';
import { useData, type Remote } from './common';

const timeFormat = new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: 'America/El_Salvador' });
const dateFormat = new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/El_Salvador' });
const hour = (iso: string) => timeFormat.format(new Date(iso)).replace(/^24:/, '00:');

function Clock() {
  const [now, setNow] = useState(() => new Date());
  // Reloj de pared de la pantalla: no consulta la API.
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  return <div className="public-clock"><time dateTime={now.toISOString()}>{hour(now.toISOString())}</time><span>{dateFormat.format(now)}</span></div>;
}

function Panel<T>({ title, state, empty, isEmpty, children, className = '' }: { title: string; state: Remote<T>; empty: string; isEmpty: (data: T) => boolean; children: (data: T) => ReactNode; className?: string }) {
  let body: ReactNode;
  if (state.loading && !state.data) body = <p className="public-muted" role="status">Cargando…</p>;
  else if (state.error && !state.data) body = <p className="public-muted" role="status">Información no disponible por ahora.</p>;
  else if (state.data && isEmpty(state.data)) body = <p className="public-muted">{empty}</p>;
  else if (state.data) body = children(state.data);
  return <section className={`public-panel ${className}`.trim()} aria-label={title}><h2>{title}</h2>{body}</section>;
}

/** W34 · pantalla pública sin sesión (televisor de sala de espera). Solo agregados y datos públicos; sin interacción. */
export function PublicScreen({ api: given }: { api?: Api }) {
  const api = useMemo(() => given ?? new PublicApi(), [given]);
  const { version, live } = usePublicLive();
  const [tick, setTick] = useState(0);
  const v = version + tick;
  const occupancy = useData<PublicOccupancy>(api, '/publico/ocupacion', v);
  const doctors = useData<PublicDoctors>(api, '/publico/medicos-de-turno', v);
  const notices = useData<PublicNotices>(api, '/publico/avisos', v);
  const general = useData<PublicQueue>(api, '/publico/fila/consulta_general', v);
  const emergency = useData<PublicQueue>(api, '/publico/fila/emergencia', v);
  const laboratory = useData<PublicQueue>(api, '/publico/fila/laboratorio', v);
  const admissions = useData<PublicQueue>(api, '/publico/fila/admisiones', v);
  const byService: Record<string, Remote<PublicQueue>> = { consulta_general: general, emergencia: emergency, laboratorio: laboratory, admisiones: admissions };
  const queues = publicServices.map(service => ({ service, state: byService[service.id] }));
  useRefreshAt(notices.data?.proximoCambio, () => setTick(t => t + 1));
  useRefreshAt(doctors.data?.proximoCambio, () => setTick(t => t + 1));

  const floors = new Map<string, PublicOccupancy['ocupacion']>();
  for (const row of occupancy.data?.ocupacion ?? []) {
    const key = row.planta == null ? 'Sin planta' : `Planta ${row.planta}`;
    floors.set(key, [...(floors.get(key) ?? []), row]);
  }

  return <div className="public-screen">
    <header className="public-header"><Brand light /><h1>Información del hospital</h1><Clock /></header>
    {!live && <p className="public-band" role="status">Actualizando en cuanto vuelva la conexión.</p>}
    <main className="public-grid">
      <Panel title="Números llamados" state={queues[0].state} empty="" isEmpty={() => false} className="public-panel-queue">{() =>
        <div className="public-queues">{queues.map(({ service, state }) => <div key={service.id} className="public-queue" aria-label={service.label}>
          <h3>{service.label}</h3>
          {state.data && state.data.llamados.length > 0
            ? <ol>{state.data.llamados.slice(0, 3).map(n => <li key={n.numero}><strong>{n.numero}</strong><span>{n.consultorio ?? 'Pase a ventanilla'}</span></li>)}</ol>
            : <p className="public-muted">{state.error ? 'No disponible' : 'Sin números llamados'}</p>}
        </div>)}</div>}
      </Panel>
      <Panel title="Ocupación por planta" state={occupancy} empty="Todavía no hay camas registradas." isEmpty={d => d.ocupacion.length === 0}>{() =>
        <ul className="public-floors">{[...floors].map(([floor, rows]) => <li key={floor}>
          <strong>{floor}</strong>
          {rows.map(r => <span key={r.categoria}>{categoryNames[r.categoria] ?? r.categoria}: <b>{r.libres}</b> libres de {r.camas}</span>)}
        </li>)}</ul>}
      </Panel>
      <Panel title="Médicos de turno" state={doctors} empty="No hay médicos de turno registrados en este momento." isEmpty={d => d.medicos.length === 0}>{d =>
        <ul className="public-doctors">{d.medicos.map((m, i) => <li key={`${m.nombre}-${i}`}><strong>{m.nombre}</strong><span>{m.especialidad}{m.area ? ` · ${m.area}` : ''}</span><small>Hasta las {hour(m.hasta)}</small></li>)}</ul>}
      </Panel>
      <Panel title="Avisos" state={notices} empty="No hay avisos vigentes." isEmpty={d => d.avisos.length === 0} className="public-panel-notices">{d =>
        <ul className="public-notices">{d.avisos.map(a => <li key={a.id}><strong>{a.titulo}</strong><p>{a.cuerpo}</p></li>)}</ul>}
      </Panel>
    </main>
  </div>;
}
