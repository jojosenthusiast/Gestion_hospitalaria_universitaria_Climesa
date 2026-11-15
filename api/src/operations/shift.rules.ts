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

/** Asistencia derivada: `null` en turnos que no se trabajan (cancelado, borrador). */
export function attendanceOf(shift: ShiftLike, now: number, policy: AttendancePolicy): 'pendiente' | 'presente' | 'sin_confirmar' | 'ausente' | null {
  if (shift.state === 'cancelado' || shift.state === 'borrador') return null;
  if (shift.state === 'ausente') return 'ausente';
  if (shift.presentSince !== null) return 'presente';
  return now >= shift.start + policy.margen_minutos * 60_000 ? 'sin_confirmar' : 'pendiente';
}

/** Llegó después del margen de la política. */
export const isLate = (shift: ShiftLike, policy: AttendancePolicy) =>
  shift.presentSince !== null && shift.presentSince > shift.start + policy.margen_minutos * 60_000;

export type ShiftAction = 'editar' | 'cancelar' | 'marcar_entrada' | 'marcar_presente' | 'marcar_ausente' | 'deshacer_asistencia';

/**
 * Acciones que el servidor aceptaría ahora. `canPlan` = turnos.planificar; `own` = el turno es de la persona de la cuenta.
 * MA-TUR-03: solo se edita o cancela un turno que no ha empezado. La persona marca su entrada desde
 * `entrada_anticipada_minutos` antes del inicio hasta el fin; JOP marca entrada o ausencia (también después, para el historial).
 */
export function allowedActions(shift: ShiftLike, now: number, policy: AttendancePolicy, canPlan: boolean, own: boolean): ShiftAction[] {
  const out: ShiftAction[] = [];
  const early = shift.start - policy.entrada_anticipada_minutos * 60_000;
  const unmarked = shift.presentSince === null;
  if (canPlan && ['publicado', 'borrador'].includes(shift.state) && now < shift.start) out.push('editar', 'cancelar');
  if (own && ['publicado', 'en_curso'].includes(shift.state) && unmarked && now >= early && now < shift.end) out.push('marcar_entrada');
  if (canPlan && ['publicado', 'en_curso', 'completado', 'ausente'].includes(shift.state) && unmarked && now >= early) out.push('marcar_presente');
  if (canPlan && ['publicado', 'en_curso', 'completado'].includes(shift.state) && unmarked) out.push('marcar_ausente');
  if (canPlan && (shift.state === 'ausente' || !unmarked)) out.push('deshacer_asistencia');
  return out;
}

/** Estado por reloj de un turno que vuelve de `ausente` (deshacer) o recibe una entrada tardía. */
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
