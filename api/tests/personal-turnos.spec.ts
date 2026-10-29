import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { PersonnelService } from '../src/operations/personnel.service';
import { createDatabase,userId } from './support/database';
let current=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:new Date('2027-12-31T00:00:00Z').valueOf()/1000})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
// FR-103-07, 08, 09 y 13: cobertura, publicación con advertencias, estados automáticos y aviso de horas semanales.
describe('Personal · cobertura, publicación y horas semanales (HU-103)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,areaId:string,emergencyId:string;
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
 // Los horarios se dan en hora local de El Salvador (-06:00); `local('2026-11-10','06:00')` → instante.
 const local=(day:string,time:string)=>`${day}T${time}:00-06:00`;
 const shift=(staffId:string,start:string,end:string,over:Record<string,unknown>={})=>call('JOP','POST','/turnos',{staffId,areaId:emergencyId,type:'diurno',start,end,...over});
 const coverage=(from:string,to:string)=>call('JOP','GET',`/turnos/cobertura?from=${from}&to=${to}`);
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
  const tree=(await call('JOP','GET','/espacios')).body;
  areaId=tree.find((n:any)=>n.code==='P1-CON').id;emergencyId=tree.find((n:any)=>n.code==='P1-EMG').id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 // Escenario 4: Emergencia sin médico de 22:00 a 06:00.
 test('la cobertura de Emergencia muestra el hueco sin médico de 22:00 a 06:00 y ninguno de enfermería',async()=>{
  const [doctorA,doctorB,nurseA,nurseB,nurseC]=[await person('medico'),await person('medico'),await person('enfermero'),await person('enfermero'),await person('enfermero')];
  const d='2026-11-10';
  for(const [p,s,e] of [[doctorA,'06:00','18:00'],[doctorB,'10:00','22:00'],[nurseA,'06:00','18:00']] as [typeof doctorA,string,string][])expect((await shift(p.id,local(d,s),local(d,e))).status).toBe(201);
  expect((await shift(nurseB.id,local('2026-11-09','18:00'),local(d,'06:00'))).status).toBe(201);
  expect((await shift(nurseC.id,local(d,'18:00'),local('2026-11-11','06:00'))).status).toBe(201);
  const result=await coverage(d,d);
  expect(result.status).toBe(200);
  const gaps=result.body.gaps.filter((g:any)=>g.areaId===emergencyId);
  expect(gaps.filter((g:any)=>g.role==='ENF')).toEqual([]);
  expect(gaps.filter((g:any)=>g.role==='MED').map((g:any)=>[g.start,g.end,g.required,g.actual])).toEqual([
   ['2026-11-10T06:00:00.000Z','2026-11-10T12:00:00.000Z',1,0],
   ['2026-11-11T04:00:00.000Z','2026-11-11T06:00:00.000Z',1,0],
  ]);
 });

 test('la cobertura valida el rango y exige el permiso de ver turnos',async()=>{
  expect((await coverage('2026-11-10','2026-11-09')).status).toBe(400);
  expect((await coverage('2026-02-30','2026-03-01')).status).toBe(400);
  expect((await coverage('2026-01-01','2026-12-31')).status).toBe(400);
  expect((await call('PAC','GET','/turnos/cobertura?from=2026-11-10&to=2026-11-10')).status).toBe(403);
 });

 test('publicar con huecos publica igual, devuelve la advertencia y registra quién publicó',async()=>{
  const doctor=await person('medico'),d='2026-11-17';
  const draft=(await shift(doctor.id,local(d,'08:00'),local(d,'16:00'))).body;
  const key=randomUUID();
  const published=await call('JOP','POST','/turnos/publicar',{from:d,to:d},key);
  expect(published.status).toBe(201);
  expect(published.body.published).toBeGreaterThanOrEqual(1);
  expect(published.body.warnings.some((g:any)=>g.areaId===emergencyId&&g.role==='ENF')).toBe(true);
  expect((await call('JOP','POST','/turnos/publicar',{from:d,to:d},key)).body).toEqual(published.body);
  const row=(await fixture.pg.query<any>("SELECT estado,publicado_por,publicado_en,version FROM personal.turno WHERE id=$1",[draft.id])).rows[0];
  expect(row).toMatchObject({estado:'publicado',publicado_por:userId('JOP'),version:2});
  expect(row.publicado_en).toBeTruthy();
  const audit=(await fixture.pg.query<any>("SELECT actor_id,permiso,detalle FROM plataforma.auditoria WHERE accion='turnos.publicar' ORDER BY seq DESC LIMIT 1")).rows[0];
  expect(audit.actor_id).toBe(userId('JOP'));expect(audit.permiso).toBe('turnos.publicar');expect(audit.detalle.huecos).toBeGreaterThan(0);
  const events=(await fixture.pg.query<any>("SELECT version FROM plataforma.outbox WHERE tipo='turno.publicado' AND entidad_id=$1",[draft.id])).rows;
  expect(events).toEqual([{version:2}]);
  expect((await call('JOP','POST','/turnos/publicar',{from:d,to:'2026-11-16'})).status).toBe(400);
  expect((await call('MED','POST','/turnos/publicar',{from:d,to:d})).status).toBe(403);
 });

 test('publicar un rango con cobertura completa no trae advertencias',async()=>{
  const [doctor,nurseA,nurseB]=[await person('medico'),await person('enfermero'),await person('enfermero')],d='2026-11-12';
  expect((await shift(doctor.id,local(d,'00:00'),local('2026-11-13','00:00'),{type:'guardia'})).status).toBe(201);
  expect((await shift(nurseA.id,local(d,'00:00'),local(d,'12:00'))).status).toBe(201);
  expect((await shift(nurseB.id,local(d,'12:00'),local('2026-11-13','00:00'))).status).toBe(201);
  const published=await call('JOP','POST','/turnos/publicar',{from:d,to:d,areaId:emergencyId});
  expect(published.status).toBe(201);expect(published.body.published).toBe(3);expect(published.body.warnings).toEqual([]);
 });

 // FR-103-13: la vista v_turno_en_curso ya dice quién está de turno por reloj, pero el estado solo cambia con esta transición.
 test('un turno publicado pasa a en curso y luego a completado según el reloj',async()=>{
  const assistant=await person('asistente'),d='2026-11-20';
  const created=(await shift(assistant.id,local(d,'07:00'),local(d,'15:00'),{areaId})).body;
  expect((await call('JOP','POST','/turnos/publicar',{from:d,to:d,areaId})).status).toBe(201);
  const state=async()=>(await fixture.pg.query<any>("SELECT estado,version FROM personal.turno WHERE id=$1",[created.id])).rows[0];
  current=new Date('2026-11-20T12:00:00Z');// 06:00 local, antes del inicio
  await app.get(PersonnelService).advanceStates();
  expect((await state()).estado).toBe('publicado');
  current=new Date('2026-11-20T14:00:00Z');// 08:00 local
  await app.get(PersonnelService).advanceStates();
  expect(await state()).toEqual({estado:'en_curso',version:3});
  await app.get(PersonnelService).advanceStates();
  expect((await state()).version).toBe(3);// idempotente
  current=new Date('2026-11-20T22:00:00Z');// 16:00 local
  expect((await call('JOP','GET','/turnos')).body.find((s:any)=>s.id===created.id).state).toBe('completado');
  const events=(await fixture.pg.query<any>("SELECT tipo FROM plataforma.outbox WHERE entidad_id=$1 ORDER BY seq",[created.id])).rows.map(r=>r.tipo);
  expect(events).toEqual(['turno.actualizado','turno.publicado','turno.actualizado','turno.actualizado']);
  current=new Date('2026-10-24T12:00:00Z');
 });

 test('un borrador o un turno cancelado nunca cambia de estado por el reloj',async()=>{
  const assistant=await person('asistente'),d='2026-11-24';
  const draft=(await shift(assistant.id,local(d,'07:00'),local(d,'15:00'),{areaId})).body;
  current=new Date('2026-11-25T12:00:00Z');
  await app.get(PersonnelService).advanceStates();
  current=new Date('2026-10-24T12:00:00Z');
  expect((await fixture.pg.query<any>("SELECT estado FROM personal.turno WHERE id=$1",[draft.id])).rows[0].estado).toBe('borrador');
 });
});
