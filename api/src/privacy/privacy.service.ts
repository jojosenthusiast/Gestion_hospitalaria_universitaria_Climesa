import { Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf, hasPermission } from '../platform/actor';
import { AuditService } from '../platform/audit.service';
import { channelsFor } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { PolicyRegistry } from '../platform/policy.registry';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { AuditQueryDto, ExceptionalAccessApproveDto, ExceptionalAccessDenyDto, ExceptionalAccessQueryDto, ExceptionalAccessRequestDto } from './privacy.dto';
import { accessView, entityLabel, EXCEPTIONAL_REASON, grantedHours, isRecordAccess } from './privacy.rules';

const APPROVER = 'privacidad.aprobar_acceso';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, any>;

const ACCESS_SELECT = `SELECT x.id,x.solicitante_id AS "solicitanteId",u.nombre_mostrar AS solicitante,
  (SELECT string_agg(a.rol_codigo,',' ORDER BY a.rol_codigo) FROM acceso.asignacion_rol a WHERE a.usuario_id=x.solicitante_id) AS "solicitanteRoles",
  x.paciente_id AS "pacienteId",p.expediente,x.motivo,x.horas,x.urgencia,x.estado,x.resuelto_por AS "resueltoPor",x.resuelto_en AS "resueltoEn",
  lower(x.vigencia) AS desde,upper(x.vigencia) AS hasta,x.creado_en AS "creadoEn",x.version
  FROM acceso.acceso_excepcional x JOIN acceso.usuario u ON u.id=x.solicitante_id JOIN pacientes.paciente p ON p.id=x.paciente_id`;

