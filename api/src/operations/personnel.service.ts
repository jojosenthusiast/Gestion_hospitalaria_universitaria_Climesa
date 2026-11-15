import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ProblemException,VersionConflictException } from '../platform/problem';
import { Actor, hasPermission } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { CommandService } from '../platform/command.service';
import { Clock,businessDate,businessDayRange } from '../platform/clock';
import { StaffDto, ShiftDto, RegistrationDto, PublishDto, AttendanceDto, CheckInDto } from './operations.dto';
import { AttendancePolicy, LoadPolicy, allowedActions, attendanceOf, consecutiveDays, isLate, maxRollingHours, stateByClock } from './shift.rules';
import { PolicyRegistry } from '../platform/policy.registry';
import { validDui } from '../platform/identity.rules';
const HOUR=3600_000,DAY=24*HOUR,LOCAL_OFFSET=6*HOUR;
/** Turnos que devuelve `GET /turnos`: los de las últimas semanas y toda la planificación próxima. */
export const SHIFT_WINDOW={pastDays:31,futureDays:93} as const;
/** Lunes 00:00 local (en UTC) de la semana que contiene el instante; la semana va de lunes a domingo (RN-14). */
export const weekStart=(at:Date)=>{const day=new Date(`${businessDate(at)}T00:00:00Z`);return new Date(day.getTime()-((day.getUTCDay()+6)%7)*DAY+LOCAL_OFFSET);};
/** Horas de [a,b) (ms UTC) que caen entre las 06:00 y las 22:00 locales. */
export const daytimeHours=(a:number,b:number)=>{let total=0;for(let day=Math.floor((a-LOCAL_OFFSET)/DAY)*DAY+LOCAL_OFFSET;day<b;day+=DAY){const from=Math.max(a,day+6*HOUR),to=Math.min(b,day+22*HOUR);if(to>from)total+=to-from;}return total/HOUR;};
// RN-15 / CARGA-03: la política turnos.cobertura_minima se evalúa por área. Emergencia las 24 h; Recepción y Laboratorio
// en su horario (política turnos.horario_servicios); cada área de hospitalización con camas ocupadas, las 24 h.
const COVERAGE_AREAS:Record<string,string>={'P1-EMG':'emergencia','P1-REC':'recepcion_horario','P1-LAB':'laboratorio_horario'};
const COVERAGE_ROLES:Record<string,string>={MED:'medico',ENF:'enfermero',REC:'recepcionista',LAB:'laboratorista'};
const STAFF_TYPE_NAMES:Record<string,string>={medico:'Médico',enfermero:'Enfermería',asistente:'Asistencia',recepcionista:'Recepción',laboratorista:'Laboratorio',paramedico:'Paramédico',motorista:'Motorista',limpieza:'Limpieza',administrativo:'Administración',otro:'Otro'};
export type CoverageGap={areaId:string;area:string;role:string;start:string;end:string;required:number;actual:number};
/** Turnos que trabajan: los cancelados y los ausentes no cuentan como cobertura, descanso ni carga (ASIS-01). */
const WORKING="t.estado NOT IN ('cancelado','ausente')";
/** Reglas que la base aplica en `personal.validar_turno` (20261120003000) y su mensaje para quien planifica. */
const DB_RULES:Record<string,string>={
  transicion_invalida:'El turno ya no admite ese cambio de estado.',
  turno_iniciado:'El turno ya empezó; no se puede mover ni cancelar.',
  descanso_insuficiente:'La persona no tendría el descanso mínimo entre turnos: 8 h, o 12 h después de una guardia de 24 h.',
  carga_semanal_excedida:'La persona superaría el tope de horas en 7 días. Solo en una emergencia se asigna, indicando el motivo de la excepción.',
  turno_con_citas:'El médico tiene citas en ese horario; reprográmalas o cancélalas desde Citas antes de cambiar el turno.',
  tripulante_en_servicio:'La persona va en un servicio de ambulancia activo; no puede quedar ausente.',
};
/** Traduce una regla de la base (P0001) a un problema con código estable; lo demás sigue al filtro de errores. */
async function dbRule<T>(work:Promise<T>):Promise<T>{
  try{return await work;}catch(error){
    const sql=error as {code?:string;message?:string};
    const code=sql.code==='P0001'?sql.message?.split(' ')[0]:undefined;
    if(code&&DB_RULES[code])throw new ProblemException(code,409,DB_RULES[code]);
    throw error;
  }
}
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
      // ASIS-01: pasado el margen sin entrada, el turno queda "sin confirmar" y se avisa una vez a JOP (y a la persona).
      const margin=(await this.policies.value<AttendancePolicy>(c,'turnos.asistencia',now)).margen_minutos;
      const unconfirmed=(await c.query("UPDATE personal.turno SET alerta_sin_confirmar_en=$1,version=version+1 WHERE estado IN ('publicado','en_curso') AND presente_desde IS NULL AND alerta_sin_confirmar_en IS NULL AND lower(periodo)+make_interval(mins=>$2)<=$1::timestamptz AND upper(periodo)>$1::timestamptz RETURNING id,persona_id,version",[now,margin])).rows;
      const latest=new Map([...rows,...unconfirmed].map(r=>[r.id,r]));
      await this.announce(c,'turno.actualizado',[...latest.values()]);
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
  /** FR-103-08 / CARGA-03: huecos por área, rol y hora frente al mínimo vigente; los turnos cancelados o ausentes no cuentan. */
  private async gaps(c:PoolClient,start:Date,end:Date,areaId?:string):Promise<CoverageGap[]> {
    const policy=await this.policies.value<Record<string,Record<string,number>>>(c,'turnos.cobertura_minima',start);
    const hours=(await c.query("SELECT valor FROM plataforma.politica WHERE clave='turnos.horario_servicios' AND vigencia @> $1::timestamptz",[start])).rows[0]?.valor as Record<string,{desde:number;hasta:number}>|undefined;
    // Áreas con regla propia por código y áreas de hospitalización con alguna cama ocupada ahora (planta_con_ocupacion).
    const areas=(await c.query(`SELECT e.id,e.codigo,e.nombre,CASE WHEN e.codigo=ANY($1::text[]) THEN NULL ELSE 'planta_con_ocupacion' END AS regla FROM infra.espacio e
      WHERE e.activo AND ($2::uuid IS NULL OR e.id=$2) AND (e.codigo=ANY($1::text[]) OR (e.tipo='area' AND EXISTS(SELECT 1 FROM hospitalizacion.ocupacion_cama o JOIN infra.espacio h ON h.id=o.habitacion_id WHERE h.padre_id=e.id AND upper_inf(o.periodo))))`,[Object.keys(COVERAGE_AREAS),areaId??null])).rows;
    const shifts=(await c.query(`SELECT t.area_id,p.tipo,lower(t.periodo) AS start,upper(t.periodo) AS "end" FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE ${WORKING} AND t.estado<>'borrador' AND t.area_id=ANY($1::uuid[]) AND t.periodo && tstzrange($2,$3)`,[areas.map(a=>a.id),start,end])).rows.map(s=>({...s,start:new Date(s.start).valueOf(),end:new Date(s.end).valueOf()}));
    const gaps:CoverageGap[]=[];
    for(const area of areas){
      const rule=area.regla??COVERAGE_AREAS[area.codigo];
      const open=hours?.[area.codigo];
      for(const [role,required] of Object.entries(policy[rule]??{})){
        const mine=shifts.filter(s=>s.area_id===area.id&&s.tipo===COVERAGE_ROLES[role]);
        let gap:CoverageGap|undefined;
        for(let h=start.valueOf();h<end.valueOf();h+=HOUR){
          const local=new Date(h-LOCAL_OFFSET).getUTCHours();
          if(open&&(local<open.desde||local>=open.hasta)){gap=undefined;continue;}
          const actual=mine.filter(s=>s.start<=h&&s.end>=h+HOUR).length;
          if(actual>=required){gap=undefined;continue;}
          if(gap&&gap.actual===actual)gap.end=new Date(h+HOUR).toISOString();
          else gaps.push(gap={areaId:area.id,area:area.nombre,role,start:new Date(h).toISOString(),end:new Date(h+HOUR).toISOString(),required,actual});
        }
      }
    }
    return gaps.sort((a,b)=>a.start.localeCompare(b.start)||a.area.localeCompare(b.area,'es')||a.role.localeCompare(b.role));
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
    return hasPermission(actor,'personal.ver_datos_personales')?rows:rows.map(({dui,phone,...row})=>row);
  }
  /** Obs. 9: catálogo de especialidades por categoría (tipo de personal). Solo hay catálogo para `medico` y `enfermero`. */
  async specialties(category?:string){
    return this.db.query(`SELECT codigo AS code,nombre AS name,categoria AS category FROM personal.especialidad_catalogo WHERE activo AND ($1::text IS NULL OR categoria=$1) ORDER BY categoria,orden,nombre`,[category||null]);
  }
  /** Valida la especialidad contra el catálogo de su categoría y devuelve el nombre canónico; un valor histórico sin cambios se conserva. */
  private async checkedSpecialty(c:PoolClient,type:string,value:string|undefined,stored:string|null):Promise<string|null>{
    const text=(value??'').trim();
    if(type==='medico'&&!text)return 'Medicina general';
    if(!text)return null;
    if(stored&&text.toLocaleLowerCase('es')===stored.toLocaleLowerCase('es'))return stored;
    if(type!=='medico'&&type!=='enfermero')throw new BadRequestException('Este tipo de personal no lleva especialidad.');
    const hit=(await c.query('SELECT nombre FROM personal.especialidad_catalogo WHERE activo AND categoria=$1 AND lower(nombre)=lower($2)',[type,text])).rows[0];
    if(!hit)throw new BadRequestException('Selecciona una especialidad del catálogo para este tipo de personal.');
    return hit.nombre;
  }
  private async area(c:PoolClient,id?:string){if(id&&!(await c.query("SELECT id FROM infra.espacio WHERE id=$1 AND activo AND tipo IN ('area','planta','consultorio','hospital')",[id])).rowCount)throw new BadRequestException('Selecciona un área activa.');}
  async save(actor:Actor,id:string|null,dto:StaffDto,key?:string) {
    if(!/^[\p{L}\p{M} .’'-]+$/u.test(dto.givenNames+dto.surnames))throw new BadRequestException('Los nombres y apellidos no pueden contener números.');
    if(dto.dui&&(!/^\d{8}-?\d$/.test(dto.dui)||!validDui(dto.dui)))throw new BadRequestException('Revisa el dígito verificador del DUI.');
    if(dto.phone&&!/^[267]\d{3}-?\d{4}$/.test(dto.phone))throw new BadRequestException('Revisa el teléfono de ocho dígitos.');
    return this.commands.run(actor,`personal.gestionar:${id??'nuevo'}`,key,dto,async c=>{
      await this.area(c,dto.areaId);
      let row,specialty:string|null=null;
      if(id){
        const old=(await c.query('SELECT * FROM personal.persona WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw new NotFoundException('No se encontró la persona.');
        specialty=await this.checkedSpecialty(c,dto.type,dto.specialty,old.especialidad);
        if(old.version!==dto.version)throw new VersionConflictException(old.version,'La ficha cambió; vuelve a abrirla.');
        if(!dto.reason||dto.reason.trim().length<10)throw new BadRequestException('Indica el motivo de la modificación.');
        if(dto.active===false&&(await c.query("SELECT id FROM personal.turno WHERE persona_id=$1 AND estado<>'cancelado' AND upper(periodo)>$2 LIMIT 1",[id,this.clock.now()])).rowCount)throw new ConflictException('Reasigna o cancela sus turnos pendientes antes de inactivar.');
        row=(await c.query('UPDATE personal.persona SET nombres=$2,apellidos=$3,tipo=$4,especialidad=$5,area_id=$6,telefono=$7,dui=$8,activo=$9,version=version+1 WHERE id=$1 RETURNING id,version',[id,dto.givenNames.trim(),dto.surnames.trim(),dto.type,specialty,dto.areaId||null,dto.phone||null,dto.dui?.replace('-','')||null,dto.active??true])).rows[0];
      }else{specialty=await this.checkedSpecialty(c,dto.type,dto.specialty,null);row=(await c.query('INSERT INTO personal.persona(nombres,apellidos,tipo,especialidad,area_id,telefono,dui) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,version',[dto.givenNames.trim(),dto.surnames.trim(),dto.type,specialty,dto.areaId||null,dto.phone||null,dto.dui?.replace('-','')||null])).rows[0];}
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
    // Ventana alrededor de hoy, no "los 300 más lejanos": con la planificación a dos semanas, un tope fijo ordenado
    // del más futuro al más antiguo dejaba fuera los turnos de hoy (el recién asignado no aparecía y el formulario
    // no veía los conflictos de la jornada).
    const at=this.clock.now(),now=at.valueOf(),canPlan=hasPermission(actor,'turnos.planificar');
    return this.db.transaction(async c=>{
      const policy=await this.policies.value<AttendancePolicy>(c,'turnos.asistencia',at);
      const rows=(await c.query(`SELECT t.id,t.persona_id AS "staffId",p.nombres||' '||p.apellidos AS person,p.tipo AS "staffType",t.area_id AS "areaId",e.nombre AS area,lower(t.periodo) AS start,upper(t.periodo) AS "end",t.tipo AS type,t.estado AS state,t.justificacion AS justification,t.version,
          t.presente_desde AS "presentSince",t.ausencia_tipo AS "absenceType",t.asistencia_motivo AS "attendanceReason",t.excepcion_carga AS "emergencyReason"
        FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id JOIN infra.espacio e ON e.id=t.area_id
        WHERE ($1::uuid IS NULL OR t.persona_id=$1) AND ((NOT $2 AND $3) OR t.estado IN ('publicado','en_curso','completado','ausente'))
          AND t.periodo && tstzrange($4::timestamptz,$5::timestamptz,'[)') ORDER BY lower(t.periodo) DESC LIMIT 3000`,[mine?actor.staffId:null,mine,hasPermission(actor,'turnos.ver_borradores'),new Date(now-SHIFT_WINDOW.pastDays*DAY),new Date(now+SHIFT_WINDOW.futureDays*DAY)])).rows;
      return rows.map(({attendanceReason,emergencyReason,...row})=>this.present(row,now,policy,canPlan,actor.staffId,{attendanceReason,emergencyReason}));
    });
  }
  /** Asistencia derivada y acciones permitidas del turno para quien consulta (ASIS-01, MA-TUR-03). */
  private present(row:any,now:number,policy:AttendancePolicy,canPlan:boolean,staffId:string|null,planner:Record<string,unknown>){
    const shift={state:row.state as string,start:new Date(row.start).valueOf(),end:new Date(row.end).valueOf(),presentSince:row.presentSince?new Date(row.presentSince).valueOf():null};
    return {...row,attendance:attendanceOf(shift,now,policy),late:isLate(shift,policy),...(canPlan?planner:{}),allowedActions:allowedActions(shift,now,policy,canPlan,!!staffId&&staffId===row.staffId)};
  }
  /** Obs. 2/9: opciones reales para filtrar y asignar turnos; no depende de los turnos cargados ni de `personal.ver`/`espacios.ver`. Sin DUI, teléfono ni números de junta. */
  async shiftCatalog() {
    const [areas,staff]=await Promise.all([
      this.db.query(`SELECT id,padre_id AS "parentId",tipo AS type,codigo AS code,nombre AS name FROM infra.espacio WHERE activo AND tipo IN ('area','planta','consultorio','hospital') ORDER BY nombre`),
      this.db.query<{type:string}>(`SELECT p.id,p.nombres||' '||p.apellidos AS name,p.tipo AS type,p.especialidad AS specialty,p.area_id AS "areaId",e.nombre AS area,COALESCE((SELECT json_agg(json_build_object('validFrom',lower(i.vigencia)::text,'validTo',(upper(i.vigencia)-1)::text) ORDER BY lower(i.vigencia)) FROM personal.inscripcion i WHERE i.persona_id=p.id),'[]'::json) AS registrations FROM personal.persona p LEFT JOIN infra.espacio e ON e.id=p.area_id WHERE p.activo ORDER BY p.apellidos,p.nombres`),
    ]);
    const roles=[...new Set(staff.map(p=>p.type))].map(code=>({code,name:STAFF_TYPE_NAMES[code]??code})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
    return {roles,areas,staff};
  }
  /** Citas vivas de un médico dentro de un horario (MA-TUR-05, ASIS-02). Sin datos del paciente. */
  private async appointmentsIn(c:PoolClient,staffId:string,start:Date,end:Date,keep?:{start:Date;end:Date}) {
    return (await c.query(`SELECT id,lower(horario) AS start,upper(horario) AS "end",estado AS state FROM atencion.cita
      WHERE medico_id=$1 AND estado IN ('solicitada','confirmada') AND horario && tstzrange($2::timestamptz,$3::timestamptz,'[)')
        AND ($4::timestamptz IS NULL OR NOT tstzrange($4::timestamptz,$5::timestamptz,'[)') @> horario) ORDER BY lower(horario)`,[staffId,start,end,keep?.start??null,keep?.end??null])).rows;
  }
  private conflictWithAppointments(rows:{id:string;start:Date;end:Date;state:string}[]) {
    return new ProblemException('turno_con_citas',409,`El médico tiene ${rows.length===1?'una cita':`${rows.length} citas`} en ese horario; reprográmalas o cancélalas desde Citas antes de cambiar el turno.`,'start',{citas:rows});
  }
  async saveShift(actor:Actor,id:string|null,dto:ShiftDto,key?:string) {
    const start=new Date(dto.start),end=new Date(dto.end);
    if(!/(Z|[+-]\d\d:\d\d)$/.test(dto.start)||!/(Z|[+-]\d\d:\d\d)$/.test(dto.end)||!Number.isFinite(start.valueOf())||end<=start)throw new BadRequestException('Indica inicio y fin con zona horaria.');
    // MA-TUR-01 / CARGA-05: un turno nace publicado y pasa por todas las validaciones; `state` solo cancela uno existente.
    if(!id&&dto.state)throw new BadRequestException('Un turno nuevo se crea publicado; para cancelarlo, edítalo después de crearlo.');
    const at=this.clock.now(),cancelling=dto.state==='cancelado';
    return this.commands.run(actor,`turnos.planificar:${id??'nuevo'}`,key,dto,async c=>{
      let old:any=null;
      if(id){
        old=(await c.query('SELECT t.version,t.estado,t.persona_id,t.area_id,lower(t.periodo) AS start,upper(t.periodo) AS "end",t.tipo,p.tipo AS staff_type FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE t.id=$1 FOR UPDATE OF t',[id])).rows[0];
        if(!old)throw new NotFoundException('No se encontró el turno.');
        if(old.version!==dto.version)throw new VersionConflictException(old.version,'El turno cambió; actualiza la planificación.');
        if(!dto.reason||dto.reason.trim().length<10)throw new BadRequestException('Indica el motivo del cambio.');
        // MA-TUR-03: un turno que ya empezó, terminó, se canceló o tiene ausencia no se mueve ni se cancela.
        if(!['publicado','borrador'].includes(old.estado)||new Date(old.start)<=at)throw new ProblemException('turno_iniciado',409,'El turno ya empezó o ya no está vigente; no se puede mover ni cancelar.','start');
      }
      if(cancelling){
        // Cancelar solo cambia el estado; nunca mueve el turno a la vez (CARGA-05).
        if(old.staff_type==='medico'){const rows=await this.appointmentsIn(c,old.persona_id,new Date(old.start),new Date(old.end));if(rows.length)throw this.conflictWithAppointments(rows);}
        const row=(await dbRule(c.query("UPDATE personal.turno SET estado='cancelado',version=version+1 WHERE id=$1 RETURNING id,version",[id]))).rows[0];
        const huecos=await this.gaps(c,new Date(old.start),new Date(old.end),old.area_id);
        await this.commands.audit(c,actor,{action:'turnos.cancelar',entity:'turno',entityId:id!,permission:'turnos.planificar',reason:dto.reason,detail:{huecos:huecos.length}});
        await this.announce(c,'turno.actualizado',[{...row,persona_id:old.persona_id}]);
        return {...row,advertencias:[],huecos};
      }
      const person=(await c.query('SELECT id,tipo,activo FROM personal.persona WHERE id=$1 FOR UPDATE',[dto.staffId])).rows[0];
      if(!person?.activo)throw new BadRequestException('Selecciona personal activo.');
      await this.area(c,dto.areaId);
      // FR-103-10: medicina y enfermería no se programan sin inscripción vigente en la fecha del turno.
      if(['medico','enfermero'].includes(person.tipo)&&!(await c.query('SELECT personal.inscrito($1,$2::date) AS ok',[dto.staffId,businessDate(start)])).rows[0].ok)throw new ProblemException('inscripcion_no_vigente',409,'La persona no tiene una inscripción profesional vigente en la fecha del turno.','staffId');
      const duration=await this.policies.value<{min_horas:number;max_horas:number;max_guardia_medica:number}>(c,'turnos.duracion',start);
      const rest=await this.policies.value<{min_horas:number;tras_guardia_24h:number}>(c,'turnos.descanso',start);
      const load=await this.policies.value<LoadPolicy>(c,'turnos.carga',start);
      const hours=(end.valueOf()-start.valueOf())/HOUR;
      // Las guardias y los turnos nocturnos extendidos pueden cubrir hasta 24 h;
      // la jornada de 24 h no se limita únicamente al rol médico.
      const max=['guardia','nocturno'].includes(dto.type)?duration.max_guardia_medica:duration.max_horas;
      if(hours<duration.min_horas||hours>max)throw new BadRequestException(`La duración permitida es de ${duration.min_horas} a ${max} horas.`);
      const nearby=(await c.query(`SELECT t.id,lower(t.periodo) AS start,upper(t.periodo) AS "end",t.tipo FROM personal.turno t WHERE t.persona_id=$1 AND ${WORKING} AND ($2::uuid IS NULL OR t.id<>$2) AND t.periodo && tstzrange($3::timestamptz-interval '3 days',$4::timestamptz+interval '3 days')`,[dto.staffId,id,start,end])).rows;
      const localLabel=(value:Date)=>new Intl.DateTimeFormat('es-SV',{dateStyle:'medium',timeStyle:'short',timeZone:'America/El_Salvador'}).format(value);
      // RN-13 (MA-TUR-04): 8 h de descanso después de cualquier turno y 12 h después de una guardia de 24 h; tras la
      // guardia de 24 h, además, hasta el fin del día en que termina. Dos noches seguidas con 12 h entre ellas se permiten.
      const restUntil=(a:number,b:number)=>{
        const long=(b-a)/HOUR>=24;
        const until=b+(long?rest.tras_guardia_24h:rest.min_horas)*HOUR;
        return new Date(long?Math.max(until,businessDayRange(businessDate(new Date(b))).end.valueOf()):until);
      };
      for(const other of nearby){
        const a=new Date(other.start).valueOf(),b=new Date(other.end).valueOf();
        if(a<end.valueOf()&&b>start.valueOf())throw new ConflictException('Este horario se traslapa con otro turno de la misma persona.');
        if(b<=start.valueOf()){const until=restUntil(a,b);if(start<until)throw new ProblemException('personal_en_descanso',409,`La persona está en descanso obligatorio hasta ${localLabel(until)} por su turno anterior.`,'staffId',{disponibleDesde:until.toISOString()});}
        if(a>=end.valueOf()){const until=restUntil(start.valueOf(),end.valueOf());if(new Date(a)<until)throw new ProblemException('personal_en_descanso',409,`La persona debe descansar después de este turno; el siguiente horario podrá iniciar desde ${localLabel(until)}.`,'staffId',{disponibleDesde:until.toISOString()});}
      }
      // Un turno por jornada: la jornada de un turno es el día local en que empieza (una noche no ocupa el día siguiente).
      if(nearby.some(other=>businessDate(new Date(other.start))===businessDate(start)))throw new ProblemException('personal_jornada_ocupada',409,`La persona ya tiene un turno asignado para la jornada del ${businessDate(start)}.`,'staffId',{jornada:businessDate(start)});
      // CARGA-01/02: tope de horas en cualquier ventana de 7 días y de días seguidos; solo una emergencia escrita lo supera.
      const emergency=dto.emergencyReason?.trim()||null;
      const span=(await c.query(`SELECT lower(t.periodo) AS start,upper(t.periodo) AS "end" FROM personal.turno t WHERE t.persona_id=$1 AND ${WORKING} AND ($2::uuid IS NULL OR t.id<>$2) AND t.periodo && tstzrange($3::timestamptz-make_interval(days=>$5),$4::timestamptz+make_interval(days=>$5))`,[dto.staffId,id,start,end,Math.max(8,load.max_dias_seguidos+1)])).rows.map(o=>[new Date(o.start).valueOf(),new Date(o.end).valueOf()] as [number,number]);
      const rolling=maxRollingHours([...span,[start.valueOf(),end.valueOf()]]);
      const days=consecutiveDays(new Set([...span.map(([a])=>businessDate(new Date(a))),businessDate(start)]),businessDate(start));
      if(!emergency&&rolling.hours>load.max_horas_7_dias)throw new ProblemException('carga_semanal_excedida',409,`La persona sumaría ${rolling.hours} h en 7 días, más del tope de ${load.max_horas_7_dias} h. Solo en una emergencia se asigna, indicando el motivo de la excepción.`,'emergencyReason',{horas7Dias:rolling.hours,limite:load.max_horas_7_dias});
      if(!emergency&&days>load.max_dias_seguidos)throw new ProblemException('dias_seguidos_excedidos',409,`La persona trabajaría ${days} días seguidos, más del máximo de ${load.max_dias_seguidos}. Solo en una emergencia se asigna, indicando el motivo de la excepción.`,'emergencyReason',{diasSeguidos:days,limite:load.max_dias_seguidos});
      // FR-103-07 / RN-14: aviso, no bloqueo, de más de 44 h diurnas por semana (lunes a domingo, 06:00-22:00 local); excederlas exige justificación.
      const warnings:{codigo:string;horasSemana:number;limite:number}[]=[];
      const limit=(await this.policies.value<{aviso_diurnas:number}>(c,'turnos.horas_semanales',start)).aviso_diurnas;
      const first=weekStart(start).valueOf(),last=weekStart(new Date(end.valueOf()-1)).valueOf()+7*DAY;
      const others=(await c.query(`SELECT lower(t.periodo) AS start,upper(t.periodo) AS "end" FROM personal.turno t WHERE t.persona_id=$1 AND ${WORKING} AND ($2::uuid IS NULL OR t.id<>$2) AND t.periodo && tstzrange($3::timestamptz,$4::timestamptz)`,[dto.staffId,id,new Date(first),new Date(last)])).rows.map(o=>[new Date(o.start).valueOf(),new Date(o.end).valueOf()]);
      for(let week=first;week<last;week+=7*DAY){
        const within=(a:number,b:number)=>daytimeHours(Math.max(a,week),Math.min(b,week+7*DAY));
        const own=within(start.valueOf(),end.valueOf()),total=Math.round((own+others.reduce((sum,[a,b])=>sum+within(a,b),0))*100)/100;
        if(own>0&&total>limit)warnings.push({codigo:'horas_semanales_excedidas',horasSemana:total,limite:limit});
      }
      if(warnings.length&&(dto.justification?.trim().length??0)<10)throw new ProblemException('horas_semanales_excedidas',409,`La persona suma ${warnings[0].horasSemana} horas diurnas en la semana, más de las ${limit} permitidas sin aviso; indica una justificación de al menos 10 caracteres.`,'justification',{horasSemana:warnings[0].horasSemana,limite:limit});
      let row;
      if(id){
        // MA-TUR-05: mover el turno de un médico no deja citas vivas fuera de su nueva jornada.
        if(old.staff_type==='medico'){const rows=await this.appointmentsIn(c,old.persona_id,new Date(old.start),new Date(old.end),dto.staffId===old.persona_id?{start,end}:undefined);if(rows.length)throw this.conflictWithAppointments(rows);}
        row=(await dbRule(c.query("UPDATE personal.turno SET persona_id=$2,area_id=$3,periodo=tstzrange($4,$5,'[)'),tipo=$6,justificacion=$7,excepcion_carga=$8,version=version+1 WHERE id=$1 RETURNING id,version",[id,dto.staffId,dto.areaId,start,end,dto.type,dto.justification||null,emergency]))).rows[0];
      }else row=(await dbRule(c.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,justificacion,excepcion_carga,estado,publicado_por,publicado_en,creado_por) VALUES($1,$2,tstzrange($3,$4,'[)'),$5,$6,$7,'publicado',$8,$9,$8) RETURNING id,version",[dto.staffId,dto.areaId,start,end,dto.type,dto.justification||null,emergency,actor.id,at]))).rows[0];
      const detail={...(warnings.length?{horasSemana:warnings[0].horasSemana,limite:warnings[0].limite,justificacion:dto.justification!.trim()}:{}),...(emergency?{excepcionCarga:emergency,horas7Dias:rolling.hours,diasSeguidos:days}:{})};
      await this.commands.audit(c,actor,{action:id?'turnos.mover':'turnos.crear',entity:'turno',entityId:row.id,permission:'turnos.planificar',reason:dto.reason,...(Object.keys(detail).length?{detail}:{})});
      const ids=[...new Set([dto.staffId,old?.persona_id].filter(Boolean))];
      const accounts=(await c.query('SELECT id FROM acceso.usuario WHERE persona_personal_id=ANY($1::uuid[])',[ids])).rows;
      await this.commands.event(c,'turno.actualizado','turno',row.id,row.version,['rol:JOP','rol:ADM',...accounts.map(a=>`usuario:${a.id}`)]);
      return {...row,advertencias:warnings};
    });
  }
  /** Turno con bloqueo para marcar asistencia. */
  private async lockedShift(c:PoolClient,id:string) {
    const row=(await c.query('SELECT t.id,t.version,t.estado,t.persona_id,t.area_id,lower(t.periodo) AS start,upper(t.periodo) AS "end",t.presente_desde,p.tipo AS staff_type,p.especialidad FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id WHERE t.id=$1 FOR UPDATE OF t',[id])).rows[0];
    if(!row)throw new NotFoundException('No se encontró el turno.');
    return {...row,start:new Date(row.start),end:new Date(row.end)};
  }
  /** ASIS-02: personal libre de la misma función (y especialidad, si es médico), con descanso e inscripción. */
  private async substitutes(c:PoolClient,shift:{persona_id:string;staff_type:string;especialidad:string|null;start:Date;end:Date}) {
    const rest=await this.policies.value<{min_horas:number}>(c,'turnos.descanso',shift.start);
    return (await c.query(`SELECT p.id,p.nombres||' '||p.apellidos AS name,p.tipo AS type,p.especialidad AS specialty,e.nombre AS area
      FROM personal.persona p LEFT JOIN infra.espacio e ON e.id=p.area_id
      WHERE p.activo AND p.id<>$1 AND p.tipo=$2 AND ($2<>'medico' OR p.especialidad IS NOT DISTINCT FROM $3)
        AND NOT EXISTS(SELECT 1 FROM personal.turno t WHERE t.persona_id=p.id AND ${WORKING} AND t.periodo && tstzrange($4::timestamptz-make_interval(hours=>$6),$5::timestamptz+make_interval(hours=>$6)))
        AND (p.tipo NOT IN ('medico','enfermero') OR personal.inscrito(p.id,$7::date))
      ORDER BY p.apellidos,p.nombres LIMIT 10`,[shift.persona_id,shift.staff_type,shift.especialidad,shift.start,shift.end,rest.min_horas,businessDate(shift.start)])).rows;
  }
  private async attendanceResult(c:PoolClient,row:{id:string;version:number;estado:string;presente_desde:Date|null},shift:{start:Date;end:Date},extra:{affectedAppointments?:unknown[];substitutes?:unknown[]}={}) {
    const now=this.clock.now(),policy=await this.policies.value<AttendancePolicy>(c,'turnos.asistencia',now);
    const view={state:row.estado,start:shift.start.valueOf(),end:shift.end.valueOf(),presentSince:row.presente_desde?new Date(row.presente_desde).valueOf():null};
    return {id:row.id,version:row.version,state:row.estado,attendance:attendanceOf(view,now.valueOf(),policy),late:isLate(view,policy),affectedAppointments:extra.affectedAppointments??[],substitutes:extra.substitutes??[]};
  }
  /** ASIS-01 a ASIS-03: JOP marca la entrada, la ausencia (justificada o no, con motivo) o deshace una marca equivocada. */
  async attendance(actor:Actor,id:string,dto:AttendanceDto,key?:string) {
    const reason=dto.reason?.trim()||null;
    if(dto.state!=='presente'&&(reason?.length??0)<10)throw new BadRequestException(dto.state==='ausente'?'Indica el motivo de la ausencia, de al menos 10 caracteres.':'Indica por qué deshaces la marca, con al menos 10 caracteres.');
    if(dto.state==='ausente'&&!dto.absenceType)throw new BadRequestException('Indica si la ausencia es justificada o injustificada.');
    if(dto.at&&!/(Z|[+-]\d\d:\d\d)$/.test(dto.at))throw new BadRequestException('Indica la hora de entrada con zona horaria.');
    return this.commands.run(actor,`turnos.planificar:${id}:asistencia`,key,dto,async c=>{
      const now=this.clock.now(),shift=await this.lockedShift(c,id);
      if(shift.version!==dto.version)throw new VersionConflictException(shift.version,'El turno cambió; actualiza la planificación.');
      const policy=await this.policies.value<AttendancePolicy>(c,'turnos.asistencia',now);
      const early=new Date(shift.start.valueOf()-policy.entrada_anticipada_minutos*60_000);
      let row,extra={};
      if(dto.state==='presente'){
        if(!['publicado','en_curso','completado','ausente'].includes(shift.estado))throw new ProblemException('transicion_invalida',409,'Este turno no admite marcar la entrada.');
        if(shift.presente_desde)throw new ProblemException('asistencia_ya_marcada',409,'La entrada de este turno ya está marcada.');
        if(!dto.at&&now>=shift.end)throw new BadRequestException('El turno ya terminó; indica la hora de entrada.');
        const at=dto.at?new Date(dto.at):now;
        if(!Number.isFinite(at.valueOf())||at<early||at>=shift.end||at>now)throw new BadRequestException('La hora de entrada debe caer dentro del turno y no ser futura.');
        const state=shift.estado==='ausente'?stateByClock(shift.start.valueOf(),shift.end.valueOf(),now.valueOf()):shift.estado;
        row=(await dbRule(c.query('UPDATE personal.turno SET estado=$2,presente_desde=$3,ausencia_tipo=NULL,asistencia_motivo=$4,asistencia_por=$5,asistencia_en=$6,version=version+1 WHERE id=$1 RETURNING id,version,estado,presente_desde',[id,state,at,reason,actor.id,now]))).rows[0];
      }else if(dto.state==='ausente'){
        if(!['publicado','en_curso','completado'].includes(shift.estado))throw new ProblemException('transicion_invalida',409,'Este turno no admite marcar ausencia.');
        if(shift.presente_desde)throw new ProblemException('asistencia_ya_marcada',409,'La persona ya marcó su entrada; deshaz la entrada antes de marcar la ausencia.');
        row=(await dbRule(c.query("UPDATE personal.turno SET estado='ausente',ausencia_tipo=$2,asistencia_motivo=$3,asistencia_por=$4,asistencia_en=$5,version=version+1 WHERE id=$1 RETURNING id,version,estado,presente_desde",[id,dto.absenceType,reason,actor.id,now]))).rows[0];
        // ASIS-02: lo que hay que resolver y quién podría cubrir.
        const from=new Date(Math.max(now.valueOf(),shift.start.valueOf()));
        extra={affectedAppointments:shift.staff_type==='medico'&&from<shift.end?await this.appointmentsIn(c,shift.persona_id,from,shift.end):[],substitutes:now<shift.end?await this.substitutes(c,shift):[]};
      }else{
        if(shift.estado!=='ausente'&&!shift.presente_desde)throw new ProblemException('sin_asistencia_marcada',409,'Este turno no tiene entrada ni ausencia que deshacer.');
        const state=shift.estado==='ausente'?stateByClock(shift.start.valueOf(),shift.end.valueOf(),now.valueOf()):shift.estado;
        row=(await dbRule(c.query('UPDATE personal.turno SET estado=$2,presente_desde=NULL,ausencia_tipo=NULL,asistencia_motivo=NULL,asistencia_por=$3,asistencia_en=$4,version=version+1 WHERE id=$1 RETURNING id,version,estado,presente_desde',[id,state,actor.id,now]))).rows[0];
      }
      await this.commands.audit(c,actor,{action:'turnos.asistencia',entity:'turno',entityId:id,permission:'turnos.planificar',reason:reason??undefined,detail:{asistencia:dto.state,tipoAusencia:dto.absenceType??null,presenteDesde:row.presente_desde?new Date(row.presente_desde).toISOString():null}});
      await this.announce(c,'turno.actualizado',[{...row,persona_id:shift.persona_id}]);
      return this.attendanceResult(c,row,shift,extra);
    });
  }
  /** ASIS-01: la persona marca su propia entrada, desde poco antes del inicio hasta el fin del turno. */
  async checkIn(actor:Actor,id:string,dto:CheckInDto,key?:string) {
    if(!actor.staffId)throw new ProblemException('sin_ficha_personal',403,'Tu cuenta no está vinculada a una ficha de personal.');
    return this.commands.run(actor,`turnos.ver:${id}:entrada`,key,dto,async c=>{
      const now=this.clock.now(),shift=await this.lockedShift(c,id);
      if(shift.persona_id!==actor.staffId)throw new ProblemException('turno_ajeno',403,'Solo puedes marcar la entrada de tus propios turnos.');
      if(shift.version!==dto.version)throw new VersionConflictException(shift.version,'El turno cambió; actualiza tus turnos.');
      const policy=await this.policies.value<AttendancePolicy>(c,'turnos.asistencia',now);
      if(!['publicado','en_curso'].includes(shift.estado))throw new ProblemException('transicion_invalida',409,shift.estado==='ausente'?'Tu turno está marcado como ausencia; comunícate con la jefatura de operaciones.':'Este turno ya no admite marcar la entrada.');
      if(shift.presente_desde)throw new ProblemException('asistencia_ya_marcada',409,'Ya marcaste la entrada de este turno.');
      if(now.valueOf()<shift.start.valueOf()-policy.entrada_anticipada_minutos*60_000||now>=shift.end)throw new ProblemException('fuera_de_horario',409,`Puedes marcar la entrada desde ${policy.entrada_anticipada_minutos} minutos antes del inicio y hasta el fin del turno.`);
      const row=(await dbRule(c.query('UPDATE personal.turno SET presente_desde=$2,asistencia_por=$3,asistencia_en=$2,version=version+1 WHERE id=$1 RETURNING id,version,estado,presente_desde',[id,now,actor.id]))).rows[0];
      await this.commands.audit(c,actor,{action:'turnos.entrada',entity:'turno',entityId:id,permission:'turnos.ver',detail:{presenteDesde:now.toISOString()}});
      await this.announce(c,'turno.actualizado',[{...row,persona_id:shift.persona_id}]);
      return this.attendanceResult(c,row,shift);
    });
  }
  /** CARGA-04: médicos de turno por día y especialidad durante 7 días desde `from` (información pública, RN-17: sin contacto). */
  async specialists(from:string) {
    let start:Date;
    try{if(!/^\d{4}-\d{2}-\d{2}$/.test(from))throw new RangeError();start=businessDayRange(from).start;}catch{throw new BadRequestException('Indica el primer día con formato AAAA-MM-DD.');}
    const end=new Date(start.valueOf()+7*DAY),to=businessDate(new Date(end.valueOf()-1));
    return this.db.transaction(async c=>{
      const now=this.clock.now(),policy=await this.policies.value<AttendancePolicy>(c,'turnos.asistencia',now);
      const rows=(await c.query(`SELECT coalesce(p.especialidad,'Medicina general') AS specialty,p.nombres||' '||p.apellidos AS name,e.nombre AS area,lower(t.periodo) AS start,upper(t.periodo) AS "end",t.estado AS state,t.presente_desde AS "presentSince"
        FROM personal.turno t JOIN personal.persona p ON p.id=t.persona_id JOIN infra.espacio e ON e.id=t.area_id
        WHERE p.tipo='medico' AND p.activo AND t.estado IN ('publicado','en_curso','completado','ausente') AND t.periodo && tstzrange($1::timestamptz,$2::timestamptz,'[)')
        ORDER BY lower(t.periodo),1,2`,[start,end])).rows;
      const items=rows.map(r=>{
        const s=new Date(r.start),shift={state:r.state,start:s.valueOf(),end:new Date(r.end).valueOf(),presentSince:r.presentSince?new Date(r.presentSince).valueOf():null};
        return {date:businessDate(s<start?start:s),specialty:r.specialty,name:r.name,area:r.area,start:s.toISOString(),end:new Date(r.end).toISOString(),attendance:attendanceOf(shift,now.valueOf(),policy)};
      });
      return {from,to,items};
    });
  }
}
