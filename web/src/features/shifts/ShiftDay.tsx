import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { AreaChip, RoleChip } from '../../components/identity';
import { roleNames } from '../../lib/api';
import type { AreaGap } from './AreaCoverageAlert';
import { BANDS, bandOf, hourlyLoad, type Band } from './bands';
import { HOUR, localTime, type ShiftRow } from './rules';
import { shiftLabel, type CalendarPlanning } from './ShiftWeek';
import { daySegments, displayState, type Segment, type WeekDay } from './week';
import { SNAP_MINUTES, dragResult } from './plan';

const DAY = 24 * HOUR;
const AXIS = [0, 3, 6, 9, 12, 15, 18, 21];
/** A pointer move shorter than this is a click (opens the shift). */
const DRAG_THRESHOLD = 4;
type Drag = { id: string; mode: 'move' | 'stretch'; x: number; dx: number; width: number };
type Group = { id: Band | 'ayer'; name: string; rows: Segment<ShiftRow>[] };

const range = (t: ShiftRow): [number, number] => [Date.parse(t.start), Date.parse(t.end)];
const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * Vista Día: un renglón por turno con el nombre completo, rol, área y su barra en las 24 h, agrupados por franja
 * (vienen de ayer, mañana, tarde, noche, guardia). Arriba, la franja de cobertura: por cada hora, cuántas personas hay
 * de turno (mínimo y máximo dentro de la hora) y si falta personal según la cobertura mínima (RN-15, «Hueco»).
 * Una noche o una guardia que sigue al día siguiente dice «sigue mañana»; la que llega del día anterior, «viene de ayer».
 * Con `planning`: arrastrar una barra la mueve, su borde derecho la estira, y Alt + flechas hace lo mismo con el teclado.
 */
