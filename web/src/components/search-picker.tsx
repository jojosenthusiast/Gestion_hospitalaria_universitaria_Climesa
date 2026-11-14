import { useCallback, useEffect, useId, useRef, useState } from 'react';
import './search-picker.css';

/** Elemento de un selector. Un elemento `disabled` se ve apagado y muestra su `reason` (por ejemplo "Sin turno"). */
export type PickerItem = { id: string; label: string; detail?: string; disabled?: boolean; reason?: string };
export type PickerPage = { items: PickerItem[]; hasMore?: boolean };

/** Sin tildes ni mayúsculas: "maria" encuentra "María". */
export const foldText = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Props = {
  label: string;
  value: PickerItem | null;
  onChange: (item: PickerItem | null) => void;
  /** Búsqueda remota paginada: se llama con el texto y el desplazamiento. Se espera `debounceMs` tras la última tecla. */
  search?: (query: string, offset: number) => Promise<PickerPage>;
  /** Lista local (pocas filas, por ejemplo los médicos): se filtra sin red y se muestra completa al abrir. */
  items?: PickerItem[];
  minChars?: number;
  debounceMs?: number;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  emptyText?: string;
  /** Texto con el que se abre el selector por primera vez (por ejemplo lo que se buscó antes). */
  initialQuery?: string;
};

/**
 * Selector con búsqueda mientras se escribe, accesible con teclado (patrón combobox con lista):
 * flechas para moverse, Enter para elegir, Escape para cerrar. Los elementos no disponibles se muestran
 * apagados con su motivo y no se pueden elegir. Sirve para miles de filas porque solo pide páginas cortas.
 */
export function SearchPicker({ label, value, onChange, search, items, minChars = 2, debounceMs = 250, placeholder, hint, required = false, disabled = false, emptyText = 'Sin coincidencias.', initialQuery = '' }: Props) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PickerItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const local = items !== undefined;

  const load = useCallback(async (text: string, offset: number) => {
    const mine = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await search!(text, offset);
      if (mine !== requestId.current) return;
      setRows(current => (offset === 0 ? page.items : [...current, ...page.items]));
      setHasMore(!!page.hasMore);
    } catch (e) {
      if (mine === requestId.current) setError(e instanceof Error ? e.message : 'No se pudo buscar.');
    } finally {
      if (mine === requestId.current) setLoading(false);
    }
  }, [search]);

  // Búsqueda remota con espera entre teclas; cada respuesta tardía de una consulta vieja se descarta.
  useEffect(() => {
    if (local || !open) return;
    if (query.trim().length < minChars) { requestId.current++; setRows([]); setHasMore(false); setLoading(false); setError(null); return; }
    const timer = setTimeout(() => { void load(query.trim(), 0); }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, open, local, minChars, debounceMs, load]);

  const shown = local ? (items ?? []).filter(item => !query.trim() || foldText(`${item.label} ${item.detail ?? ''}`).includes(foldText(query.trim()))) : rows;
  const needsMore = !local && open && query.trim().length < minChars;

  useEffect(() => { setActive(shown.findIndex(item => !item.disabled)); }, [shown.length, query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const choose = (item: PickerItem) => {
    if (item.disabled) return;
    onChange(item);
    setQuery('');
    setOpen(false);
  };
  const step = (direction: 1 | -1) => {
    if (!shown.length) return;
    let next = active;
    for (let i = 0; i < shown.length; i++) {
      next = (next + direction + shown.length) % shown.length;
      if (!shown[next].disabled) { setActive(next); return; }
    }
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); if (!open) setOpen(true); else step(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (!open) setOpen(true); else step(-1); }
    else if (event.key === 'Enter' && open && active >= 0 && shown[active]) { event.preventDefault(); choose(shown[active]); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
  };

  if (value) {
    return (
      <div className="field search-picker" ref={wrapper}>
        <span id={`${baseId}-label`}>{label}</span>
        <div className="search-picker-selected" role="group" aria-labelledby={`${baseId}-label`}>
          <span><strong>{value.label}</strong>{value.detail && <small>{value.detail}</small>}</span>
          <button type="button" className="secondary-button" onClick={() => { onChange(null); setOpen(true); }} disabled={disabled}>Cambiar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="field search-picker" ref={wrapper}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${baseId}-opt-${active}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={placeholder ?? (local ? 'Escribe para filtrar' : `Escribe al menos ${minChars} letras`)}
        required={required}
        disabled={disabled}
        onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {hint && <span className="field-hint">{hint}</span>}
      {open && (
        <div className="search-picker-pop">
          <ul id={listId} role="listbox" aria-label={label}>
            {shown.map((item, index) => (
              <li
                key={item.id}
                id={`${baseId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                aria-disabled={item.disabled || undefined}
                className={`search-picker-option${index === active ? ' is-active' : ''}${item.disabled ? ' is-disabled' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onClick={() => choose(item)}
              >
                <span><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</span>
                {item.disabled && item.reason && <em>{item.reason}</em>}
              </li>
            ))}
          </ul>
          {needsMore && <p className="search-picker-note" role="status">Escribe al menos {minChars} letras para buscar.</p>}
          {loading && <p className="search-picker-note" role="status">Buscando…</p>}
          {error && <p className="search-picker-note is-error" role="alert">{error}</p>}
          {!needsMore && !loading && !error && shown.length === 0 && <p className="search-picker-note" role="status">{emptyText}</p>}
          {hasMore && !loading && <button type="button" className="search-picker-more" onMouseDown={event => event.preventDefault()} onClick={() => void load(query.trim(), rows.length)}>Mostrar más resultados</button>}
        </div>
      )}
    </div>
  );
}
