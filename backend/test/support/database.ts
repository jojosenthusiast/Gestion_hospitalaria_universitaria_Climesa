import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PoolClient } from 'pg';
const {btree_gist}=require('@electric-sql/pglite/contrib/btree_gist');
const {pg_trgm}=require('@electric-sql/pglite/contrib/pg_trgm');
const {unaccent}=require('@electric-sql/pglite/contrib/unaccent');
const {pgcrypto}=require('@electric-sql/pglite/contrib/pgcrypto');
export const roleNames=['ADM','JOP','REC','AST','ENF','MED','LAB','PAR','DPD','PAC'];
export const userId=(role:string)=>`00000000-0000-4000-8000-${String(roleNames.indexOf(role)+1).padStart(12,'0')}`;
export async function createDatabase(){
 const pg=await PGlite.create({extensions:{btree_gist,pg_trgm,unaccent,pgcrypto}});
 const root=resolve(__dirname,'../../../supabase');
 await pg.exec(readFileSync(resolve(root,'pruebas/00_simular_supabase.sql'),'utf8'));
 for(const file of readdirSync(resolve(root,'migrations')).sort())await pg.exec(readFileSync(resolve(root,'migrations',file),'utf8'));
 await pg.exec(readFileSync(resolve(root,'seed.sql'),'utf8'));
 for(const role of roleNames){
  const id=userId(role);
  await pg.query('INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES($1,$2,$3,$4)',[id,`${role.toLowerCase()}@example.test`,{nombre:`Cuenta ficticia ${role}`},{invitado:true}]);
  await pg.query('INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,$2)',[id,role]);
  if(['REC','AST','ENF','MED','LAB','PAR'].includes(role)){
   const types:Record<string,string>={REC:'recepcionista',AST:'asistente',ENF:'enfermero',MED:'medico',LAB:'laboratorista',PAR:'paramedico'};
   const person=(await pg.query<{id:string}>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT $1,'Prueba', $2,id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id",[role,types[role]])).rows[0];
   await pg.query('UPDATE acceso.usuario SET persona_personal_id=$2 WHERE id=$1',[id,person.id]);
  }
 }
 const db={
  async transaction<T>(work:(c:PoolClient)=>Promise<T>):Promise<T>{return pg.transaction(async tx=>{
   await tx.exec('SET LOCAL ROLE sghu_api');
   const adapter={query:async(sql:string,params:unknown[]=[])=>{const r=await tx.query(sql,params);return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};}} as unknown as PoolClient;
   return work(adapter);
  });},
  async query(sql:string,params:unknown[]=[]){return db.transaction(async c=>(await c.query(sql,params)).rows);},
 };
 return {pg,db};
}
