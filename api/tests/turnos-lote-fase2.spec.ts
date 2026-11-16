import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { rotationSlots,daysBetween,slotRange } from '../src/operations/rotation.rules';
import { createDatabase,userId } from './support/database';

// Fase 2, flujo F (S12): planificación de turnos en lote. Lunes 16 de noviembre de 2026, 08:00 en El Salvador.
const current=new Date('2026-11-16T14:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:new Date('2027-12-31T00:00:00Z').valueOf()/1000})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
const local=(day:string,time:string)=>new Date(`${day}T${time}:00-06:00`).toISOString();
const HOUR=3_600_000;
jest.setTimeout(180000);

describe('Turnos · reglas puras de rotación (S12)',()=>{
 const days=daysBetween('2026-11-23','2026-12-06');
 const byPerson=(slots:ReturnType<typeof rotationSlots>)=>{const m=new Map<number,{start:number;end:number}[]>();for(const s of slots){const r=slotRange(s.date,s.startTime,s.hours);m.set(s.person,[...(m.get(s.person)??[]),{start:Date.parse(r.start),end:Date.parse(r.end)}]);}return [...m.values()];};
 const minRest=(list:{start:number;end:number}[])=>Math.min(...list.slice(1).map((s,i)=>(s.start-list[i].end)/HOUR));
 const maxIn7Days=(list:{start:number;end:number}[])=>Math.max(...list.map(a=>list.filter(b=>b.start>=a.start&&b.start<a.start+7*24*HOUR).reduce((sum,b)=>sum+(b.end-b.start)/HOUR,0)));

 test('rotativo: tres turnos de 8 h, 5 días de trabajo por cada 7, el turno avanza solo después de los 2 días de descanso',()=>{
  const slots=rotationSlots(9,days,{pattern:'rotativo',startTime:'07:00'});
  expect(new Set(slots.map(s=>s.startTime))).toEqual(new Set(['07:00','15:00','23:00']));
  expect(slots.find(s=>s.startTime==='23:00')!.type).toBe('nocturno');
  for(const list of byPerson(slots)){
   expect(minRest(list)).toBeGreaterThanOrEqual(8);
   expect(maxIn7Days(list)).toBeLessThanOrEqual(48);
  }
  // Con 9 personas cada día tiene mañana, tarde y noche.
  for(const day of days)expect(new Set(slots.filter(s=>s.date===day).map(s=>s.startTime)).size).toBe(3);
 });

 test('12x36: turnos de 12 h con 36 h de descanso; con 4 personas, día y noche cubiertos todos los días',()=>{
  const slots=rotationSlots(4,days,{pattern:'12x36',startTime:'07:00'});
  for(const list of byPerson(slots))expect(minRest(list)).toBe(36);
  for(const day of days)expect(slots.filter(s=>s.date===day).map(s=>[s.startTime,s.type]).sort()).toEqual([['07:00','diurno'],['19:00','nocturno']]);
 });

 test('24x72: guardia de 24 h y 72 h de descanso; con 4 personas, una guardia cada día',()=>{
  const slots=rotationSlots(4,days,{pattern:'24x72',startTime:'07:00'});
  for(const list of byPerson(slots)){expect(minRest(list)).toBe(72);expect(maxIn7Days(list)).toBeLessThanOrEqual(48);}
  for(const day of days)expect(slots.filter(s=>s.date===day).map(s=>[s.hours,s.type])).toEqual([[24,'guardia']]);
 });

 test('personalizado: horas, días de trabajo y de descanso escalonados por persona',()=>{
  const slots=rotationSlots(3,daysBetween('2026-11-23','2026-11-28'),{pattern:'personalizado',startTime:'20:00',hours:10,workDays:2,restDays:1});
  expect(slots.every(s=>s.type==='nocturno'&&s.hours===10)).toBe(true);
  expect(slots.filter(s=>s.person===0).map(s=>s.date)).toEqual(['2026-11-23','2026-11-24','2026-11-26','2026-11-27']);
  for(const day of daysBetween('2026-11-23','2026-11-28'))expect(slots.filter(s=>s.date===day)).toHaveLength(2);
 });
});

describe('Turnos · planificación en lote, generador y plantillas (Fase 2, flujo F)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,emergencyId:string,consultId:string;
 const call=async(role:string,method:string,path:string,body?:unknown,idempotency?:string)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':idempotency??randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 let sequence=0;
 const letters=(n:number)=>n.toString(26).replace(/[0-9a-p]/g,ch=>String.fromCharCode(97+parseInt(ch,26)));
 const person=async(type='asistente',areaId?:string)=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:`Lote ${letters(++sequence)}`,type,...(areaId?{areaId}:{})});
  expect(created.status).toBe(201);
  return created.body.id as string;
 };
 const item=(staffId:string,day:string,from:string,to:string,over:Record<string,unknown>={})=>{
  const start=local(day,from);let end=local(day,to);
  if(Date.parse(end)<=Date.parse(start))end=new Date(Date.parse(end)+24*HOUR).toISOString();
  return {staffId,areaId:emergencyId,start,end,type:'diurno',...over};
 };
 const shifts=async(staffId:string)=>(await fixture.pg.query<{estado:string;inicio:string}>("SELECT estado,lower(periodo)::text AS inicio FROM personal.turno WHERE persona_id=$1 ORDER BY lower(periodo)",[staffId])).rows;
 beforeAll(async()=>{
  fixture=await createDatabase();
  const auth={authClient:{auth:{getUser:async(token:string)=>{
   const [h,b,s]=token.split('.');
   const expected=createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url');
   if(!s||s.length!==expected.length||!timingSafeEqual(Buffer.from(s),Buffer.from(expected)))return {data:{user:null},error:new Error('firma')};
   const p=JSON.parse(Buffer.from(b,'base64url').toString());return {data:{user:{id:p.sub,email:'fixture@example.test'}},error:null};
  }}},admin:{auth:{admin:{inviteUserByEmail:async()=>({data:{user:{id:randomUUID()}},error:null})}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>current,today:()=>'2026-11-16'}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
  const tree=(await call('JOP','GET','/espacios')).body;
  emergencyId=tree.find((n:any)=>n.code==='P1-EMG').id;consultId=tree.find((n:any)=>n.code==='P1-CON').id;
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 // Regla vigente de #114/#122 que el lote reutiliza: un turno suelto sigue validando descanso y tope de 7 días.
 test('crear un turno suelto sigue exigiendo el descanso mínimo y el tope de horas en 7 días',async()=>{
  const p=await person();
  expect((await call('JOP','POST','/turnos',item(p,'2026-11-23','07:00','15:00'))).status).toBe(201);
  const rest=await call('JOP','POST','/turnos',item(p,'2026-11-23','20:00','04:00',{type:'nocturno'}));
  expect(rest.status).toBe(409);expect(rest.body.codigo).toBe('personal_en_descanso');
  // Tres guardias de 24 h suman 72 h (el tope); la cuarta en la misma ventana de 7 días lo supera.
  const g=await person();
  for(const day of ['2026-11-23','2026-11-25','2026-11-27'])expect((await call('JOP','POST','/turnos',item(g,day,'07:00','07:00',{type:'guardia',justification:'Guardias de cobertura de Emergencia'}))).status).toBe(201);
  const cap=await call('JOP','POST','/turnos',item(g,'2026-11-29','07:00','07:00',{type:'guardia',justification:'Guardias de cobertura de Emergencia'}));
  expect(cap.status).toBe(409);expect(cap.body.codigo).toBe('carga_semanal_excedida');
 });

 test('validar un lote no guarda nada y da un resultado por turno; cada turno ve a los anteriores del lote',async()=>{
  const [a,b]=[await person(),await person()];
  expect((await call('JOP','POST','/turnos',item(b,'2026-11-24','07:00','15:00'))).status).toBe(201);
  const result=await call('JOP','POST','/turnos/lote/validar',{items:[
   item(a,'2026-11-24','07:00','15:00'),
   item(a,'2026-11-24','16:00','20:00'),// misma jornada que el anterior del lote
   item(b,'2026-11-24','18:00','23:00'),// descanso tras su turno publicado
   item(a,'2026-11-26','07:00','15:00'),
  ]});
  expect(result.status).toBe(200);
  expect(result.body.resultados.map((r:any)=>[r.index,r.ok,r.codigo??null])).toEqual([[0,true,null],[1,false,'personal_en_descanso'],[2,false,'personal_en_descanso'],[3,true,null]]);
  expect(result.body.resultados[2].mensaje).toMatch(/descanso obligatorio/);
  expect(Array.isArray(result.body.huecos)).toBe(true);
  expect(await shifts(a)).toEqual([]);
  expect((await call('MED','POST','/turnos/lote/validar',{items:[item(a,'2026-11-24','07:00','15:00')]})).status).toBe(403);
  expect((await call('JOP','POST','/turnos/lote/validar',{items:[]})).status).toBe(400);
 });

 test('crear un lote es todo o nada: con un conflicto no se crea ningún borrador y se explica cada turno',async()=>{
  const [a,b]=[await person(),await person()];
  const conflict=await call('JOP','POST','/turnos/lote',{items:[item(a,'2026-11-30','07:00','15:00'),item(a,'2026-11-30','08:00','12:00')]});
  expect(conflict.status).toBe(409);expect(conflict.body.codigo).toBe('lote_con_conflictos');
  expect(conflict.body.resultados.map((r:any)=>r.ok)).toEqual([true,false]);
  expect(await shifts(a)).toEqual([]);

  const key=randomUUID();
  const created=await call('JOP','POST','/turnos/lote',{items:[item(a,'2026-11-30','07:00','15:00'),item(b,'2026-11-30','15:00','23:00')]},key);
  expect(created.status).toBe(201);expect(created.body.creados).toBe(2);
  expect((await call('JOP','POST','/turnos/lote',{items:[item(a,'2026-11-30','07:00','15:00'),item(b,'2026-11-30','15:00','23:00')]},key)).body).toEqual(created.body);
  expect((await shifts(a)).map(s=>s.estado)).toEqual(['borrador']);
  const audit=(await fixture.pg.query<any>("SELECT actor_id,permiso,detalle FROM plataforma.auditoria WHERE accion='turnos.crear_lote' ORDER BY seq DESC LIMIT 1")).rows[0];
  expect(audit).toMatchObject({actor_id:userId('JOP'),permiso:'turnos.planificar'});expect(audit.detalle.borradores).toBe(2);
  // Un borrador no se avisa a la persona (ningún canal usuario:); los roles reciben solo el evento delgado y sus lecturas no traen borradores.
  const channels=(await fixture.pg.query<{canales:string[]}>("SELECT canales FROM plataforma.outbox WHERE entidad_id=ANY($1::text[])",[created.body.ids])).rows;
  expect(channels).toHaveLength(2);
  expect(channels.flatMap(r=>r.canales).filter(c=>c.startsWith('usuario:'))).toEqual([]);
 });

 test('en un lote los borradores suman al tope de 7 días: la cuarta guardia de la semana se marca',async()=>{
  const g=await person();
  const guards=['2026-12-07','2026-12-09','2026-12-11','2026-12-13'].map(d=>item(g,d,'07:00','07:00',{type:'guardia'}));
  const result=await call('JOP','POST','/turnos/lote/validar',{items:guards,justification:'Guardias de cobertura de Emergencia'});
  expect(result.body.resultados.map((r:any)=>r.codigo??'ok')).toEqual(['ok','ok','ok','carga_semanal_excedida']);
  // Sin justificación, las 44 h diurnas de la semana piden una, igual que en un turno suelto.
  const plain=await call('JOP','POST','/turnos/lote/validar',{items:guards.slice(0,3)});
  expect(plain.body.resultados.map((r:any)=>r.codigo??'ok')).toEqual(['ok','ok','horas_semanales_excedidas']);
 });

 test('los borradores nunca llegan al personal; al publicar la semana sí',async()=>{
  const staffId=(await fixture.pg.query<{id:string}>('SELECT persona_personal_id AS id FROM acceso.usuario WHERE id=$1',[userId('AST')])).rows[0].id;
  const created=await call('JOP','POST','/turnos/lote',{items:[item(staffId,'2026-12-01','07:00','15:00',{areaId:consultId})]});
  expect(created.status).toBe(201);
  expect((await call('AST','GET','/turnos/mios')).body.map((s:any)=>s.id)).not.toContain(created.body.ids[0]);
  expect((await call('AST','GET','/turnos?from=2026-11-30&to=2026-12-06')).body.map((s:any)=>s.id)).not.toContain(created.body.ids[0]);
  expect((await call('JOP','GET','/turnos?from=2026-11-30&to=2026-12-06')).body.find((s:any)=>s.id===created.body.ids[0]).state).toBe('borrador');
  const published=await call('JOP','POST','/turnos/publicar',{from:'2026-11-30',to:'2026-12-06',areaId:consultId});
  expect(published.status).toBe(201);expect(published.body.published).toBeGreaterThanOrEqual(1);
  expect((await call('AST','GET','/turnos/mios')).body.find((s:any)=>s.id===created.body.ids[0]).state).toBe('publicado');
 });

 test('un borrador se mueve en el calendario y sigue siendo borrador; deshacer lo devuelve a su horario',async()=>{
  const p=await person();
  const created=(await call('JOP','POST','/turnos/lote',{items:[item(p,'2026-12-02','07:00','15:00')]})).body;
  const moved=await call('JOP','PATCH',`/turnos/${created.ids[0]}`,{...item(p,'2026-12-02','09:00','17:00'),version:1,reason:'Ajuste de borrador en el calendario'});
  expect(moved.status).toBe(200);
  expect(await shifts(p)).toEqual([{estado:'borrador',inicio:expect.stringContaining('2026-12-02 09:00:00')}]);
  const undone=await call('JOP','PATCH',`/turnos/${created.ids[0]}`,{...item(p,'2026-12-02','07:00','15:00'),version:moved.body.version,reason:'Deshacer el cambio anterior'});
  expect(undone.status).toBe(200);
  expect(await shifts(p)).toEqual([{estado:'borrador',inicio:expect.stringContaining('2026-12-02 07:00:00')}]);
 });

 test('el generador reparte una guardia 24x72 por día, no guarda nada y reemplaza a quien no puede',async()=>{
  const group=[await person('asistente',emergencyId),await person('asistente',emergencyId),await person('asistente',emergencyId),await person('asistente',emergencyId)];
  const busy=(await fixture.pg.query<{id:string}>("SELECT id FROM personal.persona WHERE id=ANY($1::uuid[]) ORDER BY apellidos,nombres LIMIT 1",[group])).rows[0].id;
  // La primera persona del grupo ya trabaja la mañana del primer día: su guardia la cubre otra.
  expect((await call('JOP','POST','/turnos',item(busy,'2026-12-14','01:00','06:00',{type:'nocturno'}))).status).toBe(201);
  const before=(await fixture.pg.query<{n:number}>('SELECT count(*)::int AS n FROM personal.turno')).rows[0].n;
  const preview=await call('JOP','POST','/turnos/generar',{areaId:emergencyId,staffIds:group,pattern:'24x72',from:'2026-12-14',to:'2026-12-21'});
  expect(preview.status).toBe(200);
  expect(preview.body.personas).toBe(4);
  const items=preview.body.items as any[];
  expect(items.map(i=>i.start.slice(0,10))).toEqual(['2026-12-14','2026-12-15','2026-12-16','2026-12-17','2026-12-18','2026-12-19','2026-12-20','2026-12-21']);
  expect(items.every(i=>i.type==='guardia'&&Date.parse(i.end)-Date.parse(i.start)===24*HOUR)).toBe(true);
  expect(items[0]).toMatchObject({ok:true,reemplazaA:busy});
  expect(items[0].staffId).not.toBe(busy);
  expect((await fixture.pg.query<{n:number}>('SELECT count(*)::int AS n FROM personal.turno')).rows[0].n).toBe(before);
  // La vista previa se crea tal cual como borradores.
  const ok=items.filter(i=>i.ok).map(({staffId,areaId,start,end,type})=>({staffId,areaId,start,end,type}));
  expect((await call('JOP','POST','/turnos/lote',{items:ok})).status).toBe(201);
 });

 test('el generador pide personas o un grupo, valida el patrón y exige permiso de planificar',async()=>{
  expect((await call('JOP','POST','/turnos/generar',{areaId:emergencyId,pattern:'rotativo',from:'2026-12-14',to:'2026-12-20'})).status).toBe(400);
  expect((await call('JOP','POST','/turnos/generar',{areaId:emergencyId,role:'asistente',pattern:'personalizado',from:'2026-12-14',to:'2026-12-20'})).status).toBe(400);
  expect((await call('JOP','POST','/turnos/generar',{areaId:emergencyId,role:'asistente',pattern:'semanal',from:'2026-12-14',to:'2026-12-20'})).status).toBe(400);
  expect((await call('JOP','POST','/turnos/generar',{areaId:emergencyId,role:'asistente',pattern:'rotativo',from:'2026-12-01',to:'2027-01-31'})).status).toBe(400);
  expect((await call('MED','POST','/turnos/generar',{areaId:emergencyId,role:'asistente',pattern:'rotativo',from:'2026-12-14',to:'2026-12-20'})).status).toBe(403);
 });

 test('plantillas de semana por área: guardar, listar, nombre único y retirar',async()=>{
  const p=await person();
  const body={areaId:emergencyId,name:'Semana base Emergencia',shifts:[{day:0,startTime:'07:00',hours:8,type:'diurno',staffId:p},{day:2,startTime:'19:00',hours:12,type:'nocturno',staffId:p}]};
  const saved=await call('JOP','POST','/turnos/plantillas',body);
  expect(saved.status).toBe(201);
  const list=await call('JOP','GET','/turnos/plantillas');
  expect(list.body.find((t:any)=>t.id===saved.body.id)).toMatchObject({areaId:emergencyId,area:'Emergencia',name:'Semana base Emergencia',version:1,shifts:body.shifts});
  const twice=await call('JOP','POST','/turnos/plantillas',{...body,name:' semana base emergencia '});
  expect(twice.status).toBe(409);expect(twice.body.codigo).toBe('plantilla_duplicada');
  expect((await call('JOP','PATCH',`/turnos/plantillas/${saved.body.id}`,{version:9})).status).toBe(409);
  expect((await call('JOP','PATCH',`/turnos/plantillas/${saved.body.id}`,{version:1})).status).toBe(200);
  expect((await call('JOP','GET','/turnos/plantillas')).body.map((t:any)=>t.id)).not.toContain(saved.body.id);
  expect((await call('JOP','POST','/turnos/plantillas',body)).status).toBe(201);
  expect((await call('MED','GET','/turnos/plantillas')).status).toBe(403);
  const audit=(await fixture.pg.query<any>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion IN ('turnos.plantilla_guardar','turnos.plantilla_retirar')")).rows[0];
  expect(audit.n).toBe(3);
 });
});
