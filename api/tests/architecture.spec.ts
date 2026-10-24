import 'reflect-metadata';
import {readdirSync,readFileSync} from 'node:fs';
import {resolve,dirname,relative,sep} from 'node:path';
import ts from 'typescript';
import {GUARDS_METADATA,PATH_METADATA} from '@nestjs/common/constants';
import {PatientsController} from '../src/patients/patients.controller';
import {UsersController} from '../src/users/users.controller';
import {OperationsController} from '../src/operations/operations.controller';
import {PermissionGuard,SupabaseAuthGuard,REQUIRED_PERMISSION} from '../src/auth';
const root=resolve(__dirname,'../src'),business=new Set(['auth','users','patients','operations']);
function crossing(file:string,specifier:string):boolean {
 if(!specifier.startsWith('.'))return false;
 const from=relative(root,file).split(sep)[0],target=resolve(dirname(file),specifier),parts=relative(root,target).split(sep),to=parts[0];
 return business.has(from)&&business.has(to)&&from!==to&&parts.length>1&&parts[1]!=='index';
}
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(dir,e.name)):e.name.endsWith('.ts')?[resolve(dir,e.name)]:[]);}
describe('Fronteras de arquitectura NestJS',()=>{
 test('los módulos solo importan la superficie pública de otro módulo',()=>{
  const violations:string[]=[];
  for(const file of files(root)){
   const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
   function visit(node:ts.Node){
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&crossing(file,node.moduleSpecifier.text))violations.push(relative(root,file)+' -> '+node.moduleSpecifier.text);
    ts.forEachChild(node,visit);
   }visit(source);
  }
  expect(violations).toEqual([]);
 });
 test('la regla detecta un import interno que haría fallar la prueba de arquitectura',()=>{
  expect(crossing(resolve(root,'operations/operations.service.ts'),'../patients/patients.service')).toBe(true);
  expect(crossing(resolve(root,'patients/patients.controller.ts'),'../auth')).toBe(false);
 });
 test('todos los endpoints de negocio pasan por identidad, contexto de actor y permiso',()=>{
  for(const controller of [PatientsController,UsersController,OperationsController]){
   const guards=Reflect.getMetadata(GUARDS_METADATA,controller);expect(guards).toEqual(expect.arrayContaining([SupabaseAuthGuard,PermissionGuard]));
   for(const method of Object.getOwnPropertyNames(controller.prototype)){
    if(method==='constructor')continue;
    const handler=controller.prototype[method as keyof typeof controller.prototype];
    if(typeof handler==='function'&&Reflect.hasMetadata(PATH_METADATA,handler))expect(Reflect.getMetadata(REQUIRED_PERMISSION,handler)).toBeTruthy();
   }
  }
 });
});
