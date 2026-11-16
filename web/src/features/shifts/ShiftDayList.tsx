import { AreaChip, RoleChip } from '../../components/identity';
import { Icon } from '../../components/ui';
import { Dialog, Tag, formatDateTime } from '../common';
import { KIND_LABEL, attendanceLabel, canNow, localTime, type ShiftRow } from './rules';
import { timeRange } from './ShiftWeek';
import { dayHeading, displayState, stateName, type WeekDay } from './week';

const ATTENDANCE_ACTIONS = ['marcar_presente', 'marcar_ausente', 'deshacer_asistencia'] as const;
export const hasAttendanceAction = (t: ShiftRow, now: number) => ATTENDANCE_ACTIONS.some(a => canNow(t, a, now));
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `Hoy · martes, 10 de noviembre` o `Jueves, 12 de noviembre`. */
export function dayTitle(date: string, today: string) {
  const h = dayHeading(date, today);
  return h.relative ? `${h.relative} · ${h.label}` : capitalize(h.label);
}

export type RowActions = { onEdit: (t: ShiftRow) => void; onCancel: (t: ShiftRow) => void; onAttendance: (t: ShiftRow) => void };

/**
 * Lista de la semana por día, de lunes a domingo, con los turnos de cada día por hora de inicio (o por persona). Un turno
 * de noche o una guardia de 24 h que viene del día anterior también aparece en el día al que llega, marcado "viene del
 * día anterior" (así coincide con "N turnos más" de la semana; el lunes incluye los del domingo anterior). Todos los
 * días se dibujan, con o sin turnos, para que "N turnos más" y "Hoy" siempre tengan dónde llegar.
 */
export function ShiftDayList({ days, today, now, rows, plan, byPerson, typeOf, actions }: {
  days: WeekDay[]; today: string; now: number; rows: ShiftRow[]; plan: boolean; byPerson: boolean;
  typeOf: (t: ShiftRow) => string | undefined; actions: RowActions;
}) {
  const order = (a: ShiftRow, b: ShiftRow) => byPerson
    ? a.person.localeCompare(b.person, 'es') || Date.parse(a.start) - Date.parse(b.start)
    : Date.parse(a.start) - Date.parse(b.start) || a.person.localeCompare(b.person, 'es');
  const groups = days.map(day => {
    const starts = rows.filter(t => Date.parse(t.start) >= day.start && Date.parse(t.start) < day.end).sort(order);
    const carried = rows.filter(t => Date.parse(t.start) < day.start && Date.parse(t.end) > day.start).sort(order);
    return { day, items: [...carried, ...starts], carried: new Set(carried.map(t => t.id)) };
  });
  return <div className="shift-days">{groups.map(({ day, items, carried }) => {
    const id = `turnos-dia-${day.date}`;
    return <section key={day.date} id={`dia-${day.date}`} className={`shift-day${day.date === today ? ' is-today' : ''}`} aria-labelledby={id}>
      <h3 id={id} className="shift-day-title"><span>{dayTitle(day.date, today)}</span><span className="shift-day-count">{items.length === 0 ? 'Sin turnos' : items.length === 1 ? '1 turno' : `${items.length} turnos`}</span></h3>
      {items.length === 0 ? <p className="shift-day-empty">No hay turnos este día.</p> : <table className="record-table"><caption className="sr-only">Turnos del {dayTitle(day.date, today)}</caption>
        <thead><tr><th>Persona</th><th>Horario</th><th>Tipo</th><th>Estado</th><th>Asistencia</th>{plan && <th>Acción</th>}</tr></thead>
        <tbody>{items.map(t => {
          const st = displayState(t, now);
          return <tr key={t.id}>
            <td data-label="Persona y área"><div className="shift-who"><strong>{t.person}</strong><span className="shift-chips"><RoleChip code={typeOf(t)} /><AreaChip name={t.area} /></span></div></td>
            <td data-label="Horario">{timeRange(t.start, t.end)}{carried.has(t.id) && <span className="shift-carried">Viene del día anterior</span>}</td>
            <td data-label="Tipo">{KIND_LABEL[t.type] ?? t.type}</td>
            <td data-label="Estado"><Tag value={st} label={stateName(st)} /></td>
            <td data-label="Asistencia">{attendanceLabel(t) ?? 'Sin asistencia'}</td>
            {plan && <td data-label="Acción">
              {canNow(t, 'editar', now) && <button className="row-action" onClick={() => actions.onEdit(t)}>Editar <Icon name="arrow" size={16} /></button>}
              {canNow(t, 'cancelar', now) && <button className="row-action" aria-label={`Cancelar turno de ${t.person}`} onClick={() => actions.onCancel(t)}>Cancelar turno</button>}
              {hasAttendanceAction(t, now) && <button className="row-action" aria-label={`Asistencia de ${t.person}`} onClick={() => actions.onAttendance(t)}>Asistencia</button>}
            </td>}
          </tr>;
        })}</tbody>
      </table>}
    </section>;
  })}</div>;
}

