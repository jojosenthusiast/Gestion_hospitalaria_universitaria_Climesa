import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui';
import { plural } from '../lib/format';
import './filter-popover.css';

/**
 * R4a (list + detail): one «Filtros» button that says how many filters are on, and opens the filters in a popover.
 * Escape and a click outside close it and return focus to the button.
 */
export function FilterPopover({ count, children, label = 'Filtros' }: { count: number; children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  return <div className="filter-popover" ref={root}>
    <button ref={trigger} type="button" className={`secondary-button filter-trigger${count ? ' has-filters' : ''}`} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Icon name="filter" size={18} />{label}{count > 0 && <span className="filter-count"> · {plural(count, 'activo', 'activos')}</span>}
    </button>
    {open && <div className="filter-panel" role="group" aria-label={label}>{children}</div>}
  </div>;
}
