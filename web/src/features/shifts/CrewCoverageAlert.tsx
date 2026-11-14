import { Notice } from '../../components/ui';
import { type Shift } from '../../lib/api';
import { HOUR, localDay, localTime } from './rules';

/** Tramo sin cobertura de una función de la tripulación de ambulancia (RN-30). */
export type CrewGap = { role: 'paramedico' | 'motorista'; from: number; to: number };
const ROLES = ['paramedico', 'motorista'] as const;
const NAMES: Record<CrewGap['role'], string> = { paramedico: 'paramédico', motorista: 'motorista' };
/** Solo un turno publicado o en curso cubre la hora; borradores y cancelados no cuentan. */
const COVERS = new Set(['publicado', 'en_curso']);
export const COVERAGE_DAYS = 7;

/**
 * Horas del rango [from, to) sin paramédico o sin motorista con turno que las cubra, agrupadas en tramos continuos.
 * Revisa hora por hora: una hora queda cubierta si algún turno la contiene completa.
 */
export function crewGaps(shifts: Shift[], typeOf: (s: Shift) => string | undefined, from: number, to: number): CrewGap[] {
  const gaps: CrewGap[] = [];
  for (const role of ROLES) {
    const own = shifts.filter(s => COVERS.has(s.state) && typeOf(s) === role).map(s => [Date.parse(s.start), Date.parse(s.end)] as const);
    let open: CrewGap | null = null;
    for (let at = from; at < to; at += HOUR) {
      const covered = own.some(([a, b]) => a <= at && b >= at + HOUR);
      if (!covered) { if (open && open.to === at) open.to = at + HOUR; else { open = { role, from: at, to: at + HOUR }; gaps.push(open); } }
    }
  }
  return gaps.sort((a, b) => a.from - b.from || a.role.localeCompare(b.role));
}

const dayLabel = (ms: number) => new Intl.DateTimeFormat('es-SV', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/El_Salvador' }).format(new Date(ms));
const span = (g: CrewGap) => localDay(g.from) === localDay(g.to - 1) ? `${dayLabel(g.from)} ${localTime(g.from)}–${localTime(g.to)}` : `${dayLabel(g.from)} ${localTime(g.from)} a ${dayLabel(g.to)} ${localTime(g.to)}`;

/**
 * Alerta de cobertura de la ambulancia en la planificación (RN-30): la unidad solo se despacha con paramédico y
 * motorista de turno. Muestra los tramos de los próximos 7 días, desde la hora en curso, que dejan la unidad sin poder salir.
 */
export function CrewCoverageAlert({ shifts, typeOf, now, onPlan }: { shifts: Shift[]; typeOf: (s: Shift) => string | undefined; now: Date; onPlan?: () => void }) {
  const from = Math.floor(now.valueOf() / HOUR) * HOUR, to = from + COVERAGE_DAYS * 24 * HOUR;
  const gaps = crewGaps(shifts, typeOf, from, to);
  if (!gaps.length) return null;
  const hours = (role: CrewGap['role']) => gaps.filter(g => g.role === role).reduce((n, g) => n + (g.to - g.from) / HOUR, 0);
  const summary = ROLES.filter(r => hours(r) > 0).map(r => `${hours(r)} h sin ${NAMES[r]}`).join(' y ');
  const shown = gaps.slice(0, 6);
  return <section className="crew-coverage" aria-label="Cobertura de la ambulancia">
    <Notice kind="info"><strong>Ambulancia sin tripulación completa en los próximos {COVERAGE_DAYS} días: {summary}.</strong> La unidad solo se despacha con un paramédico y un motorista de turno (RN-30); en estos tramos queda bloqueada.</Notice>
    <ul className="crew-coverage-list">{shown.map(g => <li key={`${g.role}-${g.from}`}><strong>Sin {NAMES[g.role]}</strong> · {span(g)}</li>)}</ul>
    {gaps.length > shown.length && <p className="crew-coverage-more">y {gaps.length - shown.length} tramos más.</p>}
    {onPlan ? <button type="button" className="secondary-button" onClick={onPlan}>Cubrir el tramo con un turno</button> : <p className="crew-coverage-more">Avisa a la Jefatura de Operaciones para que publique los turnos que faltan.</p>}
  </section>;
}
