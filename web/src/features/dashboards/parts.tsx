import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../components/ui';
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

/** Estado de un valor frente a umbrales; `higherIsWorse` invierte la lectura (tiempos de espera, ocupación). */
export const toneFor = (value: number, warnAt: number, dangerAt: number): Tone => value >= dangerAt ? 'danger' : value >= warnAt ? 'warn' : 'ok';

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

export function Panel({ title, icon, action, children, wide = false, hint }: { title: string; icon?: IconName; action?: { label: string; href: string }; children: ReactNode; wide?: boolean; hint?: string }) {
  return <section className={`dash-panel${wide ? ' dash-panel-wide' : ''}`} aria-label={title}>
    <header><h2>{icon && <Icon name={icon} size={18} />}{title}</h2>{action && <a className="row-action" href={action.href}>{action.label}<Icon name="arrow" size={16} /></a>}</header>
    {hint && <p className="panel-hint">{hint}</p>}
    {children}
  </section>;
}

/** Estado de carga, error y permiso dentro de una tarjeta: una fuente que falla no tumba el resto del inicio. */
export function PanelState<T>({ state, children, empty }: { state: Remote<T>; children: (data: T) => ReactNode; empty?: (data: T) => string | null }) {
  if (state.loading && !state.data) return <p className="panel-state" role="status"><span className="spinner" />Cargando…</p>;
  if (state.error) return <div className="panel-state panel-state-error" role="alert"><span>{state.error.status === 403 ? 'Tu cuenta no tiene permiso para ver esta información.' : state.error.message}</span><button type="button" className="row-action" onClick={state.refresh}><Icon name="retry" size={16} />Reintentar</button></div>;
  if (!state.data) return null;
  const message = empty?.(state.data);
  return message ? <p className="panel-empty" role="status">{message}</p> : <>{children(state.data)}</>;
}

export type AttentionItem = { id: string; title: string; detail?: string; tone: Tone; href: string; action: string; tag?: string };
/** Lista de «qué necesita mi atención»: cada fila lleva su acción directa; vacía, lo dice con claridad. */
export function AttentionList({ items, empty = 'Nada pendiente por ahora.', limit = 6 }: { items: AttentionItem[]; empty?: string; limit?: number }) {
  if (items.length === 0) return <p className="panel-empty attention-empty" role="status"><Icon name="check" size={18} />{empty}</p>;
  return <ul className="attention-list">{items.slice(0, limit).map(item => <li key={item.id} style={{ ['--attn' as string]: toneColor[item.tone] }}>
    <div><strong>{item.title}</strong>{item.detail && <span>{item.detail}</span>}</div>
    {item.tag && <span className="attention-tag">{item.tag}</span>}
    <a className="row-action" href={item.href}>{item.action}<Icon name="arrow" size={16} /></a>
  </li>)}{items.length > limit && <li className="attention-more">y {items.length - limit} más</li>}</ul>;
}

export type QuickAction = { id: string; label: string; hint: string; icon: IconName; href: string; permission: string };
/** Acciones rápidas reales: abren el formulario del módulo con `?accion=` y solo aparecen si la cuenta tiene el permiso. */
export function QuickActions({ actions, profile }: { actions: QuickAction[]; profile: AccessProfile }) {
  const allowed = actions.filter(action => can(profile, action.permission));
  if (allowed.length === 0) return null;
  return <section className="quick-actions" aria-label="Acciones rápidas"><h2>Acciones rápidas</h2><div>{allowed.map(action => <a key={action.id} href={action.href}><span className="quick-icon" aria-hidden="true"><Icon name={action.icon} size={22} /></span><span><strong>{action.label}</strong><small>{action.hint}</small></span></a>)}</div></section>;
}
