import type { Shift } from '../../lib/api';

/** Respuesta de `GET /turnos/catalogo`: todas las opciones reales, no solo las de los turnos cargados. */
export type CatalogRole = { code: string; name: string };
export type CatalogArea = { id: string; parentId: string | null; type: string; code: string; name: string };
export type CatalogStaff = { id: string; name: string; type: string; specialty: string | null; areaId: string | null; area: string | null; registrations: { validFrom: string; validTo: string }[] };
export type ShiftCatalog = { roles: CatalogRole[]; areas: CatalogArea[]; staff: CatalogStaff[] };

/** Acciones que la API permite ahora sobre un turno (`allowedActions`): la pantalla no ofrece otras. */
export type ShiftAction = 'editar' | 'cancelar' | 'marcar_presente' | 'marcar_ausente' | 'deshacer_asistencia';
/** `GET /turnos` con la asistencia (ASIS-01: automática al inicio) y las acciones permitidas para quien consulta. */
export type ShiftRow = Shift & {
  staffType?: string;
  attendance?: 'pendiente' | 'presente' | 'ausente' | 'sin_registro' | null;
  presentSince?: string | null;
  late?: boolean;
  absenceType?: 'justificada' | 'injustificada' | null;
  attendanceReason?: string | null;
  emergencyReason?: string | null;
  allowedActions?: ShiftAction[];
};
export const can = (shift: ShiftRow, action: ShiftAction) => Boolean(shift.allowedActions?.includes(action));
/**
 * `can` con el reloj de la pantalla: un turno que ya empezó no se edita ni se cancela (la API responde turno_iniciado),
 * aunque los datos se hayan cargado antes del inicio.
 */
export const canNow = (shift: ShiftRow, action: ShiftAction, now: number) =>
  (action === 'editar' || action === 'cancelar') && now >= Date.parse(shift.start) ? false : can(shift, action);

/** Texto de la asistencia para la persona que lee (nunca el código). */
export function attendanceLabel(shift: ShiftRow): string | null {
  switch (shift.attendance) {
    case 'presente': return shift.late ? 'Presente · llegó tarde' : 'Presente';
    case 'ausente': return shift.absenceType === 'justificada' ? 'Ausencia justificada' : 'Ausencia injustificada';
    case 'pendiente': return 'Se confirma al iniciar';
    case 'sin_registro': return 'Sin registro de entrada';


    default: return null;
  }
}

export const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Política vigente `turnos.duracion` y `turnos.descanso` (D-054). La API es la que decide; aquí solo se avisa antes de enviar. */
export const DURATION = { min: 4, max: 12, maxLong: 24 } as const;
export const REST = { min: 8, afterLong: 12 } as const;
/** Política vigente `turnos.carga` (CARGA-01): tope de horas en 7 días y de días seguidos. */
export const LOAD = { maxHours7Days: 72, maxDaysInRow: 6 } as const;

export type ShiftKind = 'diurno' | 'nocturno' | 'guardia';
export const KIND_LABEL: Record<string, string> = { diurno: 'Diurno', nocturno: 'Nocturno', guardia: 'Guardia / 24 h' };

/** `2026-11-10` + `07:00` en hora de El Salvador (UTC-6, sin horario de verano) a milisegundos UTC. */
export const localMs = (date: string, time: string) => Date.parse(`${date}T${time}:00-06:00`);
export const localDay = (ms: number) => new Date(ms - 6 * HOUR).toISOString().slice(0, 10);
export const localTime = (ms: number) => new Date(ms - 6 * HOUR).toISOString().slice(11, 16);

/** Fin del horario: si la hora de fin no es posterior a la de inicio, el turno termina al día siguiente. */
export function endOf(date: string, start: string, end: string): number {
  const from = localMs(date, start);
  let to = localMs(date, end);
  if (Number.isFinite(from) && Number.isFinite(to) && to <= from) to += DAY;
  return to;
}

export const hoursBetween = (from: number, to: number) => (to - from) / HOUR;

/** Tipo sugerido según el horario; la persona puede cambiarlo. */
export function suggestKind(startMs: number, endMs: number): ShiftKind {
  const hours = hoursBetween(startMs, endMs);
  if (hours > DURATION.max) return 'guardia';
  const hour = Number(localTime(startMs).slice(0, 2));
  return hour >= 18 || hour < 5 ? 'nocturno' : 'diurno';
}

/** Regla 4–24 h: diurno 4 a 12 h; nocturno y guardia hasta 24 h. Devuelve el texto del problema o `null`. */
export function durationProblem(startMs: number, endMs: number, kind: string): string | null {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const hours = hoursBetween(startMs, endMs);
  const max = kind === 'diurno' ? DURATION.max : DURATION.maxLong;
  if (hours < DURATION.min || hours > max) return `Un turno ${kind === 'diurno' ? 'diurno' : kind === 'nocturno' ? 'nocturno' : 'de guardia'} dura de ${DURATION.min} a ${max} horas; este dura ${Math.round(hours * 10) / 10}.`;
  return null;
}

