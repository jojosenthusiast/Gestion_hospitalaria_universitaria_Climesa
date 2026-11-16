import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { PersonnelService } from '../src/operations/personnel.service';
import { CREW_ROLES_ON_DUTY_SQL } from '../src/ambulance/ambulance.rules';
import { allowedActions,attendanceOf,consecutiveDays,windowLoad } from '../src/operations/shift.rules';
import { createDatabase,userId } from './support/database';
let current=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string)=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:new Date('2027-12-31T00:00:00Z').valueOf()/1000})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
const local=(day:string,time:string)=>`${day}T${time}:00-06:00`;
jest.setTimeout(180000);

describe('Reglas puras de turnos (ASIS-01, CARGA-01, MA-TUR-03)',()=>{
 const start=Date.parse(local('2026-11-10','07:00')),end=Date.parse(local('2026-11-10','15:00'));
 test('la entrada se confirma sola a la hora de inicio; ausente manda y nunca queda "sin confirmar"',()=>{
  const s={state:'publicado',start,end,presentSince:null};
  expect(attendanceOf(s,start-60_000)).toBe('pendiente');
  expect(attendanceOf({...s,state:'en_curso'},start)).toBe('presente');
  expect(attendanceOf({...s,state:'en_curso'},start+60*60_000)).toBe('presente');
  expect(attendanceOf({...s,state:'completado',presentSince:start},end+60_000)).toBe('presente');
  expect(attendanceOf({...s,state:'ausente'},start)).toBe('ausente');
  expect(attendanceOf({...s,state:'cancelado'},start)).toBeNull();
  expect(attendanceOf({...s,state:'borrador'},start)).toBeNull();
 });
 test('las acciones dependen del permiso, del estado y de la hora; nadie confirma la entrada a mano',()=>{
  const s={state:'publicado',start,end,presentSince:null};
  expect(allowedActions(s,start-60*60_000,true)).toEqual(['editar','cancelar','marcar_ausente']);
  expect(allowedActions(s,start-20*60_000,false)).toEqual([]);
  expect(allowedActions({...s,state:'en_curso',presentSince:start},start+60_000,false)).toEqual([]);
  expect(allowedActions({...s,state:'en_curso',presentSince:start},start+60_000,true)).toEqual(['marcar_presente','marcar_ausente']);
  expect(allowedActions({...s,state:'completado',presentSince:start},end+60_000,true)).toEqual(['marcar_presente','marcar_ausente']);
  expect(allowedActions({...s,state:'ausente'},start+60_000,true)).toEqual(['marcar_presente','deshacer_asistencia']);
  // Una ausencia planificada (antes del inicio) se deshace, pero aún no hay entrada que corregir.
  expect(allowedActions({...s,state:'ausente'},start-60*60_000,true)).toEqual(['deshacer_asistencia']);
  expect(allowedActions({...s,state:'cancelado'},start-60*60_000,true)).toEqual([]);
 });
 test('ventana de 7 días y días seguidos',()=>{
  const H=3600_000,D=24*H,t0=Date.parse('2026-11-01T13:00:00Z');
  const guards:[number,number][]=[[t0,t0+24*H],[t0+2*D,t0+3*D],[t0+4*D,t0+5*D]];
  expect(windowLoad(guards.slice(0,2),guards[2],null,72)).toEqual({hours:72,exceeds:false});
  expect(windowLoad(guards,[t0+6*D,t0+7*D],null,72)).toEqual({hours:96,exceeds:true});
  // Solo las ventanas que tocan el turno nuevo: la sobrecarga de 96 h quedó a más de 7 días.
  expect(windowLoad([...guards,[t0+6*D,t0+7*D]],[t0+14*D,t0+14*D+8*H],null,72).exceeds).toBe(false);
  // Mover un turno dentro de una ventana ya sobre el tope sin sumarle horas se permite; alargarlo no.
  expect(windowLoad(guards,[t0+6*D,t0+6*D+20*H],[t0+6*D,t0+7*D],72).exceeds).toBe(false);
  expect(windowLoad(guards,[t0+6*D-H,t0+7*D],[t0+6*D,t0+7*D],72).exceeds).toBe(true);
  expect(consecutiveDays(new Set(['2026-11-01','2026-11-02','2026-11-03','2026-11-05']),'2026-11-02')).toBe(3);
 });
});

