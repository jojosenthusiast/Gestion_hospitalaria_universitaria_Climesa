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
// Prueba de caracterización (FR-102-10): fija lo que el código HACE hoy con la misma ficha según el rol.
// No es la política: las diferencias con docs/arquitectura/privacidad.md §2 están pendientes de decisión de producto.
const base=['active','fullName','givenNames','id','provisional','record','sex','state','surnames','version'];
const nacimiento=['birth','birthPrecision'];
const contacto=['address','dui','email','phone'];
describe('Pacientes · la misma ficha según el rol (caracterización de detail() y permitted())',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,patientId:string;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const staff=async(role:string)=>(await fixture.pg.query<{persona_personal_id:string}>('SELECT persona_personal_id FROM acceso.usuario WHERE id=$1',[userId(role)])).rows[0].persona_personal_id;
 const relate=async(role:string,origin:'consulta'|'ambulancia')=>{
  await fixture.pg.query("INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia) VALUES($1,$2,$3,$4,tstzrange('2026-10-01','2026-12-01'))",[patientId,await staff(role),origin,randomUUID()]);
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
  const search=await call('REC','POST','/pacientes/busquedas',{query:'Lucía Fichas'});
  const created=await call('REC','POST','/pacientes',{givenNames:'Lucía',surnames:'Fichas Ejemplo',sex:'femenino',birth:'1992-03-04',dui:'00000001-8',phone:'7000-1111',email:'lucia@example.test',address:'Calle ficticia 1',searchToken:search.body.token,searchQuery:'Lucía Fichas'});
  expect(created.status).toBe(201);patientId=created.body.id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test.each([
  ['MED','sin relación de atención'],['PAR','sin servicio de ambulancia'],['PAC','que no es el titular'],
 ])('403 · %s %s',async(role,_motivo)=>{
  const r=await call(role,'GET',`/pacientes/${patientId}`);
  expect(r.status).toBe(403);
  expect(r.body.codigo).toBe('sin_permiso');
 });
 test.each(['ADM','DPD'])('403 · %s no tiene el permiso pacientes.ver_ficha',async role=>{
  expect((await call(role,'GET',`/pacientes/${patientId}`)).status).toBe(403);
 });

 test('la relación vigente abre la ficha al médico y al paramédico; sin ella siguen en 403',async()=>{
  await relate('MED','consulta');
  await relate('PAR','ambulancia');
  expect((await call('MED','GET',`/pacientes/${patientId}`)).status).toBe(200);
  expect((await call('PAR','GET',`/pacientes/${patientId}`)).status).toBe(200);
 });

 // Cada fila es lo que el CÓDIGO entrega hoy. Entre paréntesis, lo que dice privacidad.md §2 cuando difiere.
 test.each([
  ['REC','recepción',[...base,...nacimiento,...contacto,'history']],
  ['MED','médico con relación',[...base,...nacimiento,...contacto]],
  ['PAC','titular',[...base,...nacimiento,...contacto]],
  ['LAB','laboratorio (el doc dice rangos de edad y sexo, no la fecha exacta)',[...base,...nacimiento]],
  ['AST','asistente',[...base,...nacimiento]],
  ['ENF','enfermería (el doc agrega contacto de emergencia en el área)',[...base,...nacimiento]],
  ['PAR','paramédico con servicio (el doc agrega dirección del servicio)',[...base,...nacimiento]],
  ['JOP','jefe de operaciones (el doc no le da fecha de nacimiento ni DUI)',[...base]],
 ])('%s · %s recibe exactamente estos campos',async(role,_label,keys)=>{
  if(role==='PAC')await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1',[userId('PAC'),patientId]);
  try{
   const r=await call(role,'GET',`/pacientes/${patientId}`);
   expect(r.status).toBe(200);
   expect(Object.keys(r.body).sort()).toEqual([...keys].sort());
   expect(r.body.record).toBe('0000001-X');
   expect(r.body.fullName).toBe('Lucía Fichas Ejemplo');
   if(keys.includes('birth'))expect(r.body.birth).toBe('1992-03-04');
   if(keys.includes('dui'))expect(r.body.dui).toBe('00000001-8');
  }finally{
   if(role==='PAC')await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1',[userId('PAC')]);
  }
 });
 test('solo recepción recibe el historial de cambios',async()=>{
  const rec=(await call('REC','GET',`/pacientes/${patientId}`)).body;
  expect(Array.isArray(rec.history)).toBe(true);
  for(const role of ['MED','LAB','AST','ENF','PAR','JOP'])expect((await call(role,'GET',`/pacientes/${patientId}`)).body.history).toBeUndefined();
 });
});
