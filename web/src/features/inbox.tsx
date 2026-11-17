import { Icon } from '../components/ui';
import { can, type AccessProfile, type Api, type Appointment } from '../lib/api';
import type { AmbulanceStatus } from './ambulance';
import type { LinkRequest } from './account-links';
import { useData } from './common';

// W04 «Inicio de trabajo» (FR-113-04): a tray with what is waiting for this account and live counters.
// Each item depends on a permission (rule 8), never on a role name, and reads an existing list
// endpoint; the count refreshes when an event of that entity arrives (WEB-01, `live-scope.ts`).
type Item = { id: string; permission: string; label: string; href: string; path: string; count: (data: never) => number };

const items: Item[] = [
  { id: 'vinculaciones', permission: 'cuentas.verificar', label: 'Vinculaciones por verificar', href: '#/vinculaciones', path: '/cuentas/vinculaciones', count: ((rows: LinkRequest[]) => rows.length) as Item['count'] },
  { id: 'citas', permission: 'citas.agendar', label: 'Solicitudes de cita', href: '#/citas', path: '/citas', count: ((rows: Appointment[]) => rows.filter(r => r.state === 'solicitada').length) as Item['count'] },
  { id: 'ambulancia', permission: 'ambulancia.ver_estado', label: 'Solicitudes de ambulancia por confirmar', href: '#/ambulancia', path: '/ambulancia', count: ((status: AmbulanceStatus) => status.pendingRequests?.length ?? -1) as Item['count'] },
  { id: 'admisiones', permission: 'admision.ver', label: 'Admisiones sin cama', href: '#/hospitalizacion', path: '/admisiones', count: ((rows: { state: string }[]) => rows.filter(r => r.state === 'pendiente_cama').length) as Item['count'] },
  // S10: proposed follow-up appointments wait on this same page (LabFollowUpPanel), below the tray.
  { id: 'seguimientos', permission: 'citas.agendar', label: 'Citas de seguimiento por confirmar', href: '#/inicio', path: '/laboratorio/seguimientos', count: ((rows: unknown[]) => rows.length) as Item['count'] },
  { id: 'laboratorio', permission: 'laboratorio.ver_cola', label: 'Órdenes de laboratorio en cola', href: '#/laboratorio', path: '/laboratorio/ordenes', count: ((rows: { state: string }[]) => rows.filter(r => ['pendiente', 'en_proceso'].includes(r.state)).length) as Item['count'] },
];

export const inboxItems = (profile: AccessProfile) => items.filter(item => can(profile, item.permission));

function Counter({ api, item, version }: { api: Api; item: Item; version: number }) {
  const data = useData<never>(api, item.path, version);
  const count = data.data ? item.count(data.data) : null;
  // -1: the endpoint does not give this account that list (for example, no dispatch rights).
  if (count === -1) return null;
  // S3: no number until the list arrives (a placeholder keeps the size); an error shows a dash, never a fake zero.
  const value = data.error ? <strong className="inbox-count" aria-hidden="true">—</strong>
    : count === null ? <span className="inbox-count is-loading" aria-hidden="true" />
      : <strong className="inbox-count" aria-hidden="true">{count}</strong>;
  return <li><a className={`inbox-item${count === 0 ? ' is-zero' : ''}`} href={item.href}>
    {value}
    <span className="inbox-label">{item.label}</span>
    <span className="sr-only">{data.error ? 'No se pudo cargar' : count === null ? 'Cargando' : `${count} pendientes`}</span>
    <Icon name="arrow" size={16} />
  </a></li>;
}

/** Bandeja de pendientes del inicio: una fila de contadores (cifra + etiqueta), cada uno lleva a su módulo. */
export function WorkInbox({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const visible = inboxItems(profile);
  if (!visible.length) return null;
  return <section className="work-inbox" aria-labelledby="work-inbox-title">
    <h2 id="work-inbox-title" className="section-title">Pendientes</h2>
    <ul className="inbox-grid">{visible.map(item => <Counter key={item.id} api={api} item={item} version={version} />)}</ul>
  </section>;
}
