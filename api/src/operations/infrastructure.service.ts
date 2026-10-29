import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VersionConflictException } from '../platform/problem';
import { Actor, hasPermission } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { Clock } from '../platform/clock';
import { PoolClient } from 'pg';
import { BedBlockDto, BedTransitionDto, SpaceDto } from './operations.dto';
@Injectable()
export class InfrastructureService {
  constructor(private readonly db:DatabaseService,private readonly commands:CommandService,private readonly clock:Clock) {}
  async tree() {
    return this.db.query(`WITH RECURSIVE descendants(ancestor,id) AS (SELECT id,id FROM infra.espacio WHERE activo UNION ALL SELECT d.ancestor,e.id FROM descendants d JOIN infra.espacio e ON e.padre_id=d.id AND e.activo)
      SELECT e.id,e.padre_id AS "parentId",e.tipo AS type,e.codigo AS code,e.nombre AS name,e.categoria AS category,e.capacidad AS capacity,e.nivel AS level,e.activo AS active,e.version,infra.ruta(e.id) AS path,
      (SELECT count(*)::int FROM descendants d JOIN infra.v_estado_cama b ON b.cama_id=d.id WHERE d.ancestor=e.id) AS "totalBeds",
      (SELECT count(*)::int FROM descendants d JOIN infra.v_estado_cama b ON b.cama_id=d.id WHERE d.ancestor=e.id AND b.estado='libre') AS "freeBeds"
      FROM infra.espacio e ORDER BY coalesce(e.nivel,0),e.codigo`);
  }
  async beds(actor:Actor) {
    return this.db.transaction(async c=>{
      const rows=(await c.query(`SELECT b.cama_id AS id,b.codigo AS code,b.nombre AS name,b.habitacion_id AS "roomId",b.habitacion AS room,b.categoria AS category,b.nivel AS level,b.estado AS state,c.version,
      EXISTS(SELECT 1 FROM infra.limpieza_cama l WHERE l.cama_id=b.cama_id AND l.verificada_en IS NULL) AS "cleaningPending",
      EXISTS(SELECT 1 FROM infra.limpieza_cama l WHERE l.cama_id=b.cama_id AND l.verificada_en IS NULL AND l.limpiada_en IS NOT NULL) AS "cleaningCompleted",
      EXISTS(SELECT 1 FROM infra.limpieza_cama l WHERE l.cama_id=b.cama_id AND l.verificada_en IS NULL AND l.limpiada_por=$1) AS "cleanedByCurrentUser",
      infra.ruta(b.cama_id) AS path,a.medico_tratante_id,p.id AS "patientId",p.nombres,p.primer_apellido,p.segundo_apellido,o.area_id
      FROM infra.v_estado_cama b JOIN infra.espacio c ON c.id=b.cama_id LEFT JOIN hospitalizacion.admision a ON a.id=b.admision_id LEFT JOIN pacientes.paciente p ON p.id=a.paciente_id
      LEFT JOIN LATERAL (WITH RECURSIVE up AS (SELECT id,padre_id,tipo FROM infra.espacio WHERE id=b.habitacion_id UNION ALL SELECT e.id,e.padre_id,e.tipo FROM infra.espacio e JOIN up ON up.padre_id=e.id) SELECT id AS area_id FROM up WHERE tipo='area' LIMIT 1) o ON true ORDER BY b.nivel,b.habitacion,b.codigo`,[actor.id])).rows;
      const areas=actor.staffId?(await c.query('SELECT area_id FROM personal.v_turno_en_curso WHERE persona_id=$1',[actor.staffId])).rows.map(r=>r.area_id):[];
      const contexts=actor.permissions.filter(p=>p.code==='camas.ver_ocupante').map(p=>p.context);
      const result=rows.map(({nombres,primer_apellido,segundo_apellido,patientId,area_id,medico_tratante_id,...bed})=>{
        if(!patientId)return bed;
        const name=[nombres,primer_apellido,segundo_apellido].filter(Boolean).join(' ');
        const full=contexts.includes('x')||(contexts.includes('relacion')&&actor.staffId===medico_tratante_id)||(contexts.includes('area')&&areas.includes(area_id))||(contexts.includes('propio')&&actor.patientId===patientId);
        return {...bed,occupant:full?name:name.split(' ').map((n:string)=>n[0]).join('.')+'.',...(full?{patientId}:{}),occupantRestricted:!full};
      });
      await this.commands.audit(c,actor,{action:'camas.ver_tablero',entity:'cama',permission:'camas.ver_tablero',detail:{count:rows.length}});
      return result;
    });
  }
  async save(actor:Actor,id:string|null,dto:SpaceDto,key?:string) {
    if(dto.type==='habitacion'&&(!dto.capacity||!dto.category))throw new BadRequestException('Una habitación necesita categoría y capacidad.');
    if(dto.type!=='hospital'&&!dto.parentId)throw new BadRequestException('Selecciona el espacio padre.');
    if(!/^[A-Za-z0-9_-]+$/.test(dto.code))throw new BadRequestException('Usa letras, números y guiones en el código.');
    return this.commands.run(actor,`espacios.configurar:${id??'nuevo'}`,key,dto,async c=>{
      let row;
      if(id){
        const old=(await c.query('SELECT * FROM infra.espacio WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException('No se encontró el espacio.');
        if(old.version!==dto.version)throw new VersionConflictException(old.version,'El espacio cambió; vuelve a abrirlo.');
        if(!dto.reason||dto.reason.trim().length<10)throw new BadRequestException('Indica el motivo del cambio.');
        if(old.tipo==='cama'&&(dto.parentId!==old.padre_id||dto.active===false||dto.type!=='cama')){
          const state=(await c.query('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1',[id])).rows[0]?.estado;
          if(state&&state!=='libre')throw new ConflictException('Solo puedes mover o desactivar una cama libre.');
        }
        if(dto.active===false&&(await c.query('SELECT id FROM infra.espacio WHERE padre_id=$1 AND activo LIMIT 1',[id])).rowCount)throw new ConflictException('Desactiva primero los espacios hijos.');
        row=(await c.query('UPDATE infra.espacio SET padre_id=$2,tipo=$3,codigo=$4,nombre=$5,categoria=$6,capacidad=$7,nivel=$8,activo=$9,version=version+1 WHERE id=$1 RETURNING id,version',[id,dto.type==='hospital'?null:dto.parentId,dto.type,dto.code.toUpperCase(),dto.name,dto.type==='habitacion'?dto.category:null,dto.capacity||null,dto.level??null,dto.active??true])).rows[0];
      }else{
        if(dto.type==='hospital'&&(await c.query("SELECT id FROM infra.espacio WHERE tipo='hospital' LIMIT 1")).rowCount)throw new ConflictException('El hospital raíz ya existe.');
        row=(await c.query('INSERT INTO infra.espacio(padre_id,tipo,codigo,nombre,categoria,capacidad,nivel) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,version',[dto.type==='hospital'?null:dto.parentId,dto.type,dto.code.toUpperCase(),dto.name,dto.type==='habitacion'?dto.category:null,dto.capacity||null,dto.level??null])).rows[0];
      }
      await this.commands.audit(c,actor,{action:id?'espacios.editar':'espacios.crear',entity:'espacio',entityId:row.id,permission:'espacios.configurar',reason:dto.reason});
      await this.commands.event(c,'espacio.actualizado','espacio',row.id,row.version,['rol:ADM','rol:JOP','rol:REC','rol:ENF']);
      return row;
    });
  }
  async blockBed(actor:Actor,id:string,dto:BedBlockDto,key?:string) {
    return this.commands.run(actor,`camas.bloquear:${id}`,key,dto,async c=>{
      const bed=await this.lockBed(c,id,dto.version);
      if(bed.state!=='libre')throw new ConflictException('Solo se puede bloquear una cama libre.');
      const now=this.clock.now();
      await c.query("INSERT INTO infra.bloqueo_cama(cama_id,periodo,motivo,origen,creado_por) VALUES($1,tstzrange($2::timestamptz,NULL,'[)'),$3,'manual',$4)",[id,now,dto.motivo.trim(),actor.id]);
      const version=await this.advanceBedVersion(c,id);
      await this.recordBedChange(c,actor,id,version,'camas.bloquear','camas.bloquear',dto.motivo,{state:'bloqueada'});
      return {id,state:'bloqueada',version};
    });
  }
  async unblockBed(actor:Actor,id:string,dto:BedTransitionDto,key?:string) {
    return this.commands.run(actor,`camas.bloquear:${id}`,key,dto,async c=>{
      const bed=await this.lockBed(c,id,dto.version);
      if(bed.state!=='bloqueada')throw new ConflictException('La cama no tiene un bloqueo activo.');
      const now=this.clock.now();
      const block=(await c.query<{id:string}>('SELECT id FROM infra.bloqueo_cama WHERE cama_id=$1 AND periodo @> $2::timestamptz FOR UPDATE',[id,now])).rows[0];
      if(!block)throw new ConflictException('No se encontró el bloqueo activo de la cama.');
      await c.query("UPDATE infra.bloqueo_cama SET periodo=tstzrange(lower(periodo),$2::timestamptz,'[)') WHERE id=$1",[block.id,now]);
      const version=await this.advanceBedVersion(c,id);
      await this.recordBedChange(c,actor,id,version,'camas.desbloquear','camas.bloquear',dto.reason,{state:'libre'});
      return {id,state:'libre',version};
    });
  }
  async requestBedCleaning(actor:Actor,id:string,dto:BedTransitionDto,key?:string) {
    return this.commands.run(actor,`camas.registrar_limpieza:${id}`,key,dto,async c=>{
      const bed=await this.lockBed(c,id,dto.version);
      if(bed.state!=='ocupada'&&bed.state!=='libre')throw new ConflictException('Solo una cama libre o con ocupación puede pasar a limpieza.');
      const pending=this.clock.now();
      const cleaning=(await c.query<{id:string}>('INSERT INTO infra.limpieza_cama(cama_id,pendiente_desde) VALUES($1,$2) RETURNING id',[id,pending])).rows[0];
      const version=await this.advanceBedVersion(c,id);
      await this.recordBedChange(c,actor,id,version,'camas.solicitar_limpieza','camas.registrar_limpieza',dto.reason,{state:'limpieza'});
      await this.commands.event(c,'cama.limpieza_pendiente','cama',id,version,['rol:JOP','rol:REC','rol:ENF','rol:MED']);
      return {id:cleaning.id,camaId:id,state:'limpieza',version,pendienteDesde:pending.toISOString()};
    });
  }
  async completeBedCleaning(actor:Actor,id:string,dto:BedTransitionDto,key?:string) {
    return this.commands.run(actor,`camas.registrar_limpieza:${id}`,key,dto,async c=>{
      const bed=await this.lockBed(c,id,dto.version);
      if(bed.state!=='limpieza')throw new ConflictException('La cama no tiene una limpieza pendiente.');
      const cleaning=(await c.query<{id:string;limpiada_en:string|null}>('SELECT id,limpiada_en FROM infra.limpieza_cama WHERE cama_id=$1 AND verificada_en IS NULL ORDER BY pendiente_desde DESC LIMIT 1 FOR UPDATE',[id])).rows[0];
      if(!cleaning)throw new ConflictException('La cama no tiene una limpieza pendiente.');
      if(cleaning.limpiada_en)throw new ConflictException('La limpieza ya fue registrada.');
      const now=this.clock.now();
      await c.query('UPDATE infra.limpieza_cama SET limpiada_por=$2,limpiada_en=$3 WHERE id=$1',[cleaning.id,actor.id,now]);
      const version=await this.advanceBedVersion(c,id);
      await this.recordBedChange(c,actor,id,version,'camas.completar_limpieza','camas.registrar_limpieza',dto.reason,{state:'limpieza',limpiadaPor:actor.id});
      return {id:cleaning.id,camaId:id,state:'limpieza',version,limpiadaEn:now.toISOString()};
    });
  }
  async verifyBedCleaning(actor:Actor,id:string,dto:BedTransitionDto,key?:string) {
    return this.commands.run(actor,`camas.verificar_limpieza:${id}`,key,dto,async c=>{
      const bed=await this.lockBed(c,id,dto.version);
      if(bed.state!=='limpieza')throw new ConflictException('La cama no tiene una limpieza pendiente.');
      const cleaning=(await c.query<{id:string;limpiada_por:string|null;limpiada_en:string|null}>('SELECT id,limpiada_por,limpiada_en FROM infra.limpieza_cama WHERE cama_id=$1 AND verificada_en IS NULL ORDER BY pendiente_desde DESC LIMIT 1 FOR UPDATE',[id])).rows[0];
      if(!cleaning?.limpiada_en)throw new ConflictException('La limpieza debe registrarse antes de verificarla.');
      if(cleaning.limpiada_por===actor.id)throw new ConflictException('Quien limpió la cama no puede verificarla.');
      const now=this.clock.now();
      await c.query('UPDATE infra.limpieza_cama SET verificada_por=$2,verificada_en=$3 WHERE id=$1',[cleaning.id,actor.id,now]);
      const version=await this.advanceBedVersion(c,id);
      await this.recordBedChange(c,actor,id,version,'camas.verificar_limpieza','camas.verificar_limpieza',dto.reason,{state:'libre',verificadaPor:actor.id});
      return {id:cleaning.id,camaId:id,state:'libre',version,verificadaEn:now.toISOString()};
    });
  }
  private async lockBed(c:PoolClient,id:string,version:number):Promise<{state:string}> {
    const bed=(await c.query<{tipo:string;activo:boolean;version:number}>('SELECT tipo,activo,version FROM infra.espacio WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!bed||bed.tipo!=='cama'||!bed.activo)throw new NotFoundException('No se encontró la cama activa.');
    if(bed.version!==version)throw new VersionConflictException(bed.version,'La cama cambió; vuelve a consultar el tablero.');
    const current=(await c.query<{estado:string}>('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1',[id])).rows[0];
    if(!current)throw new NotFoundException('No se encontró la cama activa.');
    return {state:current.estado};
  }
  private async advanceBedVersion(c:PoolClient,id:string):Promise<number> {
    return (await c.query<{version:number}>('UPDATE infra.espacio SET version=version+1 WHERE id=$1 RETURNING version',[id])).rows[0].version;
  }
  private async recordBedChange(c:PoolClient,actor:Actor,id:string,version:number,action:string,permission:string,reason:string,detail:Record<string,unknown>) {
    await this.commands.audit(c,actor,{action,entity:'cama',entityId:id,permission,reason,detail});
    await this.commands.event(c,'cama.estado_cambiado','cama',id,version,['rol:REC','rol:JOP','rol:ENF','rol:MED']);
  }
  async dashboard(actor:Actor) {
    const result:Record<string,unknown>={lastUpdate:this.clock.now().toISOString()};
    if(hasPermission(actor,'espacios.ver')||hasPermission(actor,'metricas.ver'))result.beds=(await this.db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE estado='libre')::int AS free,count(*) FILTER(WHERE estado='ocupada')::int AS occupied FROM infra.v_estado_cama"))[0];
    if(hasPermission(actor,'pacientes.buscar'))result.patients=(await this.db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE estado='activo')::int AS active FROM pacientes.paciente"))[0];
    if(hasPermission(actor,'personal.ver'))result.staff=(await this.db.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE activo)::int AS active FROM personal.persona'))[0];
    if(hasPermission(actor,'usuarios.ver'))result.users=(await this.db.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE estado='activo')::int AS active FROM acceso.usuario"))[0];
    if(hasPermission(actor,'turnos.planificar'))result.shifts=(await this.db.query("SELECT count(*) FILTER(WHERE periodo @> $1::timestamptz)::int AS current,count(*) FILTER(WHERE estado='borrador')::int AS draft FROM personal.turno WHERE estado<>'cancelado'",[this.clock.now()]))[0];
    return result;
  }
}
