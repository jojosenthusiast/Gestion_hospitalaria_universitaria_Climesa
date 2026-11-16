import type { CSSProperties } from 'react';
import { roleNames } from '../../lib/api';
import type { AreaGap } from './AreaCoverageAlert';
import { HOUR, KIND_LABEL, localDay, localTime, type ShiftRow } from './rules';
import { SHIFT_STATES, dayHeading, daySegments, displayState, stateName, unionSegments, type WeekDay } from './week';

/** Carriles visibles por día; si hay más turnos a la vez, se ofrece verlos en la lista del día. */
export const MAX_LANES = 4;
const DAY = 24 * HOUR;
const HOURS = [0, 6, 12, 18];

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

type Props = {
  days: WeekDay[]; today: string; now: number; shifts: ShiftRow[]; gaps: AreaGap[];
  onOpen: (shift: ShiftRow) => void; onShowDay: (date: string) => void;
};

/**
 * Semana de lunes a domingo con un bloque por turno, ubicado por su hora y coloreado por su estado. Una guardia de
 * 24 h o una noche se ve en los dos días que toca. Los huecos de cobertura (`GET /turnos/cobertura`) se dibujan como
 * bandas en su día y hora. En pantallas angostas cada día es una fila con la hora de izquierda a derecha.
 */
export function ShiftWeek({ days, today, now, shifts, gaps, onOpen, onShowDay }: Props) {
  const range = (t: ShiftRow): [number, number] => [Date.parse(t.start), Date.parse(t.end)];
  const gapRange = (g: AreaGap): [number, number] => [Date.parse(g.start), Date.parse(g.end)];
  return <div className="shift-week" role="presentation">
    <div className="shift-week-hours" aria-hidden="true">{HOURS.map(h => <span key={h} style={{ '--at': h / 24 } as CSSProperties}>{String(h).padStart(2, '0')}:00</span>)}</div>
    {days.map(day => {
      const heading = dayHeading(day.date, today);
      const name = `${heading.relative ? `${heading.relative}, ` : ''}${heading.label}`;
      const segments = daySegments(shifts, range, day);
      const visible = segments.filter(s => s.lane < MAX_LANES);
      const hidden = segments.length - visible.length;
      const rows = Math.max(1, ...visible.map(s => Math.min(s.lanes, MAX_LANES)));
      const bands = unionSegments(gaps, gapRange, day);
      const isToday = day.date === today;
      return <section key={day.date} className={`shift-week-day${isToday ? ' is-today' : ''}`} role="group" aria-label={name}>
        <header className="shift-week-head">
          <span className="shift-week-weekday">{heading.relative ? `${heading.relative} · ${heading.weekday}` : heading.weekday}</span>
          <strong className="shift-week-date">{heading.dayNumber}</strong>

          {hidden > 0 && <button type="button" className="shift-week-more" onClick={() => onShowDay(day.date)}>{hidden === 1 ? '1 turno más' : `${hidden} turnos más`}</button>}
        </header>
        <div className="shift-week-track" style={{ '--rows': rows } as CSSProperties}>
          {bands.map(b => {
            const from = localTime(day.start + b.offset * DAY), to = b.offset + b.length >= 1 ? '24:00' : localTime(day.start + (b.offset + b.length) * DAY);
            const detail = b.items.map(g => `${g.area} · ${roleNames[g.role] ?? g.role} (${g.actual} de ${g.required})`).join('; ');
            return <span key={b.offset} className="shift-gap" role="img" aria-label={`Hueco de cobertura de ${from} a ${to}: ${detail}`} title={`Hueco de cobertura de ${from} a ${to}: ${detail}`}
              style={{ '--from': b.offset, '--len': b.length } as CSSProperties}><span className="shift-gap-label">Hueco</span></span>;
          })}
          {isToday && now >= day.start && now < day.end && <span className="shift-week-now" aria-hidden="true" style={{ '--from': (now - day.start) / DAY } as CSSProperties} />}
          {visible.map(s => {
            const t = s.item, state = displayState(t, now);
            const lanes = Math.min(s.lanes, MAX_LANES);
            return <button key={t.id} type="button" className={`shift-block is-${state}${s.startsBefore ? ' starts-before' : ''}${s.endsAfter ? ' ends-after' : ''}${t.type === 'guardia' ? ' is-guard' : ''}`}
              aria-label={shiftLabel(t, state)} onClick={() => onOpen(t)}
              style={{ '--from': s.offset, '--len': s.length, '--lane': s.lane, '--lanes': lanes } as CSSProperties}>
              <span className="shift-block-time">{s.startsBefore ? 'viene de ayer' : localTime(Date.parse(t.start))}{s.endsAfter ? ' · sigue mañana' : ` a ${localTime(Date.parse(t.end))}`}</span>
              <span className="shift-block-who">{t.person}</span>
              <span className="shift-block-area">{t.area}</span>
            </button>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