@Injectable()
export class PrivacyService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock, private readonly policies: PolicyRegistry, private readonly chain: AuditService) {}

  private view(row: Row) { return { ...row, vista: accessView(row as any, this.clock.now()) }; }
  private async maxHours(c: PoolClient) { return (await this.policies.value<{ horas: number }>(c, 'privacidad.acceso_excepcional_max_horas', this.clock.now())).horas; }

  /** FR-110-04, FR-110-09. An urgent request ("romper el vidrio") is approved at once and waits for the delegate's review. */
  async request(actor: Actor, dto: ExceptionalAccessRequestDto, key?: string) {
    return this.commands.run(actor, `privacidad.solicitar_acceso:${dto.pacienteId}`, key, dto, async c => {
      const urgent = dto.urgencia === true;
      // FR-110-09 is for clinical staff with care relationships (the emergency doctor), never for administration.
      if (urgent && !(actor.staffId && contextsOf(actor, 'expediente.ver').includes('relacion'))) throw new ProblemException('urgencia_no_permitida', 403, 'Solo el personal médico puede abrir un acceso de urgencia.');
      const patient = (await c.query('SELECT id FROM pacientes.paciente WHERE id=$1', [dto.pacienteId])).rows[0];
      if (!patient) throw new NotFoundException('No se encontró el paciente.');
      const max = await this.maxHours(c);
      if (dto.horas > max) throw new ProblemException('validacion', 400, `El acceso excepcional dura como máximo ${max} h.`, 'horas');
      const pending = (await c.query("SELECT 1 FROM acceso.acceso_excepcional WHERE solicitante_id=$1 AND paciente_id=$2 AND estado='pendiente'", [actor.id, dto.pacienteId])).rowCount;
      if (pending) throw new ProblemException('acceso_pendiente_existente', 409, 'Ya tienes una solicitud pendiente para este paciente.');
      const now = this.clock.now(), until = new Date(now.getTime() + dto.horas * 3600_000);
      const id = (await c.query(`INSERT INTO acceso.acceso_excepcional(solicitante_id,paciente_id,motivo,horas,urgencia,estado,vigencia,creado_en)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [actor.id, dto.pacienteId, dto.motivo.trim(), dto.horas, urgent, urgent ? 'aprobado' : 'pendiente', urgent ? `[${now.toISOString()},${until.toISOString()})` : null, now])).rows[0].id as string;
      await this.commands.audit(c, actor, { action: urgent ? 'acceso_excepcional.urgencia' : 'acceso_excepcional.solicitar', entity: 'acceso_excepcional', entityId: id, patientId: dto.pacienteId, permission: 'privacidad.solicitar_acceso', reason: dto.motivo.trim(), detail: { horas: dto.horas, urgencia: urgent } });
      await this.commands.event(c, 'acceso.solicitado', 'acceso_excepcional', id, 1, await channelsFor(c, [APPROVER], { users: [actor.id] }));
      return this.view((await c.query(`${ACCESS_SELECT} WHERE x.id=$1`, [id])).rows[0]);
    });
  }

  /** FR-110-05: only the delegate, never on their own request. A reviewed urgent access keeps its range. */
  async approve(actor: Actor, id: string, dto: ExceptionalAccessApproveDto, key?: string) {
    return this.commands.run(actor, `privacidad.aprobar_acceso:${id}`, key, dto, async c => {
      const row = await this.lockForResolution(c, actor, id, dto.version);
      const now = this.clock.now();
      if (row.estado === 'pendiente') {
        const hours = grantedHours(row.horas, dto.horas, await this.maxHours(c));
        await c.query(`UPDATE acceso.acceso_excepcional SET estado='aprobado',vigencia=tstzrange($2::timestamptz,$3::timestamptz,'[)'),resuelto_por=$4,resuelto_en=$2,version=version+1 WHERE id=$1`, [id, now, new Date(now.getTime() + hours * 3600_000), actor.id]);
        await this.commands.audit(c, actor, { action: 'acceso_excepcional.aprobar', entity: 'acceso_excepcional', entityId: id, patientId: row.paciente_id, permission: APPROVER, detail: { horas: hours } });
      } else {
        await c.query('UPDATE acceso.acceso_excepcional SET resuelto_por=$2,resuelto_en=$3,version=version+1 WHERE id=$1', [id, actor.id, now]);
        await this.commands.audit(c, actor, { action: 'acceso_excepcional.revisar', entity: 'acceso_excepcional', entityId: id, patientId: row.paciente_id, permission: APPROVER, detail: { resultado: 'confirmado' } });
      }
      return this.resolved(c, id, row.solicitante_id);
    });
  }

  /** Denying a pending request closes it; denying an unreviewed urgent access ends it now. */
  async deny(actor: Actor, id: string, dto: ExceptionalAccessDenyDto, key?: string) {
    return this.commands.run(actor, `privacidad.aprobar_acceso:${id}`, key, dto, async c => {
      const row = await this.lockForResolution(c, actor, id, dto.version);
      const now = this.clock.now();
      await c.query(`UPDATE acceso.acceso_excepcional SET estado='negado',resuelto_por=$2,resuelto_en=$3,version=version+1,
        vigencia=CASE WHEN vigencia IS NULL THEN NULL ELSE tstzrange(lower(vigencia),greatest(lower(vigencia),least(upper(vigencia),$3::timestamptz)),'[)') END WHERE id=$1`, [id, actor.id, now]);
      await this.commands.audit(c, actor, { action: 'acceso_excepcional.negar', entity: 'acceso_excepcional', entityId: id, patientId: row.paciente_id, permission: APPROVER, reason: dto.motivo.trim(), detail: { urgencia: row.urgencia } });
      return this.resolved(c, id, row.solicitante_id);
    });
  }

  private async lockForResolution(c: PoolClient, actor: Actor, id: string, version: number) {
    const row = (await c.query('SELECT solicitante_id,paciente_id,horas,urgencia,estado,resuelto_por,version FROM acceso.acceso_excepcional WHERE id=$1 FOR UPDATE', [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la solicitud de acceso.');
    // RN-38: never one's own request (the table also forbids it).
    if (row.solicitante_id === actor.id) throw new ProblemException('aprobacion_propia', 403, 'No puedes resolver tu propia solicitud de acceso.');
    if (row.version !== version) throw new VersionConflictException(row.version, 'La solicitud cambió; vuelve a cargarla.');
    const open = row.estado === 'pendiente' || (row.estado === 'aprobado' && row.urgencia && !row.resuelto_por);
    if (!open) throw new ProblemException('acceso_ya_resuelto', 409, 'Esta solicitud ya fue resuelta.');
    return row;
  }

  private async resolved(c: PoolClient, id: string, requester: string) {
    const row = (await c.query(`${ACCESS_SELECT} WHERE x.id=$1`, [id])).rows[0];
    await this.commands.event(c, 'acceso.resuelto', 'acceso_excepcional', id, row.version, await channelsFor(c, [APPROVER], { users: [requester] }));
    return this.view(row);
  }

  /** The delegate sees every request; a requester (catalog context "Solicitante ve los suyos") only their own. */
  async list(actor: Actor, query: ExceptionalAccessQueryDto) {
    const all = hasPermission(actor, APPROVER);
    const rows = await this.db.query(`${ACCESS_SELECT} WHERE ($1::boolean OR x.solicitante_id=$2) AND ($3::text IS NULL OR x.estado=$3)
      ORDER BY (x.estado='pendiente' OR (x.urgencia AND x.resuelto_por IS NULL)) DESC,x.creado_en DESC LIMIT 200`, [all, actor.id, query.estado ?? null]);
    return rows.map(row => this.view(row));
  }

  /** FR-110-07: metadata only (who, when, which kind of data, reason), never clinical content. */
  async audit(actor: Actor, q: AuditQueryDto) {
    return this.db.transaction(async c => {
      const person = q.persona?.trim(), patient = q.paciente?.trim(), action = q.accion?.trim();
      const rows = (await c.query(`SELECT a.seq,a.registrado_en AS at,a.actor_rol AS role,u.nombre_mostrar AS actor,a.actor_id AS "actorId",a.permiso AS permission,
          a.accion AS action,a.entidad AS entity,a.entidad_id AS "entityId",a.paciente_id AS "patientId",p.expediente AS "patientRecord",a.resultado AS result,a.motivo AS reason
        FROM plataforma.auditoria a LEFT JOIN acceso.usuario u ON u.id=a.actor_id LEFT JOIN pacientes.paciente p ON p.id=a.paciente_id
        WHERE ($1::uuid IS NULL OR a.actor_id=$1) AND ($2::text IS NULL OR u.nombre_mostrar ILIKE $2 OR u.correo ILIKE $2)
          AND ($3::uuid IS NULL OR a.paciente_id=$3) AND ($4::text IS NULL OR p.expediente=$4)
          AND ($5::text IS NULL OR a.accion=$5 OR a.accion LIKE $6)
          AND ($7::timestamptz IS NULL OR a.registrado_en>=$7) AND ($8::timestamptz IS NULL OR a.registrado_en<$8)
        ORDER BY a.seq DESC LIMIT $9`, [
        person && UUID.test(person) ? person : null, person && !UUID.test(person) ? `%${person.replace(/[\\%_]/g, '\\$&')}%` : null,
        patient && UUID.test(patient) ? patient : null, patient && !UUID.test(patient) ? patient : null,
        action ?? null, action ? `${action.replace(/[\\%_]/g, '\\$&')}%` : null, q.desde ?? null, q.hasta ?? null, q.limite ?? 100,
      ])).rows;
      const filters = Object.fromEntries(Object.entries({ persona: !!person, paciente: !!patient, accion: action ?? null, desde: q.desde ?? null, hasta: q.hasta ?? null }).filter(([, v]) => v));
      await this.commands.audit(c, actor, { action: 'auditoria.consultar', entity: 'auditoria', permission: 'auditoria.ver', detail: { filtros: filters, filas: rows.length } });
      return rows;
    });
  }

  /** FR-110-07: walks the SHA-256 chain and points at the first row that does not match. */
  async verify(actor: Actor) {
    const result = await this.chain.verifyChain();
    await this.db.transaction(c => this.commands.audit(c, actor, { action: 'auditoria.verificar', entity: 'auditoria', permission: 'auditoria.ver', result: 'exito', detail: { integra: result.ok, revisados: result.checked } }));
    return result.ok
      ? { integra: true, revisados: result.checked, verificadoEn: this.clock.now().toISOString() }
      : { integra: false, revisados: result.checked, primeraFallida: result.seq, motivo: result.reason, verificadoEn: this.clock.now().toISOString() };
  }

  /** FR-110-08: date, role and reason of each access by other people; never staff names. */
  async myAccesses(actor: Actor) {
    if (!actor.patientId) return [];
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT a.registrado_en AS fecha,a.accion,a.entidad,a.motivo,
          (SELECT string_agg(r.nombre,', ' ORDER BY r.codigo) FROM acceso.rol r WHERE r.codigo=ANY(string_to_array(a.actor_rol,','))) AS rol
        FROM plataforma.auditoria a WHERE a.paciente_id=$1 AND a.actor_id IS DISTINCT FROM $2 AND a.resultado='exito'
        ORDER BY a.seq DESC LIMIT 300`, [actor.patientId, actor.id])).rows as Row[];
      await this.commands.audit(c, actor, { action: 'auditoria.mis_accesos', entity: 'auditoria', permission: 'auditoria.mis_accesos', detail: { filas: rows.length } });
      // The audit `motivo` may hold free text written by staff; the patient only sees whether the access was exceptional.
      return rows.filter(r => isRecordAccess(r.accion)).slice(0, 200).map(r => ({
        fecha: r.fecha, rol: r.rol ?? 'Personal del hospital', tipoDato: entityLabel(r.entidad),
        motivo: r.motivo === EXCEPTIONAL_REASON ? 'acceso excepcional' : 'atención', accesoExcepcional: r.motivo === EXCEPTIONAL_REASON,
      }));
    });
  }
}
