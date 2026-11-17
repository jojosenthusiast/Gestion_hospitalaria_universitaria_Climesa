import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../components/ui';
import { AreaTag, SectionState, StatusBadge, type AreaCode } from '../../components/system';
import { toneColor, type Tone } from '../../components/charts';
import { can, type AccessProfile } from '../../lib/api';
import type { Remote } from '../common';

/** Zona horaria del hospital: «hoy» y las horas se leen siempre en hora de El Salvador. */
const ZONE = 'America/El_Salvador';
export const localDay = (value: string | Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(typeof value === 'string' ? new Date(value) : value);
export const timeLabel = (iso: string) => new Intl.DateTimeFormat('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone: ZONE }).format(new Date(iso));
export const isToday = (iso: string) => localDay(iso) === localDay();
export const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Estado de un valor frente a umbrales. Pasar el umbral alto es urgente (ámbar), nunca rojo crítico. */
export const toneFor = (value: number, warnAt: number, urgentAt: number): Tone => value >= urgentAt ? 'urgent' : value >= warnAt ? 'warn' : 'ok';

export type KpiProps = { icon: IconName; label: string; value: string | number; sub?: string; tone?: Tone | 'neutral'; href?: string };
/** Tarjeta de cifra con estado de color. El color acompaña a la palabra del subtítulo, nunca la sustituye. */
export function Kpi({ icon, label, value, sub, tone = 'neutral', href }: KpiProps) {
  const body = <>
    <span className="kpi-icon" aria-hidden="true"><Icon name={icon} size={22} /></span>
    <span className="kpi-label">{label}</span>
    <strong className="kpi-value">{value}</strong>
    {sub && <span className="kpi-sub">{sub}</span>}
  </>;
  const className = `kpi kpi-${tone}`;
  return href ? <a className={className} href={href}>{body}</a> : <div className={className}>{body}</div>;
}
export const KpiRow = ({ children }: { children: ReactNode }) => <div className="kpi-row">{children}</div>;

/** R1 (S1): a panel is a title, an optional link and its content. No helper sentence under the title. */
export function Panel({ title, icon, action, children, wide = false }: { title: string; icon?: IconName; action?: { label: string; href: string }; children: ReactNode; wide?: boolean }) {
  return <section className={`dash-panel${wide ? ' dash-panel-wide' : ''}`} aria-label={title}>
    <header><h2>{icon && <Icon name={icon} size={18} />}{title}</h2>{action && <a className="row-action" href={action.href}>{action.label}<Icon name="arrow" size={16} /></a>}</header>
    {children}
  </section>;
}

/** Estado dentro de una tarjeta: el `SectionState` común en su forma de una línea. Una fuente que falla no tumba el resto. */
export function PanelState<T>({ state, children, empty }: { state: Remote<T>; children: (data: T) => ReactNode; empty?: (data: T) => string | null }) {
  return <SectionState state={state} compact empty={empty}>{children}</SectionState>;
}

/** `tag` is the visible label; with `status` it shows as a StatusBadge, with `area` as an AreaTag, otherwise as plain text. */
export type AttentionItem = { id: string; title: string; detail?: string; tone: Tone; href: string; action: string; tag?: string; status?: string; area?: AreaCode };
/** Lista de «qué necesita mi atención»: cada fila lleva su acción directa; vacía, lo dice con claridad. */
export function AttentionList({ items, empty = 'Nada pendiente por ahora.', limit = 6 }: { items: AttentionItem[]; empty?: string; limit?: number }) {
  if (items.length === 0) return <p className="section-empty" role="status">{empty}</p>;
  return <ul className="attention-list">{items.slice(0, limit).map(item => <li key={item.id} style={{ ['--attn' as string]: toneColor[item.tone] }}>
    <div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div>
    {item.status ? <StatusBadge value={item.status} label={item.tag} /> : item.area ? <AreaTag code={item.area} showName /> : item.tag && <span className="attention-tag">{item.tag}</span>}
    <a className="row-action" href={item.href}>{item.action}<Icon name="arrow" size={16} /></a>
  </li>)}{items.length > limit && <li className="attention-more">y {items.length - limit} más</li>}</ul>;
}

/** `hint` is the native tooltip of the action; it is not printed under the label (R1, S1). */
export type QuickAction = { id: string; label: string; hint: string; icon: IconName; href: string; permission: string };
/** Acciones rápidas reales: abren el formulario del módulo con `?accion=` y solo aparecen si la cuenta tiene el permiso. */
export function QuickActions({ actions, profile }: { actions: QuickAction[]; profile: AccessProfile }) {
  const allowed = actions.filter(action => can(profile, action.permission));
  if (allowed.length === 0) return null;
  return <section className="quick-actions" aria-label="Acciones rápidas"><div>{allowed.map(action => <a key={action.id} href={action.href} title={action.hint}><span className="quick-icon" aria-hidden="true"><Icon name={action.icon} size={20} /></span><strong>{action.label}</strong></a>)}</div></section>;
}
