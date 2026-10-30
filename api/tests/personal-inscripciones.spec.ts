import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase,userId } from './support/database';
const now=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:now.valueOf()/1000+3600})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
// FR-103-03 y FR-103-10: inscripciones profesionales y bloqueo de turnos clínicos sin inscripción vigente.
describe('Personal · inscripciones y turnos clínicos (HU-103)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,areaId:string;
 const call=async(role:string,method:string,path:string,body?:unknown,idempotency?:string)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':idempotency??randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 let sequence=0;
 const person=async(type='medico')=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:`Ficticia ${String.fromCharCode(65+ ++sequence)}`,type});
  expect(created.status).toBe(201);
  return created.body as {id:string;version:number};
 };
 const enroll=(id:string,version:number,over:Record<string,unknown>={},idempotency?:string)=>call('ADM','POST',`/personal/${id}/inscripciones`,{board:'JVPM',number:`T-${++sequence}`,validFrom:'2026-01-01',validTo:'2026-12-31',version,reason:'Registro de inscripción de prueba',...over},idempotency);
 const shift=(staffId:string,day:string,over:Record<string,unknown>={})=>call('JOP','POST','/turnos',{staffId,areaId,type:'diurno',start:`${day}T07:00:00-06:00`,end:`${day}T15:00:00-06:00`,...over});
 beforeAll(async()=>{
  fixture=await createDatabase();
  const auth={authClient:{auth:{getUser:async(token:string)=>{
   const [h,b,s]=token.split('.');
   const expected=createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url');
   if(!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return {data:{user:null},error:new Error('firma')};
   const p=JSON.parse(Buffer.from(b,'base64url').toString());return {data:{user:{id:p.sub,email:'fixture@example.test'}},error:null};
  }}},admin:{auth:{admin:{inviteUserByEmail:async()=>({data:{user:{id:randomUUID()}},error:null})}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>now}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
  areaId=(await call('JOP','GET','/espacios')).body.find((n:any)=>n.code==='P1-CON').id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 // T02: edición con versión y motivo.
 test('editar personal exige el motivo y rechaza una versión obsoleta con la versión vigente',async()=>{
  const p=await person(),b={givenNames:'Persona',surnames:'Ficticia editada',type:'medico'};
  const noReason=await call('ADM','PATCH',`/personal/${p.id}`,{...b,version:p.version});
  expect(noReason.status).toBe(400);
  const shortReason=await call('ADM','PATCH',`/personal/${p.id}`,{...b,version:p.version,reason:'corto'});
  expect(shortReason.status).toBe(400);
  const ok=await call('ADM','PATCH',`/personal/${p.id}`,{...b,version:p.version,reason:'Corrección de apellidos de prueba'});
  expect(ok.status).toBe(200);expect(ok.body.version).toBe(p.version+1);
  const stale=await call('ADM','PATCH',`/personal/${p.id}`,{...b,version:p.version,reason:'Versión antigua de la ficha'});
  expect(stale.status).toBe(409);expect(stale.body.codigo).toBe('version_conflicto');expect(stale.body.versionActual).toBe(p.version+1);
 });

 test('registra una inscripción con versión, motivo, auditoría y evento; el reintento no duplica',async()=>{
  const p=await person(),key=randomUUID();
  const first=await enroll(p.id,p.version,{number:'JVPM-0001'},key);
  expect(first.status).toBe(201);expect(first.body.version).toBe(p.version+1);
  expect((await enroll(p.id,p.version,{number:'JVPM-0001'},key)).body).toEqual(first.body);
  const rows=(await fixture.pg.query<any>("SELECT junta,numero,lower(vigencia)::text AS desde,upper(vigencia)::text AS hasta FROM personal.inscripcion WHERE persona_id=$1",[p.id])).rows;
  expect(rows).toEqual([{junta:'JVPM',numero:'JVPM-0001',desde:'2026-01-01',hasta:'2027-01-01'}]);
  const audit=(await fixture.pg.query<any>("SELECT permiso,motivo FROM plataforma.auditoria WHERE accion='personal.inscripcion.registrar' AND entidad_id=$1",[p.id])).rows;
  expect(audit).toEqual([{permiso:'personal.gestionar',motivo:'Registro de inscripción de prueba'}]);
  const events=(await fixture.pg.query<any>("SELECT version FROM plataforma.outbox WHERE tipo='personal.actualizado' AND entidad_id=$1 ORDER BY seq",[p.id])).rows;
  expect(events.at(-1).version).toBe(p.version+1);
 });

 test('la inscripción rechaza versión obsoleta, motivo ausente, vigencia invertida, número repetido y roles sin permiso',async()=>{
  const p=await person(),other=await person();
  expect((await enroll(p.id,p.version,{number:'JVPM-0100'})).status).toBe(201);
  const stale=await enroll(p.id,p.version,{number:'JVPM-0101'});
  expect(stale.status).toBe(409);expect(stale.body.codigo).toBe('version_conflicto');expect(stale.body.versionActual).toBe(p.version+1);
  expect((await enroll(other.id,other.version,{reason:undefined})).status).toBe(400);
  expect((await enroll(other.id,other.version,{validFrom:'2026-12-31',validTo:'2026-01-01'})).status).toBe(400);
  expect((await enroll(other.id,other.version,{validFrom:'2026-02-30'})).status).toBe(400);
  expect((await enroll(other.id,other.version,{board:'XXXX'})).status).toBe(400);
  const dup=await enroll(other.id,other.version,{number:'JVPM-0100'});
  expect(dup.status).toBe(409);
  expect((await call('JOP','POST',`/personal/${other.id}/inscripciones`,{board:'JVPM',number:'JVPM-0200',validFrom:'2026-01-01',validTo:'2026-12-31',version:other.version,reason:'Intento sin permiso'})).status).toBe(403);
  expect((await call('ADM','POST',`/personal/${randomUUID()}/inscripciones`,{board:'JVPM',number:'JVPM-0201',validFrom:'2026-01-01',validTo:'2026-12-31',version:1,reason:'Persona inexistente'})).status).toBe(404);
 });

 // T05: FR-103-10.
 test('programar a un médico sin inscripción o con la inscripción vencida se rechaza',async()=>{
  const p=await person();
  const none=await shift(p.id,'2026-11-03');
  expect(none.status).toBe(409);expect(none.body.codigo).toBe('inscripcion_no_vigente');expect(none.body.detail ?? none.body.mensaje ?? JSON.stringify(none.body)).toContain('inscripción');
  expect((await enroll(p.id,p.version,{validFrom:'2026-01-01',validTo:'2026-10-31'})).status).toBe(201);
  const expired=await shift(p.id,'2026-11-03');
  expect(expired.status).toBe(409);expect(expired.body.codigo).toBe('inscripcion_no_vigente');
  expect((await shift(p.id,'2026-10-30')).status).toBe(201);
  expect((await shift(p.id,'2026-10-31')).status).toBe(201);
 });

 test('mover un turno a una fecha sin inscripción vigente se rechaza; dentro de la vigencia se permite',async()=>{
  const p=await person();
  expect((await enroll(p.id,p.version,{validFrom:'2026-11-01',validTo:'2026-11-30'})).status).toBe(201);
  const created=await shift(p.id,'2026-11-05');expect(created.status).toBe(201);
  const move=(day:string,version:number)=>call('JOP','PATCH',`/turnos/${created.body.id}`,{staffId:p.id,areaId,type:'diurno',start:`${day}T07:00:00-06:00`,end:`${day}T15:00:00-06:00`,version,reason:'Reprogramación de turno de prueba'});
  const outside=await move('2026-12-02',1);
  expect(outside.status).toBe(409);expect(outside.body.codigo).toBe('inscripcion_no_vigente');
  expect((await move('2026-11-12',1)).status).toBe(200);
 });

 test('el enfermero también lo requiere; asistente y administrativo no',async()=>{
  const nurse=await person('enfermero'),assistant=await person('asistente'),admin=await person('administrativo');
  expect((await shift(nurse.id,'2026-11-04')).body.codigo).toBe('inscripcion_no_vigente');
  expect((await enroll(nurse.id,nurse.version,{board:'JVPE'})).status).toBe(201);
  expect((await shift(nurse.id,'2026-11-04')).status).toBe(201);
  expect((await shift(assistant.id,'2026-11-04')).status).toBe(201);
  expect((await shift(admin.id,'2026-11-04')).status).toBe(201);
 });

 test('si la inscripción vence con un turno ya publicado, el turno se conserva y se puede cancelar',async()=>{
  const p=await person();
  expect((await enroll(p.id,p.version,{validFrom:'2026-01-01',validTo:'2026-12-31'})).status).toBe(201);
  const created=await shift(p.id,'2026-11-20');expect(created.status).toBe(201);
  await fixture.pg.query("UPDATE personal.turno SET estado='publicado' WHERE id=$1",[created.body.id]);
  await fixture.pg.query("UPDATE personal.inscripcion SET vigencia=daterange('2026-01-01','2026-11-10') WHERE persona_id=$1",[p.id]);
  const listed=(await call('JOP','GET','/turnos')).body.find((s:any)=>s.id===created.body.id);
  expect(listed.state).toBe('publicado');
  const cancel=await call('JOP','PATCH',`/turnos/${created.body.id}`,{staffId:p.id,areaId,type:'diurno',start:'2026-11-20T07:00:00-06:00',end:'2026-11-20T15:00:00-06:00',version:1,state:'cancelado',reason:'Cancelación por inscripción vencida'});
  expect(cancel.status).toBe(200);
 });
});
