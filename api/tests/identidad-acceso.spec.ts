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
describe('Spec 101 — identidad, canales y ciclo de vida de cuentas',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,inviteProvider:jest.Mock;
 const call=async(role:string,method:string,path:string,body?:unknown,key?:string)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':key??randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const version=async(role:string)=>(await fixture.pg.query<{version:number}>('SELECT version FROM acceso.usuario WHERE id=$1',[userId(role)])).rows[0].version;
 const permissionCodes=async(roles:string[])=>(await fixture.pg.query<{codigo:string}>('SELECT DISTINCT permiso_codigo AS codigo FROM acceso.rol_permiso WHERE rol_codigo=ANY($1::text[]) ORDER BY 1',[roles])).rows.map(r=>r.codigo);
 beforeAll(async()=>{
  fixture=await createDatabase();
  inviteProvider=jest.fn(async()=>({data:{user:{id:randomUUID()}},error:null}));
  const auth={authClient:{auth:{getUser:async(token:string)=>{
   const [h,b,s]=token.split('.');
   const expected=createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url');
   if(!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return {data:{user:null},error:new Error('firma')};
   const p=JSON.parse(Buffer.from(b,'base64url').toString());return {data:{user:{id:p.sub,email:'fixture@example.test'}},error:null};
  }}},admin:{auth:{admin:{inviteUserByEmail:inviteProvider}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>now}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('A1: /auth/me con REC y LAB devuelve la unión exacta de permisos, roles ordenados y plataformas',async()=>{
  await fixture.pg.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,$2)',[userId('REC'),'LAB']);
  const profile=(await call('REC','GET','/auth/me')).body;
  const codes=[...new Set<string>(profile.permissions.map((p:any)=>p.code))].sort();
  const [rec,lab,adm]=await Promise.all([permissionCodes(['REC']),permissionCodes(['LAB']),permissionCodes(['ADM'])]);
  expect(profile.roles).toEqual(['LAB','REC']);
  expect(codes).toEqual(await permissionCodes(['REC','LAB']));
  expect(codes).toContain('laboratorio.procesar');expect(lab).toContain('laboratorio.procesar');expect(rec).not.toContain('laboratorio.procesar');
  const onlyRec=rec.filter(c=>!lab.includes(c));expect(onlyRec.length).toBeGreaterThan(0);expect(onlyRec.every(c=>codes.includes(c))).toBe(true);
  const onlyAdm=adm.filter(c=>!rec.includes(c)&&!lab.includes(c));expect(onlyAdm.length).toBeGreaterThan(0);expect(onlyAdm.some(c=>codes.includes(c))).toBe(false);
  const platforms=(await fixture.pg.query<{plataformas:string[]}>("SELECT plataformas FROM acceso.rol WHERE codigo IN ('REC','LAB')")).rows.flatMap(r=>r.plataformas.map(p=>p.toLowerCase()));
  expect([...profile.platforms].sort()).toEqual([...new Set(platforms)].sort());
  await fixture.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='LAB'",[userId('REC')]);
 });

 test('A2: canales de Realtime por rol y cuenta inactiva sin canales',async()=>{
  const pac=(await call('PAC','GET','/auth/me')).body.channels as string[];
  expect([...pac].sort()).toEqual(['publico','rol:PAC',`usuario:${userId('PAC')}`].sort());expect(pac).not.toContain('ambulancia');
  const rec=(await call('REC','GET','/auth/me')).body.channels as string[];
  expect(rec).toEqual(expect.arrayContaining(['rol:REC','ambulancia','publico',`usuario:${userId('REC')}`]));
  const channels=async(role:string)=>(await fixture.pg.query<{c:string[]}>('SELECT acceso.canales_de($1) AS c',[userId(role)])).rows[0].c;
  expect(await channels('PAC')).toEqual(expect.arrayContaining(['rol:PAC']));
  await fixture.pg.query("UPDATE acceso.usuario SET estado='desactivado' WHERE id=$1",[userId('PAC')]);
  try{expect(await channels('PAC')).toEqual([]);}finally{await fixture.pg.query("UPDATE acceso.usuario SET estado='activo' WHERE id=$1",[userId('PAC')]);}
 });

 test('A3a: desactivar por PATCH /usuarios/:id/estado bloquea /auth/me con 401',async()=>{
  expect((await call('AST','GET','/auth/me')).status).toBe(200);
  const state=await call('ADM','PATCH',`/usuarios/${userId('AST')}/estado`,{state:'desactivado',version:await version('AST'),reason:'Baja de cuenta de prueba'});
  expect(state.status).toBe(200);expect(state.body.state).toBe('desactivado');
  expect((await call('AST','GET','/auth/me')).status).toBe(401);
 });

 test('A3b: el cambio de roles se refleja de inmediato en el siguiente /auth/me',async()=>{
  const set=async(roles:string[])=>call('ADM','PATCH',`/usuarios/${userId('ENF')}/roles`,{roles,version:await version('ENF'),reason:'Cambio de rol de prueba'});
  expect((await set(['ENF','LAB'])).status).toBe(200);
  const withLab=(await call('ENF','GET','/auth/me')).body;
  expect(withLab.roles).toEqual(['ENF','LAB']);expect(withLab.permissions.some((p:any)=>p.code==='laboratorio.procesar')).toBe(true);expect(withLab.channels).toContain('rol:LAB');
  expect((await set(['ENF'])).status).toBe(200);
  const back=(await call('ENF','GET','/auth/me')).body;
  expect(back.roles).toEqual(['ENF']);expect(back.permissions.some((p:any)=>p.code==='laboratorio.procesar')).toBe(false);expect(back.channels).not.toContain('rol:LAB');
 });

 test('A3c: invita a un rol de personal con staffId válido; el reintento devuelve lo mismo',async()=>{
  const staff=(await fixture.pg.query<{id:string}>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Elena','Sin cuenta','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id")).rows[0];
  const key=randomUUID(),body={email:'medica.nueva@example.test',displayName:'Médica ficticia nueva',roles:['MED'],staffId:staff.id};
  const before=inviteProvider.mock.calls.length;
  const first=await call('ADM','POST','/usuarios/invitaciones',body,key);
  expect(first.status).toBe(201);expect(first.body.roles).toEqual(['MED']);
  const again=await call('ADM','POST','/usuarios/invitaciones',body,key);
  expect(again.body).toEqual(first.body);expect(inviteProvider.mock.calls.length-before).toBe(1);
  const linked=(await fixture.pg.query<{persona_personal_id:string}>('SELECT persona_personal_id FROM acceso.usuario WHERE id=$1',[first.body.userId])).rows[0];
  expect(linked.persona_personal_id).toBe(staff.id);
 });

 test('A3d: ADM no se asigna roles a sí mismo; queda fila de auditoría denegada',async()=>{
  const denied=async()=>(await fixture.pg.query<{resultado:string}>("SELECT resultado FROM plataforma.auditoria WHERE actor_id=$1 AND permiso='usuarios.asignar_roles' AND resultado='denegado'",[userId('ADM')])).rows;
  const before=(await denied()).length;
  const response=await call('ADM','PATCH',`/usuarios/${userId('ADM')}/roles`,{roles:['ADM','PAC'],version:await version('ADM'),reason:'Prueba de autoasignación'});
  expect(response.status).toBe(403);
  const rows=await denied();expect(rows.length).toBeGreaterThan(before);expect(rows.at(-1)?.resultado).toBe('denegado');
  expect((await fixture.pg.query<{n:number}>("SELECT count(*)::int AS n FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='PAC'",[userId('ADM')])).rows[0].n).toBe(0);
 });
});
