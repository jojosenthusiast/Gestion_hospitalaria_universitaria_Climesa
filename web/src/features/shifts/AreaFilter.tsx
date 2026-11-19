import { useMemo, useState } from 'react';
import { AreaChip } from '../../components/identity';
import { areaTree, type AreaNode } from './bands';
import type { CatalogArea } from './rules';

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Shifts of the week per area, each one counted in its area and in every area above it (a floor counts its areas). */
export function areaCounts(areas: CatalogArea[], areaIds: string[]): Map<string, number> {
  const parent = new Map(areas.map(a => [a.id, a.parentId]));
  const counts = new Map<string, number>();
  for (const id of areaIds) {
    const seen = new Set<string>();
    for (let at: string | null | undefined = id; at && !seen.has(at); at = parent.get(at)) { seen.add(at); counts.set(at, (counts.get(at) ?? 0) + 1); }
  }
  return counts;
}

/**
 * «Área de trabajo» as the building is organized: each floor is a group with its areas and offices under it, the same
 * order as Edificio. Choosing a floor shows every area of that floor. A search box narrows the tree by name and keeps
 * the floor of each match so it is clear where the area is. Each option carries the shifts it has this week.
 */
export function AreaFilter({ areas, value, counts, onChange }: { areas: CatalogArea[]; value: string; counts: Map<string, number>; onChange: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const tree = useMemo(() => areaTree(areas), [areas]);
  const wanted = fold(query.trim());
  const visible = (node: AreaNode): boolean => !wanted || fold(node.area.name).includes(wanted) || node.children.some(visible);
  const option = (node: AreaNode) => {
    const count = counts.get(node.area.id) ?? 0;
    return <button type="button" className="shift-pill shift-area-option" aria-pressed={value === node.area.id} onClick={() => onChange(value === node.area.id ? 'todos' : node.area.id)}>
      <AreaChip name={node.area.name} type={node.area.type} /><small className="shift-filter-count" aria-label={`${count} turnos`}>{count}</small>
    </button>;
  };
  const branch = (nodes: AreaNode[], depth: number) => <ul className={`shift-area-tree is-depth-${depth}`}>
    {nodes.filter(visible).map(node => <li key={node.area.id} className={node.children.length ? 'has-children' : undefined}>
      {option(node)}
      {node.children.length > 0 && branch(node.children, depth + 1)}
    </li>)}
  </ul>;
  const shown = tree.filter(visible);
  return <fieldset className="shift-filter-group shift-area-filter"><legend>Área de trabajo</legend>
    {areas.length > 5 && <input type="search" className="shift-area-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar área o planta" aria-label="Buscar área" />}
    {shown.length ? branch(tree, 0) : <p className="muted">Ningún área coincide con «{query}».</p>}
  </fieldset>;
}
