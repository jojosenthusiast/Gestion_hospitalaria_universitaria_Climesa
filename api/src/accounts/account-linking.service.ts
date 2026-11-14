import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { validDui } from '../platform/identity.rules';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { LinkApproveDto, LinkRejectDto, LinkRequestDto } from './account-linking.dto';

type Row = Record<string, any>;
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null;

/**
 * Spec 101 (FR-101-08 a FR-101-11, RN-39, D-032). The patient asks to link the account with DUI and date of birth;
 * the role with `cuentas.verificar` approves or rejects. The record is matched only by both declared values, so the patient
 * never learns whether a DUI exists, and approval re-checks them against the record (verification compares, RN-39).
 */
@Injectable()
export class AccountLinkingService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  /** Active records whose DUI and exact date of birth match the declared values. */
  private async matches(c: PoolClient, dui: string, birth: string) {
    return (await c.query(`SELECT p.id FROM pacientes.identificador i JOIN pacientes.paciente p ON p.id=i.paciente_id
      WHERE i.tipo='dui' AND i.valor_normalizado=$1 AND i.estado IN ('sin_verificar','verificado') AND p.nacimiento=$2::date AND p.estado<>'inactivo'`, [dui, birth])).rows.map(r => r.id as string);
  }

  private view(row: Row) {
    return { id: row.id, state: row.estado, createdAt: row.creado_en, resolvedAt: row.resuelto_en ?? null, rejectionReason: row.motivo_rechazo ?? null, version: row.version };
  }

  private async resolvedChannels(c: PoolClient, owner: string) {
    return channelsFor(c, ['cuentas.verificar'], { users: [owner] });
  }

  async request(actor: Actor, dto: LinkRequestDto, key?: string) {
    const dui = dto.dui.replace(/-/g, '');
    if (!validDui(dui)) throw new BadRequestException('El DUI no tiene un dígito verificador válido.');
    if (dto.birth > this.clock.today()) throw new BadRequestException('La fecha de nacimiento no puede ser futura.');
    return this.commands.run(actor, 'cuenta.vincular', key, dto, async c => {
      const account = (await c.query('SELECT paciente_id FROM acceso.usuario WHERE id=$1 FOR UPDATE', [actor.id])).rows[0];
      if (account?.paciente_id) throw new ProblemException('cuenta_ya_vinculada', 409, 'Tu cuenta ya está vinculada a tu expediente.');
      if ((await c.query("SELECT 1 FROM acceso.vinculacion_paciente WHERE usuario_id=$1 AND estado='pendiente'", [actor.id])).rowCount)
        throw new ProblemException('vinculacion_pendiente', 409, 'Ya tienes una solicitud en verificación. Recepción la revisará pronto.');
      const found = await this.matches(c, dui, dto.birth);
      const row = (await c.query(`INSERT INTO acceso.vinculacion_paciente(usuario_id,dui_declarado,nacimiento_declarado,paciente_candidato_id,creado_en)
        VALUES($1,$2,$3,$4,$5) RETURNING *`, [actor.id, dui, dto.birth, found.length === 1 ? found[0] : null, this.clock.now()])).rows[0];
      // The declared DUI is personal data: the audit keeps only whether a single candidate was found.
      await this.commands.audit(c, actor, { action: 'cuenta.vincular', entity: 'vinculacion_paciente', entityId: row.id, permission: 'cuenta.vincular', detail: { candidates: found.length } });
      await this.commands.event(c, 'vinculacion.solicitada', 'vinculacion_paciente', row.id, row.version, await this.resolvedChannels(c, actor.id));
      return this.view(row);
    });
  }

  /** W27: pending requests with what the account declared and the matching record, oldest first. */
  async pending(actor: Actor) {
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT v.id,v.creado_en,v.version,v.dui_declarado,v.nacimiento_declarado::text AS nacimiento,v.paciente_candidato_id,u.correo,u.nombre_mostrar
        FROM acceso.vinculacion_paciente v JOIN acceso.usuario u ON u.id=v.usuario_id WHERE v.estado='pendiente' ORDER BY v.creado_en,v.id LIMIT 200`)).rows;
      const result = [];
      for (const row of rows) {
        const dui = String(row.dui_declarado);
        const found = await this.matches(c, dui, row.nacimiento);
        const candidateId = found.length === 1 ? found[0] : null;
        let candidate = null;
        if (candidateId) {
          const p = (await c.query(`SELECT id,expediente,nacimiento::text AS nacimiento,coalesce(nullif(concat_ws(' ',nombres,primer_apellido,segundo_apellido),''),alias_provisional) AS nombre FROM pacientes.paciente WHERE id=$1`, [candidateId])).rows[0];
          candidate = { id: p.id, record: p.expediente, fullName: p.nombre, birth: dateText(p.nacimiento) };
          await this.commands.audit(c, actor, { action: 'vinculacion.leer', entity: 'vinculacion_paciente', entityId: row.id, patientId: candidateId, permission: 'cuentas.verificar' });
        }
        result.push({
          id: row.id, createdAt: row.creado_en, version: row.version,
          account: { email: row.correo, name: row.nombre_mostrar },
          declared: { dui: `${dui.slice(0, 8)}-${dui.slice(8)}`, birth: dateText(row.nacimiento) },
          candidate, candidates: found.length,
        });
      }
      return result;
    });
  }

  private async locked(c: PoolClient, actor: Actor, id: string, version: number) {
    const row = (await c.query('SELECT * FROM acceso.vinculacion_paciente WHERE id=$1 FOR UPDATE', [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la solicitud de vinculación.');
    if (row.usuario_id === actor.id) throw new ForbiddenException('No puedes verificar tu propia vinculación.');
    if (row.estado !== 'pendiente') throw new ProblemException('vinculacion_resuelta', 409, 'Esta solicitud ya fue resuelta.', undefined, { versionActual: row.version });
    if (row.version !== version) throw new VersionConflictException(row.version);
    return row;
  }

  async approve(actor: Actor, id: string, dto: LinkApproveDto, key?: string) {
    return this.commands.run(actor, `cuentas.verificar:aprobar:${id}`, key, dto, async c => {
      const row = await this.locked(c, actor, id, dto.version);
      // FR-101-11: with no record, reception creates it ("buscar antes de crear") and approves again.
      const found = await this.matches(c, String(row.dui_declarado), dateText(row.nacimiento_declarado)!);
      if (!found.length) throw new ProblemException('sin_expediente', 409, 'Ningún expediente activo tiene ese DUI y esa fecha de nacimiento. Búscalo o regístralo antes de aprobar.');
      if (found.length > 1) throw new ConflictException('Más de un expediente coincide; resuelve el posible duplicado antes de aprobar.');
      const patientId = found[0];
      const owner = (await c.query('SELECT id FROM acceso.usuario WHERE paciente_id=$1', [patientId])).rows[0];
      if (owner && owner.id !== row.usuario_id) throw new ProblemException('expediente_ya_vinculado', 409, 'Ese expediente ya está vinculado a otra cuenta.');
      const account = (await c.query('SELECT paciente_id FROM acceso.usuario WHERE id=$1 FOR UPDATE', [row.usuario_id])).rows[0];
      if (account?.paciente_id && account.paciente_id !== patientId) throw new ProblemException('cuenta_ya_vinculada', 409, 'La cuenta ya está vinculada a otro expediente.');
      const now = this.clock.now();
      const updated = (await c.query(`UPDATE acceso.vinculacion_paciente SET estado='aprobada',paciente_candidato_id=$2,verificado_por=$3,resuelto_en=$4,version=version+1
        WHERE id=$1 RETURNING *`, [id, patientId, actor.id, now])).rows[0];
      await c.query('UPDATE acceso.usuario SET paciente_id=$2,version=version+1 WHERE id=$1', [row.usuario_id, patientId]);
      await this.commands.audit(c, actor, { action: 'vinculacion.aprobar', entity: 'vinculacion_paciente', entityId: id, patientId, permission: 'cuentas.verificar', detail: { accountId: row.usuario_id } });
      await this.commands.event(c, 'vinculacion.resuelta', 'vinculacion_paciente', id, updated.version, await this.resolvedChannels(c, row.usuario_id));
      return this.view(updated);
    });
  }

  async reject(actor: Actor, id: string, dto: LinkRejectDto, key?: string) {
    const reason = dto.reason.trim();
    if (reason.length < 10) throw new BadRequestException('El motivo debe tener al menos 10 caracteres.');
    return this.commands.run(actor, `cuentas.verificar:rechazar:${id}`, key, dto, async c => {
      const row = await this.locked(c, actor, id, dto.version);
      const updated = (await c.query(`UPDATE acceso.vinculacion_paciente SET estado='rechazada',motivo_rechazo=$2,verificado_por=$3,resuelto_en=$4,version=version+1
        WHERE id=$1 RETURNING *`, [id, reason, actor.id, this.clock.now()])).rows[0];
      await this.commands.audit(c, actor, { action: 'vinculacion.rechazar', entity: 'vinculacion_paciente', entityId: id, permission: 'cuentas.verificar', reason, detail: { accountId: row.usuario_id } });
      await this.commands.event(c, 'vinculacion.resuelta', 'vinculacion_paciente', id, updated.version, await this.resolvedChannels(c, row.usuario_id));
      return this.view(updated);
    });
  }
}
