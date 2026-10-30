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
describe('Tiempo real · recuperación de /eventos al reconectar',()=>{
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
  }}},admin:{auth:{admin:{inviteUserByEmail:jest.fn()}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>now}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('GET /eventos sin cursor o con 0 devuelve la cabeza y ningún evento viejo',async()=>{
  await fixture.pg.query("INSERT INTO plataforma.outbox(tipo,entidad,entidad_id,version,canales) SELECT 'prueba.antiguo','prueba',g::text,1,ARRAY['rol:ADM'] FROM generate_series(1,3) g");
  const max=(await fixture.pg.query<{m:string}>('SELECT max(seq)::text AS m FROM plataforma.outbox')).rows[0].m;
  const pending=(await fixture.pg.query<{n:number}>("SELECT count(*)::int AS n FROM plataforma.outbox WHERE canales && ARRAY['rol:ADM']")).rows[0].n;
  expect(pending).toBeGreaterThan(0);
  for(const path of ['/eventos','/eventos?after=0','/eventos?after=basura']){
   const r=await call('ADM','GET',path);
   expect(r.status).toBe(200);expect(r.body.events).toEqual([]);expect(String(r.body.cursor)).toBe(max);
  }
 });

 test('GET /eventos con cursor pagina de 200 en 200 sin saltar ni repetir',async()=>{
  const start=(await call('ADM','GET','/eventos')).body.cursor as string;
  await fixture.pg.query("INSERT INTO plataforma.outbox(tipo,entidad,entidad_id,version,canales) SELECT 'prueba.paginacion','prueba',g::text,1,ARRAY['rol:ADM'] FROM generate_series(1,450) g");
  const seen:string[]=[];let cursor=start;
  for(let i=0;i<5;i++){
   const page=(await call('ADM','GET',`/eventos?after=${cursor}`)).body;
   if(!page.events.length){expect(String(page.cursor)).toBe(String(cursor));break;}
   expect(page.events.length).toBeLessThanOrEqual(200);
   seen.push(...page.events.map((e:any)=>String(e.seq)));cursor=page.cursor;
  }
  expect(seen).toHaveLength(450);expect(new Set(seen).size).toBe(450);
 });
});
