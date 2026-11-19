import type { AreaGap } from './AreaCoverageAlert';
import { HOUR, localTime, type CatalogArea, type ShiftRow } from './rules';
import type { WeekDay } from './week';

/**
 * Pure rules for reading a busy day (30+ shifts): shift bands, per-hour staffing and the area tree of the filter.
 * Nothing here talks to the API; the screen feeds it the shifts and coverage gaps it already has.
 */

export type Band = 'manana' | 'tarde' | 'noche' | 'guardia';
export const BANDS: { id: Band; name: string; hours: string }[] = [
  { id: 'manana', name: 'Mañana', hours: 'empiezan de 05:00 a 10:59' },
  { id: 'tarde', name: 'Tarde', hours: 'empiezan de 11:00 a 16:59' },
  { id: 'noche', name: 'Noche', hours: 'empiezan de 17:00 a 04:59' },
  { id: 'guardia', name: 'Guardia', hours: '20 h o más' },
];
/** A shift of 20 h or more is a guard whatever its declared kind; the rest go by their local start hour. */
const GUARD_HOURS = 20;

export function bandOf(shift: { start: string; end: string; type?: string }): Band {
  const start = Date.parse(shift.start), hours = (Date.parse(shift.end) - start) / HOUR;
  if (shift.type === 'guardia' || hours >= GUARD_HOURS) return 'guardia';
  const hour = Number(localTime(start).slice(0, 2));
  return hour >= 5 && hour < 11 ? 'manana' : hour >= 11 && hour < 17 ? 'tarde' : 'noche';
}

/** Shifts that do not work: they never count as people on shift (same rule as the API coverage, ASIS-01). */
const RESTING = new Set(['cancelado', 'ausente']);
export const isWorking = (t: { state: string }) => !RESTING.has(t.state);

export type RoleCount = { role: string; count: number };
export type BandSummary = { band: Band; count: number; roles: RoleCount[] };
export type DaySummary = {
  /** Shifts that start this day. */
  total: number;
  /** Shifts that started the day before and are still running at 00:00 (nights, 24 h guards). */
  carried: number; carriedRoles: RoleCount[];
  bands: BandSummary[];
  drafts: number;
};

const countRoles = (rows: ShiftRow[], typeOf: (t: ShiftRow) => string | undefined): RoleCount[] => {
  const by = new Map<string, number>();
  for (const t of rows) { const role = typeOf(t) ?? 'otro'; by.set(role, (by.get(role) ?? 0) + 1); }
  return [...by].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
};

/** One day of the week view: how many shifts start in each band, by role, and how many come from the day before. */
export function summarizeDay(shifts: ShiftRow[], day: WeekDay, typeOf: (t: ShiftRow) => string | undefined): DaySummary {
  const starting = shifts.filter(t => Date.parse(t.start) >= day.start && Date.parse(t.start) < day.end);
  const carried = shifts.filter(t => Date.parse(t.start) < day.start && Date.parse(t.end) > day.start);
  return {
    total: starting.length,
    carried: carried.length, carriedRoles: countRoles(carried, typeOf),
    bands: BANDS.map(b => { const rows = starting.filter(t => bandOf(t) === b.id); return { band: b.id, count: rows.length, roles: countRoles(rows, typeOf) }; }).filter(b => b.count > 0),
    drafts: starting.filter(t => t.state === 'borrador').length,
  };
}

export type HourLoad = {
  hour: number; from: number; to: number;
  /** Fewest and most people on shift at any moment of the hour (a shift that ends at 06:30 counts until then). */
  min: number; max: number;
  /** Coverage holes (RN-15) that touch the hour, with how many people are missing in total. */
  gaps: AreaGap[]; missing: number;
};

/** The 24 hours of a day with the staffing range of each hour and its coverage holes. */
export function hourlyLoad(shifts: { start: string; end: string; state: string }[], gaps: AreaGap[], day: WeekDay): HourLoad[] {
  const spans = shifts.filter(isWorking).map(t => [Date.parse(t.start), Date.parse(t.end)] as const).filter(([a, b]) => a < day.end && b > day.start);
  return Array.from({ length: 24 }, (_, hour) => {
    const from = day.start + hour * HOUR, to = from + HOUR;
    // Every start or end inside the hour splits it; each piece has a constant head count.
    const cuts = [...new Set([from, to, ...spans.flatMap(([a, b]) => [a, b]).filter(x => x > from && x < to)])].sort((x, y) => x - y);
    let min = Infinity, max = 0;
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1], count = spans.filter(([s, e]) => s < b && e > a).length;
      min = Math.min(min, count); max = Math.max(max, count);
    }
    const touching = gaps.filter(g => Date.parse(g.start) < to && Date.parse(g.end) > from);
    return { hour, from, to, min: Number.isFinite(min) ? min : 0, max, gaps: touching, missing: touching.reduce((n, g) => n + Math.max(0, g.required - g.actual), 0) };
  });
}

export type AreaNode = { area: CatalogArea; children: AreaNode[] };
const TYPE_ORDER: Record<string, number> = { hospital: 0, planta: 1, area: 2, consultorio: 3 };

/** The work areas as the building is organized: hospital › floors › areas and offices (by `parentId`). */
export function areaTree(areas: CatalogArea[]): AreaNode[] {
  const ids = new Set(areas.map(a => a.id));
  const nodes = new Map(areas.map(a => [a.id, { area: a, children: [] as AreaNode[] }]));
  const roots: AreaNode[] = [];
  for (const a of areas) {
    const node = nodes.get(a.id)!;
    if (a.parentId && ids.has(a.parentId) && a.parentId !== a.id) nodes.get(a.parentId)!.children.push(node); else roots.push(node);
  }
  const order = (list: AreaNode[]) => {
    list.sort((x, y) => (TYPE_ORDER[x.area.type] ?? 9) - (TYPE_ORDER[y.area.type] ?? 9) || x.area.name.localeCompare(y.area.name, 'es', { numeric: true }));
    list.forEach(n => order(n.children));
  };
  order(roots);
  // A lone hospital root only adds a level: its floors become the top groups.
  return roots.length === 1 && roots[0].area.type === 'hospital' && roots[0].children.length ? roots[0].children : roots;
}

/** The area and every area under it (a floor selects all its areas and offices). */
export function areaScope(areas: CatalogArea[], id: string): Set<string> {
  const scope = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const a of areas) if (a.parentId && scope.has(a.parentId) && !scope.has(a.id)) { scope.add(a.id); grew = true; } }
  return scope;
}
