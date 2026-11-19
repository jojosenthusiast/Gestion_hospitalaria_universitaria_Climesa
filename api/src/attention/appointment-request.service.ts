import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf, hasPermission } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { CategoryRequestAssignDto, CategoryRequestCancelDto, CategoryRequestCreateDto, CategoryRequestRejectDto } from './appointment-request.dto';
import { Franja, SUGGESTION_DAYS, categoryRequestActions, firstSuggestion, freeSlots } from './appointment-request.rules';
import { businessDate } from '../platform/clock';
import { AttentionService } from './attention.service';

type RequestRow = Record<string, any>;

/**
 * Fase 2, flow A (S8): the patient asks for an appointment by reason (one to three categories), a preferred time of
 * day and a short note, without choosing a doctor. Reception sees the pending requests in an inbox and assigns a
 * doctor and a slot: that creates a regular confirmed appointment (`AttentionService.insertConfirmed`), so reschedule,
 * cancel, no-show and the expiry sweep keep working unchanged. Every command is audited and announced on
 * `cita.actualizada` with entity `cita` and the request id: every client already reloads its `/citas*` reads on that
 * entity, so the reception inbox and the patient's app refresh by realtime without a new subscription.
 */
@Injectable()
export class AppointmentRequestService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly attention: AttentionService, private readonly clock: Clock) {}

  categories() {
    return this.db.query(`SELECT codigo AS code,nombre AS name,descripcion AS description,icono AS icon,especialidades AS specialties,palabras_clave AS keywords
      FROM atencion.categoria_cita WHERE activo ORDER BY orden,nombre`);
  }

  private async channels(c: PoolClient, patientId: string) {
    return channelsFor(c, ['citas.ver'], { users: [await patientAccount(c, patientId)] });
  }

  async create(actor: Actor, dto: CategoryRequestCreateDto, key?: string) {
    const patientId = actor.patientId;
    if (!patientId) throw new ForbiddenException('La cuenta no está vinculada a un paciente.');
    return this.commands.run(actor, 'citas.solicitar:categoria', key, dto, async c => {
      const known = (await c.query('SELECT codigo FROM atencion.categoria_cita WHERE activo AND codigo = ANY($1::text[])', [dto.categories])).rows.map(r => r.codigo);
      const unknown = dto.categories.filter(code => !known.includes(code));
      if (unknown.length) throw new BadRequestException(`Elige una categoría del catálogo (${unknown.join(', ')} no existe).`);
      if (dto.preferredDoctorId) await this.attention.assertDoctor(c, dto.preferredDoctorId);
      await this.attention.assertPendingLimit(c, patientId);
      const row = (await c.query(`INSERT INTO atencion.solicitud_cita(paciente_id,categorias,medico_preferido_id,franja,nota,creado_por)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id,version,estado`, [patientId, dto.categories, dto.preferredDoctorId ?? null, dto.franja, dto.note?.trim() || null, actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.solicitar_categoria', entity: 'solicitud_cita', entityId: row.id, patientId, permission: 'citas.solicitar',
        detail: { requestId: row.id, categories: dto.categories, franja: dto.franja, preferredDoctorId: dto.preferredDoctorId ?? null } });
      await this.commands.event(c, 'cita.actualizada', 'cita', row.id, row.version, await this.channels(c, patientId));
      return { id: row.id, version: row.version, state: row.estado };
    });
  }

  /**
   * Reception (`citas.ver` global) reads every pending request, oldest first, plus the ones resolved in the last 30
   * days; a patient reads only their own. Other `propio` readers (a doctor) have no requests: they carry no doctor yet.
   */
  async list(actor: Actor) {
    const contexts = contextsOf(actor, 'citas.ver');
    const global = contexts.some(context => context !== 'propio');
    const ownPatient = !global && contexts.includes('propio') ? actor.patientId ?? null : null;
    if (!global && !ownPatient) return [];
    const manage = contextsOf(actor, 'citas.agendar').length > 0;
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT s.id,s.paciente_id AS "patientId",
          coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",p.expediente AS record,
          (SELECT coalesce(json_agg(json_build_object('code',k.codigo,'name',k.nombre,'icon',k.icono) ORDER BY array_position(s.categorias,k.codigo)),'[]')
            FROM atencion.categoria_cita k WHERE k.codigo = ANY(s.categorias)) AS categories,
          (SELECT array_agg(e ORDER BY array_position(s.categorias,k.codigo), o) FROM atencion.categoria_cita k, unnest(k.especialidades) WITH ORDINALITY u(e,o) WHERE k.codigo = ANY(s.categorias)) AS "specialtyOrder",
          date_part('year',age($3::date,p.nacimiento))::int AS "patientAge",p.sexo AS "patientSex",
          s.franja,s.nota AS note,s.medico_preferido_id AS "preferredDoctorId",
          (SELECT concat_ws(' ',m.nombres,m.apellidos) FROM personal.persona m WHERE m.id=s.medico_preferido_id) AS "preferredDoctorName",
          s.estado AS state,s.motivo_rechazo AS "rejectionReason",s.creado_en AS "createdAt",s.version,
          (SELECT json_build_object('id',c.id,'doctorId',c.medico_id,'doctorName',concat_ws(' ',m.nombres,m.apellidos),'start',lower(c.horario),'end',upper(c.horario))
            FROM atencion.cita c JOIN personal.persona m ON m.id=c.medico_id WHERE c.id=s.cita_id) AS appointment
        FROM atencion.solicitud_cita s JOIN pacientes.paciente p ON p.id=s.paciente_id
        WHERE ($1::uuid IS NULL OR s.paciente_id=$1) AND (s.estado='pendiente' OR s.creado_en > $2::timestamptz OR $1::uuid IS NOT NULL)
        ORDER BY (s.estado='pendiente') DESC, CASE WHEN s.estado='pendiente' THEN s.creado_en END ASC, s.creado_en DESC, s.id
        LIMIT 300`, [ownPatient, new Date(this.clock.now().valueOf() - 30 * 86_400_000), this.clock.today()])).rows as RequestRow[];
      // Lote 5, S6: whether some doctor of the request's specialties (any doctor when no active doctor has one, as the
      // suggestion does) has a published shift in the next SUGGESTION_DAYS; reception sees the request cannot be booked.
      const now = this.clock.now();
      const doctors = (await c.query(`SELECT coalesce(p.especialidad,'Medicina general') AS specialty,
          EXISTS(SELECT 1 FROM personal.turno t WHERE t.persona_id=p.id AND t.estado IN ('publicado','en_curso')
            AND t.periodo && tstzrange($1::timestamptz,$2::timestamptz,'[)')) AS "onShift"
        FROM personal.persona p WHERE p.tipo='medico' AND p.activo`, [now, new Date(now.valueOf() + SUGGESTION_DAYS * 86_400_000)])).rows as { specialty: string; onShift: boolean }[];
      const staffAvailable = (specialties: string[]) => {
        const matching = doctors.filter(d => specialties.includes(d.specialty));
        return (matching.length ? matching : doctors).some(d => d.onShift);
      };
      // SEG-02: aggregated read audit with every patient listed.
      await this.commands.audit(c, actor, { action: 'citas.solicitudes_leer', entity: 'solicitud_cita', permission: 'citas.ver', detail: { patientIds: [...new Set(rows.map(row => row.patientId))] } });
      const seesAge = hasPermission(actor, 'pacientes.ver_nacimiento'), seesSex = hasPermission(actor, 'pacientes.ver_ficha');
      return rows.map(({ specialtyOrder, appointment, createdAt, patientAge, patientSex, ...row }) => ({
        ...row,
        patientAge: seesAge ? patientAge ?? null : null,
        patientSex: seesSex ? patientSex ?? null : null,
        specialties: [...new Set<string>(specialtyOrder ?? [])],
        staffAvailable: staffAvailable(specialtyOrder ?? []),
        createdAt: new Date(createdAt).toISOString(),
        appointment: appointment ? { ...appointment, start: new Date(appointment.start).toISOString(), end: new Date(appointment.end).toISOString() } : null,
        ...categoryRequestActions(row.state, { manage, ownPatient: !!actor.patientId && actor.patientId === row.patientId }),
      }));
    });
  }

  private async locked(c: PoolClient, id: string, version: number) {
    const row = (await c.query(`SELECT s.id,s.paciente_id AS "patientId",s.estado AS state,s.version,s.nota AS note,
        (SELECT string_agg(k.nombre, ', ' ORDER BY array_position(s.categorias,k.codigo)) FROM atencion.categoria_cita k WHERE k.codigo = ANY(s.categorias)) AS "categoryNames"
      FROM atencion.solicitud_cita s WHERE s.id=$1 FOR UPDATE OF s`, [id])).rows[0] as RequestRow | undefined;
    if (!row) throw new NotFoundException('No se encontró la solicitud de cita.');
    if (row.version !== version) throw new VersionConflictException(row.version, 'La solicitud cambió; vuelve a abrirla.');
    if (row.state !== 'pendiente') throw new ProblemException('solicitud_cita_resuelta', 409, 'La solicitud ya fue atendida; actualiza la bandeja.');
    return row;
  }

  /**
   * A-1 (R7 U1): the doctor and slot the assign panel opens with: the first day, within SUGGESTION_DAYS, with a free slot
   * in the preferred time of day, among the preferred doctor and the doctors of the suggested specialties (all active
   * doctors when none matches). `found` is false when nobody has a slot in that time.
   */
  async suggestion(_actor: Actor, id: string) {
    return this.db.transaction(async c => {
      const request = (await c.query(`SELECT s.id,s.paciente_id,s.estado,s.franja,s.medico_preferido_id AS preferred,
          (SELECT array_agg(e ORDER BY array_position(s.categorias,k.codigo), o) FROM atencion.categoria_cita k, unnest(k.especialidades) WITH ORDINALITY u(e,o) WHERE k.codigo = ANY(s.categorias)) AS specialties
        FROM atencion.solicitud_cita s WHERE s.id=$1`, [id])).rows[0] as RequestRow | undefined;
      if (!request) throw new NotFoundException('No se encontró la solicitud.');
      if (request.estado !== 'pendiente') throw new ProblemException('solicitud_cita_resuelta', 409, 'La solicitud ya fue resuelta.');
      const specialties: string[] = [...new Set<string>(request.specialties ?? [])];
      const doctors = (await c.query(`SELECT id,concat_ws(' ',nombres,apellidos) AS name,coalesce(especialidad,'Medicina general') AS specialty FROM personal.persona
        WHERE tipo='medico' AND activo ORDER BY apellidos,nombres,id`)).rows as { id: string; name: string; specialty: string }[];
      const matching = doctors.filter(d => specialties.includes(d.specialty)).sort((a, b) => specialties.indexOf(a.specialty) - specialties.indexOf(b.specialty));
      const preferred = doctors.find(d => d.id === request.preferred);
      const candidates = [...new Map([...(preferred ? [preferred] : []), ...(matching.length ? matching : doctors)].map(d => [d.id, d])).values()];
      const now = this.clock.now().valueOf();
      const from = new Date(`${this.clock.today()}T00:00:00-06:00`), to = new Date(from.valueOf() + SUGGESTION_DAYS * 86_400_000);
      const ids = candidates.map(d => d.id);
      const [shifts, appointments] = await Promise.all([
        c.query(`SELECT persona_id AS id,lower(periodo) AS start,upper(periodo) AS "end" FROM personal.turno
          WHERE persona_id=ANY($1::uuid[]) AND estado IN ('publicado','en_curso') AND periodo && tstzrange($2::timestamptz,$3::timestamptz,'[)')`, [ids, from, to]),
        c.query(`SELECT medico_id AS id,lower(horario) AS start,upper(horario) AS "end" FROM atencion.cita
          WHERE medico_id=ANY($1::uuid[]) AND estado IN ('solicitada','confirmada') AND horario && tstzrange($2::timestamptz,$3::timestamptz,'[)')`, [ids, from, to]),
      ]);
      const by = (rows: any[], doctorId: string) => rows.filter(r => r.id === doctorId).map(r => ({ start: new Date(r.start).valueOf(), end: Math.min(new Date(r.end).valueOf(), to.valueOf()) }));
      const best = firstSuggestion(candidates, doctorId => freeSlots(by(shifts.rows, doctorId), by(appointments.rows, doctorId), now), request.franja as Franja, at => businessDate(new Date(at)));
      if (!best) return { found: false, doctorId: null, doctorName: null, specialty: null, date: null, start: null, end: null };
      return { found: true, doctorId: best.doctor.id, doctorName: best.doctor.name, specialty: best.doctor.specialty, date: best.date, start: new Date(best.slot.start).toISOString(), end: new Date(best.slot.end).toISOString() };
    });
  }

  async assign(actor: Actor, id: string, dto: CategoryRequestAssignDto, key?: string) {
    return this.commands.run(actor, `citas.agendar:solicitud_categoria:${id}:asignar`, key, dto, async c => {
      const request = await this.locked(c, id, dto.version);
      const reason = [request.categoryNames, request.note].filter(Boolean).join(' · ') || null;
      const appointment = await this.attention.insertConfirmed(c, actor, { patientId: request.patientId, doctorId: dto.doctorId, start: dto.start, end: dto.end, reason });
      const row = (await c.query(`UPDATE atencion.solicitud_cita SET estado='asignada',cita_id=$2,resuelta_por=$3,resuelta_en=$4,version=version+1 WHERE id=$1 RETURNING version`, [id, appointment.id, actor.id, this.clock.now()])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.asignar', entity: 'solicitud_cita', entityId: id, patientId: request.patientId, permission: 'citas.agendar',
        detail: { requestId: id, appointmentId: appointment.id, doctorId: dto.doctorId, start: appointment.start.toISOString(), end: appointment.end.toISOString() } });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, request.patientId));
      return { id, version: row.version, state: 'asignada', appointmentId: appointment.id };
    });
  }

  async reject(actor: Actor, id: string, dto: CategoryRequestRejectDto, key?: string) {
    return this.commands.run(actor, `citas.agendar:solicitud_categoria:${id}:rechazar`, key, dto, async c => {
      const request = await this.locked(c, id, dto.version);
      const row = (await c.query(`UPDATE atencion.solicitud_cita SET estado='rechazada',motivo_rechazo=$2,resuelta_por=$3,resuelta_en=$4,version=version+1 WHERE id=$1 RETURNING version`, [id, dto.rejectionReason.trim(), actor.id, this.clock.now()])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.solicitud_rechazar', entity: 'solicitud_cita', entityId: id, patientId: request.patientId, permission: 'citas.agendar', reason: dto.rejectionReason.trim(), detail: { requestId: id } });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, request.patientId));
      return { id, version: row.version, state: 'rechazada' };
    });
  }

  /** The patient withdraws their own pending request; reception rejects instead (with a reason the patient sees). */
  async cancel(actor: Actor, id: string, dto: CategoryRequestCancelDto, key?: string) {
    return this.commands.run(actor, `citas.cancelar:solicitud_categoria:${id}`, key, dto, async c => {
      const owner = (await c.query('SELECT paciente_id FROM atencion.solicitud_cita WHERE id=$1', [id])).rows[0];
      if (!owner) throw new NotFoundException('No se encontró la solicitud de cita.');
      if (!actor.patientId || actor.patientId !== owner.paciente_id) throw new ForbiddenException('Solo puedes retirar tus propias solicitudes; recepción las rechaza con motivo.');
      const request = await this.locked(c, id, dto.version);
      const row = (await c.query(`UPDATE atencion.solicitud_cita SET estado='cancelada',resuelta_por=$2,resuelta_en=$3,version=version+1 WHERE id=$1 RETURNING version`, [id, actor.id, this.clock.now()])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.solicitud_cancelar', entity: 'solicitud_cita', entityId: id, patientId: request.patientId, permission: 'citas.cancelar', detail: { requestId: id } });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, request.patientId));
      return { id, version: row.version, state: 'cancelada' };
    });
  }
}
