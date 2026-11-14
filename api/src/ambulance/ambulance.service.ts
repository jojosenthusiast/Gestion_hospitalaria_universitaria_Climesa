import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf, hasPermission } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock, businessDayRange } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { AmbulanceRequestDto, DiscardRequestDto, DispatchDto, LocationDto, MaintenanceDto, MilestoneDto, PrehospitalDto } from './ambulance.dto';
import { CREW_ON_DUTY_SQL, PARAMEDIC_ON_DUTY_SQL, UnitState, canReportAfter, dispatchBlock, finalStateError, finalStates, fold, maskRecord, nextMilestones, priorities, responseMinutes, serviceTypes } from './ambulance.rules';

type Unit = { id: string; estado: UnitState; version: number };
type Service = { id: string; unidad_id: string; solicitud_id: string | null; paciente_id: string | null; finalizado_en: Date | null; version: number };
export type LogFilters = { from?: string; to?: string; type?: string; finalState?: string; priority?: string; crewId?: string; municipality?: string; minResponseMinutes?: string; q?: string };
/** Permiso que habilita el contenido clínico del prehospital: quien tiene relación de atención con el expediente (privacidad.md). */
const CLINICAL_PERMISSION = 'expediente.ver';
const NOTICE_911 = 'Si hay riesgo de vida, llama al 911.';

