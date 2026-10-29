import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { canonicalPair,isPossibleDuplicate,phonetic } from '../src/patients/patient.rules';
import { createDatabase,userId } from './support/database';
const now=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:now.valueOf()/1000+3600})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
const key=(id:string,surnames:string,given:string,birth:string|null)=>({id,fonApellido:phonetic(surnames),fonNombres:phonetic(given),nacimiento:birth});
// FR-102-09: regla pura de semejanza entre registros.
describe('Pacientes · regla de posible duplicado',()=>{
 test('mismo apellido fonético, mismos nombres fonéticos y misma fecha son posible duplicado',()=>{
  expect(isPossibleDuplicate(key('a','Hernández Vásquez','José','1985-07-14'),key('b','Hernandes Basquez','Jose','1985-07-14'))).toBe(true);
 });
 test.each([
  ['fecha distinta',key('b','Hernandes Basquez','Jose','1985-07-15')],
  ['fecha desconocida',key('b','Hernandes Basquez','Jose',null)],
  ['apellido fonético distinto',key('b','Martínez','Jose','1985-07-14')],
  ['nombres fonéticos distintos',key('b','Hernandes Basquez','Mario','1985-07-14')],
  ['el mismo paciente',key('a','Hernandes Basquez','Jose','1985-07-14')],
  ['claves fonéticas vacías',key('b','','','1985-07-14')],
 ])('no es posible duplicado con %s',(_label,other)=>{
  expect(isPossibleDuplicate(key('a','Hernández Vásquez','José','1985-07-14'),other)).toBe(false);
 });
 test('sin fecha de nacimiento nunca hay semejanza, ni contra otro sin fecha',()=>{
  expect(isPossibleDuplicate(key('a','Pérez','Ana',null),key('b','Pérez','Ana',null))).toBe(false);
 });
 test('el par canónico queda ordenado sin importar el orden de entrada',()=>{
  expect(canonicalPair('b','a')).toEqual(['a','b']);
  expect(canonicalPair('a','b')).toEqual(['a','b']);
 });
});

