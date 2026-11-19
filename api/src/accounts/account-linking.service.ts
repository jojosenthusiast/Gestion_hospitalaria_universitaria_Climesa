import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { LinkRejectDto } from './account-linking.dto';

type Row = Record<string, any>;

/**
 * Spec 101 account linking, replaced by the automatic link by verified email (owner observations 2026-11-18, batch 2;
 * `platform/patient-account-link.ts`). What remains here: the app's link state, 410 for the retired request and approval,
 * an empty W27 tray for released clients, and `reject` to close requests left pending before the change.
 */
@Injectable()
export class AccountLinkingService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}

  /**
   * The account's link state for the app (owner observations 2026-11-18, batch 2): linking is automatic by verified email,
   * so the app shows either the linked record or the email Recepción must write on the record. `request` stays null for
   * released apps that still read it.
   */
  async mine(actor: Actor) {
    const account = (await this.db.query('SELECT paciente_id,correo,correo_verificado FROM acceso.usuario WHERE id=$1', [actor.id]))[0];
    return { linked: !!account?.paciente_id, email: account?.correo_verificado || account?.correo || actor.email || null, emailVerified: !!account?.correo_verificado, request: null };
  }

  private view(row: Row) {
    return { id: row.id, state: row.estado, createdAt: row.creado_en, resolvedAt: row.resuelto_en ?? null, rejectionReason: row.motivo_rechazo ?? null, version: row.version };
  }

  private async resolvedChannels(c: PoolClient, owner: string) {
    return channelsFor(c, ['cuentas.verificar'], { users: [owner] });
  }

  /** The DUI and birth-date request is gone: released apps that still send it get 410 with what to do instead. */
  request(): never {
    throw new ProblemException('vinculacion_automatica', 410, 'La vinculación ahora es automática: pide en Recepción que anoten tu correo en tu expediente.');
  }

  /**
   * W27 is retired: no request waits for Recepción any more. Released clients that still read the tray get an empty list;
   * old rows stay in `acceso.vinculacion_paciente` as history.
   */
  async pending(): Promise<unknown[]> {
    return [];
  }

  private async locked(c: PoolClient, actor: Actor, id: string, version: number) {
    const row = (await c.query('SELECT * FROM acceso.vinculacion_paciente WHERE id=$1 FOR UPDATE', [id])).rows[0] as Row | undefined;
    if (!row) throw new NotFoundException('No se encontró la solicitud de vinculación.');
    if (row.usuario_id === actor.id) throw new ForbiddenException('No puedes verificar tu propia vinculación.');
    if (row.estado !== 'pendiente') throw new ProblemException('vinculacion_resuelta', 409, 'Esta solicitud ya fue resuelta.', undefined, { versionActual: row.version });
    if (row.version !== version) throw new VersionConflictException(row.version);
    return row;
  }

  /**
   * Approving a DUI and birth-date request would link without a verified email, which the owner ruled out (2026-11-18,
   * batch 2). Old pending rows can still be closed with `reject`; the link happens on its own once Recepción writes the
   * account's email on the record.
   */
  approve(): never {
    throw new ProblemException('vinculacion_automatica', 410, 'La vinculación ahora es automática: anota en el expediente el correo de la cuenta del paciente y se unirá sola.');
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
