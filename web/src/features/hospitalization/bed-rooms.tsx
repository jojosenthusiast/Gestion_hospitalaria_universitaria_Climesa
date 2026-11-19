import { Icon } from '../../components/ui';
import { useFold } from '../../components/fold';
import { formatDateTime } from '../../lib/format';
import type { Admission } from './admission-actions';
import './admission-stepper.css';
import './bed-rooms.css';

/** A bed the API suggests for a pending admission (`/admisiones/:id/sugerencias-cama`): free and compatible. */
export type Suggestion = { id: string; version: number; code: string; room: string; roomId?: string; level?: number | null; category: string; reason: string; occupiedInRoom?: number };

const originWords: Record<string, string> = { consulta: 'su consulta', emergencia: 'Emergencia', ambulancia: 'el servicio de ambulancia', cita: 'su cita' };
/** «Dr(a). Nombre», unless the stored name already carries the title. */
const doctorTitle = (name: string) => /^dr(a)?\.?\s/i.test(name) ? name : `Dr(a). ${name}`;

/**
 * S27 (owner, Lote 2: «nose porque o de donde proviene este paciente»): the first lines say who indicated the admission,
 * when, and from which record, with the reason, so the bed choice never starts from an unexplained patient.
 */
export function AdmissionOrigin({ admission }: { admission: Admission }) {
  const indicated = admission.origin === 'consulta';
  const when = admission.createdAt ? ` el ${formatDateTime(admission.createdAt)}` : '';
  const source = `${originWords[admission.origin] ?? admission.origin}${admission.originAt ? ` del ${formatDateTime(admission.originAt)}` : ''}`;
  const doctor = admission.attendingDoctorName ? doctorTitle(admission.attendingDoctorName) : null;
  const line = indicated
    ? `Indicado por ${doctor ?? 'el médico tratante'}${when} desde ${source}.`
    : `Ingreso registrado${when} desde ${source}${doctor ? ` · médico tratante ${doctor}` : ''}.`;
  return <section className="admission-origin" aria-label="De dónde viene el ingreso">
    <p className="admission-origin-line"><Icon name={indicated ? 'clipboard' : 'info'} size={18} /><span>{line}</span></p>
    {admission.motive && <p className="admission-origin-motive"><span>Motivo</span> <q>{admission.motive}</q></p>}
  </section>;
}

type Room = { key: string; name: string; level: number | null; occupied: number; beds: Suggestion[] };
/** Suggested beds grouped by room, in the order the API ranks them (best room first). */
export function groupSuggestions(rows: readonly Suggestion[]): Room[] {
  const rooms = new Map<string, Room>();
  for (const bed of rows) {
    const key = bed.roomId ?? bed.room;
    const room = rooms.get(key) ?? { key, name: bed.room, level: bed.level ?? null, occupied: bed.occupiedInRoom ?? 0, beds: [] };
    room.beds.push(bed);
    rooms.set(key, room);
  }
  return [...rooms.values()];
}

/** Rooms shown before «Ver N más»: enough to compare without a long scroll. */
const ROOMS_SHOWN = 8;

/**
 * S27: the suggested beds use the same room and bed cells as the guided admission's bed step (owner: «las habitaciones
 * se veian bien con las camas»), instead of a plain list. Free beds are radios inside green cells; the beds already
 * occupied in that room appear as grey cells that cannot be chosen.
 */
export function SuggestedBedRooms({ rows, name, bedId, onPick, label }: { rows: readonly Suggestion[]; name: string; bedId: string; onPick: (id: string) => void; label: string }) {
  const rooms = groupSuggestions(rows), { shown, more } = useFold(rooms, ROOMS_SHOWN);
  return <fieldset className="choice-list suggested-rooms"><legend>{label}</legend>
    <div className="room-grid">{shown.map(room => <div key={room.key} className="room-card">
      <strong>{room.name}</strong>
      <small>{[room.level === null ? null : `Planta ${room.level}`, `${room.beds.length} libre${room.beds.length === 1 ? '' : 's'}`, room.occupied ? `${room.occupied} ocupada${room.occupied === 1 ? '' : 's'}` : 'vacía'].filter(Boolean).join(' · ')}</small>
      <div className="bed-row">
        {room.beds.map(bed => {
          const selected = bedId === bed.id;
          const cellClass = selected ? 'bed-cell bed-choice is-selected' : 'bed-cell bed-choice';
          return <label key={bed.id} className={cellClass}>
            <input type="radio" name={name} value={bed.id} checked={selected} onChange={() => onPick(bed.id)} aria-label={`Cama ${bed.code} · ${bed.room} · ${bed.reason}`} />
            <Icon name="bed" size={16} /><span>{bed.code}</span><small>{selected ? 'Elegida' : 'Libre'}</small>
          </label>;
        })}
        {Array.from({ length: room.occupied }, (_, i) => <span key={`o-${i}`} className="bed-cell bed-occupied" aria-hidden="true"><Icon name="bed" size={16} /><span>Ocupada</span></span>)}
      </div>
    </div>)}</div>
    {more}
  </fieldset>;
}
