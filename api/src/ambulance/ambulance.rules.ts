/** Reglas puras del servicio de ambulancia (RN-28 a RN-34). La base repite las garantías con restricciones y disparadores. */
export type UnitState = 'disponible' | 'en_servicio' | 'en_mantenimiento';
export const milestoneTypes = ['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado'] as const;
export type MilestoneType = typeof milestoneTypes[number];
export const finalStates = ['completado', 'cancelado', 'sin_traslado', 'rechaza_traslado', 'fallecido', 'desviado'] as const;
export type FinalState = typeof finalStates[number];
export const serviceTypes = ['emergencia_domicilio', 'traslado_interhospitalario'] as const;
export const priorities = ['roja', 'naranja', 'amarilla', 'verde'] as const;

/** Por qué no se puede despachar ahora y qué hacer; null si el despacho es posible (RN-29, RN-30). */
export type CrewBlockCode = 'sin_paramedico_de_turno' | 'sin_motorista_de_turno' | 'sin_tripulacion_de_turno';
export type DispatchBlock = { code: 'en_servicio' | 'en_mantenimiento' | CrewBlockCode; message: string; action: string };
/** Quién falta de la tripulación mínima (RN-30: paramédico y motorista con turno en curso); null si están los dos. */
export function missingCrew(paramedicOnDuty: boolean, driverOnDuty: boolean, paramedicWithAccount = paramedicOnDuty): { code: CrewBlockCode; who: string; shift: string } | null {
  if (!paramedicOnDuty && !driverOnDuty) return { code: 'sin_tripulacion_de_turno', who: 'paramédico ni motorista', shift: 'un turno de paramédico y otro de motorista que cubran' };
  if (!paramedicOnDuty) return { code: 'sin_paramedico_de_turno', who: 'paramédico', shift: 'un turno de paramédico que cubra' };
  if (!driverOnDuty) return { code: 'sin_motorista_de_turno', who: 'motorista', shift: 'un turno de motorista que cubra' };
  // BL-05: sin un paramédico con cuenta activa nadie de la tripulación puede registrar los hitos ni finalizar el servicio.
  if (!paramedicWithAccount) return { code: 'sin_paramedico_de_turno', who: 'paramédico con cuenta en la app', shift: 'un turno de un paramédico con cuenta activa que cubra' };
  return null;
}
/** Texto del error 409 cuando falta tripulación al salir de mantenimiento o al despachar. */
export const missingCrewDetail = (who: string, when: string) => `No hay ${who} con turno en curso; ${when}`;
export function dispatchBlock(state: UnitState, paramedicOnDuty: boolean, driverOnDuty: boolean, paramedicWithAccount = paramedicOnDuty): DispatchBlock | null {
  if (state === 'en_servicio') return { code: 'en_servicio', message: 'La unidad tiene un servicio activo.', action: 'Espera a que la tripulación finalice el servicio o pide a Jefatura su cierre administrativo; después podrás despachar.' };
  const missing = missingCrew(paramedicOnDuty, driverOnDuty, paramedicWithAccount);
  if (state === 'en_mantenimiento') {
    return missing
      ? { code: 'en_mantenimiento', message: `La unidad está en mantenimiento y no hay ${missing.who} con turno en curso.`, action: `Publica ${missing.shift} la hora actual y luego saca la unidad de mantenimiento (RN-30).` }
      : { code: 'en_mantenimiento', message: 'La unidad está en mantenimiento.', action: 'Saca la unidad de mantenimiento con un motivo para poder despachar.' };
  }
  if (!missing) return null;
  const why = missing.code === 'sin_paramedico_de_turno' ? 'la unidad no puede despacharse sin él' : missing.code === 'sin_motorista_de_turno' ? 'la unidad no puede despacharse sin quien la conduzca' : 'la unidad necesita ambos para despacharse';
  return { code: missing.code, message: `No hay ${missing.who} con turno en curso.`, action: `Publica ${missing.shift} la hora actual; ${why} (RN-30).` };
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
    // MA-AMB-03: durante el traslado el servicio puede terminar sin llegar (fallecimiento, desvío, cancelación).
    trasladando: ['en_hospital', 'finalizado'],
    en_hospital: ['finalizado'],
  };
  return following[last] ?? [];
}

/**
 * Estados finales que admite el servicio según sus hitos (RN-32, MA-AMB-03): `completado` solo después de llegar al
 * hospital; antes de salir con el paciente, sin traslado, rechazo, fallecimiento o cancelación; durante el traslado,
 * fallecimiento, desvío a otro centro o cancelación. La base repite la regla (`ambulancia.validar_cierre_servicio`).
 */
export function allowedFinalStates(done: readonly string[]): FinalState[] {
  if (done.includes('finalizado') || !done.includes('salida')) return [];
  if (done.includes('en_hospital')) return ['completado'];
  if (done.includes('trasladando')) return ['fallecido', 'desviado', 'cancelado'];
  return ['sin_traslado', 'rechaza_traslado', 'fallecido', 'cancelado'];
}
const finalStateNames: Record<string, string> = { completado: 'completado', cancelado: 'cancelado', sin_traslado: 'sin traslado', rechaza_traslado: 'rechazo del traslado', fallecido: 'fallecimiento', desviado: 'desvío a otro centro' };

