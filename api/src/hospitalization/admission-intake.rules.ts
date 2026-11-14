/**
 * Pure rules of the guided admission (observation 11). The API repeats every check at write time; the clients
 * use the same answers (`/admisiones/mapa-camas`, `/admisiones/factibilidad`) only to guide the person.
 */
export type Category = 'vip' | 'semiprivada';

/**
 * Assumption (docs/preguntas-abiertas.md): the building does not model companion seats, so the limit per patient
 * follows the room type. A semiprivate room is shared (one companion per patient); a VIP room is single.
 */
export const VISITOR_LIMIT: Record<Category, number> = { semiprivada: 1, vip: 3 };

export type VisitorPolicy = { allowed: boolean; max: number };

/** Defaults: visits allowed with one companion, or not allowed with none. A contradictory pair is reported by `visitorError`. */
export function visitorPolicy(allowed: boolean | undefined, max: number | undefined): VisitorPolicy {
  const permitted = allowed ?? true;
  return { allowed: permitted, max: max ?? (permitted ? 1 : 0) };
}

export function visitorError(policy: VisitorPolicy, category: Category): string | null {
  if (!policy.allowed) return policy.max === 0 ? null : 'Si no se permiten visitas, el número de acompañantes debe ser 0.';
  if (policy.max < 1) return 'Si se permiten visitas, indica al menos 1 acompañante.';
  const limit = VISITOR_LIMIT[category];
  if (policy.max > limit) return `La categoría ${category === 'vip' ? 'VIP' : 'semiprivada'} admite hasta ${limit} acompañante${limit === 1 ? '' : 's'} por paciente.`;
  return null;
}

export type BedRow = { id: string; roomId: string; state: string; roomSex: string | null; roomIsolation: boolean };
export type Verdict = { compatible: boolean; reason: string | null };

const STATE_REASON: Record<string, string> = { ocupada: 'Ocupada', limpieza: 'En limpieza', bloqueada: 'Bloqueada', reservada: 'Reservada' };

/** RN-05 and DAT-05: free bed, semiprivate rooms never mix sexes, isolation needs a room with nobody else in it. */
export function bedVerdict(bed: BedRow, roomBeds: BedRow[], patientSex: string, isolation: boolean): Verdict {
  if (bed.state !== 'libre') return { compatible: false, reason: STATE_REASON[bed.state] ?? 'No disponible' };
  const others = roomBeds.filter(other => other.id !== bed.id && (other.state === 'ocupada' || other.state === 'reservada'));
  if (isolation && others.length) return { compatible: false, reason: 'El aislamiento necesita una habitación sin otros ocupantes' };
  const occupants = others.filter(other => other.state === 'ocupada');
  if (occupants.some(other => other.roomIsolation)) return { compatible: false, reason: 'La habitación tiene un paciente en aislamiento' };
  if (occupants.some(other => other.roomSex !== patientSex)) return { compatible: false, reason: 'Habitación ocupada por un paciente de otro sexo' };
  return { compatible: true, reason: null };
}
