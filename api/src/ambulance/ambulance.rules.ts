/** Reglas puras del servicio de ambulancia (RN-28 a RN-34). La base repite las garantías con restricciones y disparadores. */
export type UnitState = 'disponible' | 'en_servicio' | 'en_mantenimiento';
export const milestoneTypes = ['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado'] as const;
export type MilestoneType = typeof milestoneTypes[number];
export const finalStates = ['completado', 'cancelado', 'sin_traslado', 'rechaza_traslado'] as const;
export type FinalState = typeof finalStates[number];
export const serviceTypes = ['emergencia_domicilio', 'traslado_interhospitalario'] as const;
export const priorities = ['roja', 'naranja', 'amarilla', 'verde'] as const;

/** Por qué no se puede despachar ahora y qué hacer; null si el despacho es posible (RN-29, RN-30). */
export type DispatchBlock = { code: 'en_servicio' | 'en_mantenimiento' | 'sin_paramedico_de_turno'; message: string; action: string };
export function dispatchBlock(state: UnitState, paramedicOnDuty: boolean): DispatchBlock | null {
  if (state === 'en_servicio') return { code: 'en_servicio', message: 'La unidad tiene un servicio activo.', action: 'Espera a que la tripulación finalice el servicio; después podrás despachar.' };
  if (state === 'en_mantenimiento') {
    return paramedicOnDuty
      ? { code: 'en_mantenimiento', message: 'La unidad está en mantenimiento.', action: 'Saca la unidad de mantenimiento con un motivo para poder despachar.' }
      : { code: 'en_mantenimiento', message: 'La unidad está en mantenimiento y no hay paramédico con turno en curso.', action: 'Publica un turno de paramédico que cubra la hora actual y luego saca la unidad de mantenimiento (RN-30).' };
  }
  if (!paramedicOnDuty) return { code: 'sin_paramedico_de_turno', message: 'No hay paramédico con turno en curso.', action: 'Publica un turno de paramédico que cubra la hora actual; la unidad no puede despacharse sin él (RN-30).' };
  return null;
}
/** Expediente enmascarado para la bitácora: solo se ven los últimos 3 caracteres (D-056, privacidad). */
export const maskRecord = (record: string | null | undefined) => record ? '*'.repeat(Math.max(record.length - 3, 0)) + record.slice(-3) : null;
/** Texto sin acentos ni mayúsculas para buscar en la bitácora. */
export const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Hitos que pueden seguir al último registrado (RN-32). `finalizado` se permite desde la salida. */
export function nextMilestones(done: readonly string[]): MilestoneType[] {
  if (done.includes('finalizado')) return [];
  if (!done.includes('salida')) return ['salida'];
  const last = [...milestoneTypes].reverse().find(type => done.includes(type))!;
  const following: Record<string, MilestoneType[]> = {
    salida: ['en_escena', 'finalizado'],
    en_escena: ['trasladando', 'finalizado'],
    trasladando: ['en_hospital'],
    en_hospital: ['finalizado'],
  };
  return following[last] ?? [];
}

/**
 * Estado final permitido al finalizar: `completado` solo después de llegar al hospital; antes, el servicio termina
 * cancelado, sin traslado o con rechazo del paciente, y siempre con motivo. Devuelve el mensaje de error o null.
 */
export function finalStateError(done: readonly string[], finalState: string | undefined, reason: string | undefined): string | null {
  const arrived = done.includes('en_hospital');
  const state = finalState ?? (arrived ? 'completado' : undefined);
  if (!state) return 'Indica cómo terminó el servicio: cancelado, sin traslado o rechazo del traslado.';
  if (state === 'completado' && !arrived) return 'Solo se completa un servicio que llegó al hospital; indica otro estado final con su motivo.';
  if (state !== 'completado' && arrived) return 'El servicio ya llegó al hospital; finalízalo como completado.';
  if (state !== 'completado' && (reason ?? '').trim().length < 5) return 'Indica el motivo de terminar sin traslado (al menos 5 caracteres).';
  return null;
}

/** Minutos enteros entre el despacho y la llegada a la escena (tiempo de respuesta, D-056). */
export const responseMinutes = (dispatchedAt: Date, onScene: Date | null) =>
  onScene ? Math.max(0, Math.round((onScene.getTime() - dispatchedAt.getTime()) / 60000)) : null;

/** El reporte prehospital se puede enviar durante el servicio y hasta 24 h después de finalizar (privacidad "(servicio)"). */
export const PREHOSPITAL_GRACE_MS = 24 * 3600_000;
export const canReportAfter = (finishedAt: Date | null, now: Date) => !finishedAt || now.getTime() - finishedAt.getTime() <= PREHOSPITAL_GRACE_MS;

/**
 * Turno en curso (RN-30): persona paramédica activa con turno publicado o en curso que contiene el instante dado.
 * No usa `personal.v_turno_en_curso` porque esa vista lee `now()` de la base y aquí el reloj es sustituible.
 */
export const PARAMEDIC_ON_DUTY_SQL = "SELECT 1 FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE p.tipo='paramedico' AND p.activo AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz LIMIT 1";
/** Tripulación asignada al despachar: paramédicos y motoristas activos con turno en curso. */
export const CREW_ON_DUTY_SQL = "SELECT DISTINCT p.id,p.tipo FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE p.tipo IN ('paramedico','motorista') AND p.activo AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz";
