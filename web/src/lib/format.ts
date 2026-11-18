/**
 * R4a (S5, §4.8): one es-SV formatter for every screen. Hospital time is El Salvador (UTC-6, no DST).
 * Numbers use a decimal comma ("35,7 %"), dates read "16 nov" (the year only when it is not this one), relative times are capped
 * ("hace 2 d", never "hace 4123 min") and counts carry a correct plural ("1 cita", "3 citas").
 */
export const ZONE = 'America/El_Salvador';
const NBSP = ' ';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
type Local = { year: number; month: number; day: number; hour: number; minute: number };
/** Calendar fields of an instant in hospital time. A bare `yyyy-MM-dd` is a calendar day, never shifted. */
function local(value: string | Date): Local {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day, hour: 0, minute: 0 };
  }
  const read = Object.fromEntries(parts.formatToParts(typeof value === 'string' ? new Date(value) : value).map(p => [p.type, p.value]));
  return { year: Number(read.year), month: Number(read.month), day: Number(read.day), hour: Number(read.hour) % 24, minute: Number(read.minute) };
}
const pad = (n: number) => String(n).padStart(2, '0');
const weekday = (l: Local) => WEEKDAYS[new Date(Date.UTC(l.year, l.month - 1, l.day, 12)).getUTCDay()];

/** "35,7" — decimal comma, thousands with a point only from 10 000 (Spanish style). */
export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}
/** "35,7 %" with a non-breaking space so the sign never wraps alone. */
export const formatPercent = (value: number, decimals = 0) => `${formatNumber(value, decimals)}${NBSP}%`;
/** "1 cita" / "3 citas". */
export const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;
/**
 * R4: "16 nov" — user-facing dates never carry the year unless it is not the current one ("3 mar 2025").
 * `withYear: true` always prints it: audit trails, access history, birth dates, legal ranges and exports.
 * `withYear: false` never prints it.
 */
export type YearMode = boolean | 'auto';
const showYear = (l: Local, mode: YearMode, now: string | Date) => mode === 'auto' ? l.year !== local(now).year : mode;
export function formatDate(value: string | Date | null | undefined, { withYear = 'auto', now = new Date() }: { withYear?: YearMode; now?: string | Date } = {}) {
  if (!value) return 'Sin registrar';
  const l = local(value);
  return `${l.day} ${MONTHS[l.month - 1]}${showYear(l, withYear, now) ? ` ${l.year}` : ''}`;
}
/** "09:33" (24 h). */
export const formatTime = (value: string | Date) => { const l = local(value); return `${pad(l.hour)}:${pad(l.minute)}`; };
/** "16 nov, 09:33" (year only outside the current year, or with `withYear: true`); today it is only "09:33" when `short` is set. */
export function formatDateTime(value: string | Date, { short = false, withYear = 'auto', now = new Date() }: { short?: boolean; withYear?: YearMode; now?: string | Date } = {}) {
  if (short && localDayKey(value) === localDayKey(now)) return formatTime(value);
  return `${formatDate(value, { withYear, now })}, ${formatTime(value)}`;
}
/** "sábado 14 de noviembre" (lower case; headings capitalise the first letter with CSS). */
export function formatDayHeading(value: string | Date) {
  const l = local(value);
  return `${weekday(l)} ${l.day} de ${MONTHS_LONG[l.month - 1]}`;
}
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
/**
 * R4: a day the way people say it, never with the year: "Hoy · mié 18 nov", "Mañana · jue 19 nov", "Ayer · mar 17 nov",
 * else "Jue 26 nov". A bare `yyyy-MM-dd` is a calendar day.
 */
export function formatShortDay(value: string | Date, now: string | Date = new Date()) {
  const l = local(value), today = local(now);
  const days = Math.round((Date.UTC(l.year, l.month - 1, l.day) - Date.UTC(today.year, today.month - 1, today.day)) / 86_400_000);
  const text = `${WEEKDAYS_SHORT[new Date(Date.UTC(l.year, l.month - 1, l.day, 12)).getUTCDay()]} ${l.day} ${MONTHS[l.month - 1]}`;
  if (days === 0) return `Hoy · ${text}`;
  if (days === 1) return `Mañana · ${text}`;
  if (days === -1) return `Ayer · ${text}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
/** R4: "Hoy 09:00", "Mañana 09:00", "Ayer 09:00", else "Jue 26 nov, 09:00"; never the year. */
export function formatShortDateTime(value: string | Date, now: string | Date = new Date()) {
  const day = formatShortDay(value, now), time = formatTime(value);
  const near = day.split(' · ');
  return near.length === 2 ? `${near[0]} ${time}` : `${day}, ${time}`;
}
/**
 * Joins the parts that have text with « · », so an empty or missing part never leaves an orphan separator at the start,
 * the end or twice in the middle ("· nota", "nota ·", "a ·  · b").
 */
export const joinParts = (...parts: (string | number | null | undefined | false)[]) =>
  parts.filter(part => part !== null && part !== undefined && part !== false && String(part).trim() !== '').map(String).join(' · ');
/** `yyyy-MM-dd` of the instant in hospital time. */
export const localDayKey = (value: string | Date) => { const l = local(value); return `${l.year}-${pad(l.month)}-${pad(l.day)}`; };

/** "45 min", "2 h 05 min", "2 d 21 h": the two largest units, never thousands of minutes. */
export function formatDuration(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  if (total < 1440) { const h = Math.floor(total / 60), m = total % 60; return m ? `${h} h ${pad(m)} min` : `${h} h`; }
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}
/** "hace 5 min", "hace 3 h", "hace 2 d"; past 30 days it gives the date. Capped at one unit so it scans. */
export function formatRelative(value: string | Date, now: number = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  if (minutes < 30 * 1440) return `hace ${Math.floor(minutes / 1440)} d`;
  return formatDate(value);
}
/** Minutes from `from` to `to` (or now), never negative. */
export const minutesSince = (from: string | Date, to: number = Date.now()) => Math.max(0, Math.floor((to - new Date(from).getTime()) / 60_000));
