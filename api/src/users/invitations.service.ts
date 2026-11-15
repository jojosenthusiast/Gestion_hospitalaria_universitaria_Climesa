import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PoolClient } from 'pg';
import { SupabaseService } from '../supabase/supabase.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { Actor, hasPermission } from '../platform/actor';
import { ACTIVE_AUTHORITY_HOLDERS_SQL, ADMIN_AUTHORITY_PERMISSION, ROLES_GRANT_AUTHORITY_SQL, USER_HOLDS_AUTHORITY_SQL } from '../platform/admin-hierarchy';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { Clock } from '../platform/clock';
import { InvitationCancelDto, InvitePatientDto, UserRolesDto, UserStateDto } from './invitation.dto';
import { accountActions } from './users.rules';
export type InvitationResult={userId:string;email:string;roles:string[];role:string;status:'sent'};
/** Last invitation state of each account (null for accounts created by sign-up in the mobile apps). */
const LAST_INVITATION_SQL=`(SELECT i.estado FROM acceso.invitacion i WHERE i.usuario_id=u.id ORDER BY i.creado_en DESC,i.id DESC LIMIT 1)`;
@Injectable()
export class InvitationsService {
  constructor(private readonly supabase:SupabaseService,private readonly config:ConfigService,private readonly db:DatabaseService,private readonly commands:CommandService,private readonly clock:Clock) {}
  /** Accounts with their invitation state and the actions this actor may take on each (the UI never offers a rejected action). */
  async list(actor:Actor){
    return this.db.transaction(async c=>{
      const principal=await this.effectivePrincipal(c);
      const rows=(await c.query(`SELECT u.id,u.correo AS email,u.nombre_mostrar AS name,u.estado AS state,u.version,u.persona_personal_id AS "staffId",
        coalesce(array_agg(a.rol_codigo ORDER BY a.rol_codigo) FILTER(WHERE a.rol_codigo IS NOT NULL),'{}') AS roles,${LAST_INVITATION_SQL} AS "invitationState",
        EXISTS(SELECT 1 FROM acceso.asignacion_rol x JOIN acceso.rol_permiso rp ON rp.rol_codigo=x.rol_codigo WHERE x.usuario_id=u.id AND rp.permiso_codigo=$1) AS authority
        FROM acceso.usuario u LEFT JOIN acceso.asignacion_rol a ON a.usuario_id=u.id GROUP BY u.id ORDER BY u.nombre_mostrar,u.correo`,[ADMIN_AUTHORITY_PERMISSION])).rows;
      const can={roles:hasPermission(actor,'usuarios.asignar_roles'),state:hasPermission(actor,'usuarios.desactivar'),invite:hasPermission(actor,'usuarios.invitar')};
      return rows.map(({authority,...row})=>({...row,allowedActions:accountActions({self:row.id===actor.id,protectedTarget:!!authority&&principal!==actor.id,state:row.state,invitationState:row.invitationState,can})}));
    });
  }
  private async validateRoles(c:PoolClient,roles:string[],staffId?:string|null,invitation=false){
    const found=(await c.query('SELECT codigo,requiere_personal,invitable FROM acceso.rol WHERE codigo=ANY($1::text[])',[roles])).rows;
    if(found.length!==roles.length)throw new BadRequestException('Selecciona roles válidos y sin duplicados.');
    if(invitation&&found.some(r=>!r.invitable))throw new ProblemException('rol_no_invitable',400,'El paciente crea su cuenta en la app CLIMESA para Android o iOS. Invita solo roles de personal.','roles');
    if(found.some(r=>r.requiere_personal)&&!staffId)throw new BadRequestException('Vincula la cuenta a una persona del directorio para asignar un rol de trabajo.');
    if(staffId&&!(await c.query('SELECT id FROM personal.persona WHERE id=$1 AND activo',[staffId])).rowCount)throw new BadRequestException('La persona vinculada debe estar activa.');
  }
  /** The principal administrator; before one is fixed, the only active account with the authority acts as principal. */
  private async effectivePrincipal(c:PoolClient):Promise<string|undefined>{
    const principal=(await c.query('SELECT usuario_id FROM acceso.administrador_principal WHERE id')).rows[0]?.usuario_id as string|undefined;
    if(principal)return principal;
    const admins=(await c.query(ACTIVE_AUTHORITY_HOLDERS_SQL,[ADMIN_AUTHORITY_PERMISSION])).rows;
    return admins.length===1?admins[0].usuario_id:undefined;
  }
  /** Jerarquía administrativa: solo el administrador principal puede crear otras cuentas con autoridad de administrar roles. Si aún no hay principal, la única cuenta administradora activa lo es. */
  private async assertAdminAuthority(c:PoolClient,actor:Actor,roles:string[]){
    if(!(await c.query(ROLES_GRANT_AUTHORITY_SQL,[roles,ADMIN_AUTHORITY_PERMISSION])).rowCount)return;
    await this.assertPrincipal(c,actor,'Solo el administrador principal puede asignar el rol de administrador.');
  }
  private async assertPrincipal(c:PoolClient,actor:Actor,message:string){
    let principal=(await c.query('SELECT usuario_id FROM acceso.administrador_principal WHERE id')).rows[0]?.usuario_id as string|undefined;
    if(!principal&&(await this.effectivePrincipal(c))===actor.id){await c.query('INSERT INTO acceso.administrador_principal(usuario_id) VALUES($1) ON CONFLICT DO NOTHING',[actor.id]);principal=actor.id;}
    if(principal!==actor.id)throw new ProblemException('jerarquia_administrador',403,message);
  }
  /** MA-CTA-03: an account with administrative authority is managed only by the principal administrator. */
  private async assertCanManage(c:PoolClient,actor:Actor,id:string){
    if((await c.query(USER_HOLDS_AUTHORITY_SQL,[id,ADMIN_AUTHORITY_PERMISSION])).rowCount)await this.assertPrincipal(c,actor,'Solo el administrador principal puede cambiar los roles o el estado de otra cuenta administradora.');
  }
  /** MA-CTA-04: same rule as the staff directory; pending shifts, appointments to attend and active ambulance crews block the change. */
  private async assertNoOpenWork(c:PoolClient,staffId:string|null,action:string){
    if(!staffId)return;
    const work=(await c.query(`SELECT
      (SELECT count(*)::int FROM personal.turno WHERE persona_id=$1 AND estado<>'cancelado' AND upper(periodo)>$2) AS shifts,
      (SELECT count(*)::int FROM atencion.cita WHERE medico_id=$1 AND estado IN ('solicitada','confirmada') AND upper(horario)>$2) AS appointments,
      (SELECT count(*)::int FROM ambulancia.tripulacion t JOIN ambulancia.servicio s ON s.id=t.servicio_id WHERE t.persona_id=$1 AND s.finalizado_en IS NULL) AS crews`,[staffId,this.clock.now()])).rows[0];
    const plural=(n:number,one:string,many:string)=>n===1?one:many;
    const parts=[work.shifts&&`${work.shifts} ${plural(work.shifts,'turno pendiente','turnos pendientes')}`,work.appointments&&`${work.appointments} ${plural(work.appointments,'cita por atender','citas por atender')}`,work.crews&&'un servicio de ambulancia en curso'].filter(Boolean);
    if(parts.length)throw new ProblemException('trabajo_abierto',409,`Esta persona tiene ${parts.join(', ')}. Reasígnalos o cancélalos antes de ${action}.`,undefined,{turnos:work.shifts,citas:work.appointments,servicios:work.crews});
  }
  private webUrl(){return this.config.get<string>('WEB_APP_URL','http://localhost:5173').replace(/\/$/,'');}
  private async sendInvitation(email:string,name:string):Promise<string>{
    const {data,error}=await this.supabase.admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${this.webUrl()}/aceptar-invitacion`,data:{nombre:name}});
    if(error||!data.user)throw error?.status===422?new ConflictException('Ese correo ya tiene una cuenta activa. Usa Roles para cambiar su acceso.'):new BadGatewayException('No se pudo enviar la invitación. Revisa la configuración de correo.');
    return data.user.id;
  }
  async invitePatient(dto:InvitePatientDto,actor:Actor,key?:string):Promise<InvitationResult>{
    const email=dto.email.trim().toLowerCase(),roles=dto.roles;
    if(email===actor.email.toLowerCase())throw new ForbiddenException('No puedes invitarte ni cambiar tus roles con una invitación.');
    return this.commands.run(actor,'usuarios.invitar',key,dto,async c=>{
      await this.validateRoles(c,roles,dto.staffId,true);
      await this.assertAdminAuthority(c,actor,roles);
      const existing=(await c.query(`SELECT u.id,${LAST_INVITATION_SQL} AS invitation FROM acceso.usuario u WHERE lower(u.correo)=$1`,[email])).rows[0];
      // MA-CTA-01: an invitation that was never accepted (sent, cancelled or expired) can be issued again for the same e-mail.
      if(existing&&!['enviada','cancelada','expirada'].includes(existing.invitation))throw new ConflictException('Esa cuenta ya existe. Utiliza la gestión de usuarios.');
      if(dto.staffId&&(await c.query('SELECT id FROM acceso.usuario WHERE persona_personal_id=$1 AND id IS DISTINCT FROM $2',[dto.staffId,existing?.id??null])).rowCount)throw new ConflictException('Esa persona ya tiene una cuenta vinculada.');
      const id=await this.sendInvitation(email,dto.displayName.trim());
      if(existing&&existing.id!==id)throw new BadGatewayException('El servicio de correo devolvió otra cuenta para ese correo. Revisa la cuenta en Supabase.');
      await c.query(`INSERT INTO acceso.usuario(id,correo,nombre_mostrar,persona_personal_id) VALUES($1,$2,$3,$4)
        ON CONFLICT(id) DO UPDATE SET nombre_mostrar=excluded.nombre_mostrar,persona_personal_id=excluded.persona_personal_id,estado='activo',version=acceso.usuario.version+1`,[id,email,dto.displayName.trim(),dto.staffId??null]);
      await c.query("UPDATE acceso.invitacion SET estado='expirada',actualizado_en=now() WHERE usuario_id=$1 AND estado='enviada'",[id]);
      await c.query('DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND NOT(rol_codigo=ANY($2::text[]))',[id,roles]);
      for(const role of roles)await c.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo,asignado_por) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,role,actor.id]);
      for(const role of roles)await c.query("INSERT INTO acceso.invitacion(usuario_id,correo,nombre_mostrar,rol_codigo,invitado_por) VALUES($1,$2,$3,$4,$5)",[id,email,dto.displayName.trim(),role,actor.id]);
      await this.commands.audit(c,actor,{action:'usuarios.invitar',entity:'usuario',entityId:id,permission:'usuarios.invitar',detail:{roles,reinvitacion:!!existing}});
      await this.commands.event(c,'usuario.actualizado','usuario',id,1,['rol:ADM',`usuario:${id}`]);
      return {userId:id,email,roles,role:roles[0],status:'sent'};
    });
  }
  private async pendingInvitation(c:PoolClient,actor:Actor,id:string){
    const row=(await c.query(`SELECT u.id,u.correo,u.nombre_mostrar,u.version,${LAST_INVITATION_SQL} AS invitation FROM acceso.usuario u WHERE u.id=$1 FOR UPDATE`,[id])).rows[0];
    if(!row)throw new NotFoundException('No se encontró la cuenta.');
    if(row.invitation!=='enviada')throw new ProblemException('invitacion_no_pendiente',409,row.invitation==='aceptada'?'La persona ya aceptó la invitación y activó su cuenta.':'Esta cuenta no tiene una invitación pendiente.');
    await this.assertCanManage(c,actor,id);
    return row;
  }
  /** MA-CTA-01: sends the same invitation again (new link; the previous one stops working). */
  async resend(actor:Actor,id:string,key?:string){
    return this.commands.run(actor,`usuarios.invitar:${id}:reenvio`,key,{id},async c=>{
      const row=await this.pendingInvitation(c,actor,id);
      await this.sendInvitation(row.correo,row.nombre_mostrar);
      await c.query("UPDATE acceso.invitacion SET reenviada_en=now(),actualizado_en=now() WHERE usuario_id=$1 AND estado='enviada'",[id]);
      await this.commands.audit(c,actor,{action:'usuarios.invitacion.reenviar',entity:'usuario',entityId:id,permission:'usuarios.invitar'});
      await this.commands.event(c,'usuario.actualizado','usuario',id,row.version,['rol:ADM',`usuario:${id}`]);
      return {id,version:row.version};
    });
  }
  /** MA-CTA-01: cancels a pending invitation; the account is deactivated so the e-mailed link no longer grants access. */
  async cancel(actor:Actor,id:string,dto:InvitationCancelDto,key?:string){
    return this.commands.run(actor,`usuarios.invitar:${id}:cancelacion`,key,dto,async c=>{
      const row=await this.pendingInvitation(c,actor,id);
      await c.query("UPDATE acceso.invitacion SET estado='cancelada',actualizado_en=now() WHERE usuario_id=$1 AND estado='enviada'",[id]);
      await c.query("UPDATE acceso.usuario SET estado='desactivado',version=version+1 WHERE id=$1",[id]);
      await this.commands.audit(c,actor,{action:'usuarios.invitacion.cancelar',entity:'usuario',entityId:id,permission:'usuarios.invitar',reason:dto.reason});
      await this.commands.event(c,'usuario.actualizado','usuario',id,row.version+1,['rol:ADM',`usuario:${id}`]);
      return {id,version:row.version+1};
    });
  }
  async changeRoles(actor:Actor,id:string,dto:UserRolesDto,key?:string){
    if(id===actor.id){throw new ForbiddenException('No puedes asignarte o quitarte roles a ti mismo.');}
    return this.commands.run(actor,`usuarios.asignar_roles:${id}`,key,dto,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(671001)');
      const old=(await c.query('SELECT version,persona_personal_id FROM acceso.usuario WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!old)throw new NotFoundException('No se encontró la cuenta.');
      if(old.version!==dto.version)throw new VersionConflictException(old.version,'La cuenta cambió; vuelve a abrirla.');
      const staffId=dto.staffId??old.persona_personal_id;
      await this.validateRoles(c,dto.roles,staffId);
      await this.assertCanManage(c,actor,id);
      await this.assertAdminAuthority(c,actor,dto.roles);
      const removedWork=(await c.query('SELECT 1 FROM acceso.asignacion_rol a JOIN acceso.rol r ON r.codigo=a.rol_codigo WHERE a.usuario_id=$1 AND r.requiere_personal AND NOT(a.rol_codigo=ANY($2::text[])) LIMIT 1',[id,dto.roles])).rowCount;
      if(removedWork)await this.assertNoOpenWork(c,old.persona_personal_id,'quitarle el rol');
      await c.query('DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND NOT(rol_codigo=ANY($2::text[]))',[id,dto.roles]);
      for(const role of dto.roles)await c.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo,asignado_por) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,role,actor.id]);
      await c.query('UPDATE acceso.usuario SET persona_personal_id=$2,version=version+1 WHERE id=$1',[id,staffId]);
      await this.commands.audit(c,actor,{action:'usuarios.roles',entity:'usuario',entityId:id,permission:'usuarios.asignar_roles',reason:dto.reason,detail:{roles:dto.roles}});
      await this.commands.event(c,'usuario.actualizado','usuario',id,old.version+1,['rol:ADM',`usuario:${id}`]);
      return {id,version:old.version+1};
    });
  }
  async changeState(actor:Actor,id:string,dto:UserStateDto,key?:string){
    if(id===actor.id&&dto.state==='desactivado')throw new ForbiddenException('No puedes desactivar tu propia cuenta.');
    return this.commands.run(actor,`usuarios.desactivar:${id}`,key,dto,async c=>{
      await c.query('SELECT pg_advisory_xact_lock(671001)');
      const old=(await c.query(`SELECT u.version,u.persona_personal_id,${LAST_INVITATION_SQL} AS invitation FROM acceso.usuario u WHERE u.id=$1 FOR UPDATE`,[id])).rows[0];
      if(!old)throw new NotFoundException('No se encontró la cuenta.');
      if(old.version!==dto.version)throw new VersionConflictException(old.version,'La cuenta cambió; vuelve a abrirla.');
      await this.assertCanManage(c,actor,id);
      if(dto.state==='activo'&&old.invitation==='cancelada')throw new ProblemException('invitacion_no_pendiente',409,'La invitación de esta cuenta se canceló. Invítala de nuevo para que reciba un enlace nuevo.');
      if(dto.state==='desactivado')await this.assertNoOpenWork(c,old.persona_personal_id,'desactivar la cuenta');
      await c.query('UPDATE acceso.usuario SET estado=$2,version=version+1 WHERE id=$1',[id,dto.state]);
      await this.commands.audit(c,actor,{action:'usuarios.estado',entity:'usuario',entityId:id,permission:'usuarios.desactivar',reason:dto.reason});
      await this.commands.event(c,'usuario.actualizado','usuario',id,old.version+1,['rol:ADM',`usuario:${id}`]);
      return {id,version:old.version+1,state:dto.state};
    });
  }
}
