import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf, hasPermission } from '../platform/actor';
import { ageOn, ageRange, fichaFields } from '../patients/patient.privacy';
import { channelsFor, patientAccount } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { LabAmendDto, LabCancelDto, LabOrderDto, LabPriority, LabResultDto, LabSampleDto, LabVersionDto } from './laboratory.dto';
import { LabPermissions, classifyLabValue, labOrderActions, matchesDoubleIdentification } from './laboratory.rules';

type Row = Record<string, any>;
type ResultInput = { value?: number; text?: string; unit?: string };

/** Admission states that count as "active" (same as the unique index `admision_activa_unica`). */
const ACTIVE_ADMISSION = "('pendiente_cama','hospitalizado','alta_firmada')";

@Injectable()
export class LaboratoryService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  private async order(c: PoolClient, id: string, lock = false) {
    const row = (await c.query(`SELECT o.id,o.consulta_id AS "consultationId",o.paciente_id AS "patientId",o.medico_id AS "doctorId",
      o.prioridad AS priority,o.estado AS state,o.muestra_tomada_en AS "sampleTakenAt",o.completada_en AS "completedAt",
      o.revisada_en AS "reviewedAt",o.enmendada_en AS "amendedAt",o.version,coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName"
      FROM laboratorio.orden o JOIN pacientes.paciente p ON p.id=o.paciente_id WHERE o.id=$1 ${lock ? 'FOR UPDATE OF o' : ''}`, [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la orden de laboratorio.');
    return row;
  }

  async catalog() {
    return this.db.query(`SELECT id,codigo AS code,nombre AS name,es_panel AS "isPanel",unidad AS unit,tipo_resultado AS "resultType"
      FROM laboratorio.examen WHERE activo ORDER BY es_panel DESC,nombre,codigo`);
  }

  /** Who reads: the lab queue (`x`), the patient's own reviewed results, or a doctor (orders it requested or may review). */
  private scope(actor: Actor) {
    const lab = contextsOf(actor, 'laboratorio.ver_cola').includes('x');
    const patient = contextsOf(actor, 'resultados.ver').includes('propio_revisado') && actor.patientId ? actor.patientId : null;
    const doctor = actor.staffId && contextsOf(actor, 'resultados.ver').includes('relacion') ? actor.staffId : null;
    if (!lab && !patient && !doctor) throw new ForbiddenException('No tienes permiso para consultar órdenes de laboratorio.');
    return { lab, patient, doctor };
  }

  async list(actor: Actor) {
    const { lab, patient, doctor } = this.scope(actor);
    return (await this.orders(actor, lab, patient, doctor)).map(({ reviewer: _reviewer, ...row }) => row);
  }

  /**
   * GET /laboratorio/ordenes/{id} (MA-LAB-06): the same row the list shows, plus the cancel reason and, for whoever sees
   * the values, the correction history of each result. Outside the reader's scope the order does not exist (404).
   */
  async detail(actor: Actor, id: string) {
    const { lab, patient, doctor } = this.scope(actor);
    const [found] = await this.orders(actor, lab, patient, doctor, id);
    if (!found) throw new NotFoundException('No se encontró la orden de laboratorio.');
    const { reviewer, ...row } = found;
    const seesValues = lab || (!!doctor && (row.doctorId === doctor || !!reviewer));
    const extra = await this.db.transaction(async c => {
      const reason = (await c.query('SELECT motivo_cancelacion AS reason FROM laboratorio.orden WHERE id=$1', [id])).rows[0]?.reason ?? null;
      const history = seesValues ? (await c.query(`SELECT h.orden_item_id AS "orderItemId",h.version,h.valor::float8 AS value,h.texto AS text,h.marca AS mark,
          h.cambiado_en AS "changedAt",nullif(concat_ws(' ',m.nombres,m.apellidos),'') AS "changedByName",h.motivo AS reason
        FROM laboratorio.resultado_historial h JOIN laboratorio.orden_item oi ON oi.id=h.orden_item_id LEFT JOIN personal.persona m ON m.id=h.cambiado_por
        WHERE oi.orden_id=$1 ORDER BY h.cambiado_en DESC,h.version DESC`, [id])).rows : [];
      return { cancellationReason: reason as string | null, history };
    });
    return { ...row, ...extra };
  }

  /**
   * GET /me/laboratorio (FR-107-10, FR-107-11): only the authenticated patient's orders. The state is always visible;
   * values only once the treating doctor reviewed the order (D-040). An unlinked account has no orders (RN-39).
   */
  async mine(actor: Actor) {
    if (!actor.patientId || !contextsOf(actor, 'resultados.ver').includes('propio_revisado')) throw new ProblemException('sin_vinculacion', 404, 'Tu cuenta todavía no está vinculada a un expediente.');
    return (await this.orders(actor, false, actor.patientId, null)).map(({ reviewer: _reviewer, ...row }) => row);
  }

  /**
   * MA-LAB-01: open work (pending, in process, completed but not reviewed) is never cut off; only closed orders (released
   * or cancelled) are capped to the latest 300. MA-LAB-03: a doctor also sees, with values, the completed orders it may
   * review (laboratorio.puede_revisar).
   */
  private async orders(actor: Actor, lab: boolean, patient: string | null, doctor: string | null, only?: string) {
    const rows = await this.db.transaction(async c => {
      const result = await c.query(`WITH alcance AS (
          SELECT o.id,o.creada_en,(o.estado IN ('pendiente','en_proceso') OR (o.estado='completado' AND o.revisada_en IS NULL)) AS abierta
          FROM laboratorio.orden o
          WHERE ($5::uuid IS NULL OR o.id=$5) AND (($1::boolean AND o.estado IN ('pendiente','en_proceso','completado'))
            OR ($4::uuid IS NOT NULL AND o.paciente_id=$4)
            OR ($3::uuid IS NOT NULL AND (o.medico_id=$3 OR (o.estado='completado' AND o.revisada_en IS NULL AND laboratorio.puede_revisar(o.id,$3,$6)))))
        ), elegidas AS (
          SELECT id FROM alcance WHERE abierta
          UNION ALL (SELECT id FROM alcance WHERE NOT abierta ORDER BY creada_en DESC LIMIT 300)
        ), filas AS (
          SELECT o.*,($3::uuid IS NOT NULL AND laboratorio.puede_revisar(o.id,$3,$6)) AS revisor FROM laboratorio.orden o JOIN elegidas e ON e.id=o.id
        )
        SELECT o.id,o.consulta_id AS "consultationId",o.paciente_id AS "patientId",o.medico_id AS "doctorId",
        o.prioridad AS priority,o.estado AS state,o.creada_en AS "createdAt",o.muestra_tomada_en AS "sampleTakenAt",
        o.completada_en AS "completedAt",o.revisada_en AS "reviewedAt",o.enmendada_en AS "amendedAt",o.version,o.revisor AS reviewer,
        coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional) AS "patientName",
        p.expediente AS "patientRecord",p.sexo AS "patientSex",p.nacimiento::text AS "birthRaw",m.nombres||' '||m.apellidos AS "doctorName",
        count(oi.id)::int AS "itemCount",count(r.orden_item_id)::int AS "capturedCount",
        coalesce(json_agg(json_build_object('id',oi.id,'examId',oi.examen_id,'code',e.codigo,'name',e.nombre,'unit',e.unidad,'result',CASE WHEN ($1::boolean OR $3::uuid IS NOT NULL AND (o.medico_id=$3 OR o.revisor) OR $2::boolean AND o.revisada_en IS NOT NULL) AND r.orden_item_id IS NOT NULL THEN json_build_object('value',r.valor,'text',r.texto,'mark',r.marca,'version',r.version) END) ORDER BY e.nombre) FILTER (WHERE oi.id IS NOT NULL),'[]'::json) AS items
        FROM filas o JOIN pacientes.paciente p ON p.id=o.paciente_id LEFT JOIN personal.persona m ON m.id=o.medico_id
        LEFT JOIN laboratorio.orden_item oi ON oi.orden_id=o.id LEFT JOIN laboratorio.examen e ON e.id=oi.examen_id LEFT JOIN laboratorio.resultado r ON r.orden_item_id=oi.id
        GROUP BY o.id,o.consulta_id,o.paciente_id,o.medico_id,o.prioridad,o.estado,o.creada_en,o.muestra_tomada_en,o.completada_en,o.revisada_en,o.enmendada_en,o.version,o.revisor,p.id,m.id
        ORDER BY o.creada_en DESC`, [lab, !!patient, doctor, patient, only ?? null, this.clock.now()]);
      for (const row of result.rows) await this.commands.audit(c, actor, { action: 'laboratorio.leer', entity: 'orden_laboratorio', entityId: row.id, patientId: row.patientId, permission: 'resultados.ver' });
      return result.rows;
    });
    // Ronda 2 (obs. 4): la edad respeta la privacidad de la ficha (exacta con fecha visible, por decenio con `rango`, nada sin permiso).
    const today = this.clock.today();
    const can = this.permissionsOf(actor);
    return rows.map(({ birthRaw, itemCount, capturedCount, ...row }) => {
      const fields = fichaFields(actor, actor.patientId === row.patientId);
      const age = birthRaw ? ageOn(String(birthRaw).slice(0, 10), today) : null;
      const allowedActions = labOrderActions({ state: row.state, reviewed: !!row.reviewedAt, allCaptured: itemCount > 0 && itemCount === capturedCount, reviewer: !!row.reviewer, own: !!actor.staffId && row.doctorId === actor.staffId }, can);
      return { ...row, patientAge: fields.birth ? age : null, patientAgeRange: fields.ageRange ? ageRange(age) : null, allowedActions } as Row;
    });
  }

  private permissionsOf(actor: Actor): LabPermissions {
    const cancel = contextsOf(actor, 'laboratorio.cancelar');
    return {
      process: contextsOf(actor, 'laboratorio.procesar').includes('x'),
      validate: contextsOf(actor, 'laboratorio.validar').includes('x'),
      review: hasPermission(actor, 'laboratorio.revisar'),
      cancelAny: cancel.includes('x'),
      cancelOwn: cancel.includes('autor'),
    };
  }

  /** Active accounts of staff members. */
  private async staffAccounts(c: PoolClient, staffIds: Array<string | null | undefined>) {
    const ids = [...new Set(staffIds.filter((id): id is string => !!id))];
    if (!ids.length) return [];
    return (await c.query(`SELECT id FROM acceso.usuario WHERE persona_personal_id=ANY($1::uuid[]) AND estado='activo'`, [ids])).rows.map(r => r.id as string);
  }

  /**
   * RN-25, MA-LAB-04: a critical value also reaches the requesting doctor and the attending doctor of the patient's active
   * admission on their own `usuario:` channel (besides the role channels); the mobile clients show it as a banner.
   */
  private async resultChannels(c: PoolClient, order: Row, critical: boolean, extraUsers: Array<string | null> = []) {
    const users = [...extraUsers];
    if (critical) {
      const attending = (await c.query(`SELECT medico_tratante_id AS id FROM hospitalizacion.admision WHERE paciente_id=$1 AND estado IN ${ACTIVE_ADMISSION}`, [order.patientId])).rows.map(r => r.id as string);
      users.push(...await this.staffAccounts(c, [order.doctorId, ...attending]));
    }
    return channelsFor(c, ['resultados.ver', 'laboratorio.ver_cola'], { users });
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
    return this.commands.run(actor, `laboratorio.procesar:${id}:muestra`, key, dto, async c => {
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
    return this.commands.run(actor, `laboratorio.procesar:${id}:resultado:${dto.orderItemId}`, key, dto, async c => {
      const old = await this.order(c, id, true);
      if (old.state !== 'en_proceso') throw new ConflictException('La orden debe estar en proceso para capturar resultados.');
      // API-10, N-18, MA-LAB-01: two technicians cannot overwrite each other; every capture moves the order version.
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargarla.');
      const item = await this.item(c, id, dto.orderItemId);
      this.checkValue(item, dto);
      const previous = (await c.query('SELECT * FROM laboratorio.resultado WHERE orden_item_id=$1 FOR UPDATE', [dto.orderItemId])).rows[0];
      if (previous && !dto.reason?.trim()) throw new BadRequestException('Indica el motivo para corregir un resultado existente.');
      const { mark, range } = await this.mark(c, item, dto.value);
      if (previous) await this.archive(c, actor, previous, dto.reason!.trim());
      const row = await this.store(c, actor, dto.orderItemId, dto, mark, range);
      await this.commands.audit(c, actor, { action: previous ? 'laboratorio.resultado_corregido' : 'laboratorio.resultado', entity: 'resultado_laboratorio', entityId: dto.orderItemId, patientId: old.patientId, permission: 'laboratorio.procesar', reason: dto.reason, detail: { mark, rangeId: range?.id ?? null } });
      const order = (await c.query('UPDATE laboratorio.orden SET version=version+1 WHERE id=$1 RETURNING version', [id])).rows[0];
      const critical = mark.startsWith('critico_');
      await this.commands.event(c, critical ? 'laboratorio.critico' : 'laboratorio.actualizado', 'orden_laboratorio', id, order.version, await this.resultChannels(c, old, critical));
      return { ...row, orderVersion: order.version };
    });
  }

  /**
   * POST /laboratorio/ordenes/{id}/enmendar (MA-LAB-02, D-13, D-040): corrects a result of a completed order, even one
   * already released. The previous value goes to the history with the reason; the order stays `completado` (the
   * validar_orden trigger does not allow leaving it) and goes back to the doctor's review, so the patient stops seeing
   * the values until a doctor releases them again.
   */
  async amend(actor: Actor, id: string, dto: LabAmendDto, key?: string) {
    return this.commands.run(actor, `laboratorio.validar:${id}:enmienda:${dto.orderItemId}`, key, dto, async c => {
      const old = await this.order(c, id, true);
      if (old.state !== 'completado') throw new ConflictException('Solo se enmienda el resultado de una orden completada; mientras está en proceso se corrige en la captura.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargarla.');
      const item = await this.item(c, id, dto.orderItemId);
      this.checkValue(item, dto);
      const previous = (await c.query('SELECT * FROM laboratorio.resultado WHERE orden_item_id=$1 FOR UPDATE', [dto.orderItemId])).rows[0];
      if (!previous) throw new ConflictException('Este examen no tiene un resultado que enmendar.');
      const { mark, range } = await this.mark(c, item, dto.value);
      await this.archive(c, actor, previous, dto.reason.trim());
      const row = await this.store(c, actor, dto.orderItemId, dto, mark, range);
      const order = (await c.query(`UPDATE laboratorio.orden SET revisada_en=NULL,revisada_por=NULL,enmendada_en=$2,enmendada_por=$3,version=version+1 WHERE id=$1 RETURNING version`, [id, this.clock.now(), actor.staffId])).rows[0];
      const wasReleased = !!old.reviewedAt;
      await this.commands.audit(c, actor, { action: 'laboratorio.resultado_enmendado', entity: 'resultado_laboratorio', entityId: dto.orderItemId, patientId: old.patientId, permission: 'laboratorio.validar', reason: dto.reason, detail: { mark, rangeId: range?.id ?? null, previousVersion: previous.version, wasReleased } });
      const critical = mark.startsWith('critico_');
      // The requesting doctor must review again; if the values were already released, the patient sees them go back to review.
      const users = [...await this.staffAccounts(c, [old.doctorId]), wasReleased ? await patientAccount(c, old.patientId) : null];
      await this.commands.event(c, critical ? 'laboratorio.critico' : 'laboratorio.actualizado', 'orden_laboratorio', id, order.version, await this.resultChannels(c, old, critical, users));
      return { ...row, orderVersion: order.version };
    });
  }

  private async item(c: PoolClient, orderId: string, orderItemId: string) {
    const item = (await c.query(`SELECT oi.id,e.id AS "examId",e.tipo_resultado AS "resultType",e.unidad AS unit,p.sexo AS sex,
      CASE WHEN p.precision_nacimiento='exacta' THEN date_part('year',age((o.muestra_tomada_en AT TIME ZONE 'America/El_Salvador')::date,p.nacimiento))::int
           WHEN p.precision_nacimiento='estimada' THEN p.edad_estimada + date_part('year',age((o.muestra_tomada_en AT TIME ZONE 'America/El_Salvador')::date,p.edad_estimada_en))::int END AS age,
      (o.muestra_tomada_en AT TIME ZONE 'America/El_Salvador')::date AS "sampleDate"
      FROM laboratorio.orden_item oi JOIN laboratorio.examen e ON e.id=oi.examen_id
      JOIN laboratorio.orden o ON o.id=oi.orden_id JOIN pacientes.paciente p ON p.id=o.paciente_id
      WHERE oi.id=$1 AND oi.orden_id=$2`, [orderItemId, orderId])).rows[0] as Row | undefined;
    if (!item) throw new BadRequestException('El examen no pertenece a esta orden.');
    return item;
  }

  private checkValue(item: Row, dto: ResultInput) {
    if (dto.value === undefined && dto.text === undefined) throw new BadRequestException('Captura un valor numérico o un resultado textual.');
    if (item.resultType === 'numerico' && (dto.value === undefined || dto.text !== undefined)) throw new BadRequestException('Este examen requiere un valor numérico.');
    if (item.resultType === 'texto' && (dto.text === undefined || dto.value !== undefined)) throw new BadRequestException('Este examen requiere un resultado textual.');
    if (dto.unit !== undefined && dto.unit !== item.unit) throw new BadRequestException('La unidad debe coincidir con el catálogo del examen.');
  }

  /** The mark is always computed with the range valid on the sample date (RN-24), never chosen by the client. */
  private async mark(c: PoolClient, item: Row, value?: number) {
    const ranges = value === undefined ? [] : (await c.query(`SELECT id,minimo,maximo,critico_bajo,critico_alto FROM laboratorio.rango_referencia
      WHERE examen_id=$1 AND (sexo=$2 OR sexo='cualquiera') AND $3::int <@ edad_anios AND $4::date <@ vigencia
      ORDER BY (sexo=$2) DESC LIMIT 1`, [item.examId, item.sex, item.age, item.sampleDate])).rows;
    const range = ranges[0] as Row | undefined;
    return { mark: classifyLabValue(value, range as any), range };
  }

  /** Rule 6: nothing clinical is deleted; the replaced value stays in the history with who changed it and why. */
  private async archive(c: PoolClient, actor: Actor, previous: Row, reason: string) {
    await c.query(`INSERT INTO laboratorio.resultado_historial(orden_item_id,version,valor,texto,marca,cambiado_por,motivo)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [previous.orden_item_id, previous.version, previous.valor, previous.texto, previous.marca, actor.staffId, reason]);
  }

  private async store(c: PoolClient, actor: Actor, orderItemId: string, dto: ResultInput, mark: string, range?: Row) {
    return (await c.query(`INSERT INTO laboratorio.resultado(orden_item_id,valor,texto,marca,rango_id,capturado_por) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT (orden_item_id) DO UPDATE SET valor=EXCLUDED.valor,texto=EXCLUDED.texto,marca=EXCLUDED.marca,rango_id=EXCLUDED.rango_id,capturado_por=EXCLUDED.capturado_por,capturado_en=now(),version=laboratorio.resultado.version+1
      RETURNING orden_item_id AS "orderItemId",valor,texto,marca,version`, [orderItemId, dto.value ?? null, dto.text ?? null, mark, range?.id ?? null, actor.staffId])).rows[0];
  }

  async complete(actor: Actor, id: string, dto: LabVersionDto, key?: string) {
    return this.commands.run(actor, `laboratorio.validar:${id}`, key, dto, async c => {
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
    return this.commands.run(actor, `laboratorio.revisar:${id}`, key, dto, async c => {
      const old = await this.order(c, id, true);
      // MA-LAB-03: requester, attending doctor, current care relationship or, while the requester is off duty, a doctor on duty.
      const allowed = !!actor.staffId && !!(await c.query('SELECT laboratorio.puede_revisar($1,$2,$3) AS ok', [id, actor.staffId, this.clock.now()])).rows[0]?.ok;
      if (!allowed) throw new ForbiddenException('Solo revisa el médico que pidió la orden, el tratante, un médico con relación de atención vigente o, si quien la pidió no está de turno, un médico de turno.');
      if (old.state !== 'completado') throw new ConflictException('La orden debe estar completada antes de revisarla.');
      if (old.version !== dto.version) throw new VersionConflictException(old.version, 'La orden cambió; vuelve a cargarla.');
      const row = (await c.query(`UPDATE laboratorio.orden SET revisada_en=$2,revisada_por=$3,version=version+1 WHERE id=$1 RETURNING id,version,revisada_en AS "reviewedAt"`, [id, this.clock.now(), actor.staffId])).rows[0];
      await this.commands.audit(c, actor, { action: 'laboratorio.revisar', entity: 'orden_laboratorio', entityId: id, patientId: old.patientId, permission: 'laboratorio.revisar', detail: { substitute: old.doctorId !== actor.staffId } });
      // SEG-05: the patient hears about the order only once the doctor reviews and releases it (`propio_revisado`).
      await this.commands.event(c, 'laboratorio.actualizado', 'orden_laboratorio', id, row.version, await channelsFor(c, ['resultados.ver'], { users: [await patientAccount(c, old.patientId)] }));
      return row;
    });
  }

  async cancel(actor: Actor, id: string, dto: LabCancelDto, key?: string) {
    return this.commands.run(actor, `laboratorio.cancelar:${id}`, key, dto, async c => {
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
