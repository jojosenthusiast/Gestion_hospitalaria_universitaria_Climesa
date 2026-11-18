import { useState, type ReactNode } from 'react';
import { formatNumber } from '../lib/format';

/**
 * R3: a long list shows what matters first and folds the rest behind «Ver N más» (the Inicio tray pattern). Lists whose
 * rows are already sorted by importance pass them as they are; the button unfolds them in place.
 */
export function useFold<T>(items: readonly T[], limit: number): { shown: readonly T[]; more: ReactNode } {
  const [open, setOpen] = useState(false);
  const hidden = open ? 0 : Math.max(0, items.length - limit);
  return {
    shown: hidden ? items.slice(0, limit) : items,
    more: hidden ? <button type="button" className="cl-link-button fold-more" onClick={() => setOpen(true)}>Ver {formatNumber(hidden)} más</button> : null,
  };
}

/** «Ver N más» as a link to the full screen, for a panel that only previews it. */
export const MoreLink = ({ count, href }: { count: number; href: string }) => count > 0 ? <a className="row-action tray-more fold-more" href={href}>Ver {formatNumber(count)} más</a> : null;
