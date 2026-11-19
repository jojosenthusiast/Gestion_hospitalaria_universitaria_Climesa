import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './ui';

/**
 * Fase 2 (docs/diseno/fase2/02-sistema.md): piezas comunes del sistema de diseño.
 * Los colores viven como tokens en `styles.css` (`--area-*`, `--status-*`, `--priority-*`); aquí solo se
 * decide qué token, ícono, patrón y texto lleva cada valor. Nada comunica solo con color.
 */

/** Títulos y subtítulos de cabecera van sin punto final; un texto de varias oraciones conserva su puntuación. */
export const headerText = (text: string) => { const t = text.trim(); return t.endsWith('.') && !t.endsWith('..') && !/[.!?…]\s/.test(t.slice(0, -1)) ? t.slice(0, -1) : t; };

/**
 * S1: barra compacta de cada módulo. Ruta pequeña, título (el único h1 de la pantalla), filtros y la acción principal.
 * Sin descripción: el espacio va al contenido.
 */
export function CompactHeader({ title, breadcrumb, filters, actions }: { title: string; breadcrumb?: string; filters?: ReactNode; actions?: ReactNode }) {
  return <header className="compact-header">
    <div className="compact-header-title">{breadcrumb && <span className="compact-breadcrumb">{breadcrumb}</span>}<h1>{headerText(title)}</h1></div>
    {filters && <div className="compact-header-filters">{filters}</div>}
    {actions && <div className="heading-actions">{actions}</div>}
  </header>;
}

/** S3: lugar reservado mientras carga una sección. Sin spinner; el texto queda para lectores de pantalla. */
export function Skeleton({ rows = 3, label = 'Cargando información…', minHeight }: { rows?: number; label?: string; minHeight?: number }) {
  const style: CSSProperties | undefined = minHeight ? { minHeight } : undefined;
  return <div className="skeleton" role="status" aria-busy="true" aria-live="polite" style={style}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => <span key={i} className="skeleton-line" aria-hidden="true" />)}
  </div>;
}

/** What a section reads: the same shape as `useData` (features/common.tsx), kept structural so the system has no API import. */
export type SectionSource<T> = { data: T | null; loading: boolean; error: { status?: number; message: string } | null; refresh: () => void };

/**
 * R1 (S2, S3): the one loading, error and empty state of a section. Every module, home panel and tray uses it, so the
 * skeleton, the wording and the retry are the same everywhere. `compact` is the one-line form for panels and trays.
 * With `empty`, a section with nothing to show collapses to a single quiet line; no second heading.
 */
export function SectionState<T>({ state, children, rows = 4, compact = false, empty }: { state: SectionSource<T>; children: (data: T) => ReactNode; rows?: number; compact?: boolean; empty?: (data: T) => string | null }) {
  if (state.loading && !state.data) return <Skeleton rows={compact ? 2 : rows} />;
  if (state.error) {
    // WEB-04, S8: "no permission" is not a failure. Retrying a 403 can never succeed, so it is a calm info state with
    // the server's reason and no retry; only a failed load (network, 5xx, other) offers «Volver a intentar».
    if (state.error.status === 403) {
      // A 403 with its own reason (e.g. «needs a care relationship») says why; a bare «Forbidden» keeps the generic text.
      const specific = state.error.message && !/^(forbidden|prohibido|no autorizado|sin permiso)\.?$/i.test(state.error.message.trim());
      const message = specific ? state.error.message : 'Tu cuenta no tiene permiso para consultar esta sección.';
      return <div className={`section-state-info${compact ? ' is-compact' : ''}`} role="status">
        <Icon name="lock" size={compact ? 16 : 20} />
        <div><strong>No tienes acceso a esta información</strong><span>{message}</span>{!compact && <span>Si la necesitas para tu trabajo, pide a un administrador que revise los permisos de tu cuenta.</span>}</div>
      </div>;
    }
    return <div className={`section-state-error${compact ? ' is-compact' : ''}`} role="alert">
      <Icon name="alert" size={compact ? 16 : 20} />
      <div><strong>No pudimos cargar esta información</strong><span>{state.error.message}</span></div>
      <button type="button" className={compact ? 'row-action' : 'secondary-button'} onClick={state.refresh}><Icon name="retry" size={compact ? 16 : 18} />Volver a intentar</button>
    </div>;
  }
  if (!state.data) return null;
  const message = empty?.(state.data);
  if (message) return <p className="section-empty" role="status">{message}</p>;
  // Background revalidation: a thin line that does not push the content; the text is for screen readers.
  return <>{state.loading && <span className="refresh-line" role="status" aria-live="polite"><span className="sr-only">Actualizando información…</span></span>}{children(state.data)}</>;
}