describe('Pacientes · casos de posible duplicado (FR-102-09)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>;
 const call=async(role:string,method:string,path:string,body?:unknown,idempotency?:string)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':idempotency??randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const register=async(data:Record<string,unknown>,query:string,idempotency?:string)=>{
  const search=await call('REC','POST','/pacientes/busquedas',{query});
  return call('REC','POST','/pacientes',{...data,searchToken:search.body.token,searchQuery:query},idempotency);
 };
 const cases=(ids:string[])=>fixture.pg.query<any>('SELECT * FROM pacientes.caso_duplicado WHERE pacientes_ids && $1::uuid[]',[ids]).then(r=>r.rows);
 const base={sex:'femenino',phone:'7000-1234'};
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
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('un registro parecido abre exactamente un caso, queda sospechado y no fusiona ni bloquea',async()=>{
  const first=await register({...base,givenNames:'Lucía',surnames:'Ramírez Cañas',birth:'1990-03-05'},'Lucía Ramírez');
  expect(first.status).toBe(201);
  const second=await register({...base,givenNames:'Lucia',surnames:'Ramirez Canas',birth:'1990-03-05'},'Lucia Ramirez');
  expect(second.status).toBe(201);
  expect(Object.keys(second.body).sort()).toEqual(['id','record','version']);
  expect(second.body.id).not.toBe(first.body.id);
  const found=await cases([first.body.id,second.body.id]);
  expect(found).toHaveLength(1);
  expect(found[0].estado).toBe('sospechado');
  expect(found[0].pacientes_ids).toEqual([first.body.id,second.body.id].sort());
  expect(found[0].abierto_por).toBe(userId('REC'));
  const rows=(await fixture.pg.query<any>('SELECT estado FROM pacientes.paciente WHERE id=ANY($1::uuid[])',[[first.body.id,second.body.id]])).rows;
  expect(rows).toEqual([{estado:'activo'},{estado:'activo'}]);
  const audit=(await fixture.pg.query<any>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion='pacientes.caso_duplicado.abrir' AND entidad_id=$1",[found[0].id])).rows[0].n;
  expect(audit).toBe(1);
  const event=(await fixture.pg.query<any>("SELECT canales FROM plataforma.outbox WHERE tipo='caso_duplicado.abierto' AND entidad_id=$1",[found[0].id])).rows;
  expect(event).toEqual([{canales:['rol:REC']}]);
 });
 test('otra fecha de nacimiento o otra fonética no abren caso',async()=>{
  const first=await register({...base,givenNames:'Marta',surnames:'Quintanilla Rivas',birth:'1975-01-20'},'Marta Quintanilla');
  const otherDate=await register({...base,givenNames:'Marta',surnames:'Quintanilla Rivas',birth:'1975-01-21'},'Marta Quintanilla');
  const otherSound=await register({...base,givenNames:'Marta',surnames:'Quinteros',birth:'1975-01-20'},'Marta Quinteros');
  expect([first.status,otherDate.status,otherSound.status]).toEqual([201,201,201]);
  expect(await cases([first.body.id,otherDate.body.id,otherSound.body.id])).toHaveLength(0);
 });
 test('un DUI repetido sigue siendo 409 y no abre caso',async()=>{
  const first=await register({...base,givenNames:'Rafael',surnames:'Domínguez Soto',birth:'1982-11-02',dui:'00000002-6'},'Rafael Domínguez');
  expect(first.status).toBe(201);
  const repeated=await register({...base,givenNames:'Rafael',surnames:'Dominguez Soto',birth:'1982-11-02',dui:'00000002-6'},'Rafael Dominguez');
  expect(repeated.status).toBe(409);
  expect(await cases([first.body.id])).toHaveLength(0);
 });
 test('reintentar con la misma clave de idempotencia no duplica el caso ni el paciente',async()=>{
  const first=await register({...base,givenNames:'Elena',surnames:'Cruz Alvarado',birth:'1968-06-30'},'Elena Cruz');
  const retryKey=randomUUID();
  const search=await call('REC','POST','/pacientes/busquedas',{query:'Elena Cruz'});
  const body={...base,givenNames:'Elena',surnames:'Cruz Alvarado',birth:'1968-06-30',searchToken:search.body.token,searchQuery:'Elena Cruz'};
  const second=await call('REC','POST','/pacientes',body,retryKey);
  const retry=await call('REC','POST','/pacientes',body,retryKey);
  expect(second.status).toBe(201);
  expect(retry.body).toEqual(second.body);
  expect(await cases([first.body.id,second.body.id])).toHaveLength(1);
  expect((await fixture.pg.query<any>("SELECT count(*)::int AS n FROM pacientes.paciente WHERE nombres='Elena' AND primer_apellido='Cruz Alvarado'")).rows[0].n).toBe(2);
 });
 test('un tercer registro parecido abre un caso por cada par, siempre con el par ordenado',async()=>{
  const ids:string[]=[];
  for(const _ of [1,2,3])ids.push((await register({...base,givenNames:'Sofía',surnames:'Zelaya Pineda',birth:'2001-09-09'},'Sofía Zelaya')).body.id);
  const found=await cases(ids);
  expect(found).toHaveLength(3);
  for(const row of found)expect(row.pacientes_ids).toEqual([...row.pacientes_ids].sort());
 });

 describe('GET /pacientes/casos-duplicado',()=>{
  test('REC y JOP lo leen con los dos pacientes mínimos y el motivo, sin datos personales extra',async()=>{
   const a=await register({...base,givenNames:'Gabriela',surnames:'Peña Orellana',birth:'1995-04-17',dui:'00000003-4'},'Gabriela Peña');
   const b=await register({...base,givenNames:'Gabriela',surnames:'Pena Orellana',birth:'1995-04-17'},'Gabriela Pena');
   for(const role of ['REC','JOP']){
    const result=await call(role,'GET','/pacientes/casos-duplicado');
    expect(result.status).toBe(200);
    const item=result.body.find((c:any)=>c.patients.some((p:any)=>p.id===a.body.id));
    expect(item).toBeDefined();
    expect(item.state).toBe('sospechado');
    expect(item.reason).toEqual(expect.any(String));
    expect(item.patients.map((p:any)=>p.id).sort()).toEqual([a.body.id,b.body.id].sort());
    expect(item.patients.map((p:any)=>p.fullName).sort()).toEqual(['Gabriela Pena Orellana','Gabriela Peña Orellana']);
    for(const p of item.patients){
     expect(Object.keys(p).sort()).toEqual(['fullName','id','record']);
    }
   }
   const recent=await call('REC','GET','/pacientes/casos-duplicado?limit=1');
   expect(recent.body).toHaveLength(1);
  });
  test.each(['PAC','MED','ENF','AST','LAB','PAR','ADM'])('el rol %s no tiene pacientes.gestionar_duplicados y recibe 403',async role=>{
   expect((await call(role,'GET','/pacientes/casos-duplicado')).status).toBe(403);
  });
  test('un caso descartado deja de listarse',async()=>{
   const a=await register({...base,givenNames:'Hilda',surnames:'Mejía Bonilla',birth:'1959-12-25'},'Hilda Mejía');
   const b=await register({...base,givenNames:'Hilda',surnames:'Mejia Bonilla',birth:'1959-12-25'},'Hilda Mejia');
   await fixture.pg.query("UPDATE pacientes.caso_duplicado SET estado='descartado' WHERE pacientes_ids && $1::uuid[]",[[a.body.id,b.body.id]]);
   const result=await call('REC','GET','/pacientes/casos-duplicado');
   expect(result.body.some((c:any)=>c.patients.some((p:any)=>p.id===a.body.id))).toBe(false);
  });
  test('cada lectura queda auditada',async()=>{
   const before=(await fixture.pg.query<any>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion='pacientes.casos_duplicado'")).rows[0].n;
   await call('REC','GET','/pacientes/casos-duplicado');
   const after=(await fixture.pg.query<any>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion='pacientes.casos_duplicado'")).rows[0].n;
   expect(after).toBe(before+1);
  });
 });
});
