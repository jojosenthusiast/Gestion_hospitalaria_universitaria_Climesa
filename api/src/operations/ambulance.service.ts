import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Actor } from '../platform/actor';
import { Clock } from '../platform/clock';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { MaintenanceDto } from './operations.dto';
/** Etiquetas de la unidad en la API; la base guarda `disponible`, `en_servicio` y `en_mantenimiento`. */
export type UnitState='disponible'|'en_servicio'|'en_mantenimiento';
@Injectable()
export class AmbulanceService {
  constructor(private readonly db:DatabaseService,private readonly commands:CommandService,private readonly clock:Clock) {}
  /** FR-109-01: estado de la única unidad y su servicio activo (sin datos del paciente). */
  async status() {
    const now=this.clock.now();
    const unit=(await this.db.query('SELECT id,placa AS plate,estado AS state,version FROM ambulancia.unidad ORDER BY placa LIMIT 1'))[0];
    if(!unit)throw new NotFoundException('No hay una unidad de ambulancia registrada.');
    const service=(await this.db.query('SELECT id,tipo AS type,prioridad AS priority,origen AS origin,destino AS destination,despachado_en AS "dispatchedAt" FROM ambulancia.servicio WHERE unidad_id=$1 AND finalizado_en IS NULL',[unit.id]))[0];
    const crew=service?await this.db.query("SELECT t.persona_id AS \"staffId\",t.funcion AS role,p.nombres||' '||p.apellidos AS name FROM ambulancia.tripulacion t JOIN personal.persona p ON p.id=t.persona_id WHERE t.servicio_id=$1 ORDER BY t.funcion,p.apellidos",[service.id]):[];
    const paramedic=await this.paramedicOnDuty(async(sql,args)=>this.db.query(sql,args),now);
    return {unit,activeService:service?{...service,crew}:null,paramedicOnDuty:paramedic};
  }
  /**
   * Turno en curso (RN-30): persona paramédica activa con turno publicado o en curso cuyo periodo contiene el instante del reloj.
   * No usa `personal.v_turno_en_curso` porque esa vista lee `now()` de la base y aquí el reloj es sustituible.
   */
  private async paramedicOnDuty(run:(sql:string,args:unknown[])=>Promise<unknown[]>,at:Date):Promise<boolean> {
    const sql="SELECT 1 FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE p.tipo='paramedico' AND p.activo AND t.estado IN ('publicado','en_curso') AND t.periodo @> $1::timestamptz LIMIT 1";
    return (await run(sql,[at])).length>0;
  }
  /** Entrar o salir de mantenimiento; salir deja la unidad Disponible y exige paramédico de turno (FR-109-06). */
  async setMaintenance(actor:Actor,dto:MaintenanceDto,key?:string) {
    return this.commands.run(actor,'ambulancia.mantenimiento:unidad',key,dto,async c=>{
      const unit=(await c.query<{id:string;estado:UnitState;version:number}>('SELECT id,estado,version FROM ambulancia.unidad ORDER BY placa LIMIT 1 FOR UPDATE')).rows[0];
      if(!unit)throw new NotFoundException('No hay una unidad de ambulancia registrada.');
      if(unit.version!==dto.version)throw new VersionConflictException(unit.version,'La unidad cambió; vuelve a consultar su estado.');
      let target:UnitState;
      if(dto.inMaintenance){
        if(unit.estado==='en_servicio')throw new ProblemException('unidad_en_servicio',409,'La unidad tiene un servicio activo; no puede entrar a mantenimiento.');
        if(unit.estado==='en_mantenimiento')throw new ConflictException('La unidad ya está en mantenimiento.');
        target='en_mantenimiento';
      }else{
        if(unit.estado!=='en_mantenimiento')throw new ConflictException('La unidad no está en mantenimiento.');
        if(!(await this.paramedicOnDuty(async(sql,args)=>(await c.query(sql,args)).rows,this.clock.now())))throw new ProblemException('sin_paramedico_de_turno',409,'No hay un paramédico con turno en curso; la unidad no puede quedar Disponible.');
        target='disponible';
      }
      const version=(await c.query<{version:number}>('UPDATE ambulancia.unidad SET estado=$2,version=version+1 WHERE id=$1 RETURNING version',[unit.id,target])).rows[0].version;
      await c.query('INSERT INTO ambulancia.cambio_estado(unidad_id,desde,hacia,motivo,por,en) VALUES($1,$2,$3,$4,$5,$6)',[unit.id,unit.estado,target,dto.reason.trim(),actor.id,this.clock.now()]);
      await this.commands.audit(c,actor,{action:'ambulancia.mantenimiento',entity:'unidad',entityId:unit.id,permission:'ambulancia.mantenimiento',reason:dto.reason,detail:{from:unit.estado,to:target}});
      await this.commands.event(c,'ambulancia.estado_cambiado','unidad',unit.id,version,['ambulancia']);
      return {id:unit.id,state:target,version};
    });
  }
}