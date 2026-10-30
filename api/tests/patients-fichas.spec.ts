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
const rango=['ageRange'];
const contacto=['address','dui','email','phone'];
describe('Pacientes · la misma ficha según el rol y el contexto (privacidad.md §2)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,patientId:string;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const staff=async(role:string)=>(await fixture.pg.query<{persona_personal_id:string}>('SELECT persona_personal_id FROM acceso.usuario WHERE id=$1',[userId(role)])).rows[0].persona_personal_id;
 const relate=async(role:string,origin:'consulta'|'ambulancia')=>{
  await fixture.pg.query("INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia) VALUES($1,$2,$3,$4,tstzrange('2026-10-01','2026-12-01'))",[patientId,await staff(role),origin,randomUUID()]);
 };
 const space=async(code:string)=>(await fixture.pg.query<{id:string}>('SELECT id FROM infra.espacio WHERE codigo=$1',[code])).rows[0].id;
 // Turno publicado que cubre el reloj de la prueba (24-oct 12:00Z) en el área indicada; null lo retira.
 const shift=async(role:string,area:string|null)=>{
  const id=await staff(role);
  await fixture.pg.query('DELETE FROM personal.turno WHERE persona_id=$1',[id]);
  if(area)await fixture.pg.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange('2026-10-24T06:00Z','2026-10-24T18:00Z','[)'),'diurno','publicado')",[id,await space(area)]);
 };
 let admitted=false;
 const admit=async()=>{
  if(admitted)return;
  const bed=(await fixture.pg.query<{id:string;padre_id:string}>("SELECT id,padre_id FROM infra.espacio WHERE tipo='cama' AND padre_id=(SELECT id FROM infra.espacio WHERE codigo='HAB-201') ORDER BY codigo LIMIT 1")).rows[0];
  const admission=(await fixture.pg.query<{id:string}>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado) VALUES($1,'consulta',$2,'semiprivada','femenino',$3,'hospitalizado') RETURNING id",[patientId,randomUUID(),await staff('MED')])).rows[0];
  await fixture.pg.query("INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) VALUES($1,$2,$3,'semiprivada',tstzrange('2026-10-24T00:00Z',NULL,'[)'))",[admission.id,bed.id,bed.padre_id]);
  admitted=true;
 };
 // Número llamado a un consultorio de Consulta general en la fecha indicada.
 const ticket=async(date:string|null)=>{
  await fixture.pg.query('DELETE FROM atencion.ticket_fila WHERE paciente_id=$1',[patientId]);
  if(date)await fixture.pg.query("INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,estado,consultorio_id) VALUES('consulta_general',$2,1,$1,'llamado',$3)",[patientId,date,await space('C-101')]);
 };
 const order=async(state:'pendiente'|'completado'|null)=>{
  await fixture.pg.query('DELETE FROM laboratorio.orden WHERE paciente_id=$1',[patientId]);
  if(state)await fixture.pg.query('INSERT INTO laboratorio.orden(admision_id,paciente_id,medico_id,estado) VALUES($1,$2,$3,$4)',[randomUUID(),patientId,await staff('MED'),state]);
 };
 const grantContexts=async()=>{await admit();await shift('ENF','P2-HOS');await ticket('2026-10-24');await shift('AST','P1-CON');await order('pendiente');};
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
  ['AST','sin número llamado a su consultorio'],['ENF','sin paciente hospitalizado en su área'],['LAB','sin orden pendiente de procesar'],
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

 test('ENF: la ficha de un hospitalizado solo se abre con turno en curso en su área',async()=>{
  await admit();
  await shift('ENF',null);
  expect((await call('ENF','GET',`/pacientes/${patientId}`)).status).toBe(403);
  await shift('ENF','P1-CON');
  expect((await call('ENF','GET',`/pacientes/${patientId}`)).status).toBe(403);
  await shift('ENF','P2-HOS');
  expect((await call('ENF','GET',`/pacientes/${patientId}`)).status).toBe(200);
 });
 test('AST: la ficha de un número llamado a su consultorio solo se abre el día del número y con turno en esa área',async()=>{
  await ticket('2026-10-24');
  await shift('AST',null);
  expect((await call('AST','GET',`/pacientes/${patientId}`)).status).toBe(403);
  await shift('AST','P2-HOS');
  expect((await call('AST','GET',`/pacientes/${patientId}`)).status).toBe(403);
  await shift('AST','P1-CON');
  expect((await call('AST','GET',`/pacientes/${patientId}`)).status).toBe(200);
  await ticket('2026-10-23');
  expect((await call('AST','GET',`/pacientes/${patientId}`)).status).toBe(403);
 });
 test('LAB: la ficha solo se abre mientras el paciente tiene una orden pendiente o en proceso',async()=>{
  await order('completado');
  expect((await call('LAB','GET',`/pacientes/${patientId}`)).status).toBe(403);
  await order('pendiente');
  expect((await call('LAB','GET',`/pacientes/${patientId}`)).status).toBe(200);
 });
 test('REC y JOP no dependen de un área: abren la ficha sin contexto',async()=>{
  await shift('ENF',null);await shift('AST',null);await order(null);await ticket(null);
  expect((await call('REC','GET',`/pacientes/${patientId}`)).status).toBe(200);
  expect((await call('JOP','GET',`/pacientes/${patientId}`)).status).toBe(200);
 });

 // Campos de la misma ficha según privacidad.md §2 (PAC dueño, REC, MED, AST, ENF, LAB, PAR, JOP).
 test.each([
  ['REC','recepción',[...base,...nacimiento,...contacto,'history']],
  ['MED','médico con relación',[...base,...nacimiento,...contacto]],
  ['PAC','titular',[...base,...nacimiento,...contacto]],
  ['LAB','laboratorio: rango de edad y sexo, sin fecha exacta ni contacto',[...base,...rango]],
  ['AST','asistente en su consultorio',[...base,...nacimiento]],
  ['ENF','enfermería en su área',[...base,...nacimiento]],
  ['PAR','paramédico con servicio',[...base,...nacimiento]],
  ['JOP','jefe de operaciones: nombre y sexo para la asignación, sin fecha ni documento',[...base]],
 ])('%s · %s recibe exactamente estos campos',async(role,_label,keys)=>{
  await grantContexts();
  if(role==='PAC')await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1',[userId('PAC'),patientId]);
  try{
   const r=await call(role,'GET',`/pacientes/${patientId}`);
   expect(r.status).toBe(200);
   expect(Object.keys(r.body).sort()).toEqual([...keys].sort());
   expect(r.body.record).toBe('0000001-X');
   expect(r.body.fullName).toBe('Lucía Fichas Ejemplo');
   expect(r.body.sex).toBe('femenino');
   if(keys.includes('birth'))expect(r.body.birth).toBe('1992-03-04');
   if(keys.includes('dui'))expect(r.body.dui).toBe('00000001-8');
   if(role==='LAB')expect(r.body.ageRange).toBe('30-39');
  }finally{
   if(role==='PAC')await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1',[userId('PAC')]);
  }
 });
 test('solo recepción recibe el historial de cambios',async()=>{
  await grantContexts();
  const rec=(await call('REC','GET',`/pacientes/${patientId}`)).body;
  expect(Array.isArray(rec.history)).toBe(true);
  for(const role of ['MED','LAB','AST','ENF','PAR','JOP'])expect((await call(role,'GET',`/pacientes/${patientId}`)).body.history).toBeUndefined();
 });
});
