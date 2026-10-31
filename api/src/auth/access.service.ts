import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../platform/database.service';
import { Actor, hasPermission } from '../platform/actor';
import { ACTIVE_AUTHORITY_HOLDERS_SQL, ADMIN_AUTHORITY_PERMISSION } from '../platform/admin-hierarchy';

@Injectable()
export class AccessService {
  constructor(private readonly db: DatabaseService) {}
  /** Solo el administrador principal (o la única cuenta administradora activa, antes de fijarlo) puede crear otros administradores. */
  async canInviteAdmin(actor: Actor): Promise<boolean> {
    if (!hasPermission(actor, ADMIN_AUTHORITY_PERMISSION)) return false;
    const principal = await this.db.query('SELECT usuario_id FROM acceso.administrador_principal WHERE id');
    if (principal.length) return principal[0].usuario_id === actor.id;
    const admins = await this.db.query(ACTIVE_AUTHORITY_HOLDERS_SQL, [ADMIN_AUTHORITY_PERMISSION]);
    return admins.length === 1 && admins[0].usuario_id === actor.id;
  }
  async actor(id: string, email = ''): Promise<Actor> {
    const users = await this.db.query('SELECT id,correo,nombre_mostrar,persona_personal_id,paciente_id,estado FROM acceso.usuario WHERE id=$1', [id]);
    const user = users[0];
    if (!user || user.estado !== 'activo') throw new UnauthorizedException('Esta cuenta no está activa en CLIMESA.');
    const roles = await this.db.query('SELECT r.codigo,r.plataformas FROM acceso.asignacion_rol a JOIN acceso.rol r ON r.codigo=a.rol_codigo WHERE a.usuario_id=$1 ORDER BY r.codigo', [id]);
    if (!roles.length) throw new UnauthorizedException('La cuenta todavía no tiene un rol asignado.');
    const permissions = await this.db.query('SELECT DISTINCT permiso_codigo AS code,contexto AS context FROM acceso.v_permisos_usuario WHERE usuario_id=$1 ORDER BY permiso_codigo,contexto', [id]);
    const channels = await this.db.query('SELECT acceso.canales_de($1) AS channels', [id]);
    return { id, email: user.correo || email, name: user.nombre_mostrar, roles: roles.map(r => r.codigo), platforms: [...new Set(roles.flatMap(r => (r.plataformas as string[]).map(p => p.toLowerCase())))], permissions: permissions as Actor['permissions'], channels: channels[0]?.channels ?? [], patientId: user.paciente_id, staffId: user.persona_personal_id };
  }
}
