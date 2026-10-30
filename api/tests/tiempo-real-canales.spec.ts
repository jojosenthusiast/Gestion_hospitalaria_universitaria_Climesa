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
describe('Tiempo real · canales derivados del catálogo',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const channelsOf=async(type:string,entityId?:string)=>{
  const rows=(await fixture.pg.query<{canales:string[]}>(`SELECT canales FROM plataforma.outbox WHERE tipo=$1 ${entityId?'AND entidad_id=$2':''} ORDER BY seq DESC LIMIT 1`,entityId?[type,entityId]:[type])).rows;
  return rows[0]?.canales??[];
 };
 const rolesWith=async(...codes:string[])=>(await fixture.pg.query<{rol_codigo:string}>('SELECT DISTINCT rol_codigo FROM acceso.rol_permiso WHERE permiso_codigo=ANY($1::text[]) ORDER BY 1',[codes])).rows.map(r=>`rol:${r.rol_codigo}`);
 const patient={givenNames:'Ana Lucía',surnames:'Ejemplo Hernández',sex:'femenino',birth:'1990-02-03',dui:'00000001-8',phone:'7000-0000'};
 let patientId:string;
 beforeAll(async()=>{
  fixture=await createDatabase();
  const auth={authClient:{auth:{getUser:async(token:string)=>{
   const [h,b,s]=token.split('.');
   const expected=createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url');
   if(!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return {data:{user:null},error:new Error('firma')};
   const p=JSON.parse(Buffer.from(b,'base64url').toString());return {data:{user:{id:p.sub,email:'fixture@example.test'}},error:null};
  }}},admin:{auth:{admin:{inviteUserByEmail:jest.fn()}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>now}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('paciente.creado llega a los roles del catálogo que leen pacientes (no a ADM ni a PAC)',async()=>{
  const search=await call('REC','POST','/pacientes/busquedas',{query:'Ana Lucía'});
  const created=await call('REC','POST','/pacientes',{...patient,searchToken:search.body.token,searchQuery:'Ana Lucía'});
  expect(created.status).toBe(201);patientId=created.body.id;
  const channels=await channelsOf('paciente.creado',patientId);
  for(const role of ['rol:REC','rol:JOP','rol:MED','rol:ENF','rol:LAB'])expect(channels).toContain(role);
  expect(channels).not.toContain('rol:PAC');expect(channels).not.toContain('rol:ADM');
 });

 test('paciente.actualizado incluye la cuenta del propio paciente y no la del editor',async()=>{
  await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1',[userId('PAC'),patientId]);
  const edited=await call('REC','PATCH',`/pacientes/${patientId}`,{...patient,surnames:'Ejemplo Hernández Gómez',version:1,reason:'Corrección del segundo apellido'});
  expect(edited.status).toBe(200);
  const channels=await channelsOf('paciente.actualizado',patientId);
  expect(channels).toContain(`usuario:${userId('PAC')}`);
  expect(channels).not.toContain(`usuario:${userId('REC')}`);
  expect(channels).toEqual(expect.arrayContaining(await rolesWith('pacientes.buscar')));
  const state=await call('REC','POST',`/pacientes/${patientId}/estado`,{active:false,version:2,reason:'Cierre de prueba del expediente'});
  expect(state.status).toBe(201);
  expect(await channelsOf('paciente.actualizado',patientId)).toContain(`usuario:${userId('PAC')}`);
 });

 test('cama.estado_cambiado y espacio.actualizado llegan a ADM y a todo rol con el permiso de verlos',async()=>{
  const beds=(await call('REC','GET','/camas')).body;
  const bed=beds.find((b:any)=>b.state==='libre');
  const version=(await fixture.pg.query<{version:number}>('SELECT version FROM infra.espacio WHERE id=$1',[bed.id])).rows[0].version;
  expect((await call('JOP','POST',`/camas/${bed.id}/bloquear`,{version,motivo:'Mantenimiento preventivo'})).status).toBe(201);
  const expected=await rolesWith('camas.ver_tablero','espacios.ver');
  const bedChannels=await channelsOf('cama.estado_cambiado',bed.id);
  expect(bedChannels).toContain('rol:ADM');
  expect(bedChannels).toEqual(expect.arrayContaining(expected));
  const tree=(await call('ADM','GET','/espacios')).body;
  const floor=tree.find((n:any)=>n.code==='P2');
  const saved=await call('ADM','PATCH',`/espacios/${floor.id}`,{code:floor.code,name:floor.name+' B',type:floor.type,parentId:floor.parentId,category:floor.category,capacity:floor.capacity,level:floor.level,version:1,reason:'Renombre de prueba'});
  expect(saved.status).toBe(200);
  const spaceChannels=await channelsOf('espacio.actualizado',floor.id);
  expect(spaceChannels).toContain('rol:ADM');
  expect(spaceChannels).toEqual(expect.arrayContaining(expected));
 });

});
