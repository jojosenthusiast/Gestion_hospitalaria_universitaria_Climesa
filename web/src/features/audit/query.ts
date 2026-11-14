import type { ExportTable } from '../../lib/export';

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
};
export type AuditSort = { key: SortKey; dir: 'asc' | 'desc' };
export type SortKey = 'fecha' | 'persona' | 'rol' | 'accion' | 'entidad' | 'paciente' | 'resultado';

export const emptyFilters: AuditFilters = { person: '', personId: '', patient: '', role: '', action: '', entity: '', results: [], from: '', to: '' };
export const defaultSort: AuditSort = { key: 'fecha', dir: 'desc' };
export const PAGE_SIZES = [25, 50, 100];

/** Día local de El Salvador (UTC-6 todo el año) como `yyyy-MM-dd`. */
export const localDay = (offsetDays = 0, now = new Date()) => new Date(now.getTime() - 6 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
const startOfDay = (day: string) => new Date(`${day}T00:00:00-06:00`).toISOString();
const endExclusive = (day: string) => new Date(new Date(`${day}T00:00:00-06:00`).getTime() + 86400_000).toISOString();

export const resultNames: Record<string, string> = { exito: 'Correcto', denegado: 'Denegado', fallido: 'Fallido' };

/** Vistas rápidas del auditor: cada una solo reemplaza los filtros, el orden se conserva. */
export const presets: { id: string; label: string; hint: string; filters: (now?: Date) => Partial<AuditFilters> }[] = [
  { id: 'expedientes-hoy', label: 'Accesos a expedientes hoy', hint: 'Lecturas de fichas, historiales, consultas y laboratorio de hoy',
    filters: now => ({ action: 'expediente.leer,pacientes.ver_ficha,consulta.leer,laboratorio.leer,admision.leer', from: localDay(0, now), to: localDay(0, now) }) },
  { id: 'permisos', label: 'Cambios de permisos', hint: 'Roles, invitaciones y estado de cuentas',
    filters: () => ({ action: 'usuarios.roles,usuarios.estado,usuarios.invitar' }) },
  { id: 'fallos', label: 'Fallos y denegaciones', hint: 'Intentos sin permiso y operaciones que fallaron',
    filters: () => ({ results: ['denegado', 'fallido'] }) },
];

export const presetLabel = (action: string) => presets.find(p => p.filters().action === action)?.label;

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
const actionCount = (action: string) => action.split(',').filter(Boolean).length;
export function chips(filters: AuditFilters, personLabel = ''): Chip[] {
  const list: Chip[] = [];
  if (filters.personId || filters.person.trim()) list.push({ key: filters.personId ? 'personId' : 'person', label: `Persona: ${personLabel || filters.person.trim() || 'elegida'}` });
  if (filters.patient.trim()) list.push({ key: 'patient', label: `Expediente: ${filters.patient.trim()}` });
  if (filters.role) list.push({ key: 'role', label: `Rol: ${filters.role}` });
  if (filters.action.trim()) list.push({ key: 'action', label: actionCount(filters.action) > 1 ? `Acciones: ${actionCount(filters.action)} tipos` : `Acción: ${filters.action.trim()}` });
  if (filters.entity) list.push({ key: 'entity', label: `Entidad: ${filters.entity}` });
  for (const result of filters.results) list.push({ key: `result:${result}`, label: `Resultado: ${resultNames[result] ?? result}` });
  if (filters.from || filters.to) list.push({ key: 'from', label: `Fechas: ${filters.from || '…'} a ${filters.to || '…'}` });
  return list;
}

export function removeChip(filters: AuditFilters, key: Chip['key']): AuditFilters {
  if (key.startsWith('result:')) return { ...filters, results: filters.results.filter(r => `result:${r}` !== key) };
  if (key === 'from') return { ...filters, from: '', to: '' };
  if (key === 'personId') return { ...filters, personId: '', person: '' };
  return { ...filters, [key]: Array.isArray(emptyFilters[key as keyof AuditFilters]) ? [] : '' } as AuditFilters;
}

const verbs: Record<string, string> = {
  leer: 'lectura', ver_ficha: 'ver ficha', buscar: 'búsqueda', registrar: 'registro', editar: 'edición', estado: 'cambio de estado', roles: 'cambio de roles', invitar: 'invitación',
  emitir: 'emisión', firmar: 'firma', cancelar: 'cancelación', asignar: 'asignación', trasladar: 'traslado', publicar: 'publicación', consultar: 'consulta', verificar: 'verificación',
  exportar: 'exportación', denegado: 'acceso denegado', conflicto: 'conflicto', mis_accesos: 'mis accesos', solicitar: 'solicitud', despachar: 'despacho', llamar: 'llamado',
};
const nouns: Record<string, string> = {
  expediente: 'Expediente', pacientes: 'Pacientes', consulta: 'Consulta', laboratorio: 'Laboratorio', admision: 'Hospitalización', usuarios: 'Cuentas', auditoria: 'Auditoría',
  avisos: 'Avisos', ambulancia: 'Ambulancia', camas: 'Camas', citas: 'Citas', fila: 'Fila', inventario: 'Inventario', receta: 'Receta', signos: 'Signos vitales', alta: 'Alta',
  acceso: 'Acceso', idempotencia: 'Idempotencia', vinculacion: 'Vinculación', cuenta: 'Cuenta', turnos: 'Turnos', personal: 'Personal', enfermeria: 'Enfermería', diagnostico: 'Diagnóstico',
};
/** «consulta.leer» → «Consulta · lectura». Lo desconocido se muestra tal cual. */
export function describeAction(action: string) {
  const [noun, ...rest] = action.split('.');
  const verb = rest.join('.');
  if (!nouns[noun] && !verbs[verb]) return action;
  return `${nouns[noun] ?? noun}${verb ? ` · ${verbs[verb] ?? verb.replace(/[_.]/g, ' ')}` : ''}`;
}

export type AuditRowData = { seq: string; at: string; role: string | null; actor: string | null; actorId?: string | null; permission?: string | null; action: string; entity: string; entityId?: string | null; patientId?: string | null; patientRecord?: string | null; result: string; reason?: string | null };
export type AuditPageData = { filas: AuditRowData[]; total: number; pagina: number; limite: number };
export type AuditDetailData = AuditRowData & { correlation: string | null; detail: Record<string, unknown>; hash: string; previousHash: string; previousSeq: string | null; nextSeq: string | null };
export type AuditOptions = { acciones: string[]; entidades: string[]; roles: string[] };

export const fullDate = (value: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'full', timeStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(value));
const shortDate = (value: string) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/El_Salvador' }).format(new Date(value));

export function exportTableOf(rows: AuditRowData[], subtitle: string): ExportTable {
  return {
    filename: 'auditoria-climesa', title: 'Auditoría CLIMESA', subtitle,
    columns: ['N.º', 'Fecha', 'Persona', 'Rol', 'Acción', 'Entidad', 'Expediente', 'Resultado', 'Motivo'],
    rows: rows.map(r => [r.seq, shortDate(r.at), r.actor ?? 'Sistema', r.role ?? '', r.action, r.entity, r.patientRecord ?? '', resultNames[r.result] ?? r.result, r.reason ?? '']),
  };
}
