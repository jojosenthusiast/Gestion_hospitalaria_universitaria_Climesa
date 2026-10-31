import { readdirSync,readFileSync } from 'node:fs';
import { relative,resolve,sep } from 'node:path';
// Regla 8 de AGENTS.md: la API decide por permiso del catálogo, nunca por código de rol.
// Esta prueba busca literales de rol entre comillas ('REC', "ADM"...) en api/src y solo admite las excepciones documentadas.
const src=resolve(__dirname,'../src');
const roleLiteral=/(['"])(ADM|JOP|REC|AST|ENF|MED|LAB|PAR|DPD|PAC)\1/;
/** archivo (relativo a src) -> por qué se permite. Cada entrada es una lista de códigos del catálogo, no una decisión de autorización. */
const allowed:Record<string,string>={
 'users/invitation.dto.ts':'Enumeración de códigos de rol válidos (roles.csv) para validar el cuerpo y publicar el enum en OpenAPI; qué rol exige qué se toma de la base.',
};
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):e.name.endsWith('.ts')?[resolve(dir,e.name)]:[]);
describe('Regla 8: sin decisiones por código de rol en api/src',()=>{
 test('ningún archivo compara o lista códigos de rol fuera de las excepciones documentadas',()=>{
  const found:string[]=[];
  for(const file of files(src)){
   const name=relative(src,file).split(sep).join('/');
   if(allowed[name])continue;
   readFileSync(file,'utf8').split(/\r?\n/).forEach((line,i)=>{if(roleLiteral.test(line))found.push(`${name}:${i+1}: ${line.trim().slice(0,120)}`);});
  }
  expect(found).toEqual([]);
 });
 test('las excepciones documentadas siguen existiendo y siguen conteniendo literales de rol',()=>{
  for(const name of Object.keys(allowed))expect(roleLiteral.test(readFileSync(resolve(src,name),'utf8'))).toBe(true);
 });
 test('la lista de roles del DTO de invitaciones coincide con roles.csv',()=>{
  const csv=readFileSync(resolve(__dirname,'../../docs/arquitectura/datos/roles.csv'),'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l=>l.split(',')[0]);
  const {roles}=require('../src/users/invitation.dto') as {roles:string[]};
  expect([...roles].sort()).toEqual([...csv].sort());
 });
});
