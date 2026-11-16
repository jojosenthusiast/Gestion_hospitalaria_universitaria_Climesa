import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { QUEUE_SERVICES, QueueCallNextDto, QueueIssueDto, QueuePriorityDto, QueueTransitionDto, QueueUndoDto } from './queue.dto';
import { PolicyRegistry } from '../platform/policy.registry';
import { AttentionSweepService } from './attention-sweep.service';
import { QUEUE_AREA } from './queue-areas';
import { NEXT_PATIENT_RULE, nextReasonText, proposeNext, queueActions, queueUndoActions } from './attention.rules';

type QueueRow = Record<string, any>;

/**
 * Today's confirmed (or already attended) appointment of a consulta_general number's patient: the "cited" mark and
 * the time used by the next-patient rule. Other areas have no appointments, so their numbers are always walk-ins.
 */
const APPOINTMENT_JOIN = `LEFT JOIN LATERAL (SELECT lower(c.horario) AS start FROM atencion.cita c
      WHERE t.servicio='consulta_general' AND c.paciente_id=t.paciente_id AND c.estado IN ('confirmada','atendida')
        AND (lower(c.horario) AT TIME ZONE 'America/El_Salvador')::date=t.fecha
      ORDER BY lower(c.horario) LIMIT 1) ap ON true`;
const PATIENT_NAME = `coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional)`;

