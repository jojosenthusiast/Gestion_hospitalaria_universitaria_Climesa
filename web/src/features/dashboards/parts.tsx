import { MoreLink } from '../../components/fold';
import { Fragment, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../../components/ui';
import { AreaTag, SectionState, StatusBadge, type AreaCode } from '../../components/system';
import { type Tone } from '../../components/charts';
import { can, type AccessProfile } from '../../lib/api';
import { formatNumber, formatTime, localDayKey, plural as pluralOf } from '../../lib/format';
import type { Remote } from '../common';
import './day-panel.css';

/** Zona horaria del hospital: «hoy» y las horas se leen siempre en hora de El Salvador. */
export const localDay = (value: string | Date = new Date()) => localDayKey(value);
export const timeLabel = (iso: string) => formatTime(iso);
export const isToday = (iso: string) => localDay(iso) === localDay();
export const minutesBetween = (from: string, to: string) => Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000));
export const plural = pluralOf;

/** Estado de un valor frente a umbrales. Pasar el umbral alto es urgente (ámbar), nunca rojo crítico. */
export const toneFor = (value: number, warnAt: number, urgentAt: number): Tone => value >= urgentAt ? 'urgent' : value >= warnAt ? 'warn' : 'ok';

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

// ───────────────────────────── R4a · panel del día: bandeja única y cifras una sola vez

/** `tag` is the visible label; with `status` it shows as a StatusBadge, with `area` as an AreaTag, otherwise as plain text. */
export type AttentionItem = { id: string; title: string; detail?: string; tone: Tone; href: string; action: string; tag?: string; status?: string; area?: AreaCode };

/**
 * Rows of a pending group. The name owns line 1 at full width (a 4-part Salvadoran name never wraps into 4 lines
 * because a chip or button ate the width); state and detail go on line 2; the action sits at the right of both.
 */
/** R3: beyond `limit` the rest is folded; with `moreHref` a «Ver N más» link opens the full screen (a tray group already links from its header). */
export function AttentionList({ items, empty = 'Nada pendiente por ahora.', limit = 4, moreHref }: { items: AttentionItem[]; empty?: string; limit?: number; moreHref?: string }) {
  if (items.length === 0) return <p className="section-empty" role="status">{empty}</p>;
  return <><ul className="tray-list">{items.slice(0, limit).map(item => <li key={item.id} className="tray-row">
    <strong className="tray-row-name">{item.title}</strong>
    <a className="row-action tray-row-action" href={item.href}>{item.action}<Icon name="arrow" size={16} /></a>
    {(item.detail || item.status || item.area || item.tag) && <span className="tray-row-meta">
      {item.status ? <StatusBadge value={item.status} label={item.tag} /> : item.area ? <AreaTag code={item.area} /> : item.tag && <span className="tray-row-tag">{item.tag}</span>}
      {item.detail && <span className="tray-row-detail">{item.detail}</span>}
    </span>}
  </li>)}</ul>{moreHref && <MoreLink count={items.length - limit} href={moreHref} />}</>;
}

/** One group of the pending tray. Hidden when it has nothing; its count is the only place this number appears. */
export type TrayGroupSpec = { id: string; title: string; href: string; items: AttentionItem[]; state?: Remote<unknown>; masculine?: boolean; limit?: number };
export function TrayGroup({ group }: { group: TrayGroupSpec }) {
  const { state, items, limit = 4 } = group;
  if (state && (state.error || (!state.data && state.loading))) {
    return <section className="tray-group" aria-label={group.title}><header><h3>{group.title}</h3></header><SectionState state={state} compact rows={1}>{() => null}</SectionState></section>;
  }
  if (items.length === 0) return null;
  return <section className="tray-group" aria-label={group.title}>
    <header><h3>{group.title}</h3><span className="tray-count">{formatNumber(items.length)}</span>
      {items.length > limit && <a className="row-action tray-more" href={group.href}>{`Ver ${group.masculine ? 'los' : 'las'} ${formatNumber(items.length)}`}</a>}</header>
    <AttentionList items={items} limit={limit} />
  </section>;
}

/** A tray group that renders itself (`node`); `count` null while it loads. */
export type TrayExtra = { id: string; title: string; count: number | null; node: ReactNode };
const settled = (group: TrayGroupSpec) => !group.state || (!!group.state.data && !group.state.error);
const OPEN_GROUPS = 2, OPEN_ROWS = 2;
/** Out of stock is as urgent as a red tone: nothing left to work with. */
const itemRank = (i: AttentionItem) => i.tone === 'urgent' || i.status === 'agotado' ? 0 : i.tone === 'warn' ? 1 : 2;
const urgency = (group: TrayGroupSpec) => Math.min(2, ...group.items.map(itemRank));
/**
 * The ONE pending tray of Inicio. A heavy shift can pile up many groups that only clear after real work, so the first
 * glance is what to do now: the two most urgent groups open with their first rows, every other group folds into one
 * line (name, count, «Ver») that leads to its section. Loading or failed groups keep their place and state.
 */
