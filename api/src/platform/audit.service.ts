import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from './database.service';
import { canonical } from './command.service';

export type ChainVerification = { ok: true; checked: number } | { ok: false; checked: number; seq: number; reason: string };
type Row = { seq: string | number; evento_id: string; actor_id: string | null; permiso: string | null; accion: string; entidad: string; entidad_id: string | null; paciente_id: string | null; motivo: string | null; resultado: string; detalle: Record<string, unknown>; hash_previo: Uint8Array; hash: Uint8Array };

/** FR-100-07: recorre la cadena SHA-256 de `plataforma.auditoria` y señala la primera fila que no concuerda. */
@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}
  async verifyChain(): Promise<ChainVerification> {
    const rows = await this.db.query<Row>('SELECT seq,evento_id,actor_id,permiso,accion,entidad,entidad_id,paciente_id,motivo,resultado,detalle,hash_previo,hash FROM plataforma.auditoria ORDER BY seq');
    let previous = Buffer.alloc(32);
    let checked = 0;
    for (const row of rows) {
      const seq = Number(row.seq);
      const fail = (reason: string): ChainVerification => ({ ok: false, checked, seq, reason });
      const { canonicalEvent, ...detail } = row.detalle as { canonicalEvent?: string } & Record<string, unknown>;
      if (!Buffer.from(row.hash_previo).equals(previous)) return fail('hash_previo no coincide con la fila anterior');
      if (typeof canonicalEvent !== 'string') return fail('falta el evento canónico');
      if (!createHash('sha256').update(previous).update(canonicalEvent).digest().equals(Buffer.from(row.hash))) return fail('hash no coincide con el evento canónico');
      const event = JSON.parse(canonicalEvent) as Record<string, unknown>;
      const columns: Record<string, unknown> = { id: row.evento_id, actorId: row.actor_id, permission: row.permiso, action: row.accion, entity: row.entidad, entityId: row.entidad_id, patientId: row.paciente_id, reason: row.motivo, result: row.resultado };
      for (const [name, value] of Object.entries(columns)) if ((event[name] ?? null) !== (value ?? null)) return fail(`la columna ${name} difiere del evento firmado`);
      if (canonical(detail) !== canonical(event.detail ?? {})) return fail('el detalle difiere del evento firmado');
      previous = Buffer.from(row.hash);
      checked++;
    }
    return { ok: true, checked };
  }
}