@Injectable()
export class AmbulanceService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private async lockUnit(c: PoolClient): Promise<Unit> {
    const unit = (await c.query<Unit>('SELECT id,estado,version FROM ambulancia.unidad LIMIT 1 FOR UPDATE')).rows[0];
    if (!unit) throw new NotFoundException('No hay una unidad de ambulancia registrada.');
    return unit;
  }
  private async onDuty(c: { query: (sql: string, args: unknown[]) => Promise<{ rows: unknown[] }> }, at: Date) {
    return (await c.query(PARAMEDIC_ON_DUTY_SQL, [at])).rows.length > 0;
  }
  private async setUnit(c: PoolClient, actor: Actor, unit: Unit, target: UnitState, reason: string | null) {
    const version = (await c.query<{ version: number }>('UPDATE ambulancia.unidad SET estado=$2,version=version+1 WHERE id=$1 RETURNING version', [unit.id, target])).rows[0].version;
    await c.query('INSERT INTO ambulancia.cambio_estado(unidad_id,desde,hacia,motivo,por,en) VALUES($1,$2,$3,$4,$5,$6)', [unit.id, unit.estado, target, reason, actor.id, this.clock.now()]);
    return version;
  }
  /** Cuenta que debe seguir la solicitud en vivo: quien la pidió desde la app o la cuenta vinculada al paciente. */
  private async requesterAccount(c: PoolClient, requestId: string | null) {
    if (!requestId) return null;
    const row = (await c.query<{ solicitante_usuario_id: string | null; paciente_id: string | null }>('SELECT solicitante_usuario_id,paciente_id FROM ambulancia.solicitud WHERE id=$1', [requestId])).rows[0];
    return row?.solicitante_usuario_id ?? (row?.paciente_id ? await patientAccount(c, row.paciente_id) : null);
  }

  /** FR-109-01: estado de la única unidad y su servicio activo, sin datos del paciente. Despacho ve además las solicitudes por confirmar. */
  async status(actor: Actor) {
    return this.db.transaction(async c => {
      const unit = (await c.query('SELECT id,placa AS plate,estado AS state,version FROM ambulancia.unidad LIMIT 1')).rows[0];
      if (!unit) throw new NotFoundException('No hay una unidad de ambulancia registrada.');
      const service = (await c.query(`SELECT id,solicitud_id AS "requestId",tipo AS type,prioridad AS priority,origen AS origin,destino AS destination,municipio AS municipality,despachado_en AS "dispatchedAt",version,
          EXISTS(SELECT 1 FROM ambulancia.reporte_prehospital r WHERE r.servicio_id=s.id) AS "hasPrehospital"
        FROM ambulancia.servicio s WHERE unidad_id=$1 AND finalizado_en IS NULL`, [unit.id])).rows[0];
      let activeService = null;
      if (service) {
        const crew = (await c.query(`SELECT t.persona_id AS "staffId",t.funcion AS role,p.nombres||' '||p.apellidos AS name FROM ambulancia.tripulacion t JOIN personal.persona p ON p.id=t.persona_id WHERE t.servicio_id=$1 ORDER BY t.funcion,p.apellidos`, [service.id])).rows;
        const milestones = (await c.query('SELECT tipo AS type,ocurrido_en AS "occurredAt" FROM ambulancia.hito WHERE servicio_id=$1 ORDER BY ocurrido_en,registrado_en', [service.id])).rows;
        const location = (await c.query('SELECT latitud::float AS latitude,longitud::float AS longitude,capturada_en AS "capturedAt" FROM ambulancia.ubicacion WHERE servicio_id=$1 ORDER BY capturada_en DESC LIMIT 1', [service.id])).rows[0] ?? null;
        activeService = { ...service, crew, milestones, nextMilestones: nextMilestones(milestones.map((m: { type: string }) => m.type)), lastLocation: location };
      }
      const paramedicOnDuty = await this.onDuty(c, this.clock.now());
      const change = (await c.query<{ motivo: string | null; en: Date }>('SELECT motivo,en FROM ambulancia.cambio_estado WHERE unidad_id=$1 AND hacia=$2 ORDER BY id DESC LIMIT 1', [unit.id, unit.state])).rows[0];
      Object.assign(unit, { stateReason: change?.motivo ?? null, stateSince: change?.en ?? null });
      const result: Record<string, unknown> = { unit, activeService, paramedicOnDuty, dispatchBlock: dispatchBlock(unit.state, paramedicOnDuty) };
      if (hasPermission(actor, 'ambulancia.despachar')) {
        const pending = (await c.query(`SELECT s.id,s.canal AS channel,s.direccion AS address,s.municipio AS municipality,s.latitud::float AS latitude,s.longitud::float AS longitude,s.motivo AS reason,s.telefono_contacto AS "contactPhone",s.creada_en AS "createdAt",s.version,s.paciente_id AS patient,
            s.solicitante_nombre AS "callerName",p.expediente AS "patientRecord",
            nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),'') AS "patientName",p.alias_provisional AS "patientAlias"
          FROM ambulancia.solicitud s LEFT JOIN pacientes.paciente p ON p.id=s.paciente_id WHERE s.estado='por_confirmar' ORDER BY s.creada_en`)).rows as Array<{ id: string; patient: string | null; patientName: string | null; patientAlias: string | null; callerName: string | null }>;
        result.pendingRequests = pending.map(({ patient, patientName, patientAlias, callerName, ...row }) => ({ ...row, registeredPatient: !!patient, requesterName: patientName ?? patientAlias ?? callerName ?? null, callerName }));
        // Dirección y teléfono de contacto son datos personales: la consulta queda auditada (regla 7).
        for (const row of pending.filter(r => r.patient)) await this.commands.audit(c, actor, { action: 'ambulancia.solicitud.ver', entity: 'solicitud', entityId: row.id, patientId: row.patient!, permission: 'ambulancia.despachar' });
      }
      return result;
    });
  }

  /** Entrar o salir de mantenimiento; salir deja la unidad Disponible y exige paramédico de turno (FR-109-06, FR-109-09). */
  async setMaintenance(actor: Actor, dto: MaintenanceDto, key?: string) {
    return this.commands.run(actor, 'ambulancia.mantenimiento:unidad', key, dto, async c => {
      const unit = await this.lockUnit(c);
      if (unit.version !== dto.version) throw new VersionConflictException(unit.version, 'La unidad cambió; vuelve a consultar su estado.');
      let target: UnitState;
      if (dto.inMaintenance) {
        if (unit.estado === 'en_servicio') throw new ProblemException('unidad_en_servicio', 409, 'La unidad tiene un servicio activo; no puede entrar a mantenimiento.');
        if (unit.estado === 'en_mantenimiento') throw new ConflictException('La unidad ya está en mantenimiento.');
        target = 'en_mantenimiento';
      } else {
        if (unit.estado !== 'en_mantenimiento') throw new ConflictException('La unidad no está en mantenimiento.');
        if (!(await this.onDuty(c, this.clock.now()))) throw new ProblemException('sin_paramedico_de_turno', 409, 'No hay un paramédico con turno en curso; la unidad no puede quedar Disponible.');
        target = 'disponible';
      }
      const version = await this.setUnit(c, actor, unit, target, dto.reason.trim());
      await this.commands.audit(c, actor, { action: 'ambulancia.mantenimiento', entity: 'unidad', entityId: unit.id, permission: 'ambulancia.mantenimiento', reason: dto.reason, detail: { from: unit.estado, to: target } });
      await this.commands.event(c, 'ambulancia.estado_cambiado', 'unidad', unit.id, version, ['ambulancia']);
      return { id: unit.id, state: target, version };
    });
  }

  /** FR-109-02 / FR-109-03: el paciente verificado pide desde la app; recepción registra la llamada. Queda "por confirmar" (RN-33). */
  async request(actor: Actor, dto: AmbulanceRequestDto, key?: string) {
    const contexts = contextsOf(actor, 'ambulancia.solicitar');
    const general = contexts.some(ctx => ctx !== 'propio');
    if (!general && !actor.patientId) throw new ProblemException('cuenta_no_verificada', 403, 'Tu cuenta aún no está vinculada a tu expediente; recepción debe verificarla antes de pedir ambulancia.');
    if (!general && dto.patientId && dto.patientId !== actor.patientId) throw new ForbiddenException('Solo puedes pedir ambulancia para ti.');
    return this.commands.run(actor, 'ambulancia.solicitar:solicitud', key, dto, async c => {
      const patientId = general ? dto.patientId ?? null : actor.patientId;
      if (patientId && !(await c.query("SELECT 1 FROM pacientes.paciente WHERE id=$1 AND estado IN ('activo','provisional')", [patientId])).rowCount) throw new NotFoundException('El paciente no existe o está inactivo.');
      const channel = general ? 'telefono' : 'app_paciente';
      const row = (await c.query<{ id: string; version: number; creada_en: Date }>(`INSERT INTO ambulancia.solicitud(canal,solicitante_usuario_id,registrada_por,paciente_id,direccion,latitud,longitud,municipio,motivo,telefono_contacto,creada_en,solicitante_nombre)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,version,creada_en`, [channel, general ? null : actor.id, general ? actor.id : null, patientId, dto.address.trim(), dto.latitude ?? null, dto.longitude ?? null, dto.municipality?.trim() || null, dto.reason.trim(), dto.contactPhone.trim(), this.clock.now(), general ? dto.callerName?.trim() || null : null])).rows[0];
      await this.commands.audit(c, actor, { action: 'ambulancia.solicitar', entity: 'solicitud', entityId: row.id, patientId: patientId ?? undefined, permission: 'ambulancia.solicitar', detail: { channel } });
      const account = general ? (patientId ? await patientAccount(c, patientId) : null) : actor.id;
      await this.commands.event(c, 'ambulancia.solicitud_creada', 'solicitud', row.id, row.version, ['ambulancia', ...await channelsFor(c, ['ambulancia.despachar'], { users: [account] })]);
      return { id: row.id, state: 'por_confirmar', channel, version: row.version, createdAt: row.creada_en, notice: NOTICE_911 };
    });
  }

  /** Despacho descarta una solicitud por confirmar, con motivo. */
  async discard(actor: Actor, id: string, dto: DiscardRequestDto, key?: string) {
    return this.commands.run(actor, `ambulancia.despachar:solicitud:${id}:descartar`, key, dto, async c => {
      const row = (await c.query<{ estado: string; version: number; paciente_id: string | null }>('SELECT estado,version,paciente_id FROM ambulancia.solicitud WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new NotFoundException('La solicitud no existe.');
      if (row.estado !== 'por_confirmar') throw new ProblemException('solicitud_resuelta', 409, 'La solicitud ya fue confirmada, descartada o cancelada.');
      if (row.version !== dto.version) throw new VersionConflictException(row.version, 'La solicitud cambió; vuelve a abrirla.');
      const version = (await c.query<{ version: number }>("UPDATE ambulancia.solicitud SET estado='descartada',motivo_descarte=$2,resuelta_por=$3,version=version+1 WHERE id=$1 RETURNING version", [id, dto.reason.trim(), actor.id])).rows[0].version;
      await this.commands.audit(c, actor, { action: 'ambulancia.solicitud.descartar', entity: 'solicitud', entityId: id, patientId: row.paciente_id ?? undefined, permission: 'ambulancia.despachar', reason: dto.reason });
      // El tablero de despacho y quien pidió el servicio se actualizan con el cambio de estado del recurso.
      await this.commands.event(c, 'ambulancia.estado_cambiado', 'solicitud', id, version, ['ambulancia', ...await channelsFor(c, ['ambulancia.despachar'], { users: [await this.requesterAccount(c, id)] })]);
      return { id, state: 'descartada', version };
    });
  }

  /**
   * FR-109-04 / FR-109-05: despacho atómico. La fila de la unidad se bloquea; si ya está En Servicio, el segundo despacho
   * recibe `ambulancia_ya_despachada`. El índice `servicio_activo_unico` y el disparador `servicio_despacho` son la segunda barrera.
   */
  async dispatch(actor: Actor, dto: DispatchDto, key?: string) {
    if (!serviceTypes.includes(dto.type as never) || !priorities.includes(dto.priority as never)) throw new BadRequestException('Tipo o prioridad no válidos.');
    return this.commands.run(actor, 'ambulancia.despachar:servicio', key, dto, async c => {
      const now = this.clock.now();
      const unit = await this.lockUnit(c);
      if (unit.estado === 'en_servicio') throw new ProblemException('ambulancia_ya_despachada', 409, 'La ambulancia ya fue despachada.');
      if (unit.estado === 'en_mantenimiento') throw new ProblemException('unidad_en_mantenimiento', 409, 'La ambulancia está en mantenimiento; no se puede despachar.');
      if (unit.version !== dto.version) throw new VersionConflictException(unit.version, 'La unidad cambió; vuelve a consultar su estado.');
      const crew = (await c.query<{ id: string; tipo: string }>(CREW_ON_DUTY_SQL, [now])).rows;
      if (!crew.some(p => p.tipo === 'paramedico')) throw new ProblemException('sin_paramedico_de_turno', 409, 'No hay un paramédico con turno en curso para el servicio.');
      let origin = dto.origin?.trim() || null, municipality = dto.municipality?.trim() || null, patientId: string | null = null, account: string | null = null;
      if (dto.requestId) {
        const request = (await c.query<{ estado: string; direccion: string; municipio: string | null; paciente_id: string | null }>('SELECT estado,direccion,municipio,paciente_id FROM ambulancia.solicitud WHERE id=$1 FOR UPDATE', [dto.requestId])).rows[0];
        if (!request) throw new NotFoundException('La solicitud no existe.');
        if (request.estado !== 'por_confirmar') throw new ProblemException('solicitud_resuelta', 409, 'La solicitud ya fue confirmada, descartada o cancelada.');
        origin ??= request.direccion; municipality ??= request.municipio; patientId = request.paciente_id;
        await c.query("UPDATE ambulancia.solicitud SET estado='confirmada',resuelta_por=$2,version=version+1 WHERE id=$1", [dto.requestId, actor.id]);
        account = await this.requesterAccount(c, dto.requestId);
      }
      if (!origin) throw new ProblemException('validacion', 400, 'Indica el origen del servicio.', 'origin');
      const service = (await c.query<{ id: string; version: number }>(`INSERT INTO ambulancia.servicio(unidad_id,solicitud_id,tipo,prioridad,paciente_id,origen,destino,municipio,despachado_por,despachado_en,clave_idempotencia)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,version`, [unit.id, dto.requestId ?? null, dto.type, dto.priority, patientId, origin, dto.destination.trim(), municipality, actor.id, now, `${actor.id}:${key}`])).rows[0];
      for (const person of crew) await c.query('INSERT INTO ambulancia.tripulacion(servicio_id,persona_id,funcion) VALUES($1,$2,$3)', [service.id, person.id, person.tipo]);
      const unitVersion = await this.setUnit(c, actor, unit, 'en_servicio', null);
      await this.commands.audit(c, actor, { action: 'ambulancia.despachar', entity: 'servicio', entityId: service.id, patientId: patientId ?? undefined, permission: 'ambulancia.despachar', detail: { requestId: dto.requestId ?? null, type: dto.type, priority: dto.priority } });
      await this.commands.event(c, 'ambulancia.estado_cambiado', 'unidad', unit.id, unitVersion, ['ambulancia', ...(account ? [`usuario:${account}`] : [])]);
      return { id: service.id, version: service.version, unitState: 'en_servicio', unitVersion, crew: crew.map(p => ({ staffId: p.id, role: p.tipo })) };
    });
  }

  /** Servicio con la tripulación del actor; solo la tripulación opera el servicio (contexto de la relación de atención). */
  private async crewService(c: PoolClient, actor: Actor, id: string, lock = true): Promise<Service> {
    const service = (await c.query<Service>(`SELECT id,unidad_id,solicitud_id,paciente_id,finalizado_en,version FROM ambulancia.servicio WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])).rows[0];
    if (!service) throw new NotFoundException('El servicio no existe.');
    if (!actor.staffId || !(await c.query('SELECT 1 FROM ambulancia.tripulacion WHERE servicio_id=$1 AND persona_id=$2', [id, actor.staffId])).rowCount) throw new ForbiddenException('Solo la tripulación asignada opera este servicio.');
    return service;
  }

  /** FR-109-07 / FR-109-08: hitos en orden; finalizar devuelve la unidad a Disponible en la misma transacción. */
  async milestone(actor: Actor, id: string, dto: MilestoneDto, key?: string) {
    return this.commands.run(actor, `ambulancia.operar:servicio:${id}:hito`, key, dto, async c => {
      const now = this.clock.now();
      const unit = await this.lockUnit(c);
      const service = await this.crewService(c, actor, id);
      if (service.finalizado_en) throw new ProblemException('servicio_finalizado', 409, 'El servicio ya finalizó.');
      const done = (await c.query<{ tipo: string }>('SELECT tipo FROM ambulancia.hito WHERE servicio_id=$1', [id])).rows.map(r => r.tipo);
      if (!nextMilestones(done).includes(dto.type as never)) throw new ProblemException('hito_fuera_de_orden', 409, 'Ese hito no sigue al último registrado.', 'type', { siguientes: nextMilestones(done) });
      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : now;
      if (occurredAt.getTime() > now.getTime() + 5 * 60000) throw new ProblemException('validacion', 400, 'La hora del hito no puede estar en el futuro.', 'occurredAt');
      let finalState: string | null = null;
      if (dto.type === 'finalizado') {
        const error = finalStateError(done, dto.finalState, dto.reason);
        if (error) throw new ProblemException('estado_final_invalido', 400, error, 'finalState');
        finalState = dto.finalState ?? 'completado';
        if (!finalStates.includes(finalState as never)) throw new BadRequestException('Estado final no válido.');
      }
      await c.query('INSERT INTO ambulancia.hito(servicio_id,tipo,ocurrido_en,registrado_en,registrado_por,clave_idempotencia) VALUES($1,$2,$3,$4,$5,$6)', [id, dto.type, occurredAt, now, actor.id, `${actor.id}:${key}`]);
      const version = (await c.query<{ version: number }>(`UPDATE ambulancia.servicio SET version=version+1${finalState ? ',finalizado_en=$2,estado_final=$3,motivo_final=$4' : ''} WHERE id=$1 RETURNING version`, finalState ? [id, occurredAt, finalState, dto.reason?.trim() || null] : [id])).rows[0].version;
      const account = await this.requesterAccount(c, service.solicitud_id);
      await this.commands.audit(c, actor, { action: 'ambulancia.hito', entity: 'servicio', entityId: id, patientId: service.paciente_id ?? undefined, permission: 'ambulancia.operar', reason: dto.reason, detail: { type: dto.type, finalState } });
      await this.commands.event(c, 'ambulancia.hito', 'servicio', id, version, ['ambulancia', ...(account ? [`usuario:${account}`] : [])]);
      let unitState: UnitState = unit.estado, unitVersion = unit.version;
      if (finalState) {
        unitVersion = await this.setUnit(c, actor, unit, 'disponible', `Servicio finalizado: ${finalState}`);
        unitState = 'disponible';
        await this.commands.event(c, 'ambulancia.estado_cambiado', 'unidad', unit.id, unitVersion, ['ambulancia']);
      }
      return { id, type: dto.type, occurredAt, version, finalState, unitState, unitVersion, nextMilestones: nextMilestones([...done, dto.type]) };
    });
  }

  /** FR-109-10 / FR-109-12: reporte prehospital de la tripulación; puede vincular al paciente del servicio (por ejemplo, uno provisional). */
  async prehospital(actor: Actor, id: string, dto: PrehospitalDto, key?: string) {
    return this.commands.run(actor, `ambulancia.reportar_prehospital:servicio:${id}`, key, dto, async c => {
      const now = this.clock.now();
      const service = await this.crewService(c, actor, id);
      if (!canReportAfter(service.finalizado_en, now)) throw new ProblemException('servicio_cerrado', 409, 'Pasaron más de 24 horas desde que terminó el servicio; ya no se puede reportar.');
      let patientId = service.paciente_id, version = service.version;
      if (dto.patientId && dto.patientId !== patientId) {
        if (patientId) throw new ProblemException('paciente_ya_vinculado', 409, 'El servicio ya tiene un paciente vinculado.');
        if (!(await c.query("SELECT 1 FROM pacientes.paciente WHERE id=$1 AND estado IN ('activo','provisional')", [dto.patientId])).rowCount) throw new NotFoundException('El paciente no existe o está inactivo.');
        patientId = dto.patientId;
        version = (await c.query<{ version: number }>('UPDATE ambulancia.servicio SET paciente_id=$2,version=version+1 WHERE id=$1 RETURNING version', [id, patientId])).rows[0].version;
      }
      const report = (await c.query<{ id: string; recibido_en: Date }>(`INSERT INTO ambulancia.reporte_prehospital(servicio_id,motivo,prioridad,signos,llegada_estimada,enviado_por,capturado_en,recibido_en,clave_idempotencia)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,recibido_en`, [id, dto.reason.trim(), dto.priority, dto.vitalSigns ?? {}, dto.estimatedArrival ?? null, actor.id, dto.capturedAt, now, `${actor.id}:${key}`])).rows[0];
      await this.commands.audit(c, actor, { action: 'ambulancia.prehospital', entity: 'servicio', entityId: id, patientId: patientId ?? undefined, permission: 'ambulancia.reportar_prehospital', detail: { reportId: report.id } });
      await this.commands.event(c, 'ambulancia.prehospital', 'servicio', id, version, ['ambulancia', ...await channelsFor(c, ['ambulancia.recibir_prehospital'])]);
      return { id: report.id, serviceId: id, receivedAt: report.recibido_en, version, patientLinked: !!patientId };
    });
  }

  /** FR-109-11: emergencia ve el reporte; el contenido clínico solo con relación de atención (privacidad.md), y la lectura se audita. */
  async readPrehospital(actor: Actor, id: string) {
    return this.db.transaction(async c => {
      const service = (await c.query<{ id: string; paciente_id: string | null; prioridad: string; finalizado_en: Date | null }>('SELECT id,paciente_id,prioridad,finalizado_en FROM ambulancia.servicio WHERE id=$1', [id])).rows[0];
      if (!service) throw new NotFoundException('El servicio no existe.');
      const clinical = hasPermission(actor, CLINICAL_PERMISSION);
      const rows = (await c.query(`SELECT id,prioridad AS priority,llegada_estimada AS "estimatedArrival",capturado_en AS "capturedAt",recibido_en AS "receivedAt",motivo AS reason,signos AS "vitalSigns"
        FROM ambulancia.reporte_prehospital WHERE servicio_id=$1 ORDER BY capturado_en DESC,recibido_en DESC`, [id])).rows;
      const reports = clinical ? rows : rows.map(({ reason, vitalSigns, ...rest }) => rest);
      await this.commands.audit(c, actor, { action: 'ambulancia.prehospital.ver', entity: 'servicio', entityId: id, patientId: service.paciente_id ?? undefined, permission: 'ambulancia.recibir_prehospital', detail: { clinical, reports: rows.length } });
      return { serviceId: id, active: !service.finalizado_en, priority: service.prioridad, patientLinked: !!service.paciente_id, clinical, reports };
    });
  }

  /** FR-109-13 (extra): ubicación de la tripulación, solo con servicio activo; el evento lleva solo el servicio. */
  async location(actor: Actor, dto: LocationDto, key?: string) {
    return this.commands.run(actor, 'ambulancia.operar:ubicacion', key, dto, async c => {
      if (!actor.staffId) throw new ForbiddenException('Tu cuenta no pertenece a la tripulación.');
      const service = (await c.query<{ id: string; version: number }>('SELECT s.id,s.version FROM ambulancia.servicio s JOIN ambulancia.tripulacion t ON t.servicio_id=s.id WHERE s.finalizado_en IS NULL AND t.persona_id=$1', [actor.staffId])).rows[0];
      if (!service) throw new ProblemException('sin_servicio_activo', 409, 'No tienes un servicio activo.');
      await c.query('INSERT INTO ambulancia.ubicacion(servicio_id,latitud,longitud,capturada_en) VALUES($1,$2,$3,$4)', [service.id, dto.latitude, dto.longitude, dto.capturedAt]);
      await this.commands.event(c, 'ambulancia.ubicacion', 'servicio', service.id, service.version, ['ambulancia']);
      return { serviceId: service.id, capturedAt: dto.capturedAt };
    });
  }

  /** FR-109-14 / FR-109-15: bitácora filtrable sin datos del paciente; el paramédico (`propio`) ve solo sus servicios. */
  async log(actor: Actor, filters: LogFilters) {
    const where: string[] = [], args: unknown[] = [];
    const add = (sql: string, value: unknown) => { args.push(value); where.push(sql.replace('?', `$${args.length}`)); };
    const own = !contextsOf(actor, 'ambulancia.ver_bitacora').some(ctx => ctx !== 'propio');
    if (own) add('EXISTS(SELECT 1 FROM ambulancia.tripulacion t WHERE t.servicio_id=s.id AND t.persona_id=?::uuid)', actor.staffId ?? '00000000-0000-0000-0000-000000000000');
    try {
      if (filters.from) add('s.despachado_en>=?::timestamptz', businessDayRange(filters.from).start);
      if (filters.to) add('s.despachado_en<?::timestamptz', businessDayRange(filters.to).end);
    } catch { throw new ProblemException('validacion', 400, 'Las fechas deben tener el formato yyyy-MM-dd.', 'from'); }
    if (filters.type) { if (!serviceTypes.includes(filters.type as never)) throw new ProblemException('validacion', 400, 'Tipo de servicio no válido.', 'type'); add('s.tipo=?', filters.type); }
    if (filters.finalState) { if (!finalStates.includes(filters.finalState as never)) throw new ProblemException('validacion', 400, 'Estado final no válido.', 'finalState'); add('s.estado_final=?', filters.finalState); }
    if (filters.priority) { if (!priorities.includes(filters.priority as never)) throw new ProblemException('validacion', 400, 'Prioridad no válida.', 'priority'); add('s.prioridad=?', filters.priority); }
    if (filters.crewId) { if (!/^[0-9a-f-]{36}$/i.test(filters.crewId)) throw new ProblemException('validacion', 400, 'Tripulación no válida.', 'crewId'); add('EXISTS(SELECT 1 FROM ambulancia.tripulacion t WHERE t.servicio_id=s.id AND t.persona_id=?::uuid)', filters.crewId); }
    if (filters.municipality) add('s.municipio ILIKE ?', filters.municipality.trim());
    if (filters.minResponseMinutes) {
      const minutes = Number(filters.minResponseMinutes);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) throw new ProblemException('validacion', 400, 'El umbral de respuesta debe ser de 0 a 1440 minutos.', 'minResponseMinutes');
      add("(SELECT min(h.ocurrido_en) FROM ambulancia.hito h WHERE h.servicio_id=s.id AND h.tipo='en_escena')-s.despachado_en>=make_interval(mins=>?::int)", minutes);
    }
    const rows = await this.db.query<{ dispatchedAt: Date; onScene: Date | null; record: string | null; origin: string; destination: string; municipality: string | null; crew: { name: string }[] }>(`SELECT s.id,s.tipo AS type,s.prioridad AS priority,s.origen AS origin,s.destino AS destination,s.municipio AS municipality,s.despachado_en AS "dispatchedAt",s.finalizado_en AS "finishedAt",s.estado_final AS "finalState",
        (SELECT min(h.ocurrido_en) FROM ambulancia.hito h WHERE h.servicio_id=s.id AND h.tipo='en_escena') AS "onScene",
        (SELECT pa.expediente FROM pacientes.paciente pa WHERE pa.id=s.paciente_id) AS "record",
        coalesce((SELECT json_agg(json_build_object('type',h.tipo,'occurredAt',h.ocurrido_en) ORDER BY h.ocurrido_en,h.registrado_en) FROM ambulancia.hito h WHERE h.servicio_id=s.id),'[]'::json) AS milestones,
        coalesce((SELECT json_agg(json_build_object('staffId',t.persona_id,'role',t.funcion,'name',p.nombres||' '||p.apellidos) ORDER BY t.funcion) FROM ambulancia.tripulacion t JOIN personal.persona p ON p.id=t.persona_id WHERE t.servicio_id=s.id),'[]'::json) AS crew
      FROM ambulancia.servicio s ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.despachado_en DESC LIMIT 500`, args);
    // Búsqueda libre sin acentos sobre origen, destino, municipio y tripulación; el expediente solo sale enmascarado.
    const needle = filters.q ? fold(filters.q.trim().slice(0, 80)) : '';
    const matches = (r: { origin: string; destination: string; municipality: string | null; crew: { name: string }[] }) => !needle || fold([r.origin, r.destination, r.municipality ?? '', ...r.crew.map(m => m.name)].join(' ')).includes(needle);
    return rows.filter(matches).map(({ onScene, record, ...row }) => ({ ...row, patientRef: maskRecord(record), responseMinutes: responseMinutes(new Date(row.dispatchedAt), onScene ? new Date(onScene) : null) }));
  }
}