const serviceNames: Record<string, string> = {
  consulta_general: 'Consulta general',
  emergencia: 'Emergencia',
  laboratorio: 'Laboratorio',
  admisiones: 'Admisiones',
};

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
      t.prioridad AS priority,ap.start AS "appointmentAt",
      k.id AS "consultationId",k.estado AS "consultationState"
      FROM atencion.ticket_fila t LEFT JOIN pacientes.paciente p ON p.id=t.paciente_id
      LEFT JOIN infra.espacio e ON e.id=t.consultorio_id
      ${APPOINTMENT_JOIN}
      LEFT JOIN atencion.consulta k ON k.ticket_id=t.id AND k.estado<>'ingresada_por_error' AND k.medico_id=$4::uuid
      WHERE t.fecha=$1::date AND ($2::text IS NULL OR t.servicio=$2) AND ($3::uuid IS NULL OR t.paciente_id=$3)
      ORDER BY t.servicio,t.numero`, [date, service ?? null, own, actor.staffId ?? null])).rows;
      // SEG-02: aggregated read audit with every patient listed.
      await this.commands.audit(c, actor, { action: 'fila.leer', entity: 'ticket_fila', permission: 'fila.ver', detail: { date, patientIds: [...new Set(rows.map(row => row.patientId).filter(Boolean))] } });
      const policies = await this.queuePolicies(c);
      const abilities = { call: contextsOf(actor, 'fila.llamar').length > 0, manage: contextsOf(actor, 'fila.gestionar').length > 0 };
      return rows.map(row => ({ ...row, area: QUEUE_AREA[row.service] ?? 'GEN', walkIn: !row.appointmentAt, ...policies,
        ...queueActions({ state: row.state, calls: row.llamados }, policies, abilities),
        undoActions: queueUndoActions({ state: row.state, calls: row.llamados }, abilities) }));
    });
  }

  async issue(actor: Actor, dto: QueueIssueDto, key?: string) {
    const own = contextsOf(actor, 'fila.emitir').includes('propio');
    const patientId = own ? actor.patientId : dto.patientId;
    if (!patientId) throw new ForbiddenException('La cuenta no está vinculada a un paciente.');
    return this.commands.run(actor, 'fila.emitir', key, dto, async c => {
      const patient = (await c.query("SELECT id FROM pacientes.paciente WHERE id=$1 AND estado IN ('activo','provisional')", [patientId])).rows[0];
      if (!patient) throw new BadRequestException('Selecciona un paciente activo.');
      const date = this.clock.today();
      // W-07: one active number per patient, service and day; `ticket_fila_activo_unico` guarantees it under races.
      const active = (await c.query(`SELECT numero FROM atencion.ticket_fila WHERE paciente_id=$1 AND servicio=$2 AND fecha=$3::date AND estado IN ('en_espera','llamado','en_atencion') LIMIT 1`, [patientId, dto.service, date])).rows[0];
      if (active) throw activeTicket(active.numero);
      const number = (await c.query('SELECT atencion.emitir_numero($1,$2::date) AS number', [dto.service, date])).rows[0].number;
      const row = (await c.query(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,emitido_por,prioridad)
        VALUES($1,$2::date,$3,$4,$5,$6) RETURNING id,servicio AS service,fecha,numero,estado AS state,version,prioridad AS priority`, [dto.service, date, number, patientId, actor.id, dto.priority ?? 'rutina']).catch(error => {
        if (error?.code === '23505' && String(error?.constraint ?? error?.message ?? '').includes('ticket_fila_activo_unico')) throw activeTicket();
        throw error;
      })).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.emitir', entity: 'ticket_fila', entityId: row.id, patientId, permission: 'fila.emitir', detail: { service: dto.service, number, priority: dto.priority ?? 'rutina' } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', row.id, row.version, await this.channels(c, patientId));
      return { ...row, serviceName: serviceNames[dto.service], area: QUEUE_AREA[dto.service], patientId };
    });
  }

  async call(actor: Actor, id: string, dto: QueueTransitionDto, key?: string) {
    return this.commands.run(actor, `fila.llamar:${id}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (!['en_espera', 'llamado'].includes(old.state)) throw new ProblemException('transicion_invalida', 409, 'Solo se puede llamar un número en espera o ya llamado.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      const { maxCalls } = await this.queuePolicies(c);
      if (old.llamados >= maxCalls) throw new ProblemException('fila_max_llamados', 409, `Este número ya se llamó ${maxCalls} veces.`);
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado='llamado',llamados=llamados+1,consultorio_id=COALESCE($2,consultorio_id),version=version+1 WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [id, dto.officeId ?? null])).rows[0];
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
      ap.start AS "appointmentAt",t.version
      FROM atencion.ticket_fila t LEFT JOIN pacientes.paciente p ON p.id=t.paciente_id
      ${APPOINTMENT_JOIN}
      WHERE t.fecha=$1::date AND t.servicio=$2 AND t.estado='en_espera' ORDER BY t.numero ${lock ? 'FOR UPDATE OF t SKIP LOCKED' : ''}`,
    [this.clock.today(), service])).rows.map(row => ({ ...row, appointmentAt: row.appointmentAt ? new Date(row.appointmentAt) : null })) as QueueRow[];
  }

  /** RN-FILA-SIGUIENTE: proposal for one area, as returned to reception (`GET /fila/siguiente`) and to the doctor on signing. */
  async proposalIn(c: PoolClient, service: string) {
    const next = proposeNext(await this.waiting(c, service, false) as any[], this.clock.now());
    return { service, area: QUEUE_AREA[service], rule: NEXT_PATIENT_RULE, proposal: next ? this.proposalOf(service, next.ticket, next.reason) : null };
  }

  /** The proposal shows a patient's name: its read is audited like the list (SEG-02). */
  async auditedProposal(c: PoolClient, actor: Actor, service: string) {
    const result = await this.proposalIn(c, service);
    if (result.proposal) await this.commands.audit(c, actor, { action: 'fila.leer', entity: 'ticket_fila', entityId: result.proposal.id, patientId: result.proposal.patientId ?? undefined, permission: 'fila.ver', detail: { service, proposal: true, patientIds: [result.proposal.patientId].filter(Boolean) } });
    return result;
  }

  private proposalOf(service: string, ticket: QueueRow, reason: Parameters<typeof nextReasonText>[0]) {
    return { id: ticket.id, numero: ticket.numero, area: QUEUE_AREA[service], patientId: ticket.patientId ?? null, patientName: ticket.patientName ?? null, priority: ticket.priority,
      appointmentAt: ticket.appointmentAt ? ticket.appointmentAt.toISOString() : null, version: ticket.version, reason, reasonText: nextReasonText(reason, ticket.appointmentAt) };
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
      const chosen = proposeNext(await this.waiting(c, dto.service, true) as any[], this.clock.now());
      if (!chosen) throw new ProblemException('fila_sin_espera', 409, 'No hay números en espera en este servicio.');
      const next = chosen.ticket as QueueRow;
      const row = (await c.query(`UPDATE atencion.ticket_fila SET estado='llamado',llamados=llamados+1,consultorio_id=COALESCE($2,consultorio_id),version=version+1 WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [next.id, dto.officeId ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.llamar', entity: 'ticket_fila', entityId: next.id, patientId: next.patientId ?? undefined, permission: 'fila.llamar', detail: { officeId: dto.officeId ?? null, next: true, reason: chosen.reason } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', next.id, row.version, await this.channels(c, next.patientId));
      return { ...row, numero: next.numero, patientName: next.patientName, area: QUEUE_AREA[dto.service], reason: chosen.reason, reasonText: nextReasonText(chosen.reason, next.appointmentAt) };
    });
  }

  /** Undo of a call (S9): one call less; with none left the number goes back to waiting. The state machine allows llamado → en_espera. */
  async undoCall(actor: Actor, id: string, dto: QueueUndoDto, key?: string) {
    return this.commands.run(actor, `fila.llamar:deshacer:${id}`, key, dto, async c => {
      const old = await this.ownTicket(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La fila cambió; vuelve a cargarla.');
      if (old.state !== 'llamado' || old.llamados < 1) throw new ProblemException('transicion_invalida', 409, 'Solo se deshace el llamado de un número llamado.');
      const row = (await c.query(`UPDATE atencion.ticket_fila SET llamados=llamados-1,estado=CASE WHEN llamados-1=0 THEN 'en_espera' ELSE estado END,version=version+1
        WHERE id=$1 RETURNING id,version,estado AS state,llamados`, [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'fila.deshacer_llamado', entity: 'ticket_fila', entityId: id, patientId: old.patientId, permission: 'fila.llamar', detail: { from: old.state, to: row.state, calls: row.llamados } });
      await this.commands.event(c, 'fila.actualizada', 'ticket_fila', id, row.version, await this.channels(c, old.patientId));
      return row;
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