/** Valida el estado final y su motivo al finalizar; `completado` se asume al llegar al hospital. Devuelve el error o null. */
export function finalStateError(done: readonly string[], finalState: string | undefined, reason: string | undefined): string | null {
  const allowed = allowedFinalStates(done);
  const arrived = done.includes('en_hospital');
  const state = finalState ?? (arrived ? 'completado' : undefined);
  const options = allowed.map(code => finalStateNames[code]).join(', ');
  if (!state) return `Indica cómo terminó el servicio: ${options}.`;
  if (state === 'completado' && !arrived) return 'Solo se completa un servicio que llegó al hospital; indica otro estado final con su motivo.';
  if (state !== 'completado' && arrived) return 'El servicio ya llegó al hospital; finalízalo como completado.';
  if (!allowed.includes(state as FinalState)) return `Con los hitos registrados el servicio solo puede terminar como: ${options}.`;
  if (state !== 'completado' && (reason ?? '').trim().length < 5) return 'Indica el motivo de terminar sin llegar al hospital (al menos 5 caracteres).';
  return null;
}

/** Minutos enteros entre el despacho y la llegada a la escena (tiempo de respuesta, D-056). */
export const responseMinutes = (dispatchedAt: Date, onScene: Date | null) =>
  onScene ? Math.max(0, Math.round((onScene.getTime() - dispatchedAt.getTime()) / 60000)) : null;

/** El reporte prehospital se puede enviar durante el servicio y hasta 24 h después de finalizar (privacidad "(servicio)"). */
export const PREHOSPITAL_GRACE_MS = 24 * 3600_000;
/**
 * Área que recibe a los pacientes de la ambulancia (código de `infra.espacio`, la "Emergencia" de la planta 1). Ver el contenido
 * clínico del prehospital y marcar recibido exige un turno en curso en ella (o en un espacio dentro de ella) o relación de atención.
 */
export const RECEIVING_AREA = 'P1-EMG';
/**
 * MA-AMB-02 (respaldo de una versión): la tripulación que la app propone por defecto, sobre candidatos ya ordenados como
 * `availableCrew`: el primer paramédico con cuenta y el primer motorista.
 */
export function defaultCrew<T extends { tipo: string; hasAccount: boolean }>(candidates: T[]): T[] {
  const paramedic = candidates.find(p => p.tipo === 'paramedico' && p.hasAccount), driver = candidates.find(p => p.tipo === 'motorista');
  return [paramedic, driver].filter((p): p is T => !!p);
}
/** Orden de `availableCrew`: por función, primero quien tiene cuenta y luego por nombre. */
export const crewOrder = (a: { tipo: string; hasAccount: boolean; name: string }, b: { tipo: string; hasAccount: boolean; name: string }) =>
  a.tipo.localeCompare(b.tipo) || Number(b.hasAccount) - Number(a.hasAccount) || a.name.localeCompare(b.name);
/**
 * Hora de un hito (MA-AMB-06): no antes del último hito registrado (o del despacho) ni con más de 24 h; null si es válida.
 * Un hito encolado sin señal llega tarde, pero en orden y el mismo día.
 */
export function milestoneTimeError(occurredAt: Date, lastRecorded: Date, now: Date): string | null {
  if (occurredAt.getTime() < now.getTime() - PREHOSPITAL_GRACE_MS) return 'La hora del hito tiene más de 24 horas; ya no se registra.';
  if (occurredAt.getTime() < lastRecorded.getTime()) return 'La hora del hito es anterior al último hito registrado del servicio.';
  return null;
}
export const canReportAfter = (finishedAt: Date | null, now: Date) => !finishedAt || now.getTime() - finishedAt.getTime() <= PREHOSPITAL_GRACE_MS;

/**
 * Turno en curso (RN-30): personas paramédicas y motoristas activas con turno publicado o en curso que contiene el instante dado.
 * No usa `personal.v_turno_en_curso` porque esa vista lee `now()` de la base y aquí el reloj es sustituible.
 */
export const CREW_ROLES_ON_DUTY_SQL = "SELECT bool_or(p.tipo='paramedico') AS paramedic, bool_or(p.tipo='motorista') AS driver, bool_or(p.tipo='paramedico' AND EXISTS(SELECT 1 FROM acceso.usuario u WHERE u.persona_personal_id=p.id AND u.estado='activo')) AS \"paramedicWithAccount\" FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE p.tipo IN ('paramedico','motorista') AND p.activo AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz";
/**
 * Candidatos a tripulación (MA-AMB-02): paramédicos y motoristas activos con turno en curso (no ausente); `hasAccount` si
 * puede operar en la app. El despachador elige de esta lista; estar de turno no da por sí solo relación de atención.
 */
export const CREW_ON_DUTY_SQL = "SELECT DISTINCT p.id,p.tipo,p.nombres||' '||p.apellidos AS name,EXISTS(SELECT 1 FROM acceso.usuario u WHERE u.persona_personal_id=p.id AND u.estado='activo') AS \"hasAccount\" FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE p.tipo IN ('paramedico','motorista') AND p.activo AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz";

/** R7 G-4: how long the crew can undo its last milestone. */
export const UNDO_MILESTONE_MS = 15 * 60_000;

/**
 * R7 G-4: why the crew cannot undo its last milestone, or null when it can. `finalizado` frees the unit and an arrival
 * already received belongs to the hospital, so neither is undone here (Jefatura closes administratively instead).
 */
export function undoMilestoneError(last: { tipo: string; registrado_en: Date } | undefined, received: boolean, now: Date): string | null {
  if (!last) return 'El servicio no tiene hitos para deshacer.';
  if (last.tipo === 'finalizado') return 'El servicio ya finalizó; Jefatura puede revisarlo con un cierre administrativo.';
  if (last.tipo === 'en_hospital' && received) return 'El hospital ya registró la entrega del paciente; la llegada no se puede deshacer.';
  if (now.getTime() - new Date(last.registrado_en).getTime() > UNDO_MILESTONE_MS) return 'Pasaron más de 15 minutos desde que se registró; ya no se puede deshacer.';
  return null;
}
