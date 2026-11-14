import type { ReactNode } from 'react';
import { Icon } from '../../components/ui';

export type ChipOption<T extends string> = { value: T; label: string; count?: number; tone?: string };

/** Fila de chips de filtro (una opción activa a la vez). Reemplaza combos cortos; cada chip dice cuántas filas deja. */
export function ChipGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ChipOption<T>[]; onChange: (value: T) => void }) {
  return <div className="cl-chip-group" role="group" aria-label={label}>{options.map(option =>
    <button type="button" key={option.value} className={`cl-chip${option.tone ? ` tone-${option.tone}` : ''}`} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <span>{option.label}</span>{option.count !== undefined && <small>{option.count}</small>}
    </button>)}</div>;
}

/** Filtros activos como chips quitables y «Quitar filtros»; no se muestra nada si no hay filtros. */
export function ActiveFilters({ filters, onClear }: { filters: { key: string; label: string; remove: () => void }[]; onClear: () => void }) {
  if (!filters.length) return null;
  return <div className="cl-active-filters" aria-label="Filtros activos">{filters.map(filter =>
    <button type="button" className="cl-chip cl-chip-removable" key={filter.key} onClick={filter.remove} aria-label={`Quitar filtro ${filter.label}`}>{filter.label}<Icon name="close" size={14} /></button>)}
    <button type="button" className="cl-link-button" onClick={onClear}>Quitar filtros</button></div>;
}

/** Barra común: búsqueda en vivo a la izquierda, orden y exportar a la derecha, filtros debajo. */
export function ListToolbar({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return <div className="cl-toolbar"><div className="cl-toolbar-main">{children}</div>{trailing && <div className="cl-toolbar-trailing">{trailing}</div>}</div>;
}

/** Texto de búsqueda sin tildes ni mayúsculas, igual que `SearchPicker`. */
export const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const matches = (query: string, ...parts: (string | null | undefined)[]) => {
  const needle = fold(query.trim());
  return !needle || fold(parts.filter(Boolean).join(' ')).includes(needle);
};

/** Campo de búsqueda con filtrado inmediato (sin botón «Buscar»). */
export function LiveSearch({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="cl-search"><span className="sr-only">{label}</span><Icon name="search" size={18} /><input type="search" value={value} placeholder={placeholder ?? label} onChange={event => onChange(event.target.value)} autoComplete="off" />
    {value && <button type="button" className="cl-search-clear" aria-label="Limpiar búsqueda" onClick={() => onChange('')}><Icon name="close" size={16} /></button>}</label>;
}
