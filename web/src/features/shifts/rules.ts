import type { Shift } from '../../lib/api';

/** Respuesta de `GET /turnos/catalogo`: todas las opciones reales, no solo las de los turnos cargados. */
export type CatalogRole = { code: string; name: string };
export type CatalogArea = { id: string; parentId: string | null; type: string; code: string; name: string };
export type CatalogStaff = { id: string; name: string; type: string; specialty: string | null; areaId: string | null; area: string | null; registrations: { validFrom: string; validTo: string }[] };
export type ShiftCatalog = { roles: CatalogRole[]; areas: CatalogArea[]; staff: CatalogStaff[] };

export const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Política vigente `turnos.duracion` y `turnos.descanso` (D-054). La API es la que decide; aquí solo se avisa antes de enviar. */
export const DURATION = { min: 4, max: 12, maxLong: 24 } as const;
export const REST = { min: 8, afterLong: 12 } as const;

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

/** Descanso obligatorio tras un turno de 24 h o nocturno que cruza la medianoche: hasta el fin del día en que termina. */
export function mandatoryRestUntil(startMs: number, endMs: number, kind: string): number | null {
  const hours = hoursBetween(startMs, endMs);
  const sameDay = localDay(startMs) === localDay(endMs - 1);
  const startsAtNight = Number(localTime(startMs).slice(0, 2)) >= 18;
  if (hours < 24 && (sameDay || (!startsAtNight && kind !== 'nocturno'))) return null;
  return localMs(localDay(endMs), '00:00') + DAY;
}

export type Conflict = { code: 'traslape' | 'descanso' | 'jornada' | 'inscripcion'; text: string };
const stamp = (ms: number) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/El_Salvador' }).format(new Date(ms));

/** Conflictos de una persona con un horario propuesto, calculados con los turnos cargados. La base de datos sigue siendo la garantía. */
export function conflictsFor(person: CatalogStaff | undefined, startMs: number, endMs: number, kind: string, shifts: Shift[], ignoreId?: string): Conflict[] {
  if (!person || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];
  const out: Conflict[] = [];
  if (['medico', 'enfermero'].includes(person.type)) {
    const day = localDay(startMs);
    if (!person.registrations.some(r => r.validFrom <= day && day <= r.validTo)) out.push({ code: 'inscripcion', text: 'Sin inscripción profesional vigente en esa fecha' });
  }
  const dayStart = localMs(localDay(startMs), '00:00'), dayEnd = dayStart + DAY;
  for (const item of shifts) {
    if (item.staffId !== person.id || item.id === ignoreId || item.state === 'cancelado') continue;
    const a = Date.parse(item.start), b = Date.parse(item.end);
    if (a < endMs && b > startMs) { out.push({ code: 'traslape', text: `Se traslapa con otro turno (${stamp(a)} a ${stamp(b)})` }); continue; }
    if (b <= startMs) {
      const until = mandatoryRestUntil(a, b, item.type);
      if (until && startMs < until) { out.push({ code: 'descanso', text: `Descanso obligatorio hasta ${stamp(until)}` }); continue; }
      const need = item.type === 'guardia' && hoursBetween(a, b) >= 24 ? REST.afterLong : REST.min;
      if (hoursBetween(b, startMs) < need) { out.push({ code: 'descanso', text: `Necesita ${need} h de descanso tras su turno anterior` }); continue; }
    }
    if (a >= endMs) {
      const until = mandatoryRestUntil(startMs, endMs, kind);
      if (until && a < until) { out.push({ code: 'descanso', text: `Debe descansar tras este turno; su siguiente turno es el ${stamp(a)}` }); continue; }
      const need = ['guardia', 'nocturno'].includes(kind) && hoursBetween(startMs, endMs) >= 24 ? REST.afterLong : REST.min;
      if (hoursBetween(endMs, a) < need) { out.push({ code: 'descanso', text: `Necesita ${need} h de descanso antes de su siguiente turno` }); continue; }
    }
    if (a < dayEnd && b > dayStart) out.push({ code: 'jornada', text: 'Ya tiene un turno en esa jornada' });
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
