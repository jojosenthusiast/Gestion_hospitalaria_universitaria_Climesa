import { ActionSet, BlockedAction } from './attention.rules';

/**
 * Fase 2, flow A (S8): actions the reader may take on a category appointment request right now. The API returns them
 * as `allowedActions` so web, Android and iOS only offer what the server accepts; the commands re-check them.
 */
export const CATEGORY_REQUEST_ACTIONS = ['asignar', 'rechazar', 'cancelar'] as const;
export type CategoryRequestAction = typeof CATEGORY_REQUEST_ACTIONS[number];

export type CategoryRequestAbilities = {
  /** `citas.agendar`: reception assigns a doctor and time, or rejects. */
  manage: boolean;
  /** The reader is the request's patient (cancels their own pending request). */
  ownPatient: boolean;
};

export function categoryRequestActions(state: string, abilities: CategoryRequestAbilities): ActionSet<CategoryRequestAction> {
  const allowed: CategoryRequestAction[] = [];
  const blocked: BlockedAction<CategoryRequestAction>[] = [];
  if (state !== 'pendiente') return { allowedActions: allowed, blockedActions: blocked };
  if (abilities.manage) allowed.push('asignar', 'rechazar');
  if (abilities.ownPatient) allowed.push('cancelar');
  return { allowedActions: allowed, blockedActions: blocked };
}

// ---------------------------------------------------------------------------------------------------------------
// R7 U1, gap A-1: first free day for a request's preferred time of day.

export type Franja = 'manana' | 'tarde' | 'cualquiera';
/** Local hours (El Salvador, UTC-6, no daylight saving) of each preferred time of day: morning 07-12, afternoon 12-17. */
export const FRANJA_HOURS: Record<Franja, [number, number]> = { manana: [7, 12], tarde: [12, 17], cualquiera: [0, 24] };
export const SUGGESTION_DAYS = 14;
const SLOT = 20 * 60_000;

export const inFranja = (at: number, franja: Franja) => {
  const hour = (new Date(at).getUTCHours() + 18) % 24;
  const [from, to] = FRANJA_HOURS[franja] ?? FRANJA_HOURS.cualquiera;
  return hour >= from && hour < to;
};

export type Interval = { start: number; end: number };
/**
 * Free 20-minute slots of one doctor: counted from the start of each shift (API-07), not before `notBefore`, not
 * overlapping an appointment. Same arithmetic as `GET /citas/disponibilidad`, so the suggestion is a slot it lists.
 */
export function freeSlots(shifts: Interval[], occupied: Interval[], notBefore: number): Interval[] {
  const out: Interval[] = [];
  const seen = new Set<number>();
  for (const shift of shifts) {
    const first = shift.start + Math.ceil(Math.max(0, notBefore - shift.start) / SLOT) * SLOT;
    for (let cursor = first; cursor + SLOT <= shift.end; cursor += SLOT) {
      const end = cursor + SLOT;
      if (seen.has(cursor) || occupied.some(o => cursor < o.end && end > o.start)) continue;
      seen.add(cursor);
      out.push({ start: cursor, end });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The suggestion for a request: the first local day (from `today`, up to SUGGESTION_DAYS) on which some candidate has
 * a free slot in the preferred time of day; on that day, the first candidate in order (preferred doctor, then the
 * suggested specialties) and that doctor's first slot. `dayOf` turns an instant into its local day.
 */
export function firstSuggestion<D extends { id: string }>(candidates: D[], slotsOf: (doctorId: string) => Interval[], franja: Franja, dayOf: (at: number) => string): { doctor: D; slot: Interval; date: string } | null {
  let best: { doctor: D; slot: Interval; date: string; rank: number } | null = null;
  candidates.forEach((doctor, rank) => {
    const slot = slotsOf(doctor.id).find(s => inFranja(s.start, franja));
    if (!slot) return;
    const date = dayOf(slot.start);
    if (!best || date < best.date || (date === best.date && rank < best.rank)) best = { doctor, slot, date, rank };
  });
  if (!best) return null;
  const { doctor, slot, date } = best as { doctor: D; slot: Interval; date: string };
  return { doctor, slot, date };
}
