import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { VersionConflictException } from '../platform/problem';
import { Actor, hasPermission } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { CommandService, fingerprint } from '../platform/command.service';
import { Clock } from '../platform/clock';
import { PatientCreateDto, PatientUpdateDto, PatientStateDto } from './patient-write.dto';
import { ageOn, ageRange, fichaFields } from './patient.privacy';
import { DuplicateKey, birthPrecision, canonicalPair, isPossibleDuplicate, matchReasons, normalize, phonetic, recordNumber, validateDemographics } from './patient.rules';
type Row = Record<string, any>;
@Injectable()
export class PatientsService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}
  private async candidates(c: PoolClient, query: string, limit: number, state?: string) {
    const words=normalize(query).split(' ').filter(Boolean).map(t=>`%${t}%`);
    const sounds=phonetic(query).split(' ').filter(Boolean).map(t=>`%${t}%`);
    const rows=(await c.query(`SELECT p.id,p.expediente,p.estado,p.nombres,p.primer_apellido,p.segundo_apellido,p.alias_provisional,p.sexo,p.nacimiento::text AS nacimiento,p.version,p.busqueda_normalizada,i.valor_original AS dui FROM pacientes.paciente p
      LEFT JOIN LATERAL (SELECT valor_original FROM pacientes.identificador WHERE paciente_id=p.id AND tipo='dui' AND estado IN ('sin_verificar','verificado') LIMIT 1) i ON true
      WHERE ($1::text[]='{}' OR p.busqueda_normalizada LIKE ALL($1) OR (p.fon_apellido||' '||p.fon_nombres) LIKE ALL($2)
        OR p.expediente ILIKE $3 OR regexp_replace(coalesce(i.valor_original,''),'[^0-9]','','g') LIKE $4 OR p.nacimiento::text=$5)
      AND ($6::text IS NULL OR p.estado=$6) ORDER BY p.nombres,p.primer_apellido,p.id LIMIT $7`,[words,sounds,`%${query.trim()}%`,query.replace(/\D/g,'').length>=4?`%${query.replace(/\D/g,'')}%`:'!no-document!',query,state??null,limit])).rows;
    return rows.map(p=>({ id:p.id, record:p.expediente, fullName:this.name(p), givenNames:p.nombres??p.alias_provisional??'', surnames:[p.primer_apellido,p.segundo_apellido].filter(Boolean).join(' '), state:p.estado, active:p.estado!=='inactivo', sex:p.sexo, birth:p.nacimiento, version:p.version, matchReason:matchReasons({query,fullName:this.name(p),record:p.expediente,dui:p.dui,birth:p.nacimiento}).join(', ') }));
  }
  private name(p:Row) { return [p.nombres,p.primer_apellido,p.segundo_apellido].filter(Boolean).join(' ')||p.alias_provisional; }
  async search(actor:Actor, query:string|undefined, limit=50, state?:string) {
    return this.db.transaction(async c=>{
      const result=await this.candidates(c,query??'',limit,state);
      await this.commands.audit(c,actor,{action:'pacientes.buscar',entity:'paciente',permission:'pacientes.buscar',detail:{queryHash:fingerprint(normalize(query??'')),count:result.length}});
      return actor.roles.includes('JOP')&&!actor.roles.some(r=>['REC','AST','ENF','MED','LAB','PAR'].includes(r))?result.map(({birth,...p})=>p):result;
    });
  }
  async recordSearch(actor:Actor, query:string) {
    if(normalize(query).replace(/ /g,'').length<2)throw new BadRequestException('Escribe al menos dos letras o números.');
    return this.db.transaction(async c=>{
      const candidates=await this.candidates(c,query,50);
      const row=(await c.query('INSERT INTO pacientes.busqueda_registro(usuario_id,huella_criterios,resultados,vence_en,creado_en) VALUES($1,$2,$3,$4,$5) RETURNING token,vence_en',[actor.id,fingerprint(normalize(query)),candidates.length,new Date(this.clock.now().valueOf()+600000),this.clock.now()])).rows[0];
      await this.commands.audit(c,actor,{action:'pacientes.buscar',entity:'paciente',permission:'pacientes.buscar',detail:{queryHash:fingerprint(normalize(query)),count:candidates.length}});
      return {token:row.token,expiresAt:row.vence_en,candidates:actor.roles.includes('JOP')&&!actor.roles.some(r=>['REC','AST','ENF','MED','LAB','PAR'].includes(r))?candidates.map(({birth,...p})=>p):candidates};
    });
  }
  private async permitted(c:PoolClient,actor:Actor,id:string) {
    if(!hasPermission(actor,'pacientes.ver_ficha'))throw new ForbiddenException('No puedes consultar esta ficha.');
    const contexts=actor.permissions.filter(p=>p.code==='pacientes.ver_ficha').map(p=>p.context);
    if(contexts.includes('x') || (contexts.includes('propio') && actor.patientId===id))return;
    if(contexts.includes('area') && await this.inArea(c,actor,id))return;
    if(contexts.includes('orden') && await this.hasOpenOrder(c,id))return;
    if(contexts.includes('relacion') && actor.staffId){
      const linked=(await c.query(`SELECT 1 FROM atencion.relacion_atencion WHERE paciente_id=$1 AND profesional_id=$2 AND vigencia @> $3::timestamptz
        UNION ALL SELECT 1 FROM atencion.consulta WHERE paciente_id=$1 AND medico_id=$2 AND estado='abierta'
        UNION ALL SELECT 1 FROM hospitalizacion.admision WHERE paciente_id=$1 AND medico_tratante_id=$2 AND estado IN ('pendiente_cama','hospitalizado','alta_firmada')
        UNION ALL SELECT 1 FROM ambulancia.servicio s JOIN ambulancia.tripulacion t ON t.servicio_id=s.id WHERE s.paciente_id=$1 AND t.persona_id=$2 AND (s.finalizado_en IS NULL OR s.finalizado_en>$3::timestamptz-interval '24 hours') LIMIT 1`,[id,actor.staffId,this.clock.now()])).rows;
      if(linked.length)return;
    }
    throw new ForbiddenException('La ficha requiere una relación de atención o ser su titular.');
  }
  /** Contexto `orden` (laboratorio): el paciente tiene una orden pendiente o en proceso. */
  private async hasOpenOrder(c:PoolClient,id:string) {
    return (await c.query("SELECT 1 FROM laboratorio.orden WHERE paciente_id=$1 AND estado IN ('pendiente','en_proceso') LIMIT 1",[id])).rows.length>0;
  }
  /**
   * Contexto `area` (el mismo que usa camas.ver_ocupante): la persona tiene un turno en curso en un área y el paciente está ahí, sea
   * hospitalizado en una cama de esa área, con un número llamado hoy a un consultorio de ella o con una consulta abierta en él.
   */
  private async inArea(c:PoolClient,actor:Actor,id:string) {
    if(!actor.staffId)return false;
    const now=this.clock.now();
    const areas=(await c.query("SELECT area_id FROM personal.turno WHERE persona_id=$1 AND estado IN ('publicado','en_curso') AND periodo @> $2::timestamptz",[actor.staffId,now])).rows.map(r=>r.area_id);
    if(!areas.length)return false;
    const inside=(space:string)=>`EXISTS(WITH RECURSIVE up AS (SELECT id,padre_id FROM infra.espacio WHERE id=${space} UNION ALL SELECT e.id,e.padre_id FROM infra.espacio e JOIN up ON e.id=up.padre_id) SELECT 1 FROM up WHERE id=ANY($2::uuid[]))`;
    return (await c.query(`SELECT 1 FROM hospitalizacion.admision a JOIN hospitalizacion.ocupacion_cama o ON o.admision_id=a.id WHERE a.paciente_id=$1 AND a.estado IN ('hospitalizado','alta_firmada') AND o.periodo @> $3::timestamptz AND ${inside('o.habitacion_id')}
      UNION ALL SELECT 1 FROM atencion.ticket_fila t WHERE t.paciente_id=$1 AND t.fecha=($3::timestamptz AT TIME ZONE 'America/El_Salvador')::date AND t.estado IN ('llamado','en_atencion') AND t.consultorio_id IS NOT NULL AND ${inside('t.consultorio_id')}
      UNION ALL SELECT 1 FROM atencion.consulta k WHERE k.paciente_id=$1 AND k.estado='abierta' AND k.consultorio_id IS NOT NULL AND ${inside('k.consultorio_id')} LIMIT 1`,[id,areas,now])).rows.length>0;
  }
  /** Edad en años hoy (America/El_Salvador): por fecha de nacimiento o, en provisionales, la edad estimada más los años desde que se estimó. */
  private age(p:Row):number|null {
    const day=(d:Date)=>d.toLocaleDateString('en-CA',{timeZone:'America/El_Salvador'});
    const text=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):v?String(v).slice(0,10):null;
    const today=day(this.clock.now()),birth=text(p.nacimiento);
    if(birth)return ageOn(birth,today);
    return p.edad_estimada===null||p.edad_estimada===undefined||!p.edad_estimada_en?null:p.edad_estimada+ageOn(day(new Date(p.edad_estimada_en)),today);
  }
  private async detail(c:PoolClient,actor:Actor,id:string) {
    await this.permitted(c,actor,id);
    const p=(await c.query('SELECT * FROM pacientes.paciente WHERE id=$1',[id])).rows[0];
    if(!p)throw new NotFoundException('No se encontró el paciente.');
    const fields=fichaFields(actor.roles,actor.patientId===id);
    const result:Row={id:p.id,record:p.expediente,fullName:this.name(p),givenNames:p.nombres??'',surnames:[p.primer_apellido,p.segundo_apellido].filter(Boolean).join(' '),state:p.estado,active:p.estado!=='inactivo',sex:p.sexo,version:p.version,provisional:p.estado==='provisional'};
    if(fields.birth){result.birth=p.nacimiento instanceof Date?p.nacimiento.toISOString().slice(0,10):p.nacimiento;result.birthPrecision=p.precision_nacimiento;}
    if(fields.ageRange)result.ageRange=ageRange(this.age(p));
    if(fields.contact){
      const dui=(await c.query("SELECT valor_original FROM pacientes.identificador WHERE paciente_id=$1 AND tipo='dui' AND estado IN ('sin_verificar','verificado')",[id])).rows[0];
      Object.assign(result,{dui:dui?.valor_original??null,phone:p.telefono,email:p.correo,address:p.direccion});
    }    if(hasPermission(actor,'pacientes.editar_demograficos'))result.history=(await c.query('SELECT version,cambiado_en AS at,motivo AS reason,cambios AS changes FROM pacientes.historial_demografico WHERE paciente_id=$1 ORDER BY version DESC',[id])).rows;
    return result;
  }
  async get(actor:Actor,id:string) {
    return this.db.transaction(async c=>{const result=await this.detail(c,actor,id);await this.commands.audit(c,actor,{action:'pacientes.ver_ficha',entity:'paciente',entityId:id,patientId:id,permission:'pacientes.ver_ficha'});return result;});
  }
  private async duplicate(c:PoolClient,dui:string|null|undefined,id?:string) {
    if(!dui)return;
    const row=(await c.query(`SELECT p.expediente FROM pacientes.identificador i JOIN pacientes.paciente p ON p.id=i.paciente_id WHERE i.tipo='dui' AND i.valor_normalizado=$1 AND i.estado IN ('sin_verificar','verificado') AND ($2::uuid IS NULL OR p.id<>$2)`,[dui,id??null])).rows[0];
    if(row)throw new ConflictException(`Ese DUI pertenece al expediente ${row.expediente}, incluso si está inactivo.`);
  }
  async create(actor:Actor,dto:PatientCreateDto,key?:string) {
    const data=validateDemographics(dto,this.clock.now());
    const permission=data.provisional?'pacientes.registrar_provisional':'pacientes.registrar';
    if(!hasPermission(actor,permission))throw new ForbiddenException('No tienes permiso para registrar este tipo de paciente.');
    return this.commands.run(actor,permission,key,dto,async c=>{
      const token=(await c.query('DELETE FROM pacientes.busqueda_registro WHERE token=$1 AND usuario_id=$2 AND vence_en>$3 RETURNING *',[dto.searchToken,actor.id,this.clock.now()])).rows[0];
      if(!token||token.huella_criterios!==fingerprint(normalize(dto.searchQuery)))throw new BadRequestException('La búsqueda no corresponde a esta cuenta, cambió o venció. Busca otra vez.');
      const text=normalize(`${data.givenNames} ${data.surnames} ${data.dui??''} ${data.birth??''}`);
      const sound=phonetic(text);
      if(!data.provisional&&!normalize(dto.searchQuery).split(' ').every(t=>text.includes(t)||sound.includes(phonetic(t))))throw new BadRequestException('La búsqueda previa debe corresponder a los datos que vas a registrar.');
      await this.duplicate(c,data.dui);
      const seq=(await c.query("SELECT nextval('pacientes.expediente_seq') AS n")).rows[0].n;
      const alias=data.provisional?(await c.query("SELECT 'NN-'||extract(year from $1::timestamptz)::int||'-'||lpad(nextval('pacientes.provisional_seq')::text,4,'0') AS alias",[this.clock.now()])).rows[0].alias:null;
      const row=(await c.query(`INSERT INTO pacientes.paciente(expediente,estado,nombres,primer_apellido,sexo,nacimiento,precision_nacimiento,telefono,correo,direccion,creado_por,busqueda_normalizada,fon_apellido,fon_nombres,alias_provisional,edad_estimada,edad_estimada_en,senas)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id,version`,[recordNumber(seq),data.provisional?'provisional':'activo',data.givenNames||null,data.surnames||null,data.sex,data.birth,data.provisional?'estimada':data.birth?'exacta':'desconocida',data.phone,data.email||null,data.address||null,actor.id,text,phonetic(data.surnames),phonetic(data.givenNames),alias,data.provisional?data.estimatedAge:null,data.provisional?this.clock.now():null,data.provisional?data.description:null])).rows[0];
      if(data.dui)await c.query("INSERT INTO pacientes.identificador(paciente_id,tipo,emisor,valor_original,valor_normalizado,exclusivo) VALUES($1,'dui','RNPN',$2,$3,true)",[row.id,`${data.dui.slice(0,8)}-${data.dui[8]}`,data.dui]);
      await this.commands.audit(c,actor,{action:'pacientes.registrar',entity:'paciente',entityId:row.id,patientId:row.id,permission});
      await this.commands.event(c,'paciente.creado','paciente',row.id,1,['rol:REC','rol:JOP']);
      await this.openDuplicateCases(c,actor,{id:row.id,fonApellido:phonetic(data.surnames),fonNombres:phonetic(data.givenNames),nacimiento:data.birth});
      return {id:row.id,record:recordNumber(seq),version:1};
    });
  }
  /** FR-102-09: un registro parecido abre caso para revisión; nunca fusiona ni impide el registro. */
  private async openDuplicateCases(c:PoolClient,actor:Actor,created:DuplicateKey) {
    if(!created.nacimiento)return;
    const similar=(await c.query('SELECT id,fon_apellido AS "fonApellido",fon_nombres AS "fonNombres",nacimiento::text AS nacimiento FROM pacientes.paciente WHERE id<>$1 AND fon_apellido=$2 AND fon_nombres=$3 AND nacimiento=$4 ORDER BY id',[created.id,created.fonApellido,created.fonNombres,created.nacimiento])).rows as DuplicateKey[];
    for(const other of similar.filter(o=>isPossibleDuplicate(created,o))){
      const opened=(await c.query("INSERT INTO pacientes.caso_duplicado(pacientes_ids,motivo,abierto_por,abierto_en) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",[canonicalPair(created.id,other.id),'Mismo apellido y nombres fonéticos y misma fecha de nacimiento.',actor.id,this.clock.now()])).rows[0];
      if(!opened)continue;
      await this.commands.audit(c,actor,{action:'pacientes.caso_duplicado.abrir',entity:'caso_duplicado',entityId:opened.id,permission:'pacientes.registrar'});
      await this.commands.event(c,'caso_duplicado.abierto','caso_duplicado',opened.id,1,['rol:REC']);
    }
  }
  async duplicateCases(actor:Actor,limit=50) {
    return this.db.transaction(async c=>{
      const rows=(await c.query(`SELECT d.id,d.estado,d.motivo,d.abierto_en,
        (SELECT json_agg(json_build_object('id',p.id,'record',p.expediente,'fullName',coalesce(nullif(concat_ws(' ',p.nombres,p.primer_apellido,p.segundo_apellido),''),p.alias_provisional)) ORDER BY p.id) FROM pacientes.paciente p WHERE p.id=ANY(d.pacientes_ids)) AS patients
        FROM pacientes.caso_duplicado d WHERE d.estado IN ('sospechado','en_revision') ORDER BY d.abierto_en DESC,d.id LIMIT $1`,[limit])).rows;
      await this.commands.audit(c,actor,{action:'pacientes.casos_duplicado',entity:'caso_duplicado',permission:'pacientes.gestionar_duplicados',detail:{count:rows.length}});
      return rows.map(r=>({id:r.id,state:r.estado,reason:r.motivo,openedAt:r.abierto_en,patients:r.patients}));
    });
  }
  async update(actor:Actor,id:string,dto:PatientUpdateDto,key?:string) {
    const data=validateDemographics(dto,this.clock.now());
    return this.commands.run(actor,`pacientes.editar_demograficos:${id}`,key,dto,async c=>{
      const old=(await c.query('SELECT *,nacimiento::text AS nacimiento_texto FROM pacientes.paciente WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!old)throw new NotFoundException('No se encontró el paciente.');
      if(old.version!==dto.version)throw new VersionConflictException(old.version,'La ficha cambió. Vuelve a abrirla antes de guardar.');
      await this.duplicate(c,data.dui,id);
      const row=(await c.query(`UPDATE pacientes.paciente SET nombres=$2,primer_apellido=$3,segundo_apellido=NULL,sexo=$4,nacimiento=$5,precision_nacimiento=$6,telefono=$7,correo=$8,direccion=$9,busqueda_normalizada=$10,fon_apellido=$11,fon_nombres=$12,version=version+1 WHERE id=$1 RETURNING *`,[id,data.givenNames,data.surnames,data.sex,data.birth,birthPrecision({birth:old.nacimiento_texto,precision:old.precision_nacimiento},data.birth??null),data.phone,data.email||null,data.address||null,normalize(`${data.givenNames} ${data.surnames} ${data.dui??''} ${data.birth??''}`),phonetic(data.surnames),phonetic(data.givenNames)])).rows[0];
      const previous=(await c.query("SELECT valor_original FROM pacientes.identificador WHERE paciente_id=$1 AND tipo='dui' AND estado IN ('sin_verificar','verificado')",[id])).rows[0]?.valor_original??null;
      await c.query("UPDATE pacientes.identificador SET estado='retirado' WHERE paciente_id=$1 AND tipo='dui' AND estado IN ('sin_verificar','verificado')",[id]);
      if(data.dui)await c.query("INSERT INTO pacientes.identificador(paciente_id,tipo,emisor,valor_original,valor_normalizado,exclusivo) VALUES($1,'dui','RNPN',$2,$3,true)",[id,`${data.dui.slice(0,8)}-${data.dui[8]}`,data.dui]);
      const changes:Row={};for(const field of ['nombres','primer_apellido','segundo_apellido','sexo','nacimiento','precision_nacimiento','telefono','correo','direccion'])if(String(old[field]??'')!==String(row[field]??''))changes[field]={before:old[field],after:row[field]};
      if((previous?.replace('-','')??null)!==data.dui)changes.dui={before:previous,after:data.dui};
      await c.query('INSERT INTO pacientes.historial_demografico(paciente_id,version,actor_id,motivo,cambios) VALUES($1,$2,$3,$4,$5)',[id,row.version,actor.id,dto.reason,changes]);
      await this.commands.audit(c,actor,{action:'pacientes.editar',entity:'paciente',entityId:id,patientId:id,permission:'pacientes.editar_demograficos',detail:{fields:Object.keys(changes)}});
      await this.commands.event(c,'paciente.actualizado','paciente',id,row.version,['rol:REC',`usuario:${actor.id}`]);
      return {id,version:row.version};
    });
  }
  async setState(actor:Actor,id:string,dto:PatientStateDto,key?:string) {
    return this.commands.run(actor,`pacientes.editar_demograficos:${id}:estado`,key,dto,async c=>{
      const old=(await c.query('SELECT estado,version FROM pacientes.paciente WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!old)throw new NotFoundException('No se encontró el paciente.');
      if(old.version!==dto.version)throw new VersionConflictException(old.version,'La ficha cambió. Vuelve a abrirla.');
      const state=dto.active?'activo':'inactivo';
      await c.query('UPDATE pacientes.paciente SET estado=$2,version=version+1 WHERE id=$1',[id,state]);
      await c.query('INSERT INTO pacientes.historial_demografico(paciente_id,version,actor_id,motivo,cambios) VALUES($1,$2,$3,$4,$5)',[id,old.version+1,actor.id,dto.reason,{estado:{before:old.estado,after:state}}]);
      await this.commands.audit(c,actor,{action:'pacientes.estado',entity:'paciente',entityId:id,patientId:id,permission:'pacientes.editar_demograficos'});
      await this.commands.event(c,'paciente.actualizado','paciente',id,old.version+1,['rol:REC','rol:JOP']);
      return {id,version:old.version+1,state};
    });
  }
}
