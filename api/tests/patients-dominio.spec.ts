import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase,userId } from './support/database';
import { ageOn,ageRange,fichaFields } from '../src/patients/patient.privacy';
const now=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:now.valueOf()/1000+3600})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
// Escenarios 1, 2 y 4 de la spec 102 y correcciones de dominio del módulo de pacientes (FR-102-01, -03, -05, -06).
describe('Pacientes · dominio: búsqueda con motivo, DUI repetido, corrección y provisional',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const jose={givenNames:'José',surnames:'Hernández Vásquez',sex:'masculino',birth:'1985-07-14',dui:'00000001-8',phone:'7000-1234'};
 let joseId:string;
 const register=async(role:string,path:string,data:Record<string,unknown>,query:string)=>{
  const search=await call(role,'POST','/pacientes/busquedas',{query});
  return call(role,'POST',path,{...data,searchToken:search.body.token,searchQuery:query});
 };
 const find=async(query:string)=>{const r=await call('REC','GET','/pacientes?query='+encodeURIComponent(query));expect(r.status).toBe(200);return r.body.find((p:any)=>p.id===joseId);};
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
  const created=await register('REC','/pacientes',jose,'José Hernández');expect(created.status).toBe(201);joseId=created.body.id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 describe('FR-102-01 · motivo de coincidencia',()=>{
  test('escenario 1: "hernandes basquez jose" encuentra a José Hernández Vásquez con motivo fonético y solo campos mínimos',async()=>{
   const candidate=await find('hernandes basquez jose');
   expect(candidate).toBeDefined();
   expect(candidate.matchReason).toContain('fonética');
   expect(Object.keys(candidate).sort()).toEqual(['active','birth','fullName','givenNames','id','matchReason','record','sex','state','surnames','version']);
   expect(candidate.fullName).toBe('José Hernández Vásquez');
   for(const key of ['dui','phone','email','address'])expect(candidate[key]).toBeUndefined();
  });
  test('un nombre escrito igual se reporta como coincidencia de nombre, no como fonética',async()=>{
   const candidate=await find('José Hernández');
   expect(candidate.matchReason).toBe('Coincidencia de nombre');
  });
  test('el DUI completo se reporta como coincidencia de documento',async()=>{
   const candidate=await find('00000001-8');
   expect(candidate.matchReason).toContain('documento');
  });
  test('el número de expediente se reporta como coincidencia de expediente',async()=>{
   const candidate=await find('0000001-X');
   expect(candidate.matchReason).toContain('expediente');
  });
  test('la fecha de nacimiento exacta se reporta como coincidencia de fecha de nacimiento',async()=>{
   const candidate=await find('1985-07-14');
   expect(candidate.matchReason).toContain('fecha de nacimiento');
  });
 });

 describe('FR-102-03 · DUI repetido',()=>{
  test('escenario 2: registrar otro paciente con ese DUI responde 409 y el mensaje nombra el expediente que lo tiene',async()=>{
   const other={givenNames:'María',surnames:'Ejemplo Prueba',sex:'femenino',dui:'00000001-8'};
   const result=await register('REC','/pacientes',other,'María Ejemplo');
   expect(result.status).toBe(409);
   expect(result.body.detail).toContain('0000001-X');
   expect(result.body.detail).toContain('DUI');
   const record=(await fixture.pg.query<any>('SELECT expediente FROM pacientes.paciente WHERE id=$1',[joseId])).rows[0].expediente;
   expect(result.body.detail).toContain(record);
  });
 });

 describe('FR-102-06 · corrección con historial',()=>{
  test('escenario 4: al corregir un apellido con motivo, el historial muestra el valor anterior y el nuevo',async()=>{
   const edit=await call('REC','PATCH',`/pacientes/${joseId}`,{...jose,surnames:'Hernandes Vásquez',version:1,reason:'Apellido mal escrito en la ficha'});
   expect(edit.status).toBe(200);
   const detail=(await call('REC','GET',`/pacientes/${joseId}`)).body;
   expect(detail.version).toBe(2);
   expect(detail.history[0].reason).toBe('Apellido mal escrito en la ficha');
   expect(detail.history[0].changes.primer_apellido).toEqual({before:'Hernández Vásquez',after:'Hernandes Vásquez'});
   expect(Object.keys(detail.history[0].changes)).toEqual(['primer_apellido']);
   const row=(await fixture.pg.query<any>('SELECT segundo_apellido,precision_nacimiento FROM pacientes.paciente WHERE id=$1',[joseId])).rows[0];
   expect(row.segundo_apellido).toBeNull();
   expect(row.precision_nacimiento).toBe('exacta');
  });
  test('cambiar la fecha de un paciente normal conserva la precisión exacta',async()=>{
   const edit=await call('REC','PATCH',`/pacientes/${joseId}`,{...jose,surnames:'Hernandes Vásquez',birth:'1985-07-15',version:2,reason:'Fecha de nacimiento corregida con documento'});
   expect(edit.status).toBe(200);
   expect((await fixture.pg.query<any>('SELECT precision_nacimiento FROM pacientes.paciente WHERE id=$1',[joseId])).rows[0].precision_nacimiento).toBe('exacta');
  });
 });

 describe('FR-102-05 · editar una identidad provisional',()=>{
  const provisional=async(extra:Record<string,unknown>)=>{
   const result=await register('PAR','/pacientes/provisionales',{givenNames:'',surnames:'',sex:'no_registrado',estimatedAge:30,description:'Persona sin identificación conocida',...extra},'Persona sin documento');
   expect(result.status).toBe(201);return result.body.id as string;
  };
  const fields=(id:string)=>fixture.pg.query<any>('SELECT precision_nacimiento,nacimiento::text AS nacimiento,edad_estimada FROM pacientes.paciente WHERE id=$1',[id]).then(r=>r.rows[0]);
  test.each([
   ['sin fecha de nacimiento',{},undefined],
   ['con la fecha estimada sin cambios',{birth:'1996-01-01'},'1996-01-01'],
  ])('editar un provisional %s conserva la precisión "estimada"',async(_label,create,birth)=>{
   const id=await provisional(create as Record<string,unknown>);
   const before=await fields(id);expect(before.precision_nacimiento).toBe('estimada');
   const edit=await call('REC','PATCH',`/pacientes/${id}`,{givenNames:'Persona',surnames:'Pendiente',sex:'masculino',...(birth?{birth}:{}),version:1,reason:'Se completan los datos conocidos'});
   expect(edit.status).toBe(200);
   const after=await fields(id);
   expect(after.precision_nacimiento).toBe('estimada');
   expect(after.edad_estimada).toBe(30);
   expect(after.nacimiento).toBe(before.nacimiento);
  });
  test('si quien edita escribe una fecha distinta, el sistema la toma como exacta',async()=>{
   const id=await provisional({birth:'1996-01-01'});
   expect((await call('REC','PATCH',`/pacientes/${id}`,{givenNames:'Persona',surnames:'Pendiente',sex:'masculino',birth:'1995-03-02',version:1,reason:'Se confirma la fecha con documento'})).status).toBe(200);
   expect((await fields(id)).precision_nacimiento).toBe('exacta');
  });
 });
});

