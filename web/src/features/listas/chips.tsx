import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { statusFilterLook } from '../../components/system';
import { Icon } from '../../components/ui';
import '../../components/search-picker.css';

/** `status`: the status this chip filters by; the chip then wears that status's colour, texture and icon. */
export type ChipOption<T extends string> = { value: T; label: string; count?: number; tone?: string; status?: string };

/** Fila de chips de filtro (una opción activa a la vez). Reemplaza combos cortos; cada chip dice cuántas filas deja. */
export function ChipGroup<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ChipOption<T>[]; onChange: (value: T) => void }) {
  return <div className="cl-chip-group" role="group" aria-label={label}>{options.map(option => {
    const look = statusFilterLook(option.status);
    return <button type="button" key={option.value} className={`cl-chip${option.tone ? ' tone-' + option.tone : ''} ${look?.className ?? ''}`.trim()} aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {look && <Icon name={look.icon} size={14} />}<span>{option.label}</span>{option.count !== undefined && <small>{option.count}</small>}
    </button>;
  })}</div>;
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
/** One live match under the search box (audit D110): what it is and a short detail. */
export type SearchSuggestion = { id: string; label: string; detail?: string };

/**
 * Audit D110 (owner): the search never becomes a filter chip; with suggestions it lists the matches while typing,
 * like «Buscar persona» in Turnos, and picking one calls onPick. The list below keeps filtering as before.
 */
export function LiveSearch({ label, value, onChange, placeholder, suggestions, onPick }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; suggestions?: SearchSuggestion[]; onPick?: (id: string) => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  if (!suggestions || !onPick) return <SearchBox label={label} value={value} onChange={onChange} placeholder={placeholder} />;
  const shown = value.trim() ? suggestions.slice(0, 8) : [];
  const expanded = open && shown.length > 0;
  const pick = (id: string) => { setOpen(false); setActive(-1); onPick(id); };
  return <div className="cl-search-box" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <SearchBox label={label} value={value} placeholder={placeholder} onChange={text => { onChange(text); setOpen(true); setActive(-1); }}
      combobox={{ role: 'combobox', 'aria-expanded': expanded, 'aria-controls': listId, 'aria-autocomplete': 'list', 'aria-activedescendant': expanded && active >= 0 ? `${listId}-${active}` : undefined, onFocus: () => setOpen(true),
        onKeyDown: event => {
          if (event.key === 'ArrowDown' && shown.length) { event.preventDefault(); setOpen(true); setActive((active + 1) % shown.length); }
          else if (event.key === 'ArrowUp' && shown.length) { event.preventDefault(); setActive((active - 1 + shown.length) % shown.length); }
          else if (event.key === 'Enter' && expanded && active >= 0) { event.preventDefault(); pick(shown[active].id); }
          else if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        } }} />
    {expanded && <ul id={listId} role="listbox" aria-label={`Coincidencias de ${label.toLowerCase()}`} className="search-picker-pop cl-search-pop">
      {shown.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === active} className={`search-picker-option${index === active ? ' is-active' : ''}`}
        onMouseDown={event => event.preventDefault()} onClick={() => pick(item.id)}><span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span></li>)}
    </ul>}
  </div>;
}

type ComboboxProps = { role: 'combobox'; 'aria-expanded': boolean; 'aria-controls': string; 'aria-autocomplete': 'list'; 'aria-activedescendant'?: string; onFocus: () => void; onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void };
function SearchBox({ label, value, onChange, placeholder, combobox }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; combobox?: ComboboxProps }) {
  return <label className="cl-search"><span className="sr-only">{label}</span><Icon name="search" size={18} /><input type="search" value={value} placeholder={placeholder ?? label} onChange={event => onChange(event.target.value)} autoComplete="off" {...combobox} />
    {value && <button type="button" className="cl-search-clear" aria-label="Limpiar búsqueda" onClick={() => onChange('')}><Icon name="close" size={16} /></button>}</label>;
}