export type BlockedAction = { action: string; reason: string };
/**
 * R1 (S4): one action from the server's `allowedActions` / `blockedActions`; the server stays the authority.
 * Allowed: a button. Blocked: nothing, because the reason is not content. Only with `showBlocked` (the action is the
 * row's next step and seeing it helps) it stays visible, `aria-disabled` and focusable, with the reason as a tooltip
 * tied by `aria-describedby`. Never as body text.
 */
export function ActionButton({ action, allowed, blocked = [], showBlocked = false, className = 'row-action', onClick, children, ...button }: { action: string; allowed: readonly string[]; blocked?: readonly BlockedAction[]; showBlocked?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const tipId = useId();
  if (allowed.includes(action)) return <button type="button" className={className} onClick={onClick} {...button}>{children}</button>;
  const reason = blocked.find(item => item.action === action)?.reason;
  if (!showBlocked || !reason) return null;
  return <span className="action-blocked">
    <button type="button" className={className} aria-disabled="true" aria-describedby={tipId} {...button} onClick={event => event.preventDefault()}>{children}</button>
    <span id={tipId} role="tooltip" className="action-tooltip">{reason}</span>
  </span>;
}

// ---------------------------------------------------------------- Áreas (S7)

export type AreaCode = 'EMG' | 'CON' | 'LAB' | 'HOS' | 'REC' | 'AMB' | 'GEN';
/** Seis tonos de área más un neutro. El rojo es del acento crítico y nunca es color de área. */
export const AREAS: { code: AreaCode; name: string; token: string }[] = [
  { code: 'EMG', name: 'Emergencia', token: 'emg' },
  { code: 'CON', name: 'Consulta general', token: 'con' },
  { code: 'LAB', name: 'Laboratorio', token: 'lab' },
  { code: 'HOS', name: 'Hospitalización', token: 'hos' },
  { code: 'REC', name: 'Recepción y admisión', token: 'rec' },
  { code: 'AMB', name: 'Ambulancia', token: 'amb' },
  { code: 'GEN', name: 'General', token: 'gen' },
];
/** Códigos de espacio del edificio (`P1-EMG`, `P3-VIP`, ...) que comparten el tono de otra área. */
const AREA_ALIASES: Record<string, AreaCode> = { ESP: 'REC', VIP: 'HOS', BOD: 'GEN' };
/** Área de un código de espacio o de área (`P1-EMG` → `EMG`); lo desconocido cae en el neutro. */
const NUMBERED_PREFIXES: Record<string, AreaCode> = { C: 'CON', E: 'EMG', HAB: 'HOS' };
export function areaOf(code: string | null | undefined): AreaCode {
  const parts = (code ?? '').toUpperCase().split('-').map(p => p.trim());
  // A real area code wins over an alias (02-sistema §1): `BOD-LAB` is LAB, `BOD-CEN` falls back to the BOD alias (GEN).
  const area = parts.find(p => AREAS.some(a => a.code === p));
  if (area) return area as AreaCode;
  // Numbered building codes take the area of their prefix: consulting rooms `C-101` (CON), emergency cubicles `E-01`
  // (EMG) and rooms and beds `HAB-201`, `HAB-201-A` (HOS). Only a number after the prefix counts.
  const numbered = NUMBERED_PREFIXES[parts[0]];
  if (numbered && /^\d+$/.test(parts[1] ?? '')) return numbered;
  const alias = parts.find(p => p in AREA_ALIASES);
  return (alias ? AREA_ALIASES[alias] : 'GEN') as AreaCode;
}
export function AreaTag({ code, showName = false }: { code: string; showName?: boolean }) {
  const area = AREAS.find(a => a.code === areaOf(code))!;
  if (showName) return <span className={`area-tag area-${area.token}`}><span className="area-code" aria-hidden="true">{area.code}</span><span>{area.name}</span></span>;
  return <span className={`area-tag area-${area.token}`} role="img" aria-label={`Área ${area.name}`} title={area.name}><span className="area-code" aria-hidden="true">{area.code}</span></span>;
}

// ---------------------------------------------------------------- Estados (S7)

export type StatusFamilyId = 'espera' | 'llamado' | 'atencion' | 'listo' | 'cerrado' | 'critico';
/** Cada familia: un ícono y un patrón propios, distinguibles en escala de grises (rayas, puntos, sólido, contorno, discontinuo, doble). */
export const STATUS_FAMILIES: { id: StatusFamilyId; label: string; icon: IconName; pattern: string }[] = [
  { id: 'espera', label: 'En espera', icon: 'clock', pattern: 'rayado' },
  { id: 'llamado', label: 'Llamado', icon: 'megaphone', pattern: 'punteado' },
  { id: 'atencion', label: 'En atención o en uso', icon: 'pulse', pattern: 'solido' },
  { id: 'listo', label: 'Terminado o disponible', icon: 'check', pattern: 'contorno' },
  { id: 'cerrado', label: 'Cancelado o fuera de servicio', icon: 'close', pattern: 'discontinuo' },
  { id: 'critico', label: 'Crítico', icon: 'alert', pattern: 'doble' },
];
const familyOfValue: Record<string, StatusFamilyId> = {
  // R1 (shared with iOS and Android): a confirmed or rescheduled appointment waits for its time, and stock below the
  // minimum waits for a restock; none of them is being called.
  en_espera: 'espera', solicitada: 'espera', pendiente: 'espera', pendiente_cama: 'espera', borrador: 'espera', publicado: 'espera', reservada: 'espera', provisional: 'espera', por_vencer: 'espera', revisar: 'espera', confirmada: 'espera', reprogramada: 'espera', bajo_minimo: 'espera',
  // R4a (coordinator): only a call is «llamado»; a lab order in process is being worked on (atención).
  llamado: 'llamado',
  // R1: a bed being cleaned is in use; a metric that asks for attention (metrics.tsx) is an attention state.
  en_atencion: 'atencion', en_proceso: 'atencion', en_curso: 'atencion', ocupada: 'atencion', hospitalizado: 'atencion', en_servicio: 'atencion', abierta: 'atencion', limpieza: 'atencion', requiere_atencion: 'atencion',
  atendida: 'listo', atendido: 'listo', completado: 'listo', firmada: 'listo', alta_firmada: 'listo', egresado: 'listo', libre: 'listo', disponible: 'listo', activo: 'listo', exito: 'listo', normal: 'listo', aprobada: 'listo', ok: 'listo', coincide: 'listo',
  cancelado: 'cerrado', cancelada: 'cerrado', no_asistio: 'cerrado', no_se_presento: 'cerrado', cerrado: 'cerrado', rechazada: 'cerrado', vencida: 'cerrado', bloqueada: 'cerrado', inactivo: 'cerrado', desactivado: 'cerrado', denegado: 'cerrado', fallido: 'cerrado', en_mantenimiento: 'cerrado',
  critico_alto: 'critico', critico_bajo: 'critico',
};
/**
 * R1: values that ask for attention without being a step of a flow. They show as urgent priority (amber, double
 * chevron): a lab value out of range that is not critical, and stock that ran out or expired. Red stays for critical.
 */
const priorityOfValue: Record<string, Priority> = { alto: 'urgente', bajo: 'urgente', agotado: 'urgente', vencido: 'urgente' };
export const statusFamily = (value: string): StatusFamilyId | null => familyOfValue[value] ?? null;
export const statusPriority = (value: string): Priority | null => priorityOfValue[value] ?? null;
export const statusNames: Record<string, string> = { activo: 'Activo', inactivo: 'Inactivo', provisional: 'Provisional', libre: 'Libre', ocupada: 'Ocupada', reservada: 'Reservada', limpieza: 'En limpieza', bloqueada: 'Bloqueada', borrador: 'Borrador', publicado: 'Pendiente de iniciar', pendiente: 'Pendiente de iniciar', en_curso: 'En curso', completado: 'Completado', cancelado: 'Cancelado', cancelada: 'Cancelada', solicitada: 'Solicitada', confirmada: 'Confirmada', atendida: 'Atendida', atendido: 'Atendido', firmada: 'Firmada', rechazada: 'Rechazada', no_asistio: 'No asistió', vencida: 'Vencida', reprogramada: 'Reprogramada', cerrado: 'Cerrado sin atender', desactivado: 'Desactivado', pendiente_cama: 'Pendiente de cama', hospitalizado: 'Hospitalizado', alta_firmada: 'Alta firmada', egresado: 'Egresado', exito: 'Correcto', denegado: 'Denegado', fallido: 'Fallido', en_espera: 'En espera', llamado: 'Llamado', en_atencion: 'En atención', no_se_presento: 'No se presentó', en_proceso: 'En proceso', abierta: 'Abierta', bajo_minimo: 'Bajo mínimo', vencido: 'Vencido', normal: 'Normal', alto: 'Alto', bajo: 'Bajo', critico_alto: 'Crítico alto', critico_bajo: 'Crítico bajo', sin_rango: 'Sin rango', disponible: 'Disponible', en_servicio: 'En servicio', en_mantenimiento: 'En mantenimiento', agotado: 'Agotado', por_vencer: 'Por vencer', ok: 'En orden', coincide: 'Coincide', revisar: 'Revisar', requiere_atencion: 'Requiere atención' };

/**
 * Estado con ícono + etiqueta + patrón. Conserva las clases `status-tag status-<valor>` para las vistas que ya las usan.
 * Un valor que pide atención (`alto`, `agotado`) usa la prioridad urgente; uno sin familia (`sin_rango`) se muestra
 * neutro, con un punto y su texto.
 */
export function StatusBadge({ value, label }: { value: string; label?: string }) {
  // A priority passed as a status («urgente» on a lab order in Inicio) wears the priority badge, the same as the lab
  // page and the «Urgentes» filter, never a neutral grey tag with a dot.
  if (value === 'urgente' || value === 'emergencia') return <PriorityBadge value={value} label={label} />;
  const family = STATUS_FAMILIES.find(f => f.id === statusFamily(value));
  const text = label ?? statusNames[value] ?? value.replace(/_/g, ' ');
  const priority = PRIORITIES.find(p => p.id === statusPriority(value));
  if (priority) return <span className={`status-badge status-tag status-${value} priority-${priority.id}`}><Icon name={priority.icon} size={14} /><span>{text}</span></span>;
  if (!family) return <span className={`status-badge status-tag status-${value} status-neutral`}><span className="status-dot" aria-hidden="true" /><span>{text}</span></span>;
  return <span className={`status-badge status-tag status-${value} fam-${family.id} pattern-${family.pattern}`}><Icon name={family.icon} size={14} /><span>{text}</span></span>;
}

/**
 * R4a (owner): a filter that narrows by a status wears that status's look, so the button and the badge it filters
 * read as the same thing. `status` is a status value (`pendiente`, `critico_alto`), a family id (`espera`) or a
 * priority (`urgente`, `emergencia`). Unknown values and «Rutina» stay neutral (null). The label always stays.
 */
export function statusFilterLook(status: string | undefined): { className: string; icon: IconName } | null {
  if (!status) return null;
  const priority = PRIORITIES.find(p => p.id === status) ?? PRIORITIES.find(p => p.id === statusPriority(status));
  if (priority) return priority.id === 'rutina' ? null : { className: `status-filter sf-prio-${priority.id}`, icon: priority.icon };
  const family = STATUS_FAMILIES.find(f => f.id === status) ?? STATUS_FAMILIES.find(f => f.id === statusFamily(status));
  return family ? { className: `status-filter sf-fam-${family.id} sf-pattern-${family.pattern}`, icon: family.icon } : null;
}

// ---------------------------------------------------------------- Prioridad (S7)

export type Priority = 'emergencia' | 'urgente' | 'rutina';
export const PRIORITIES: { id: Priority; label: string; icon: IconName }[] = [
  { id: 'emergencia', label: 'Emergencia', icon: 'alert' },
  { id: 'urgente', label: 'Urgente', icon: 'chevronsUp' },
  { id: 'rutina', label: 'Rutina', icon: 'minus' },
];
/** El rojo (`--critical`) es solo de emergencia y de valores críticos. */
export function PriorityBadge({ value, label }: { value: Priority; label?: string }) {
  const p = PRIORITIES.find(x => x.id === value) ?? PRIORITIES[2];
  return <span className={`priority-badge priority-${p.id}`}><Icon name={p.icon} size={14} /><span>{label ?? p.label}</span></span>;
}

/** Leyenda con exactamente las mismas piezas que las tarjetas y los filtros. */
export function StatusLegend({ areas = true, statuses = true, priorities = true }: { areas?: boolean; statuses?: boolean; priorities?: boolean }) {
  const sample: Record<StatusFamilyId, string> = { espera: 'en_espera', llamado: 'llamado', atencion: 'en_atencion', listo: 'completado', cerrado: 'cancelado', critico: 'critico_alto' };
  return <div className="status-legend" aria-label="Leyenda de colores y estados" role="group">
    {areas && <div><span className="legend-title">Áreas</span><ul>{AREAS.map(a => <li key={a.code}><AreaTag code={a.code} showName /></li>)}</ul></div>}
    {statuses && <div><span className="legend-title">Estados</span><ul>{STATUS_FAMILIES.map(f => <li key={f.id}><StatusBadge value={sample[f.id]} label={f.label} /></li>)}</ul></div>}
    {priorities && <div><span className="legend-title">Prioridad</span><ul>{PRIORITIES.map(p => <li key={p.id}><PriorityBadge value={p.id} /></li>)}</ul></div>}
  </div>;
}
