/**
 * Reglas puras de turnos: asistencia (ASIS-01), acciones permitidas (la UI solo ofrece lo que el servidor acepta)
 * y carga de trabajo (CARGA-01). La base de datos sigue siendo la garantía (20261120003000_turnos_asistencia_carga.sql).
 */
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

/** Política `turnos.asistencia`. */
export type AttendancePolicy = { margen_minutos: number; entrada_anticipada_minutos: number };
/** Política `turnos.carga`. */
export type LoadPolicy = { max_horas_7_dias: number; max_dias_seguidos: number };

export type ShiftLike = { state: string; start: number; end: number; presentSince: number | null };

/**
 * Asistencia derivada: `null` en turnos que no se trabajan (cancelado, borrador). La entrada se confirma sola a la hora
 * de inicio (el barrido del reloj guarda `presente_desde`); solo una ausencia marcada por JOP la quita. Nunca queda un
 * turno "sin confirmar".
 */
export function attendanceOf(shift: ShiftLike, now: number): 'pendiente' | 'presente' | 'ausente' | null {
  if (shift.state === 'cancelado' || shift.state === 'borrador') return null;
  if (shift.state === 'ausente') return 'ausente';
  return shift.presentSince !== null || now >= shift.start ? 'presente' : 'pendiente';
}

/** Llegó después del margen de la política. */
export const isLate = (shift: ShiftLike, policy: AttendancePolicy) =>
  shift.presentSince !== null && shift.presentSince > shift.start + policy.margen_minutos * 60_000;

export type ShiftAction = 'editar' | 'cancelar' | 'marcar_presente' | 'marcar_ausente' | 'deshacer_asistencia';

/**
 * Acciones que el servidor aceptaría ahora. `canPlan` = turnos.planificar. Nadie confirma la entrada a mano: el reloj
 * la confirma a la hora de inicio.
 * MA-TUR-03: solo se edita o cancela un turno que no ha empezado. JOP marca la ausencia (antes o durante el turno, o
 * después para el historial), corrige la hora real de entrada de un turno ya empezado (`marcar_presente`, también de
 * alguien marcado ausente que sí llegó) y deshace una ausencia equivocada.
 */
export function allowedActions(shift: ShiftLike, now: number, canPlan: boolean): ShiftAction[] {
  if (!canPlan) return [];
  const out: ShiftAction[] = [];
  const started = now >= shift.start;
  if (['publicado', 'borrador'].includes(shift.state) && !started) out.push('editar', 'cancelar');
  if (started && ['en_curso', 'completado', 'ausente'].includes(shift.state)) out.push('marcar_presente');
  if (['publicado', 'en_curso', 'completado'].includes(shift.state)) out.push('marcar_ausente');
  if (shift.state === 'ausente') out.push('deshacer_asistencia');
  return out;
}

/** Estado por reloj de un turno que vuelve de `ausente` (deshacer) o recibe una entrada corregida. */

export const stateByClock = (start: number, end: number, now: number) => now >= end ? 'completado' : now >= start ? 'en_curso' : 'publicado';

/**
 * CARGA-01 al escribir un turno: revisa solo las ventanas de 7 días que tocan `next` (empiezan en el inicio de un turno o
 * terminan en el fin de uno) y rechaza solo si la escritura le suma horas a una ventana sobre el tope. Una ventana que ya
 * estaba sobre el tope (datos anteriores o una emergencia) no bloquea cambios que no le agregan horas. `previous` es el
 * periodo que el turno ocupaba antes (al moverlo); la base aplica la misma regla (20261120003000).
 */
export function windowLoad(existing: [number, number][], next: [number, number], previous: [number, number] | null, cap: number, windowMs = 7 * DAY): { hours: number; exceeds: boolean } {
  const within = (intervals: [number, number][], from: number) =>
    intervals.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, from + windowMs) - Math.max(a, from)), 0) / HOUR;
  const after = [...existing, next], before = previous ? [...existing, previous] : existing;
  const anchors = after.flatMap(([a, b]) => [a, b - windowMs]).filter(w => w > next[0] - windowMs && w < next[1]);
  let hours = 0, exceeds = false;
  for (const from of anchors) {
    const total = Math.round(within(after, from) * 100) / 100;
    hours = Math.max(hours, total);
    if (total > cap && total > Math.round(within(before, from) * 100) / 100) exceeds = true;
  }
  return { hours, exceeds };
}

/** Días locales seguidos con turno que incluyen `day` (fechas `yyyy-MM-dd`). */
export function consecutiveDays(days: Set<string>, day: string): number {
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  if (!days.has(day)) return 0;
  let count = 1;
  for (let d = shift(day, -1); days.has(d); d = shift(d, -1)) count++;
  for (let d = shift(day, 1); days.has(d); d = shift(d, 1)) count++;
  return count;
}
