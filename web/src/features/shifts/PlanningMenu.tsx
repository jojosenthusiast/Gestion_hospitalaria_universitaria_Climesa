import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/ui';

export type PlanningTool = { key: string; label: string; hint: string; onSelect: () => void };

/**
 * «Herramientas de planificación»: the batch tools (rotation, fill holes, copy the previous week, bulk assignment,
 * templates) in one menu instead of five equal buttons. Same look and keyboard as «Exportar».
 */
export function PlanningMenu({ tools }: { tools: PlanningTool[] }) {
  const [open, setOpen] = useState(false), id = useId();
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  if (!tools.length) return null;
  return <div className="export-menu shift-tools" ref={root}>
    <button ref={trigger} type="button" className="secondary-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Icon name="calendar" size={18} />Herramientas de planificación<Icon name="chevron" size={14} />
    </button>
    {open && <div className="export-popover shift-tools-popover" role="menu" aria-label="Herramientas de planificación">
      {tools.map(tool => <button key={tool.key} type="button" role="menuitem" aria-label={tool.label} aria-describedby={`${id}-${tool.key}`} onClick={() => { setOpen(false); tool.onSelect(); }}><strong>{tool.label}</strong><span id={`${id}-${tool.key}`}>{tool.hint}</span></button>)}
    </div>}
  </div>;
}
