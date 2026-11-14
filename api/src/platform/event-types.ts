/**
 * DAT-06: catalog of thin events the API and the database emit to `plataforma.outbox`.
 * `tests/contrato-api.spec.ts` fails when code emits a type that is missing here, or this lists one nobody emits.
 * The human-readable catalog (channels, who reacts) is `docs/arquitectura/tiempo-real.md`.
 */
export const EVENT_TYPES = [
  'admision.actualizada', 'admision.cama_asignada', 'admision.creada',
  'ambulancia.estado_cambiado', 'ambulancia.hito', 'ambulancia.prehospital', 'ambulancia.solicitud_creada', 'ambulancia.ubicacion',
  'aviso.publicado',
  'cama.estado_cambiado', 'cama.limpieza_pendiente',
  'caso_duplicado.abierto',
  'cita.actualizada',
  'consulta.actualizada',
  'espacio.actualizado',
  'fila.actualizada', 'fila.estado', 'fila.llamado',
  'inventario.actualizado', 'inventario.bajo_minimo',
  'laboratorio.actualizado', 'laboratorio.critico',
  'metricas.recalculadas',
  'paciente.actualizado', 'paciente.creado',
  'personal.actualizado',
  'turno.actualizado', 'turno.cambiado', 'turno.publicado',
  'usuario.actualizado',
  'vinculacion.resuelta', 'vinculacion.solicitada',
] as const;
export type EventType = typeof EVENT_TYPES[number];
