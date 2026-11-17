import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { businessDate, Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { QUEUE_SERVICES, QueueCallNextDto, QueueIssueDto, QueuePriorityDto, QueueTransitionDto, QueueUndoDto, QueueVoidDto } from './queue.dto';
import { PolicyRegistry } from '../platform/policy.registry';
import { AttentionSweepService } from './attention-sweep.service';
import { QUEUE_AREA } from './queue-areas';
import { NEXT_PATIENT_RULE, NEXT_PATIENT_RULE_DOCTOR, nextReasonText, proposeNextFor, queueActions, queueUndoActions } from './attention.rules';

type QueueRow = Record<string, any>;

/**
 * The appointment of a number: the "cited" mark, its time and doctor (B-4) used by the next-patient rule.
 * D-1 (R7 U1): a number issued from an appointment (`cita_id`) keeps that appointment while it is confirmed or attended.
 * A number without the link falls back to the patient's confirmed consulta_general appointment of that day, as before;
 * an appointment in a final state does not count there: a patient seen earlier who comes back is a walk-in. Other
 * areas have no appointments, so their unlinked numbers are always walk-ins.
 */
const APPOINTMENT_JOIN = `LEFT JOIN LATERAL (SELECT c.id,lower(c.horario) AS start,c.medico_id AS doctor_id,concat_ws(' ',m.nombres,m.apellidos) AS doctor_name
      FROM atencion.cita c JOIN personal.persona m ON m.id=c.medico_id
      WHERE (t.cita_id IS NOT NULL AND c.id=t.cita_id AND c.estado IN ('confirmada','atendida'))
         OR (t.cita_id IS NULL AND t.servicio='consulta_general' AND c.paciente_id=t.paciente_id AND c.estado='confirmada'
           AND (lower(c.horario) AT TIME ZONE 'America/El_Salvador')::date=t.fecha)
      ORDER BY lower(c.horario) LIMIT 1) ap ON true`;
/** B-3: minutes during which whoever issued a number may void it while it still waits. */
export const VOID_MINUTES = 10;
/** Permission that makes a caller a clinician who takes the number (T10f): reception and assistants call without it. */
const CLINICIAN_PERMISSION = 'consulta.iniciar';
const PATIENT_NAME = `coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional)`;

const serviceNames: Record<string, string> = {
  consulta_general: 'Consulta general',
  emergencia: 'Emergencia',
  laboratorio: 'Laboratorio',
  admisiones: 'Admisiones',
};

/** B-5: queue service of an area by the suffix of its code (P1-CON, P1-EMG, P1-LAB, P1-REC); other areas have no queue. */
const AREA_SERVICE: Record<string, string> = { CON: 'consulta_general', EMG: 'emergencia', LAB: 'laboratorio', REC: 'admisiones' };
const serviceOfArea = (code: string) => AREA_SERVICE[code.split('-').pop()?.toUpperCase() ?? ''] ?? null;

const activeTicket = (number?: number) => new ProblemException('ticket_activo_existente', 409,
  number ? `El paciente ya tiene el número ${number} activo en este servicio hoy.` : 'El paciente ya tiene un número activo en este servicio hoy.');

@Injectable()
export class QueueService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock, private readonly policies: PolicyRegistry, private readonly sweeper: AttentionSweepService) {}

  private async queuePolicies(c: PoolClient) {
    const now = this.clock.now();
    const [max, absence] = await Promise.all([
      this.policies.value<{ llamados: number }>(c, 'fila.llamados_maximos', now),
      this.policies.value<{ llamados: number }>(c, 'fila.llamados_para_ausencia', now),
    ]);
    return { maxCalls: max.llamados, callsForAbsence: absence.llamados };
  }

  private date(value?: string) {
    const date = value ?? this.clock.today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD.');
    return date;
  }

  private async ownTicket(c: PoolClient, actor: Actor, id: string, lock = true) {
    const row = (await c.query(`SELECT id,servicio AS service,fecha,numero,paciente_id AS "patientId",estado AS state,
      consultorio_id AS "officeId",llamados,version,prioridad AS priority FROM atencion.ticket_fila WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0] as QueueRow | undefined;
    if (!row) throw new NotFoundException('No se encontró el número de fila.');
    if (!this.seesWholeQueue(actor) && (!actor.patientId || actor.patientId !== row.patientId)) throw new ForbiddenException('Solo puedes consultar tu propio número de fila.');
    return row;
  }

  /** `fila.ver` con contexto distinto de `propio` ve la fila completa; con `propio`, solo el número del paciente vinculado. */
  private seesWholeQueue(actor: Actor) {
    return contextsOf(actor, 'fila.ver').some(context => context !== 'propio');
  }

  private async channels(c: PoolClient, patientId?: string) {
    return channelsFor(c, ['fila.ver', 'fila.llamar', 'fila.gestionar'], { users: [patientId ? await patientAccount(c, patientId) : null] });
  }

  /**
   * The day's queue. `consultationId`/`consultationState` describe the consultation started from each number only when
   * it belongs to the reading professional, so the doctor resumes their own consultation; nobody else sees the id.
   * `calledByMe` says whether the reader made the last call (T10f). `calledByColleague` says another clinician (an
   * account holding `consulta.iniciar`) made it: reception or an assistant calling into the office does not take the
   * number, and neither does a call with no recorded caller. Who called is never exposed.
   */
  async list(actor: Actor, dateText?: string, service?: string) {
    const date = this.date(dateText);
    if (service && !QUEUE_SERVICES.includes(service as any)) throw new BadRequestException('Selecciona un servicio válido.');
    const whole = this.seesWholeQueue(actor);
    // SEG-01: una cuenta con solo `propio` y sin expediente vinculado no tiene número que ver.
    if (!whole && !actor.patientId) return [];
    const own = whole ? null : actor.patientId;
    await this.sweeper.sweepSafely();
    return this.db.transaction(async c => { const rows = (await c.query(`SELECT t.id,t.servicio AS service,t.fecha,t.numero,t.paciente_id AS "patientId",
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      t.estado AS state,t.consultorio_id AS "officeId",e.codigo AS "officeCode",t.llamados,t.version,t.emitido_en AS "issuedAt",
      t.prioridad AS priority,ap.start AS "appointmentAt",ap.id AS "appointmentId",ap.doctor_id AS "appointmentDoctorId",ap.doctor_name AS "appointmentDoctorName",
      (t.cita_id IS NOT NULL) AS "arrivalFromAppointment",(t.emitido_por IS NOT DISTINCT FROM $6::uuid) AS "issuedByMe",
      k.id AS "consultationId",k.estado AS "consultationState",coalesce(t.llamado_por=$4::uuid,false) AS "calledByMe",
      (t.llamado_por IS NOT NULL AND t.llamado_por IS DISTINCT FROM $4::uuid AND EXISTS(SELECT 1 FROM acceso.usuario u
        JOIN acceso.v_permisos_usuario v ON v.usuario_id=u.id WHERE u.persona_personal_id=t.llamado_por AND v.permiso_codigo=$5)) AS "calledByColleague"
      FROM atencion.ticket_fila t LEFT JOIN pacientes.paciente p ON p.id=t.paciente_id
      LEFT JOIN infra.espacio e ON e.id=t.consultorio_id
      ${APPOINTMENT_JOIN}
      LEFT JOIN atencion.consulta k ON k.ticket_id=t.id AND k.estado<>'ingresada_por_error' AND k.medico_id=$4::uuid
      WHERE t.fecha=$1::date AND ($2::text IS NULL OR t.servicio=$2) AND ($3::uuid IS NULL OR t.paciente_id=$3)
      ORDER BY t.servicio,t.numero`, [date, service ?? null, own, actor.staffId ?? null, CLINICIAN_PERMISSION, actor.id])).rows;
      // SEG-02: aggregated read audit with every patient listed.
      await this.commands.audit(c, actor, { action: 'fila.leer', entity: 'ticket_fila', permission: 'fila.ver', detail: { date, patientIds: [...new Set(rows.map(row => row.patientId).filter(Boolean))] } });
      const policies = await this.queuePolicies(c);
      const abilities = { call: contextsOf(actor, 'fila.llamar').length > 0, manage: contextsOf(actor, 'fila.gestionar').length > 0 };
      const now = this.clock.now().valueOf();
      return rows.map(({ issuedByMe, ...row }) => ({ ...row, area: QUEUE_AREA[row.service] ?? 'GEN', walkIn: !row.appointmentAt, ...policies,
        voidableUntil: this.voidableUntil(row, issuedByMe, now),
        ...queueActions({ state: row.state, calls: row.llamados }, policies, abilities),
        undoActions: queueUndoActions({ state: row.state, calls: row.llamados }, abilities) }));
    });
  }

  /** B-3: until when whoever issued a waiting number may void it; null for everyone else and once it moved. */
  private voidableUntil(row: QueueRow, issuedByMe: boolean, now: number) {
    if (!issuedByMe || row.state !== 'en_espera' || !row.issuedAt) return null;
    const until = new Date(row.issuedAt).valueOf() + VOID_MINUTES * 60_000;
    return until > now ? new Date(until).toISOString() : null;
  }

  /**
   * D-1: checks the appointment whose arrival is registered: confirmed, of today, of the same patient and not already
   * registered with another live number. Returns its patient.
   */
  private async arrivalAppointment(c: PoolClient, dto: QueueIssueDto, patientId: string | undefined | null) {
    const appointment = (await c.query(`SELECT id,paciente_id,estado,version,lower(horario) AS start FROM atencion.cita WHERE id=$1 FOR UPDATE`, [dto.appointmentId])).rows[0] as QueueRow | undefined;
    if (!appointment) throw new NotFoundException('No se encontró la cita.');
    if (patientId && patientId !== appointment.paciente_id) throw new ProblemException('validacion', 400, 'La cita es de otro paciente.', 'patientId');
    if (dto.service !== 'consulta_general') throw new ProblemException('validacion', 400, 'La llegada de una cita se registra en Consulta general.', 'service');
    if (appointment.estado !== 'confirmada') throw new ProblemException('transicion_invalida', 409, 'Solo se registra la llegada de una cita confirmada.');
    const day = businessDate(new Date(appointment.start));
    if (day !== this.clock.today()) throw new ProblemException('cita_fuera_de_dia', 409, day > this.clock.today() ? 'La cita es de otro día; registra la llegada el día de la cita.' : 'La cita fue de un día anterior.');
    const linked = (await c.query(`SELECT numero FROM atencion.ticket_fila WHERE cita_id=$1 AND estado IN ('en_espera','llamado','en_atencion','atendido') LIMIT 1`, [dto.appointmentId])).rows[0];
    if (linked) throw new ProblemException('ticket_activo_existente', 409, `La llegada de esta cita ya se registró con el número ${linked.numero}.`);
    return { patientId: appointment.paciente_id as string, version: appointment.version as number };
  }

  async issue(actor: Actor, dto: QueueIssueDto, key?: string) {
    const own = contextsOf(actor, 'fila.emitir').includes('propio');
    const requested = own ? actor.patientId : dto.patientId;
    if (own && !requested) throw new ForbiddenException('La cuenta no está vinculada a un paciente.');
    if (!requested && !dto.appointmentId) throw new ForbiddenException('La cuenta no está vinculada a un paciente.');
    return this.commands.run(actor, 'fila.emitir', key, dto, async c => {
      const arrival = dto.appointmentId ? await this.arrivalAppointment(c, dto, requested) : null;
      const patientId = arrival?.patientId ?? requested!;
      const patient = (await c.query("SELECT id FROM pacientes.paciente WHERE id=$1 AND estado IN ('activo','provisional')", [patientId])).rows[0];
      if (!patient) throw new BadRequestException('Selecciona un paciente activo.');
      const date = this.clock.today();
      // W-07: one active number per patient, service and day; `ticket_fila_activo_unico` guarantees it under races.
      const active = (await c.query(`SELECT numero FROM atencion.ticket_fila WHERE paciente_id=$1 AND servicio=$2 AND fecha=$3::date AND estado IN ('en_espera','llamado','en_atencion') LIMIT 1`, [patientId, dto.service, date])).rows[0];
      if (active) throw activeTicket(active.numero);
      const number = (await c.query('SELECT atencion.emitir_numero($1,$2::date) AS number', [dto.service, date])).rows[0].number;
      const row = (await c.query(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,emitido_por,prioridad,cita_id,emitido_en)
        VALUES($1,$2::date,$3,$4,$5,$6,$7,$8) RETURNING id,servicio AS service,fecha,numero,estado AS state,version,prioridad AS priority,emitido_en AS "issuedAt"`, [dto.service, date, number, patientId, actor.id, dto.priority ?? 'rutina', dto.appointmentId ?? null, this.clock.now()]).catch(error => {
        const constraint = String(error?.constraint ?? error?.message ?? '');
        if (error?.code === '23505' && (constraint.includes('ticket_fila_activo_unico') || constraint.includes('ticket_fila_cita_unica'))) throw activeTicket();
        throw error;
      })).rows[0];
      // B-1 / break #5: the number is shown where it was issued, with how many wait before it in its area.
      const ahead = Number((await c.query(`SELECT count(*) AS n FROM atencion.ticket_fila WHERE servicio=$1 AND fecha=$2::date AND estado='en_espera' AND numero<$3`, [dto.service, date, number])).rows[0].n);
      const patientName = (await c.query(`SELECT ${PATIENT_NAME} AS name FROM pacientes.paciente p WHERE p.id=$1`, [patientId])).rows[0]?.name ?? null;
      await this.commands.audit(c, actor, { action: 'fila.emitir', entity: 'ticket_fila', entityId: row.id, patientId, permission: 'fila.emitir', detail: { service: dto.service, number, priority: dto.priority ?? 'rutina', ...(dto.appointmentId ? { appointmentId: dto.appointmentId } : {}) } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', row.id, row.version, await this.channels(c, patientId));
      // The agenda shows that the patient arrived (`arrival` in GET /citas): reception's views reload it.
      if (arrival) await this.commands.event(c, 'cita.actualizada', 'cita', dto.appointmentId!, arrival.version, await channelsFor(c, ['citas.ver'], { excludeContexts: ['propio'] }));
      const { issuedAt, ...issued } = row;
      return { ...issued, serviceName: serviceNames[dto.service], area: QUEUE_AREA[dto.service], patientId, patientName, appointmentId: dto.appointmentId ?? null, ahead,
        voidableUntil: new Date(new Date(issuedAt).valueOf() + VOID_MINUTES * 60_000).toISOString() };
    });
  }

  async call(actor: Actor, id: string, dto: QueueTransitionDto, key?: string) {
    return this.commands.run(actor, `fila.llamar:${id}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (!['en_espera', 'llamado'].includes(old.state)) throw new ProblemException('transicion_invalida', 409, 'Solo se puede llamar un número en espera o ya llamado.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      const { maxCalls } = await this.queuePolicies(c);
      if (old.llamados >= maxCalls) throw new ProblemException('fila_max_llamados', 409, `Este número ya se llamó ${maxCalls} veces.`);
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado='llamado',llamados=llamados+1,consultorio_id=COALESCE($2,consultorio_id),llamado_por=$3::uuid,version=version+1 WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [id, dto.officeId ?? null, actor.staffId ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.llamar', entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.llamar', detail: { officeId: dto.officeId ?? null } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }

  async transition(actor: Actor, id: string, state: 'en_atencion' | 'atendido' | 'no_se_presento', dto: QueueTransitionDto, key?: string) {
    return this.commands.run(actor, `fila.gestionar:estado:${id}:${state}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      const allowed: Record<string, string[]> = { en_atencion: ['llamado'], atendido: ['en_atencion'], no_se_presento: ['llamado'] };
      const labels: Record<string, string> = { en_atencion: 'pasar a atención', atendido: 'completar', no_se_presento: 'marcar que no se presentó' };
      if (!allowed[state].includes(old.state)) throw new ProblemException('transicion_invalida', 409, state === 'no_se_presento' && old.state === 'en_espera' ? 'Llama el número antes de marcar que no se presentó.' : `Este número ya no permite ${labels[state]}.`);
      if (state === 'no_se_presento') {
        // FILA-01: only after N unanswered calls (the trigger backs it).
        const { callsForAbsence } = await this.queuePolicies(c);
        if (old.llamados < callsForAbsence) throw new ProblemException('fila_llamados_insuficientes', 409, `Marca "No se presentó" después de ${callsForAbsence} llamados (van ${old.llamados}).`);
      }
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado=$2,consultorio_id=COALESCE($3,consultorio_id),version=version+1 WHERE id=$1 RETURNING id,version,estado AS state`, [id, state, dto.officeId ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: `fila.${state}`, entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.gestionar', reason: dto.reason, detail: { from: old.state, to: state } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }

  /** Waiting numbers of one area today, with what the next-patient rule needs; optionally locked for a call. */
  private async waiting(c: PoolClient, service: string, lock: boolean) {
    return (await c.query(`SELECT t.id,t.numero,t.paciente_id AS "patientId",${PATIENT_NAME} AS "patientName",t.prioridad AS priority,
      ap.start AS "appointmentAt",ap.doctor_id AS "appointmentDoctorId",t.version
      FROM atencion.ticket_fila t LEFT JOIN pacientes.paciente p ON p.id=t.paciente_id
      ${APPOINTMENT_JOIN}
      WHERE t.fecha=$1::date AND t.servicio=$2 AND t.estado='en_espera' ORDER BY t.numero ${lock ? 'FOR UPDATE OF t' : ''}`,
    [this.clock.today(), service])).rows.map(row => ({ ...row, appointmentAt: row.appointmentAt ? new Date(row.appointmentAt) : null })) as QueueRow[];
  }

  /** D-2: a caller who takes numbers into a consultation (`consulta.iniciar` and a staff record) gets their own appointments first. */
  private doctorOf(actor: Actor) {
    return contextsOf(actor, CLINICIAN_PERMISSION).length > 0 && actor.staffId ? actor.staffId : null;
  }

  /**
   * RN-FILA-SIGUIENTE: proposal for one area, as returned to reception (`GET /fila/siguiente`) and to the doctor on
   * signing. With `doctorId` it follows D-2 (`proposeNextFor`) and says so in `rule`.
   */
  async proposalIn(c: PoolClient, service: string, doctorId: string | null = null) {
    const next = proposeNextFor(await this.waiting(c, service, false) as any[], this.clock.now(), doctorId);
    return { service, area: QUEUE_AREA[service], rule: doctorId ? NEXT_PATIENT_RULE_DOCTOR : NEXT_PATIENT_RULE, proposal: next ? this.proposalOf(service, next.ticket, next.reason, next.own) : null };
  }

  /** The proposal shows a patient's name: its read is audited like the list (SEG-02). */
  async auditedProposal(c: PoolClient, actor: Actor, service: string) {
    const result = await this.proposalIn(c, service, this.doctorOf(actor));
    if (result.proposal) await this.commands.audit(c, actor, { action: 'fila.leer', entity: 'ticket_fila', entityId: result.proposal.id, patientId: result.proposal.patientId ?? undefined, permission: 'fila.ver', detail: { service, proposal: true, patientIds: [result.proposal.patientId].filter(Boolean) } });
    return result;
  }

  private proposalOf(service: string, ticket: QueueRow, reason: Parameters<typeof nextReasonText>[0], own = false) {
    return { id: ticket.id, numero: ticket.numero, area: QUEUE_AREA[service], patientId: ticket.patientId ?? null, patientName: ticket.patientName ?? null, priority: ticket.priority,
      appointmentAt: ticket.appointmentAt ? ticket.appointmentAt.toISOString() : null, version: ticket.version, reason, reasonText: nextReasonText(reason, ticket.appointmentAt, own), ownAppointment: own };
  }

  async proposal(actor: Actor, service?: string) {
    if (!service || !QUEUE_SERVICES.includes(service as any)) throw new BadRequestException('Selecciona un servicio válido.');
    if (!this.seesWholeQueue(actor)) throw new ForbiddenException('Solo el personal de la fila ve quién pasa después.');
    return this.db.transaction(async c => {
      return this.auditedProposal(c, actor, service);
    });
  }

  /**
   * FILA-02 + RN-FILA-SIGUIENTE: calls the number the next-patient rule proposes for the area (emergencies, urgent,
   * appointments inside their window, then arrival order). `officeId` sends the patient to that consulting room.
   */
  async callNext(actor: Actor, dto: QueueCallNextDto, key?: string) {
    return this.commands.run(actor, `fila.llamar:siguiente:${dto.service}`, key, dto, async c => {
      // Serialize call-next per service and day: a second caller waits for the first to commit and then sees the
      // remaining queue. SKIP LOCKED would hide every waiting row (or the proposed one) from it instead.
      await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`atencion.fila.llamar_siguiente:${dto.service}:${this.clock.today()}`]);
      const waiting = await this.waiting(c, dto.service, true);
      const chosen = proposeNextFor(waiting as any[], this.clock.now(), this.doctorOf(actor));
      if (!chosen) throw new ProblemException('fila_sin_espera', 409, waiting.length ? 'Quienes esperan tienen cita con otro médico en este momento.' : 'No hay números en espera en este servicio.');
      const next = chosen.ticket as QueueRow;
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado='llamado',llamados=llamados+1,consultorio_id=COALESCE($2,consultorio_id),llamado_por=$3::uuid,version=version+1 WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [next.id, dto.officeId ?? null, actor.staffId ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.llamar', entity: 'ticket_fila', entityId: next.id, patientId: next.patientId ?? undefined, permission: 'fila.llamar', detail: { officeId: dto.officeId ?? null, next: true, reason: chosen.reason, ownAppointment: chosen.own } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', next.id, row.version, await this.channels(c, next.patientId));
      return { ...row, numero: next.numero, patientName: next.patientName, area: QUEUE_AREA[dto.service], reason: chosen.reason, reasonText: nextReasonText(chosen.reason, next.appointmentAt, chosen.own), ownAppointment: chosen.own };
    });
  }

  /**
   * Undo of a call (S9): one call less; with none left the number goes back to waiting without caller or office (the
   * public board shows no office for it). The state machine allows llamado → en_espera.
   */
  async undoCall(actor: Actor, id: string, dto: QueueUndoDto, key?: string) {
    return this.commands.run(actor, `fila.llamar:deshacer:${id}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      if (old.state !== 'llamado' || old.llamados < 1) throw new ProblemException('transicion_invalida', 409, 'Solo se deshace el llamado de un número llamado.');
      const row = (await c.query(`UPDATE atencion.ticket_fila SET llamados=llamados-1,estado=CASE WHEN llamados-1=0 THEN 'en_espera' ELSE estado END,
        llamado_por=CASE WHEN llamados-1=0 THEN NULL ELSE llamado_por END,consultorio_id=CASE WHEN llamados-1=0 THEN NULL ELSE consultorio_id END,version=version+1
        WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.deshacer_llamado', entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.llamar', detail: { from: old.state, to: row.state, calls: row.llamados } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }

  /**
   * B-3: whoever issued a number voids it while it still waits, within VOID_MINUTES (a number issued to the wrong
   * patient or service). It closes as `cerrado`; the number of the area is not reused. A linked appointment is free
   * again for a new arrival (the unique index only covers live numbers).
   */
  async voidIssued(actor: Actor, id: string, dto: QueueVoidDto, key?: string) {
    return this.commands.run(actor, `fila.emitir:anular:${id}`, key, dto, async c => {
      const old = (await c.query(`SELECT id,estado AS state,version,paciente_id AS "patientId",emitido_por AS "issuedBy",emitido_en AS "issuedAt",numero,servicio FROM atencion.ticket_fila WHERE id=$1 FOR UPDATE`, [id])).rows[0] as QueueRow | undefined;
      if (!old) throw new NotFoundException('No se encontró el número de fila.');
      if (old.issuedBy !== actor.id) throw new ForbiddenException('Solo quien emitió el número puede anularlo.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      if (old.state !== 'en_espera') throw new ProblemException('transicion_invalida', 409, 'Solo se anula un número que todavía espera.');
      if (this.clock.now().valueOf() > new Date(old.issuedAt).valueOf() + VOID_MINUTES * 60_000) throw new ProblemException('transicion_invalida', 409, `Un número se anula hasta ${VOID_MINUTES} minutos después de emitirlo.`);
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado='cerrado',version=version+1 WHERE id=$1 RETURNING id,version,estado AS state`, [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.anular', entity: 'ticket_fila', entityId: id, patientId: old.patientId ?? undefined, permission: 'fila.emitir', detail: { service: old.servicio, number: old.numero } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }

  /**
   * B-5: where the caller works now, so "Llamar siguiente" needs no service choice. The service comes from the area of
   * the shift in progress (its code suffix: CON, EMG, LAB, REC); the consulting room is the one of the caller's latest
   * consultation of today, else the latest office the caller called a number into today. Nulls when nothing is known.
   */
  async myPost(actor: Actor) {
    const empty = { service: null, area: null, areaName: null, officeId: null, officeCode: null, shiftEnd: null };
    if (!actor.staffId) return empty;
    return this.db.transaction(async c => {
      const now = this.clock.now();
      const shift = (await c.query(`SELECT e.codigo,e.nombre,upper(t.periodo) AS "end" FROM personal.turno t JOIN infra.espacio e ON e.id=t.area_id
        WHERE t.persona_id=$1 AND t.estado IN ('publicado','en_curso') AND t.periodo @> $2::timestamptz ORDER BY lower(t.periodo) DESC LIMIT 1`, [actor.staffId, now])).rows[0];
      const office = (await c.query(`SELECT e.id,e.codigo FROM (
          SELECT k.consultorio_id AS id,k.iniciada_en AS at FROM atencion.consulta k WHERE k.medico_id=$1 AND k.consultorio_id IS NOT NULL AND k.iniciada_en >= $2::timestamptz
          UNION ALL SELECT t.consultorio_id,t.emitido_en FROM atencion.ticket_fila t WHERE t.llamado_por=$1 AND t.consultorio_id IS NOT NULL AND t.fecha=$3::date) o
        JOIN infra.espacio e ON e.id=o.id ORDER BY o.at DESC LIMIT 1`, [actor.staffId, new Date(`${this.clock.today()}T00:00:00-06:00`), this.clock.today()])).rows[0];
      const service = shift ? serviceOfArea(String(shift.codigo)) : null;
      return { service, area: service ? QUEUE_AREA[service] : null, areaName: shift?.nombre ?? null, officeId: office?.id ?? null, officeCode: office?.codigo ?? null, shiftEnd: shift ? new Date(shift.end).toISOString() : null };
    });
  }

  /** Triage changes the priority of a number that has not been attended yet. */
  async setPriority(actor: Actor, id: string, dto: QueuePriorityDto, key?: string) {
    return this.commands.run(actor, `fila.gestionar:prioridad:${id}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      if (!['en_espera', 'llamado'].includes(old.state)) throw new ProblemException('transicion_invalida', 409, 'La prioridad solo cambia antes de la atención.');
      const row = (await c.query(`UPDATE atencion.ticket_fila SET prioridad=$2,version=version+1 WHERE id=$1 RETURNING id,version,estado AS state,prioridad AS priority`, [id, dto.priority])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.prioridad', entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.gestionar', reason: dto.reason, detail: { from: old.priority, to: dto.priority } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
    });
  }
}
