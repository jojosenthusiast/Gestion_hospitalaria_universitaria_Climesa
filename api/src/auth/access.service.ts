import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { Clock } from '../platform/clock';
import { Actor, hasPermission } from '../platform/actor';
import { ACTIVE_AUTHORITY_HOLDERS_SQL, ADMIN_AUTHORITY_PERMISSION } from '../platform/admin-hierarchy';
import { emailKey, linkOnSession } from '../platform/patient-account-link';

@Injectable()
export class AccessService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}
  /** MA-CTA-01: the first profile request of an invited account (after it set its password) marks the invitation accepted. */
  async markInvitationAccepted(actor: Actor): Promise<void> {
    await this.db.transaction(async c => {
      const accepted = (await c.query("UPDATE acceso.invitacion SET estado='aceptada',aceptada_en=$2,actualizado_en=$2 WHERE usuario_id=$1 AND estado='enviada' RETURNING id", [actor.id, this.clock.now()])).rows;
      if (!accepted.length) return;
      await this.commands.audit(c, actor, { action: 'usuarios.invitacion.aceptar', entity: 'usuario', entityId: actor.id, permission: 'sesion.perfil' });
      await this.commands.event(c, 'usuario.actualizado', 'usuario', actor.id, 1, ['rol:ADM', `usuario:${actor.id}`]);
    });
  }
  /**
   * Audit D129: the identity a patient account must show is its linked record, never the account's display name (which
   * can differ). Mixed staff accounts keep their staff name in `name`; `patientName` always carries the record.
   * The holder reads their own name and record number, as the patient app already does with `GET /me/paciente`.
   */
  async patientIdentity(actor: Actor): Promise<{ name: string | null; patientName: string | null; patientRecord: string | null }> {
    if (!actor.patientId) return { name: actor.name ?? null, patientName: null, patientRecord: null };
    const row = (await this.db.query(`SELECT expediente AS record,coalesce(nullif(concat_ws(' ',nombres,primer_apellido,segundo_apellido),''),alias_provisional) AS name
      FROM pacientes.paciente WHERE id=$1`, [actor.patientId]))[0] as { record: string; name: string | null } | undefined;
    const patientName = row?.name ?? null;
    return { name: !actor.staffId && patientName ? patientName : actor.name ?? null, patientName, patientRecord: row?.record ?? null };
  }
  /** Solo el administrador principal (o la única cuenta administradora activa, antes de fijarlo) puede crear otros administradores. */
  async canInviteAdmin(actor: Actor): Promise<boolean> {
    if (!hasPermission(actor, ADMIN_AUTHORITY_PERMISSION)) return false;
    const principal = await this.db.query('SELECT usuario_id FROM acceso.administrador_principal WHERE id');
    if (principal.length) return principal[0].usuario_id === actor.id;
    const admins = await this.db.query(ACTIVE_AUTHORITY_HOLDERS_SQL, [ADMIN_AUTHORITY_PERMISSION]);
    return admins.length === 1 && admins[0].usuario_id === actor.id;
  }
  /**
   * Owner observations 2026-11-18 (batch 2): on every session of a patient account, keep the email Supabase Auth verified
   * and, while the account has no record, link it to the one active record with that email. A link that cannot be made
   * leaves the session as it was: it never blocks the request.
   */
  async autoLink(actor: Actor, verifiedEmail: string | null): Promise<Actor> {
    if (!hasPermission(actor, 'cuenta.vincular')) return actor;
    const key = verifiedEmail ? emailKey(verifiedEmail) || null : null;
    if (actor.patientId) {
      // Already linked: only keep the verified email current, so Recepción's checks see the account's real email.
      await this.db.query('UPDATE acceso.usuario SET correo_verificado=$2 WHERE id=$1 AND correo_verificado IS DISTINCT FROM $2', [actor.id, key]);
      return actor;
    }
    try {
      const patientId = await this.db.transaction(c => linkOnSession(c, this.commands, actor, key));
      return patientId ? { ...actor, patientId } : actor;
    } catch {
      return actor;
    }
  }
  async actor(id: string, email = ''): Promise<Actor> {
    const users = await this.db.query('SELECT id,correo,nombre_mostrar,persona_personal_id,paciente_id,estado FROM acceso.usuario WHERE id=$1', [id]);
    const user = users[0];
    if (!user || user.estado !== 'activo') throw new UnauthorizedException('Esta cuenta no está activa en CLIMESA.');
    const roles = await this.db.query('SELECT r.codigo,r.plataformas FROM acceso.asignacion_rol a JOIN acceso.rol r ON r.codigo=a.rol_codigo WHERE a.usuario_id=$1 ORDER BY r.codigo', [id]);
    if (!roles.length) throw new UnauthorizedException('La cuenta todavía no tiene un rol asignado.');
    const permissions = await this.db.query('SELECT DISTINCT permiso_codigo AS code,contexto AS context FROM acceso.v_permisos_usuario WHERE usuario_id=$1 ORDER BY permiso_codigo,contexto', [id]);
    const channels = await this.db.query('SELECT acceso.canales_de($1) AS channels', [id]);
    return { id, email: user.correo || email, name: user.nombre_mostrar, roles: roles.map(r => r.codigo), platforms: [...new Set(roles.flatMap(r => (r.plataformas as string[]).map(p => p.toLowerCase())))], rolePlatforms: roles.map(r => ({ role: r.codigo as string, platforms: (r.plataformas as string[]).map(p => p.toLowerCase()) })), permissions: permissions as Actor['permissions'], channels: channels[0]?.channels ?? [], patientId: user.paciente_id, staffId: user.persona_personal_id };
  }
}
