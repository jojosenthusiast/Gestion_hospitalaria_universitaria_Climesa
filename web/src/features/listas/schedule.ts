/** Presentación de la agenda de citas (ronda 2, obs. 12). Todo en hora de El Salvador (UTC-6, sin horario de verano). */
const ZONE = 'America/El_Salvador';
const hm = new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });
const ymd = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ZONE });

export const timeOf = (iso: string) => hm.format(new Date(iso));
/** «08:00 – 08:20»: una sola celda con el rango, nunca entrada y salida en filas distintas. */
export const timeRange = (start: string, end: string) => `${timeOf(start)} – ${timeOf(end)}`;
export const minutesBetween = (start: string, end: string) => Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
export const dayKey = (iso: string) => ymd.format(new Date(iso));
export const dayLabel = (key: string) => new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));

const shift = (key: string, days: number) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const addDays = shift;
/** Lunes a domingo de la semana que contiene `key`. */
export function weekOf(key: string): { from: string; to: string } {
  const weekday = new Date(`${key}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const from = shift(key, -((weekday + 6) % 7));
  return { from, to: shift(from, 6) };
}

export type AgendaItem = { id: string; doctorId: string; doctorName: string; start: string; end: string };
export type AgendaDay<T extends AgendaItem> = { day: string; doctors: { doctorId: string; doctorName: string; items: T[] }[] };

/** Día, luego médico, luego hora: la agenda de cada médico se lee de arriba abajo. */
export function groupAgenda<T extends AgendaItem>(items: T[]): AgendaDay<T>[] {
  const days = new Map<string, Map<string, { doctorId: string; doctorName: string; items: T[] }>>();
  for (const item of [...items].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))) {
    const key = dayKey(item.start), doctors = days.get(key) ?? new Map();
    const group = doctors.get(item.doctorId) ?? { doctorId: item.doctorId, doctorName: item.doctorName, items: [] };
    group.items.push(item); doctors.set(item.doctorId, group); days.set(key, doctors);
  }
  return [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, doctors]) => ({ day, doctors: [...doctors.values()].sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'es')) }));
}

export const APPOINTMENT_STATE_TONE: Record<string, string> = { solicitada: 'warning', confirmada: 'info', atendida: 'success', cancelada: 'muted', rechazada: 'danger', no_asistio: 'danger' };
