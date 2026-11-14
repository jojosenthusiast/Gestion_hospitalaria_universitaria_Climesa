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
describe('Turnos · catálogo de filtros y asignación (obs. 2 y 9)',()=>{
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

 test('cualquier rol que ve turnos recibe el catálogo completo de áreas, funciones y personal activo',async()=>{
  const nurse=await person('enfermero'),doctor=await person('medico');
  const asLab=await call('LAB','GET','/turnos/catalogo');
  expect(asLab.status).toBe(200);
  const {roles,areas,staff}=asLab.body;
  expect(areas.map((a:any)=>a.code)).toEqual(expect.arrayContaining(['P1-EMG','P1-CON']));
  expect(roles.map((r:any)=>r.code)).toEqual(expect.arrayContaining(['medico','enfermero']));
  expect(staff.map((p:any)=>p.id)).toEqual(expect.arrayContaining([nurse.id,doctor.id]));
  const mine=staff.find((p:any)=>p.id===doctor.id);
  expect(mine.registrations).toEqual([{validFrom:'2026-01-01',validTo:'2026-12-31'}]);
  expect(Object.keys(mine).sort()).toEqual(['area','areaId','id','name','registrations','specialty','type']);
  expect(areas.every((a:any)=>['area','planta','consultorio','hospital'].includes(a.type))).toBe(true);
 });

 test('no incluye personal inactivo y exige turnos.ver',async()=>{
  const gone=await person('asistente');
  await fixture.pg.query('UPDATE personal.persona SET activo=false WHERE id=$1',[gone.id]);
  const result=await call('JOP','GET','/turnos/catalogo');
  expect(result.body.staff.map((p:any)=>p.id)).not.toContain(gone.id);
  expect((await call('PAC','GET','/turnos/catalogo')).status).toBe(403);
 });
});
