import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase,userId } from './support/database';

// Fase 2, flujo F (S12, L13): the rotation generator fills the minimum coverage of each area and time band; whatever the
// group cannot cover stays as an explained gap in the preview. Monday 16 November 2026, 08:00 in El Salvador.
const current=new Date('2026-11-16T14:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:new Date('2027-12-31T00:00:00Z').valueOf()/1000})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
const local=(day:string,time:string)=>new Date(`${day}T${time}:00-06:00`).toISOString();
const HOUR=3_600_000;
jest.setTimeout(300000);

describe('Turnos · el generador llena la cobertura mínima por área (Fase 2, flujo F, L13)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,receptionId:string,emergencyId:string;
 let queries=0;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 let sequence=0;
 const letters=(n:number)=>n.toString(26).replace(/[0-9a-p]/g,ch=>String.fromCharCode(97+parseInt(ch,26)));
 /** A receptionist of Reception; surnames sort in creation order inside a test (`prefix` keeps tests apart). */
 const person=async(prefix:string,type='recepcionista',areaId=receptionId)=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:`${prefix} ${letters(++sequence).padStart(3,'a')}`,type,areaId});
  expect(created.status).toBe(201);
  return created.body.id as string;
 };
 const count=async()=>(await fixture.pg.query<{n:number}>('SELECT count(*)::int AS n FROM personal.turno')).rows[0].n;
 const day=(iso:string)=>new Date(Date.parse(iso)-6*HOUR).toISOString().slice(0,10);
 /** Custom pattern of one 12 h day shift (07:00-19:00) every `cycle` days: it leaves days for the fill. */
 const sparse=(staffIds:string[],from:string,to:string,cycle=4,areaId=receptionId)=>call('JOP','POST','/turnos/generar',{areaId,staffIds,pattern:'personalizado',startTime:'07:00',hours:12,workDays:1,restDays:cycle-1,from,to});

 beforeAll(async()=>{
  fixture=await createDatabase();
  const counted={...fixture.db,transaction:<T>(work:(c:PoolClient)=>Promise<T>)=>fixture.db.transaction(c=>work({query:(sql:string,params?:unknown[])=>{queries++;return c.query(sql,params);}} as unknown as PoolClient))};
  const auth={authClient:{auth:{getUser:async(token:string)=>{
   const [h,b,s]=token.split('.');
   const expected=createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url');
   if(!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return {data:{user:null},error:new Error('firma')};
   const p=JSON.parse(Buffer.from(b,'base64url').toString());return {data:{user:{id:p.sub,email:'fixture@example.test'}},error:null};
  }}},admin:{auth:{admin:{inviteUserByEmail:async()=>({data:{user:{id:randomUUID()}},error:null})}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(counted).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>current,today:()=>'2026-11-16'}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
  const tree=(await call('JOP','GET','/espacios')).body;
  receptionId=tree.find((n:any)=>n.code==='P1-REC').id;emergencyId=tree.find((n:any)=>n.code==='P1-EMG').id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('llena los huecos del rango hasta la cobertura mínima, los marca como cobertura y no guarda nada',async()=>{
  const group=[await person('Llenar'),await person('Llenar')];
  const before=await count();
  const preview=await sparse(group,'2027-01-04','2027-01-07');
  expect(preview.status).toBe(200);
  const items=preview.body.items as any[];
  // Pattern: first person on the 4th, second on the 7th. The fill covers the 5th and the 6th, 07:00-19:00.
  expect(items.filter(i=>i.origen==='patron').map(i=>[day(i.start),i.staffId])).toEqual([['2027-01-04',group[0]],['2027-01-07',group[1]]]);
  const fills=items.filter(i=>i.origen==='cobertura');
  expect(fills.map(i=>[day(i.start),i.start,i.end,i.ok])).toEqual([
   ['2027-01-05',local('2027-01-05','07:00'),local('2027-01-05','19:00'),true],
   ['2027-01-06',local('2027-01-06','07:00'),local('2027-01-06','19:00'),true],
  ]);
  expect(preview.body.huecos.filter((g:any)=>g.areaId===receptionId)).toEqual([]);
  expect(await count()).toBe(before);
  // The fills are created as drafts like any other preview item.
  const ok=items.filter(i=>i.ok).map(({staffId,areaId,start,end,type})=>({staffId,areaId,start,end,type}));
  expect((await call('JOP','POST','/turnos/lote',{items:ok})).status).toBe(201);
 });

 test('al llenar respeta el descanso mínimo: salta a quien no descansó y toma al siguiente',async()=>{
  const [a,b]=[await person('Descanso'),await person('Descanso')];
  // The second person works the night of the 19th until 03:00 on the 20th: only 6 h, the least loaded of the range.
  expect((await call('JOP','POST','/turnos',{staffId:b,areaId:receptionId,start:local('2027-01-19','21:00'),end:local('2027-01-20','03:00'),type:'nocturno'})).status).toBe(201);
  // One shift every 7 days: only the first person, on the 19th; the 20th and the 21st need a fill.
  const preview=await sparse([a,b],'2027-01-19','2027-01-21',7);
  expect(preview.status).toBe(200);
  const fills=(preview.body.items as any[]).filter(i=>i.origen==='cobertura');
  // On the 20th the second person is resting until 11:00, so the first one covers; on the 21st the second one is free.
  expect(fills.map(i=>[day(i.start),i.staffId,i.ok])).toEqual([['2027-01-20',a,true],['2027-01-21',b,true]]);
  expect(preview.body.huecos.filter((g:any)=>g.areaId===receptionId)).toEqual([]);
 });

 test('lo que nadie puede cubrir queda como hueco con su motivo: tope de 7 días o sin personal de esa función',async()=>{
  const a=await person('Tope');
  // Three 24 h guards in the week before: 72 h, the 7-day cap. Any 12 h shift on the 8th goes over it.
  for(const d of ['2027-02-02','2027-02-04','2027-02-06'])expect((await call('JOP','POST','/turnos',{staffId:a,areaId:receptionId,start:local(d,'07:00'),end:new Date(Date.parse(local(d,'07:00'))+24*HOUR).toISOString(),type:'guardia',justification:'Guardias de cobertura de Recepción'})).status).toBe(201);
  const preview=await sparse([a],'2027-02-08','2027-02-08');
  expect(preview.status).toBe(200);
  expect((preview.body.items as any[]).filter(i=>i.origen==='cobertura'&&i.ok)).toEqual([]);
  expect(preview.body.huecos).toEqual([expect.objectContaining({areaId:receptionId,role:'REC',start:local('2027-02-08','07:00'),end:local('2027-02-08','19:00'),required:1,actual:0,motivo:'carga_semanal_excedida',mensaje:expect.stringMatching(/tope de horas en 7 días/)})]);
  // A group of receptionists cannot cover the doctor and nurse minimum of Emergency.
  const r=await person('Funcion','recepcionista',emergencyId);
  const emergency=await sparse([r],'2027-02-15','2027-02-15',2,emergencyId);
  expect(emergency.status).toBe(200);
  const gaps=emergency.body.huecos as any[];
  expect(new Set(gaps.map(g=>g.role))).toEqual(new Set(['MED','ENF']));
  expect(gaps.every(g=>g.motivo==='sin_personal_elegible'&&/no tiene personal de esa función/.test(g.mensaje))).toBe(true);
 });

 test('el orden del relleno es determinista: primero la persona con menos horas en el rango y, a igualdad, por nombre',async()=>{
  const group=[await person('Orden'),await person('Orden'),await person('Orden')];
  // One shift every 6 days: first person on the 1st of March, third one on the 5th; the 2nd to the 4th need a fill.
  const first=await sparse(group,'2027-03-01','2027-03-05',6);
  expect(first.status).toBe(200);
  const fills=(first.body.items as any[]).filter(i=>i.origen==='cobertura').map(i=>[day(i.start),i.staffId]);
  // 2nd: the second person has 0 h and goes before the first one by load. 3rd: all tie at 12 h, the first one by name.
  // 4th: second and third tie at 12 h (the first one has 24 h), the second one by name.
  expect(fills).toEqual([['2027-03-02',group[1]],['2027-03-03',group[0]],['2027-03-04',group[1]]]);
  const again=await sparse(group,'2027-03-01','2027-03-05',6);
  expect(again.body).toEqual(first.body);
 });

 test('a escala real (60 personas, 31 días) responde en tiempo acotado, aunque casi todo choque, con un límite de pruebas por solicitud',async()=>{
  const group:string[]=[];
  for(let k=0;k<60;k++)group.push(await person('Escala'));
  // Full rotation: every slot fits at the first try.
  queries=0;
  let started=Date.now();
  const rotation=await call('JOP','POST','/turnos/generar',{areaId:receptionId,staffIds:group,pattern:'rotativo',startTime:'07:00',from:'2027-04-01',to:'2027-05-01'});
  let elapsed=Date.now()-started;
  expect(rotation.status).toBe(200);
  // eslint-disable-next-line no-console
  console.log(`generar rotativo 60x31: ${elapsed} ms, ${queries} consultas, ${rotation.body.items.length} turnos, ${rotation.body.intentos} pruebas`);
  expect(rotation.body.items.every((i:any)=>i.ok)).toBe(true);
  expect(rotation.body.intentos).toBe(rotation.body.items.length);
  expect(rotation.body.limiteIntentos).toBe(2000);
  expect(queries).toBeLessThanOrEqual(rotation.body.intentos*13+200);
  // Two 24 h guards in a row break the rest rule for everyone: every second slot looks for substitutes. The request
  // stops at the attempt limit instead of growing with people x days x substitutes.
  queries=0;
  started=Date.now();
  const clash=await call('JOP','POST','/turnos/generar',{areaId:receptionId,staffIds:group,pattern:'personalizado',startTime:'07:00',hours:24,workDays:2,restDays:1,from:'2027-06-01',to:'2027-07-01',justification:'Guardias de cobertura de Recepción'});
  elapsed=Date.now()-started;
  expect(clash.status).toBe(200);
  // eslint-disable-next-line no-console
  console.log(`generar guardias 60x31: ${elapsed} ms, ${queries} consultas, ${clash.body.items.length} turnos, ${clash.body.intentos} pruebas`);
  expect(clash.body.intentos).toBe(2000);
  expect(clash.body.items.some((i:any)=>i.codigo==='limite_de_intentos'&&/límite de pruebas/.test(i.mensaje))).toBe(true);
  expect(queries).toBeLessThanOrEqual(2000*13+200);
  expect(elapsed).toBeLessThan(60000);
 });
});