describe('Pacientes · política de campos de la ficha (privacidad.md §2)',()=>{
 test('rango de edad por decenios y 90+ sin fecha exacta',()=>{
  expect([0,9,10,34,89,90,104].map(ageRange)).toEqual(['0-9','0-9','10-19','30-39','80-89','90+','90+']);
  expect(ageRange(null)).toBeNull();expect(ageRange(-1)).toBeNull();
 });
 test('la edad cuenta años cumplidos en la fecha de consulta',()=>{
  expect(ageOn('1992-03-04','2026-10-24')).toBe(34);
  expect(ageOn('1992-10-25','2026-10-24')).toBe(33);
  expect(ageOn('1992-10-24','2026-10-24')).toBe(34);
 });
 test.each([
  [['REC'],false,{birth:true,ageRange:false,contact:true}],
  [['MED'],false,{birth:true,ageRange:false,contact:true}],
  [['PAC'],true,{birth:true,ageRange:false,contact:true}],
  [['LAB'],false,{birth:false,ageRange:true,contact:false}],
  [['AST'],false,{birth:true,ageRange:false,contact:false}],
  [['ENF'],false,{birth:true,ageRange:false,contact:false}],
  [['PAR'],false,{birth:true,ageRange:false,contact:false}],
  [['JOP'],false,{birth:false,ageRange:false,contact:false}],
  [['LAB','ENF'],false,{birth:true,ageRange:false,contact:false}],
 ])('%j (dueño: %s) recibe %j',(roles,owner,expected)=>{
  expect(fichaFields(roles,owner)).toEqual(expected);
 });
});
