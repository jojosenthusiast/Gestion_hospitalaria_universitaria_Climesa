import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { VersionConflictException } from '../platform/problem';
import { Actor } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { Clock } from '../platform/clock';
import { StaffDto, ShiftDto } from './operations.dto';
import { PolicyRegistry } from '../platform/policy.registry';
import { validDui } from '../platform/identity.rules';
@Injectable()
export class PersonnelService {
  constructor(private readonly db:DatabaseService,private readonly commands:CommandService,private readonly clock:Clock,private readonly policies:PolicyRegistry) {}
  async list(actor:Actor) {
    const rows=await this.db.query(`SELECT p.id,p.nombres AS "givenNames",p.apellidos AS surnames,p.tipo AS type,p.especialidad AS specialty,p.area_id AS "areaId",e.nombre AS area,p.activo AS active,p.version,p.telefono AS phone,p.dui FROM personal.persona p LEFT JOIN infra.espacio e ON e.id=p.area_id ORDER BY p.activo DESC,p.apellidos,p.nombres`);
    return actor.roles.includes('ADM')?rows:rows.map(({dui,phone,...row})=>row);
  }
  private async area(c:PoolClient,id?:string){if(id&&!(await c.query("SELECT id FROM infra.espacio WHERE id=$1 AND activo AND tipo IN ('area','planta','consultorio','hospital')",[id])).rowCount)throw new BadRequestException('Selecciona un área activa.');}
  async save(actor:Actor,id:string|null,dto:StaffDto,key?:string) {
    if(!/^[\p{L}\p{M} .’'-]+$/u.test(dto.givenNames+dto.surnames))throw new BadRequestException('Los nombres y apellidos no pueden contener números.');
    if(dto.dui&&(!/^\d{8}-?\d$/.test(dto.dui)||!validDui(dto.dui)))throw new BadRequestException('Revisa el dígito verificador del DUI.');
    if(dto.phone&&!/^[267]\d{3}-?\d{4}$/.test(dto.phone))throw new BadRequestException('Revisa el teléfono de ocho dígitos.');
    return this.commands.run(actor,`personal.gestionar:${id??'nuevo'}`,key,dto,async c=>{
      await this.area(c,dto.areaId);
      let row;
      if(id){
        const old=(await c.query('SELECT * FROM personal.persona WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException('No se encontró la persona.');
        if(old.version!==dto.version)throw new VersionConflictException(old.version,'La ficha cambió; vuelve a abrirla.');
        if(!dto.reason||dto.reason.trim().length<10)throw new BadRequestException('Indica el motivo de la modificación.');
        if(dto.active===false&&(await c.query("SELECT id FROM personal.turno WHERE persona_id=$1 AND estado<>'cancelado' AND upper(periodo)>$2 LIMIT 1",[id,this.clock.now()])).rowCount)throw new ConflictException('Reasigna o cancela sus turnos pendientes antes de inactivar.');
        row=(await c.query('UPDATE personal.persona SET nombres=$2,apellidos=$3,tipo=$4,especialidad=$5,area_id=$6,telefono=$7,dui=$8,activo=$9,version=version+1 WHERE id=$1 RETURNING id,version',[id,dto.givenNames.trim(),dto.surnames.trim(),dto.type,dto.specialty||null,dto.areaId||null,dto.phone||null,dto.dui?.replace('-','')||null,dto.active??true])).rows[0];
      }else row=(await c.query('INSERT INTO personal.persona(nombres,apellidos,tipo,especialidad,area_id,telefono,dui) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,version',[dto.givenNames.trim(),dto.surnames.trim(),dto.type,dto.specialty||null,dto.areaId||null,dto.phone||null,dto.dui?.replace('-','')||null])).rows[0];
      await this.commands.audit(c,actor,{action:id?'personal.editar':'personal.crear',entity:'personal',entityId:row.id,permission:'personal.gestionar',reason:dto.reason});
      await this.commands.event(c,'personal.actualizado','personal',row.id,row.version,['rol:ADM','rol:JOP']);
      return row;
    });
  }
  async shifts(actor:Actor,mine=false) {
    if(mine&&!actor.staffId)return [];
    return this.db.query(`SELECT t.id,t.persona_id AS "staffId",p.nombres||' '||p.apellidos AS person,t.area_id AS "areaId",e.nombre AS area,lower(t.periodo) AS start,upper(t.periodo) AS "end",t.tipo AS type,t.estado AS state,t.justificacion AS justification,t.version
      FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id JOIN infra.espacio e ON e.id=t.area_id
      WHERE ($1::uuid IS NULL OR t.persona_id=$1) AND ((NOT $2 AND $3) OR t.estado IN ('publicado','en_curso','completado')) ORDER BY lower(t.periodo) DESC LIMIT 300`,[mine?actor.staffId:null,mine,actor.roles.some(r=>['ADM','JOP'].includes(r))]);
  }
  async saveShift(actor:Actor,id:string|null,dto:ShiftDto,key?:string) {
    const start=new Date(dto.start),end=new Date(dto.end);
    if(!/(Z|[+-]\d\d:\d\d)$/.test(dto.start)||!/(Z|[+-]\d\d:\d\d)$/.test(dto.end)||!Number.isFinite(start.valueOf())||end<=start)throw new BadRequestException('Indica inicio y fin con zona horaria.');
    return this.commands.run(actor,`turnos.planificar:${id??'nuevo'}`,key,dto,async c=>{
      const person=(await c.query('SELECT id,tipo,activo FROM personal.persona WHERE id=$1 FOR UPDATE',[dto.staffId])).rows[0];
      if(!person?.activo)throw new BadRequestException('Selecciona personal activo.');
      await this.area(c,dto.areaId);
      const duration=await this.policies.value<{min_horas:number;max_horas:number;max_guardia_medica:number}>(c,'turnos.duracion',start);
      const rest=await this.policies.value<{min_horas:number;tras_guardia_24h:number}>(c,'turnos.descanso',start);
      const hours=(end.valueOf()-start.valueOf())/3600000;
      const max=dto.type==='guardia'&&person.tipo==='medico'?duration.max_guardia_medica:duration.max_horas;
      if(hours<duration.min_horas||hours>max)throw new BadRequestException(`La duración permitida es de ${duration.min_horas} a ${max} horas.`);
      const nearby=(await c.query("SELECT id,lower(periodo) AS start,upper(periodo) AS \"end\",tipo FROM personal.turno WHERE persona_id=$1 AND estado<>'cancelado' AND ($2::uuid IS NULL OR id<>$2) AND periodo && tstzrange($3::timestamptz-interval '1 day',$4::timestamptz+interval '1 day')",[dto.staffId,id,start,end])).rows;
      if(dto.state!=='cancelado')for(const old of nearby){
        const a=new Date(old.start).valueOf(),b=new Date(old.end).valueOf();
        if(a<end.valueOf()&&b>start.valueOf())throw new ConflictException('Este horario se traslapa con otro turno de la misma persona.');
        const previousHours=(b-a)/3600000;
        const required=old.tipo==='guardia'&&previousHours>=24?rest.tras_guardia_24h:rest.min_horas;
        if(b<=start.valueOf()&&(start.valueOf()-b)/3600000<required)throw new ConflictException(`Necesita al menos ${required} horas de descanso después del turno anterior.`);
        const nextRest=dto.type==='guardia'&&hours>=24?rest.tras_guardia_24h:rest.min_horas;
        if(a>=end.valueOf()&&(a-end.valueOf())/3600000<nextRest)throw new ConflictException(`Necesita al menos ${nextRest} horas de descanso antes del siguiente turno.`);
      }
      let row;
      if(id){
        const old=(await c.query('SELECT version FROM personal.turno WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException('No se encontró el turno.');
        if(old.version!==dto.version)throw new VersionConflictException(old.version,'El turno cambió; actualiza la planificación.');
        if(!dto.reason||dto.reason.trim().length<10)throw new BadRequestException('Indica el motivo del cambio.');
        row=(await c.query("UPDATE personal.turno SET persona_id=$2,area_id=$3,periodo=tstzrange($4,$5,'[)'),tipo=$6,justificacion=$7,estado=coalesce($8,estado),version=version+1 WHERE id=$1 RETURNING id,version",[id,dto.staffId,dto.areaId,start,end,dto.type,dto.justification||null,dto.state||null])).rows[0];
      }else row=(await c.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,justificacion,creado_por) VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7) RETURNING id,version",[dto.staffId,dto.areaId,start,end,dto.type,dto.justification||null,actor.id])).rows[0];
      await this.commands.audit(c,actor,{action:id?'turnos.mover':'turnos.crear',entity:'turno',entityId:row.id,permission:'turnos.planificar',reason:dto.reason});
      const accounts=(await c.query('SELECT id FROM acceso.usuario WHERE persona_personal_id=$1',[dto.staffId])).rows;
      await this.commands.event(c,'turno.actualizado','turno',row.id,row.version,['rol:JOP','rol:ADM',...accounts.map(a=>`usuario:${a.id}`)]);
      return row;
    });
  }
}
