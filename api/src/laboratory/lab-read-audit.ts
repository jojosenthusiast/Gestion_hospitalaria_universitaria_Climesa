import { createHash, randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { canonical, fingerprint } from '../platform/command.service';

/**
 * MA-LAB-01: one `laboratorio.leer` audit row per order read, written as a single INSERT instead of one per order.
 * The rows are the ones CommandService.audit would write called once per order, in order: same advisory lock, same
 * signed event and same hash chain (each hash covers the previous one). All the rows go in one jsonb parameter, kept in
 * order by WITH ORDINALITY.
 */
export async function auditLabReads(client: PoolClient, actor: Pick<Actor, 'id' | 'roles'>, at: Date, orders: Array<{ id: string; patientId: string }>) {
  if (!orders.length) return;
  await client.query('SELECT pg_advisory_xact_lock(671003)');
  // Buffer.from: some drivers (PGlite) return bytea as a plain Uint8Array, whose toString is not hex.
  let previous = Buffer.from((await client.query('SELECT hash FROM plataforma.auditoria ORDER BY seq DESC LIMIT 1')).rows[0]?.hash ?? Buffer.alloc(32));
  const when = at.toISOString(), role = actor.roles.join(','), detailHash = fingerprint({});
  const rows = orders.map(order => {
    const event = { id: randomUUID(), at: when, actorId: actor.id, actorRole: role, action: 'laboratorio.leer', entity: 'orden_laboratorio',
      entityId: order.id, patientId: order.patientId, permission: 'resultados.ver', result: 'exito', detailHash };
    const digest = createHash('sha256').update(previous).update(canonical(event)).digest();
    const row = { e: event.id, ei: order.id, pa: order.patientId, de: { canonicalEvent: canonical(event) }, hp: previous.toString('hex'), h: digest.toString('hex') };
    previous = digest;
    return row;
  });
  await client.query(`INSERT INTO plataforma.auditoria(evento_id,registrado_en,actor_id,actor_rol,permiso,accion,entidad,entidad_id,paciente_id,motivo,resultado,detalle,hash_previo,hash)
    SELECT (x->>'e')::uuid,$2::timestamptz,$3::uuid,$4,'resultados.ver','laboratorio.leer','orden_laboratorio',x->>'ei',(x->>'pa')::uuid,NULL,'exito',x->'de',decode(x->>'hp','hex'),decode(x->>'h','hex')
    FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS t(x,n) ORDER BY n`, [JSON.stringify(rows), when, actor.id, role]);
}
