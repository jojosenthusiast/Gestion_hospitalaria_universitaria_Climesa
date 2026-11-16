import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { Icon } from '../../components/ui';
import { roleNames } from '../../lib/api';
import type { AreaGap } from './AreaCoverageAlert';
import { HOUR, KIND_LABEL, localDay, localTime, type ShiftRow } from './rules';
import { SHIFT_STATES, dayHeading, daySegments, displayState, stateName, unionSegments, type WeekDay } from './week';
import { SNAP_MINUTES, atFraction, dragResult } from './plan';

/** Carriles visibles por día en la semana; si hay más turnos a la vez, se ofrece verlos en la lista del día. */
export const MAX_LANES = 4;
/** En la vista Día la columna es ancha: caben más turnos a la vez antes de mandar a la lista. */
export const DAY_VIEW_LANES = 12;
const DAY = 24 * HOUR;
const HOURS = [0, 6, 12, 18];
/** Un arrastre más corto que esto es un clic (abre el turno o crea uno de 8 h en esa hora). */
const DRAG_THRESHOLD = 4;

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
  /** Crear un turno ese día; con horario cuando se hizo clic o se arrastró sobre las horas. */
  onCreate: (date: string, start?: number, end?: number) => void;
  /** Nuevo horario de un bloque movido o estirado (con el ratón o con Alt + flechas). */
  onMove: (shift: ShiftRow, start: string, end: string) => void;
  /** Solo se mueven los turnos que la API deja editar ahora (`allowedActions` y el reloj). */
  canMove: (shift: ShiftRow) => boolean;
};

type Props = {
  days: WeekDay[]; today: string; now: number; shifts: ShiftRow[]; gaps: AreaGap[];
  onOpen: (shift: ShiftRow) => void; onShowDay: (date: string) => void;
  planning?: CalendarPlanning; highlight?: string | null; maxLanes?: number;
};
type Drag = { id: string; mode: 'move' | 'stretch'; x: number; y: number; dx: number; dy: number; track: DOMRect; column: number };
type Selection = { date: string; from: number; to: number };

/** Fracción del día (0 a 1) bajo el puntero: vertical en escritorio, horizontal cuando cada día es una fila (teléfono). */
const fractionAt = (rect: DOMRect, x: number, y: number) => rect.height >= rect.width ? (y - rect.top) / (rect.height || 1) : (x - rect.left) / (rect.width || 1);

/**
 * Calendario para PLANIFICAR: columnas = días, filas = horas (vista Semana, o un solo día en la vista Día). Un bloque por
 * turno, ubicado por su hora y con el patrón de su estado; una guardia de 24 h o una noche se ve en los dos días que
 * toca. Los huecos de cobertura (`GET /turnos/cobertura`) se dibujan como bandas en su día y hora.
 * Con `planning`: clic o arrastre sobre las horas crea un turno, arrastrar un bloque lo mueve (también a otro día), el
 * borde inferior lo estira, y Alt + flechas hace lo mismo con el teclado; el botón de cada día crea sin arrastrar.
 * En pantallas angostas cada día es una fila con la hora de izquierda a derecha.
 */