/**
 * RN-13 (MA-TUR-04): después de cualquier turno, 8 h de descanso; después de una guardia de 24 h, 12 h y hasta el fin
 * del día en que termina. Devuelve el instante desde el que la persona puede volver a trabajar.
 */
export function restUntil(startMs: number, endMs: number): number {
  const long = hoursBetween(startMs, endMs) >= 24;
  const until = endMs + (long ? REST.afterLong : REST.min) * HOUR;
  return long ? Math.max(until, localMs(localDay(endMs), '00:00') + DAY) : until;
}

/** Turnos que trabajan: los cancelados y las ausencias no cuentan para descanso ni carga (ASIS-01). */
const works = (s: Shift) => s.state !== 'cancelado' && s.state !== 'ausente';

/**
 * CARGA-07: carga de una persona alrededor de un horario propuesto: máximo de horas en cualquier ventana de 7 días y
 * días seguidos con turno, contando el turno propuesto. La API y la base aplican el tope; esto solo lo anticipa.
 */
export function loadFor(personId: string, startMs: number, endMs: number, shifts: Shift[], ignoreId?: string): { hours7Days: number; daysInRow: number } {
  const mine: [number, number][] = shifts.filter(s => s.staffId === personId && s.id !== ignoreId && works(s)).map(s => [Date.parse(s.start), Date.parse(s.end)]);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) mine.push([startMs, endMs]);
  const window = 7 * DAY;
  let hours = 0;
  for (const from of mine.flatMap(([a, b]) => [a, b - window])) {
    const total = mine.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, from + window) - Math.max(a, from)), 0) / HOUR;
    hours = Math.max(hours, total);
  }
  const days = new Set(mine.map(([a]) => localDay(a)));
  let daysInRow = 0;
  if (Number.isFinite(startMs)) {
    const day = localDay(startMs), step = (d: string, n: number) => localDay(localMs(d, '12:00') + n * DAY);
    if (days.has(day)) { daysInRow = 1; for (let d = step(day, -1); days.has(d); d = step(d, -1)) daysInRow++; for (let d = step(day, 1); days.has(d); d = step(d, 1)) daysInRow++; }
  }
  return { hours7Days: Math.round(hours * 10) / 10, daysInRow };
}

export type Conflict = { code: 'traslape' | 'descanso' | 'jornada' | 'inscripcion'; text: string };
const stamp = (ms: number) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(new Date(ms));

/** Conflictos de una persona con un horario propuesto, calculados con los turnos cargados. La base de datos sigue siendo la garantía. */
export function conflictsFor(person: CatalogStaff | undefined, startMs: number, endMs: number, _kind: string, shifts: Shift[], ignoreId?: string): Conflict[] {
  if (!person || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const out: Conflict[] = [];
  if (['medico', 'enfermero'].includes(person.type)) {
    const day = localDay(startMs);
    if (!person.registrations.some(r => r.validFrom <= day && day <= r.validTo)) out.push({ code: 'inscripcion', text: 'Sin inscripción profesional vigente en esa fecha' });
  }
  for (const item of shifts) {
    if (item.staffId !== person.id || item.id === ignoreId || item.state === 'cancelado') continue;
    const a = Date.parse(item.start), b = Date.parse(item.end);
    if (a < endMs && b > startMs) { out.push({ code: 'traslape', text: `Se traslapa con otro turno (${stamp(a)} a ${stamp(b)})` }); continue; }
    if (!works(item)) continue;
    if (b <= startMs && startMs < restUntil(a, b)) { out.push({ code: 'descanso', text: `Descanso obligatorio hasta ${stamp(restUntil(a, b))}` }); continue; }
    if (a >= endMs && a < restUntil(startMs, endMs)) { out.push({ code: 'descanso', text: `Debe descansar tras este turno; su siguiente turno es el ${stamp(a)}` }); continue; }
    // Un turno por jornada: la jornada es el día en que empieza (una noche no ocupa el día siguiente).
    if (localDay(a) === localDay(startMs)) out.push({ code: 'jornada', text: 'Ya tiene un turno en esa jornada' });
  }
  return out;
}

const chain = (areas: CatalogArea[], id: string | null | undefined) => {
  const seen = new Set<string>();
  for (let at = id; at && !seen.has(at); at = areas.find(a => a.id === at)?.parentId) seen.add(at);
  return seen;
};

/**
 * Personal elegible para un área: el de esa área, el asignado a un espacio que la contiene (hospital, planta) o que
 * ella contiene, y el que aún no tiene área. `includeOthers` abre el resto (coberturas entre áreas).
 */
export function eligibleFor(staff: CatalogStaff[], areas: CatalogArea[], areaId: string, roleCode: string, includeOthers: boolean): CatalogStaff[] {
  const up = chain(areas, areaId);
  return staff.filter(p => (roleCode === 'todos' || p.type === roleCode)
    && (includeOthers || !areaId || !p.areaId || up.has(p.areaId) || chain(areas, p.areaId).has(areaId)));
}
