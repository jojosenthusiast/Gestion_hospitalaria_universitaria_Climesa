import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac,timingSafeEqual,createHash,randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase,userId,roleNames } from './support/database';
const now=new Date('2026-10-24T12:00:00Z');
const issuer='https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const jwt=(role:string,extra:Record<string,unknown>={})=>{
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const b=Buffer.from(JSON.stringify({sub:userId(role),iss:issuer,aud:'authenticated',exp:now.valueOf()/1000+3600,...extra})).toString('base64url');
 return `${h}.${b}.${createHmac('sha256','test-only-key').update(h+'.'+b).digest('base64url')}`;
};
jest.setTimeout(120000);
describe('Core S1/S2 — API, PostgreSQL y autorización',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>;
 const call=async(role:string,method:string,path:string,body?:unknown,key?:string)=>{
  const response=await app.inject({method:method as any,url:'/api/v1'+path,headers:{authorization:`Bearer ${jwt(role)}`,...(body?{'content-type':'application/json','idempotency-key':key??randomUUID()}:{})},...(body?{payload:body as object}:{})});
  return {status:response.statusCode,body:response.json()};
 };
 const patient={givenNames:'Ana Lucía',surnames:'Ejemplo Hernández',sex:'femenino',birth:'1990-02-03',dui:'00000001-8',phone:'7000-0000'};
 let patientId:string;
 let inviteProvider:jest.Mock;
 const createPatient=async(data=patient,key?:string)=>{
  const search=await call('REC','POST','/pacientes/busquedas',{query:data.givenNames});
  expect(search.status).toBe(201);
  return call('REC','POST','/pacientes',{...data,searchToken:search.body.token,searchQuery:data.givenNames},key);
 };
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
 test('salud comprueba la base; OpenAPI enumera permisos y claves de idempotencia',async()=>{
  const health=await app.inject('/salud');expect(health.statusCode).toBe(200);expect(health.headers['cache-control']).toBe('no-store');
  const spec=(await app.inject('/openapi/v1.json')).json();
  expect(spec.paths['/api/v1/pacientes'].post['x-permiso']).toBe('pacientes.registrar');
  for(const item of Object.values(spec.paths) as any[])for(const verb of ['get','post','patch','put','delete'])if(item[verb])expect(item[verb]['x-permiso']).toBeTruthy();
  expect(spec.paths['/api/v1/turnos'].post.parameters.some((p:any)=>p.name==='Idempotency-Key'&&p.required)).toBe(true);
 });
 test('cada rol recibe plataformas y permisos; no confía en user_metadata',async()=>{
  for(const role of roleNames){const r=await call(role,'GET','/auth/me');expect(r.status).toBe(200);expect(r.body.roles).toEqual([role]);expect(r.body.permissions.some((p:any)=>p.code==='sesion.perfil')).toBe(true);}
  const rec=(await call('REC','GET','/auth/me')).body;expect(rec.platforms.sort()).toEqual(['android','web']);expect(rec.channels).toContain('ambulancia');
  const med=(await call('MED','GET','/auth/me')).body;expect(med.platforms.sort()).toEqual(['android','ios']);
 });
 test('el perfil combina dos roles y el hook no acepta roles de metadatos',async()=>{
  await fixture.pg.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,$2)',[userId('REC'),'LAB']);
  const profile=(await call('REC','GET','/auth/me')).body;
  expect(profile.roles).toEqual(['LAB','REC']);expect(profile.permissions.some((p:any)=>p.code==='laboratorio.procesar')).toBe(true);
  const hook=(await fixture.pg.query<{result:any}>('SELECT acceso.hook_token($1::jsonb) AS result',[JSON.stringify({user_id:userId('REC'),claims:{user_metadata:{roles:['ADM']}}})])).rows[0].result;
  expect(hook.claims.app_roles).toBeUndefined();expect(hook.claims.app_canales).toEqual(expect.arrayContaining(['rol:REC','rol:LAB']));expect(hook.claims.app_canales).not.toContain('rol:ADM');expect(hook.claims.app_canales).toContain('ambulancia');
  await fixture.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='LAB'",[userId('REC')]);
 });
 test('invita PAC con proveedor simulado; reintentar conserva una sola invitación',async()=>{
  const key=randomUUID(),body={email:'Paciente.Nuevo@example.test',displayName:'Cuenta ficticia nueva',roles:['PAC']};
  const first=await call('ADM','POST','/usuarios/invitaciones',body,key);expect(first.status).toBe(201);
  expect(first.body.roles).toEqual(['PAC']);expect((await call('ADM','POST','/usuarios/invitaciones',body,key)).body).toEqual(first.body);expect(inviteProvider).toHaveBeenCalledTimes(1);
  expect(inviteProvider.mock.calls[0][0]).toBe('paciente.nuevo@example.test');
  expect((await call('ADM','POST','/usuarios/invitaciones',{email:'trabajo@example.test',displayName:'Personal ficticio',roles:['MED']})).status).toBe(400);
 });
 test('rechaza token vencido, firma falsa y emisor ajeno',async()=>{
  for(const token of [jwt('ADM',{exp:1}),jwt('ADM').slice(0,-8)+'xxxxxxxx',jwt('ADM',{iss:'https://otro.invalid/auth/v1'})])expect((await app.inject({url:'/api/v1/auth/me',headers:{authorization:'Bearer '+token}})).statusCode).toBe(401);
 });
 test('un paciente no planifica turnos y queda auditoría de denegación',async()=>{
  expect((await call('PAC','POST','/turnos',{})).status).toBe(403);
  const rows=(await fixture.pg.query<{resultado:string}>("SELECT resultado FROM plataforma.auditoria WHERE actor_id=$1 AND permiso='turnos.planificar'",[userId('PAC')])).rows;
  expect(rows.at(-1)?.resultado).toBe('denegado');
 });
 test('una cuenta desactivada queda bloqueada aun con JWT válido',async()=>{
  await fixture.pg.query("UPDATE acceso.usuario SET estado='desactivado' WHERE id=$1",[userId('PAC')]);expect((await call('PAC','GET','/auth/me')).status).toBe(401);
  await fixture.pg.query("UPDATE acceso.usuario SET estado='activo' WHERE id=$1",[userId('PAC')]);
 });
 test('prohíbe autoasignarse roles y desactivar al último administrador',async()=>{
  const roles=await call('ADM','PATCH',`/usuarios/${userId('ADM')}/roles`,{roles:['PAC'],version:1,reason:'Prueba de autoasignación'});expect(roles.status).toBe(403);
  const state=await call('ADM','PATCH',`/usuarios/${userId('ADM')}/estado`,{state:'desactivado',version:1,reason:'Prueba del último administrador'});expect(state.status).toBe(409);
 });
 test('registra paciente con búsqueda; la misma petición no duplica ni paciente ni evento',async()=>{
  const search=await call('REC','POST','/pacientes/busquedas',{query:'Ana Lucía'});
  const body={...patient,searchToken:search.body.token,searchQuery:'Ana Lucía'},key=randomUUID();
  const first=await call('REC','POST','/pacientes',body,key);expect(first.status).toBe(201);patientId=first.body.id;expect(first.body.record).toBe('0000001-X');
  const again=await call('REC','POST','/pacientes',body,key);expect(again.body).toEqual(first.body);
  const count=(await fixture.pg.query<{n:number}>('SELECT count(*)::int AS n FROM plataforma.outbox WHERE entidad_id=$1',[patientId])).rows[0].n;expect(count).toBe(1);
  expect((await call('REC','POST','/pacientes',{...body,phone:'7111-1111'},key)).status).toBe(409);
 });
 test('rechaza búsqueda vencida, ajena o de otra identidad y DUI repetido',async()=>{
  const x=await call('REC','POST','/pacientes/busquedas',{query:'Otra Persona'});
  expect((await call('REC','POST','/pacientes',{...patient,searchToken:x.body.token,searchQuery:'Otra Persona'})).status).toBe(400);
  const s=await call('REC','POST','/pacientes/busquedas',{query:'Ana Lucía'});await fixture.pg.query("UPDATE pacientes.busqueda_registro SET vence_en='2020-01-01' WHERE token=$1",[s.body.token]);
  expect((await call('REC','POST','/pacientes',{...patient,searchToken:s.body.token,searchQuery:'Ana Lucía'})).status).toBe(400);
  const foreign=await call('MED','POST','/pacientes/busquedas',{query:'Ana Lucía'});
  expect((await call('REC','POST','/pacientes',{...patient,searchToken:foreign.body.token,searchQuery:'Ana Lucía'})).status).toBe(400);
  expect((await createPatient()).status).toBe(409);
 });
 test('búsqueda fonética sin depender del orden ni de acentos',async()=>{
  const r=await call('REC','GET','/pacientes?query=ernandes%20ana');expect(r.status).toBe(200);expect(r.body.some((p:any)=>p.id===patientId)).toBe(true);
 });
 test('edita con historial y rechaza una versión antigua',async()=>{
  const first=await call('REC','PATCH',`/pacientes/${patientId}`,{...patient,surnames:'Ejemplo Hernández Gómez',version:1,reason:'Corrección del segundo apellido'});expect(first.status).toBe(200);
  const stale=await call('REC','PATCH',`/pacientes/${patientId}`,{...patient,version:1,reason:'Otra corrección simultánea'});expect(stale.status).toBe(409);expect(stale.body.codigo).toBe('version_conflicto');expect(stale.body.versionActual).toBe(2);
  const detail=(await call('REC','GET',`/pacientes/${patientId}`)).body;expect(detail.history[0].changes.primer_apellido.before).toBe('Ejemplo Hernández');expect(detail.version).toBe(2);
 });
 test('filtra campos para laboratorio y rechaza al médico sin relación y paciente ajeno',async()=>{
  const lab=await call('LAB','GET',`/pacientes/${patientId}`);expect(lab.status).toBe(200);expect(lab.body.birth).toBe('1990-02-03');for(const key of ['dui','phone','address','history'])expect(lab.body[key]).toBeUndefined();
  expect((await call('MED','GET',`/pacientes/${patientId}`)).status).toBe(403);expect((await call('PAC','GET',`/pacientes/${patientId}`)).status).toBe(403);
 });
 test('PAC solo recibe sus propios datos y no el historial de edición',async()=>{
  await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1',[userId('PAC'),patientId]);
  const self=await call('PAC','GET',`/pacientes/${patientId}`);expect(self.status).toBe(200);expect(self.body.dui).toBe('00000001-8');expect(self.body.birth).toBe('1990-02-03');expect(self.body.history).toBeUndefined();
  await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1',[userId('PAC')]);
 });
 test('identidad provisional crea alias sin inventar nacimiento',async()=>{
  const search=await call('PAR','POST','/pacientes/busquedas',{query:'Persona sin documento'});
  const body={givenNames:'',surnames:'',sex:'no_registrado',estimatedAge:30,description:'Persona sin identificación conocida',searchToken:search.body.token,searchQuery:'Persona sin documento'};
  const result=await call('PAR','POST','/pacientes/provisionales',body);expect(result.status).toBe(201);
  const row=(await fixture.pg.query<any>('SELECT alias_provisional,nacimiento,precision_nacimiento FROM pacientes.paciente WHERE id=$1',[result.body.id])).rows[0];
  expect(row.alias_provisional).toMatch(/^NN-2026-/);expect(row.nacimiento).toBeNull();expect(row.precision_nacimiento).toBe('estimada');
 });
 test('inactiva sin borrar y conserva la ficha y versiones',async()=>{
  expect((await call('REC','POST',`/pacientes/${patientId}/estado`,{active:false,version:2,reason:'Registro inactivado por verificación'})).status).toBe(201);
  const r=(await call('REC','GET',`/pacientes/${patientId}`)).body;expect(r.active).toBe(false);expect(r.history).toHaveLength(2);
 });
 test('directorio de personal crea, edita y exige versión',async()=>{
  const b={givenNames:'María',surnames:'Prueba Ejemplo',type:'medico',phone:'7000-0000'};
  const first=await call('ADM','POST','/personal',b);expect(first.status).toBe(201);
  expect((await call('ADM','PATCH',`/personal/${first.body.id}`,{...b,active:false,version:1,reason:'Cambio de disponibilidad de prueba'})).status).toBe(200);
  expect((await call('ADM','PATCH',`/personal/${first.body.id}`,{...b,version:1,reason:'Versión antigua para comprobar conflicto'})).status).toBe(409);
 });
 test('17 camas, disponibilidad recursiva, capacidad y ciclos',async()=>{
  const beds=await call('REC','GET','/camas');expect(beds.status).toBe(200);expect(beds.body).toHaveLength(17);expect(beds.body.every((b:any)=>b.state==='libre')).toBe(true);
  const tree=(await call('ADM','GET','/espacios')).body;expect(tree.find((n:any)=>n.code==='P2').totalBeds).toBe(12);expect(tree.find((n:any)=>n.code==='P3').totalBeds).toBe(5);
  const room=tree.find((n:any)=>n.code==='HAB-201');expect((await call('ADM','POST','/espacios',{type:'cama',code:'HAB-201-C',name:'Cama C',parentId:room.id})).status).toBe(409);
  expect((await call('ADM','PATCH',`/espacios/${room.id}`,{code:room.code,name:room.name,type:room.type,parentId:room.parentId,category:room.category,capacity:1,level:2,version:1,reason:'Reducción de capacidad de prueba'})).status).toBe(409);
 });
 test('la cama ocupada muestra iniciales fuera del área y nombre al médico tratante',async()=>{
  const med=(await call('MED','GET','/auth/me')).body,enf=(await call('ENF','GET','/auth/me')).body;
  const bed=(await call('REC','GET','/camas')).body.find((b:any)=>b.code==='HAB-201-A');
  const admission=(await fixture.pg.query<{id:string}>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado) VALUES($1,'consulta',$2,'semiprivada','femenino',$3,'hospitalizado') RETURNING id",[patientId,randomUUID(),med.staffId])).rows[0];
  await fixture.pg.query("INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) VALUES($1,$2,$3,'semiprivada',tstzrange(now()-interval '1 hour',NULL,'[)'))",[admission.id,bed.id,bed.roomId]);
  const other=(await call('ENF','GET','/camas')).body.find((b:any)=>b.id===bed.id);expect(other.occupantRestricted).toBe(true);expect(other.patientId).toBeUndefined();expect(other.occupant).not.toContain('Lucía');
  const related=(await call('MED','GET','/camas')).body.find((b:any)=>b.id===bed.id);expect(related.patientId).toBe(patientId);expect(related.occupant).toContain('Ana Lucía');
  const area=(await fixture.pg.query<{id:string}>("SELECT id FROM infra.espacio WHERE codigo='P2-HOS'")).rows[0];
  if(!area)throw new Error('Falta el área de hospitalización de la semilla');
  await fixture.pg.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange(now()-interval '1 hour',now()+interval '7 hours','[)'),'diurno','publicado')",[enf.staffId,area.id]);
  const own=(await call('ENF','GET','/camas')).body.find((b:any)=>b.id===bed.id);expect(own.patientId).toBe(patientId);expect(own.occupantRestricted).toBe(false);
 });
 test('turnos respetan duración, solapamiento y descanso de guardia',async()=>{
  const account=(await call('MED','GET','/auth/me')).body,tree=(await call('JOP','GET','/espacios')).body,area=tree.find((n:any)=>n.code==='P1-CON');
  const b={staffId:account.staffId,areaId:area.id,type:'guardia',start:'2026-11-01T07:00:00-06:00',end:'2026-11-02T07:00:00-06:00'};
  const first=await call('JOP','POST','/turnos',b);expect(first.status).toBe(201);expect((await call('JOP','POST','/turnos',{...b,start:'2026-11-01T15:00:00-06:00',end:'2026-11-01T23:00:00-06:00'})).status).toBe(409);
  expect((await call('JOP','POST','/turnos',{...b,type:'diurno',start:'2026-11-02T15:00:00-06:00',end:'2026-11-02T23:00:00-06:00'})).status).toBe(409);
  expect((await call('JOP','POST','/turnos',{...b,type:'diurno',start:'2026-11-02T19:00:00-06:00',end:'2026-11-03T03:00:00-06:00'})).status).toBe(201);
  const moved={...b,start:'2026-11-05T07:00:00-06:00',end:'2026-11-06T07:00:00-06:00',version:1,reason:'Reprogramación de guardia de prueba'};
  expect((await call('JOP','PATCH',`/turnos/${first.body.id}`,moved)).status).toBe(200);
  expect((await call('JOP','PATCH',`/turnos/${first.body.id}`,moved)).status).toBe(409);
  expect((await call('JOP','PATCH',`/turnos/${first.body.id}`,{...moved,version:2,state:'cancelado'})).status).toBe(200);
  expect((await call('JOP','POST','/turnos',{...b,type:'diurno',start:'2026-11-10T07:00:00-06:00',end:'2026-11-10T09:00:00-06:00'})).status).toBe(400);
 });
 test('RLS bloquea tablas de negocio al cliente y eventos no contienen datos personales',async()=>{
  await expect(fixture.pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query('SELECT * FROM pacientes.paciente');})).rejects.toThrow();
  const events=(await fixture.pg.query<{payload:unknown}>('SELECT payload FROM realtime.messages')).rows.map(r=>JSON.stringify(r.payload)).join('');expect(events).not.toContain('Lucía');expect(events).not.toContain('00000001');
  const pac=(await call('PAC','GET','/eventos?after=0')).body;expect(pac.events.some((e:any)=>e.entity==='paciente')).toBe(false);
 });
 test('cadena de auditoría íntegra y búsqueda sin texto original',async()=>{
  const rows=(await fixture.pg.query<{hash:Uint8Array;hash_previo:Uint8Array;detalle:{canonicalEvent:string};accion:string}>('SELECT hash,hash_previo,detalle,accion FROM plataforma.auditoria ORDER BY seq')).rows;
  let previous=Buffer.alloc(32);for(const row of rows){expect(Buffer.from(row.hash_previo)).toEqual(previous);const hash=createHash('sha256').update(previous).update(row.detalle.canonicalEvent).digest();expect(Buffer.from(row.hash)).toEqual(hash);previous=hash;}
  const searches=(await fixture.pg.query<{huella_criterios:string}>('SELECT huella_criterios FROM pacientes.busqueda_registro')).rows;expect(searches.every(r=>/^[a-f0-9]{64}$/.test(r.huella_criterios))).toBe(true);
 });
 test('jerarquía: solo el administrador principal invita a otro ADM y se registra la invitación',async()=>{
  const adm=(email:string)=>({email,displayName:'Administrador ficticio',roles:['ADM']});
  expect((await call('ADM','GET','/auth/me')).body.canInviteAdmin).toBe(true);
  expect((await call('ADM','POST','/usuarios/invitaciones',adm('admin2@example.test'))).status).toBe(201);
  expect((await fixture.pg.query<{n:number}>("SELECT count(*)::int AS n FROM acceso.invitacion WHERE correo='admin2@example.test' AND rol_codigo='ADM'")).rows[0].n).toBe(1);
  await fixture.pg.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,$2)',[userId('JOP'),'ADM']);
  expect((await call('JOP','GET','/auth/me')).body.canInviteAdmin).toBe(false);
  expect((await call('JOP','POST','/usuarios/invitaciones',adm('admin3@example.test'))).status).toBe(403);
  await fixture.pg.query("DELETE FROM acceso.asignacion_rol WHERE rol_codigo='ADM' AND usuario_id<>$1",[userId('ADM')]);
 });
});
