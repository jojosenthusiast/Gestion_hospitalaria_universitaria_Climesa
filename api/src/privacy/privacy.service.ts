import { Injectable } from '@nestjs/common';
import { Actor } from '../platform/actor';
import { AuditService } from '../platform/audit.service';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { AuditQueryDto } from './privacy.dto';
import { entityLabel, EXCEPTIONAL_REASON, isRecordAccess } from './privacy.rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, any>;

@Injectable()
export class PrivacyService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock, private readonly chain: AuditService) {}

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
      // The audit `motivo` may hold free text written by staff; legacy rows of the retired exceptional-access module keep their label.
      return rows.filter(r => isRecordAccess(r.accion)).slice(0, 200).map(r => ({
        fecha: r.fecha, rol: r.rol ?? 'Personal del hospital', tipoDato: entityLabel(r.entidad),
        motivo: r.motivo === EXCEPTIONAL_REASON ? 'acceso excepcional' : 'atención',
      }));
    });
  }
}
