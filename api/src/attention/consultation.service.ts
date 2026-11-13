import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { VersionConflictException } from '../platform/problem';
import { Clock } from '../platform/clock';
import { channelsFor, patientAccount } from '../platform/channels';
import { ConsultationSignDto, ConsultationStartDto, ConsultationUpdateDto } from './consultation.dto';

type Row = Record<string, any>;

@Injectable()
export class ConsultationService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private requireDoctor(actor: Actor) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a un médico.');
  }

  /** Roles that read clinical records; the patient's account only once the note is signed (SEG-05, SEG-07). */
  private async channels(c: PoolClient, patientId: string, notifyPatient = false) {
    return channelsFor(c, ['expediente.ver', 'consulta.iniciar'], { users: notifyPatient ? [await patientAccount(c, patientId)] : [] });
  }

  async agenda(actor: Actor) {
    this.requireDoctor(actor);
    return this.db.query(`SELECT c.id AS "appointmentId",c.paciente_id AS "patientId",
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      lower(c.horario) AS start,upper(c.horario) AS "end",c.motivo AS reason,c.estado AS "appointmentState",
      k.id AS "consultationId",k.estado AS "consultationState",k.motivo AS "consultationReason",
      k.examen_fisico AS "physicalExam",k.plan,k.version,k.iniciada_en AS "startedAt",k.firmada_en AS "signedAt"
      FROM atencion.cita c
      JOIN pacientes.paciente p ON p.id=c.paciente_id
      LEFT JOIN atencion.consulta k ON k.cita_id=c.id AND k.estado<>'ingresada_por_error'
      WHERE c.medico_id=$1 AND c.estado IN ('confirmada','atendida')
        AND lower(c.horario) >= $2::timestamptz - interval '7 days'
        AND lower(c.horario) <= $2::timestamptz + interval '31 days'
      ORDER BY lower(c.horario),c.id`, [actor.staffId, this.clock.now()]);
  }

  async start(actor: Actor, dto: ConsultationStartDto, key?: string) {
    this.requireDoctor(actor);
    return this.commands.run(actor, 'consulta.iniciar', key, dto, async c => {
      const appointment = (await c.query(`SELECT id,paciente_id,medico_id,estado FROM atencion.cita WHERE id=$1 FOR UPDATE`, [dto.appointmentId])).rows[0] as Row | undefined;
      if (!appointment) throw new NotFoundException('No se encontró la cita.');
      if (appointment.medico_id !== actor.staffId) throw new ForbiddenException('Solo puedes iniciar consultas de tu propia agenda.');
      if (appointment.estado !== 'confirmada') throw new ConflictException('La cita debe estar confirmada para iniciar la consulta.');
      const existing = (await c.query(`SELECT id,version FROM atencion.consulta WHERE cita_id=$1 AND estado<>'ingresada_por_error' FOR UPDATE`, [dto.appointmentId])).rows[0];
      if (existing) throw new ConflictException('La consulta ya fue iniciada para esta cita.');
      const row = (await c.query(`INSERT INTO atencion.consulta(paciente_id,medico_id,consultorio_id,cita_id,motivo,estado,iniciada_en)
        VALUES($1,$2,$3,$4,$5,'abierta',$6) RETURNING id,version,estado`, [appointment.paciente_id, actor.staffId, dto.officeId ?? null, dto.appointmentId, dto.reason?.trim() || null, this.clock.now()])).rows[0];
      await c.query(`INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia)
        VALUES($1,$2,'consulta',$3,tstzrange($4::timestamptz,$4::timestamptz+interval '30 days','[)'))`, [appointment.paciente_id, actor.staffId, row.id, this.clock.now()]);
      await this.commands.audit(c, actor, { action: 'consulta.iniciar', entity: 'consulta', entityId: row.id, patientId: appointment.paciente_id, permission: 'consulta.iniciar', detail: { appointmentId: dto.appointmentId } });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', row.id, row.version, await this.channels(c, appointment.paciente_id));
      return { id: row.id, appointmentId: dto.appointmentId, version: row.version, state: row.estado };
    });
  }

  private async ownOpen(c: PoolClient, actor: Actor, id: string) {
    this.requireDoctor(actor);
    const row = (await c.query(`SELECT id,paciente_id,medico_id,estado,version,motivo,examen_fisico AS "physicalExam",plan
      FROM atencion.consulta WHERE id=$1 FOR UPDATE`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la consulta.');
    if (row.medico_id !== actor.staffId) throw new ForbiddenException('Solo puedes consultar tus propios registros clínicos.');
    if (row.estado !== 'abierta') throw new ConflictException('La consulta ya está firmada y solo admite un addendum.');
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
      const row = (await c.query(`UPDATE atencion.consulta SET estado='firmada',firmada_en=$2,version=version+1 WHERE id=$1 RETURNING id,version,estado,firmada_en AS "signedAt"`, [id, this.clock.now()])).rows[0];
      await c.query(`UPDATE atencion.cita SET estado='atendida',version=version+1 WHERE id=(SELECT cita_id FROM atencion.consulta WHERE id=$1) AND estado='confirmada'`, [id]);
      await this.commands.audit(c, actor, { action: 'consulta.firmar', entity: 'consulta', entityId: id, patientId: old.paciente_id, permission: 'consulta.registrar' });
      await this.commands.event(c, 'consulta.actualizada', 'consulta', id, row.version, await this.channels(c, old.paciente_id, true));
      return { id: row.id, version: row.version, state: row.estado, signedAt: row.signedAt };
    });
  }
}
