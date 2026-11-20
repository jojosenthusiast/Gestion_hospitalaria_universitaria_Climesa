import { Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { AuditService } from '../platform/audit.service';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { AuditQueryDto, ExportAuditDto } from './privacy.dto';
import { entityLabel, EXCEPTIONAL_REASON, isRecordAccess, URGENT_RECEPTION_REASON } from './privacy.rules';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Row = Record<string, any>;

/**
 * Human name of what an operation acted on, for the auditor table: the account, staff member or bed/space. Patients
 * are shown by record number (`patientRecord`), never by name. Ids are text in the audit, so the joins compare as text.
 */
const SUBJECT = `CASE a.entidad WHEN 'usuario' THEN su.nombre_mostrar WHEN 'personal' THEN sp.nombres||' '||sp.apellidos
  WHEN 'cama' THEN se.codigo WHEN 'espacio' THEN se.codigo END`;
const SUBJECT_JOINS = `LEFT JOIN acceso.usuario su ON a.entidad='usuario' AND su.id::text=a.entidad_id
  LEFT JOIN personal.persona sp ON a.entidad='personal' AND sp.id::text=a.entidad_id
  LEFT JOIN infra.espacio se ON a.entidad IN ('cama','espacio') AND se.id::text=a.entidad_id`;

/** The auditor's own reads are hidden unless asked for, or unless the action filter names them explicitly. */
const hidesOwnReads = (q: AuditQueryDto) => q.incluirConsultasAuditoria !== 'true'
  && !(q.accion ?? '').split(',').map(a => a.trim()).some(a => a.length >= 2 && 'auditoria.consultar'.startsWith(a));

@Injectable()
export class PrivacyService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock, private readonly chain: AuditService) {}

  /** FR-110-07: metadata only (who, when, which kind of data, reason), never clinical content. Legacy shape: a plain list. */
  async audit(actor: Actor, q: AuditQueryDto) {
    return this.db.transaction(async c => {
      const { rows } = await this.search(c, q, 0, q.limite ?? 100);
      await this.record(c, actor, q, rows.length);
      return rows.map(({ total: _total, ...row }) => row);
    });
  }

  /** Auditor view: the same filters, plus sorting and pages with the total of matching rows. */
  async auditPage(actor: Actor, q: AuditQueryDto) {
    const limit = q.limite ?? 25, page = q.pagina ?? 1;
    return this.db.transaction(async c => {
      const { rows, total } = await this.search(c, q, (page - 1) * limit, limit, hidesOwnReads(q) ? actor.id : null);
      await this.record(c, actor, q, rows.length);
      return { filas: rows.map(({ total: _total, ...row }) => row), total, pagina: page, limite: limit };
    });
  }

  /** Values the filters can take, taken from the audit itself so the list never offers an empty result. */
  async auditOptions() {
    const [actions, entities, roles] = await Promise.all([
      this.db.query<{ v: string }>('SELECT DISTINCT accion AS v FROM plataforma.auditoria ORDER BY 1 LIMIT 300'),
      this.db.query<{ v: string }>('SELECT DISTINCT entidad AS v FROM plataforma.auditoria ORDER BY 1 LIMIT 200'),
      this.db.query<{ v: string }>("SELECT DISTINCT unnest(string_to_array(actor_rol,',')) AS v FROM plataforma.auditoria WHERE actor_rol IS NOT NULL ORDER BY 1 LIMIT 50"),
    ]);
    return { acciones: actions.map(r => r.v), entidades: entities.map(r => r.v), roles: roles.map(r => r.v) };
  }

  /** One audit row with its metadata and chain hashes, so the auditor can see what was signed. */
  async auditDetail(actor: Actor, seq: string) {
    if (!/^\d{1,18}$/.test(seq)) throw new NotFoundException('No se encontró el registro de auditoría.');
    return this.db.transaction(async c => {
      const row = (await c.query(`SELECT a.seq,a.registrado_en AS at,a.actor_rol AS role,u.nombre_mostrar AS actor,a.actor_id AS "actorId",a.permiso AS permission,
          a.accion AS action,a.entidad AS entity,a.entidad_id AS "entityId",a.paciente_id AS "patientId",p.expediente AS "patientRecord",a.resultado AS result,a.motivo AS reason,${SUBJECT} AS subject,
          a.correlacion AS correlation,a.detalle,encode(a.hash,'hex') AS hash,encode(a.hash_previo,'hex') AS "previousHash",
          (SELECT max(x.seq) FROM plataforma.auditoria x WHERE x.seq<a.seq) AS "previousSeq",(SELECT min(x.seq) FROM plataforma.auditoria x WHERE x.seq>a.seq) AS "nextSeq"
        FROM plataforma.auditoria a LEFT JOIN acceso.usuario u ON u.id=a.actor_id LEFT JOIN pacientes.paciente p ON p.id=a.paciente_id ${SUBJECT_JOINS} WHERE a.seq=$1`, [seq])).rows[0] as Row | undefined;
      if (!row) throw new NotFoundException('No se encontró el registro de auditoría.');
      const { detalle, ...rest } = row;
      const { canonicalEvent: _signed, ...detail } = (detalle ?? {}) as Record<string, unknown>;
      await this.commands.audit(c, actor, { action: 'auditoria.consultar', entity: 'auditoria', entityId: seq, permission: 'auditoria.ver', detail: { detalle: seq } });
      return { ...rest, detail };
    });
  }

  /**
   * `hideReadsOf`: every page the auditor opens is itself audited as `auditoria.consultar`, so with the newest first those
   * rows would bury everything else. The auditor view leaves out that account's own reads (they stay recorded).
   */
  private async search(c: PoolClient, q: AuditQueryDto, offset: number, limit: number, hideReadsOf: string | null = null) {
    const person = q.persona?.trim(), patient = q.paciente?.trim();
    const actions = (q.accion ?? '').split(',').map(a => a.trim()).filter(Boolean);
    const results = (q.resultado ?? '').split(',').filter(Boolean);
    const escape = (s: string) => s.replace(/[\\%_]/g, '\\$&');
    const dir = q.sentido === 'asc' ? 'ASC' : 'DESC';
    const order = ({ fecha: 'a.seq', persona: 'u.nombre_mostrar', rol: 'a.actor_rol', accion: 'a.accion', entidad: 'a.entidad', paciente: 'p.expediente', resultado: 'a.resultado' } as const)[q.orden ?? 'fecha'];
    const params: unknown[] = [
      person && UUID.test(person) ? person : null, person && !UUID.test(person) ? `%${escape(person)}%` : null,
      patient && UUID.test(patient) ? patient : null, patient && !UUID.test(patient) ? patient : null,
      actions.length ? actions.map(a => `${escape(a)}%`) : null, q.desde ?? null, q.hasta ?? null, q.rol ?? null, q.entidad ?? null, results.length ? results : null, limit, offset, hideReadsOf,
    ];
    const rows = (await c.query(`SELECT a.seq,a.registrado_en AS at,a.actor_rol AS role,u.nombre_mostrar AS actor,a.actor_id AS "actorId",a.permiso AS permission,
        a.accion AS action,a.entidad AS entity,a.entidad_id AS "entityId",a.paciente_id AS "patientId",p.expediente AS "patientRecord",a.resultado AS result,a.motivo AS reason,
        ${SUBJECT} AS subject,count(*) OVER() AS total
      FROM plataforma.auditoria a LEFT JOIN acceso.usuario u ON u.id=a.actor_id LEFT JOIN pacientes.paciente p ON p.id=a.paciente_id ${SUBJECT_JOINS}
      WHERE ($1::uuid IS NULL OR a.actor_id=$1) AND ($2::text IS NULL OR u.nombre_mostrar ILIKE $2 OR u.correo ILIKE $2)
        AND ($3::uuid IS NULL OR a.paciente_id=$3) AND ($4::text IS NULL OR p.expediente=$4)
        AND ($5::text[] IS NULL OR a.accion LIKE ANY($5)) AND ($6::timestamptz IS NULL OR a.registrado_en>=$6) AND ($7::timestamptz IS NULL OR a.registrado_en<$7)
        AND ($8::text IS NULL OR $8=ANY(string_to_array(a.actor_rol,','))) AND ($9::text IS NULL OR a.entidad=$9) AND ($10::text[] IS NULL OR a.resultado=ANY($10))
        AND ($13::uuid IS NULL OR a.accion<>'auditoria.consultar' OR a.actor_id IS DISTINCT FROM $13)
      ORDER BY ${order} ${dir} NULLS LAST,a.seq DESC LIMIT $11 OFFSET $12`, params)).rows as Row[];
    return { rows, total: rows.length ? Number(rows[0].total) : 0 };
  }

  private record(c: PoolClient, actor: Actor, q: AuditQueryDto, rows: number) {
    const filters = Object.fromEntries(Object.entries({ consultasAuditoria: q.incluirConsultasAuditoria === 'true', persona: !!q.persona?.trim(), paciente: !!q.paciente?.trim(), accion: q.accion ?? null, rol: q.rol ?? null, entidad: q.entidad ?? null, resultado: q.resultado ?? null, desde: q.desde ?? null, hasta: q.hasta ?? null }).filter(([, v]) => v));
    return this.commands.audit(c, actor, { action: q.exportar === 'true' ? 'auditoria.exportar' : 'auditoria.consultar', entity: 'auditoria', permission: 'auditoria.ver', detail: { filtros: filters, filas: rows } });
  }

  /** FR-110-07: walks the SHA-256 chain and points at the first row that does not match. */
  /** MA-SEG-05: personal data leaves the system in exported files, so every export is audited like a read. */
  async recordExport(actor: Actor, dto: ExportAuditDto) {
    await this.db.transaction(c => this.commands.audit(c, actor, { action: 'datos.exportar', entity: dto.resource, permission: 'sesion.perfil', detail: { filas: dto.rows, formato: dto.format } }));
    return { registradoEn: this.clock.now().toISOString() };
  }

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
        motivo: r.motivo === EXCEPTIONAL_REASON ? 'acceso excepcional' : r.motivo === URGENT_RECEPTION_REASON ? URGENT_RECEPTION_REASON : 'atención',
        urgente: r.motivo === URGENT_RECEPTION_REASON,
      }));
    });
  }
}
