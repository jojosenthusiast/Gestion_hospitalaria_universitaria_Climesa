import { roleIdentity } from '../../components/identity';
import { Icon } from '../../components/ui';
import { roleNames } from '../../lib/api';
import type { AreaGap } from './AreaCoverageAlert';
import { BANDS, summarizeDay, type RoleCount } from './bands';
import { KIND_LABEL, localDay, localTime, type ShiftRow } from './rules';
import { SHIFT_STATES, dayHeading, stateName, unionSegments, type WeekDay } from './week';

/** `07:00 a 15:00`, o `07:00 a 07:00 del día siguiente` para una noche o una guardia de 24 h. */
export function timeRange(start: string, end: string): string {
  const a = Date.parse(start), b = Date.parse(end);
  return `${localTime(a)} a ${localTime(b)}${localDay(b - 1) !== localDay(a) ? ' del día siguiente' : ''}`;
}

/** Nombre accesible de un turno: persona, área, horario, tipo y estado. */
export const shiftLabel = (t: ShiftRow, state: string) => `${t.person}, ${t.area}, ${timeRange(t.start, t.end)}, ${KIND_LABEL[t.type] ?? t.type}, ${stateName(state)}`;

export function StateLegend() {
  return <ul className="shift-legend" aria-label="Estados del turno">
    {SHIFT_STATES.map(([code, name]) => <li key={code}><span className={`shift-swatch is-${code}`} aria-hidden="true" />{name}</li>)}
  </ul>;
}

/** Planificación en el calendario: crear en una hora, mover y estirar bloques. La API valida cada cambio. */
export type CalendarPlanning = {
  /** Crear un turno ese día; con horario cuando se eligió una hora. */
  onCreate: (date: string, start?: number, end?: number) => void;
  /** Nuevo horario de un turno movido o estirado (con el ratón o con Alt + flechas). */
  onMove: (shift: ShiftRow, start: string, end: string) => void;
  /** Solo se mueven los turnos que la API deja editar ahora (`allowedActions` y el reloj). */
  canMove: (shift: ShiftRow) => boolean;
};

const DAY_MS = 24 * 3_600_000;
const roleCounts = (roles: RoleCount[]) => roles.map(r => `${roleIdentity(r.role).label} ${r.count}`).join(' · ');
const MAX_GAP_LINES = 3;

/**
 * Semana para LEER con muchos turnos (30 o más por día): cada día dice cuántos turnos empiezan en cada franja (mañana,
 * tarde, noche, guardia) y de qué rol, cuántos vienen del día anterior y en qué horas hay huecos de cobertura (RN-15).
 * Los nombres y el horario de cada turno están en la vista Día, que se abre desde cada día.
 */
export function WeekSummary({ days, today, shifts, gaps, typeOf, onOpenDay, onCreate }: {
  days: WeekDay[]; today: string; shifts: ShiftRow[]; gaps: AreaGap[];
  typeOf: (t: ShiftRow) => string | undefined; onOpenDay: (date: string) => void; onCreate?: (date: string) => void;
}) {
  return <div className="shift-summary-week">
    {days.map(day => {
      const heading = dayHeading(day.date, today);
      const name = `${heading.relative ? `${heading.relative}, ` : ''}${heading.label}`;
      const summary = summarizeDay(shifts, day, typeOf);
      const holes = unionSegments(gaps, g => [Date.parse(g.start), Date.parse(g.end)], day);
      const isToday = day.date === today;
      return <section key={day.date} className={`shift-summary-day${isToday ? ' is-today' : ''}`} role="group" aria-label={name}>
        <header className="shift-summary-head">
          <button type="button" className="shift-summary-open" onClick={() => onOpenDay(day.date)} aria-label={`Ver el día ${name}`}>
            <span className="shift-summary-weekday">{heading.relative ? `${heading.relative} · ${heading.weekday}` : heading.weekday}</span>
            <strong className="shift-summary-date">{heading.dayNumber}</strong>
            <span className="shift-summary-cta">Ver el día<Icon name="arrow" size={14} /></span>
          </button>
          {onCreate && <button type="button" className="shift-week-add" aria-label={`Asignar turno el ${heading.label}`} title="Asignar turno este día" onClick={() => onCreate(day.date)}><Icon name="plus" size={16} /></button>}
        </header>
        <p className="shift-summary-total">{summary.total === 1 ? '1 turno' : `${summary.total} turnos`}{summary.drafts > 0 && <span className="shift-summary-drafts"> · {summary.drafts === 1 ? '1 borrador' : `${summary.drafts} borradores`}</span>}</p>
        {summary.carried > 0 && <p className="shift-summary-carried" title={roleCounts(summary.carriedRoles)}>{summary.carried === 1 ? '1 viene de ayer' : `${summary.carried} vienen de ayer`}</p>}
        {summary.bands.length > 0 && <ul className="shift-bands" aria-label="Turnos por franja">
          {summary.bands.map(b => { const band = BANDS.find(x => x.id === b.band)!; return <li key={b.band} className={`shift-band is-${b.band}`}>
            <span className="shift-band-name" title={band.hours}>{band.name}</span><strong className="shift-band-count">{b.count}</strong>
            <span className="shift-band-roles">{roleCounts(b.roles)}</span>
          </li>; })}
        </ul>}
        {holes.length > 0 && <ul className="shift-summary-gaps" aria-label="Huecos de cobertura">
          {holes.slice(0, MAX_GAP_LINES).map(h => {
            const from = localTime(day.start + h.offset * DAY_MS), to = h.offset + h.length >= 1 ? '24:00' : localTime(day.start + (h.offset + h.length) * DAY_MS);
            const detail = h.items.map(g => `${g.area} · ${roleNames[g.role] ?? g.role} (${g.actual} de ${g.required})`).join('; ');
            return <li key={h.offset} role="img" aria-label={`Hueco de cobertura de ${from} a ${to}: ${detail}`} title={detail}><span className="shift-gap-tag">Hueco</span> {from}–{to}</li>;
          })}
          {holes.length > MAX_GAP_LINES && <li className="shift-summary-more">y {holes.length - MAX_GAP_LINES} más</li>}
        </ul>}
        {summary.total === 0 && summary.carried === 0 && <p className="shift-summary-empty">Sin turnos</p>}
      </section>;
    })}
  </div>;
}