/** Qué pasó con la entrada, en palabras: automática a la hora de inicio, corregida por JOP o ausencia. */
export function entryDetail(t: ShiftRow, now: number): string {
  const start = Date.parse(t.start);
  if (t.state === 'cancelado' || t.state === 'borrador') return 'Este turno no se trabaja, así que no lleva asistencia.';
  if (t.state === 'ausente') return `${attendanceLabel(t)}${t.attendanceReason ? `: ${t.attendanceReason}` : ''}.`;
  const since = t.presentSince ? Date.parse(t.presentSince) : null;
  if (since !== null && since !== start) return `Entrada registrada por Jefatura a las ${localTime(since)}${t.late ? ' (llegó tarde)' : ''}.`;
  if (since === null && now >= start && t.attendance === 'sin_registro') return 'Sin registro de entrada: el turno empezó antes de que la entrada se confirmara sola.';
  if (since !== null || now >= start) return `Entrada confirmada automáticamente a las ${localTime(start)}.`;
  return `La entrada se confirma sola a las ${localTime(start)}, salvo que Jefatura marque una ausencia.`;
}

/** Detalle de un bloque de la semana, con solo las acciones que la API permite ahora (`allowedActions`). */
export function ShiftDetail({ shift, now, plan, typeOf, actions, onClose }: {
  shift: ShiftRow; now: number; plan: boolean; typeOf: (t: ShiftRow) => string | undefined; actions: RowActions; onClose: () => void;
}) {
  const st = displayState(shift, now);
  const run = (fn: (t: ShiftRow) => void) => () => { onClose(); fn(shift); };
  return <Dialog title={shift.person} onClose={onClose}>
    <div className="module-form shift-detail">
      <p className="shift-summary"><RoleChip code={typeOf(shift)} /><AreaChip name={shift.area} /><Tag value={st} label={stateName(st)} /></p>
      <dl className="shift-detail-list">
        <div><dt>Horario</dt><dd>{formatDateTime(shift.start)} a {formatDateTime(shift.end)}</dd></div>
        <div><dt>Tipo</dt><dd>{KIND_LABEL[shift.type] ?? shift.type}</dd></div>
        <div><dt>Asistencia</dt><dd>{entryDetail(shift, now)}</dd></div>
      </dl>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
        {plan && canNow(shift, 'cancelar', now) && <button type="button" className="secondary-button" onClick={run(actions.onCancel)}>Cancelar turno</button>}
        {plan && hasAttendanceAction(shift, now) && <button type="button" className="secondary-button" onClick={run(actions.onAttendance)}>Registrar asistencia</button>}
        {plan && canNow(shift, 'editar', now) && <button type="button" className="primary-button" onClick={run(actions.onEdit)}>Editar turno</button>}
      </div>
    </div>
  </Dialog>;
}
