/** Datos ficticios, utilizados exclusivamente por work-preview.html. No accede a la red. */
import permissions from './permissions.json';
import { ApiError,type AccessProfile,type Api,type Bed,type Patient,type Space,type Staff,type Shift,type UserAccount } from '../lib/api';
const clone=<T>(v:T):T=>structuredClone(v);
let fixtureSequence=100000;
const newFixtureId=()=>uuid(++fixtureSequence);
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function fixtureProfile(role:string):AccessProfile{return {id:uuid(1),user:{id:uuid(1),email:`${role.toLowerCase()}@example.test`},email:`${role.toLowerCase()}@example.test`,name:({ADM:'Andrea Ejemplo',JOP:'Carlos Prueba',REC:'Lucía Ejemplo',LAB:'Elena Prueba',DPD:'Daniel Ejemplo'} as Record<string,string>)[role]??'Cuenta de prueba',roles:[role],platforms:['web'],permissions:permissions[role as keyof typeof permissions]??[],channels:['publico',`rol:${role}`],staffId:null,patientId:null};}
function building(){
 const spaces:Space[]=[{id:uuid(10),parentId:null,type:'hospital',code:'HOSP',name:'Hospital universitario',active:true,version:1,path:'',totalBeds:17,freeBeds:12}],beds:Bed[]=[];
 for(const floor of [1,2,3])spaces.push({id:uuid(10+floor),parentId:uuid(10),type:'planta',code:'P'+floor,name:'Planta '+floor,level:floor,active:true,version:1,path:'Planta '+floor,totalBeds:floor===2?12:floor===3?5:0,freeBeds:floor===2?8:floor===3?4:0});
 spaces.push({id:uuid(20),parentId:uuid(11),type:'area',code:'P1-CON',name:'Consulta general',level:1,active:true,version:1,path:'Planta 1 > Consulta general',totalBeds:0,freeBeds:0});
 for(const floor of [2,3])for(let r=0;r<(floor===2?6:5);r++){
  const code=(floor===2?'HAB-':'VIP-')+(floor*100+r+1),id=uuid(floor*100+r),total=floor===2?2:1;
  const childBeds:Bed[]=[];
  for(let i=0;i<total;i++){const n=beds.length,state=n===0||n===5||n===13?'ocupada':n===1?'limpieza':n===15?'reservada':'libre';const b:Bed={id:uuid(1000+n),code:`${code}-${i===0?'A':'B'}`,roomId:id,room:code,category:floor===2?'semiprivada':'vip',level:floor,state,version:1,cleaningPending:state==='limpieza',cleaningCompleted:false,cleanedByCurrentUser:false,path:`Planta ${floor} > ${code} > Cama ${i===0?'A':'B'}`,...(state==='ocupada'?{occupant:['Ana Lucía Ejemplo Hernández','José Manuel Prueba','María Elena Ejemplo'][Math.floor(n/5)%3]}:{})};beds.push(b);childBeds.push(b);spaces.push({id:b.id,parentId:id,type:'cama',code:b.code,name:`Cama ${i===0?'A':'B'}`,level:floor,active:true,version:1,path:b.path,totalBeds:1,freeBeds:state==='libre'?1:0});}
  spaces.push({id,parentId:uuid(10+floor),type:'habitacion',code,name:code,category:floor===2?'semiprivada':'vip',capacity:total,level:floor,active:true,version:1,path:`Planta ${floor} > ${code}`,totalBeds:total,freeBeds:childBeds.filter(b=>b.state==='libre').length});
 }
 return {spaces,beds};
}
export class FixtureApi implements Api {
 private readonly building=building();
 private people:Staff[]=[{id:uuid(31),givenNames:'Ana Isabel',surnames:'Ejemplo López',type:'medico',specialty:'Medicina general',areaId:uuid(20),area:'Consulta general',active:true,version:1},{id:uuid(32),givenNames:'Luis Fernando',surnames:'Prueba Rivas',type:'enfermero',areaId:uuid(12),area:'Planta 2',active:true,version:1},{id:uuid(33),givenNames:'Lucía',surnames:'Ejemplo Hernández',type:'recepcionista',area:'Recepción',active:true,version:1},{id:uuid(34),givenNames:'Elena',surnames:'Prueba Martínez',type:'laboratorista',area:'Laboratorio',active:true,version:1},{id:uuid(35),givenNames:'Mario',surnames:'Ejemplo Flores',type:'motorista',area:'Operaciones',active:true,version:1}];
 private patients:Patient[]=[{id:uuid(41),record:'0000001-X',fullName:'Ana Lucía Ejemplo Hernández',givenNames:'Ana Lucía',surnames:'Ejemplo Hernández',state:'activo',active:true,sex:'femenino',birth:'1990-02-03',phone:'7000-0000',dui:'01234567-8',version:1,history:[]},{id:uuid(42),record:'0000002-8',fullName:'José Manuel Prueba Vásquez',givenNames:'José Manuel',surnames:'Prueba Vásquez',state:'activo',active:true,sex:'masculino',birth:null,version:1,history:[]},{id:uuid(43),record:'0000003-6',fullName:'María Elena Ejemplo Rivas',givenNames:'María Elena',surnames:'Ejemplo Rivas',state:'inactivo',active:false,sex:'femenino',birth:'1985-08-16',version:1,history:[]}];
 private users:UserAccount[]=[{id:uuid(1),name:'Andrea Ejemplo',email:'administracion@example.test',roles:['ADM'],state:'activo',version:1},{id:uuid(2),name:'Carlos Prueba',email:'operaciones@example.test',roles:['JOP'],state:'activo',version:1},{id:uuid(3),name:'Lucía Ejemplo',email:'recepcion@example.test',roles:['REC'],state:'activo',staffId:uuid(33),version:1},{id:uuid(4),name:'Elena Prueba',email:'laboratorio@example.test',roles:['LAB'],state:'activo',staffId:uuid(34),version:1}];
 private shifts:Shift[]=[{id:uuid(51),staffId:uuid(31),person:'Ana Isabel Ejemplo López',areaId:uuid(20),area:'Consulta general',start:'2026-10-24T13:00:00Z',end:'2026-10-24T21:00:00Z',type:'diurno',state:'publicado',version:1},{id:uuid(52),staffId:uuid(32),person:'Luis Fernando Prueba Rivas',areaId:uuid(12),area:'Planta 2',start:'2026-10-25T13:00:00Z',end:'2026-10-25T21:00:00Z',type:'diurno',state:'borrador',version:1}];
 constructor(private role:string){}
 async request<T>(path:string):Promise<T>{
  const url=new URL(path,'https://fixture.invalid'),p=url.pathname;
  let result:unknown;
  if(p==='/auth/me')result=fixtureProfile(this.role);
  else if(p==='/pacientes')result=this.patients;
  else if(p.startsWith('/pacientes/'))result=this.patients.find(r=>r.id===p.split('/')[2]);
  else if(p==='/personal')result=this.people;
  else if(p==='/usuarios')result=this.users;
  else if(p==='/espacios')result=this.building.spaces;
  else if(p==='/camas')result=this.building.beds;
  else if(p==='/turnos')result=this.shifts;
  else if(p==='/inicio'){const beds=this.building.beds;result={lastUpdate:new Date().toISOString(),beds:{total:beds.length,free:beds.filter(b=>b.state==='libre').length,occupied:beds.filter(b=>b.state==='ocupada').length},...(this.role==='REC'?{patients:{total:3,active:2}}:{}),...(['ADM','JOP'].includes(this.role)?{staff:{total:5,active:5}}:{}),...(this.role==='ADM'?{users:{total:4,active:4}}:{}),...(this.role==='JOP'?{shifts:{current:1,draft:1}}:{})};}
  else if(p==='/auditoria')result=[{seq:'2',at:'2026-10-24T14:12:00Z',role:'REC',actor:'Lucía Ejemplo',action:'pacientes.buscar',entity:'paciente',entityId:uuid(41),result:'exito'},{seq:'1',at:'2026-10-24T14:10:00Z',role:'PAC',actor:'Cuenta ficticia de paciente',action:'acceso.denegado',entity:'endpoint',entityId:'',result:'denegado'}];
  else throw new ApiError('Esta vista no tiene datos de diseño.',404);
  return clone(result) as T;
 }
 async write<T>(path:string,raw:unknown,method='POST'):Promise<T>{
  const d=raw as Record<string,any>,id=path.split('/')[2];let result:unknown={ok:true};
  if(path==='/pacientes/busquedas'){const q=d.query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();result={token:newFixtureId(),expiresAt:new Date(Date.now()+600000).toISOString(),candidates:this.patients.filter(p=>(p.fullName+' '+p.record+' '+(p.dui??'')).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q))};}
  else if(path==='/pacientes'){const p={givenNames:d.givenNames as string,surnames:d.surnames as string,sex:d.sex as string,...d,id:newFixtureId(),record:'0000004-4',fullName:d.givenNames+' '+d.surnames,active:true,state:'activo',version:1,history:[]} as Patient;this.patients.push(p);result={id:p.id,record:p.record,version:1};}
  else if(path.startsWith('/pacientes/')){const p=this.patients.find(p=>p.id===id);if(!p)throw new ApiError('No se encontró.',404);if(p.version!==d.version)throw new ApiError('La ficha cambió.',409);if(path.endsWith('/estado')){p.active=d.active;p.state=d.active?'activo':'inactivo';}else Object.assign(p,d,{fullName:d.givenNames+' '+d.surnames});p.version++;result={id,version:p.version};}
  else if(path==='/usuarios/invitaciones'){const u={id:newFixtureId(),name:d.displayName,email:d.email,roles:d.roles,state:'activo',version:1} as UserAccount;this.users.push(u);result={userId:u.id,email:u.email,roles:u.roles,status:'sent'};}
  else if(path.startsWith('/usuarios/')){const u=this.users.find(u=>u.id===id);if(!u)throw new ApiError('No se encontró.',404);Object.assign(u,d,{version:u.version+1});result={id,version:u.version};}
  else if(path.startsWith('/personal')){if(method==='POST'){const p={...d,id:newFixtureId(),active:true,version:1} as Staff;this.people.push(p);result=p;}else{const p=this.people.find(p=>p.id===id);if(!p)throw new ApiError('No se encontró.',404);Object.assign(p,d,{version:p.version+1});result=p;}}
  else if(path.startsWith('/turnos')){const person=this.people.find(p=>p.id===d.staffId),area=this.building.spaces.find(s=>s.id===d.areaId);const data={...d,person:person?.givenNames+' '+person?.surnames,area:area?.name};if(method==='POST'){const s={...data,id:newFixtureId(),state:'borrador',version:1} as Shift;this.shifts.push(s);result=s;}else{const s=this.shifts.find(t=>t.id===id);Object.assign(s!,data,{version:s!.version+1});result=s;}}
  else if(path.startsWith('/espacios')){if(method==='PATCH'){const s=this.building.spaces.find(s=>s.id===id);if(!s)throw new ApiError('No se encontró.',404);if(d.capacity&&d.capacity<s.totalBeds)throw new ApiError('La capacidad no puede quedar por debajo de las camas activas.',409);Object.assign(s,d,{version:s.version+1});result=s;}else{const s={...d,id:newFixtureId(),path:d.name,version:1,active:true,totalBeds:0,freeBeds:0} as Space;this.building.spaces.push(s);result=s;}}
  return clone(result) as T;
 }
}
