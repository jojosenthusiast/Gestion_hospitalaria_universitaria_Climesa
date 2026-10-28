import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from './database.service';
import { Actor } from './actor';
import { Clock } from './clock';
import { ProblemException } from './problem';

export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && !(value instanceof Date)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
};
export const fingerprint = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
export type AuditInput = { action: string; entity: string; entityId?: string; patientId?: string; permission?: string; reason?: string; result?: 'exito' | 'denegado' | 'fallido'; detail?: Record<string, unknown> };

@Injectable()
export class CommandService {
  constructor(private readonly db: DatabaseService, private readonly clock: Clock) {}
  async audit(client: PoolClient, actor: Pick<Actor, 'id' | 'roles'>, input: AuditInput) {
    // A single lock establishes a reproducible, append-only order for the audit chain.
    await client.query('SELECT pg_advisory_xact_lock(671003)');
    const previous = (await client.query('SELECT hash FROM plataforma.auditoria ORDER BY seq DESC LIMIT 1')).rows[0]?.hash ?? Buffer.alloc(32);
    const event = { id: randomUUID(), at: this.clock.now().toISOString(), actorId: actor.id, actorRole: actor.roles.join(','), ...input, result: input.result ?? 'exito' };
    const digest = createHash('sha256').update(previous).update(canonical(event)).digest();
    await client.query(`INSERT INTO plataforma.auditoria(evento_id,registrado_en,actor_id,actor_rol,permiso,accion,entidad,entidad_id,paciente_id,motivo,resultado,detalle,hash_previo,hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [event.id,event.at,actor.id,event.actorRole,input.permission ?? null,input.action,input.entity,input.entityId ?? null,input.patientId ?? null,input.reason ?? null,event.result,{ ...input.detail, canonicalEvent: canonical(event) },previous,digest]);
  }
  async denied(actor: Actor, permission: string, method: string, path: string) {
    await this.db.transaction(c => this.audit(c, actor, { action: 'acceso.denegado', entity: 'endpoint', permission, result: 'denegado', detail: { method, path: path.split('?')[0] } }));
  }
  async run<T>(actor: Actor, scope: string, key: string | undefined, body: unknown, work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!key || !/^[a-zA-Z0-9_-]{8,128}$/.test(key)) throw new ProblemException('idempotency_key_invalida', 400, 'Envía una clave Idempotency-Key de 8 a 128 caracteres.', 'Idempotency-Key');
    try {
      return await this.db.transaction(async c => {
      const current=(await c.query('SELECT estado FROM acceso.usuario WHERE id=$1',[actor.id])).rows[0];
      if(current?.estado!=='activo')throw new UnauthorizedException('La cuenta ya no está activa.');
      const permission=scope.split(':')[0];
      if(!(await c.query('SELECT 1 FROM acceso.v_permisos_usuario WHERE usuario_id=$1 AND permiso_codigo=$2 LIMIT 1',[actor.id,permission])).rowCount)throw new ForbiddenException('Tu permiso cambió. Actualiza la sesión.');
      const namespace = `${actor.id}:${scope}`;
      const hash = fingerprint(body);
      await c.query('INSERT INTO plataforma.idempotencia(alcance,clave,huella,estado) VALUES($1,$2,$3,\'en_proceso\') ON CONFLICT DO NOTHING', [namespace,key,hash]);
      const row = (await c.query('SELECT huella,estado,respuesta FROM plataforma.idempotencia WHERE alcance=$1 AND clave=$2 FOR UPDATE', [namespace,key])).rows[0];
      if (row.huella !== hash) throw new ProblemException('idempotencia_conflicto', 409, 'La clave de esta operación ya se usó con otros datos.');
      if (row.estado === 'completada') return row.respuesta as T;
      const response = await work(c);
      await c.query("UPDATE plataforma.idempotencia SET estado='completada',respuesta=$3 WHERE alcance=$1 AND clave=$2", [namespace,key,response]);
      return response;
    });
    } catch (error) {
      // FR-100-06: la transacción ya se revirtió; el conflicto se audita aparte, igual que `denied`, y sin el cuerpo.
      if (error instanceof ProblemException && error.codigo === 'idempotencia_conflicto') {
        await this.db.transaction(c => this.audit(c, actor, { action: 'idempotencia.conflicto', entity: 'idempotencia', permission: scope.split(':')[0], result: 'fallido', detail: { scope, key } })).catch(() => undefined);
      }
      throw error;
    }
  }
  async event(c: PoolClient, type: string, entity: string, id: string, version: number, channels: string[]) {
    await c.query('INSERT INTO plataforma.outbox(tipo,entidad,entidad_id,version,canales) VALUES($1,$2,$3,$4,$5)', [type,entity,id,version,channels]);
  }
}
