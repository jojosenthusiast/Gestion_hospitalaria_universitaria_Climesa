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
describe('HU-104 · disponibilidad recursiva, tablero por permiso y capacidad bajo ocupación',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,patientId:string,doctorId:string;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 let extra=0;
 const newPatient=async()=>{
  const query='Persona sin documento '+(++extra),search=await call('PAR','POST','/pacientes/busquedas',{query});
  return (await call('PAR','POST','/pacientes/provisionales',{givenNames:'',surnames:'',sex:'femenino',estimatedAge:30,description:'Persona ficticia para pruebas',searchToken:search.body.token,searchQuery:query})).body.id as string;
 };
 const occupy=async(bed:{id:string;roomId:string},owner?:string)=>{
  const admission=(await fixture.pg.query<{id:string}>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado) VALUES($1,'consulta',$2,'semiprivada','femenino',$3,'hospitalizado') RETURNING id",[owner??await newPatient(),randomUUID(),doctorId])).rows[0];
  await fixture.pg.query("INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) VALUES($1,$2,$3,'semiprivada',tstzrange(now()-interval '1 hour',NULL,'[)'))",[admission.id,bed.id,bed.roomId]);
  return admission.id;
 };
 const bedsOf=async(room:string)=>(await call('REC','GET','/camas')).body.filter((b:any)=>b.room===room);
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
  const search=await call('REC','POST','/pacientes/busquedas',{query:'Ana Lucía'});
  const created=await call('REC','POST','/pacientes',{givenNames:'Ana Lucía',surnames:'Ejemplo Hernández',sex:'femenino',birth:'1990-02-03',dui:'00000001-8',phone:'7000-0000',searchToken:search.body.token,searchQuery:'Ana Lucía'});
  patientId=created.body.id;doctorId=(await call('MED','GET','/auth/me')).body.staffId;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});
 test('escenario 2: con 3 camas ocupadas la planta 2 muestra 9 de 12 libres, conteo por habitación y ruta legible',async()=>{
  const before=(await call('ADM','GET','/espacios')).body;
  expect(before.find((n:any)=>n.code==='P2')).toMatchObject({totalBeds:12,freeBeds:12});
  const h201=await bedsOf('HAB-201'),h203=await bedsOf('HAB-203');
  await occupy(h201[0],patientId);for(const bed of [h201[1],h203[0]])await occupy(bed);
  const tree=(await call('ADM','GET','/espacios')).body;
  expect(tree.find((n:any)=>n.code==='P2')).toMatchObject({totalBeds:12,freeBeds:9});
  expect(tree.find((n:any)=>n.code==='P3')).toMatchObject({totalBeds:5,freeBeds:5});
  const free=(code:string)=>tree.find((n:any)=>n.code===code).freeBeds;
  expect([free('HAB-201'),free('HAB-202'),free('HAB-203'),free('HAB-204'),free('HAB-205'),free('HAB-206')]).toEqual([0,2,1,2,2,2]);
  const bed=(await bedsOf('HAB-203'))[0];
  expect(bed.path).toMatch(/^Planta 2 > .*HAB-203 > Cama [A-B]$/);
  expect(tree.find((n:any)=>n.code==='HAB-203').path).toMatch(/^Planta 2 > .*HAB-203$/);
 });
 test('REC ve el nombre del ocupante y el enfermero de otra área solo iniciales',async()=>{
  const bed=(await bedsOf('HAB-201'))[0];
  const rec=(await call('REC','GET','/camas')).body.find((b:any)=>b.id===bed.id);
  expect(rec).toMatchObject({state:'ocupada',occupant:'Ana Lucía Ejemplo Hernández',occupantRestricted:false,patientId});
  const enf=(await call('ENF','GET','/camas')).body.find((b:any)=>b.id===bed.id);
  expect(enf).toMatchObject({state:'ocupada',occupant:'A.L.E.H.',occupantRestricted:true});
  expect(enf.patientId).toBeUndefined();
 });
 test('una cama con reserva activa se muestra como reservada',async()=>{
  const bed=(await bedsOf('HAB-205'))[0];
  const admission=(await fixture.pg.query<{id:string}>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado) VALUES($1,'consulta',$2,'semiprivada','femenino',$3,'pendiente_cama') RETURNING id",[await newPatient(),randomUUID(),doctorId])).rows[0];
  await fixture.pg.query("INSERT INTO hospitalizacion.reserva_cama(admision_id,cama_id,periodo,estado) VALUES($1,$2,tstzrange(now()-interval '1 hour',now()+interval '1 day','[)'),'activa')",[admission.id,bed.id]);
  const row=(await call('REC','GET','/camas')).body.find((b:any)=>b.id===bed.id);
  expect(row.state).toBe('reservada');expect(row.occupant).toBeUndefined();
 });
 test('reducir la capacidad de una habitación con camas ocupadas responde 409 que explica la ocupación',async()=>{
  const tree=(await call('ADM','GET','/espacios')).body,room=tree.find((n:any)=>n.code==='HAB-201');
  const edit=(capacity:number)=>call('ADM','PATCH',`/espacios/${room.id}`,{code:room.code,name:room.name,type:room.type,parentId:room.parentId,category:room.category,capacity,level:room.level,version:room.version,reason:'Reducción de capacidad de prueba'});
  const result=await edit(1);
  expect(result.status).toBe(409);
  expect(result.body.codigo).toBe('capacidad_bajo_ocupacion');
  expect(result.body.detail).toContain('ocupada');
  const unchanged=(await call('ADM','GET','/espacios')).body.find((n:any)=>n.code==='HAB-201');
  expect(unchanged.capacity).toBe(2);expect(unchanged.version).toBe(room.version);
 });
 test('reducir la capacidad sin ocupación pero con camas activas traduce P0001 a 409 y no a 500',async()=>{
  const tree=(await call('ADM','GET','/espacios')).body,room=tree.find((n:any)=>n.code==='HAB-206');
  const result=await call('ADM','PATCH',`/espacios/${room.id}`,{code:room.code,name:room.name,type:room.type,parentId:room.parentId,category:room.category,capacity:1,level:room.level,version:room.version,reason:'Reducción de capacidad de prueba'});
  expect(result.status).toBe(409);expect(result.body.codigo).toBe('capacidad_menor_que_camas');
 });
});

