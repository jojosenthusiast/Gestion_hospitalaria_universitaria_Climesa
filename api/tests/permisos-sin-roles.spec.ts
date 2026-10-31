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
// Caracterización del comportamiento por rol de las decisiones que antes comparaban códigos de rol (regla 8 de AGENTS.md).
// Fija lo que cada rol recibe hoy; el refactor a permisos del catálogo debe dejar estas pruebas intactas.
describe('Decisiones por rol que ahora salen del catálogo de permisos',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,inviteCount=0;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const staff=async(type='recepcionista',extra:Record<string,unknown>={})=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:`Ficticia ${'abcdefghij'[inviteCount++%10]}${inviteCount}`.replace(/\d/g,c=>'klmnopqrst'[Number(c)]),type,...extra});
  expect(created.status).toBe(201);return created.body.id as string;
 };
 const invite=async(role:string,roles:string[],staffId?:string)=>call(role,'POST','/usuarios/invitaciones',{email:`persona${++inviteCount}@example.test`,displayName:'Persona Ficticia',roles,...(staffId?{staffId}:{})});
 let patientId:string,draftId:string;
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
  const search=await call('REC','POST','/pacientes/busquedas',{query:'Marta Ejemplo'});
  const created=await call('REC','POST','/pacientes',{givenNames:'Marta',surnames:'Ejemplo Prueba',sex:'femenino',birth:'1980-05-06',dui:'00000001-8',phone:'7000-1111',searchToken:search.body.token,searchQuery:'Marta Ejemplo'});
  expect(created.status).toBe(201);patientId=created.body.id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 describe('fecha de nacimiento en la búsqueda de pacientes',()=>{
  test.each([['JOP',false],['REC',true],['AST',true],['ENF',true],['MED',true],['LAB',true],['PAR',true]])('GET /pacientes como %s: fecha de nacimiento presente = %s',async(role,shown)=>{
   const result=await call(role,'GET','/pacientes?query=Marta');
   expect(result.status).toBe(200);
   const row=result.body.find((p:any)=>p.id===patientId);expect(row).toBeDefined();
   expect('birth' in row).toBe(shown);
  });
  test('JOP con otro rol de búsqueda suma lo que da ese rol',async()=>{
   await fixture.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'MED')",[userId('JOP')]);
   try{
    const row=(await call('JOP','GET','/pacientes?query=Marta')).body.find((p:any)=>p.id===patientId);
    expect('birth' in row).toBe(true);
   }finally{await fixture.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='MED'",[userId('JOP')]);}
  });
  test.each([['JOP',false],['REC',true],['LAB',true]])('POST /pacientes/busquedas como %s: fecha de nacimiento presente = %s',async(role,shown)=>{
   const result=await call(role,'POST','/pacientes/busquedas',{query:'Marta Ejemplo'});
   expect(result.status).toBe(201);
   const row=result.body.candidates.find((p:any)=>p.id===patientId);expect(row).toBeDefined();
   expect('birth' in row).toBe(shown);
  });
 });

 describe('DUI y teléfono del personal',()=>{
  test('solo ADM los recibe; JOP ve el directorio sin ellos',async()=>{
   const id=await staff('recepcionista',{dui:'00000001-8',phone:'7000-2222'});
   const admin=(await call('ADM','GET','/personal')).body.find((p:any)=>p.id===id);
   expect(admin.dui).toBeTruthy();expect(admin.phone).toBe('7000-2222');
   const jop=(await call('JOP','GET','/personal')).body.find((p:any)=>p.id===id);
   expect(jop).toBeDefined();expect('dui' in jop).toBe(false);expect('phone' in jop).toBe(false);
  });
 });

 describe('borradores de turnos',()=>{
  test('ADM y JOP ven el borrador; los demás roles solo turnos publicados',async()=>{
   const tree=(await call('JOP','GET','/espacios')).body;
   const areaId=tree.find((n:any)=>n.code==='P1-EMG').id;
   const created=await call('JOP','POST','/turnos',{staffId:await staff(),areaId,type:'diurno',start:'2026-11-10T06:00:00-06:00',end:'2026-11-10T14:00:00-06:00'});
   expect(created.status).toBe(201);draftId=created.body.id;
   for(const [role,sees] of [['ADM',true],['JOP',true],['REC',false],['AST',false],['ENF',false],['MED',false],['LAB',false],['PAR',false]] as [string,boolean][]){
    const list=await call(role,'GET','/turnos');
    expect([role,list.status]).toEqual([role,200]);
    expect([role,list.body.some((t:any)=>t.id===draftId)]).toEqual([role,sees]);
   }
  });
 });

 describe('invitaciones y jerarquía de administración',()=>{
  test('el único ADM activo puede invitar administradores antes de fijar el principal',async()=>{
   expect((await call('ADM','GET','/auth/me')).body.canInviteAdmin).toBe(true);
   for(const role of ['REC','MED','JOP'])expect((await call(role,'GET','/auth/me')).body.canInviteAdmin).toBe(false);
  });
  test('los roles de trabajo exigen persona del directorio; ADM, JOP, DPD y PAC no',async()=>{
   for(const role of ['REC','AST','ENF','MED','LAB','PAR']){
    const without=await invite('ADM',[role]);expect([role,without.status]).toEqual([role,400]);
    const withStaff=await invite('ADM',[role],await staff());expect([role,withStaff.status]).toEqual([role,201]);
   }
   for(const role of ['JOP','DPD','PAC'])expect([role,(await invite('ADM',[role])).status]).toEqual([role,201]);
  });
  test('un rol de trabajo mezclado con uno que no lo exige sigue pidiendo persona',async()=>{
   expect((await invite('ADM',['JOP','MED'])).status).toBe(400);
  });
  test('invitar ADM fija al invitador como principal; otro administrador no puede crear administradores',async()=>{
   expect((await invite('ADM',['ADM'])).status).toBe(201);
   expect((await fixture.pg.query<{usuario_id:string}>('SELECT usuario_id FROM acceso.administrador_principal')).rows[0].usuario_id).toBe(userId('ADM'));
   // DPD recibe además el rol de administrador sin ser el principal.
   await fixture.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'ADM')",[userId('DPD')]);
   expect((await call('DPD','GET','/auth/me')).body.canInviteAdmin).toBe(false);
   expect((await call('ADM','GET','/auth/me')).body.canInviteAdmin).toBe(true);
   const denied=await invite('DPD',['ADM']);expect(denied.status).toBe(403);
   expect((await invite('DPD',['PAC'])).status).toBe(201);
  });
  test('asignar el rol ADM por cambio de roles: el principal sí; otro administrador no',async()=>{
   const version=async(role:string)=>(await fixture.pg.query<{version:number}>('SELECT version FROM acceso.usuario WHERE id=$1',[userId(role)])).rows[0].version;
   const denied=await call('DPD','PATCH',`/usuarios/${userId('PAC')}/roles`,{roles:['PAC','ADM'],version:await version('PAC'),reason:'Prueba de jerarquía'});
   expect(denied.status).toBe(403);
   const allowed=await call('ADM','PATCH',`/usuarios/${userId('PAC')}/roles`,{roles:['PAC','ADM'],version:await version('PAC'),reason:'Prueba de jerarquía'});
   expect(allowed.status).toBe(200);
   // Cambiar roles de una cuenta que ya es ADM no vuelve a pedir autoridad de principal (comportamiento actual).
   const onAdmin=await call('DPD','PATCH',`/usuarios/${userId('PAC')}/roles`,{roles:['PAC','ADM'],version:await version('PAC'),reason:'Cuenta que ya es administradora'});
   expect(onAdmin.status).toBe(200);
  });
 });
});
