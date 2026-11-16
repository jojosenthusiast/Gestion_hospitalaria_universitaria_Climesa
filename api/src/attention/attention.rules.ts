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
  /** The doctor's shift over the slot is marked `ausente` (#114, ASIS-01). */
  doctorAbsent?: boolean;
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
  const absent = 'El médico está ausente en ese horario; reprográmala o cancélala.';

  if (facts.state === 'solicitada' && abilities.manage) {
    add('confirmar', started ? passed : facts.doctorAbsent ? absent : null);
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
    // The patient is not at fault when the doctor did not come; reception cancels or reschedules instead.
    add('no_asistio', facts.hasConsultation ? consultation : facts.doctorAbsent ? absent : started ? null : 'Disponible cuando llegue la hora de la cita.');
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

// ---------------------------------------------------------------------------------------------------------------
// Fase 2, flujo B (S9): queue priority, undo and the "who goes next" rule.

export const QUEUE_PRIORITIES = ['emergencia', 'urgente', 'rutina'] as const;
export type QueuePriority = typeof QUEUE_PRIORITIES[number];
/** Reversible queue actions, kept apart from `allowedActions` so existing clients keep their exact contract. */
export const QUEUE_UNDO_ACTIONS = ['deshacer_llamado'] as const;
export type QueueUndoAction = typeof QUEUE_UNDO_ACTIONS[number];


/** Undo of a call returns the number to waiting (one call less); attend and complete are not reversible (state machine). */
export function queueUndoActions(facts: QueueFacts, abilities: QueueAbilities): QueueUndoAction[] {
  return abilities.call && facts.state === 'llamado' && facts.calls > 0 ? ['deshacer_llamado'] : [];
}

/** Window around the appointment time in which a cited patient goes before the walk-in queue. */
export const APPOINTMENT_WINDOW = { beforeMinutes: 15, afterMinutes: 15 } as const;

/** The documented rule (docs/arquitectura/reglas-negocio.md, RN-FILA-SIGUIENTE); the API returns it with each proposal. */
export const NEXT_PATIENT_RULE = 'Emergencias primero; luego urgentes; luego citas dentro de su ventana (de 15 min antes a 15 min después de la hora, por hora de cita); luego el resto en orden de llegada (número del área).';

export type NextReason = 'emergencia' | 'urgente' | 'cita' | 'llegada';
export type NextCandidate = { id: string; numero: number; priority: QueuePriority | string; appointmentAt: Date | null };

const MINUTE = 60_000;
const byNumber = (a: NextCandidate, b: NextCandidate) => a.numero - b.numero;

/**
 * Who goes next among the waiting numbers of one area. Pure: the API uses it for `GET /fila/siguiente`, for
 * `POST /fila/llamar-siguiente` and after a consultation is signed, so the proposal and the call never disagree.
 * 1. `emergencia`, by number. 2. `urgente`, by number. 3. Cited patients whose appointment window contains `now`,
 * by appointment time and then number. 4. Everyone else (walk-ins and cited patients outside their window) by number.
 */
export function proposeNext<T extends NextCandidate>(waiting: T[], now: Date): { ticket: T; reason: NextReason } | null {
  if (!waiting.length) return null;
  for (const priority of ['emergencia', 'urgente'] as const) {
    const first = waiting.filter(t => t.priority === priority).sort(byNumber)[0];
    if (first) return { ticket: first, reason: priority };
  }
  const instant = now.valueOf();
  const inWindow = waiting.filter(t => t.appointmentAt
    && instant >= t.appointmentAt.valueOf() - APPOINTMENT_WINDOW.beforeMinutes * MINUTE
    && instant <= t.appointmentAt.valueOf() + APPOINTMENT_WINDOW.afterMinutes * MINUTE)
    .sort((a, b) => a.appointmentAt!.valueOf() - b.appointmentAt!.valueOf() || byNumber(a, b));
  if (inWindow[0]) return { ticket: inWindow[0], reason: 'cita' };
  return { ticket: [...waiting].sort(byNumber)[0], reason: 'llegada' };
}

const hhmmLocal = (at: Date) => new Date(at.valueOf() - 6 * 3_600_000).toISOString().slice(11, 16);
/** Spanish sentence shown to reception and the doctor next to the proposal. */
export function nextReasonText(reason: NextReason, appointmentAt: Date | null) {
  if (reason === 'emergencia') return 'Emergencia: pasa antes que todos.';
  if (reason === 'urgente') return 'Urgente: pasa antes que las citas y la fila.';
  if (reason === 'cita') return `Cita de las ${appointmentAt ? hhmmLocal(appointmentAt) : ''}, dentro de su ventana.`;
  return 'Orden de llegada.';
}