export function PendingTray({ groups, extras = [], children, othersClear = true }: { groups: TrayGroupSpec[]; extras?: TrayExtra[]; children?: ReactNode; othersClear?: boolean }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const clear = othersClear && groups.every(g => settled(g) && g.items.length === 0);
  const ready = groups.filter(g => settled(g) && g.items.length > 0);
  const open = new Set([...ready].sort((a, b) => urgency(a) - urgency(b)).slice(0, OPEN_GROUPS).map(g => g.id));
  const folded = ready.filter(g => !open.has(g.id));
  // Extra groups (S10 panels with their own inline actions) take only the slots the tray groups left; the rest fold
  // into the same line list and unfold in place, since no other screen hosts them. An empty extra renders its own
  // node (null, or the notice of what was just done) without taking a slot.
  const pending = extras.filter(x => x.count !== 0);
  const extraOpen = new Set(pending.slice(0, Math.max(0, OPEN_GROUPS - open.size)).map(x => x.id));
  const extraFolded = pending.filter(x => !extraOpen.has(x.id));
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <section className="pending-tray" aria-label="Pendientes">
    <h2 className="pending-tray-title">Pendientes</h2>
    {groups.filter(g => !settled(g) || open.has(g.id)).map(group => <TrayGroup key={group.id} group={open.has(group.id) ? { ...group, items: [...group.items].sort((a, b) => itemRank(a) - itemRank(b)), limit: Math.min(group.limit ?? OPEN_ROWS, OPEN_ROWS) } : group} />)}
    {extras.filter(x => x.count === 0 || extraOpen.has(x.id)).map(x => <Fragment key={x.id}>{x.node}</Fragment>)}
    {(folded.length > 0 || extraFolded.length > 0) && <ul className="tray-folded" aria-label="Otros pendientes">{folded.map(g => <li key={g.id}>
      <span>{g.title}</span><span className="tray-count">{formatNumber(g.items.length)}</span>
      <a className="row-action" href={g.href}>Ver<Icon name="arrow" size={16} /></a>
    </li>)}{extraFolded.map(x => <li key={x.id}>
      <span>{x.title}</span>{x.count != null && <span className="tray-count">{formatNumber(x.count)}</span>}
      <button type="button" className="row-action" aria-expanded={expanded.has(x.id)} onClick={() => toggle(x.id)}>{expanded.has(x.id) ? 'Ocultar' : 'Ver'}</button>
    </li>)}</ul>}
    {extraFolded.filter(x => expanded.has(x.id)).map(x => <Fragment key={x.id}>{x.node}</Fragment>)}
    {children}
    {clear && <p className="section-empty" role="status">Al día: nada pendiente.</p>}
  </section>;
}

/** A figure of the day. `value` null means «not applicable now» and hides it; the remote drives loading and error. */
export type Figure = { id: string; label: string; value: number | string | null; state: Remote<unknown>; href?: string; of?: string; /** Owner batch 5 (S4): a short split under the label («5 de fila, 3 con cita», free beds per room type). */ detail?: ReactNode };
const shown = (figure: Figure) => figure.state.error ? '—' : !figure.state.data ? null : typeof figure.value === 'number' ? formatNumber(figure.value) : figure.value;
export const isTextFigure = (figure: Figure) => typeof figure.value === 'string' && /\p{L}/u.test(figure.value);
/** The day's figures, each shown once. A failed source shows «—» and one line with its retry under the strip. */
export function DayFigures({ figures }: { figures: Figure[] }) {
  const visible = figures.filter(f => !(f.state.data && !f.state.error && f.value === null));
  if (visible.length === 0) return null;
  const failed = [...new Set(visible.filter(f => f.state.error).map(f => f.state))];
  return <section className="day-figures" aria-label="Cifras del día">
    <ul>{visible.map(figure => {
      const value = shown(figure);
      const body = <>
        {/* P3 W3: a word figure («En mantenimiento») wraps at a smaller size instead of being cut. */}
        <span className={`figure-value${value === null ? ' is-loading' : ''}${isTextFigure(figure) ? ' is-text' : ''}`}>{value ?? ''}</span>
        <span className="figure-label">{figure.label}{figure.of && value !== null && value !== '—' ? <small> {figure.of}</small> : null}</span>
        {figure.detail && value !== null && value !== '—' ? <span className="figure-detail">{figure.detail}</span> : null}
      </>;
      return <li key={figure.id} data-figure={figure.id} aria-busy={value === null ? true : undefined}>{figure.href ? <a href={figure.href}>{body}</a> : <span>{body}</span>}</li>;
    })}</ul>
    {failed.map((state, i) => <SectionState key={i} state={state} compact>{() => null}</SectionState>)}
  </section>;
}

/** `hint` is the native tooltip of the action; it is not printed under the label (R1, S1). */
export type QuickAction = { id: string; label: string; hint: string; icon: IconName; href: string; permission: string; /** The one main action of the role (sweep 2026-11-17: one primary per Inicio). */ primary?: boolean };
/** Acciones rápidas reales: abren el formulario del módulo con `?accion=` y solo aparecen si la cuenta tiene el permiso. */
export function QuickActions({ actions, profile }: { actions: QuickAction[]; profile: AccessProfile }) {
  const allowed = actions.filter(action => can(profile, action.permission));
  if (allowed.length === 0) return null;
  return <section className="quick-actions" aria-label="Acciones rápidas"><div>{allowed.map(action => <a key={action.id} href={action.href} title={action.hint} className={action.primary ? 'is-primary' : undefined}><span className="quick-icon" aria-hidden="true"><Icon name={action.icon} size={18} /></span><strong>{action.label}</strong></a>)}</div></section>;
}