export function ShiftWeek({ days, today, now, shifts, gaps, onOpen, onShowDay, planning, highlight, maxLanes = MAX_LANES }: Props) {
  const range = (t: ShiftRow): [number, number] => [Date.parse(t.start), Date.parse(t.end)];
  const gapRange = (g: AreaGap): [number, number] => [Date.parse(g.start), Date.parse(g.end)];
  const [drag, setDrag] = useState<Drag | null>(null), [selection, setSelection] = useState<Selection | null>(null);
  const dragged = useRef(false);

  const startDrag = (event: PointerEvent<HTMLElement>, t: ShiftRow, mode: Drag['mode']) => {
    if (!planning?.canMove(t) || event.button !== 0) return;
    const track = (event.currentTarget.closest('.shift-week-track') as HTMLElement | null)?.getBoundingClientRect();
    const column = (event.currentTarget.closest('.shift-week-day') as HTMLElement | null)?.getBoundingClientRect().width ?? 0;
    if (!track) return;
    event.stopPropagation();
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: t.id, mode, x: event.clientX, y: event.clientY, dx: 0, dy: 0, track, column });
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) dragged.current = true;
    setDrag({ ...drag, dx, dy });
  };
  const endDrag = (t: ShiftRow) => {
    if (!drag) return;
    const vertical = drag.track.height >= drag.track.width;
    const span = vertical ? drag.track.height : drag.track.width;
    const minutes = ((vertical ? drag.dy : drag.dx) / (span || 1)) * 24 * 60;
    const dayShift = vertical && drag.mode === 'move' && drag.column ? Math.round(drag.dx / drag.column) : 0;
    setDrag(null);
    if (!dragged.current) return;
    const next = dragResult(t, drag.mode, minutes, dayShift);
    if (next.start !== t.start || next.end !== t.end) planning?.onMove(t, next.start, next.end);
  };
  /** Alt + ↑/↓ mueve 30 min, Alt + Mayús + ↑/↓ estira o acorta el fin, Alt + ←/→ cambia de día. */
  const keyMove = (event: KeyboardEvent<HTMLButtonElement>, t: ShiftRow) => {
    if (!event.altKey || !planning?.canMove(t)) return;
    const step: Record<string, number> = { ArrowUp: -SNAP_MINUTES, ArrowDown: SNAP_MINUTES };
    const day: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    let next: { start: string; end: string } | null = null;
    if (event.key in step) next = dragResult(t, event.shiftKey ? 'stretch' : 'move', step[event.key]);
    else if (event.key in day) next = dragResult(t, 'move', 0, day[event.key]);
    if (!next) return;
    event.preventDefault();
    planning.onMove(t, next.start, next.end);
  };

  const startSelect = (event: PointerEvent<HTMLDivElement>, day: WeekDay) => {
    if (!planning || event.button !== 0 || (event.target as HTMLElement).closest('.shift-block')) return;
    const at = atFraction(day, fractionAt(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY));
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSelection({ date: day.date, from: at, to: at });
  };
  const moveSelect = (event: PointerEvent<HTMLDivElement>, day: WeekDay) => {
    if (!selection || selection.date !== day.date) return;
    setSelection({ ...selection, to: atFraction(day, fractionAt(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)) });
  };
  const endSelect = () => {
    if (!selection || !planning) return;
    const from = Math.min(selection.from, selection.to), to = Math.max(selection.from, selection.to);
    setSelection(null);
    // Un clic propone 8 h desde esa hora; un arrastre, el tramo marcado (la API pide al menos 4 h).
    planning.onCreate(selection.date, from, to - from >= HOUR ? to : from + 8 * HOUR);
  };

  return <div className={`shift-week${days.length === 1 ? ' is-day' : ''}`} role="presentation">
    <div className="shift-week-hours" aria-hidden="true">{HOURS.map(h => <span key={h} style={{ '--at': h / 24 } as CSSProperties}>{String(h).padStart(2, '0')}:00</span>)}</div>
    {days.map(day => {
      const heading = dayHeading(day.date, today);
      const name = `${heading.relative ? `${heading.relative}, ` : ''}${heading.label}`;
      const segments = daySegments(shifts, range, day);
      const visible = segments.filter(s => s.lane < maxLanes);
      const hidden = segments.length - visible.length;
      const rows = Math.max(1, ...visible.map(s => Math.min(s.lanes, maxLanes)));
      const bands = unionSegments(gaps, gapRange, day);
      const isToday = day.date === today;
      const marked = selection?.date === day.date ? { from: (Math.min(selection.from, selection.to) - day.start) / DAY, len: Math.max(Math.abs(selection.to - selection.from), 30 * 60_000) / DAY } : null;
      return <section key={day.date} className={`shift-week-day${isToday ? ' is-today' : ''}`} role="group" aria-label={name}>
        <header className="shift-week-head">
          <span className="shift-week-weekday">{heading.relative ? `${heading.relative} · ${heading.weekday}` : heading.weekday}</span>
          <strong className="shift-week-date">{heading.dayNumber}</strong>
          {planning && <button type="button" className="shift-week-add" aria-label={`Asignar turno el ${heading.label}`} title="Asignar turno este día" onClick={() => planning.onCreate(day.date)}><Icon name="plus" size={16} /></button>}
          {hidden > 0 && <button type="button" className="shift-week-more" onClick={() => onShowDay(day.date)}>{hidden === 1 ? '1 turno más' : `${hidden} turnos más`}</button>}
        </header>
        <div className={`shift-week-track${planning ? ' is-plannable' : ''}`} style={{ '--rows': rows } as CSSProperties}
          onPointerDown={event => startSelect(event, day)} onPointerMove={event => moveSelect(event, day)} onPointerUp={endSelect} onPointerCancel={() => setSelection(null)}>
          {bands.map(b => {
            const from = localTime(day.start + b.offset * DAY), to = b.offset + b.length >= 1 ? '24:00' : localTime(day.start + (b.offset + b.length) * DAY);
            const detail = b.items.map(g => `${g.area} · ${roleNames[g.role] ?? g.role} (${g.actual} de ${g.required})`).join('; ');
            return <span key={b.offset} className="shift-gap" role="img" aria-label={`Hueco de cobertura de ${from} a ${to}: ${detail}`} title={`Hueco de cobertura de ${from} a ${to}: ${detail}`}
              style={{ '--from': b.offset, '--len': b.length } as CSSProperties}><span className="shift-gap-label">Hueco</span></span>;
          })}
          {marked && <span className="shift-select" aria-hidden="true" style={{ '--from': marked.from, '--len': marked.len } as CSSProperties} />}
          {isToday && now >= day.start && now < day.end && <span className="shift-week-now" aria-hidden="true" style={{ '--from': (now - day.start) / DAY } as CSSProperties} />}
          {visible.map(s => {
            const t = s.item, state = displayState(t, now);
            const lanes = Math.min(s.lanes, maxLanes);
            const movable = Boolean(planning?.canMove(t)) && !s.startsBefore;
            const active = drag?.id === t.id ? drag : null;
            const offset: Record<string, string> = active ? { '--dx': `${active.mode === 'move' ? active.dx : 0}px`, '--dy': `${active.mode === 'move' ? active.dy : 0}px`, '--grow': `${active.mode === 'stretch' ? active.dy : 0}px` } : {};
            return <button key={t.id} type="button"
              className={`shift-block is-${state}${s.startsBefore ? ' starts-before' : ''}${s.endsAfter ? ' ends-after' : ''}${t.type === 'guardia' ? ' is-guard' : ''}${movable ? ' is-movable' : ''}${active ? ' is-dragging' : ''}${highlight === t.id ? ' is-new' : ''}`}
              aria-label={shiftLabel(t, state)} aria-keyshortcuts={movable ? 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+Shift+ArrowDown' : undefined}
              onClick={() => { if (dragged.current) { dragged.current = false; return; } onOpen(t); }}
              onKeyDown={event => keyMove(event, t)}
              onPointerDown={event => startDrag(event, t, (event.target as HTMLElement).classList.contains('shift-block-resize') ? 'stretch' : 'move')}
              onPointerMove={moveDrag} onPointerUp={() => endDrag(t)} onPointerCancel={() => setDrag(null)}
              style={{ '--from': s.offset, '--len': s.length, '--lane': s.lane, '--lanes': lanes, ...offset } as CSSProperties}>
              <span className="shift-block-time">{s.startsBefore ? 'viene de ayer' : localTime(Date.parse(t.start))}{s.endsAfter ? ' · sigue mañana' : ` a ${localTime(Date.parse(t.end))}`}</span>
              <span className="shift-block-who">{t.person}</span>
              <span className="shift-block-area">{t.area}</span>
              {movable && !s.endsAfter && <span className="shift-block-resize" aria-hidden="true" />}
            </button>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
