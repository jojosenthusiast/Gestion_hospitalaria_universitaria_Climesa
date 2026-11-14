import { can, type AccessProfile, type Api, type Appointment, type AuditRow, type Bed, type Shift, type Staff, type Summary, type UserAccount } from '../../lib/api';
import type { AmbulanceStatus } from '../ambulance';
import type { LinkRequest } from '../account-links';
import { useData, type Remote } from '../common';
import type { Consultation } from '../consultations';
import type { MetricsBoard } from '../tablero';

// Tipos mínimos de los listados que ya consumen los módulos: el inicio solo lee, nunca escribe.
export type QueueTicket = { id: string; service: string; numero: number; patientName?: string | null; state: string; issuedAt: string; officeId?: string | null };
export type LabOrderRow = { id: string; patientName?: string; priority: string; state: string; createdAt: string; sampleTakenAt?: string | null; completedAt?: string | null; reviewedAt?: string | null; items: { id: string; name: string }[] };
export type StockRow = { articulo_id: string; codigo: string; nombre: string; tipo: string; unidad: string; minimo: number; disponible: number; vencido: number; bajo_minimo: boolean };
export type AdmissionRow = { id: string; patientName: string; state: string; requestedCategory: string; isolation: boolean; bed: string };

/** Cada fuente es un listado o agregado existente de la API; la cuenta la pide solo si tiene alguno de sus permisos. */
export const sources = {
  summary: { path: '/inicio', any: ['sesion.perfil'] },
  board: { path: '/metricas/tablero', any: ['metricas.ver'] },
  queue: { path: '/fila', any: ['fila.ver'] },
  appts: { path: '/citas', any: ['citas.ver'] },
  lab: { path: '/laboratorio/ordenes', any: ['laboratorio.ver_cola', 'resultados.ver'] },
  myLab: { path: '/me/laboratorio', any: ['resultados.ver'] },
  beds: { path: '/camas', any: ['camas.ver_tablero'] },
  admissions: { path: '/admisiones', any: ['admision.ver'] },
  stock: { path: '/inventario/existencias', any: ['inventario.ver'] },
  ambulance: { path: '/ambulancia', any: ['ambulancia.ver_estado'] },
  shifts: { path: '/turnos', any: ['turnos.ver'] },
  myShifts: { path: '/turnos/mios', any: ['turnos.ver'] },
  agenda: { path: '/consultas/agenda', any: ['consulta.iniciar'] },
  links: { path: '/cuentas/vinculaciones', any: ['cuentas.verificar'] },
  users: { path: '/usuarios', any: ['usuarios.ver'] },
  staff: { path: '/personal', any: ['personal.ver'] },
  audit: { path: '/auditoria?limite=200', any: ['auditoria.ver'] },
} as const;
export type Source = keyof typeof sources;

export type DashboardData = {
  summary: Remote<Summary>; board: Remote<MetricsBoard>; queue: Remote<QueueTicket[]>; appts: Remote<Appointment[]>;
  lab: Remote<LabOrderRow[]>; myLab: Remote<LabOrderRow[]>; beds: Remote<Bed[]>; admissions: Remote<AdmissionRow[]>; stock: Remote<StockRow[]>;
  ambulance: Remote<AmbulanceStatus>; shifts: Remote<Shift[]>; myShifts: Remote<Shift[]>; agenda: Remote<Consultation[]>;
  links: Remote<LinkRequest[]>; users: Remote<UserAccount[]>; staff: Remote<Staff[]>; audit: Remote<AuditRow[]>;
};

function useSource<T>(api: Api, profile: AccessProfile, version: number, needed: ReadonlySet<Source>, key: Source) {
  return useData<T>(api, sources[key].path, version, needed.has(key) && sources[key].any.some(permission => can(profile, permission)));
}

/**
 * Pide una sola vez cada fuente que necesitan los roles de la cuenta. Las fuentes que nadie usa quedan
 * deshabilitadas (no hacen petición), y cada una se vuelve a pedir sola cuando llega un evento de su entidad.
 */
export function useDashboardData(api: Api, profile: AccessProfile, version: number, needed: ReadonlySet<Source>): DashboardData {
  return {
    summary: useSource<Summary>(api, profile, version, needed, 'summary'), board: useSource<MetricsBoard>(api, profile, version, needed, 'board'), queue: useSource<QueueTicket[]>(api, profile, version, needed, 'queue'), appts: useSource<Appointment[]>(api, profile, version, needed, 'appts'),
    lab: useSource<LabOrderRow[]>(api, profile, version, needed, 'lab'), myLab: useSource<LabOrderRow[]>(api, profile, version, needed, 'myLab'), beds: useSource<Bed[]>(api, profile, version, needed, 'beds'), admissions: useSource<AdmissionRow[]>(api, profile, version, needed, 'admissions'), stock: useSource<StockRow[]>(api, profile, version, needed, 'stock'),
    ambulance: useSource<AmbulanceStatus>(api, profile, version, needed, 'ambulance'), shifts: useSource<Shift[]>(api, profile, version, needed, 'shifts'), myShifts: useSource<Shift[]>(api, profile, version, needed, 'myShifts'), agenda: useSource<Consultation[]>(api, profile, version, needed, 'agenda'),
    links: useSource<LinkRequest[]>(api, profile, version, needed, 'links'), users: useSource<UserAccount[]>(api, profile, version, needed, 'users'), staff: useSource<Staff[]>(api, profile, version, needed, 'staff'), audit: useSource<AuditRow[]>(api, profile, version, needed, 'audit'),
  };
}
