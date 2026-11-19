/**
 * Lote 5 S10: nurses work every floor («si hay una emergencia ... se necesitaria a disposicion todos los pisos»). Their floor
 * is a default filter of the ward, with «Todos los pisos» one click away, never a limit. `/admisiones` has no floor, so each
 * patient's floor comes from the bed board (`/camas`, `code` and `level`). Same rules as Android `NurseFloors`.
 */
export const ALL_FLOORS = 'todos';
export const NO_FLOOR = 'sin';
export type FloorCount = { level: number | null; patients: number };

/** Bed code to floor; beds without `level` are left out. */
export function bedFloors(beds: readonly { code: string; level?: number | null }[] | null | undefined) {
  const map = new Map<string, number>();
  for (const b of beds ?? []) if (b.code && typeof b.level === 'number') map.set(b.code, b.level);
  return map;
}

/** Floors of the ward rows with a bed, lower floors first and the unknown floor last. */
export function floorsOf(rows: readonly { bed?: string | null }[], floors: Map<string, number>): FloorCount[] {
  const counts = new Map<number | null, number>();
  for (const r of rows) if (r.bed) { const level = floors.get(r.bed) ?? null; counts.set(level, (counts.get(level) ?? 0) + 1); }
  return [...counts].map(([level, patients]) => ({ level, patients })).sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity));
}

export const floorLabel = (level: number | null) => (level === null ? 'Sin piso' : `Piso ${level}`);
export const floorKey = (level: number | null) => (level === null ? NO_FLOOR : String(level));

/** The nurse's default floor: the number in the area of the shift in progress («Planta 2», «Piso 3 · Medicina»), when the ward has it. */
export function defaultFloor(shiftArea: string | null | undefined, available: readonly (number | null)[]) {
  const match = shiftArea?.match(/\b(planta|piso)\s*(\d+)/i);
  const level = match ? Number(match[2]) : null;
  return level !== null && available.includes(level) ? String(level) : ALL_FLOORS;
}

/** Rows of the chosen floor; «Todos los pisos» returns every row. Rows without a bed (waiting for one) show on every floor. */
export function onFloor<T extends { bed?: string | null }>(rows: readonly T[], floors: Map<string, number>, floor: string): T[] {
  if (floor === ALL_FLOORS) return [...rows];
  return rows.filter(r => !r.bed || floorKey(floors.get(r.bed) ?? null) === floor);
}
