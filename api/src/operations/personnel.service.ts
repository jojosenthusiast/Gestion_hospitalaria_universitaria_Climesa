import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ProblemException,VersionConflictException } from '../platform/problem';
import { Actor } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { Clock,businessDate,businessDayRange } from '../platform/clock';
import { StaffDto, ShiftDto, RegistrationDto, PublishDto } from './operations.dto';
import { PolicyRegistry } from '../platform/policy.registry';
import { validDui } from '../platform/identity.rules';
const HOUR=3600_000,DAY=24*HOUR,LOCAL_OFFSET=6*HOUR;
/** Lunes 00:00 local (en UTC) de la semana que contiene el instante; la semana va de lunes a domingo (RN-14). */
export const weekStart=(at:Date)=>{const day=new Date(`${businessDate(at)}T00:00:00Z`);return new Date(day.getTime()-((day.getUTCDay()+6)%7)*DAY+LOCAL_OFFSET);};
/** Horas de [a,b) (ms UTC) que caen entre las 06:00 y las 22:00 locales. */
export const daytimeHours=(a:number,b:number)=>{let total=0;for(let day=Math.floor((a-LOCAL_OFFSET)/DAY)*DAY+LOCAL_OFFSET;day<b;day+=DAY){const from=Math.max(a,day+6*HOUR),to=Math.min(b,day+22*HOUR);if(to>from)total+=to-from;}return total/HOUR;};
// RN-15: la política turnos.cobertura_minima se evalúa por área; hoy solo Emergencia (24 h) tiene área y horario definidos.
const COVERAGE_AREAS:Record<string,string>={'P1-EMG':'emergencia'};
const COVERAGE_ROLES:Record<string,string>={MED:'medico',ENF:'enfermero',REC:'recepcionista',LAB:'laboratorista'};
export type CoverageGap={areaId:string;area:string;role:string;start:string;end:string;required:number;actual:number};
@Injectable()
export class PersonnelService implements OnModuleInit,OnModuleDestroy {
  private timer?:NodeJS.Timeout;
  constructor(private readonly db:DatabaseService,private readonly commands:CommandService,private readonly clock:Clock,private readonly policies:PolicyRegistry) {}
  // FR-103-13: trabajo programado cada minuto; las pruebas lo invocan con el reloj sustituido en lugar de esperar al temporizador.
  onModuleInit(){if(process.env.NODE_ENV==='test')return;const log=new Logger(PersonnelService.name);this.timer=setInterval(()=>this.advanceStates().catch(e=>log.warn(`No se pudo avanzar el estado de los turnos: ${e}`)),60_000);this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
  /** Pasa los turnos publicados a "en curso" al empezar y a "completado" al terminar, según el reloj inyectable (FR-103-13, D-054). */
  async advanceStates() {
    const now=this.clock.now();
    return this.db.transaction(async c=>{
      const rows=(await c.query("UPDATE personal.turno SET estado=CASE WHEN upper(periodo)<=$1::timestamptz THEN 'completado' ELSE 'en_curso' END,version=version+1 WHERE (estado='publicado' AND lower(periodo)<=$1::timestamptz) OR (estado='en_curso' AND upper(periodo)<=$1::timestamptz) RETURNING id,persona_id,version",[now])).rows;
      await this.announce(c,'turno.actualizado',rows);
      return rows.length;
    });
  }
  private async announce(c:PoolClient,type:string,rows:{id:string;persona_id:string;version:number}[]) {
    if(!rows.length)return;
    const accounts=(await c.query('SELECT id,persona_personal_id FROM acceso.usuario WHERE persona_personal_id=ANY($1::uuid[])',[rows.map(r=>r.persona_id)])).rows;
    for(const r of rows)await this.commands.event(c,type,'turno',r.id,r.version,['rol:JOP','rol:ADM',...accounts.filter(a=>a.persona_personal_id===r.persona_id).map(a=>`usuario:${a.id}`)]);
  }
  private range(from:string,to:string) {
    try{
      const start=businessDayRange(from).start,end=businessDayRange(to).end;
      if(end<=start||(end.valueOf()-start.valueOf())/DAY>31)throw new RangeError();
      return {start,end};
    }catch{throw new BadRequestException('Indica un rango de fechas válido, con el fin igual o posterior al inicio y de máximo 31 días.');}
  }
  /** FR-103-08: huecos por área, rol y hora frente al mínimo vigente; los turnos cancelados no cuentan. */
  private async gaps(c:PoolClient,start:Date,end:Date,areaId?:string):Promise<CoverageGap[]> {
    const policy=await this.policies.value<Record<string,Record<string,number>>>(c,'turnos.cobertura_minima',start);
    const areas=(await c.query("SELECT id,codigo,nombre FROM infra.espacio WHERE codigo=ANY($1::text[]) AND ($2::uuid IS NULL OR id=$2)",[Object.keys(COVERAGE_AREAS),areaId??null])).rows;
    const shifts=(await c.query("SELECT t.area_id,p.tipo,lower(t.periodo) AS start,upper(t.periodo) AS \"end\" FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE t.estado<>'cancelado' AND t.area_id=ANY($1::uuid[]) AND t.periodo && tstzrange($2,$3)",[areas.map(a=>a.id),start,end])).rows.map(s=>({...s,start:new Date(s.start).valueOf(),end:new Date(s.end).valueOf()}));
    const gaps:CoverageGap[]=[];
    for(const area of areas)for(const [role,required] of Object.entries(policy[COVERAGE_AREAS[area.codigo]]??{})){
      const mine=shifts.filter(s=>s.area_id===area.id&&s.tipo===COVERAGE_ROLES[role]);
      let open:CoverageGap|undefined;
      for(let h=start.valueOf();h<end.valueOf();h+=HOUR){
        const actual=mine.filter(s=>s.start<=h&&s.end>=h+HOUR).length;
        if(actual>=required){open=undefined;continue;}
        if(open&&open.actual===actual)open.end=new Date(h+HOUR).toISOString();
        else gaps.push(open={areaId:area.id,area:area.nombre,role,start:new Date(h).toISOString(),end:new Date(h+HOUR).toISOString(),required,actual});
      }
    }
    return gaps.sort((a,b)=>a.start.localeCompare(b.start)||a.role.localeCompare(b.role));
  }
  async coverage(from:string,to:string,areaId?:string) {
    const {start,end}=this.range(from,to);
    if(areaId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(areaId))throw new BadRequestException('Selecciona un área válida.');
    return {from,to,gaps:await this.db.transaction(c=>this.gaps(c,start,end,areaId))};
  }
  /** FR-103-09: publica los borradores del rango; con huecos publica igual, advierte y deja registrado quién publicó. */
  async publish(actor:Actor,dto:PublishDto,key?:string) {
    const {start,end}=this.range(dto.from,dto.to);
    return this.commands.run(actor,'turnos.publicar:rango',key,dto,async c=>{
      const at=this.clock.now();
      const rows=(await c.query("UPDATE personal.turno SET estado='publicado',publicado_por=$3,publicado_en=$4,version=version+1 WHERE estado='borrador' AND periodo && tstzrange($1,$2) AND ($5::uuid IS NULL OR area_id=$5) RETURNING id,persona_id,version",[start,end,actor.id,at,dto.areaId??null])).rows;
      const warnings=await this.gaps(c,start,end,dto.areaId);
      await this.commands.audit(c,actor,{action:'turnos.publicar',entity:'planificacion',entityId:`${dto.from}/${dto.to}`,permission:'turnos.publicar',detail:{desde:dto.from,hasta:dto.to,areaId:dto.areaId??null,publicados:rows.length,huecos:warnings.length}});
      await this.announce(c,'turno.publicado',rows);
      return {from:dto.from,to:dto.to,published:rows.length,publishedBy:actor.id,publishedAt:at.toISOString(),warnings};
    });
  }
  async list(actor:Actor) {
    const rows=await this.db.query(`SELECT p.id,p.nombres AS "givenNames",p.apellidos AS surnames,p.tipo AS type,p.especialidad AS specialty,p.area_id AS "areaId",e.nombre AS area,p.activo AS active,p.version,p.telefono AS phone,p.dui,COALESCE((SELECT json_agg(json_build_object('id',i.id,'board',i.junta,'number',i.numero,'validFrom',lower(i.vigencia)::text,'validTo',(upper(i.vigencia)-1)::text) ORDER BY lower(i.vigencia) DESC,i.numero) FROM personal.inscripcion i WHERE i.persona_id=p.id),'[]'::json) AS registrations FROM personal.persona p LEFT JOIN infra.espacio e ON e.id=p.area_id ORDER BY p.activo DESC,p.apellidos,p.nombres`);
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
  async register(actor:Actor,id:string,dto:RegistrationDto,key?:string) {
    const valid=(d:string)=>new Date(`${d}T00:00:00Z`).toISOString().slice(0,10)===d;
    if(!valid(dto.validFrom)||!valid(dto.validTo)||dto.validTo<dto.validFrom)throw new BadRequestException('Indica una vigencia con fechas válidas; el fin no puede ser anterior al inicio.');
    return this.commands.run(actor,`personal.gestionar:${id}:inscripcion`,key,dto,async c=>{
      const person=(await c.query('SELECT version FROM personal.persona WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!person)throw new NotFoundException('No se encontró la persona.');
      if(person.version!==dto.version)throw new VersionConflictException(person.version,'La ficha cambió; vuelve a abrirla.');
      if((await c.query('SELECT 1 FROM personal.inscripcion WHERE junta=$1 AND numero=$2',[dto.board,dto.number.trim()])).rowCount)throw new ConflictException('Esa inscripción ya está registrada.');
      const row=(await c.query("INSERT INTO personal.inscripcion(persona_id,junta,numero,vigencia) VALUES($1,$2,$3,daterange($4::date,$5::date,'[]')) RETURNING id",[id,dto.board,dto.number.trim(),dto.validFrom,dto.validTo])).rows[0];
      const version=(await c.query('UPDATE personal.persona SET version=version+1 WHERE id=$1 RETURNING version',[id])).rows[0].version;
      await this.commands.audit(c,actor,{action:'personal.inscripcion.registrar',entity:'personal',entityId:id,permission:'personal.gestionar',reason:dto.reason,detail:{inscripcionId:row.id,junta:dto.board}});
      await this.commands.event(c,'personal.actualizado','personal',id,version,['rol:ADM','rol:JOP']);
      return {id:row.id,version};
    });
  }
  async shifts(actor:Actor,mine=false) {
    if(mine&&!actor.staffId)return [];
    await this.advanceStates();
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
      // FR-103-10: medicina y enfermería no se programan sin inscripción vigente en la fecha del turno; cancelar siempre se permite.
      if(dto.state!=='cancelado'&&['medico','enfermero'].includes(person.tipo)&&!(await c.query('SELECT personal.inscrito($1,$2::date) AS ok',[dto.staffId,businessDate(start)])).rows[0].ok)throw new ProblemException('inscripcion_no_vigente',409,'La persona no tiene una inscripción profesional vigente en la fecha del turno.','staffId');
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
      // FR-103-07 / RN-14: aviso, no bloqueo, de más de 44 h diurnas por semana (lunes a domingo, 06:00-22:00 local); excederlas exige justificación.
      const warnings:{codigo:string;horasSemana:number;limite:number}[]=[];
      if(dto.state!=='cancelado'){
        const limit=(await this.policies.value<{aviso_diurnas:number}>(c,'turnos.horas_semanales',start)).aviso_diurnas;
        const first=weekStart(start).valueOf(),last=weekStart(new Date(end.valueOf()-1)).valueOf()+7*DAY;
        const others=(await c.query("SELECT lower(periodo) AS start,upper(periodo) AS \"end\" FROM personal.turno WHERE persona_id=$1 AND estado<>'cancelado' AND ($2::uuid IS NULL OR id<>$2) AND periodo && tstzrange($3::timestamptz,$4::timestamptz)",[dto.staffId,id,new Date(first),new Date(last)])).rows.map(o=>[new Date(o.start).valueOf(),new Date(o.end).valueOf()]);
        for(let week=first;week<last;week+=7*DAY){
          const within=(a:number,b:number)=>daytimeHours(Math.max(a,week),Math.min(b,week+7*DAY));
          const own=within(start.valueOf(),end.valueOf()),total=Math.round((own+others.reduce((sum,[a,b])=>sum+within(a,b),0))*100)/100;
          if(own>0&&total>limit)warnings.push({codigo:'horas_semanales_excedidas',horasSemana:total,limite:limit});
        }
        if(warnings.length&&(dto.justification?.trim().length??0)<10)throw new ProblemException('horas_semanales_excedidas',409,`La persona suma ${warnings[0].horasSemana} horas diurnas en la semana, más de las ${limit} permitidas sin aviso; indica una justificación de al menos 10 caracteres.`,'justification',{horasSemana:warnings[0].horasSemana,limite:limit});
      }
      let row;
      if(id){
        const old=(await c.query('SELECT version FROM personal.turno WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException('No se encontró el turno.');
        if(old.version!==dto.version)throw new VersionConflictException(old.version,'El turno cambió; actualiza la planificación.');
        if(!dto.reason||dto.reason.trim().length<10)throw new BadRequestException('Indica el motivo del cambio.');
        row=(await c.query("UPDATE personal.turno SET persona_id=$2,area_id=$3,periodo=tstzrange($4,$5,'[)'),tipo=$6,justificacion=$7,estado=coalesce($8,estado),version=version+1 WHERE id=$1 RETURNING id,version",[id,dto.staffId,dto.areaId,start,end,dto.type,dto.justification||null,dto.state||null])).rows[0];
      }else row=(await c.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,justificacion,creado_por) VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7) RETURNING id,version",[dto.staffId,dto.areaId,start,end,dto.type,dto.justification||null,actor.id])).rows[0];
      await this.commands.audit(c,actor,{action:id?'turnos.mover':'turnos.crear',entity:'turno',entityId:row.id,permission:'turnos.planificar',reason:dto.reason,...(warnings.length?{detail:{horasSemana:warnings[0].horasSemana,limite:warnings[0].limite,justificacion:dto.justification!.trim()}}:{})});
      const accounts=(await c.query('SELECT id FROM acceso.usuario WHERE persona_personal_id=$1',[dto.staffId])).rows;
      await this.commands.event(c,'turno.actualizado','turno',row.id,row.version,['rol:JOP','rol:ADM',...accounts.map(a=>`usuario:${a.id}`)]);
      return {...row,advertencias:warnings};
    });
  }
}
