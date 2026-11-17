import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { PolicyRegistry } from '../platform/policy.registry';
import { AppointmentCancelDto, AppointmentCreateDto, AppointmentNoShowDto, AppointmentRescheduleDto, AppointmentStatusDto, PatientAppointmentRequestDto, RescheduleDecisionDto } from './attention.dto';
import { appointmentActions, AppointmentAbilities, cancelableUntil } from './attention.rules';
import { AttentionSweepService } from './attention-sweep.service';
import { businessDate } from '../platform/clock';

type AppointmentRow = Record<string, any>;
const SLOT_MS = 20 * 60_000;

/** RN-20a: days a pending category request counts toward the CITA-07 limit (it has no slot that expires it). */
export const CATEGORY_REQUEST_COUNT_DAYS = 14;

@Injectable()
export class AttentionService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock, private readonly policies: PolicyRegistry, private readonly sweeper: AttentionSweepService) {}

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

  /**
   * Una cita solo puede existir dentro de una jornada publicada o en curso del médico. Al crearla
   * (`requireAligned`) además empieza en una franja de 20 minutos contada desde el inicio de esa jornada
   * (API-07); al confirmar una solicitud previa basta con que la jornada la cubra, porque las solicitudes
   * hechas con la disponibilidad anterior pueden tener inicios sin redondear.
   */
  private async doctorHasShift(c: PoolClient, doctorId: string, start: Date, end: Date, requireAligned: boolean) {
    const row = (await c.query(`SELECT lower(periodo) AS start
      FROM personal.turno
      WHERE persona_id=$1 AND estado IN ('publicado','en_curso')
        AND periodo @> $2::timestamptz
        AND periodo @> ($3::timestamptz - interval '1 microsecond')
      LIMIT 1`, [doctorId, start, end])).rows[0];
    if (!row) throw new ProblemException('medico_sin_jornada', 409, 'El médico no tiene una jornada publicada para esa franja.', 'start');
    if (requireAligned && (start.valueOf() - new Date(row.start).valueOf()) % SLOT_MS !== 0) throw new ProblemException('franja_desalineada', 400, 'La cita debe empezar en una franja de 20 minutos de la jornada del médico.', 'start');
  }

  /** Evita que un mismo paciente quede con dos citas simultáneas, incluso con médicos distintos. */
  private async patientHasConflict(c: PoolClient, patientId: string, start: Date, end: Date, excludeId?: string) {
    const row = (await c.query(`SELECT 1
      FROM atencion.cita
      WHERE paciente_id=$1 AND estado IN ('solicitada','confirmada')
        AND horario && tstzrange($2::timestamptz,$3::timestamptz,'[)')
        AND ($4::uuid IS NULL OR id<>$4::uuid)
      LIMIT 1`, [patientId, start, end, excludeId ?? null])).rows[0];
    if (row) throw new ProblemException('paciente_con_cita', 409, 'El paciente ya tiene otra cita en ese horario.', 'start');
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

  async catalogs(actor: Actor, date?: string) {
    if (date !== undefined && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD.');
    const canManagePatients = contextsOf(actor, 'citas.agendar').length > 0;
    const [patients, doctors] = await Promise.all([
      // Recepción busca pacientes con /pacientes/selector (escala a miles); aquí solo queda el propio paciente de una cuenta PAC.
      canManagePatients ? Promise.resolve([] as any[]) : this.db.transaction(async c => { const rows = (await c.query(`SELECT id, expediente AS record,
        coalesce(nullif(concat_ws(' ',nombres,primer_apellido,segundo_apellido),''),alias_provisional) AS "fullName",
        (estado IN ('activo','provisional')) AS active
        FROM pacientes.paciente
        WHERE estado IN ('activo','provisional') AND id=$1::uuid
        ORDER BY primer_apellido,nombres,id
        LIMIT 1`, [actor.patientId])).rows;
        // SEG-02: the catalog read is audited; the identifiers stay (privacidad.md §3.10).
        await this.commands.audit(c, actor, { action: 'citas.catalogo_leer', entity: 'paciente', permission: 'citas.solicitar', detail: { patientCount: rows.length, patientIds: rows.map(row => row.id) } });
        return rows;
      }),
      (async () => {
        const dayStart = date ? new Date(`${date}T00:00:00-06:00`) : null;
        const dayEnd = dayStart ? new Date(dayStart.valueOf() + 86_400_000) : null;
        const rows = await this.db.query(`SELECT p.id,p.nombres AS "givenNames",p.apellidos AS surnames,p.tipo AS type,
          p.especialidad AS specialty,p.area_id AS "areaId",e.nombre AS area,p.activo AS active,
          CASE WHEN $1::timestamptz IS NULL THEN NULL ELSE EXISTS(SELECT 1 FROM personal.turno t WHERE t.persona_id=p.id AND t.estado IN ('publicado','en_curso')
            AND t.periodo && tstzrange($1::timestamptz,$2::timestamptz,'[)')) END AS "tieneTurno"
          FROM personal.persona p LEFT JOIN infra.espacio e ON e.id=p.area_id
          WHERE p.tipo='medico' AND p.activo
          ORDER BY p.apellidos,p.nombres,p.id`, [dayStart, dayEnd]);
        return rows.map((row: any) => ({ ...row, motivo: row.tieneTurno === false ? 'Sin turno ese día' : null }));
      })(),
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
      // API-07: slots are counted from the start of the shift, so a shift already in progress never yields odd times.
      const origin = new Date(shift.start).valueOf();
      const earliest = Math.max(origin, dayStart.valueOf(), now);
      const shiftStart = origin + Math.ceil((earliest - origin) / SLOT_MS) * SLOT_MS;
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
    const franjas = this.dayGrid(shifts, occupied, dayStart.valueOf(), dayEnd.valueOf(), now, durationMinutes * 60_000);
    return { doctorId, date, durationMinutes, workPeriods, slots, franjas };
  }

  /**
   * Todas las franjas del día con su estado para pintar la rejilla: dentro de un turno son `libre`, `ocupado` o `pasado`;
   * sin turno ese día se devuelve la rejilla estándar (08:00 a 16:00) como `sin_turno`.
   */
  private dayGrid(shifts: any[], occupied: number[][], dayStart: number, dayEnd: number, now: number, step: number) {
    const out: Array<{ start: string; end: string; estado: string; motivo: string | null }> = [];
    const push = (from: number, estado: string, motivo: string | null) => out.push({ start: new Date(from).toISOString(), end: new Date(from + step).toISOString(), estado, motivo });
    if (!shifts.length) {
      for (let cursor = dayStart + 8 * 3_600_000; cursor + step <= dayStart + 16 * 3_600_000; cursor += step) push(cursor, 'sin_turno', 'Médico sin turno');
      return out;
    }
    const seen = new Set<number>();
    for (const shift of shifts) {
      const origin = new Date(shift.start).valueOf();
      const from = origin + Math.ceil((Math.max(origin, dayStart) - origin) / step) * step;
      const to = Math.min(new Date(shift.end).valueOf(), dayEnd);
      for (let cursor = from; cursor + step <= to; cursor += step) {
        if (seen.has(cursor)) continue;
        seen.add(cursor);
        const end = cursor + step;
        if (occupied.some(([a, b]) => cursor < b && end > a)) push(cursor, 'ocupado', 'Ocupado');
        else if (cursor < now) push(cursor, 'pasado', 'Ya pasó');
        else push(cursor, 'libre', null);
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  private abilities(actor: Actor, row: Record<string, any>): AppointmentAbilities {
    const cancel = contextsOf(actor, 'citas.cancelar');
    return {
      manage: contextsOf(actor, 'citas.agendar').length > 0,
      cancelAny: cancel.some(context => context !== 'propio'),
      cancelOwn: cancel.includes('propio'),
      requestOwn: contextsOf(actor, 'citas.solicitar').length > 0,
      ownPatient: !!actor.patientId && actor.patientId === row.patientId,
      ownDoctor: contextsOf(actor, 'consulta.iniciar').length > 0 && !!actor.staffId && actor.staffId === row.doctorId,
    };
  }

  private async appointmentPolicies(c: PoolClient, at: Date) {
    const [{ horas }, { maximo }] = await Promise.all([
      this.policies.value<{ horas: number }>(c, 'citas.cancelacion_horas', at),
      this.policies.value<{ maximo: number }>(c, 'citas.reprogramaciones_max', at),
    ]);
    return { cancelHours: horas, maxReschedules: maximo };
  }

  async list(actor: Actor, from?: string, to?: string, patientId?: string, doctorId?: string) {
    const start = from ? this.instant(`${from}T00:00:00-06:00`, 'La fecha inicial') : new Date(this.clock.now().valueOf() - 7 * 86_400_000);
    const end = to ? this.instant(`${to}T23:59:59-06:00`, 'La fecha final') : new Date(this.clock.now().valueOf() + 31 * 86_400_000);
    if (end <= start || end.valueOf() - start.valueOf() > 93 * 86_400_000) throw new BadRequestException('El rango de citas no puede superar 93 días.');
    const ownPatient = contextsOf(actor, 'citas.ver').includes('propio') && actor.patientId ? actor.patientId : patientId ?? null;
    const ownDoctor = contextsOf(actor, 'citas.ver').includes('propio') && actor.staffId ? actor.staffId : doctorId ?? null;
    await this.allowedToSee(actor, ownPatient ?? undefined, ownDoctor ?? undefined);
    await this.sweeper.sweepSafely();
    return this.db.transaction(async c => { const rows = (await c.query(`SELECT c.id,c.paciente_id AS "patientId",coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      c.medico_id AS "doctorId",concat_ws(' ',m.nombres,m.apellidos) AS "doctorName",lower(c.horario) AS start,upper(c.horario) AS "end",
      c.motivo AS reason,c.estado AS state,c.origen AS origin,c.motivo_rechazo AS "rejectionReason",c.version,
      c.cancelacion_codigo AS "cancelReasonCode",c.cancelacion_motivo AS "cancelReason",
      (SELECT json_build_object('id',t.id,'numero',t.numero,'state',t.estado) FROM atencion.ticket_fila t
        WHERE t.cita_id=c.id AND t.estado IN ('en_espera','llamado','en_atencion','atendido') LIMIT 1) AS arrival,
      c.reprogramada_de AS "rescheduledFromId",c.reprogramaciones AS reschedules,
      (SELECT n.id FROM atencion.cita n WHERE n.reprogramada_de=c.id) AS "rescheduledToId",
      atencion.cita_tiene_consulta(c.id) AS "hasConsultation",
      EXISTS (SELECT 1 FROM personal.turno t WHERE t.persona_id=c.medico_id AND t.estado='ausente' AND t.periodo && c.horario) AS "doctorAbsent",
      (SELECT json_build_object('id',r.id,'start',lower(r.horario),'end',upper(r.horario),'state',r.estado,'origin',r.origen,
        'reason',r.motivo,'rejectionReason',r.motivo_rechazo,'version',r.version)
        FROM atencion.reprogramacion r WHERE r.cita_id=c.id ORDER BY r.creado_en DESC LIMIT 1) AS reschedule
      FROM atencion.cita c JOIN pacientes.paciente p ON p.id=c.paciente_id JOIN personal.persona m ON m.id=c.medico_id
      WHERE c.horario && tstzrange($1,$2) AND ($3::uuid IS NULL OR c.paciente_id=$3) AND ($4::uuid IS NULL OR c.medico_id=$4)
      ORDER BY lower(c.horario),c.id`, [start, end, ownPatient, ownDoctor])).rows;
      // SEG-02: aggregated read audit with every patient listed.
      await this.commands.audit(c, actor, { action: 'citas.leer', entity: 'cita', permission: 'citas.ver', detail: { patientIds: [...new Set(rows.map(row => row.patientId))] } });
      const now = this.clock.now();
      const policies = await this.appointmentPolicies(c, now);
      const today = businessDate(now);
      return rows.map(({ hasConsultation, doctorAbsent, reschedules, ...row }) => {
        const startAt = new Date(row.start);
        const facts = { state: row.state, start: startAt, now, startDate: businessDate(startAt), today, hasConsultation, doctorAbsent, pendingReschedule: row.reschedule?.state === 'pendiente', reschedules };
        const abilities = this.abilities(actor, row);
        const until = cancelableUntil(facts, policies, abilities);
        return { ...row, reschedule: row.reschedule ? { ...row.reschedule, start: new Date(row.reschedule.start).toISOString(), end: new Date(row.reschedule.end).toISOString() } : null,
          cancelableUntil: until ? until.toISOString() : null, ...appointmentActions(facts, policies, abilities) };
      });
    });
  }

  /** Locks the appointment and computes the facts the action rules need, so a command rejects exactly what the list blocks. */
  private async lockedFacts(c: PoolClient, id: string) {
    const row = (await c.query(`SELECT c.id,c.paciente_id AS "patientId",c.medico_id AS "doctorId",lower(c.horario) AS start,upper(c.horario) AS "end",c.estado AS state,c.version,
      c.reprogramaciones AS reschedules,c.motivo AS reason,
      atencion.cita_tiene_consulta(c.id) AS "hasConsultation",
      EXISTS (SELECT 1 FROM personal.turno t WHERE t.persona_id=c.medico_id AND t.estado='ausente' AND t.periodo && c.horario) AS "doctorAbsent",
      (SELECT r.id FROM atencion.reprogramacion r WHERE r.cita_id=c.id AND r.estado='pendiente') AS "pendingId"
      FROM atencion.cita c WHERE c.id=$1 FOR UPDATE OF c`, [id])).rows[0] as AppointmentRow | undefined;
    return row;
  }

  private assertAction(actor: Actor, row: AppointmentRow, policies: { cancelHours: number; maxReschedules: number }, action: string) {
    const now = this.clock.now();
    const start = new Date(row.start);
    const facts = { state: row.state, start, now, startDate: businessDate(start), today: businessDate(now), hasConsultation: row.hasConsultation, doctorAbsent: row.doctorAbsent, pendingReschedule: !!row.pendingId, reschedules: row.reschedules };
    const result = appointmentActions(facts, policies, this.abilities(actor, row));
    if (result.allowedActions.includes(action as any)) return;
    const blocked = result.blockedActions.find(item => item.action === action);
    const code = row.hasConsultation ? 'cita_con_consulta' : row.doctorAbsent && blocked?.reason.startsWith('El médico está ausente') ? 'medico_ausente' : action === 'cancelar' && blocked?.reason.startsWith('Solo hasta') ? 'cancelacion_fuera_de_plazo' : 'transicion_invalida';
    throw new ProblemException(code, 409, blocked?.reason ?? 'La cita ya no admite esa acción.');
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
      await this.doctorHasShift(c, dto.doctorId, start, end, true);
      await this.patientHasConflict(c, patientId, start, end);
      if (patientRequest) await this.assertPendingLimit(c, patientId);
      const row = (await c.query(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,motivo,estado,origen,creado_por)
        VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7,$8) RETURNING id,version`, [patientId, dto.doctorId, start, end, dto.reason?.trim() || null, state, patientRequest ? 'paciente' : 'recepcion', actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: patientRequest ? 'citas.solicitar' : 'citas.agendar', entity: 'cita', entityId: row.id, permission, detail: { patientId, doctorId: dto.doctorId, start: start.toISOString(), end: end.toISOString() } });
      await this.commands.event(c, 'cita.actualizada', 'cita', row.id, row.version, await this.channels(c, patientId));
      return { id: row.id, version: row.version, state };
    });
  }

  /**
   * CITA-07: a patient cannot pile up simultaneous requests; they reschedule or cancel the one they already have.
   * Counts both kinds of request still waiting for reception: with a doctor (future `solicitada`) and by category
   * (`pendiente`, Fase 2 flow A). A category request has no slot to expire with, so it only counts during
   * `CATEGORY_REQUEST_COUNT_DAYS` after it was created (RN-20a); it stays in reception's inbox until resolved.
   * A per-patient advisory lock, shared by both kinds of request, serializes count-then-insert: two concurrent
   * requests cannot both pass the limit. It is released when the command transaction ends.
   */
  async assertPendingLimit(c: PoolClient, patientId: string) {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('citas.solicitudes:' || $1::text))`, [patientId]);
    const { maximo } = await this.policies.value<{ maximo: number }>(c, 'citas.solicitudes_pendientes_max', this.clock.now());
    const pending = Number((await c.query(`SELECT
        (SELECT count(*) FROM atencion.cita WHERE paciente_id=$1 AND estado='solicitada' AND lower(horario)>$2::timestamptz)
        + (SELECT count(*) FROM atencion.solicitud_cita WHERE paciente_id=$1 AND estado='pendiente'
            AND creado_en > $2::timestamptz - make_interval(days => $3)) AS n`, [patientId, this.clock.now(), CATEGORY_REQUEST_COUNT_DAYS])).rows[0].n);
    if (pending >= maximo) throw new ProblemException('solicitudes_pendientes_max', 409, `Ya tienes ${pending} solicitudes pendientes; reprograma o cancela una antes de pedir otra.`);
  }

  /** Throws when the doctor is not an active doctor (shared with the category request's preferred doctor). */
  async assertDoctor(c: PoolClient, doctorId: string) { await this.doctor(c, doctorId); }

  /**
   * Fase 2 flow A: reception assigns a category request. The appointment is created confirmed with exactly the checks
   * of `POST /citas` (20-minute slot aligned to the doctor's shift, future, no overlap for doctor or patient), so every
   * existing appointment rule applies to it afterwards. Runs inside the caller's command transaction.
   */
  async insertConfirmed(c: PoolClient, actor: Actor, input: { patientId: string; doctorId: string; start: string; end: string; reason: string | null }) {
    const { start, end } = this.range(input.start, input.end);
    await this.patient(c, input.patientId);
    await this.doctor(c, input.doctorId);
    await this.doctorHasShift(c, input.doctorId, start, end, true);
    await this.patientHasConflict(c, input.patientId, start, end);
    const row = (await c.query(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,motivo,estado,origen,creado_por)
      VALUES($1,$2,tstzrange($3,$4,'[)'),$5,'confirmada','paciente',$6) RETURNING id,version`, [input.patientId, input.doctorId, start, end, input.reason, actor.id])).rows[0];
    await this.commands.event(c, 'cita.actualizada', 'cita', row.id, row.version, await this.channels(c, input.patientId));
    return { id: row.id as string, version: row.version as number, start, end };
  }

  /** API-09: confirming or rejecting only applies to a pending request; the database trigger `atencion.validar_cita` backs it. */
  async changeStatus(actor: Actor, id: string, dto: AppointmentStatusDto, key?: string) {
    return this.commands.run(actor, `citas.agendar:${id}:${dto.status}`, key, dto, async c => {
      const old = (await c.query('SELECT paciente_id,medico_id,lower(horario) AS start,upper(horario) AS "end",estado,version FROM atencion.cita WHERE id=$1 FOR UPDATE', [id])).rows[0] as AppointmentRow | undefined;
      if (!old) throw new NotFoundException('No se encontró la cita.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La cita cambió; vuelve a abrirla.');
      if (dto.status === 'rechazada' && (dto.rejectionReason?.trim().length ?? 0) < 10) throw new BadRequestException('Indica el motivo del rechazo.');
      if (old.estado !== 'solicitada') throw new ProblemException('transicion_invalida', 409, 'Solo se puede confirmar o rechazar una solicitud pendiente; para una cita confirmada usa cancelar.');
      // The list blocks both once the time arrives (the sweep then marks the request `vencida`); the command matches it.
      if (new Date(old.start) <= this.clock.now()) throw new ProblemException('transicion_invalida', 409, 'La hora de la cita ya pasó.');
      if (dto.status === 'confirmada') {
        await this.doctorHasShift(c, old.medico_id, new Date(old.start), new Date(old.end), false);
        await this.patientHasConflict(c, old.paciente_id, new Date(old.start), new Date(old.end), id);
      }
      const row = (await c.query('UPDATE atencion.cita SET estado=$2,motivo_rechazo=$3,version=version+1 WHERE id=$1 RETURNING version', [id, dto.status, dto.rejectionReason?.trim() || null])).rows[0];
      if (dto.status === 'rechazada') await this.expirePendingReschedules(c, id);
      await this.commands.audit(c, actor, { action: 'citas.estado', entity: 'cita', entityId: id, permission: 'citas.agendar', detail: { from: old.estado, to: dto.status } });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, old.paciente_id));
      return { id, version: row.version, state: dto.status };
    });
  }

  /** A request to move an appointment that just closed has nothing left to move; it expires in the same transaction. */
  private async expirePendingReschedules(c: PoolClient, id: string) {
    await c.query(`UPDATE atencion.reprogramacion SET estado='vencida',version=version+1 WHERE cita_id=$1 AND estado='pendiente'`, [id]);
  }

  /** D-8: reception (and any reader without `reasonCode`) writes 10+ characters; the patient's quick reason needs no text, `otro` 3+. */
  private cancelReason(actor: Actor, dto: AppointmentCancelDto) {
    const text = dto.reason?.trim() ?? '';
    const patientOnly = !contextsOf(actor, 'citas.cancelar').some(context => context !== 'propio');
    if (dto.reasonCode && !patientOnly) throw new ProblemException('validacion', 400, 'Recepción escribe el motivo de la cancelación.', 'reasonCode');
    if (dto.reasonCode === 'otro' && text.length < 3) throw new ProblemException('validacion', 400, 'Escribe brevemente el motivo.', 'reason');
    if (!dto.reasonCode && text.length < 10) throw new ProblemException('validacion', 400, 'El motivo debe tener al menos 10 caracteres.', 'reason');
    return { code: dto.reasonCode ?? null, text: text || null };
  }

  async cancel(actor: Actor, id: string, dto: AppointmentCancelDto, key?: string) {
    const reason = this.cancelReason(actor, dto);
    return this.commands.run(actor, `citas.cancelar:${id}`, key, dto, async c => {
      const old = (await c.query('SELECT paciente_id,estado,version,lower(horario) AS start FROM atencion.cita WHERE id=$1 FOR UPDATE', [id])).rows[0] as AppointmentRow | undefined;
      // F-06/H-09: ownership comes first, and a foreign or missing appointment answers the same, so neither
      // the version nor the existence of another patient's appointment leaks.
      const onlyOwn = !contextsOf(actor, 'citas.cancelar').some(context => context !== 'propio');
      if (onlyOwn && (!old || !actor.patientId || actor.patientId !== old.paciente_id)) throw new ForbiddenException('Solo puedes cancelar tus propias citas.');
      if (!old) throw new NotFoundException('No se encontró la cita.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La cita cambió; vuelve a abrirla.');
      if (!['solicitada', 'confirmada'].includes(old.estado)) throw new ProblemException('transicion_invalida', 409, 'Solo se pueden cancelar citas solicitadas o confirmadas.');
      // CITA-06: reception rejects a request (it does not cancel it); only the patient withdraws their own request.
      const ownRequest = contextsOf(actor, 'citas.cancelar').includes('propio') && !!actor.patientId && actor.patientId === old.paciente_id;
      if (old.estado === 'solicitada' && !ownRequest) throw new ProblemException('transicion_invalida', 409, 'Una solicitud no se cancela: recházala indicando el motivo.');
      const now = this.clock.now();
      const start = new Date(old.start);
      // MA-CIT-03: an appointment whose consultation already started is not cancelled (the trigger backs it).
      if ((await c.query('SELECT atencion.cita_tiene_consulta($1) AS has', [id])).rows[0].has) throw new ProblemException('cita_con_consulta', 409, 'La consulta ya empezó; la cita no se puede cancelar.');
      if (start <= now) throw new ProblemException('transicion_invalida', 409, 'La cita ya empezó o pasó; no se puede cancelar.');
      // RN-21: the patient cancels up to N hours before (policy `citas.cancelacion_horas`); reception is not bound by it.
      if (onlyOwn) {
        const { horas } = await this.policies.value<{ horas: number }>(c, 'citas.cancelacion_horas', now);
        if (start.valueOf() - now.valueOf() < horas * 3_600_000) throw new ProblemException('cancelacion_fuera_de_plazo', 409, `Solo puedes cancelar tu cita hasta ${horas} h antes; comunícate con recepción.`);
      }
      const row = (await c.query("UPDATE atencion.cita SET estado='cancelada',cancelacion_codigo=$2,cancelacion_motivo=$3,version=version+1 WHERE id=$1 RETURNING version", [id, reason.code, reason.text])).rows[0];
      await this.expirePendingReschedules(c, id);
      await this.commands.audit(c, actor, { action: 'citas.cancelar', entity: 'cita', entityId: id, permission: 'citas.cancelar', reason: reason.text ?? undefined, detail: reason.code ? { reasonCode: reason.code } : undefined });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, old.paciente_id));
      return { id, version: row.version, state: 'cancelada' };
    });
  }
  /**
   * CITA-02: reschedule to a free slot of the same doctor. Reception applies it at once; the patient files a request
   * that reception or the doctor accepts or rejects, and the original appointment stays valid until then.
   */
  async reschedule(actor: Actor, id: string, dto: AppointmentRescheduleDto, key?: string) {
    const { start, end } = this.range(dto.start, dto.end);
    const manage = contextsOf(actor, 'citas.agendar').length > 0;
    const permission = manage ? 'citas.agendar' : 'citas.solicitar';
    const scope = manage ? `citas.agendar:reprogramar:${id}` : `citas.solicitar:reprogramar:${id}`;
    return this.commands.run(actor, scope, key, dto, async c => {
      const old = await this.lockedFacts(c, id);
      if (!manage && (!old || !actor.patientId || actor.patientId !== old.patientId)) throw new ForbiddenException('Solo puedes reprogramar tus propias citas.');
      if (!old) throw new NotFoundException('No se encontró la cita.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La cita cambió; vuelve a abrirla.');
      const policies = await this.appointmentPolicies(c, this.clock.now());
      this.assertAction(actor, old, policies, 'reprogramar');
      if (start.valueOf() === new Date(old.start).valueOf()) throw new ProblemException('validacion', 400, 'Elige una franja distinta de la actual.', 'start');
      await this.doctorHasShift(c, old.doctorId, start, end, true);
      const busy = (await c.query(`SELECT 1 FROM atencion.cita WHERE medico_id=$1 AND id<>$4 AND estado IN ('solicitada','confirmada') AND horario && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1`, [old.doctorId, start, end, id])).rowCount;
      if (busy) throw new ProblemException('franja_ocupada', 409, 'La franja ya no está disponible; vuelve a consultar la disponibilidad.', 'start');
      await this.patientHasConflict(c, old.patientId, start, end, id);
      const request = (await c.query(`INSERT INTO atencion.reprogramacion(cita_id,medico_id,horario,origen,motivo,solicitado_por)
        VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7) RETURNING id`, [id, old.doctorId, start, end, manage ? 'recepcion' : 'paciente', dto.reason?.trim() || null, actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.reprogramar_solicitar', entity: 'cita', entityId: id, patientId: old.patientId, permission, reason: dto.reason, detail: { requestId: request.id, start: start.toISOString(), end: end.toISOString() } });
      if (manage) return this.applyReschedule(c, actor, request.id, permission);
      const bumped = (await c.query('UPDATE atencion.cita SET version=version+1 WHERE id=$1 RETURNING version', [id])).rows[0];
      await this.commands.event(c, 'cita.actualizada', 'cita', id, bumped.version, await this.doctorAndPatientChannels(c, old.patientId, old.doctorId));
      return { id, version: bumped.version, state: old.state, rescheduleId: request.id, rescheduleState: 'pendiente' };
    });
  }

  private async doctorAndPatientChannels(c: PoolClient, patientId: string, doctorId: string) {
    const doctorAccounts = (await c.query('SELECT id FROM acceso.usuario WHERE persona_personal_id=$1', [doctorId])).rows.map(row => `usuario:${row.id}`);
    return [...new Set([...(await this.channels(c, patientId)), ...doctorAccounts])];
  }

  /** Moves the appointment: the original becomes `reprogramada` and the new one keeps its state, linked and counted. */
  private async applyReschedule(c: PoolClient, actor: Actor, requestId: string, permission: string) {
    const request = (await c.query(`SELECT r.id,r.cita_id,lower(r.horario) AS start,upper(r.horario) AS "end",c.paciente_id,c.medico_id,c.motivo,c.estado,c.origen,c.reprogramaciones
      FROM atencion.reprogramacion r JOIN atencion.cita c ON c.id=r.cita_id WHERE r.id=$1`, [requestId])).rows[0];
    const original = (await c.query(`UPDATE atencion.cita SET estado='reprogramada',version=version+1 WHERE id=$1 RETURNING version`, [request.cita_id])).rows[0];
    const created = (await c.query(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,motivo,estado,origen,creado_por,reprogramada_de,reprogramaciones)
      VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7,$8,$9,$10) RETURNING id,version,estado`,
      [request.paciente_id, request.medico_id, request.start, request.end, request.motivo, request.estado, request.origen, actor.id, request.cita_id, request.reprogramaciones + 1])).rows[0];
    await c.query(`UPDATE atencion.reprogramacion SET estado='aceptada',decidido_por=$2,decidido_en=$3,cita_nueva_id=$4,version=version+1 WHERE id=$1`, [requestId, actor.id, this.clock.now(), created.id]);
    await this.commands.audit(c, actor, { action: 'citas.reprogramar', entity: 'cita', entityId: request.cita_id, patientId: request.paciente_id, permission, detail: { requestId, newAppointmentId: created.id } });
    const channels = await this.doctorAndPatientChannels(c, request.paciente_id, request.medico_id);
    await this.commands.event(c, 'cita.actualizada', 'cita', request.cita_id, original.version, channels);
    await this.commands.event(c, 'cita.actualizada', 'cita', created.id, created.version, channels);
    return { id: created.id, version: created.version, state: created.estado, rescheduleId: requestId, rescheduleState: 'aceptada' };
  }

  /** Reception (`citas.agendar`) or the appointment's own doctor (`consulta.iniciar`) accepts or rejects a pending request. */
  async decideReschedule(actor: Actor, requestId: string, accept: boolean, dto: RescheduleDecisionDto, key?: string) {
    const permission = contextsOf(actor, 'citas.agendar').length ? 'citas.agendar' : 'consulta.iniciar';
    const decision = accept ? 'aceptar' : 'rechazar';
    const scope = permission === 'citas.agendar' ? `citas.agendar:reprogramacion:${requestId}:${decision}` : `consulta.iniciar:reprogramacion:${requestId}:${decision}`;
    return this.commands.run(actor, scope, key, dto, async c => {
      const request = (await c.query(`SELECT r.id,r.cita_id,r.estado,r.version,r.medico_id,lower(r.horario) AS start,upper(r.horario) AS "end",c.paciente_id
        FROM atencion.reprogramacion r JOIN atencion.cita c ON c.id=r.cita_id WHERE r.id=$1 FOR UPDATE OF r,c`, [requestId])).rows[0];
      if (!request) throw new NotFoundException('No se encontró la solicitud de reprogramación.');
      if (permission === 'consulta.iniciar' && request.medico_id !== actor.staffId) throw new ForbiddenException('Solo el médico de la cita o recepción deciden la reprogramación.');
      if (request.version !== dto.version) throw new VersionConflictException(request.version, 'La solicitud cambió; vuelve a abrirla.');
      if (request.estado !== 'pendiente') throw new ProblemException('transicion_invalida', 409, 'La solicitud ya fue decidida o venció.');
      if (new Date(request.start) <= this.clock.now()) throw new ProblemException('transicion_invalida', 409, 'La franja pedida ya pasó; la solicitud venció.');
      if (!accept) {
        if ((dto.rejectionReason?.trim().length ?? 0) < 10) throw new ProblemException('validacion', 400, 'Indica el motivo del rechazo (10 caracteres o más).', 'rejectionReason');
        await c.query(`UPDATE atencion.reprogramacion SET estado='rechazada',motivo_rechazo=$2,decidido_por=$3,decidido_en=$4,version=version+1 WHERE id=$1`, [requestId, dto.rejectionReason!.trim(), actor.id, this.clock.now()]);
        const bumped = (await c.query('UPDATE atencion.cita SET version=version+1 WHERE id=$1 RETURNING version,estado', [request.cita_id])).rows[0];
        await this.commands.audit(c, actor, { action: 'citas.reprogramacion_rechazar', entity: 'cita', entityId: request.cita_id, patientId: request.paciente_id, permission, reason: dto.rejectionReason, detail: { requestId } });
        await this.commands.event(c, 'cita.actualizada', 'cita', request.cita_id, bumped.version, await this.doctorAndPatientChannels(c, request.paciente_id, request.medico_id));
        return { id: request.cita_id, version: bumped.version, state: bumped.estado, rescheduleId: requestId, rescheduleState: 'rechazada' };
      }
      await this.doctorHasShift(c, request.medico_id, new Date(request.start), new Date(request.end), false);
      return this.applyReschedule(c, actor, requestId, permission);
    });
  }

  /** MA-CIT-02 / ASIS-05: reception marks a confirmed appointment as a no-show once its time arrived and nobody started a consultation. */
  async noShow(actor: Actor, id: string, dto: AppointmentNoShowDto, key?: string) {
    return this.commands.run(actor, `citas.agendar:no_asistio:${id}`, key, dto, async c => {
      const old = await this.lockedFacts(c, id);
      if (!old) throw new NotFoundException('No se encontró la cita.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La cita cambió; vuelve a abrirla.');
      this.assertAction(actor, old, await this.appointmentPolicies(c, this.clock.now()), 'no_asistio');
      const row = (await c.query("UPDATE atencion.cita SET estado='no_asistio',version=version+1 WHERE id=$1 RETURNING version", [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'citas.no_asistio', entity: 'cita', entityId: id, patientId: old.patientId, permission: 'citas.agendar', reason: dto.reason });
      await this.commands.event(c, 'cita.actualizada', 'cita', id, row.version, await this.channels(c, old.patientId));
      return { id, version: row.version, state: 'no_asistio' };
    });
  }
}
