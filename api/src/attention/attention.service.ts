import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { VersionConflictException } from '../platform/problem';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { AppointmentCancelDto, AppointmentCreateDto, AppointmentStatusDto, PatientAppointmentRequestDto } from './attention.dto';

type AppointmentRow = Record<string, any>;

@Injectable()
export class AttentionService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private instant(value: string, label: string) {
    if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) throw new BadRequestException(`${label} debe incluir zona horaria.`);
    const result = new Date(value);
    if (!Number.isFinite(result.valueOf())) throw new BadRequestException(`${label} no es válida.`);
    return result;
  }

  private range(startText: string, endText: string) {
    const start = this.instant(startText, 'El inicio');
    const end = this.instant(endText, 'El fin');
    const minutes = (end.valueOf() - start.valueOf()) / 60_000;
    if (minutes !== 20) throw new BadRequestException('Las citas duran exactamente 20 minutos.');
    if (start <= this.clock.now()) throw new BadRequestException('La cita debe programarse en una fecha futura.');
    return { start, end };
  }

  private async patient(c: PoolClient, id: string) {
    const row = (await c.query("SELECT id FROM pacientes.paciente WHERE id=$1 AND estado IN ('activo','provisional')", [id])).rows[0];
    if (!row) throw new BadRequestException('Selecciona un paciente activo.');
  }

  private async doctor(c: PoolClient, id: string) {
    const row = (await c.query("SELECT id FROM personal.persona WHERE id=$1 AND tipo='medico' AND activo", [id])).rows[0];
    if (!row) throw new BadRequestException('Selecciona un médico activo.');
  }

  private async allowedToSee(actor: Actor, patientId?: string, doctorId?: string) {
    const contexts = contextsOf(actor, 'citas.ver');
    if (contexts.includes('x')) return;
    if (contexts.includes('propio') && ((actor.patientId && actor.patientId === patientId) || (actor.staffId && actor.staffId === doctorId))) return;
    throw new ForbiddenException('Solo puedes consultar tus propias citas.');
  }

  private async channels(c: PoolClient, patientId: string) {
    return channelsFor(c, ['citas.ver'], { excludeContexts: ['propio'], users: [await patientAccount(c, patientId)] });
  }

  async catalogs(actor: Actor) {
    const canManagePatients = contextsOf(actor, 'citas.agendar').length > 0;
    const [patients, doctors] = await Promise.all([
      this.db.query(`SELECT id, expediente AS record,
        coalesce(nullif(concat_ws(' ',nombres,primer_apellido,segundo_apellido),''),alias_provisional) AS "fullName",
        (estado IN ('activo','provisional')) AS active
        FROM pacientes.paciente
        WHERE estado IN ('activo','provisional') AND ($1::boolean OR id=$2::uuid)
        ORDER BY primer_apellido,nombres,id
        LIMIT 500`, [canManagePatients, actor.patientId]),
      this.db.query(`SELECT p.id,p.nombres AS "givenNames",p.apellidos AS surnames,p.tipo AS type,
        p.especialidad AS specialty,p.area_id AS "areaId",e.nombre AS area,p.activo AS active
        FROM personal.persona p LEFT JOIN infra.espacio e ON e.id=p.area_id
        WHERE p.tipo='medico' AND p.activo
        ORDER BY p.apellidos,p.nombres,p.id`),
    ]);
    return { patients, doctors };
  }

  async availability(_actor: Actor, doctorId: string, date: string) {
    if (!/^[0-9a-fA-F-]{36}$/.test(doctorId)) throw new BadRequestException('Selecciona un médico válido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD.');

    const dayStart = new Date(`${date}T00:00:00-06:00`);
    const dayEnd = new Date(dayStart.valueOf() + 86_400_000);
    if (!Number.isFinite(dayStart.valueOf())) throw new BadRequestException('La fecha no es válida.');

    const doctor = (await this.db.query("SELECT id FROM personal.persona WHERE id=$1 AND tipo='medico' AND activo", [doctorId]))[0];
    if (!doctor) throw new BadRequestException('Selecciona un médico activo.');

    const [shifts, appointments] = await Promise.all([
      this.db.query(`SELECT lower(periodo) AS start,upper(periodo) AS "end"
        FROM personal.turno
        WHERE persona_id=$1 AND estado IN ('publicado','en_curso')
          AND periodo && tstzrange($2::timestamptz,$3::timestamptz,'[)')
        ORDER BY lower(periodo)`, [doctorId, dayStart, dayEnd]),
      this.db.query(`SELECT lower(horario) AS start,upper(horario) AS "end"
        FROM atencion.cita
        WHERE medico_id=$1 AND estado IN ('solicitada','confirmada')
          AND horario && tstzrange($2::timestamptz,$3::timestamptz,'[)')`, [doctorId, dayStart, dayEnd]),
    ]);

    const durationMinutes = 20;
    const now = this.clock.now().valueOf();
    const occupied = appointments.map((row: any) => [new Date(row.start).valueOf(), new Date(row.end).valueOf()]);
    const slots: Array<{ start: string; end: string }> = [];
    const seen = new Set<string>();
    for (const shift of shifts) {
      const shiftStart = Math.max(new Date(shift.start).valueOf(), dayStart.valueOf(), now);
      const shiftEnd = Math.min(new Date(shift.end).valueOf(), dayEnd.valueOf());
      for (let cursor = shiftStart; cursor + durationMinutes * 60_000 <= shiftEnd; cursor += durationMinutes * 60_000) {
        const end = cursor + durationMinutes * 60_000;
        if (occupied.some(([from, to]) => cursor < to && end > from)) continue;
        const startIso = new Date(cursor).toISOString();
        if (seen.has(startIso)) continue;
        seen.add(startIso);
        slots.push({ start: startIso, end: new Date(end).toISOString() });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    const workPeriods = shifts
      .map((shift: any) => ({
        start: new Date(shift.start).toISOString(),
        end: new Date(shift.end).toISOString(),
      }))
      .filter(period => Number.isFinite(Date.parse(period.start)) && Number.isFinite(Date.parse(period.end)));
    return { doctorId, date, durationMinutes, workPeriods, slots };
  }

  async list(actor: Actor, from?: string, to?: string, patientId?: string, doctorId?: string) {
    const start = from ? this.instant(`${from}T00:00:00-06:00`, 'La fecha inicial') : new Date(this.clock.now().valueOf() - 7 * 86_400_000);
    const end = to ? this.instant(`${to}T23:59:59-06:00`, 'La fecha final') : new Date(this.clock.now().valueOf() + 31 * 86_400_000);
    if (end <= start || end.valueOf() - start.valueOf() > 93 * 86_400_000) throw new BadRequestException('El rango de citas no puede superar 93 días.');
    const ownPatient = contextsOf(actor, 'citas.ver').includes('propio') && actor.patientId ? actor.patientId : patientId ?? null;
    const ownDoctor = contextsOf(actor, 'citas.ver').includes('propio') && actor.staffId ? actor.staffId : doctorId ?? null;
    await this.allowedToSee(actor, ownPatient ?? undefined, ownDoctor ?? undefined);
    return this.db.query(`SELECT c.id,c.paciente_id AS "patientId",coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      c.medico_id AS "doctorId",concat_ws(' ',m.nombres,m.apellidos) AS "doctorName",lower(c.horario) AS start,upper(c.horario) AS "end",
      c.motivo AS reason,c.estado AS state,c.origen AS origin,c.motivo_rechazo AS "rejectionReason",c.version
      FROM atencion.cita c JOIN pacientes.paciente p ON p.id=c.paciente_id JOIN personal.persona m ON m.id=c.medico_id
      WHERE c.horario && tstzrange($1,$2) AND ($3::uuid IS NULL OR c.paciente_id=$3) AND ($4::uuid IS NULL OR c.medico_id=$4)
      ORDER BY lower(c.horario),c.id`, [start, end, ownPatient, ownDoctor]);
  }

  async create(actor: Actor, dto: AppointmentCreateDto | PatientAppointmentRequestDto, patientRequest: boolean, key?: string) {
    const patientId = patientRequest ? actor.patientId : (dto as AppointmentCreateDto).patientId;
    if (!patientId) throw new ForbiddenException('La cuenta no está vinculada a un paciente.');
    const { start, end } = this.range(dto.start, dto.end);
    const permission = patientRequest ? 'citas.solicitar' : 'citas.agendar';
    const state = patientRequest ? 'solicitada' : 'confirmada';
    return this.commands.run(actor, permission, key, dto, async c => {
      await this.patient(c, patientId);
      await this.doctor(c, dto.doctorId);
      const row = (await c.query(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,motivo,estado,origen,creado_por)
        VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7,$8) RETURNING id,version`, [patientId, dto.doctorId, start, end, dto.reason?.trim() || null, state, patientRequest ? 'paciente' : 'recepcion', actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: patientRequest ? 'citas.solicitar' : 'citas.agendar', entity: 'cita', entityId: row.id, permission, detail: { patientId, doctorId: dto.doctorId, start: start.toISOString(), end: end.toISOString() } });
      await this.commands.event(c, 'cita.actualizada', 'cita', row.id, row.version, await this.channels(c, patientId));
      return { id: row.id, version: row.version, state };
    });
  }

  async changeStatus(actor: Actor, id: string, dto: AppointmentStatusDto, key?: string) {
    return this.commands.run(actor, 'citas.agendar', key, dto, async c => {
      const old = (await c.query('SELECT paciente_id,medico_id,estado,version FROM atencion.cita WHERE id=$1 FOR UPDATE', [id])).rows[0] as AppointmentRow | undefined;
      if (!old) throw new NotFoundException('No se encontró la cita.');
      if (old.version !== (dto.version ?? old.version)) throw new VersionConflictException(old.version, 'La cita cambió; vuelve a abrirla.');
      if (dto.status === 'rechazada' && (dto.rejectionReason?.trim().length ?? 0) < 10) throw new BadRequestException('Indica el motivo del rechazo.');
      if (!['solicitada', 'confirmada'].includes(old.estado)) throw new ConflictException('La cita ya no admite cambios de agenda.');
      const row = (await c.query('UPDATE atencion.cita SET estado=$2,motivo_rechazo=$3,version=version+1 WHERE id=$1 RETURNING version', [id, dto.status, dto.rejectionReason?.trim() || null])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.estado', entity: 'cita', entityId: id, permission: 'citas.agendar', detail: { from: old.estado, to: dto.status } });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, old.paciente_id));
      return { id, version: row.version, state: dto.status };
    });
  }

  async cancel(actor: Actor, id: string, dto: AppointmentCancelDto, key?: string) {
    return this.commands.run(actor, 'citas.cancelar', key, dto, async c => {
      const old = (await c.query('SELECT paciente_id,estado,version FROM atencion.cita WHERE id=$1 FOR UPDATE', [id])).rows[0] as AppointmentRow | undefined;
      if (!old) throw new NotFoundException('No se encontró la cita.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La cita cambió; vuelve a abrirla.');
      if (!['solicitada', 'confirmada'].includes(old.estado)) throw new ConflictException('Solo se pueden cancelar citas solicitadas o confirmadas.');
      const own = contextsOf(actor, 'citas.cancelar').includes('propio');
      if (own && actor.patientId !== old.paciente_id) throw new ForbiddenException('Solo puedes cancelar tus propias citas.');
      const row = (await c.query("UPDATE atencion.cita SET estado='cancelada',version=version+1 WHERE id=$1 RETURNING version", [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.cancelar', entity: 'cita', entityId: id, permission: 'citas.cancelar', reason: dto.reason });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, old.paciente_id));
      return { id, version: row.version, state: 'cancelada' };
    });
  }
}
