import { Notice } from '../../components/ui';
import { roleNames, type Api } from '../../lib/api';
import { useData } from '../common';
import { HOUR, localDay, localTime } from './rules';

/** Hueco de cobertura de `GET /turnos/cobertura`: un área con menos personal de un rol que el mínimo vigente (RN-15). */
export type AreaGap = { areaId: string; area: string; role: string; start: string; end: string; required: number; actual: number };
export type CoverageWeek = { from: string; to: string; gaps: AreaGap[] };
export const AREA_COVERAGE_DAYS = 7;
const SHOWN = 6;

const dayLabel = (ms: number) => new Intl.DateTimeFormat('es-SV', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/El_Salvador' }).format(new Date(ms));
const span = (g: AreaGap) => {
  const from = Date.parse(g.start), to = Date.parse(g.end);
  return localDay(from) === localDay(to - 1) ? `${dayLabel(from)} ${localTime(from)}–${localTime(to)}` : `${dayLabel(from)} ${localTime(from)} a ${dayLabel(to)} ${localTime(to)}`;
};

/** Huecos que todavía importan: los que terminan después de `now`, del más próximo al más lejano. */
export const upcomingGaps = (gaps: AreaGap[], now: Date) => gaps.filter(g => Date.parse(g.end) > now.valueOf()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.area.localeCompare(b.area, 'es'));

/**
 * MA-REQ-02 (RN-15): huecos de cobertura por área y rol de los próximos 7 días, según la política `turnos.cobertura_minima`.
 * Es el cliente de `GET /turnos/cobertura`; se actualiza en vivo con los eventos de turnos y personal.
 */
export function AreaCoverageAlert({ api, version, now, onPlan }: { api: Api; version: number; now: Date; onPlan?: () => void }) {
  const from = localDay(now.valueOf()), to = localDay(now.valueOf() + (AREA_COVERAGE_DAYS - 1) * 24 * HOUR);
  const week = useData<CoverageWeek>(api, `/turnos/cobertura?from=${from}&to=${to}`, version);
  if (week.error?.status === 403) return null;
  const retry = <button type="button" className="secondary-button" onClick={week.refresh}>Volver a intentar</button>;
  if (week.error) return <Notice kind="error">No pudimos revisar la cobertura mínima de los próximos {AREA_COVERAGE_DAYS} días: {week.error.message} {retry}</Notice>;
  if (week.data === undefined || week.data === null) return null;
  const list = week.data.gaps;
  // A 200 without the gap list is a broken answer, not "no gaps": say so instead of hiding the alert.
  if (!Array.isArray(list)) return <Notice kind="error">No pudimos revisar la cobertura mínima de los próximos {AREA_COVERAGE_DAYS} días: la respuesta llegó incompleta. {retry}</Notice>;
  const gaps = upcomingGaps(list, now);
  if (!gaps.length) return null;
  const shown = gaps.slice(0, SHOWN);
  return <section className="crew-coverage" aria-label="Cobertura mínima por área">
    <Notice kind="info"><strong>{gaps.length === 1 ? 'Un tramo' : `${gaps.length} tramos`} de los próximos {AREA_COVERAGE_DAYS} días con menos personal que el mínimo.</strong> Cada área necesita el personal que fija la política de cobertura mínima (RN-15).</Notice>
    <ul className="crew-coverage-list">{shown.map(g => <li key={`${g.areaId}-${g.role}-${g.start}`}><strong>{g.area} · {roleNames[g.role] ?? g.role}</strong> · {span(g)} · {g.actual} de {g.required}</li>)}</ul>
    {gaps.length > shown.length && <p className="crew-coverage-more">y {gaps.length - shown.length} tramos más.</p>}
    {onPlan ? <button type="button" className="secondary-button" onClick={onPlan}>Asignar un turno para cubrirlo</button> : <p className="crew-coverage-more">Avisa a la Jefatura de Operaciones para que asigne los turnos que faltan.</p>}
  </section>;
}
