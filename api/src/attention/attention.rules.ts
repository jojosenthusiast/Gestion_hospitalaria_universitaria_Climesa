/**
 * Pure rules that decide which actions the reading actor may take on an appointment or a queue number right now
 * (audit CITA-04, FILA-01): the API returns them as `allowedActions` / `blockedActions` so web, Android and iOS never
 * offer an action the server would reject. The commands re-check the same rules and Postgres backs the invariants.
 */

export const APPOINTMENT_ACTIONS = ['confirmar', 'rechazar', 'cancelar', 'reprogramar', 'no_asistio', 'aceptar_reprogramacion', 'rechazar_reprogramacion', 'iniciar_consulta'] as const;
export type AppointmentAction = typeof APPOINTMENT_ACTIONS[number];
export const QUEUE_ACTIONS = ['llamar', 'atender', 'completar', 'no_se_presento'] as const;
export type QueueAction = typeof QUEUE_ACTIONS[number];

export type BlockedAction<T extends string> = { action: T; reason: string };
export type ActionSet<T extends string> = { allowedActions: T[]; blockedActions: BlockedAction<T>[] };

export type AppointmentFacts = {
  state: string;
  start: Date;
  now: Date;
  /** Business date (yyyy-MM-dd) of the start and of now. */
  startDate: string;
  today: string;
  hasConsultation: boolean;
  pendingReschedule: boolean;
  reschedules: number;
};

export type AppointmentPolicies = { cancelHours: number; maxReschedules: number };

export type AppointmentAbilities = {
  /** `citas.agendar`: reception confirms, rejects, reschedules directly and marks no-shows. */
  manage: boolean;
  /** `citas.cancelar` with a context other than `propio`. */
  cancelAny: boolean;
  /** `citas.cancelar` / `citas.solicitar` limited to the patient's own appointments. */
  cancelOwn: boolean;
  requestOwn: boolean;
  /** The actor is the appointment's patient. */
  ownPatient: boolean;
  /** `consulta.iniciar` and the actor is the appointment's doctor. */
  ownDoctor: boolean;
};

const HOUR = 3_600_000;
const hhmm = (at: Date) => new Date(at.valueOf() - 6 * HOUR).toISOString().slice(11, 16);

/** Instant until which the actor may cancel or reschedule: N hours before for the patient (RN-21), the start for reception. */
export function cancelableUntil(facts: AppointmentFacts, policies: AppointmentPolicies, abilities: AppointmentAbilities): Date | null {
  if (!['solicitada', 'confirmada'].includes(facts.state)) return null;
  if (abilities.cancelAny || abilities.manage) return facts.start;
  if (abilities.cancelOwn && abilities.ownPatient) return new Date(facts.start.valueOf() - policies.cancelHours * HOUR);
  return null;
}

export function appointmentActions(facts: AppointmentFacts, policies: AppointmentPolicies, abilities: AppointmentAbilities): ActionSet<AppointmentAction> {
  const allowed: AppointmentAction[] = [];
  const blocked: BlockedAction<AppointmentAction>[] = [];
  const add = (action: AppointmentAction, reason: string | null) => reason ? blocked.push({ action, reason }) : allowed.push(action);
  const started = facts.start.valueOf() <= facts.now.valueOf();
  const pending = ['solicitada', 'confirmada'].includes(facts.state);
  const patientWindow = facts.start.valueOf() - facts.now.valueOf() >= policies.cancelHours * HOUR;
  const patientLate = `Solo hasta ${policies.cancelHours} h antes (${hhmm(new Date(facts.start.valueOf() - policies.cancelHours * HOUR))}); comunícate con recepción.`;
  const passed = 'La hora de la cita ya pasó.';
  const consultation = 'La consulta ya empezó.';

  if (facts.state === 'solicitada' && abilities.manage) {
    add('confirmar', started ? passed : null);
    add('rechazar', started ? passed : null);
  }

  // CITA-06: reception rejects a request (it does not cancel it); the patient withdraws their own request by cancelling it.
  const receptionCancels = abilities.cancelAny && facts.state === 'confirmada';
  const patientCancels = abilities.cancelOwn && abilities.ownPatient && pending;
  if (receptionCancels || patientCancels) {
    add('cancelar', facts.hasConsultation ? consultation : started ? passed : receptionCancels || patientWindow ? null : patientLate);
  }

  const receptionMoves = abilities.manage && pending;
  const patientMoves = abilities.requestOwn && abilities.ownPatient && pending;
  if (receptionMoves || patientMoves) {
    const reason = facts.hasConsultation ? consultation
      : started ? passed
      : facts.pendingReschedule ? 'Ya hay una solicitud de reprogramación pendiente.'
      : facts.reschedules >= policies.maxReschedules ? `La cita ya se reprogramó ${policies.maxReschedules} veces; cancélala y pide otra.`
      : receptionMoves || patientWindow ? null : patientLate;
    add('reprogramar', reason);
  }

  if (facts.pendingReschedule && pending && (abilities.manage || abilities.ownDoctor)) {
    add('aceptar_reprogramacion', null);
    add('rechazar_reprogramacion', null);
  }

  if (facts.state === 'confirmada' && abilities.manage) {
    add('no_asistio', facts.hasConsultation ? consultation : started ? null : 'Disponible cuando llegue la hora de la cita.');
  }

  if (facts.state === 'confirmada' && abilities.ownDoctor && !facts.hasConsultation) {
    add('iniciar_consulta', facts.startDate === facts.today ? null : facts.startDate > facts.today ? 'La consulta se inicia el día de la cita.' : 'La cita fue de un día anterior.');
  }
  return { allowedActions: allowed, blockedActions: blocked };
}

export type QueueFacts = { state: string; calls: number };
export type QueuePolicies = { maxCalls: number; callsForAbsence: number };
export type QueueAbilities = { call: boolean; manage: boolean };

export function queueActions(facts: QueueFacts, policies: QueuePolicies, abilities: QueueAbilities): ActionSet<QueueAction> {
  const allowed: QueueAction[] = [];
  const blocked: BlockedAction<QueueAction>[] = [];
  const add = (action: QueueAction, reason: string | null) => reason ? blocked.push({ action, reason }) : allowed.push(action);
  if (abilities.call && ['en_espera', 'llamado'].includes(facts.state)) {
    add('llamar', facts.calls >= policies.maxCalls ? `Ya se llamó ${policies.maxCalls} veces.` : null);
  }
  if (abilities.manage && facts.state === 'llamado') add('atender', null);
  if (abilities.manage && facts.state === 'en_atencion') add('completar', null);
  // FILA-01: nobody "fails to show" without being called N times first.
  if (abilities.manage && facts.state === 'llamado') {
    add('no_se_presento', facts.calls >= policies.callsForAbsence ? null : `Disponible después de ${policies.callsForAbsence} llamados (van ${facts.calls}).`);
  }
  return { allowedActions: allowed, blockedActions: blocked };
}
