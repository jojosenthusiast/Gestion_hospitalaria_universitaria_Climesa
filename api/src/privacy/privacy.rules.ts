/** Pure rules of spec 110: classification of audit rows for "who saw my record". */

/** Audit actions that are not someone looking at the record (the transparency view leaves them out; `acceso_excepcional.` rows are legacy). */
export const NON_ACCESS_ACTIONS = ['acceso_excepcional.', 'acceso.denegado', 'idempotencia.'];
export const isRecordAccess = (action: string) => !NON_ACCESS_ACTIONS.some(prefix => action.startsWith(prefix));

/** Kind of data an audited operation touched, for "who saw my record" (FR-110-08), without clinical values. */
const entityLabels: Record<string, string> = {
  paciente: 'datos personales', consulta: 'consulta', signos_vitales: 'signos vitales', diagnostico: 'diagnóstico', receta: 'receta',
  orden_laboratorio: 'laboratorio', orden: 'laboratorio', admision: 'hospitalización', cama: 'cama asignada', ticket_fila: 'fila', cita: 'cita',
  movimiento: 'inventario', nota_enfermeria: 'enfermería',
};
export const entityLabel = (entity: string) => entityLabels[entity] ?? entity.replace(/_/g, ' ');

/** Audit `motivo` of rows written by the retired exceptional-access module; kept to classify historical rows. */
export const EXCEPTIONAL_REASON = 'acceso_excepcional';
