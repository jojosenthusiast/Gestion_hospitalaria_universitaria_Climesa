import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase,userId } from './support/database';
// 24-oct 12:00Z = 06:00 en El Salvador.
const now=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:now.valueOf()/1000+3600})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
// Filtros de servidor de las listas de JOP: pacientes por situación de hoy, área y médico tratante; personal por turno de hoy.
describe('Listas · filtros del servidor para pacientes y personal',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>;
 const ids:Record<string,string>={};
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const staff=async(role:string)=>(await fixture.pg.query<{persona_personal_id:string}>('SELECT persona_personal_id FROM acceso.usuario WHERE id=$1',[userId(role)])).rows[0].persona_personal_id;
 const space=async(code:string)=>(await fixture.pg.query<{id:string}>('SELECT id FROM infra.espacio WHERE codigo=$1',[code])).rows[0].id;
 const register=async(givenNames:string,surnames:string,dui:string)=>{
  const search=await call('REC','POST','/pacientes/busquedas',{query:`${givenNames} ${surnames}`});
  const created=await call('REC','POST','/pacientes',{givenNames,surnames,sex:'femenino',birth:'1990-01-02',dui,searchToken:search.body.token,searchQuery:`${givenNames} ${surnames}`});
  expect(created.status).toBe(201);return created.body.id as string;
 };
 const names=(body:{fullName:string}[])=>body.map(p=>p.fullName).sort();
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
  ids.cama=await register('Rosa','Filtro Cama','00000001-8');
  ids.fila=await register('Elena','Filtro Fila','00000002-6');
  ids.nada=await register('Marta','Filtro Nada','00000003-4');
  // Rosa: hospitalizada en una cama de HAB-201 (planta P2-HOS) con MED como tratante.
  const bed=(await fixture.pg.query<{id:string;padre_id:string}>("SELECT id,padre_id FROM infra.espacio WHERE tipo='cama' AND padre_id=(SELECT id FROM infra.espacio WHERE codigo='HAB-201') ORDER BY codigo LIMIT 1")).rows[0];
  const admission=(await fixture.pg.query<{id:string}>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado,motivo) VALUES($1,'consulta',$2,'semiprivada','femenino',$3,'hospitalizado','Ingreso de prueba') RETURNING id",[ids.cama,randomUUID(),await staff('MED')])).rows[0];
  await fixture.pg.query("INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) VALUES($1,$2,$3,'semiprivada',tstzrange('2026-10-24T00:00Z',NULL,'[)'))",[admission.id,bed.id,bed.padre_id]);
  // Elena: número de hoy en espera.
  await fixture.pg.query("INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,estado) VALUES('consulta_general','2026-10-24',1,$1,'en_espera')",[ids.fila]);
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('situación de hoy: hospitalizados y en fila, combinables con el texto',async()=>{
  const hosp=await call('JOP','GET','/pacientes?query=Filtro&situacion=hospitalizado');
  expect(hosp.status).toBe(200);expect(names(hosp.body)).toEqual(['Rosa Filtro Cama']);
  const queue=await call('JOP','GET','/pacientes?query=Filtro&situacion=en_fila');
  expect(names(queue.body)).toEqual(['Elena Filtro Fila']);
  expect((await call('JOP','GET','/pacientes?query=Marta&situacion=en_fila')).body).toEqual([]);
  expect((await call('JOP','GET','/pacientes?query=Filtro')).body).toHaveLength(3);
 });
 test('área de la cama (incluye las plantas superiores) y médico tratante',async()=>{
  expect(names((await call('JOP','GET',`/pacientes?areaId=${await space('P2-HOS')}`)).body)).toEqual(['Rosa Filtro Cama']);
  expect((await call('JOP','GET',`/pacientes?areaId=${await space('P1-CON')}`)).body).toEqual([]);
  expect(names((await call('REC','GET',`/pacientes?medicoId=${await staff('MED')}`)).body)).toEqual(['Rosa Filtro Cama']);
  expect((await call('REC','GET',`/pacientes?medicoId=${await staff('ENF')}`)).body).toEqual([]);
 });
 test('estado del expediente: vigente excluye inactivos',async()=>{
  await fixture.pg.query("UPDATE pacientes.paciente SET estado='inactivo' WHERE id=$1",[ids.nada]);
  expect(names((await call('JOP','GET','/pacientes?query=Filtro&estado=vigente')).body)).toEqual(['Elena Filtro Fila','Rosa Filtro Cama']);
  expect(names((await call('JOP','GET','/pacientes?query=Filtro&estado=inactivo')).body)).toEqual(['Marta Filtro Nada']);
  await fixture.pg.query("UPDATE pacientes.paciente SET estado='activo' WHERE id=$1",[ids.nada]);
 });
 test('sin alcance global no se filtra por atención: ENF (admision.ver por área) y LAB (sin fila.ver) reciben 403',async()=>{
  const enf=await call('ENF','GET','/pacientes?situacion=hospitalizado');
  expect(enf.status).toBe(403);expect(enf.body.codigo).toBe('sin_permiso');
  expect((await call('LAB','GET','/pacientes?situacion=en_fila')).status).toBe(403);
  expect((await call('ENF','GET','/pacientes?query=Filtro')).status).toBe(200);
 });
 test('valores fuera del catálogo son 400',async()=>{
  expect((await call('JOP','GET','/pacientes?situacion=urgente')).status).toBe(400);
  expect((await call('JOP','GET','/pacientes?areaId=no-es-uuid')).status).toBe(400);
  expect((await call('JOP','GET','/pacientes?estado=borrado')).status).toBe(400);
 });
 test('personal: turno de hoy (de turno, ausente, más tarde, libre)',async()=>{
  const area=await space('P2-HOS');
  await fixture.pg.query('DELETE FROM personal.turno');
  await fixture.pg.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange('2026-10-24T06:00Z','2026-10-24T18:00Z','[)'),'diurno','publicado')",[await staff('MED'),area]);
  await fixture.pg.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado,ausencia_tipo,asistencia_motivo) VALUES($1,$2,tstzrange('2026-10-24T07:00Z','2026-10-24T11:00Z','[)'),'diurno','ausente','justificada','Cita médica personal')",[await staff('ENF'),area]);
  await fixture.pg.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange('2026-10-24T20:00Z','2026-10-25T02:00Z','[)'),'diurno','publicado')",[await staff('AST'),area]);
  const list=await call('JOP','GET','/personal');
  expect(list.status).toBe(200);
  const by=new Map<string,string>(list.body.map((p:{id:string;shiftToday:string})=>[p.id,p.shiftToday]));
  expect(by.get(await staff('MED'))).toBe('de_turno');
  expect(by.get(await staff('ENF'))).toBe('ausente');
  expect(by.get(await staff('AST'))).toBe('mas_tarde');
  expect(by.get(await staff('LAB'))).toBe('libre');
 });
});
