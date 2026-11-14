import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { VersionConflictException } from '../platform/problem';
import { requireCurrentEnrollment } from '../platform/enrollment';
import { AdmissionDto, AuthorizationDto, BedAssignmentDto, BedSuggestionQuery, DischargeDto, ExitDto, NursingNoteDto, TransferDto } from './hospitalization.dto';

type Row = Record<string, any>;

@Injectable()
export class HospitalizationService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private async admission(c: PoolClient, id: string, lock = false) {
    const row = (await c.query(`SELECT a.id,a.paciente_id AS "patientId",a.origen AS origin,a.origen_id AS "originId",a.categoria_pedida AS "requestedCategory",a.sexo_paciente AS "patientSex",a.aislamiento AS isolation,a.medico_tratante_id AS "attendingDoctorId",a.fecha_programada AS "scheduledAt",a.estado AS state,a.autorizado_por AS "authorizedBy",a.version,a.creado_en AS "createdAt",coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName"
      FROM hospitalizacion.admision a JOIN pacientes.paciente p ON p.id=a.paciente_id WHERE a.id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la admisión.');
    return row;
  }

  /** Areas where the staff member has a published or running shift now (the `area` context, as in PatientsService.inArea). */
  private async currentAreas(c: PoolClient, staffId: string | null) {
    if (!staffId) return [] as string[];
    return (await c.query("SELECT area_id FROM personal.turno WHERE persona_id=$1 AND estado IN ('publicado','en_curso') AND periodo @> $2::timestamptz", [staffId,this.clock.now()])).rows.map(r => r.area_id as string);
  }

  /** The admission's current bed is inside one of `areas` (walking up from the room through its parent spaces). */
  private async admissionInAreas(c: PoolClient, admissionId: string, areas: string[]) {
    if (!areas.length) return false;
    return (await c.query(`SELECT 1 FROM hospitalizacion.ocupacion_cama o WHERE o.admision_id=$1 AND o.periodo @> $3::timestamptz
      AND EXISTS(WITH RECURSIVE up AS (SELECT id,padre_id FROM infra.espacio WHERE id=o.habitacion_id UNION ALL SELECT e.id,e.padre_id FROM infra.espacio e JOIN up ON e.id=up.padre_id) SELECT 1 FROM up WHERE id=ANY($2::uuid[])) LIMIT 1`, [admissionId,areas,this.clock.now()])).rows.length > 0;
  }

  /**
   * SEG-03 (audit 02 A-1): `enfermeria.registrar` with context `area` only reaches admissions whose bed is in an area where the
   * nurse has a current shift; context `x` reaches any admission.
   */
  private async assertNursingContext(c: PoolClient, actor: Actor, admissionId: string) {
    const contexts = contextsOf(actor, 'enfermeria.registrar');
    if (contexts.includes('x')) return;
    if (contexts.includes('area') && await this.admissionInAreas(c, admissionId, await this.currentAreas(c, actor.staffId))) return;
    throw new ForbiddenException('Solo puedes registrar notas de pacientes hospitalizados en el área de tu turno.');
  }

  /**
   * SEG-03 (audit 02 A-1): `alta.firmar` with context `relacion` requires being the attending doctor of the admission or having a
   * current care relationship with the patient; context `x` signs any discharge.
   */
  private async assertDischargeContext(c: PoolClient, actor: Actor, admission: Row) {
    const contexts = contextsOf(actor, 'alta.firmar');
    if (contexts.includes('x')) return;
    if (contexts.includes('relacion') && actor.staffId) {
      if (admission.attendingDoctorId === actor.staffId) return;
      const related = (await c.query('SELECT 1 FROM atencion.relacion_atencion WHERE paciente_id=$1 AND profesional_id=$2 AND vigencia @> $3::timestamptz LIMIT 1', [admission.patientId,actor.staffId,this.clock.now()])).rows.length > 0;
      if (related) return;
    }
    throw new ForbiddenException('Solo el médico tratante o con relación de atención vigente puede firmar esta alta.');
  }

  /**
   * RN-05: under the lock taken on the bed and its room, a semiprivate room only mixes patients of the
   * same recorded sex, and isolation needs a room with nobody else in it (DAT-05, RN-05.5).
   */
  private async checkRoomCompatibility(c: PoolClient, roomId: string, admission: Row) {
    const others = (await c.query(`SELECT sexo_paciente AS sex,aislamiento AS isolation,estado AS state FROM infra.v_estado_cama WHERE habitacion_id=$1 AND estado IN ('ocupada','reservada')`, [roomId])).rows as Row[];
    if (admission.isolation && others.length) throw new ConflictException('Un paciente con aislamiento necesita una habitación sin otros ocupantes.');
    const occupants = others.filter(other => other.state === 'ocupada');
    if (occupants.some(other => other.isolation)) throw new ConflictException('La habitación tiene un paciente en aislamiento.');
    if (occupants.some(other => other.sex !== admission.patientSex)) throw new ConflictException('La habitación semiprivada está ocupada por un paciente de otro sexo.');
  }

  /** API-03: admissions and the bed board learn about every transition through the outbox (no polling). */
  private async admissionChanged(c: PoolClient, id: string, version: number) {
    await this.commands.event(c, 'admision.actualizada', 'admision', id, version, await channelsFor(c, ['admision.ver', 'camas.asignar']));
  }

  private async bedChanged(c: PoolClient, bedId: string, version: number) {
    await this.commands.event(c, 'cama.estado_cambiado', 'cama', bedId, version, await channelsFor(c, ['camas.ver_tablero']));
  }

  /** DAT-02: isolation blocks the other beds of the room with the catalogued origin `aislamiento`. */
  private async isolateRoom(c: PoolClient, roomId: string, bedId: string, at: Date, by: string) {
    await c.query(`INSERT INTO infra.bloqueo_cama(cama_id,periodo,motivo,origen,creado_por) SELECT e.id,tstzrange($2::timestamptz,NULL,'[)'),'Aislamiento de paciente hospitalizado','aislamiento',$3
      FROM infra.espacio e WHERE e.padre_id=$1 AND e.tipo='cama' AND e.id<>$4 AND e.activo ON CONFLICT DO NOTHING`, [roomId, at, by, bedId]);
  }

  /** Closes the open isolation blocks of a room when its isolated patient leaves it (exit or transfer). */
  private async releaseIsolation(c: PoolClient, roomId: string, at: Date) {
    await c.query(`UPDATE infra.bloqueo_cama b SET periodo=tstzrange(lower(b.periodo),greatest(lower(b.periodo),$2::timestamptz),'[)')
      FROM infra.espacio e WHERE e.id=b.cama_id AND e.padre_id=$1 AND b.origen='aislamiento' AND upper_inf(b.periodo)`, [roomId, at]);
  }

  async list(actor: Actor) {
    return this.db.transaction(async c => {
      const global = contextsOf(actor, 'admision.ver').includes('x');
      const ownDoctor = actor.staffId && contextsOf(actor, 'admision.ver').includes('relacion');
      const ownPatient = actor.patientId && contextsOf(actor, 'admision.ver').includes('propio');
      // SEG-03: context `area` (ENF) sees the admissions whose current bed is in an area of the nurse's current shift.
      const areas = !global && contextsOf(actor, 'admision.ver').includes('area') ? await this.currentAreas(c, actor.staffId) : [];
      if (!global && !ownDoctor && !ownPatient && !areas.length) return [];
      const rows = (await c.query(`SELECT a.id,a.paciente_id AS "patientId",coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",a.origen AS origin,a.categoria_pedida AS "requestedCategory",a.estado AS state,a.aislamiento AS isolation,a.fecha_programada AS "scheduledAt",a.medico_tratante_id AS "attendingDoctorId",a.version,coalesce(o.codigo,'') AS bed,oc.id AS "occupationId"
        FROM hospitalizacion.admision a JOIN pacientes.paciente p ON p.id=a.paciente_id LEFT JOIN hospitalizacion.ocupacion_cama oc ON oc.admision_id=a.id AND oc.periodo @> $1::timestamptz LEFT JOIN infra.espacio o ON o.id=oc.cama_id
        WHERE a.estado IN ('pendiente_cama','hospitalizado','alta_firmada') AND ($2::boolean OR ($3::uuid IS NOT NULL AND a.medico_tratante_id=$3) OR ($4::uuid IS NOT NULL AND a.paciente_id=$4)
          OR (cardinality($5::uuid[])>0 AND EXISTS(WITH RECURSIVE up AS (SELECT id,padre_id FROM infra.espacio WHERE id=oc.habitacion_id UNION ALL SELECT e.id,e.padre_id FROM infra.espacio e JOIN up ON e.id=up.padre_id) SELECT 1 FROM up WHERE id=ANY($5::uuid[])))) ORDER BY a.creado_en DESC LIMIT 300`, [this.clock.now(),global,ownDoctor ? actor.staffId : null,ownPatient ? actor.patientId : null,areas])).rows;
      for (const row of rows) await this.commands.audit(c, actor, { action: 'admision.leer', entity: 'admision', entityId: row.id, patientId: row.patientId, permission: 'admision.ver' });
      return rows;
    });
  }

  async create(actor: Actor, dto: AdmissionDto, key?: string) {
    return this.commands.run(actor, 'admision.crear', key, dto, async c => {
      if (dto.origin === 'programada' && !dto.scheduledAt) throw new BadRequestException('Una admisión programada necesita fecha prevista.');
      if (dto.origin !== 'programada' && !dto.originId) throw new BadRequestException('La admisión necesita referencia de origen.');
      const patient = (await c.query(`SELECT id,coalesce(sexo,'no_registrado') AS sex FROM pacientes.paciente WHERE id=$1`, [dto.patientId])).rows[0] as Row | undefined;
      if (!patient) throw new NotFoundException('No se encontró el paciente.');
      const doctor = (await c.query(`SELECT id FROM personal.persona WHERE id=$1 AND tipo='medico' AND activo`, [dto.attendingDoctorId])).rows[0];
      if (!doctor) throw new BadRequestException('El médico tratante no está activo.');
      const existing = await c.query(`SELECT id FROM hospitalizacion.admision WHERE paciente_id=$1 AND estado IN ('pendiente_cama','hospitalizado','alta_firmada') LIMIT 1`, [dto.patientId]);
      if (existing.rowCount) throw new ConflictException('El paciente ya tiene una admisión activa.');
      const row = (await c.query(`INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,aislamiento,medico_tratante_id,fecha_programada,creado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,estado AS state,version`, [dto.patientId,dto.origin,dto.originId ?? null,dto.requestedCategory,patient.sex,dto.isolation,dto.attendingDoctorId,dto.scheduledAt ?? null,actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: 'admision.crear', entity: 'admision', entityId: row.id, patientId: dto.patientId, permission: 'admision.crear', reason: dto.reason });
      await this.commands.event(c, 'admision.creada', 'admision', row.id, row.version, await channelsFor(c, ['admision.ver', 'camas.asignar'], { users: [actor.id] }));
      return row;
    });
  }

  async createIndication(actor: Actor, dto: AdmissionDto, key?: string) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a personal clínico.');
    if (dto.attendingDoctorId !== actor.staffId) throw new ForbiddenException('La indicación debe pertenecer al médico actual.');
    if (!dto.originId) throw new BadRequestException('La indicación debe enlazarse a una consulta.');
    return this.commands.run(actor, 'admision.solicitar', key, dto, async c => {
      const patient = (await c.query('SELECT id,coalesce(sexo,\'no_registrado\') AS sex FROM pacientes.paciente WHERE id=$1', [dto.patientId])).rows[0];
      if (!patient) throw new NotFoundException('No se encontró el paciente.');
      const row = (await c.query(`INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,aislamiento,medico_tratante_id,fecha_programada,creado_por) VALUES($1,'consulta',$2,$3,$4,$5,$6,$7,$8) RETURNING id,estado AS state,version`, [dto.patientId,dto.originId ?? null,dto.requestedCategory,patient.sex,dto.isolation,actor.staffId,dto.scheduledAt ?? null,actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: 'admision.solicitar', entity: 'admision', entityId: row.id, patientId: dto.patientId, permission: 'admision.solicitar' });
      await this.commands.event(c, 'admision.creada', 'admision', row.id, row.version, await channelsFor(c, ['admision.ver', 'camas.asignar']));
      return row;
    });
  }

  async suggestions(actor: Actor, id: string, query: BedSuggestionQuery) {
    return this.db.transaction(async c => {
      const admission = await this.admission(c, id);
      if (admission.state !== 'pendiente_cama') throw new ConflictException('La admisión ya tiene una cama o no está pendiente.');
      const category = query.category ?? admission.requestedCategory;
      const rows = (await c.query(`WITH beds AS (SELECT b.cama_id AS id,e.version,b.codigo AS code,b.habitacion_id AS "roomId",b.habitacion AS room,b.categoria AS category,b.nivel AS level,b.estado AS state,b.sexo_paciente AS "roomSex",b.aislamiento AS "roomIsolation"
        FROM infra.v_estado_cama b JOIN infra.espacio e ON e.id=b.cama_id WHERE b.estado='libre' AND b.categoria=$1)
        SELECT beds.*,coalesce((SELECT count(*) FROM infra.v_estado_cama same WHERE same.habitacion_id=beds."roomId" AND same.estado='ocupada'),0)::int AS "occupiedInRoom",
        CASE WHEN coalesce((SELECT count(*) FROM infra.v_estado_cama same WHERE same.habitacion_id=beds."roomId" AND same.estado='ocupada'),0)>0 THEN 'habitación con ocupante compatible' ELSE 'habitación vacía' END AS reason
        FROM beds WHERE ($2::boolean=false OR coalesce((SELECT count(*) FROM infra.v_estado_cama same WHERE same.habitacion_id=beds."roomId" AND same.estado IN ('ocupada','reservada')),0)=0)
          AND NOT EXISTS (SELECT 1 FROM infra.v_estado_cama same WHERE same.habitacion_id=beds."roomId" AND same.estado='ocupada' AND (same.sexo_paciente IS DISTINCT FROM $3 OR same.aislamiento))
        ORDER BY "occupiedInRoom" DESC, level, room, code LIMIT 50`, [category, admission.isolation, admission.patientSex])).rows;
      await this.commands.audit(c, actor, { action: 'camas.sugerencias', entity: 'admision', entityId: id, patientId: admission.patientId, permission: 'camas.asignar', detail: { count: rows.length, category } });
      return rows;
    });
  }

  async assignBed(actor: Actor, id: string, dto: BedAssignmentDto, key?: string) {
    return this.commands.run(actor, `camas.asignar:${id}`, key, dto, async c => {
      const admission = await this.admission(c, id, true);
      if (admission.state !== 'pendiente_cama') throw new ConflictException('La admisión ya no está pendiente de cama.');
      const bed = (await c.query(`SELECT e.id,e.version,e.tipo,h.id AS "roomId",h.categoria FROM infra.espacio e JOIN infra.espacio h ON h.id=e.padre_id WHERE e.id=$1 AND e.tipo='cama' AND e.activo FOR UPDATE`, [dto.bedId])).rows[0] as Row | undefined;
      if (!bed) throw new NotFoundException('No se encontró la cama activa.');
      if (bed.version !== dto.version) throw new VersionConflictException(bed.version, 'La cama cambió; vuelve a consultar.');
      const state = (await c.query('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1', [dto.bedId])).rows[0]?.estado;
      if (state !== 'libre') throw new ConflictException('Otra persona tomó esta cama.');
      if (bed.categoria !== admission.requestedCategory && admission.requestedCategory === 'semiprivada' && !admission.authorizedBy) throw new ConflictException('La categoría de cama no coincide con la solicitud.');
      await this.checkRoomCompatibility(c, bed.roomId, admission);
      const now = this.clock.now();
      const occ = (await c.query(`INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo,asignado_por) VALUES($1,$2,$3,$4,tstzrange($5::timestamptz,NULL,'[)'),$6) RETURNING id`, [id,dto.bedId,bed.roomId,bed.categoria,now,actor.id])).rows[0];
      await c.query(`UPDATE hospitalizacion.admision SET estado='hospitalizado',version=version+1 WHERE id=$1`, [id]);
      if (admission.isolation) await this.isolateRoom(c, bed.roomId, dto.bedId, now, actor.id);
      await this.commands.audit(c, actor, { action: 'camas.asignar', entity: 'ocupacion_cama', entityId: occ.id, patientId: admission.patientId, permission: 'camas.asignar', reason: dto.reason });
      await this.commands.event(c, 'admision.cama_asignada', 'admision', id, admission.version + 1, await channelsFor(c, ['admision.ver', 'camas.ver_tablero']));
      await this.bedChanged(c, dto.bedId, bed.version);
      return { id, bedId: dto.bedId, state: 'hospitalizado', version: admission.version + 1 };
    });
  }

  async authorize(actor: Actor, id: string, dto: AuthorizationDto, key?: string) {
    return this.commands.run(actor, `admision.autorizar:${id}`, key, dto, async c => {
      const admission = await this.admission(c, id, true);
      if (admission.version !== dto.version) throw new VersionConflictException(admission.version, 'La admisión cambió; vuelve a consultarla.');
      if (admission.state !== 'pendiente_cama') throw new ConflictException('Solo se puede autorizar una admisión pendiente.');
      const row = (await c.query('UPDATE hospitalizacion.admision SET autorizado_por=$2,version=version+1 WHERE id=$1 RETURNING id,version', [id,actor.id])).rows[0];
      await this.commands.audit(c, actor, { action: 'admision.autorizar', entity: 'admision', entityId: id, patientId: admission.patientId, permission: 'admision.autorizar', reason: dto.reason });
      await this.admissionChanged(c, id, row.version);
      return row;
    });
  }

  /**
   * API-05: the route is `/ocupaciones/{id}/traslado`, so `id` is the active bed occupation. `version` is the
   * admission version shown in `GET /admisiones`; the admission must be `hospitalizado` (D-037: VIP stays put).
   */
  async transfer(actor: Actor, occupationId: string, dto: TransferDto, key?: string) {
    return this.commands.run(actor, `camas.trasladar:${occupationId}`, key, dto, async c => {
      const now = this.clock.now();
      // Same lock order as `exit` (admission, then occupation) so a transfer and an exit never deadlock.
      const owner = (await c.query(`SELECT admision_id AS "admissionId" FROM hospitalizacion.ocupacion_cama WHERE id=$1`, [occupationId])).rows[0] as Row | undefined;
      if (!owner) throw new NotFoundException('No se encontró una ocupación activa con ese identificador.');
      const id = owner.admissionId as string;
      const admission = await this.admission(c, id, true);
      const current = (await c.query(`SELECT o.id,o.admision_id AS "admissionId",o.cama_id AS "bedId",o.habitacion_id AS "roomId",o.categoria,e.version FROM hospitalizacion.ocupacion_cama o JOIN infra.espacio e ON e.id=o.cama_id WHERE o.id=$1 AND o.periodo @> $2::timestamptz FOR UPDATE`, [occupationId, now])).rows[0] as Row | undefined;
      if (!current) throw new NotFoundException('No se encontró una ocupación activa con ese identificador.');
      if (admission.version !== dto.version) throw new VersionConflictException(admission.version, 'La admisión cambió; vuelve a consultarla.');
      if (admission.state !== 'hospitalizado') throw new ConflictException('Solo se traslada a un paciente hospitalizado.');
      if (current.categoria === 'vip') throw new ConflictException('Una ocupación VIP no se puede trasladar.');
      if (dto.bedId === current.bedId) throw new BadRequestException('Selecciona una cama distinta de la actual.');
      const target = (await c.query(`SELECT e.id,e.version,h.id AS "roomId",h.categoria FROM infra.espacio e JOIN infra.espacio h ON h.id=e.padre_id WHERE e.id=$1 AND e.tipo='cama' AND e.activo FOR UPDATE`, [dto.bedId])).rows[0] as Row | undefined;
      if (!target) throw new NotFoundException('No se encontró la cama destino.');
      const state = (await c.query('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1', [dto.bedId])).rows[0]?.estado;
      if (state !== 'libre') throw new ConflictException('La cama destino ya no está disponible.');
      if (target.roomId !== current.roomId) await this.checkRoomCompatibility(c, target.roomId, admission);
      await c.query(`UPDATE hospitalizacion.ocupacion_cama SET periodo=tstzrange(lower(periodo),$2::timestamptz,'[)'),motivo_fin='traslado' WHERE id=$1`, [current.id,now]);
      if (admission.isolation && target.roomId !== current.roomId) {
        await this.releaseIsolation(c, current.roomId, now);
        await this.isolateRoom(c, target.roomId, dto.bedId, now, actor.id);
      }
      const dest = (await c.query(`INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo,asignado_por) VALUES($1,$2,$3,$4,tstzrange($5::timestamptz,NULL,'[)'),$6) RETURNING id`, [id,dto.bedId,target.roomId,target.categoria,now,actor.id])).rows[0];
      await c.query(`INSERT INTO hospitalizacion.traslado(admision_id,ocupacion_origen_id,ocupacion_destino_id,motivo,realizado_por) VALUES($1,$2,$3,$4,$5)`, [id,current.id,dest.id,dto.reason,actor.id]);
      await c.query(`INSERT INTO infra.limpieza_cama(cama_id,pendiente_desde) VALUES($1,$2)`, [current.bedId,now]);
      const row = (await c.query('UPDATE hospitalizacion.admision SET version=version+1 WHERE id=$1 RETURNING version', [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'camas.trasladar', entity: 'traslado', entityId: id, patientId: admission.patientId, permission: 'camas.trasladar', reason: dto.reason, detail: { fromOccupationId: current.id, toOccupationId: dest.id } });
      await this.bedChanged(c, current.bedId, current.version);
      await this.bedChanged(c, dto.bedId, target.version);
      await this.admissionChanged(c, id, row.version);
      return { admissionId: id, occupationId: dest.id, fromBedId: current.bedId, toBedId: dto.bedId, state: 'hospitalizado', version: row.version };
    });
  }

  async note(actor: Actor, id: string, dto: NursingNoteDto, key?: string) {
    return this.commands.run(actor, `enfermeria.registrar:${id}`, key, dto, async c => {
      const admission = await this.admission(c, id);
      await this.assertNursingContext(c, actor, id);
      // SEG-03: notes only while the patient is in the bed (hospitalized, or discharge signed but not yet out).
      if (!['hospitalizado','alta_firmada'].includes(admission.state)) throw new ConflictException('Solo se registran notas de pacientes hospitalizados.');
      const row = (await c.query(`INSERT INTO hospitalizacion.nota_enfermeria(admision_id,autor_id,texto) VALUES($1,$2,$3) RETURNING id,creada_en AS "createdAt"`, [id,actor.id,dto.text.trim()])).rows[0];
      await this.commands.audit(c, actor, { action: 'enfermeria.nota', entity: 'nota_enfermeria', entityId: row.id, patientId: admission.patientId, permission: 'enfermeria.registrar' });
      await this.admissionChanged(c, id, admission.version);
      return row;
    });
  }

  async discharge(actor: Actor, id: string, dto: DischargeDto, key?: string) {
    return this.commands.run(actor, `alta.firmar:${id}`, key, dto, async c => {
      const admission = await this.admission(c, id, true);
      await this.assertDischargeContext(c, actor, admission);
      if (admission.version !== dto.version) throw new VersionConflictException(admission.version, 'La admisión cambió; vuelve a consultarla.');
      if (admission.state !== 'hospitalizado') throw new ConflictException('Solo se puede firmar el alta de un paciente hospitalizado.');
      await requireCurrentEnrollment(c, actor.staffId, this.clock.today());
      // RN-11: each pending item keeps its responsible person; stored with the column's Spanish keys.
      const pending = (dto.pending ?? []).map(item => ({ descripcion: item.description.trim(), responsable: item.responsible.trim() }));
      if (pending.some(item => !item.descripcion || !item.responsable)) throw new BadRequestException('Cada pendiente debe tener descripción y responsable.');
      if (dto.type === 'voluntaria' && !dto.voluntaryConsent) throw new BadRequestException('El alta voluntaria necesita constancia.');
      await c.query(`INSERT INTO hospitalizacion.alta(admision_id,tipo,firmada_por,resumen,pendientes,constancia_voluntaria) VALUES($1,$2,$3,$4,$5::jsonb,$6)`, [id,dto.type,actor.id,dto.summary?.trim() ?? null,JSON.stringify(pending),dto.voluntaryConsent ?? false]);
      const row = (await c.query(`UPDATE hospitalizacion.admision SET estado='alta_firmada',version=version+1 WHERE id=$1 RETURNING id,estado AS state,version`, [id])).rows[0];
      await this.commands.audit(c, actor, { action: 'alta.firmar', entity: 'alta', entityId: id, patientId: admission.patientId, permission: 'alta.firmar' });
      await this.admissionChanged(c, id, row.version);
      return row;
    });
  }

  async exit(actor: Actor, id: string, dto: ExitDto, key?: string) {
    return this.commands.run(actor, `admision.registrar_salida:${id}`, key, dto, async c => {
      const admission = await this.admission(c, id, true);
      if (admission.version !== dto.version) throw new VersionConflictException(admission.version, 'La admisión cambió; vuelve a consultarla.');
      if (admission.state !== 'alta_firmada') throw new ConflictException('Primero debe firmarse el alta.');
      const occupation = (await c.query(`SELECT o.id,o.cama_id AS "bedId",o.habitacion_id AS "roomId",e.version AS "bedVersion" FROM hospitalizacion.ocupacion_cama o JOIN infra.espacio e ON e.id=o.cama_id WHERE o.admision_id=$1 AND o.periodo @> $2::timestamptz FOR UPDATE OF o`, [id,this.clock.now()])).rows[0];
      if (!occupation) throw new ConflictException('No hay ocupación activa para registrar salida.');
      const now = this.clock.now();
      await c.query(`UPDATE hospitalizacion.ocupacion_cama SET periodo=tstzrange(lower(periodo),$2::timestamptz,'[)'),motivo_fin='egreso' WHERE id=$1`, [occupation.id,now]);
      if (admission.isolation) await this.releaseIsolation(c, occupation.roomId, now);
      const updated = (await c.query(`UPDATE hospitalizacion.admision SET estado='egresado',version=version+1 WHERE id=$1 RETURNING version`, [id])).rows[0];
      await c.query(`INSERT INTO infra.limpieza_cama(cama_id,pendiente_desde) VALUES($1,$2)`, [occupation.bedId,now]);
      await this.commands.audit(c, actor, { action: 'admision.salida', entity: 'admision', entityId: id, patientId: admission.patientId, permission: 'admision.registrar_salida', reason: dto.reason });
      await this.admissionChanged(c, id, updated.version);
      await this.bedChanged(c, occupation.bedId, occupation.bedVersion);
      return { id, state: 'egresado', bedId: occupation.bedId, version: updated.version };
    });
  }
}
