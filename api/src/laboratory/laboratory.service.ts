import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { VersionConflictException } from '../platform/problem';
import { LabCancelDto, LabOrderDto, LabPriority, LabResultDto, LabSampleDto, LabVersionDto } from './laboratory.dto';
import { classifyLabValue, matchesDoubleIdentification } from './laboratory.rules';

type Row = Record<string, any>;

@Injectable()
export class LaboratoryService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private async order(c: PoolClient, id: string, lock = false) {
    const row = (await c.query(`SELECT o.id,o.consulta_id AS "consultationId",o.paciente_id AS "patientId",o.medico_id AS "doctorId",
      o.prioridad AS priority,o.estado AS state,o.muestra_tomada_en AS "sampleTakenAt",o.completada_en AS "completedAt",
      o.revisada_en AS "reviewedAt",o.version,coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName"
      FROM laboratorio.orden o JOIN pacientes.paciente p ON p.id=o.paciente_id WHERE o.id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la orden de laboratorio.');
    return row;
  }

  async catalog() {
    return this.db.query(`SELECT id,codigo AS code,nombre AS name,es_panel AS "isPanel",unidad AS unit,tipo_resultado AS "resultType"
      FROM laboratorio.examen WHERE activo ORDER BY es_panel DESC,nombre,codigo`);
  }

  async list(actor: Actor) {
    const lab = contextsOf(actor, 'laboratorio.ver_cola').includes('x');
    const patient = contextsOf(actor, 'resultados.ver').includes('propio_revisado') && actor.patientId;
    const doctor = actor.staffId && contextsOf(actor, 'resultados.ver').includes('relacion') ? actor.staffId : null;
    if (!lab && !patient && !doctor) throw new ForbiddenException('No tienes permiso para consultar órdenes de laboratorio.');
    const rows = await this.db.transaction(async c => {
      const result = await c.query(`SELECT o.id,o.consulta_id AS "consultationId",o.paciente_id AS "patientId",o.medico_id AS "doctorId",
      o.prioridad AS priority,o.estado AS state,o.creada_en AS "createdAt",o.muestra_tomada_en AS "sampleTakenAt",
      o.completada_en AS "completedAt",o.revisada_en AS "reviewedAt",o.version,
      coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
      coalesce(json_agg(json_build_object('id',oi.id,'examId',oi.examen_id,'code',e.codigo,'name',e.nombre,'result',CASE WHEN ($1::boolean OR $3::uuid IS NOT NULL AND o.medico_id=$3 OR $2::boolean AND o.revisada_en IS NOT NULL) AND r.orden_item_id IS NOT NULL THEN json_build_object('value',r.valor,'text',r.texto,'mark',r.marca,'version',r.version) END) ORDER BY e.nombre) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
      FROM laboratorio.orden o JOIN pacientes.paciente p ON p.id=o.paciente_id
      LEFT JOIN laboratorio.orden_item oi ON oi.orden_id=o.id LEFT JOIN laboratorio.examen e ON e.id=oi.examen_id LEFT JOIN laboratorio.resultado r ON r.orden_item_id=oi.id
      WHERE ($1::boolean AND o.estado IN ('pendiente','en_proceso','completado')) OR ($4::uuid IS NOT NULL AND o.paciente_id=$4) OR ($3::uuid IS NOT NULL AND o.medico_id=$3)
      GROUP BY o.id,p.id ORDER BY o.creada_en DESC LIMIT 300`, [lab, !!patient, doctor, patient || null]);
      for (const row of result.rows) await this.commands.audit(c, actor, { action: 'laboratorio.leer', entity: 'orden_laboratorio', entityId: row.id, patientId: row.patientId, permission: 'resultados.ver' });
      return result.rows;
    });
    return rows;
  }

  async create(actor: Actor, dto: LabOrderDto, key?: string) {
    if (!actor.staffId) throw new ForbiddenException('La cuenta no está vinculada a personal clínico.');
    return this.commands.run(actor, 'laboratorio.ordenar', key, dto, async c => {
      const consultation = (await c.query(`SELECT id,paciente_id AS "patientId",medico_id AS "doctorId",estado FROM atencion.consulta WHERE id=$1`, [dto.consultationId])).rows[0] as Row | undefined;
      if (!consultation) throw new NotFoundException('No se encontró la consulta.');
      if (consultation.doctorId !== actor.staffId) throw new ForbiddenException('Solo puedes ordenar estudios para tus consultas.');
      if (!['abierta', 'firmada'].includes(consultation.estado)) throw new ConflictException('La consulta no está disponible para órdenes de laboratorio.');
      const requested = [...new Set(dto.exams)];
      const exams = (await c.query('SELECT id,activo FROM laboratorio.examen WHERE id=ANY($1::uuid[])', [requested])).rows;
      if (exams.length !== requested.length || exams.some(exam => !exam.activo)) throw new BadRequestException('Selecciona exámenes activos del catálogo.');
      const leaves = new Map<string, string>();
      for (const examId of requested) {
        const rows = (await c.query('SELECT laboratorio.hojas($1) AS id', [examId])).rows;
        for (const row of rows) leaves.set(row.id, examId);
      }
      if (!leaves.size) throw new BadRequestException('La orden debe contener al menos un examen hoja.');
      const order = (await c.query(`INSERT INTO laboratorio.orden(consulta_id,paciente_id,medico_id,prioridad) VALUES($1,$2,$3,$4) RETURNING id,version,estado AS state`, [dto.consultationId, consultation.patientId, actor.staffId, dto.priority ?? LabPriority.ROUTINE])).rows[0];
      for (const [examId, requestedId] of leaves) await c.query('INSERT INTO laboratorio.orden_item(orden_id,examen_id,pedido_como) VALUES($1,$2,$3)', [order.id, examId, requestedId]);
      await this.commands.audit(c, actor, { action: 'laboratorio.ordenar', entity: 'orden_laboratorio', entityId: order.id, patientId: consultation.patientId, permission: 'laboratorio.ordenar', detail: { consultationId: dto.consultationId, exams: requested } });
      await this.commands.event(c, 'laboratorio.actualizado', 'orden_laboratorio', order.id, order.version, await channelsFor(c, ['laboratorio.ver_cola', 'resultados.ver']));
      return { ...order, consultationId: dto.consultationId, patientId: consultation.patientId, itemCount: leaves.size };
    });
  }

  async sample(actor: Actor, id: string, dto: LabSampleDto, key?: string) {
    return this.commands.run(actor, 'laboratorio.procesar', key, dto, async c => {
      const old = await this.order(c, id, true);
      if (old.state !== 'pendiente') throw new ConflictException('Solo una orden pendiente puede pasar a toma de muestra.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargar la cola.');
      const identity = (await c.query(`SELECT expediente,trim(concat_ws(' ',nombres,primer_apellido,segundo_apellido)) AS "fullName"
        FROM pacientes.paciente WHERE id=$1`, [old.patientId])).rows[0];
      if (!identity || !matchesDoubleIdentification(identity, dto.expediente, dto.nombreCompleto)) {
        throw new ConflictException('La doble identificación no coincide con el expediente. Verifica expediente y nombre completo.');
      }
      const row = (await c.query(`UPDATE laboratorio.orden SET estado='en_proceso',muestra_tomada_en=$2,muestra_tomada_por=$3,version=version+1 WHERE id=$1 RETURNING id,estado AS state,version,muestra_tomada_en AS "sampleTakenAt"`, [id, this.clock.now(), actor.staffId])).rows[0];
      await this.commands.audit(c, actor, { action: 'laboratorio.muestra', entity: 'orden_laboratorio', entityId: id, patientId: old.patientId, permission: 'laboratorio.procesar' });
      await this.commands.event(c, 'laboratorio.actualizado', 'orden_laboratorio', id, row.version, await channelsFor(c, ['laboratorio.ver_cola', 'resultados.ver']));
      return row;
    });
  }

  async result(actor: Actor, id: string, dto: LabResultDto, key?: string) {
    return this.commands.run(actor, 'laboratorio.procesar', key, dto, async c => {
      const old = await this.order(c, id, true);
      if (old.state !== 'en_proceso') throw new ConflictException('La orden debe estar en proceso para capturar resultados.');
      const item = (await c.query(`SELECT oi.id,e.id AS "examId",e.tipo_resultado AS "resultType",e.unidad AS unit,p.sexo AS sex,
        CASE WHEN p.precision_nacimiento='exacta' THEN date_part('year',age((o.muestra_tomada_en AT TIME ZONE 'America/El_Salvador')::date,p.nacimiento))::int
             WHEN p.precision_nacimiento='estimada' THEN p.edad_estimada + date_part('year',age((o.muestra_tomada_en AT TIME ZONE 'America/El_Salvador')::date,p.edad_estimada_en))::int END AS age,
        (o.muestra_tomada_en AT TIME ZONE 'America/El_Salvador')::date AS "sampleDate"
        FROM laboratorio.orden_item oi JOIN laboratorio.examen e ON e.id=oi.examen_id
        JOIN laboratorio.orden o ON o.id=oi.orden_id JOIN pacientes.paciente p ON p.id=o.paciente_id
        WHERE oi.id=$1 AND oi.orden_id=$2`, [dto.orderItemId, id])).rows[0];
      if (!item) throw new BadRequestException('El examen no pertenece a esta orden.');
      if (dto.value === undefined && dto.text === undefined) throw new BadRequestException('Captura un valor numérico o un resultado textual.');
      if (item.resultType === 'numerico' && (dto.value === undefined || dto.text !== undefined)) throw new BadRequestException('Este examen requiere un valor numérico.');
      if (item.resultType === 'texto' && (dto.text === undefined || dto.value !== undefined)) throw new BadRequestException('Este examen requiere un resultado textual.');
      if (dto.unit !== undefined && dto.unit !== item.unit) throw new BadRequestException('La unidad debe coincidir con el catálogo del examen.');
      const previous = (await c.query('SELECT * FROM laboratorio.resultado WHERE orden_item_id=$1 FOR UPDATE', [dto.orderItemId])).rows[0];
      if (previous && !dto.reason?.trim()) throw new BadRequestException('Indica el motivo para corregir un resultado existente.');
      const ranges = dto.value === undefined ? [] : (await c.query(`SELECT id,minimo,maximo,critico_bajo,critico_alto FROM laboratorio.rango_referencia
        WHERE examen_id=$1 AND (sexo=$2 OR sexo='cualquiera') AND $3::int <@ edad_anios AND $4::date <@ vigencia
        ORDER BY (sexo=$2) DESC LIMIT 1`, [item.examId, item.sex, item.age, item.sampleDate])).rows;
      const range = ranges[0];
      const value = dto.value;
      const mark = classifyLabValue(value, range);
      if (previous) await c.query(`INSERT INTO laboratorio.resultado_historial(orden_item_id,version,valor,texto,marca,cambiado_por,motivo)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [dto.orderItemId, previous.version, previous.valor, previous.texto, previous.marca, actor.staffId, dto.reason!.trim()]);
      const row = (await c.query(`INSERT INTO laboratorio.resultado(orden_item_id,valor,texto,marca,rango_id,capturado_por) VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (orden_item_id) DO UPDATE SET valor=EXCLUDED.valor,texto=EXCLUDED.texto,marca=EXCLUDED.marca,rango_id=EXCLUDED.rango_id,capturado_por=EXCLUDED.capturado_por,capturado_en=now(),version=laboratorio.resultado.version+1
        RETURNING orden_item_id AS "orderItemId",valor,texto,marca,version`, [dto.orderItemId, value ?? null, dto.text ?? null, mark, range?.id ?? null, actor.staffId])).rows[0];
      await this.commands.audit(c, actor, { action: previous ? 'laboratorio.resultado_corregido' : 'laboratorio.resultado', entity: 'resultado_laboratorio', entityId: dto.orderItemId, patientId: old.patientId, permission: 'laboratorio.procesar', reason: dto.reason, detail: { mark, rangeId: range?.id ?? null } });
      await this.commands.event(c, mark.startsWith('critico_') ? 'laboratorio.critico' : 'laboratorio.actualizado', 'orden_laboratorio', id, old.version, await channelsFor(c, ['resultados.ver', 'laboratorio.ver_cola']));
      return row;
    });
  }

  async complete(actor: Actor, id: string, dto: LabVersionDto, key?: string) {
    return this.commands.run(actor, 'laboratorio.validar', key, dto, async c => {
      const old = await this.order(c, id, true);
      if (old.state !== 'en_proceso') throw new ConflictException('Solo una orden en proceso puede completarse.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargar la cola.');
      const missing = (await c.query('SELECT 1 FROM laboratorio.orden_item oi LEFT JOIN laboratorio.resultado r ON r.orden_item_id=oi.id WHERE oi.orden_id=$1 AND r.orden_item_id IS NULL LIMIT 1', [id])).rows[0];
      if (missing) throw new ConflictException('Captura todos los resultados antes de completar la orden.');
      const row = (await c.query(`UPDATE laboratorio.orden SET estado='completado',completada_en=$2,completada_por=$3,version=version+1 WHERE id=$1 RETURNING id,estado AS state,version,completada_en AS "completedAt"`, [id, this.clock.now(), actor.staffId])).rows[0];
      await this.commands.audit(c, actor, { action: 'laboratorio.completar', entity: 'orden_laboratorio', entityId: id, patientId: old.patientId, permission: 'laboratorio.validar' });
      await this.commands.event(c, 'laboratorio.actualizado', 'orden_laboratorio', id, row.version, await channelsFor(c, ['laboratorio.ver_cola', 'resultados.ver']));
      return row;
    });
  }

  async review(actor: Actor, id: string, dto: LabVersionDto, key?: string) {
    return this.commands.run(actor, 'laboratorio.revisar', key, dto, async c => {
      const old = await this.order(c, id, true);
      if (old.doctorId !== actor.staffId) throw new ForbiddenException('Solo el médico responsable puede revisar esta orden.');
      if (old.state !== 'completado') throw new ConflictException('La orden debe estar completada antes de revisarla.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargarla.');
      const row = (await c.query(`UPDATE laboratorio.orden SET revisada_en=$2,revisada_por=$3,version=version+1 WHERE id=$1 RETURNING id,version,revisada_en AS "reviewedAt"`, [id, this.clock.now(), actor.staffId])).rows[0];
      await this.commands.audit(c, actor, { action: 'laboratorio.revisar', entity: 'orden_laboratorio', entityId: id, patientId: old.patientId, permission: 'laboratorio.revisar' });
      // SEG-05: the patient hears about the order only once the doctor reviews and releases it (`propio_revisado`).
      await this.commands.event(c, 'laboratorio.actualizado', 'orden_laboratorio', id, row.version, await channelsFor(c, ['resultados.ver'], { users: [await patientAccount(c, old.patientId)] }));
      return row;
    });
  }

  async cancel(actor: Actor, id: string, dto: LabCancelDto, key?: string) {
    return this.commands.run(actor, 'laboratorio.cancelar', key, dto, async c => {
      const old = await this.order(c, id, true);
      if (!['pendiente', 'en_proceso'].includes(old.state)) throw new ConflictException('Solo se puede cancelar una orden pendiente o en proceso.');
      if (old.doctorId !== actor.staffId && !contextsOf(actor, 'laboratorio.cancelar').includes('x')) throw new ForbiddenException('No puedes cancelar esta orden.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargarla.');
      const row = (await c.query(`UPDATE laboratorio.orden SET estado='cancelado',motivo_cancelacion=$2,version=version+1 WHERE id=$1 RETURNING id,estado AS state,version`, [id, dto.reason.trim()])).rows[0];
      await this.commands.audit(c, actor, { action: 'laboratorio.cancelar', entity: 'orden_laboratorio', entityId: id, patientId: old.patientId, permission: 'laboratorio.cancelar', reason: dto.reason });
      await this.commands.event(c, 'laboratorio.actualizado', 'orden_laboratorio', id, row.version, await channelsFor(c, ['laboratorio.ver_cola', 'resultados.ver']));
      return row;
    });
  }
}
