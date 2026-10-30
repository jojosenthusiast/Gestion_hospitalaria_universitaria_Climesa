import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase,userId } from './support/database';
let current=new Date('2026-11-10T17:00:00Z');// 11:00 hora local
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:new Date('2027-12-31T00:00:00Z').valueOf()/1000})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
// FR-109-01 y FR-109-06 (escenario 2): estado de la unidad y paramédico con turno en curso.
describe('Ambulancia · estado de la unidad y paramédico de turno (HU-109)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,areaId:string;
 const call=async(role:string,method:string,path:string,body?:unknown,idempotency?:string)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':idempotency??randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 let sequence=0;
 const letters=(n:number)=>n.toString(26).replace(/[0-9a-p]/g,ch=>String.fromCharCode(97+parseInt(ch,26)));
 const person=async(type:string)=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:`Ficticia ${letters(++sequence)}`,type});
  expect(created.status).toBe(201);
  let version=created.body.version as number;
  if(['medico','enfermero'].includes(type)){
   const enrolled=await call('ADM','POST',`/personal/${created.body.id}/inscripciones`,{board:type==='medico'?'JVPM':'JVPE',number:`TT-${++sequence}`,validFrom:'2026-01-01',validTo:'2026-12-31',version,reason:'Inscripción de prueba'});
   expect(enrolled.status).toBe(201);version=enrolled.body.version;
  }
  return {id:created.body.id as string,version};
 };
 const unit=async()=>(await fixture.pg.query<any>('SELECT id,estado,version FROM ambulancia.unidad')).rows[0];
 const maintenance=(role:string,inMaintenance:boolean,version:number,reason='Revisión mecánica de rutina',key?:string)=>call(role,'POST','/ambulancia/mantenimiento',{version,inMaintenance,reason},key);
 // Crea una persona paramédica con un turno publicado en el área de consulta (hora local, -06:00).
 const onDuty=async(start:string,end:string)=>{
  const medic=await person('paramedico');
  expect((await call('JOP','POST','/turnos',{staffId:medic.id,areaId,type:'diurno',start,end})).status).toBe(201);
  expect((await call('JOP','POST','/turnos/publicar',{from:start.slice(0,10),to:end.slice(0,10),areaId})).status).toBe(201);
  return medic;
 };
 beforeAll(async()=>{
  fixture=await createDatabase();
  const auth={authClient:{auth:{getUser:async(token:string)=>{
   const [h,b,s]=token.split('.');
   const expected=createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url');
   if(!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return {data:{user:null},error:new Error('firma')};
   const p=JSON.parse(Buffer.from(b,'base64url').toString());return {data:{user:{id:p.sub,email:'fixture@example.test'}},error:null};
  }}},admin:{auth:{admin:{inviteUserByEmail:async()=>({data:{user:{id:randomUUID()}},error:null})}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>current}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
  areaId=(await call('JOP','GET','/espacios')).body.find((n:any)=>n.code==='P1-CON').id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('quien tiene el permiso ve la unidad y su estado; sin permiso se deniega',async()=>{
  const seen=await call('REC','GET','/ambulancia');
  expect(seen.status).toBe(200);
  expect(seen.body.unit).toMatchObject({plate:'P-000-001',state:'en_mantenimiento',version:1});
  expect(seen.body.activeService).toBeNull();
  expect(seen.body.paramedicOnDuty).toBe(false);
  expect((await call('PAR','GET','/ambulancia')).status).toBe(200);
  expect((await call('ADM','GET','/ambulancia')).status).toBe(403);
  expect((await call('PAC','GET','/ambulancia')).status).toBe(403);
 });

 // Escenario 2: sin paramédico de turno se rechaza poner la unidad Disponible.
 test('sin paramédico con turno en curso, salir de mantenimiento se rechaza con 409',async()=>{
  const before=await unit();
  const denied=await maintenance('JOP',false,before.version);
  expect(denied.status).toBe(409);
  expect(denied.body.codigo).toBe('sin_paramedico_de_turno');
  expect(denied.body.detail).toContain('paramédico');
  expect(await unit()).toMatchObject({estado:'en_mantenimiento',version:before.version});
  // un turno que aún no empieza no cuenta (empieza a las 14:00 local; ahora son las 11:00)
  await onDuty('2026-11-10T14:00:00-06:00','2026-11-10T20:00:00-06:00');
  expect((await maintenance('JOP',false,before.version)).status).toBe(409);
  // tampoco cuenta quien no es paramédico aunque esté de turno ahora
  const nurse=await person('asistente');
  expect((await call('JOP','POST','/turnos',{staffId:nurse.id,areaId,type:'diurno',start:'2026-11-10T06:00:00-06:00',end:'2026-11-10T14:00:00-06:00'})).status).toBe(201);
  expect((await call('JOP','POST','/turnos/publicar',{from:'2026-11-10',to:'2026-11-10',areaId})).status).toBe(201);
  expect((await maintenance('JOP',false,before.version)).status).toBe(409);
 });

 test('con un paramédico de turno la unidad queda Disponible con versión, bitácora, auditoría y evento',async()=>{
  const before=await unit();
  await onDuty('2026-11-10T07:00:00-06:00','2026-11-10T15:00:00-06:00');
  expect((await call('REC','GET','/ambulancia')).body.paramedicOnDuty).toBe(true);
  const key=randomUUID();
  const done=await maintenance('JOP',false,before.version,'Fin de la revisión mecánica',key);
  expect(done.status).toBe(201);
  expect(done.body).toMatchObject({id:before.id,state:'disponible',version:before.version+1});
  const replay=await maintenance('JOP',false,before.version,'Fin de la revisión mecánica',key);
  expect(replay.status).toBe(201);expect(replay.body).toEqual(done.body);
  expect((await call('PAR','GET','/ambulancia')).body.unit).toMatchObject({state:'disponible',version:before.version+1});
  const change=(await fixture.pg.query<any>('SELECT desde,hacia,motivo,por FROM ambulancia.cambio_estado ORDER BY id DESC LIMIT 1')).rows[0];
  expect(change).toEqual({desde:'en_mantenimiento',hacia:'disponible',motivo:'Fin de la revisión mecánica',por:userId('JOP')});
  const audit=(await fixture.pg.query<any>("SELECT actor_id,permiso,motivo FROM plataforma.auditoria WHERE accion='ambulancia.mantenimiento' ORDER BY seq DESC LIMIT 1")).rows[0];
  expect(audit).toEqual({actor_id:userId('JOP'),permiso:'ambulancia.mantenimiento',motivo:'Fin de la revisión mecánica'});
  const events=(await fixture.pg.query<any>("SELECT version,canales FROM plataforma.outbox WHERE tipo='ambulancia.estado_cambiado' AND entidad_id=$1",[before.id])).rows;
  expect(events).toEqual([{version:before.version+1,canales:['ambulancia']}]);
 });

 test('versión vieja, permiso denegado y estados inválidos se rechazan; entrar a mantenimiento emite el evento',async()=>{
  const now=await unit();
  expect(now.estado).toBe('disponible');
  const stale=await maintenance('JOP',true,now.version-1);
  expect(stale.status).toBe(409);expect(stale.body.codigo).toBe('version_conflicto');
  expect((await maintenance('REC',true,now.version)).status).toBe(403);
  expect((await maintenance('PAR',true,now.version)).status).toBe(403);
  expect((await maintenance('JOP',false,now.version)).status).toBe(409);// ya está Disponible
  const entered=await maintenance('JOP',true,now.version,'Cambio de llantas programado');
  expect(entered.status).toBe(201);expect(entered.body.state).toBe('en_mantenimiento');
  expect((await maintenance('JOP',true,entered.body.version)).status).toBe(409);
  const last=(await fixture.pg.query<any>("SELECT version FROM plataforma.outbox WHERE tipo='ambulancia.estado_cambiado' ORDER BY seq DESC LIMIT 1")).rows[0];
  expect(last).toEqual({version:entered.body.version});
 });

 test('con un servicio activo el estado lo muestra sin datos del paciente y no se entra a mantenimiento',async()=>{
  const now=await unit();
  const crew=await person('paramedico');
  await fixture.pg.query("UPDATE ambulancia.unidad SET estado='en_servicio'");
  const service=(await fixture.pg.query<any>("INSERT INTO ambulancia.servicio(unidad_id,tipo,prioridad,paciente_id,origen,destino,despachado_por) VALUES($1,'emergencia_domicilio','roja',gen_random_uuid(),'Calle ficticia 1','Hospital CLIMESA',$2) RETURNING id",[now.id,userId('REC')])).rows[0];
  await fixture.pg.query("INSERT INTO ambulancia.tripulacion(servicio_id,persona_id,funcion) VALUES($1,$2,'paramedico')",[service.id,crew.id]);
  const seen=await call('JOP','GET','/ambulancia');
  expect(seen.body.unit.state).toBe('en_servicio');
  expect(seen.body.activeService).toMatchObject({id:service.id,type:'emergencia_domicilio',priority:'roja',origin:'Calle ficticia 1',destination:'Hospital CLIMESA'});
  expect(seen.body.activeService.crew).toEqual([{staffId:crew.id,role:'paramedico',name:expect.stringContaining('Persona')}]);
  expect(JSON.stringify(seen.body)).not.toContain('paciente');
  const refused=await maintenance('JOP',true,now.version);
  expect(refused.status).toBe(409);expect(refused.body.codigo).toBe('unidad_en_servicio');
 });
});
