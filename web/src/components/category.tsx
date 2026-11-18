import type { ReactNode } from 'react';
import { Icon } from './ui';
import type { IdentityTone } from './identity';
import './identity.css';
import './category.css';

/** A category of an appointment request by reason, as the API sends it (`CategoryRefResponse`). */
export type CategoryRef = { code: string; name: string; icon: string };

/** Ícono de cada motivo (clave estable de la API); mismo trazo que `Icon`. Las claves desconocidas usan el estetoscopio. */
const GLYPHS: Record<string, ReactNode> = {
  nino: <><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" /><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" /></>,
  mujer: <><circle cx="12" cy="9" r="5" /><path d="M12 14v8M9 19h6" /></>,
  corazon: <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z" />,
  hueso: <path d="M17 10c.7-.7 1.7 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .8.7 1.8 0 2.5l-7 7c-.7.7-1.7 0-2.5 0a2.5 2.5 0 0 0 0 5c.3 0 .5.2.5.5a2.5 2.5 0 1 0 5 0c0-.8-.7-1.8 0-2.5z" />,
  piel: <path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />,
  ojo: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  oido: <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />,
  mente: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" /></>,
  neuro: <path d="M13 2 4 14h8l-1 8 9-12h-8z" />,
  digestivo: <path d="M4 3v6a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V3M7.5 3v18M20 15V3a5 5 0 0 0-4 5v5c0 1.1.9 2 2 2zm0 0v6" />,
  rinon: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  alergia: <path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H3M9.6 4.6A2 2 0 1 1 11 8H3M12.6 19.4A2 2 0 1 0 14 16H3" />,
  cirugia: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></>,
};
export function CategoryGlyph({ icon, size = 20 }: { icon: string; size?: number }) {
  if (!GLYPHS[icon]) return <Icon name="steth" size={size} />;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{GLYPHS[icon]}</svg>;
}

/** Soft tone per category icon, from the identity palette (AA text on a light background, also in dark mode). */
const CATEGORY_TONE: Record<string, IdentityTone> = {
  general: 'slate', nino: 'amber', mujer: 'magenta', corazon: 'red', hueso: 'orange', piel: 'amber', ojo: 'blue',
  oido: 'teal', mente: 'purple', neuro: 'indigo', digestivo: 'green', rinon: 'cyan', alergia: 'orange', cirugia: 'slate',
};
export const categoryTone = (icon: string): IdentityTone => CATEGORY_TONE[icon] ?? 'slate';

/**
 * Quiet body-part marks of an appointment that came from a request by reason, placed next to the patient's name.
 * The color only supports the icon: each mark has the category name as its accessible name and tooltip.
 * Renders nothing when the appointment has no categories (booked directly by reception).
 */
export function CategoryBadges({ categories, size = 14 }: { categories?: CategoryRef[] | null; size?: number }) {
  if (!categories?.length) return null;
  return <span className="cat-badges" role="list" aria-label={`Motivo: ${categories.map(c => c.name).join(', ')}`}>
    {categories.map(c => <span key={c.code} role="listitem" className={`cat-badge identity-tone-${categoryTone(c.icon)}`} title={c.name}>
      <span role="img" aria-label={c.name}><CategoryGlyph icon={c.icon} size={size} /></span>
    </span>)}
  </span>;
}
