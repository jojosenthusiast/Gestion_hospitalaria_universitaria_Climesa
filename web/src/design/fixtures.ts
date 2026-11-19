/** Datos ficticios, utilizados exclusivamente por work-preview.html. No accede a la red. */
import permissions from './permissions.json';
import { ApiError,type AccessProfile,type Api,type Bed,type Space,type Staff,type Shift,type UserAccount } from '../lib/api';
import { FrontDeskFixtures } from './fixtures/front-desk';
import { LabFixtures } from './fixtures/lab';
import { AmbulanceFixtures } from './fixtures/ambulance';
import { HospitalFixtures } from './fixtures/hospital';
import { OperationsFixtures } from './fixtures/operations';
import { ClinicFixtures } from './fixtures/clinic';
import { buildPatients,fold,patientUuid,type FixturePatient } from './fixtures/people';
const clone=<T>(v:T):T=>structuredClone(v);
let fixtureSequence=100000;
const newFixtureId=()=>uuid(++fixtureSequence);
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const profileNames:Record<string,string>={ADM:'Andrea Ejemplo',JOP:'Carlos Prueba',REC:'Lucía Ejemplo',AST:'Paola Ficticio',ENF:'Luis Fernando Prueba Rivas',MED:'Ana Isabel Ejemplo López',LAB:'Elena Prueba',PAR:'Kevin Alexander Prueba Ramos',DPD:'Daniel Ejemplo',PAC:'María José Hernández Ejemplo'};
export function fixtureProfile(role:string):AccessProfile{return {id:uuid(1),user:{id:uuid(1),email:`${role.toLowerCase()}@example.test`},email:`${role.toLowerCase()}@example.test`,name:profileNames[role]??'Cuenta de prueba',roles:[role],platforms:['web'],permissions:permissions[role as keyof typeof permissions]??[],channels:['publico',`rol:${role}`],staffId:null,patientId:role==='PAC'?patientUuid(1000):null};}
/** Ocupación de cama por índice: unas dos terceras partes ocupadas, una en limpieza, una bloqueada y una reservada. */
const bedState=(n:number)=>n===1?'limpieza':n===9?'bloqueada':n===15?'reservada':[0,2,3,5,6,8,10,11,13,16].includes(n)?'ocupada':'libre';
function building(){
 const spaces:Space[]=[{id:uuid(10),parentId:null,type:'hospital',code:'HOSP',name:'Hospital universitario',active:true,version:1,path:'',totalBeds:0,freeBeds:0}],beds:Bed[]=[];
 for(const floor of [1,2,3])spaces.push({id:uuid(10+floor),parentId:uuid(10),type:'planta',code:'P'+floor,name:'Planta '+floor,level:floor,active:true,version:1,path:'Planta '+floor,totalBeds:0,freeBeds:0});
 spaces.push({id:uuid(20),parentId:uuid(11),type:'area',code:'P1-CON',name:'Consulta general',level:1,active:true,version:1,path:'Planta 1 > Consulta general',totalBeds:0,freeBeds:0});
 for(const floor of [2,3])for(let r=0;r<(floor===2?6:5);r++){
  const code=(floor===2?'HAB-':'VIP-')+(floor*100+r+1),id=uuid(floor*100+r),total=floor===2?2:1;
  const childBeds:Bed[]=[];
  for(let i=0;i<total;i++){const n=beds.length,state=bedState(n);const b:Bed={id:uuid(1000+n),code:`${code}-${i===0?'A':'B'}`,roomId:id,room:code,category:floor===2?'semiprivada':'vip',level:floor,state,version:1,cleaningPending:state==='limpieza',cleaningCompleted:false,cleanedByCurrentUser:false,path:`Planta ${floor} > ${code} > Cama ${i===0?'A':'B'}`};beds.push(b);childBeds.push(b);spaces.push({id:b.id,parentId:id,type:'cama',code:b.code,name:`Cama ${i===0?'A':'B'}`,level:floor,active:true,version:1,path:b.path,totalBeds:1,freeBeds:state==='libre'?1:0});}
  spaces.push({id,parentId:uuid(10+floor),type:'habitacion',code,name:code,category:floor===2?'semiprivada':'vip',capacity:total,level:floor,active:true,version:1,path:`Planta ${floor} > ${code}`,totalBeds:total,freeBeds:childBeds.filter(b=>b.state==='libre').length});
 }
 // Floor and hospital totals come from the beds, so the board and the building always agree.
 for(const s of spaces)if(s.type==='planta'||s.type==='hospital'){const own=beds.filter(b=>s.type==='hospital'||b.level===s.level);s.totalBeds=own.length;s.freeBeds=own.filter(b=>b.state==='libre').length;}
 return {spaces,beds};
}
export class FixtureApi implements Api {
 private readonly building=building();
 private people:Staff[]=[{id:uuid(31),givenNames:'Ana Isabel',surnames:'Ejemplo López',type:'medico',specialty:'Medicina general',areaId:uuid(20),area:'Consulta general',active:true,version:1},{id:uuid(32),givenNames:'Luis Fernando',surnames:'Prueba Rivas',type:'enfermero',areaId:uuid(12),area:'Planta 2',active:true,version:1},{id:uuid(33),givenNames:'Lucía',surnames:'Ejemplo Hernández',type:'recepcionista',area:'Recepción',active:true,version:1},{id:uuid(34),givenNames:'Elena',surnames:'Prueba Martínez',type:'laboratorista',area:'Laboratorio',active:true,version:1},{id:uuid(35),givenNames:'Mario',surnames:'Ejemplo Flores',type:'motorista',area:'Operaciones',active:true,version:1}];
 /** One patient set for the whole preview: the counter (fixtures/front-desk.ts) and the Pacientes module read and edit the same rows. */
 private readonly patients:FixturePatient[]=buildPatients();
 private users:UserAccount[]=[{id:uuid(1),name:'Andrea Ejemplo',email:'administracion@example.test',roles:['ADM'],state:'activo',version:1},{id:uuid(2),name:'Carlos Prueba',email:'operaciones@example.test',roles:['JOP'],state:'activo',version:1},{id:uuid(3),name:'Lucía Ejemplo',email:'recepcion@example.test',roles:['REC'],state:'activo',staffId:uuid(33),version:1},{id:uuid(4),name:'Elena Prueba',email:'laboratorio@example.test',roles:['LAB'],state:'activo',staffId:uuid(34),version:1}];
 private shifts:Shift[]=[{id:uuid(51),staffId:uuid(31),person:'Ana Isabel Ejemplo López',areaId:uuid(20),area:'Consulta general',start:'2026-10-24T13:00:00Z',end:'2026-10-24T21:00:00Z',type:'diurno',state:'publicado',version:1},{id:uuid(52),staffId:uuid(32),person:'Luis Fernando Prueba Rivas',areaId:uuid(12),area:'Planta 2',start:'2026-10-25T13:00:00Z',end:'2026-10-25T21:00:00Z',type:'diurno',state:'borrador',version:1}];
 /** Each domain answers its own paths (`undefined` when a path is not its own); FixtureApi keeps patients, staff, users, building and shifts. */
 private readonly desk:FrontDeskFixtures;
 private readonly domains:{request(path:string):unknown;write(path:string,body:Record<string,any>,method:string):unknown}[];
 constructor(private role:string){
  this.desk=new FrontDeskFixtures(this.patients);
  const hospital=new HospitalFixtures(role,this.patients,this.building.beds);
  this.domains=[this.desk,new LabFixtures(role,this.patients),new AmbulanceFixtures(role,this.patients),hospital,new OperationsFixtures(role,this.patients,this.building.beds,this.building.spaces,this.people,this.shifts),new ClinicFixtures(this.patients)];
 }
 async request<T>(path:string):Promise<T>{
  const url=new URL(path,'https://fixture.invalid'),p=url.pathname,q=url.searchParams;
  let result:unknown;
  for(const domain of this.domains){result=domain.request(path);if(result!==undefined)break;}
  if(result!==undefined){/* a domain fixture answered */}
  else if(p==='/auth/me')result=fixtureProfile(this.role);
  // Lote 5 S9 and S16: the preview account is on shift; the patient's access log has two rows.
  else if(p==='/me/turno-activo'){const start=new Date(Date.now()-2*3600000).toISOString(),end=new Date(Date.now()+6*3600000).toISOString();result={required:this.role!=='PAC'&&this.role!=='ADM',active:true,graceMinutes:15,shift:{id:'turno-preview',start,end,area:'Consulta externa',state:'publicado'},next:null};}
  else if(p==='/ambulancia/cobertura'){const start=new Date(Date.now()+2*86400000);start.setUTCHours(4,0,0,0);result={from:'',to:'',hoursWithoutCrew:8,covered:false,days:[{date:start.toISOString().slice(0,10),hoursWithoutCrew:8}],gaps:[{date:start.toISOString().slice(0,10),hours:8,start:start.toISOString(),end:new Date(start.valueOf()+8*3600000).toISOString(),missing:'motorista'}]};}
  else if(p==='/me/accesos')result=[{fecha:new Date(Date.now()-3600000).toISOString(),rol:'Medicina',tipoDato:'Consulta',motivo:'atención'},{fecha:new Date(Date.now()-3*86400000).toISOString(),rol:'Laboratorio',tipoDato:'Resultados de laboratorio',motivo:'atención'}];
  else if(p==='/pacientes'){const words=fold(q.get('query')??'').split(' ').filter(Boolean),state=q.get('estado');result=this.patients.filter(r=>words.every(w=>fold(`${r.fullName} ${r.record} ${r.dui}`).includes(w))&&(!state||r.state===state)).slice(0,Number(q.get('limit')??50));}
  else if(/^\/pacientes\/[^/]+$/.test(p))result=this.patients.find(r=>r.id===p.split('/')[2]);
  else if(p==='/personal')result=this.people;
  else if(p==='/usuarios')result=this.users;
  else if(p==='/espacios')result=this.building.spaces;
  else if(p==='/camas')result=this.building.beds;
  else if(p==='/turnos')result=this.shifts;
  else if(p==='/inicio'){const beds=this.building.beds;result={lastUpdate:new Date().toISOString(),beds:{total:beds.length,free:beds.filter(b=>b.state==='libre').length,occupied:beds.filter(b=>b.state==='ocupada').length},...(this.role==='REC'?{patients:{total:this.patients.length,active:this.patients.filter(r=>r.active).length}}:{}),...(['ADM','JOP'].includes(this.role)?{staff:{total:5,active:5}}:{}),...(this.role==='ADM'?{users:{total:4,active:4}}:{}),...(this.role==='JOP'?{shifts:{current:1,draft:1}}:{})};}
  else if(p==='/auditoria')result=[{seq:'2',at:'2026-10-24T14:12:00Z',role:'REC',actor:'Lucía Ejemplo',action:'pacientes.buscar',entity:'paciente',entityId:this.patients[0].id,result:'exito'},{seq:'1',at:'2026-10-24T14:10:00Z',role:'PAC',actor:'Cuenta ficticia de paciente',action:'acceso.denegado',entity:'endpoint',entityId:'',result:'denegado'}];
  if(result===undefined)throw new ApiError('Esta vista no tiene datos de diseño.',404);
  return clone(result) as T;
 }
 async write<T>(path:string,raw:unknown,method='POST'):Promise<T>{
  const d=raw as Record<string,any>,id=path.split('/')[2];let result:unknown;
  for(const domain of this.domains){result=domain.write(path,d,method);if(result!==undefined)break;}
  if(result!==undefined){/* a domain fixture answered */}
  else if(path==='/pacientes/busquedas'){const q=fold(d.query);result={token:newFixtureId(),expiresAt:new Date(Date.now()+600000).toISOString(),candidates:this.patients.filter(p=>fold(p.fullName+' '+p.record+' '+(p.dui??'')).includes(q)).slice(0,20)};}
  else if(path==='/pacientes'){const p={...d,givenNames:d.givenNames as string,surnames:d.surnames as string,sex:d.sex as string,birth:(d.birth as string)??'',dui:(d.dui as string)??'',id:newFixtureId(),record:`${String(2000+this.patients.length).padStart(7,'0')}-${this.patients.length%10}`,fullName:d.givenNames+' '+d.surnames,active:true,state:'activo',version:1,history:[]} as FixturePatient;this.patients.push(p);result={id:p.id,record:p.record,version:1};}
  else if(path.startsWith('/pacientes/')){const p=this.patients.find(p=>p.id===id);if(!p)throw new ApiError('No se encontró.',404);if(p.version!==d.version)throw new ApiError('La ficha cambió.',409);if(path.endsWith('/estado')){p.active=d.active;p.state=d.active?'activo':'inactivo';}else Object.assign(p,d,{fullName:(d.givenNames??p.givenNames)+' '+(d.surnames??p.surnames)});p.version++;result={id,version:p.version};}
  else if(path==='/usuarios/invitaciones'){const u={id:newFixtureId(),name:d.displayName,email:d.email,roles:d.roles,state:'activo',version:1} as UserAccount;this.users.push(u);result={userId:u.id,email:u.email,roles:u.roles,status:'sent'};}
  else if(path.startsWith('/usuarios/')){const u=this.users.find(u=>u.id===id);if(!u)throw new ApiError('No se encontró.',404);Object.assign(u,d,{version:u.version+1});result={id,version:u.version};}
  else if(path.startsWith('/personal')){if(method==='POST'){const p={...d,id:newFixtureId(),active:true,version:1} as Staff;this.people.push(p);result=p;}else{const p=this.people.find(p=>p.id===id);if(!p)throw new ApiError('No se encontró.',404);Object.assign(p,d,{version:p.version+1});result=p;}}
  else if(path.startsWith('/turnos')){const person=this.people.find(p=>p.id===d.staffId),area=this.building.spaces.find(s=>s.id===d.areaId);const data={...d,person:person?.givenNames+' '+person?.surnames,area:area?.name};if(method==='POST'){const s={...data,id:newFixtureId(),state:'borrador',version:1} as Shift;this.shifts.push(s);result=s;}else{const s=this.shifts.find(t=>t.id===id);Object.assign(s!,data,{version:s!.version+1});result=s;}}
  else if(path.startsWith('/espacios')){if(method==='PATCH'){const s=this.building.spaces.find(s=>s.id===id);if(!s)throw new ApiError('No se encontró.',404);if(d.capacity&&d.capacity<s.totalBeds)throw new ApiError('La capacidad no puede quedar por debajo de las camas activas.',409);Object.assign(s,d,{version:s.version+1});result=s;}else{const s={...d,id:newFixtureId(),path:d.name,version:1,active:true,totalBeds:0,freeBeds:0} as Space;this.building.spaces.push(s);result=s;}}
  else result={ok:true};
  return clone(result) as T;
 }
}