describe('Turnos · asistencia, carga, descansos y estados (ASIS, CARGA, MA-TUR)',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,areaId:string,emergencyId:string;
 const call=async(role:string,method:string,path:string,body?:unknown)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 let sequence=0;
 const letters=(n:number)=>n.toString(26).replace(/[0-9a-p]/g,ch=>String.fromCharCode(97+parseInt(ch,26)));
 const person=async(type:string,specialty?:string)=>{
  const created=await call('ADM','POST','/personal',{givenNames:'Persona',surnames:`Asistencia ${letters(++sequence)}`,type,...(specialty?{specialty}:{})});
  expect(created.status).toBe(201);
  if(['medico','enfermero'].includes(type))expect((await call('ADM','POST',`/personal/${created.body.id}/inscripciones`,{board:type==='medico'?'JVPM':'JVPE',number:`AS-${++sequence}`,validFrom:'2026-01-01',validTo:'2026-12-31',version:created.body.version,reason:'Inscripción de prueba'})).status).toBe(201);
  return created.body.id as string;
 };
 const shift=(staffId:string,start:string,end:string,over:Record<string,unknown>={})=>call('JOP','POST','/turnos',{staffId,areaId,type:'diurno',start,end,...over});
 const row=async(id:string)=>(await fixture.pg.query<any>('SELECT * FROM personal.turno WHERE id=$1',[id])).rows[0];
 const listed=async(role:string,id:string,path='/turnos')=>(await call(role,'GET',path)).body.find((s:any)=>s.id===id);
 const sqlError=async(sql:string,params:unknown[]=[])=>{try{await fixture.pg.query(sql,params);return null;}catch(e){return String((e as Error).message);}};
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
 afterEach(()=>{current=new Date('2026-10-24T12:00:00Z');});

 test('MA-TUR-01: crear con state (cancelado o borrador) se rechaza; el turno nace publicado',async()=>{
  const p=await person('asistente');
  expect((await shift(p,local('2026-11-02','07:00'),local('2026-11-02','15:00'),{state:'cancelado'})).status).toBe(400);
  expect((await shift(p,local('2026-11-02','07:00'),local('2026-11-02','15:00'),{state:'borrador'})).status).toBe(400);
  const ok=await shift(p,local('2026-11-02','07:00'),local('2026-11-02','15:00'));
  expect(ok.status).toBe(201);expect((await row(ok.body.id)).estado).toBe('publicado');
 });

 test('MA-TUR-02/03: un turno iniciado no se mueve, no se cancela y la base no lo devuelve a borrador',async()=>{
  const p=await person('asistente');
  const s=(await shift(p,local('2026-11-03','07:00'),local('2026-11-03','15:00'))).body;
  current=new Date(local('2026-11-03','08:00'));
  const body={staffId:p,areaId,type:'diurno',start:local('2026-11-03','09:00'),end:local('2026-11-03','15:00'),version:1,reason:'Mover un turno ya empezado'};
  const moved=await call('JOP','PATCH',`/turnos/${s.id}`,body);
  expect(moved.status).toBe(409);expect(moved.body.codigo).toBe('turno_iniciado');
  const cancel=await call('JOP','PATCH',`/turnos/${s.id}`,{...body,start:local('2026-11-03','07:00'),state:'cancelado'});
  expect(cancel.status).toBe(409);expect(cancel.body.codigo).toBe('turno_iniciado');
  expect((await listed('JOP',s.id)).allowedActions).not.toContain('cancelar');
  await app.get(PersonnelService).advanceStates();
  expect(await sqlError("UPDATE personal.turno SET estado='borrador' WHERE id=$1",[s.id])).toContain('transicion_invalida');
  expect(await sqlError("UPDATE personal.turno SET periodo=tstzrange(lower(periodo),upper(periodo)+interval '1 hour') WHERE id=$1",[s.id])).toContain('turno_iniciado');
 });

 test('CARGA-05: cancelar solo cambia el estado; no mueve el turno a la vez y devuelve los huecos que deja',async()=>{
  const p=await person('asistente');
  const s=(await shift(p,local('2026-11-04','07:00'),local('2026-11-04','15:00'),{areaId:emergencyId})).body;
  const cancel=await call('JOP','PATCH',`/turnos/${s.id}`,{staffId:p,areaId,type:'diurno',start:local('2026-11-05','07:00'),end:local('2026-11-05','15:00'),version:1,state:'cancelado',reason:'Cancelación con datos distintos'});
  expect(cancel.status).toBe(200);expect(Array.isArray(cancel.body.huecos)).toBe(true);
  const saved=await row(s.id);
  expect(saved.estado).toBe('cancelado');expect(saved.area_id).toBe(emergencyId);expect(new Date(saved.periodo.slice(2,24)+':00').valueOf()).not.toBeNaN();
  expect(await sqlError("UPDATE personal.turno SET estado='publicado' WHERE id=$1",[s.id])).toContain('transicion_invalida');
 });

 test('MA-TUR-04: dos noches seguidas con 12 h de descanso se permiten (RN-13 pide 8 h)',async()=>{
  const p=await person('asistente');
  expect((await shift(p,local('2026-11-06','18:00'),local('2026-11-07','06:00'),{type:'nocturno'})).status).toBe(201);
  const second=await shift(p,local('2026-11-07','18:00'),local('2026-11-08','06:00'),{type:'nocturno'});
  expect(second.status).toBe(201);
  const tooSoon=await shift(p,local('2026-11-08','12:00'),local('2026-11-08','17:00'));
  expect(tooSoon.status).toBe(409);expect(tooSoon.body.codigo).toBe('personal_en_descanso');
 });

 test('CARGA-01: descanso mínimo y tope de 72 h en 7 días también en la base',async()=>{
  const p=await person('asistente');
  const insert=(start:string,end:string,tipo='diurno',extra='NULL')=>sqlError(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado,excepcion_carga) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),$5,'publicado',${extra})`,[p,areaId,start,end,tipo]);
  expect(await insert(local('2026-11-09','07:00'),local('2026-11-09','15:00'))).toBeNull();
  expect(await insert(local('2026-11-09','17:00'),local('2026-11-09','23:00'))).toContain('descanso_insuficiente');
  const q=await person('asistente');
  for(const d of ['2026-11-10','2026-11-12','2026-11-14'])expect((await shift(q,local(d,'07:00'),local(`2026-11-${Number(d.slice(8))+1}`,'07:00'),{type:'guardia',justification:'Guardias de cobertura de prueba'})).status).toBe(201);
  const fourth={staffId:q,areaId,type:'guardia',start:local('2026-11-16','07:00'),end:local('2026-11-17','06:00')};
  const refused=await call('JOP','POST','/turnos',fourth);
  expect(refused.status).toBe(409);expect(refused.body.codigo).toBe('carga_semanal_excedida');expect(refused.body.limite).toBe(72);
  expect(await sqlError(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'guardia','publicado')`,[q,areaId,fourth.start,fourth.end])).toContain('carga_semanal_excedida');
  const forced=await call('JOP','POST','/turnos',{...fourth,emergencyReason:'Brote en Emergencia sin otra persona disponible'});
  expect(forced.status).toBe(201);
  expect((await row(forced.body.id)).excepcion_carga).toBe('Brote en Emergencia sin otra persona disponible');
  const audit=(await fixture.pg.query<any>("SELECT detalle FROM plataforma.auditoria WHERE accion='turnos.crear' AND entidad_id=$1",[forced.body.id])).rows[0];
  expect(audit.detalle.excepcionCarga).toBe('Brote en Emergencia sin otra persona disponible');
 });

 test('CARGA-01: más de 6 días seguidos pide una emergencia escrita',async()=>{
  const p=await person('asistente');
  for(let d=20;d<26;d++)expect((await shift(p,local(`2026-11-${d}`,'22:00'),local(`2026-11-${d+1}`,'06:00'),{type:'nocturno'})).status).toBe(201);
  const seventh=await shift(p,local('2026-11-26','22:00'),local('2026-11-27','06:00'),{type:'nocturno'});
  expect(seventh.status).toBe(409);expect(seventh.body.codigo).toBe('dias_seguidos_excedidos');expect(seventh.body.diasSeguidos).toBe(7);
 });

 // Revisión del PR 114: solo cuentan las ventanas de 7 días que tocan el turno escrito, y una ventana que ya estaba
 // sobre el tope (datos anteriores o una emergencia) no bloquea escrituras que no le suman horas.
 const legacy=async(persona:string,rows:[string,string,string,string][])=>fixture.pg.transaction(async tx=>{
  // Datos previos a esta regla (turnos ya cargados o borradores antiguos): se insertan sin disparadores.
  await tx.exec('SET LOCAL session_replication_role = replica');
  for(const [start,end,tipo,estado] of rows)await tx.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),$5,$6)`,[persona,areaId,start,end,tipo,estado]);
 });
 // 77 h entre el 1 y el 6 de diciembre: G1, G2 y G3 de 24 h y un turno corto de 5 h.
 const cluster=(estado='publicado'):[string,string,string,string][]=>[
  [local('2026-12-01','07:00'),local('2026-12-02','07:00'),'guardia',estado],
  [local('2026-12-02','19:00'),local('2026-12-03','19:00'),'guardia',estado],
  [local('2026-12-04','07:00'),local('2026-12-05','07:00'),'guardia',estado],
  [local('2026-12-05','19:00'),local('2026-12-06','00:00'),'diurno',estado],
 ];
 test('CARGA-01: una sobrecarga previa fuera de las ventanas del turno nuevo no lo bloquea (API y base)',async()=>{
  const p=await person('asistente'),q=await person('asistente');
  await legacy(p,cluster());await legacy(q,cluster());
  const api=await shift(p,local('2026-12-09','08:00'),local('2026-12-09','16:00'));
  expect(api.body.codigo).toBeUndefined();expect(api.status).toBe(201);
  expect(await sqlError(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'diurno','publicado')`,[q,areaId,local('2026-12-09','08:00'),local('2026-12-09','16:00')])).toBeNull();
  // Acortar un turno de la ventana sobre el tope no le suma horas: se permite. Alargarlo sí le suma: se rechaza.
  const short=(await fixture.pg.query<any>("SELECT id FROM personal.turno WHERE persona_id=$1 AND tipo='diurno' AND lower(periodo)=$2::timestamptz",[q,local('2026-12-05','19:00')])).rows[0].id;
  expect(await sqlError("UPDATE personal.turno SET periodo=tstzrange($2::timestamptz,$3::timestamptz,'[)') WHERE id=$1",[short,local('2026-12-05','19:00'),local('2026-12-05','23:30')])).toBeNull();
  expect(await sqlError("UPDATE personal.turno SET periodo=tstzrange($2::timestamptz,$3::timestamptz,'[)') WHERE id=$1",[short,local('2026-12-05','19:00'),local('2026-12-06','00:30')])).toContain('carga_semanal_excedida');
 });

 test('CARGA-01: publicar borradores antiguos revisa el tope de 7 días (API y base)',async()=>{
  const p=await person('asistente'),q=await person('asistente');
  const drafts=cluster('borrador').map(([a,b,t,e]):[string,string,string,string]=>[a.replace('2026-12-0','2026-12-1'),b.replace('2026-12-0','2026-12-1'),t,e]);
  await legacy(p,drafts);await legacy(q,drafts);
  const published=await call('JOP','POST','/turnos/publicar',{from:'2026-12-11',to:'2026-12-15',areaId});
  expect(published.status).toBe(409);expect(published.body.codigo).toBe('carga_semanal_excedida');
  expect((await fixture.pg.query<any>("SELECT count(*)::int AS n FROM personal.turno WHERE persona_id=$1 AND estado='publicado'",[p])).rows[0].n).toBe(0);
  expect(await sqlError("UPDATE personal.turno SET estado='publicado' WHERE persona_id=$1",[q])).toContain('carga_semanal_excedida');
 });

 test('CARGA-01: la excepción de carga no salta el descanso mínimo en la base',async()=>{
  const p=await person('asistente');
  const insert=(start:string,end:string)=>sqlError(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado,excepcion_carga) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'diurno','publicado','Emergencia sin otra persona disponible')`,[p,areaId,start,end]);
  expect(await insert(local('2026-12-20','07:00'),local('2026-12-20','15:00'))).toBeNull();
  expect(await insert(local('2026-12-20','17:00'),local('2026-12-20','23:00'))).toContain('descanso_insuficiente');
 });

 test('MA-TUR-05 / CARGA-06: cancelar o mover el turno de un médico con citas responde 409 con las citas',async()=>{
  const doctor=await person('medico');
  const s=(await shift(doctor,local('2026-11-11','07:00'),local('2026-11-11','15:00'))).body;
  const patient=(await fixture.pg.query<{id:string}>("INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento) VALUES('EXP-AS-1','Paciente','Ficticio','femenino','exacta','1990-01-01') RETURNING id")).rows[0];
  const cita=(await fixture.pg.query<{id:string}>("INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'confirmada','recepcion') RETURNING id",[patient.id,doctor,local('2026-11-11','09:00'),local('2026-11-11','09:20')])).rows[0];
  const base={staffId:doctor,areaId,type:'diurno',start:local('2026-11-11','07:00'),end:local('2026-11-11','15:00'),version:1,reason:'Cambio del turno del médico'};
  const cancel=await call('JOP','PATCH',`/turnos/${s.id}`,{...base,state:'cancelado'});
  expect(cancel.status).toBe(409);expect(cancel.body.codigo).toBe('turno_con_citas');expect(cancel.body.citas.map((c:any)=>c.id)).toEqual([cita.id]);
  const moved=await call('JOP','PATCH',`/turnos/${s.id}`,{...base,start:local('2026-11-11','10:00')});
  expect(moved.status).toBe(409);expect(moved.body.codigo).toBe('turno_con_citas');
  // Si la nueva jornada cubre la cita, se puede mover.
  expect((await call('JOP','PATCH',`/turnos/${s.id}`,{...base,start:local('2026-11-11','08:00')})).status).toBe(200);
  expect(await sqlError("UPDATE personal.turno SET estado='cancelado' WHERE id=$1",[s.id])).toContain('turno_con_citas');
 });

 test('ASIS-01/02: un médico ausente deja de estar de turno (agenda, cobertura, citas) y se listan citas y suplentes',async()=>{
  const [doctor,backup]=[await person('medico','Pediatría'),await person('medico','Pediatría')];
  const s=(await shift(doctor,local('2026-11-18','06:00'),local('2026-11-18','18:00'),{areaId:emergencyId})).body;
  const patient=(await fixture.pg.query<{id:string}>("INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento) VALUES('EXP-AS-2','Paciente','Ficticio','masculino','exacta','1991-01-01') RETURNING id")).rows[0];
  const cita=(await fixture.pg.query<{id:string}>("INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'confirmada','recepcion') RETURNING id",[patient.id,doctor,local('2026-11-18','10:00'),local('2026-11-18','10:20')])).rows[0];
  current=new Date(local('2026-11-18','06:30'));
  // La entrada se confirmó sola a las 06:00; JOP igual puede marcar la ausencia durante el turno.
  const before=await listed('JOP',s.id);
  expect(before).toMatchObject({state:'en_curso',attendance:'presente',presentSince:new Date(local('2026-11-18','06:00')).toISOString(),late:false});
  expect(before.allowedActions).toEqual(['marcar_presente','marcar_ausente']);

  expect((await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'ausente',version:before.version,reason:'corta'})).status).toBe(400);
  expect((await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'ausente',version:before.version,reason:'No se presentó ni avisó'})).status).toBe(400);
  expect((await call('MED','POST',`/turnos/${s.id}/asistencia`,{state:'ausente',absenceType:'injustificada',version:before.version,reason:'No se presentó ni avisó'})).status).toBe(403);
  const absent=await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'ausente',absenceType:'injustificada',version:before.version,reason:'No se presentó ni avisó'});
  expect(absent.status).toBe(201);
  expect(absent.body).toMatchObject({state:'ausente',attendance:'ausente'});
  expect(absent.body.affectedAppointments.map((c:any)=>c.id)).toEqual([cita.id]);
  expect(absent.body.substitutes.map((p:any)=>p.id)).toContain(backup);
  const after=await listed('JOP',s.id);
  expect(after).toMatchObject({state:'ausente',attendance:'ausente',absenceType:'injustificada',attendanceReason:'No se presentó ni avisó'});
  expect(after.allowedActions).toEqual(['marcar_presente','deshacer_asistencia']);
  expect((await listed('REC',s.id)).attendanceReason).toBeUndefined();
  // Agenda: el médico ya no tiene jornada ese día; la base no acepta una cita nueva en su horario.
  const catalog=(await call('REC','GET','/citas/catalogos?date=2026-11-18')).body;
  expect(catalog.doctors.find((d:any)=>d.id===doctor).tieneTurno).toBe(false);
  expect(await sqlError("INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),'confirmada','recepcion')",[patient.id,doctor,local('2026-11-18','11:00'),local('2026-11-18','11:20')])).toContain('medico_ausente');
  // Cobertura: Emergencia queda sin médico durante ese turno.
  const gaps=(await call('JOP','GET','/turnos/cobertura?from=2026-11-18&to=2026-11-18')).body.gaps.filter((g:any)=>g.areaId===emergencyId&&g.role==='MED');
  expect(gaps.some((g:any)=>g.start<=new Date(local('2026-11-18','07:00')).toISOString()&&g.end>=new Date(local('2026-11-18','17:00')).toISOString())).toBe(true);
  // Especialistas de la semana: aparece, marcado ausente.
  const week=(await call('REC','GET','/turnos/especialistas?from=2026-11-16')).body;
  expect(week.items.find((i:any)=>i.specialty==='Pediatría'&&i.attendance==='ausente')).toBeTruthy();
  // Deshacer la marca equivocada lo devuelve a en curso, con la entrada automática a la hora de inicio.
  const undo=await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'pendiente',version:after.version,reason:'Llegó por la entrada de servicio'});
  expect(undo.status).toBe(201);expect(undo.body).toMatchObject({state:'en_curso',attendance:'presente',late:false});
  expect(new Date((await row(s.id)).presente_desde).toISOString()).toBe(new Date(local('2026-11-18','06:00')).toISOString());

  const audit=(await fixture.pg.query<any>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion='turnos.asistencia' AND entidad_id=$1",[s.id])).rows[0];
  expect(audit.n).toBe(2);
 });

 test('ASIS-01 / RN-30: un paramédico ausente no cuenta para despachar ni entra en una tripulación',async()=>{
  const [paramedic,driver]=[await person('paramedico'),await person('motorista')];
  for(const p of [paramedic,driver])expect((await shift(p,local('2026-11-19','06:00'),local('2026-11-19','18:00'),{areaId:emergencyId})).status).toBe(201);
  const at=new Date(local('2026-11-19','08:00'));current=at;
  const onDuty=async()=>(await fixture.pg.query<any>(CREW_ROLES_ON_DUTY_SQL,[at])).rows[0];
  await app.get(PersonnelService).advanceStates();
  expect((await onDuty()).paramedic).toBe(true);
  const s=(await listed('JOP',(await fixture.pg.query<any>('SELECT id FROM personal.turno WHERE persona_id=$1',[paramedic])).rows[0].id));
  expect((await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'ausente',absenceType:'justificada',version:s.version,reason:'Incapacidad médica del ISSS'})).status).toBe(201);
  expect((await onDuty()).paramedic).toBeFalsy();
  const unit=(await fixture.pg.query<any>('SELECT id FROM ambulancia.unidad LIMIT 1')).rows[0];
  const service=(await fixture.pg.query<any>("INSERT INTO ambulancia.servicio(unidad_id,tipo,prioridad,origen,destino,despachado_por,despachado_en,clave_idempotencia) VALUES($1,'emergencia_domicilio','roja','Origen ficticio','Hospital',$2,$3,$4) RETURNING id",[unit.id,userId('REC'),at,randomUUID()])).rows[0];
  expect(await sqlError("INSERT INTO ambulancia.tripulacion(servicio_id,persona_id,funcion) VALUES($1,$2,'paramedico')",[service.id,paramedic])).toContain('tripulante_ausente');
  expect(await sqlError("INSERT INTO ambulancia.tripulacion(servicio_id,persona_id,funcion) VALUES($1,$2,'motorista')",[service.id,driver])).toBeNull();
  const driverShift=await listed('JOP',(await fixture.pg.query<any>('SELECT id FROM personal.turno WHERE persona_id=$1',[driver])).rows[0].id);
  const refused=await call('JOP','POST',`/turnos/${driverShift.id}/asistencia`,{state:'ausente',absenceType:'injustificada',version:driverShift.version,reason:'Marca contradictoria de prueba'});
  expect(refused.status).toBe(409);expect(refused.body.codigo).toBe('tripulante_en_servicio');
 });

 test('ASIS-01 automático: al empezar, el turno queda en curso con la entrada confirmada, auditado como SISTEMA; ya no hay entrada manual',async()=>{
  const me=(await call('MED','GET','/auth/me')).body.staffId as string;
  await fixture.pg.query("INSERT INTO personal.inscripcion(persona_id,junta,numero,vigencia) VALUES($1,'JVPM','AS-MED-1',daterange('2026-01-01','2027-01-01'))",[me]);
  const s=(await shift(me,local('2026-11-21','07:00'),local('2026-11-21','15:00'))).body;
  current=new Date(local('2026-11-21','06:50'));
  expect(await listed('MED',s.id,'/turnos/mios')).toMatchObject({state:'publicado',attendance:'pendiente',presentSince:null,allowedActions:[]});
  // Nadie llama al barrido: leer "mis turnos" lo aplica (también lo hace el temporizador de cada minuto).
  current=new Date(local('2026-11-21','07:20'));
  const startIso=new Date(local('2026-11-21','07:00')).toISOString();
  const mine=await listed('MED',s.id,'/turnos/mios');
  expect(mine).toMatchObject({state:'en_curso',attendance:'presente',presentSince:startIso,late:false,allowedActions:[]});
  const stored=await row(s.id);
  expect(stored.alerta_sin_confirmar_en).toBeNull();expect(stored.asistencia_por).toBeNull();
  const audit=(await fixture.pg.query<any>("SELECT actor_rol,detalle FROM plataforma.auditoria WHERE accion='turnos.avance_automatico' AND detalle->'ids' ? $1",[s.id])).rows;
  expect(audit).toHaveLength(1);expect(audit[0].actor_rol).toBe('SISTEMA');
  expect(audit[0].detalle).toMatchObject({enCurso:[s.id],completados:[]});
  // El paso manual de "confirmar entrada" ya no existe.
  expect((await call('MED','POST',`/turnos/${s.id}/entrada`,{version:mine.version})).status).toBe(404);
  // JOP corrige una llegada tarde: con la hora real y un motivo.
  current=new Date(local('2026-11-21','08:00'));
  const jop=await listed('JOP',s.id);

  const noReason=await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'presente',at:local('2026-11-21','07:40'),version:jop.version});
  expect(noReason.status).toBe(400);
  const fixed=await call('JOP','POST',`/turnos/${s.id}/asistencia`,{state:'presente',at:local('2026-11-21','07:40'),version:jop.version,reason:'Llegó tarde por el tráfico'});
  expect(fixed.status).toBe(201);expect(fixed.body).toMatchObject({state:'en_curso',attendance:'presente',late:true});
  // Al terminar pasa a completado y conserva la entrada corregida; el barrido repetido no cambia nada.
  current=new Date(local('2026-11-21','15:00'));
  const done=await listed('MED',s.id,'/turnos/mios');
  expect(done).toMatchObject({state:'completado',attendance:'presente',presentSince:new Date(local('2026-11-21','07:40')).toISOString()});
  expect(await app.get(PersonnelService).advanceStates()).toBe(0);
  expect((await row(s.id)).version).toBe(done.version);
 });

 test('el reloj nunca toca turnos cancelados ni ausentes, y una guardia de 24 h pide 12 h de descanso',async()=>{
  const [nurse,other]=[await person('enfermero'),await person('enfermero')];
  const guard=await shift(nurse,local('2026-11-25','07:00'),local('2026-11-26','07:00'),{type:'guardia'});
  expect(guard.status).toBe(201);
  const early=await shift(nurse,local('2026-11-26','20:00'),local('2026-11-27','04:00'),{type:'nocturno'});
  expect(early.status).toBe(409);expect(early.body.codigo).toBe('personal_en_descanso');
  expect((await shift(nurse,local('2026-11-27','07:00'),local('2026-11-27','15:00'))).status).toBe(201);
  const planned=(await shift(other,local('2026-11-25','07:00'),local('2026-11-25','15:00'))).body;
  const cancelled=(await shift(other,local('2026-11-26','07:00'),local('2026-11-26','15:00'))).body;
  const absent=await call('JOP','POST',`/turnos/${planned.id}/asistencia`,{state:'ausente',absenceType:'justificada',version:planned.version,reason:'Vacaciones aprobadas por jefatura'});
  expect(absent.status).toBe(201);
  expect((await call('JOP','PATCH',`/turnos/${cancelled.id}`,{staffId:other,areaId,start:local('2026-11-26','07:00'),end:local('2026-11-26','15:00'),type:'diurno',state:'cancelado',version:cancelled.version,reason:'Cambio de planificación'})).status).toBe(200);
  current=new Date(local('2026-11-26','06:00'));
  expect(await listed('JOP',guard.body.id)).toMatchObject({state:'en_curso',attendance:'presente',type:'guardia'});
  current=new Date(local('2026-11-28','06:00'));
  await app.get(PersonnelService).advanceStates();
  expect(await row(guard.body.id)).toMatchObject({estado:'completado'});
  expect(await row(planned.id)).toMatchObject({estado:'ausente',presente_desde:null});
  expect(await row(cancelled.id)).toMatchObject({estado:'cancelado',presente_desde:null});
 });

 test('CARGA-03: Recepción sin personal muestra huecos solo en su horario de atención',async()=>{
  const reception=(await call('JOP','GET','/espacios')).body.find((n:any)=>n.code==='P1-REC').id;
  const gaps=(await call('JOP','GET',`/turnos/cobertura?from=2026-12-01&to=2026-12-01&areaId=${reception}`)).body.gaps;
  expect(gaps.map((g:any)=>[g.role,g.start,g.end])).toEqual([['REC',new Date(local('2026-12-01','07:00')).toISOString(),new Date(local('2026-12-01','19:00')).toISOString()]]);
 });
});
