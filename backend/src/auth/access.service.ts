import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../platform/database.service';
import { Actor } from '../platform/actor';

@Injectable()
export class AccessService {
  constructor(private readonly db: DatabaseService) {}
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
