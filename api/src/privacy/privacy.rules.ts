/** Pure rules of spec 110 (RN-38, RN-40, FR-110-09). */

export type ExceptionalAccessState = 'pendiente' | 'aprobado' | 'negado';
export type ExceptionalAccessView = 'pendiente' | 'por_revisar' | 'vigente' | 'vencido' | 'negado';

/**
 * State shown to people: an urgent access opened without approval is `por_revisar` while the delegate has not
 * reviewed it; an approved access is `vigente` only inside its range and `vencido` after it (it expires by itself).
 */
export function accessView(row: { estado: ExceptionalAccessState; urgencia: boolean; resueltoPor: string | null; desde: Date | string | null; hasta: Date | string | null }, now: Date): ExceptionalAccessView {
  if (row.estado === 'pendiente') return 'pendiente';
  if (row.estado === 'negado') return 'negado';
  const start = row.desde ? new Date(row.desde).getTime() : NaN, end = row.hasta ? new Date(row.hasta).getTime() : NaN;
  const active = start <= now.getTime() && now.getTime() < end;
  if (active && row.urgencia && !row.resueltoPor) return 'por_revisar';
  return active ? 'vigente' : 'vencido';
}

/** Hours actually granted: never more than requested nor than the policy allows (RN-40). */
export function grantedHours(requested: number, approved: number | undefined, policyMax: number): number {
  return Math.max(1, Math.min(requested, approved ?? requested, policyMax));
}

/** Audit actions that are not someone looking at the record (the transparency view leaves them out). */
export const NON_ACCESS_ACTIONS = ['acceso_excepcional.', 'acceso.denegado', 'idempotencia.'];
export const isRecordAccess = (action: string) => !NON_ACCESS_ACTIONS.some(prefix => action.startsWith(prefix));

/** Kind of data an audited operation touched, for "who saw my record" (FR-110-08), without clinical values. */
const entityLabels: Record<string, string> = {
  paciente: 'datos personales', consulta: 'consulta', signos_vitales: 'signos vitales', diagnostico: 'diagnóstico', receta: 'receta',
  orden_laboratorio: 'laboratorio', orden: 'laboratorio', admision: 'hospitalización', cama: 'cama asignada', ticket_fila: 'fila', cita: 'cita',
  movimiento: 'inventario', nota_enfermeria: 'enfermería',
};
export const entityLabel = (entity: string) => entityLabels[entity] ?? entity.replace(/_/g, ' ');

/** Audit `motivo` of a read granted by an exceptional access (privacidad.md §3.4: explicit reason). */
export const EXCEPTIONAL_REASON = 'acceso_excepcional';
