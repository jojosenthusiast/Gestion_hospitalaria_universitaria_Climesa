import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { SupabaseService } from '../supabase/supabase.service';
import { VersionConflictException } from '../platform/problem';
import { Actor } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { InvitePatientDto, UserRolesDto, UserStateDto } from './invitation.dto';
export type InvitationResult={userId:string;email:string;roles:string[];role:string;status:'sent'};
@Injectable()
export class InvitationsService {
  constructor(private readonly supabase:SupabaseService,private readonly config:ConfigService,private readonly db:DatabaseService,private readonly commands:CommandService) {}
  async list(){return this.db.query(`SELECT u.id,u.correo AS email,u.nombre_mostrar AS name,u.estado AS state,u.version,u.persona_personal_id AS "staffId",coalesce(array_agg(a.rol_codigo ORDER BY a.rol_codigo) FILTER(WHERE a.rol_codigo IS NOT NULL),'{}') AS roles FROM acceso.usuario u LEFT JOIN acceso.asignacion_rol a ON a.usuario_id=u.id GROUP BY u.id ORDER BY u.nombre_mostrar,u.correo`);}
  private async validateRoles(c:PoolClient,roles:string[],staffId?:string|null){
    if((await c.query('SELECT codigo FROM acceso.rol WHERE codigo=ANY($1::text[])',[roles])).rowCount!==roles.length)throw new BadRequestException('Selecciona roles válidos y sin duplicados.');
    if(roles.some(r=>['REC','AST','ENF','MED','LAB','PAR'].includes(r))&&!staffId)throw new BadRequestException('Vincula la cuenta a una persona del directorio para asignar un rol de trabajo.');
    if(staffId&&!(await c.query('SELECT id FROM personal.persona WHERE id=$1 AND activo',[staffId])).rowCount)throw new BadRequestException('La persona vinculada debe estar activa.');
  }
  /** Jerarquía administrativa: solo el administrador principal puede crear otros ADM. Si aún no hay principal, el único ADM activo lo es. */
  private async assertAdminAuthority(c:PoolClient,actor:Actor,roles:string[]){
    if(!roles.includes('ADM'))return;
    let principal=(await c.query('SELECT usuario_id FROM acceso.administrador_principal WHERE id')).rows[0]?.usuario_id as string|undefined;
    if(!principal){
      const admins=(await c.query("SELECT a.usuario_id FROM acceso.asignacion_rol a JOIN acceso.usuario u ON u.id=a.usuario_id AND u.estado='activo' WHERE a.rol_codigo='ADM' ORDER BY a.asignado_en LIMIT 2")).rows;
      if(admins.length===1&&admins[0].usuario_id===actor.id){await c.query('INSERT INTO acceso.administrador_principal(usuario_id) VALUES($1) ON CONFLICT DO NOTHING',[actor.id]);principal=actor.id;}
    }
    if(principal!==actor.id)throw new ForbiddenException('Solo el administrador principal puede asignar el rol de administrador.');
  }
  async invitePatient(dto:InvitePatientDto,actor:Actor,key?:string):Promise<InvitationResult>{
    const email=dto.email.trim().toLowerCase(),roles=dto.roles??['PAC'];
    if(email===actor.email.toLowerCase())throw new ForbiddenException('No puedes invitarte ni cambiar tus roles con una invitación.');
    return this.commands.run(actor,'usuarios.invitar',key,dto,async c=>{
      await this.validateRoles(c,roles,dto.staffId);
      await this.assertAdminAuthority(c,actor,roles);
      if((await c.query('SELECT id FROM acceso.usuario WHERE lower(correo)=$1',[email])).rowCount)throw new ConflictException('Esa cuenta ya existe. Utiliza la gestión de usuarios.');
      if(dto.staffId&&(await c.query('SELECT id FROM acceso.usuario WHERE persona_personal_id=$1',[dto.staffId])).rowCount)throw new ConflictException('Esa persona ya tiene una cuenta vinculada.');
      const url=this.config.get<string>('WEB_APP_URL','http://localhost:5173').replace(/\/$/,'');
      const {data,error}=await this.supabase.admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${url}/aceptar-invitacion`,data:{nombre:dto.displayName.trim()}});
      if(error||!data.user)throw error?.status===422?new ConflictException('Ese correo ya tiene cuenta o invitación.'):new BadGatewayException('No se pudo enviar la invitación. Revisa la configuración de correo.');
      const id=data.user.id;
      await c.query('INSERT INTO acceso.usuario(id,correo,nombre_mostrar,persona_personal_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET nombre_mostrar=excluded.nombre_mostrar,persona_personal_id=excluded.persona_personal_id',[id,email,dto.displayName.trim(),dto.staffId??null]);
      await c.query('DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND NOT(rol_codigo=ANY($2::text[]))',[id,roles]);
      for(const role of roles)await c.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo,asignado_por) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,role,actor.id]);
      for(const role of roles)await c.query("INSERT INTO acceso.invitacion(usuario_id,correo,nombre_mostrar,rol_codigo,invitado_por) VALUES($1,$2,$3,$4,$5)",[id,email,dto.displayName.trim(),role,actor.id]);
      await this.commands.audit(c,actor,{action:'usuarios.invitar',entity:'usuario',entityId:id,permission:'usuarios.invitar',detail:{roles}});
      await this.commands.event(c,'usuario.actualizado','usuario',id,1,['rol:ADM',`usuario:${id}`]);
      return {userId:id,email,roles,role:roles[0],status:'sent'};
    });
  }
  async changeRoles(actor:Actor,id:string,dto:UserRolesDto,key?:string){
    if(id===actor.id){await this.commands.denied(actor,'usuarios.asignar_roles','PATCH',`usuarios/${id}/roles`);throw new ForbiddenException('No puedes asignarte o quitarte roles a ti mismo.');}
    return this.commands.run(actor,`usuarios.asignar_roles:${id}`,key,dto,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(671001)');
      const old=(await c.query('SELECT version,persona_personal_id FROM acceso.usuario WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!old)throw new NotFoundException('No se encontró la cuenta.');
      if(old.version!==dto.version)throw new VersionConflictException(old.version,'La cuenta cambió; vuelve a abrirla.');
      const staffId=dto.staffId??old.persona_personal_id;
      await this.validateRoles(c,dto.roles,staffId);
      if(!(await c.query("SELECT 1 FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='ADM'",[id])).rowCount)await this.assertAdminAuthority(c,actor,dto.roles);
      await c.query('DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND NOT(rol_codigo=ANY($2::text[]))',[id,dto.roles]);
      for(const role of dto.roles)await c.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo,asignado_por) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,role,actor.id]);
      await c.query('UPDATE acceso.usuario SET persona_personal_id=$2,version=version+1 WHERE id=$1',[id,staffId]);
      await this.commands.audit(c,actor,{action:'usuarios.roles',entity:'usuario',entityId:id,permission:'usuarios.asignar_roles',reason:dto.reason,detail:{roles:dto.roles}});
      await this.commands.event(c,'usuario.actualizado','usuario',id,old.version+1,['rol:ADM',`usuario:${id}`]);
      return {id,version:old.version+1};
    });
  }
  async changeState(actor:Actor,id:string,dto:UserStateDto,key?:string){
    return this.commands.run(actor,`usuarios.desactivar:${id}`,key,dto,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(671001)');
      const old=(await c.query('SELECT version FROM acceso.usuario WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!old)throw new NotFoundException('No se encontró la cuenta.');
      if(old.version!==dto.version)throw new VersionConflictException(old.version,'La cuenta cambió; vuelve a abrirla.');
      await c.query('UPDATE acceso.usuario SET estado=$2,version=version+1 WHERE id=$1',[id,dto.state]);
      await this.commands.audit(c,actor,{action:'usuarios.estado',entity:'usuario',entityId:id,permission:'usuarios.desactivar',reason:dto.reason});
      await this.commands.event(c,'usuario.actualizado','usuario',id,old.version+1,['rol:ADM',`usuario:${id}`]);
      return {id,version:old.version+1,state:dto.state};
    });
  }
}
