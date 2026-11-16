/**
 * Fase 2, flujo F (S12): pure rotation patterns for the shift generator. They only decide who works which day and at
 * what hour; every proposed shift then goes through the same validation as a single shift (rest, 7-day cap, overlap,
 * registration) in `PersonnelService`.
 *
 * Each pattern is a cycle of days. People are spread over "teams": a team is an offset inside the cycle (and, for
 * 12x36, the day or night slot), so that every slot of every day has someone as long as the group is large enough.
 */
export const ROTATION_PATTERNS = ['rotativo', '12x36', '24x72', 'personalizado'] as const;
export type RotationPattern = typeof ROTATION_PATTERNS[number];
export type ShiftKind = 'diurno' | 'nocturno' | 'guardia';
export type RotationOptions = { pattern: RotationPattern; startTime: string; hours?: number; workDays?: number; restDays?: number };
/** One proposed shift: person (index in the group), local day, local start time, length in hours and kind. */
export type RotationSlot = { person: number; date: string; startTime: string; hours: number; type: ShiftKind };

const DAY = 86_400_000;
const addMinutes = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Kind suggested by the schedule (same rule as the web form): more than 12 h is a guard; starting 18:00-04:59 is a night. */
export function kindFor(startTime: string, hours: number): ShiftKind {
  if (hours > 12) return 'guardia';
  const hour = Number(startTime.slice(0, 2));
  return hour >= 18 || hour < 5 ? 'nocturno' : 'diurno';
}

/** Local days `yyyy-MM-dd` from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let at = Date.parse(`${from}T12:00:00Z`); at <= Date.parse(`${to}T12:00:00Z`); at += DAY) out.push(new Date(at).toISOString().slice(0, 10));
  return out;
}

/**
 * Proposed shifts for `people` people over `days`.
 * - `rotativo`: three 8 h slots (start, +8 h, +16 h; with 07:00: morning, afternoon, night). Each person works 5 days and
 *   rests 2 in a 7-day cycle; rest days are staggered by person and the slot moves forward (morning, afternoon, night)
 *   every cycle, always after the two rest days, so a night is never followed by a morning without rest.
 * - `12x36`: 12 h of work and 36 h of rest. Four teams: day (start) and night (start + 12 h), on even or odd days.
 * - `24x72`: a 24 h guard and 72 h of rest. Four teams, one per day of the 4-day cycle.
 * - `personalizado`: `hours` from `startTime`, `workDays` on and `restDays` off; teams staggered over the cycle.
 */
export function rotationSlots(people: number, days: string[], options: RotationOptions): RotationSlot[] {
  const out: RotationSlot[] = [];
  const start = options.startTime;
  for (let person = 0; person < people; person++) {
    days.forEach((date, d) => {
      switch (options.pattern) {
        case 'rotativo': {
          const offset = person % 7, cycle = Math.floor((d + offset) / 7), position = (d + offset) % 7;
          if (position >= 5) return;
          const slot = (person + cycle) % 3, time = addMinutes(start, slot * 8 * 60);
          out.push({ person, date, startTime: time, hours: 8, type: kindFor(time, 8) });
          return;
        }
        case '12x36': {
          const team = person % 4, night = team >= 2;
          if ((d + team) % 2 !== 0) return;
          const time = night ? addMinutes(start, 12 * 60) : start;
          out.push({ person, date, startTime: time, hours: 12, type: night ? 'nocturno' : 'diurno' });
          return;
        }
        case '24x72': {
          if ((d + person) % 4 !== 0) return;
          out.push({ person, date, startTime: start, hours: 24, type: 'guardia' });
          return;
        }
        case 'personalizado': {
          const work = options.workDays ?? 5, rest = options.restDays ?? 2, hours = options.hours ?? 8, length = work + rest;
          if ((d + person) % length >= work) return;
          out.push({ person, date, startTime: start, hours, type: kindFor(start, hours) });
          return;
        }
      }
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.person - b.person);
}

/** Start and end instants (ISO, UTC) of a local day and time in El Salvador (UTC-6, no daylight saving). */
export function slotRange(date: string, startTime: string, hours: number): { start: string; end: string } {
  const start = Date.parse(`${date}T${startTime}:00-06:00`);
  return { start: new Date(start).toISOString(), end: new Date(start + hours * 3_600_000).toISOString() };
}
