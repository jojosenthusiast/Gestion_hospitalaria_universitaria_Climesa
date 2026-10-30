import { Test } from '@nestjs/testing';
import { FastifyAdapter,NestFastifyApplication } from '@nestjs/platform-fastify';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/main';
import { DatabaseService } from '../src/platform/database.service';
import { SupabaseService } from '../src/supabase/supabase.service';
import { Clock } from '../src/platform/clock';
import { createDatabase } from './support/database';

// FR-110-10: la matriz RBAC se genera desde docs/arquitectura/datos y esta prueba exige que la base sembrada
// y el OpenAPI de la API coincidan con esos mismos CSV. Si alguien cambia uno sin el otro, falla aquí.
const datos=resolve(__dirname,'../../docs/arquitectura/datos');
function csv(nombre:string):Record<string,string>[]{
 const texto=readFileSync(resolve(datos,nombre),'utf8').replace(/^﻿/,'');
 const filas:string[][]=[];let fila:string[]=[],campo='',comillas=false;
 for(let i=0;i<texto.length;i++){
  const c=texto[i];
  if(comillas){if(c==='"'&&texto[i+1]==='"'){campo+='"';i++;}else if(c==='"')comillas=false;else campo+=c;}
  else if(c==='"')comillas=true;
  else if(c===','){fila.push(campo);campo='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&texto[i+1]==='\n')i++;fila.push(campo);campo='';if(fila.some(x=>x!==''))filas.push(fila);fila=[];}
  else campo+=c;
 }
 if(campo!==''||fila.length){fila.push(campo);filas.push(fila);}
 const [cabecera,...cuerpo]=filas;
 return cuerpo.map(f=>Object.fromEntries(cabecera.map((h,i)=>[h,f[i]??''])));
}
const rolesCsv=csv('roles.csv'),permisosCsv=csv('permisos.csv'),endpointsCsv=csv('endpoints.csv');
const codigosRol=rolesCsv.map(r=>r.codigo);
/**
 * Rutas que la API sirve hoy con otro método o nombre que el catálogo endpoints.csv (clave API → clave del catálogo).
 * Se exige que el permiso coincida igual. Al alinear el catálogo o la ruta, la entrada sobra y la prueba obliga a quitarla.
 */
const desviosDeRuta:Record<string,string>={
 'GET /api/v1/auth/me':'GET /api/v1/me',
 'PATCH /api/v1/usuarios/{id}/roles':'PUT /api/v1/usuarios/{id}/roles',
 'PATCH /api/v1/usuarios/{id}/estado':'POST /api/v1/usuarios/{id}/desactivar',
 'POST /api/v1/pacientes/provisionales':'POST /api/v1/pacientes/provisional',
 'PATCH /api/v1/pacientes/{id}':'PUT /api/v1/pacientes/{id}',
 'POST /api/v1/pacientes/{id}/estado':'POST /api/v1/pacientes/{id}/desactivar',
 'PATCH /api/v1/personal/{id}':'PUT /api/v1/personal/{id}',
 'PATCH /api/v1/turnos/{id}':'PUT /api/v1/turnos/{id}',
 'GET /api/v1/turnos/mios':'GET /api/v1/me/turnos',
 'GET /api/v1/espacios':'GET /api/v1/espacios/arbol',
 'PATCH /api/v1/espacios/{id}':'PUT /api/v1/espacios/{id}',
};
/** Operaciones de la API sin fila en endpoints.csv: su permiso debe existir en permisos.csv (o ser público). */
const sinFilaEnCatalogo=['GET /api/v1/inicio','GET /api/v1/eventos','GET /api/v1/health','GET /salud','POST /api/v1/pacientes/busquedas'];
jest.setTimeout(120000);
describe('110-T06 · matriz RBAC: CSV ↔ base ↔ OpenAPI',()=>{
 let app:NestFastifyApplication,fixture:Awaited<ReturnType<typeof createDatabase>>,operaciones:Record<string,string>;
 beforeAll(async()=>{
  fixture=await createDatabase();
  const auth={authClient:{auth:{getUser:async()=>({data:{user:null},error:new Error('sin sesión')})}},admin:{auth:{admin:{}}},isConfigured:()=>true};
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(DatabaseService).useValue(fixture.db).overrideProvider(SupabaseService).useValue(auth).overrideProvider(Clock).useValue({now:()=>new Date('2026-10-24T12:00:00Z')}).compile();
  app=module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(),{logger:false});configureApplication(app);await app.init();await app.getHttpAdapter().getInstance().ready();
  const spec=(await app.inject('/openapi/v1.json')).json();
  operaciones={};
  for(const [ruta,item] of Object.entries<any>(spec.paths))for(const metodo of ['get','post','put','patch','delete'])if(item[metodo])operaciones[`${metodo.toUpperCase()} ${ruta}`]=item[metodo]['x-permiso'];
 });
 afterAll(async()=>{await app?.close();await fixture?.pg.close();});

 test('los roles sembrados en la base son exactamente los de roles.csv',async()=>{
  const filas=(await fixture.pg.query<{codigo:string;nombre:string;plataformas:string[]}>('SELECT codigo,nombre,plataformas FROM acceso.rol ORDER BY codigo')).rows;
  const esperado=rolesCsv.map(r=>({codigo:r.codigo,nombre:r.nombre,plataformas:r.plataformas.split(';').map(p=>p.trim()).sort()})).sort((a,b)=>a.codigo.localeCompare(b.codigo));
  expect(filas.map(r=>({codigo:r.codigo,nombre:r.nombre,plataformas:[...r.plataformas].sort()}))).toEqual(esperado);
 });
 test('los permisos sembrados en la base son exactamente los de permisos.csv',async()=>{
  const filas=(await fixture.pg.query<{codigo:string;descripcion:string}>('SELECT codigo,descripcion FROM acceso.permiso ORDER BY codigo')).rows;
  expect(filas).toEqual(permisosCsv.map(p=>({codigo:p.permiso,descripcion:p.descripcion})).sort((a,b)=>a.codigo.localeCompare(b.codigo)));
 });
 test('cada celda rol×permiso de permisos.csv existe en rol_permiso con su contexto, y no sobra ninguna',async()=>{
  const base=(await fixture.pg.query<{rol:string;permiso:string;contexto:string}>('SELECT rol_codigo AS rol,permiso_codigo AS permiso,contexto FROM acceso.rol_permiso')).rows.map(r=>`${r.rol}|${r.permiso}|${r.contexto}`).sort();
  const esperado=permisosCsv.flatMap(p=>codigosRol.filter(c=>p[c]).map(c=>`${c}|${p.permiso}|${p[c]}`)).sort();
  expect(base).toEqual(esperado);
  expect(esperado.length).toBeGreaterThan(100);
 });
 test('toda operación de la API declara un permiso que existe en permisos.csv (o es pública)',()=>{
  const conocidos=new Set(permisosCsv.map(p=>p.permiso));
  const invalidas=Object.entries(operaciones).filter(([,permiso])=>permiso!=='publico'&&!conocidos.has(permiso)).map(([op,permiso])=>`${op} → ${permiso}`);
  expect(invalidas).toEqual([]);
 });
 test('el permiso de cada operación de la API coincide con su fila de endpoints.csv',()=>{
  const catalogo=new Map(endpointsCsv.map(e=>[`${e.metodo} ${e.ruta}`,e.permiso==='(público)'?'publico':e.permiso]));
  const distintos:string[]=[],sinCatalogo:string[]=[];
  for(const [op,permiso] of Object.entries(operaciones)){
   const clave=catalogo.has(op)?op:desviosDeRuta[op];
   if(!clave){if(!sinFilaEnCatalogo.includes(op))sinCatalogo.push(op);continue;}
   if(catalogo.get(clave)!==permiso)distintos.push(`${op}: API ${permiso}, catálogo ${catalogo.get(clave)}`);
  }
  expect(distintos).toEqual([]);
  expect(sinCatalogo).toEqual([]);
 });
 test('las listas de desvíos no guardan entradas viejas',()=>{
  const catalogo=new Set(endpointsCsv.map(e=>`${e.metodo} ${e.ruta}`));
  for(const [api,cat] of Object.entries(desviosDeRuta)){
   expect(operaciones).toHaveProperty([api]);
   expect(catalogo.has(api)).toBe(false);
   expect(catalogo.has(cat)).toBe(true);
  }
  for(const op of sinFilaEnCatalogo){expect(operaciones).toHaveProperty([op]);expect(catalogo.has(op)).toBe(false);}
 });
});
