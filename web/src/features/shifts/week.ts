import { HOUR, localDay, localMs } from './rules';

/** Reglas puras de la vista semanal de turnos: días de la semana (lunes a domingo, RN-14), encabezados y bloques por hora. */
const DAY = 24 * HOUR;
const noon = (date: string) => localMs(date, '12:00');

export type WeekDay = { date: string; start: number; end: number };

/** Lunes (`yyyy-MM-dd`, hora de El Salvador) de la semana que contiene el instante. */
export function mondayOf(ms: number): string {
  const day = localDay(ms);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return localDay(noon(day) - ((weekday + 6) % 7) * DAY);
}

/** El lunes `n` semanas antes (negativo) o después. */
export const addWeeks = (monday: string, n: number) => localDay(noon(monday) + n * 7 * DAY);

/** Los 7 días de la semana que empieza en `monday`, cada uno de 00:00 a 24:00 locales. */
export function weekDays(monday: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = localDay(noon(monday) + i * DAY);
    const start = localMs(date, '00:00');
    return { date, start, end: start + DAY };
  });
}

const longDay = new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/El_Salvador' });
const weekdayName = new Intl.DateTimeFormat('es-SV', { weekday: 'long', timeZone: 'America/El_Salvador' });
const dayMonth = new Intl.DateTimeFormat('es-SV', { day: 'numeric', month: 'long', timeZone: 'America/El_Salvador' });

/** Encabezado de un día: `Hoy`, `Mañana` o `Ayer` cuando aplica, y siempre el día de la semana con la fecha. */
export function dayHeading(date: string, today: string): { relative: string | null; label: string; weekday: string; dayNumber: number } {
  const diff = Math.round((noon(date) - noon(today)) / DAY);
  const relative = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : null;
  return { relative, label: longDay.format(new Date(noon(date))), weekday: weekdayName.format(new Date(noon(date))), dayNumber: Number(date.slice(8, 10)) };
}


/** R4: `16 al 22 de noviembre` (o `30 de noviembre al 6 de diciembre`); the year only when the week ends in another year or `withYear` (exports). */
export function weekLabel(monday: string, { withYear = false, today = localDay(Date.now()) }: { withYear?: boolean; today?: string } = {}): string {
  const sunday = addWeeks(monday, 1);
  const last = new Date(noon(sunday) - DAY);
  const first = new Date(noon(monday));
  const sameMonth = monday.slice(0, 7) === localDay(last.valueOf()).slice(0, 7);
  const lastDay = localDay(last.valueOf());
  const year = !withYear && lastDay.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${lastDay.slice(0, 4)}`;
  return `${sameMonth ? first.getUTCDate() : dayMonth.format(first)} al ${dayMonth.format(last)}${year}`;
}

/** Estados que se dibujan, en el orden de la leyenda. */
export const SHIFT_STATES = [
  ['borrador', 'Borrador'], ['publicado', 'Publicado'], ['en_curso', 'En curso'],
  ['completado', 'Completado'], ['ausente', 'Ausente'], ['cancelado', 'Cancelado'],
] as const;
export type ShiftState = (typeof SHIFT_STATES)[number][0];
export const stateName = (state: string) => SHIFT_STATES.find(s => s[0] === state)?.[1] ?? state.replace(/_/g, ' ');

/**
 * Estado que se muestra: el de la API, salvo un publicado cuyo horario ya empezó o terminó, que se ve como en curso o
 * completado aunque el evento del barrido aún no haya llegado (el reloj de la pantalla no consulta la red).
 */
export function displayState(shift: { state: string; start: string; end: string }, now: number): string {
  if (shift.state !== 'publicado') return shift.state;
  const start = Date.parse(shift.start), end = Date.parse(shift.end);
  return now < start ? 'publicado' : now < end ? 'en_curso' : 'completado';
}

export type Segment<T> = {
  item: T;
  from: number; to: number;
  /** Inicio y largo dentro del día, en fracciones de 24 h (0 a 1). */
  offset: number; length: number;
  /** El turno viene del día anterior o sigue al siguiente (guardias de 24 h, noches). */
  startsBefore: boolean; endsAfter: boolean;
  /** Carril dentro de su grupo de bloques que se traslapan, y cuántos carriles tiene ese grupo. */
  lane: number; lanes: number;
};

/**
 * Partes de cada intervalo que caen en el día, ordenadas por hora de inicio, con carriles para los que se traslapan.
 * Una guardia de 24 h que empieza a las 07:00 da dos partes: de 07:00 a 24:00 y, al día siguiente, de 00:00 a 07:00.
 */
export function daySegments<T>(items: T[], range: (item: T) => [number, number], day: WeekDay): Segment<T>[] {
  const parts: Segment<T>[] = items
    .map(item => ({ item, span: range(item) }))
    .filter(({ span: [a, b] }) => Number.isFinite(a) && Number.isFinite(b) && a < day.end && b > day.start)
    .map(({ item, span: [a, b] }) => {
      const from = Math.max(a, day.start), to = Math.min(b, day.end);
      return { item, from, to, offset: (from - day.start) / DAY, length: (to - from) / DAY, startsBefore: a < day.start, endsAfter: b > day.end, lane: 0, lanes: 1 };
    })
    .sort((x, y) => x.from - y.from || y.to - x.to);
  let group: Segment<T>[] = [], laneEnds: number[] = [], groupEnd = -Infinity;
  const close = () => { for (const s of group) s.lanes = laneEnds.length; group = []; laneEnds = []; groupEnd = -Infinity; };
  for (const part of parts) {
    if (part.from >= groupEnd) close();
    let lane = laneEnds.findIndex(end => end <= part.from);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(part.to); } else laneEnds[lane] = part.to;
    part.lane = lane;
    group.push(part);
    groupEnd = Math.max(groupEnd, part.to);
  }
  close();
  return parts;
}

/** Tramos del día cubiertos por al menos un intervalo (para dibujar los huecos de cobertura como una sola banda). */
export function unionSegments<T>(items: T[], range: (item: T) => [number, number], day: WeekDay): { offset: number; length: number; items: T[] }[] {
  const out: { from: number; to: number; items: T[] }[] = [];
  for (const part of daySegments(items, range, day)) {
    const last = out.at(-1);
    if (last && part.from <= last.to) { last.to = Math.max(last.to, part.to); last.items.push(part.item); }
    else out.push({ from: part.from, to: part.to, items: [part.item] });
  }
  return out.map(u => ({ offset: (u.from - day.start) / DAY, length: (u.to - u.from) / DAY, items: u.items }));
}
