import { appointmentCategoriesSql } from './appointment-categories';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { businessDate, Clock } from '../platform/clock';
import { appointmentActions } from './attention.rules';
import { channelsFor, patientAccount } from '../platform/channels';
import { requireCurrentEnrollment } from '../platform/enrollment';
import { ConsultationSignDto, ConsultationStartDto, ConsultationUpdateDto } from './consultation.dto';
import { QueueService } from './queue.service';

type Row = Record<string, any>;

@Injectable()
export class ConsultationService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock, private readonly queue: QueueService) {}

  private requireDoctor(actor: Actor) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a un médico.');
  }

  /** Roles that read clinical records; the patient's account only once the note is signed (SEG-05, SEG-07). */
  private async channels(c: PoolClient, patientId: string, notifyPatient = false) {
    return channelsFor(c, ['expediente.ver', 'consulta.iniciar'], { users: notifyPatient ? [await patientAccount(c, patientId)] : [] });
  }

  async agenda(actor: Actor) {
    this.requireDoctor(actor);
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT c.id AS "appointmentId",c.paciente_id AS "patientId",
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      lower(c.horario) AS start,upper(c.horario) AS "end",c.motivo AS reason,c.estado AS "appointmentState",
      k.id AS "consultationId",k.estado AS "consultationState",k.motivo AS "consultationReason",
      k.examen_fisico AS "physicalExam",k.plan,k.version,k.iniciada_en AS "startedAt",k.firmada_en AS "signedAt",
      ${appointmentCategoriesSql('c.id')} AS categories
      FROM atencion.cita c
      JOIN pacientes.paciente p ON p.id=c.paciente_id
      LEFT JOIN atencion.consulta k ON k.cita_id=c.id AND k.estado<>'ingresada_por_error'
      WHERE c.medico_id=$1 AND c.estado IN ('confirmada','atendida')
        AND lower(c.horario) >= $2::timestamptz - interval '7 days'
        AND lower(c.horario) <= $2::timestamptz + interval '31 days'
      ORDER BY lower(c.horario),c.id`, [actor.staffId, this.clock.now()])).rows;
      // SEG-02: one aggregated read audit with every patient shown.
      await this.commands.audit(c, actor, { action: 'consulta.agenda_leer', entity: 'consulta', permission: 'consulta.iniciar', detail: { patientIds: [...new Set(rows.map(row => row.patientId))] } });
      // CITA-04 / MA-CIT-03: the doctor's own actions (start the consultation only on the appointment's day).
      const now = this.clock.now();
      const abilities = { manage: false, cancelAny: false, cancelOwn: false, requestOwn: false, ownPatient: false, ownDoctor: true };
      const policies = { cancelHours: 0, maxReschedules: 0 };
      return rows.map(row => {
        const start = new Date(row.start);
        const facts = { state: row.appointmentState, start, now, startDate: businessDate(start), today: businessDate(now), hasConsultation: !!row.consultationId, pendingReschedule: false, reschedules: 0 };
        const actions = appointmentActions(facts, policies, abilities);
        return { ...row, allowedActions: actions.allowedActions.filter(a => a === 'iniciar_consulta'), blockedActions: actions.blockedActions.filter(a => a.action === 'iniciar_consulta') };
      });
    });
  }

  /** m-22: the doctor's own open consultations of any day (from an appointment or a queue number), oldest first. */
  async unsigned(actor: Actor) {
    this.requireDoctor(actor);
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT k.id,k.paciente_id AS "patientId",
        coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
        k.cita_id AS "appointmentId",k.ticket_id AS "ticketId",k.motivo AS reason,k.iniciada_en AS "startedAt",k.version
        FROM atencion.consulta k JOIN pacientes.paciente p ON p.id=k.paciente_id
        WHERE k.medico_id=$1 AND k.estado='abierta' ORDER BY k.iniciada_en,k.id LIMIT 200`, [actor.staffId])).rows;
      await this.commands.audit(c, actor, { action: 'consulta.sin_firmar_leer', entity: 'consulta', permission: 'consulta.iniciar', detail: { patientIds: [...new Set(rows.map(row => row.patientId))] } });
      return rows;
    });
  }

  /**
   * A second start of the same appointment or queue number answers 409 `consulta_ya_iniciada`. When the existing
   * consultation is the actor's own, the problem carries `consultaId` so the client resumes it instead of failing.
   */
  private async rejectStarted(c: PoolClient, actor: Actor, column: 'cita_id' | 'ticket_id', id: string, message: string) {
    const existing = (await c.query(`SELECT id,medico_id FROM atencion.consulta WHERE ${column}=$1 AND estado<>'ingresada_por_error' FOR UPDATE`, [id])).rows[0] as Row | undefined;
    if (!existing) return;
    throw new ProblemException('consulta_ya_iniciada', 409, message, undefined, existing.medico_id === actor.staffId ? { consultaId: existing.id } : {});
  }

  /** Locks the appointment and checks it belongs to the doctor and is confirmed. */
  private async fromAppointment(c: PoolClient, actor: Actor, id: string) {
    const appointment = (await c.query(`SELECT id,paciente_id,medico_id,estado FROM atencion.cita WHERE id=$1 FOR UPDATE`, [id])).rows[0] as Row | undefined;
    if (!appointment) throw new NotFoundException('No se encontró la cita.');
    if (appointment.medico_id !== actor.staffId) throw new ForbiddenException('Solo puedes iniciar consultas de tu propia agenda.');
    if (appointment.estado !== 'confirmada') throw new ProblemException('transicion_invalida', 409, 'La cita debe estar confirmada para iniciar la consulta.');
    // MA-CIT-03: the consultation starts on the appointment's day, never before (nor on a later day).
    const day = businessDate(new Date((await c.query('SELECT lower(horario) AS start FROM atencion.cita WHERE id=$1', [id])).rows[0].start));
    if (day !== this.clock.today()) throw new ProblemException('cita_fuera_de_dia', 409, day > this.clock.today() ? 'La consulta se inicia el día de la cita.' : 'La cita fue de un día anterior; ya no se puede iniciar.');
    await this.rejectStarted(c, actor, 'cita_id', id, 'La consulta ya fue iniciada para esta cita.');
    // D-1 / B-1: the number reception issued when the patient arrived moves into attention with this consultation,
    // so it leaves the waiting queue and signing closes it (it no longer waits forever).
    const ticket = (await c.query(`SELECT id,estado,consultorio_id FROM atencion.ticket_fila WHERE cita_id=$1 AND estado IN ('en_espera','llamado','en_atencion') FOR UPDATE`, [id])).rows[0] as Row | undefined;
    if (ticket) {
      await this.rejectStarted(c, actor, 'ticket_id', ticket.id, 'La consulta ya fue iniciada para el número de esta cita.');
      await this.moveIntoAttention(c, actor, ticket, appointment.paciente_id);
    }
    return { patientId: appointment.paciente_id as string, officeId: (ticket?.consultorio_id ?? null) as string | null, appointmentId: id, ticketId: (ticket?.id ?? null) as string | null };
  }

  /** A waiting or called number moves to `en_atencion` (a waiting one through `llamado`, as the state machine requires). */
  private async moveIntoAttention(c: PoolClient, actor: Actor, ticket: Row, patientId: string) {
    if (ticket.estado === 'en_atencion') return;
    if (ticket.estado === 'en_espera') await c.query(`UPDATE atencion.ticket_fila SET estado='llamado',llamados=llamados+1,llamado_por=$2::uuid,primer_llamado_en=COALESCE(primer_llamado_en,$3::timestamptz),version=version+1 WHERE id=$1`, [ticket.id, actor.staffId, this.clock.now()]);
    const moved = (await c.query(`UPDATE atencion.ticket_fila SET estado='en_atencion',version=version+1 WHERE id=$1 RETURNING version`, [ticket.id])).rows[0];
    await this.commands.event(c, 'fila.actualizada', 'ticket_fila', ticket.id, moved.version, await channelsFor(c, ['fila.ver', 'fila.llamar', 'fila.gestionar'], { users: [await patientAccount(c, patientId)] }));
  }

  /**
   * API-08, RN-22: a patient without an appointment is seen from the queue. The number must have a patient and be
   * called (`llamado`) or already in attention; a called number moves to `en_atencion` in the same transaction.
   */
  private async fromTicket(c: PoolClient, actor: Actor, id: string) {
    const ticket = (await c.query(`SELECT id,paciente_id,estado,consultorio_id,version,cita_id,fecha=$2::date AS today FROM atencion.ticket_fila WHERE id=$1 FOR UPDATE`, [id, this.clock.today()])).rows[0] as Row | undefined;
    if (!ticket) throw new NotFoundException('No se encontró el número de fila.');
    // The day-end sweep may not have closed it yet (it skips while another one holds the lock).
    if (!ticket.today) throw new ProblemException('transicion_invalida', 409, 'El número es de un día anterior; emite uno nuevo para hoy.');
    if (!ticket.paciente_id) throw new ProblemException('validacion', 400, 'El número de fila no tiene un paciente asociado.', 'ticketId');
    if (!['llamado', 'en_atencion'].includes(ticket.estado)) throw new ProblemException('transicion_invalida', 409, 'Llama el número antes de iniciar la consulta.');
    await this.rejectStarted(c, actor, 'ticket_id', id, 'La consulta ya fue iniciada para este número.');
    // D-1 / B-1: a number registered from an appointment carries it: the consultation is of that appointment too, so the
    // appointment does not fall into "no asistió" and signing closes both.
    const appointment = ticket.cita_id ? (await c.query(`SELECT id FROM atencion.cita WHERE id=$1 AND estado='confirmada' FOR UPDATE`, [ticket.cita_id])).rows[0] as Row | undefined : undefined;
    if (appointment) await this.rejectStarted(c, actor, 'cita_id', appointment.id, 'La consulta ya fue iniciada para la cita de este número.');
    if (ticket.estado === 'llamado') await this.moveIntoAttention(c, actor, ticket, ticket.paciente_id);
    return { patientId: ticket.paciente_id as string, officeId: ticket.consultorio_id as string | null, appointmentId: (appointment?.id ?? null) as string | null, ticketId: id as string | null };
  }

  async start(actor: Actor, dto: ConsultationStartDto, key?: string) {
    this.requireDoctor(actor);
    if (!dto.appointmentId === !dto.ticketId) throw new ProblemException('validacion', 400, 'Indica la cita o el número de fila, no ambos.', dto.appointmentId ? 'ticketId' : 'appointmentId');
    return this.commands.run(actor, `consulta.iniciar:${dto.appointmentId ?? dto.ticketId}`, key, dto, async c => {
      const origin = dto.appointmentId ? await this.fromAppointment(c, actor, dto.appointmentId) : await this.fromTicket(c, actor, dto.ticketId!);
      const row = (await c.query(`INSERT INTO atencion.consulta(paciente_id,medico_id,consultorio_id,cita_id,ticket_id,motivo,estado,iniciada_en)
        VALUES($1,$2,$3,$4,$5,$6,'abierta',$7) RETURNING id,version,estado`, [origin.patientId, actor.staffId, dto.officeId ?? origin.officeId, origin.appointmentId, origin.ticketId, dto.reason?.trim() || null, this.clock.now()])).rows[0];
      await c.query(`INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia)
        VALUES($1,$2,'consulta',$3,tstzrange($4::timestamptz,$4::timestamptz+interval '30 days','[)'))`, [origin.patientId, actor.staffId, row.id, this.clock.now()]);
      await this.commands.audit(c, actor, { action: 'consulta.iniciar', entity: 'consulta', entityId: row.id, patientId: origin.patientId, permission: 'consulta.iniciar', detail: dto.appointmentId ? { appointmentId: dto.appointmentId } : { ticketId: dto.ticketId } });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', row.id, row.version, await this.channels(c, origin.patientId));
      return { id: row.id, appointmentId: origin.appointmentId, ticketId: origin.ticketId, version: row.version, state: row.estado };
    });
  }

  private async ownOpen(c: PoolClient, actor: Actor, id: string) {
    this.requireDoctor(actor);
    const row = (await c.query(`SELECT id,paciente_id,medico_id,estado,version,motivo,examen_fisico AS "physicalExam",plan
      FROM atencion.consulta WHERE id=$1 FOR UPDATE`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la consulta.');
    if (row.medico_id !== actor.staffId) throw new ForbiddenException('Solo puedes consultar tus propios registros clínicos.');
    if (row.estado !== 'abierta') throw new ProblemException('consulta_firmada', 409, 'La consulta ya está firmada y no admite cambios.');
    return row;
  }

  async update(actor: Actor, id: string, dto: ConsultationUpdateDto, key?: string) {
    return this.commands.run(actor, `consulta.registrar:${id}`, key, dto, async c => {
      const old = await this.ownOpen(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La consulta cambió; vuelve a abrirla.');
      const row = (await c.query(`UPDATE atencion.consulta SET motivo=$2,examen_fisico=$3,plan=$4,version=version+1 WHERE id=$1
        RETURNING id,version,estado`, [id, dto.reason?.trim() || null, dto.physicalExam?.trim() || null, dto.plan?.trim() || null])).rows[0];
      await this.commands.audit(c, actor, { action: 'consulta.guardar_borrador', entity: 'consulta', entityId: id, patientId: old.paciente_id, permission: 'consulta.registrar' });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, row.version, await this.channels(c, old.paciente_id));
      return { id, version: row.version, state: row.estado };
    });
  }

  async sign(actor: Actor, id: string, dto: ConsultationSignDto, key?: string) {
    return this.commands.run(actor, `consulta.registrar:${id}:firmar`, key, dto, async c => {
      const old = await this.ownOpen(c, actor, id);
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La consulta cambió; vuelve a abrirla.');
      if (!String(old.motivo ?? '').trim() || !String(old.plan ?? '').trim()) throw new ConflictException('Completa el motivo y el plan antes de firmar la consulta.');
      await requireCurrentEnrollment(c, actor.staffId, this.clock.today());
      const row = (await c.query(`UPDATE atencion.consulta SET estado='firmada',firmada_en=$2,version=version+1 WHERE id=$1 RETURNING id,version,estado,firmada_en AS "signedAt"`, [id, this.clock.now()])).rows[0];
      const appointment = (await c.query(`UPDATE atencion.cita SET estado='atendida',version=version+1 WHERE id=(SELECT cita_id FROM atencion.consulta WHERE id=$1) AND estado='confirmada' RETURNING id,version`, [id])).rows[0];
      // m-23: the queue number of the consultation closes in the same transaction.
      const ticket = (await c.query(`UPDATE atencion.ticket_fila SET estado='atendido',version=version+1 WHERE id=(SELECT ticket_id FROM atencion.consulta WHERE id=$1) AND estado='en_atencion' RETURNING id,version`, [id])).rows[0];
      if (ticket) await this.commands.event(c, 'fila.actualizada', 'ticket_fila', ticket.id, ticket.version, await channelsFor(c, ['fila.ver', 'fila.llamar', 'fila.gestionar'], { users: [await patientAccount(c, old.paciente_id)] }));
      // API-03: the appointment moved to `atendida`; agendas and the patient's appointments learn it.
      if (appointment) await this.commands.event(c, 'cita.actualizada', 'cita', appointment.id, appointment.version, await channelsFor(c, ['citas.ver'], { users: [await patientAccount(c, old.paciente_id)] }));
      await this.commands.audit(c, actor, { action: 'consulta.firmar', entity: 'consulta', entityId: id, patientId: old.paciente_id, permission: 'consulta.registrar' });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, row.version, await this.channels(c, old.paciente_id, true));
      // S9: on closing, propose who goes next in the consultation's area (RN-FILA-SIGUIENTE); only to whom sees the whole queue.
      const service = (await c.query(`SELECT t.servicio FROM atencion.consulta k JOIN atencion.ticket_fila t ON t.id=k.ticket_id WHERE k.id=$1`, [id])).rows[0]?.servicio ?? 'consulta_general';
      const nextProposal = contextsOf(actor, 'fila.ver').some(context => context !== 'propio') ? await this.queue.auditedProposal(c, actor, service) : null;
      return { id: row.id, version: row.version, state: row.estado, signedAt: row.signedAt, nextProposal };
    });
  }
}
