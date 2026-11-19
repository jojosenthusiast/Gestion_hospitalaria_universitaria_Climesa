import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/ui';
import './queue.css';

export type CardMenuItem = { key: string; label: string; group?: string; onSelect: () => void };

/**
 * Owner batch 2 (S28): the extra moves of a queue card, as a small styled menu instead of a native select. The card
 * already shows its next step as a button (from the server's `allowedActions`), so this menu only holds what is not on
 * the card: send the number back to waiting, remove one call, void it, or change its priority. Every entry is a plain
 * sentence («Mover a En espera»); there is no placeholder entry and no repeated action.
 */
export function QueueCardMenu({ label, items, disabled = false }: { label: string; items: CardMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  if (!items.length) return null;
  const close = () => { setOpen(false); toggle.current?.focus(); };
  const groups = [...new Set(items.map(item => item.group ?? ''))];
  return <div className="qb-card-menu" ref={root} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } }}>
    <button type="button" ref={toggle} className="row-action qb-card-menu-toggle" disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      aria-label={label} title={label} onClick={() => setOpen(value => !value)}>Más <Icon name="chevron" size={14} /></button>
    {open && <div className="qb-card-menu-list" id={menuId} role="menu" aria-label={label}>
      {groups.map(group => <div key={group || 'main'} role="group" aria-label={group || undefined} className="qb-card-menu-group">
        {group && <span className="qb-card-menu-heading" aria-hidden="true">{group}</span>}
        {items.filter(item => (item.group ?? '') === group).map(item => <button key={item.key} type="button" role="menuitem" className="qb-card-menu-item"
          onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>)}
      </div>)}
    </div>}
  </div>;
}
