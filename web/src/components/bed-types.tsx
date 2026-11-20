import './bed-types.css';

/** Room categories of the hospital (infra.espacio.categoria), in the order the owner reads them. */
const KNOWN: { key: string; label: string }[] = [{ key: 'vip', label: 'VIP' }, { key: 'semiprivada', label: 'Semiprivada' }];
const labelOf = (key: string) => KNOWN.find(k => k.key === key)?.label ?? (key ? key[0].toLocaleUpperCase('es') + key.slice(1) : 'Sin tipo');

export type BedTypeCount = { category: string; label: string; free: number; total: number };

/**
 * Owner batch 5 (S4): free beds per room type. Every known type is always listed, so a type without free beds reads
 * «VIP 0» instead of disappearing; a type the data brings that is not known is added after them.
 */
export function bedTypeCounts(beds: { category?: string | null; free: boolean }[]): BedTypeCount[] {
  return bedTypeTotals(beds.map(bed => ({ category: bed.category, free: bed.free ? 1 : 0, total: 1 })));
}

/** Same counts from rows already added up (for example `/publico/ocupacion`, one row per floor and room type). */
export function bedTypeTotals(groups: { category?: string | null; free: number; total: number }[]): BedTypeCount[] {
  const by = new Map<string, BedTypeCount>(KNOWN.map(k => [k.key, { category: k.key, label: k.label, free: 0, total: 0 }]));
  for (const group of groups) {
    const key = group.category ?? '';
    const row = by.get(key) ?? { category: key, label: labelOf(key), free: 0, total: 0 };
    row.total += group.total; row.free += group.free;
    by.set(key, row);
  }
  return [...by.values()];
}

/** «VIP 0 · Semiprivada 4»: plain text for exports, tooltips and tests. */
export const bedTypeText = (counts: BedTypeCount[]) => counts.map(c => `${c.label} ${c.free}`).join(' · ');

/** One mark per room type (shape, not only colour) with its free count; a type with nothing free is highlighted. */
export function BedTypeBreakdown({ counts, label = 'Camas libres por tipo de habitación' }: { counts: BedTypeCount[]; label?: string }) {
  if (!counts.length) return null;
  return <span className="bed-types" role="list" aria-label={label}>
    {counts.map(c => <span role="listitem" key={c.category} className={`bed-type${c.free === 0 ? ' is-none' : ''}`} title={c.free === 0 ? `Sin camas libres ${c.label}` : `${c.free} de ${c.total} camas ${c.label} libres`}>
      <span className={`bed-type-mark type-${c.category || 'otra'}`} aria-hidden="true" />{c.label} <strong>{c.free}</strong>
    </span>)}
  </span>;
}
