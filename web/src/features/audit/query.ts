import type { ExportTable } from '../../lib/export';
import { roleNames } from '../../lib/api';
import { actionArea, actionSentence, entityName } from './labels';

/** Filtros del espacio del auditor (obs. 18). Todo es metadato: la auditoría nunca guarda valores clínicos. */
export type AuditFilters = {
  /** Texto libre: nombre o correo de la cuenta. */
  person: string;
  /** Id de cuenta elegida en el selector; tiene prioridad sobre `person`. */
  personId: string;
  patient: string;
  role: string;
  action: string;
  entity: string;
  results: string[];
  from: string;
  to: string;
  /** Include the auditor's own reads of the audit (hidden by default; they are still recorded). */
  includeMine: boolean;
};
export type AuditSort = { key: SortKey; dir: 'asc' | 'desc' };
export type SortKey = 'fecha' | 'persona' | 'rol' | 'accion' | 'entidad' | 'resultado';

export const emptyFilters: AuditFilters = { person: '', personId: '', patient: '', role: '', action: '', entity: '', results: [], from: '', to: '', includeMine: false };
export const defaultSort: AuditSort = { key: 'fecha', dir: 'desc' };
export const PAGE_SIZES = [25, 50, 100];

/** Día local de El Salvador (UTC-6 todo el año) como `yyyy-MM-dd`. */
export const localDay = (offsetDays = 0, now = new Date()) => new Date(now.getTime() - 6 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
const startOfDay = (day: string) => new Date(`${day}T00:00:00-06:00`).toISOString();
const endExclusive = (day: string) => new Date(new Date(`${day}T00:00:00-06:00`).getTime() + 86400_000).toISOString();

export const resultNames: Record<string, string> = { exito: 'Correcto', denegado: 'Denegado', fallido: 'Fallido' };

/**
 * Views of the audit (S23): each one is a tab with a one-line explanation. The view sets the actions or results it is
 * about; the filter panel only narrows it further, so the view is never repeated as a filter.
 */
export type AuditView = { id: ViewId; label: string; hint: string; action?: string; results?: string[] };
export type ViewId = 'todo' | 'expedientes' | 'cuentas' | 'fallos';
export const views: AuditView[] = [
  { id: 'todo', label: 'Toda la actividad', hint: 'Todo lo que hicieron las personas en el sistema, de lo más reciente a lo más antiguo.' },
  { id: 'expedientes', label: 'Accesos a expedientes', hint: 'Quién abrió fichas, historiales, consultas, hospitalizaciones o resultados de laboratorio de un paciente.',
    action: 'expediente.,pacientes.ver_ficha,consulta.leer,laboratorio.leer,admision.leer,signos.leer,enfermeria.leer' },
  { id: 'cuentas', label: 'Cambios de permisos y cuentas', hint: 'Invitaciones, roles, cuentas activadas o desactivadas y cambios en los datos del personal (Administración).',
    action: 'usuarios.,personal.' },
  { id: 'fallos', label: 'Fallos y denegaciones', hint: 'Intentos sin permiso y operaciones que no se completaron.', results: ['denegado', 'fallido'] },
];
export const viewOf = (id: ViewId) => views.find(v => v.id === id) ?? views[0];

/** The filters actually sent: the view's actions and results unless the panel narrows them. */
export function effectiveFilters(filters: AuditFilters, view: ViewId): AuditFilters {
  const v = viewOf(view);
  return { ...filters, action: filters.action || v.action || '', results: filters.results.length ? filters.results : v.results ?? [] };
}

/** Parámetros de la API para estos filtros (sin paginación). */
export function filterParams(filters: AuditFilters): URLSearchParams {
  const params = new URLSearchParams();
  const person = filters.personId || filters.person.trim();
  if (person.length >= 2) params.set('persona', person);
  if (filters.patient.trim().length >= 2) params.set('paciente', filters.patient.trim());
  if (filters.role) params.set('rol', filters.role);
  if (filters.action.trim().length >= 2) params.set('accion', filters.action.trim());
  if (filters.entity) params.set('entidad', filters.entity);
  if (filters.results.length) params.set('resultado', filters.results.join(','));
  if (filters.from) params.set('desde', startOfDay(filters.from));
  if (filters.to) params.set('hasta', endExclusive(filters.to));
  if (filters.includeMine) params.set('incluirConsultasAuditoria', 'true');
  return params;
}

export function pageQuery(filters: AuditFilters, sort: AuditSort, page: number, size: number, extra: Record<string, string> = {}) {
  const params = filterParams(filters);
  params.set('orden', sort.key);
  params.set('sentido', sort.dir);
  params.set('pagina', String(page));
  params.set('limite', String(size));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `?${params.toString()}`;
}

/** Cantidad de filtros activos, para el botón «Filtros». */
export const activeCount = (filters: AuditFilters) => chips(filters).length;

export type Chip = { key: keyof AuditFilters | `result:${string}`; label: string };
/** «usuarios.» (a whole area) or one action, in words. */
export const actionLabel = (action: string) => action.endsWith('.') ? `Todo en ${actionArea(action)}` : actionSentence(action);
export function chips(filters: AuditFilters, personLabel = ''): Chip[] {
  const list: Chip[] = [];
  if (filters.personId || filters.person.trim()) list.push({ key: filters.personId ? 'personId' : 'person', label: `Persona: ${personLabel || filters.person.trim() || 'elegida'}` });
  if (filters.patient.trim()) list.push({ key: 'patient', label: `Expediente: ${filters.patient.trim()}` });
  if (filters.role) list.push({ key: 'role', label: `Rol: ${roleNames[filters.role] ?? filters.role}` });
  if (filters.action.trim()) list.push({ key: 'action', label: `Qué hizo: ${actionLabel(filters.action.trim())}` });
  if (filters.entity) list.push({ key: 'entity', label: `Sobre qué: ${entityName(filters.entity)}` });
  for (const result of filters.results) list.push({ key: `result:${result}`, label: `Resultado: ${resultNames[result] ?? result}` });
  if (filters.from || filters.to) list.push({ key: 'from', label: `Fechas: ${filters.from || '…'} a ${filters.to || '…'}` });
  if (filters.includeMine) list.push({ key: 'includeMine', label: 'Con mis consultas a la auditoría' });
  return list;
}

export function removeChip(filters: AuditFilters, key: Chip['key']): AuditFilters {
  if (key.startsWith('result:')) return { ...filters, results: filters.results.filter(r => `result:${r}` !== key) };
  if (key === 'from') return { ...filters, from: '', to: '' };
  if (key === 'personId') return { ...filters, personId: '', person: '' };
  if (key === 'includeMine') return { ...filters, includeMine: false };
  return { ...filters, [key]: Array.isArray(emptyFilters[key as keyof AuditFilters]) ? [] : '' } as AuditFilters;
}

/** Role codes of a row («ADM,DPD») as names: «Administración · Protección de datos». */
export const roleText = (role: string | null | undefined) => (role ?? '').split(',').filter(Boolean).map(r => roleNames[r] ?? r).join(' · ');

export type AuditRowData = { seq: string; at: string; role: string | null; actor: string | null; actorId?: string | null; permission?: string | null; action: string; entity: string; entityId?: string | null; patientId?: string | null; patientRecord?: string | null; result: string; reason?: string | null; subject?: string | null };
export type AuditPageData = { filas: AuditRowData[]; total: number; pagina: number; limite: number };
export type AuditDetailData = AuditRowData & { correlation: string | null; detail: Record<string, unknown>; hash: string; previousHash: string; previousSeq: string | null; nextSeq: string | null };
export type AuditOptions = { acciones: string[]; entidades: string[]; roles: string[] };

export const fullDate = (value: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'full', timeStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(value));
const shortDate = (value: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(value));

export function exportTableOf(rows: AuditRowData[], subtitle: string): ExportTable {
  return {
    filename: 'auditoria-climesa', title: 'Auditoría CLIMESA', subtitle,
    columns: ['N.º', 'Fecha', 'Persona', 'Rol', 'Qué hizo', 'Código de la acción', 'Sobre qué', 'Expediente', 'Resultado', 'Motivo'],
    rows: rows.map(r => [r.seq, shortDate(r.at), r.actor ?? 'Sistema', roleText(r.role), actionSentence(r.action), r.action,
      [entityName(r.entity), r.subject].filter(Boolean).join(': '), r.patientRecord ?? '', resultNames[r.result] ?? r.result, r.reason ?? '']),
  };
}