export function ShiftDay({ day, label, now, shifts, gaps, typeOf, onOpen, planning, highlight }: {
  day: WeekDay; label: string; now: number; shifts: ShiftRow[]; gaps: AreaGap[];
  typeOf: (t: ShiftRow) => string | undefined; onOpen: (t: ShiftRow) => void; planning?: CalendarPlanning; highlight?: string | null;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragged = useRef(false);
  const segments = daySegments(shifts, range, day).sort((a, b) => a.from - b.from || a.item.person.localeCompare(b.item.person, 'es'));
  const groups: Group[] = [
    { id: 'ayer', name: 'Vienen de ayer', rows: segments.filter(s => s.startsBefore) },
    ...BANDS.map(b => ({ id: b.id, name: b.name, rows: segments.filter(s => !s.startsBefore && bandOf(s.item) === b.id) })),
  ].filter(g => g.rows.length > 0);
  const hours = hourlyLoad(shifts, gaps, day);
  const nowAt = now >= day.start && now < day.end ? (now - day.start) / DAY : null;

  const startDrag = (event: PointerEvent<HTMLElement>, t: ShiftRow, mode: Drag['mode']) => {
    if (!planning?.canMove(t) || event.button !== 0) return;
    const track = (event.currentTarget.closest('.shift-day-track') as HTMLElement | null)?.getBoundingClientRect();
    if (!track) return;
    event.stopPropagation();
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: t.id, mode, x: event.clientX, dx: 0, width: track.width });
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > DRAG_THRESHOLD) dragged.current = true;
    setDrag({ ...drag, dx });
  };
  const endDrag = (t: ShiftRow) => {
    if (!drag) return;
    const minutes = (drag.dx / (drag.width || 1)) * 24 * 60;
    setDrag(null);
    if (!dragged.current) return;
    const next = dragResult(t, drag.mode, minutes);
    if (next.start !== t.start || next.end !== t.end) planning?.onMove(t, next.start, next.end);
  };
  /** Alt + ↑/↓ moves 30 min, Alt + Shift + ↑/↓ stretches or shortens the end, Alt + ←/→ moves it to another day. */
  const keyMove = (event: KeyboardEvent<HTMLButtonElement>, t: ShiftRow) => {
    if (!event.altKey || !planning?.canMove(t)) return;
    const step: Record<string, number> = { ArrowUp: -SNAP_MINUTES, ArrowDown: SNAP_MINUTES };
    const days: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    let next: { start: string; end: string } | null = null;
    if (event.key in step) next = dragResult(t, event.shiftKey ? 'stretch' : 'move', step[event.key]);
    else if (event.key in days) next = dragResult(t, 'move', 0, days[event.key]);
    if (!next) return;
    event.preventDefault();
    planning.onMove(t, next.start, next.end);
  };

  return <div className="shift-day" role="group" aria-label={label}>
    <section className="shift-load" aria-label="Personas de turno por hora">
      <header className="shift-load-head">
        <h3>Personas de turno por hora</h3>
        <p className="muted">Mínimo y máximo dentro de cada hora. <span className="shift-gap-tag">Hueco</span> falta personal según la cobertura mínima (RN-15).</p>
      </header>
      <ol className="shift-load-hours">
        {hours.map(h => {
          const people = h.min === h.max ? `${h.max}` : `${h.min}–${h.max}`;
          const detail = h.gaps.map(g => `${g.area} · ${roleNames[g.role] ?? g.role} (${g.actual} de ${g.required})`).join('; ');
          const name = `${hh(h.hour)}: ${h.min === h.max ? `${h.max} ${h.max === 1 ? 'persona' : 'personas'}` : `entre ${h.min} y ${h.max} personas`}${h.gaps.length ? `. Hueco, ${h.missing === 1 ? 'falta 1 persona' : `faltan ${h.missing} personas`}: ${detail}` : ''}`;
          const current = nowAt !== null && Math.floor(nowAt * 24) === h.hour;
          return <li key={h.hour} className={`shift-load-hour${h.gaps.length ? ' is-gap' : ''}${current ? ' is-now' : ''}`} aria-label={name} title={name}>
            <span className="shift-load-time">{String(h.hour).padStart(2, '0')}</span>
            <strong className="shift-load-count">{people}</strong>
            {h.gaps.length > 0 && <span className="shift-load-missing">−{h.missing}</span>}
          </li>;
        })}
      </ol>
    </section>
    <div className="shift-day-grid">
      <div className="shift-day-axis" aria-hidden="true"><span />
        <div className="shift-day-ticks">{AXIS.map(h => <span key={h} style={{ '--at': h / 24 } as CSSProperties}>{hh(h)}</span>)}</div>
      </div>
      {groups.map(g => <section key={g.id} className="shift-day-group" aria-label={`${g.name}: ${g.rows.length === 1 ? '1 turno' : `${g.rows.length} turnos`}`}>
        <h4 className="shift-day-group-title">{g.name} <span>{g.rows.length}</span></h4>
        <ul className="shift-day-rows">
          {g.rows.map(s => {
            const t = s.item, state = displayState(t, now);
            const movable = Boolean(planning?.canMove(t)) && !s.startsBefore;
            const active = drag?.id === t.id ? drag : null;
            const shift: Record<string, string> = active ? { '--dx': `${active.mode === 'move' ? active.dx : 0}px`, '--grow': `${active.mode === 'stretch' ? active.dx : 0}px` } : {};
            const time = `${s.startsBefore ? 'viene de ayer' : localTime(Date.parse(t.start))}${s.endsAfter ? ' · sigue mañana' : ` a ${localTime(Date.parse(t.end))}`}`;
            return <li key={t.id} className="shift-day-row">
              <div className="shift-day-who">
                <strong>{t.person}</strong>
                <span className="shift-day-chips"><RoleChip code={typeOf(t)} /><AreaChip name={t.area} /></span>
              </div>
              <div className="shift-day-track">
                {nowAt !== null && <span className="shift-day-now" aria-hidden="true" style={{ '--from': nowAt } as CSSProperties} />}
                <button type="button"
                  className={`shift-bar is-${state}${s.startsBefore ? ' starts-before' : ''}${s.endsAfter ? ' ends-after' : ''}${movable ? ' is-movable' : ''}${active ? ' is-dragging' : ''}${highlight === t.id ? ' is-new' : ''}`}
                  aria-label={shiftLabel(t, state)} aria-keyshortcuts={movable ? 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowDown' : undefined}
                  onClick={() => { if (dragged.current) { dragged.current = false; return; } onOpen(t); }}
                  onKeyDown={event => keyMove(event, t)}
                  onPointerDown={event => startDrag(event, t, (event.target as HTMLElement).classList.contains('shift-bar-resize') ? 'stretch' : 'move')}
                  onPointerMove={moveDrag} onPointerUp={() => endDrag(t)} onPointerCancel={() => setDrag(null)}
                  style={{ '--from': s.offset, '--len': s.length, ...shift } as CSSProperties}>
                  <span className="shift-bar-time">{time}</span>
                  {movable && !s.endsAfter && <span className="shift-bar-resize" aria-hidden="true" />}
                </button>
              </div>
            </li>;
          })}
        </ul>
      </section>)}
      {!groups.length && <p className="shift-day-empty">Sin turnos este día con estos filtros.</p>}
    </div>
  </div>;
}
