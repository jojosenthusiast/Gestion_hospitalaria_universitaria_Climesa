import { useState } from 'react';
import { Icon } from './ui';
import './row-menu.css';

export type RowMenuAction = { key: string; label: string; onClick: () => void; disabled?: boolean };

/**
 * A table row's actions in little width: the first one is the row's main action (a link with an arrow), the rest open
 * under «Más acciones» inside the same cell. A column of three or four stacked links ate the patient's width and wrapped
 * names into four lines. The list opens in place (not a floating popover) so a scrolling table never clips it.
 * With a single secondary action it is shown as is: a menu for one item only adds a click.
 */
export function RowMenu({ actions, label }: { actions: RowMenuAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  const [main, ...rest] = actions;
  const folded = rest.length > 1;
  return <div className="row-menu">
    <button type="button" className="row-action" disabled={main.disabled} onClick={main.onClick}>{main.label} <Icon name="arrow" size={16} /></button>
    {!folded && rest.map(action => <button key={action.key} type="button" className="row-action" disabled={action.disabled} onClick={action.onClick}>{action.label}</button>)}
    {folded && <>
      <button type="button" className="row-action row-menu-toggle" aria-expanded={open} aria-label={label ? `Más acciones · ${label}` : undefined} onClick={() => setOpen(value => !value)}>Más acciones <Icon name="chevron" size={14} /></button>
      {open && <ul className="row-menu-list">{rest.map(action => <li key={action.key}><button type="button" className="row-action" disabled={action.disabled} onClick={() => { setOpen(false); action.onClick(); }}>{action.label}</button></li>)}</ul>}
    </>}
  </div>;
}
