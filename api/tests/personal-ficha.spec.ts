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
// W07/W08 (FR-103-03): el listado de personal incluye las inscripciones de cada persona para armar la ficha.
describe('Personal · inscripciones en el listado (HU-103, W08)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
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
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('el listado trae las inscripciones de cada persona con su vigencia inclusiva, la más reciente primero, y vacío si no tiene',async()=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:'Ficticia Ficha',type:'medico'});
  expect(created.status).toBe(201);
  const empty=(await call('ADM','GET','/personal')).body.find((p:any)=>p.id===created.body.id);
  expect(empty.registrations).toEqual([]);
  const base={board:'JVPM',reason:'Registro de inscripción de prueba'};
  const first=await call('ADM','POST',`/personal/${created.body.id}/inscripciones`,{...base,number:'FICHA-001',validFrom:'2025-01-01',validTo:'2025-12-31',version:created.body.version});
  expect(first.status).toBe(201);
  expect((await call('ADM','POST',`/personal/${created.body.id}/inscripciones`,{...base,number:'FICHA-002',validFrom:'2026-01-01',validTo:'2026-12-31',version:first.body.version})).status).toBe(201);
  const listed=(await call('ADM','GET','/personal')).body.find((p:any)=>p.id===created.body.id);
  expect(listed.registrations.map(({id,...r}:any)=>r)).toEqual([
   {board:'JVPM',number:'FICHA-002',validFrom:'2026-01-01',validTo:'2026-12-31'},
   {board:'JVPM',number:'FICHA-001',validFrom:'2025-01-01',validTo:'2025-12-31'}
  ]);
  expect(typeof listed.registrations[0].id).toBe('string');
 });

 test('JOP también ve las inscripciones, sin teléfono ni DUI',async()=>{
  const row=(await call('JOP','GET','/personal')).body.find((p:any)=>Array.isArray(p.registrations)&&p.registrations.length);
  expect(row).toBeDefined();
  expect(row.dui).toBeUndefined();expect(row.phone).toBeUndefined();
 });
});
