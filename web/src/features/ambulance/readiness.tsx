import type { ReactNode } from 'react';
import { Icon } from '../../components/ui';
import type { Api } from '../../lib/api';
import { formatShortDateTime, formatTime } from '../../lib/format';
import { useData } from '../common';
import type { AmbulanceStatus } from './types';

/**
 * Lote 5 S8: «lo de no se puede despachar deberia aparecer con mas importancia». The blocker as the API computed it
 * (RN-29, RN-30), with its tone: a warning when it ends by itself (the unit is on a service), danger when someone must act.
 * Same rules as Android `AmbulanceReadiness.blocker`.
 */
export type BlockTone = 'warning' | 'danger';
export const blockTone = (s: AmbulanceStatus): BlockTone => (s.dispatchBlock?.code === 'en_servicio' ? 'warning' : 'danger');
const FALLBACK: Record<string, string> = {
  en_servicio: 'La unidad está atendiendo un servicio.', en_mantenimiento: 'La unidad está en mantenimiento.',
  sin_paramedico_de_turno: 'No hay paramédico con turno en curso.', sin_motorista_de_turno: 'No hay motorista con turno en curso.',
  sin_tripulacion_de_turno: 'No hay paramédico ni motorista con turno en curso.',
};
export const blockMessage = (s: AmbulanceStatus) => s.dispatchBlock ? (s.dispatchBlock.message?.trim() || FALLBACK[s.dispatchBlock.code] || 'La unidad no está disponible.') : '';

/** One line of the readiness checklist: ready, missing (someone must act) or busy (on a service). */
export type ReadinessState = 'ok' | 'missing' | 'busy';
export const READINESS_ICON: Record<ReadinessState, 'check' | 'alert' | 'clock'> = { ok: 'check', missing: 'alert', busy: 'clock' };
export const READINESS_LABEL: Record<ReadinessState, string> = { ok: 'Listo', missing: 'Falta', busy: 'Ocupado' };

/** «Sin servicio activo» only when the API says so: no `activeService` and a unit that is not `en_servicio`. */
export const noActiveService = (s: AmbulanceStatus) => !s.activeService && s.unit.state !== 'en_servicio';

/** A checklist line: icon and colour carry the state, the text says it, so colour is never alone. */
export function ReadinessItem({ state, label, value }: { state: ReadinessState; label: string; value: string }) {
  return <div role="listitem" className={`amb-ready is-${state}`}>
    <Icon name={READINESS_ICON[state]} size={16} />
    <span>{label}<span className="sr-only">: {READINESS_LABEL[state]}</span></span><strong>{value}</strong>
  </div>;
}

/** The blocker strip: a full tinted band with a heading, the reason and, for who dispatches, what to do. */
export function DispatchBlockStrip({ status, action, children }: { status: AmbulanceStatus; action?: string; children?: ReactNode }) {
  if (!status.dispatchBlock) return null;
  const tone = blockTone(status);
  return <section className={`amb-unit-block is-${tone}`} aria-label="Despacho bloqueado">
    <p><Icon name="alert" size={22} /><span><strong className="amb-block-title">No se puede despachar.</strong> {blockMessage(status)}{action ? <> {action}</> : null}</span></p>
    {children}
  </section>;
}

/** `GET /ambulancia/cobertura?dias=7` (Lote 5 S8): hours of the coming days without a paramedic and a driver on shift. */
export type CrewCoverageReport = {
  from: string; to: string; hoursWithoutCrew: number; covered: boolean;
  days?: { date: string; hoursWithoutCrew: number }[];
  gaps?: { date: string; hours: number; start: string; end: string; missing: 'paramedico' | 'motorista' | 'tripulacion' }[];
};
export const COVERAGE_PATH = '/ambulancia/cobertura?dias=7';
const MISSING: Record<string, string> = { paramedico: 'falta paramédico', motorista: 'falta motorista', tripulacion: 'falta la tripulación' };

/**
 * «Faltan turnos de ambulancia: 14 h sin tripulación completa en 2 de los próximos 7 días. Primer hueco: Mañana 22:00 a 06:00,
 * falta motorista.» Null when every hour is covered or the answer is not a report (same text as Android).
 */
export function coverageWarning(c: CrewCoverageReport | null | undefined, now: Date = new Date()) {
  if (!c || typeof c.hoursWithoutCrew !== 'number' || c.covered || c.hoursWithoutCrew <= 0) return null;
  const days = c.days?.length || 7, withGaps = (c.days ?? []).filter(d => d.hoursWithoutCrew > 0).length;
  const span = withGaps > 0 ? ` en ${withGaps} de los próximos ${days} días` : ` en los próximos ${days} días`;
  const first = [...(c.gaps ?? [])].sort((a, b) => a.start.localeCompare(b.start))[0];
  const gap = first ? ` Primer hueco: ${formatShortDateTime(first.start, now)} a ${formatTime(first.end)}, ${MISSING[first.missing] ?? MISSING.tripulacion}.` : '';
  return `Faltan turnos de ambulancia: ${c.hoursWithoutCrew} h sin tripulación completa${span}.${gap}`;
}

/** Informative only (publishing shifts is never blocked on it). An API without the endpoint (404) or any failure shows nothing. */
export function CrewCoverageWarning({ api, version }: { api: Api; version: number }) {
  const coverage = useData<CrewCoverageReport>(api, COVERAGE_PATH, version);
  const text = coverage.error ? null : coverageWarning(coverage.data);
  if (!text) return null;
  return <p className="amb-coverage" role="status"><Icon name="calendar" size={18} /><span>{text}</span></p>;
}
