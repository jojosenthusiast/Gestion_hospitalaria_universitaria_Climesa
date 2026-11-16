import { HOUR, localDay, localMs, localTime, type ShiftRow } from './rules';
import type { WeekDay } from './week';

/**
 * Fase 2, flujo F (S12): reglas puras de la planificación. El calendario mueve y estira bloques en pasos de 30 min, la
 * lista separa los días pasados, y copiar semana, plantillas y asignación masiva arman lotes que la API valida con las
 * mismas reglas de un turno suelto (`POST /turnos/lote/validar`) antes de crearlos como borradores.
 */
const DAY = 24 * HOUR;
export const SNAP_MINUTES = 30;
const SNAP = SNAP_MINUTES * 60_000;

/** Un turno de un lote (cuerpo de `POST /turnos/lote`). */
export type BatchItem = { staffId: string; areaId: string; start: string; end: string; type: string };
/** Resultado de un turno del lote: el mismo código y mensaje que daría un turno suelto. */
export type BatchResult = { index: number; ok: boolean; codigo?: string; mensaje?: string; advertencias?: { codigo: string; horasSemana: number; limite: number }[] };
export type BatchGap = { areaId: string; area: string; role: string; start: string; end: string; required: number; actual: number };
/** Elemento de la vista previa: el turno, quién es y, si ya se validó, su resultado. */
export type PreviewItem = BatchItem & { key: string; person: string; result?: BatchResult; replaces?: string };
export type WeekTemplate = { id: string; areaId: string; area: string; name: string; version: number; shifts: { day: number; startTime: string; hours: number; type: string; staffId: string }[] };

export const snap = (ms: number) => Math.round(ms / SNAP) * SNAP;

/**
 * Nuevo horario de un bloque arrastrado: `move` desplaza inicio y fin (minutos y días), `stretch` solo el fin. El
 * resultado cae en pasos de 30 min y un estirón nunca deja el turno en menos de 30 min (la API decide el mínimo real).
 */
export function dragResult(shift: { start: string; end: string }, mode: 'move' | 'stretch', minutes: number, days = 0): { start: string; end: string } {
  const start = Date.parse(shift.start), end = Date.parse(shift.end);
  const delta = snap(minutes * 60_000) + days * DAY;
  if (mode === 'stretch') return { start: shift.start, end: new Date(Math.max(start + SNAP, snap(end + delta))).toISOString() };
  return { start: new Date(start + delta).toISOString(), end: new Date(end + delta).toISOString() };
}

/** Instante de una posición vertical dentro de la columna de un día (0 = 00:00, 1 = 24:00), en pasos de 30 min. */
export const atFraction = (day: WeekDay, fraction: number) => snap(day.start + Math.min(1, Math.max(0, fraction)) * DAY);

/** La lista se lee desde hoy: hoy y los días que vienen arriba; los pasados se pliegan abajo, el más reciente primero. */
export function splitDays(days: WeekDay[], today: string): { upcoming: WeekDay[]; past: WeekDay[] } {
  return { upcoming: days.filter(d => d.date >= today), past: days.filter(d => d.date < today).reverse() };
}

let sequence = 0;
const keyOf = () => `p-${++sequence}`;
/** Turnos que se copian o se guardan como plantilla: los que se trabajan o se van a trabajar. */
const copyable = (t: ShiftRow) => !['cancelado', 'ausente'].includes(t.state);
const startsIn = (t: ShiftRow, from: number, to: number) => { const s = Date.parse(t.start); return s >= from && s < to; };

/** Copiar la semana anterior: cada turno que empezó en ella, siete días después, con su persona, área y tipo. */
export function copyWeek(rows: ShiftRow[], previous: WeekDay[], areaId?: string): PreviewItem[] {
  const from = previous[0].start, to = previous[6].end;
  return rows.filter(t => copyable(t) && startsIn(t, from, to) && (!areaId || t.areaId === areaId))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.person.localeCompare(b.person, 'es'))
    .map(t => ({ key: keyOf(), staffId: t.staffId, person: t.person, areaId: t.areaId, type: t.type,
      start: new Date(Date.parse(t.start) + 7 * DAY).toISOString(), end: new Date(Date.parse(t.end) + 7 * DAY).toISOString() }));
}

/** Plantilla de un área con los turnos de la semana visible (día de la semana, hora local, horas, tipo y persona). */
export function templateFromWeek(rows: ShiftRow[], days: WeekDay[], areaId: string): WeekTemplate['shifts'] {
  return rows.filter(t => copyable(t) && t.areaId === areaId && startsIn(t, days[0].start, days[6].end))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map(t => ({ day: days.findIndex(d => d.date === localDay(Date.parse(t.start))), startTime: localTime(Date.parse(t.start)), hours: Math.round((Date.parse(t.end) - Date.parse(t.start)) / HOUR), type: t.type, staffId: t.staffId }));
}

/** Turnos de una plantilla aplicada a la semana visible. */
export function applyTemplate(template: WeekTemplate, days: WeekDay[], personName: (id: string) => string): PreviewItem[] {
  return template.shifts.map(s => {
    const start = localMs(days[s.day].date, s.startTime);
    return { key: keyOf(), staffId: s.staffId, person: personName(s.staffId), areaId: template.areaId, type: s.type, start: new Date(start).toISOString(), end: new Date(start + s.hours * HOUR).toISOString() };
  });
}

/**
 * Asignación masiva: el mismo horario a varias personas en uno o más días. Si la hora de fin no es posterior a la de
 * inicio, el turno termina al día siguiente (una noche o una guardia de 24 h).
 */
export function bulkItems(people: { id: string; name: string }[], dates: string[], areaId: string, startTime: string, endTime: string, type: string): PreviewItem[] {
  return dates.flatMap(date => people.map(p => {
    const start = localMs(date, startTime);
    let end = localMs(date, endTime);
    if (end <= start) end += DAY;
    return { key: keyOf(), staffId: p.id, person: p.name, areaId, type, start: new Date(start).toISOString(), end: new Date(end).toISOString() };
  }));
}

/** Lo que se envía a la API: sin la clave local ni el nombre. */
export const toBatch = (items: PreviewItem[]): BatchItem[] => items.map(({ staffId, areaId, start, end, type }) => ({ staffId, areaId, start, end, type }));
