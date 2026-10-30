import type { components } from './generated/openapi';
export type AccessProfile={canInviteAdmin?:boolean;id:string;user:{id:string;email?:string};email:string;name:string;roles:string[];platforms:string[];permissions:{code:string;context:string}[];channels:string[];patientId:string|null;staffId:string|null};
export type Patient={id:string;record:string;fullName:string;givenNames:string;surnames:string;state:string;active:boolean;sex:string;birth?:string|null;birthPrecision?:string;phone?:string|null;dui?:string|null;email?:string|null;address?:string|null;version:number;matchReason?:string;history?:{version:number;at:string;reason:string;changes:Record<string,{before:unknown;after:unknown}>}[]};
export type Registration={id:string;board:string;number:string;validFrom:string;validTo:string};
export type Staff={id:string;givenNames:string;surnames:string;type:string;specialty?:string;areaId?:string;area?:string;phone?:string;dui?:string;active:boolean;version:number;registrations?:Registration[]};
export type Space={id:string;parentId:string|null;type:string;code:string;name:string;category?:string;capacity?:number;level?:number;active:boolean;version:number;path:string;totalBeds:number;freeBeds:number};
export type Bed={id:string;code:string;roomId:string;room:string;category:string;level:number;state:string;version:number;cleaningPending:boolean;cleaningCompleted:boolean;cleanedByCurrentUser:boolean;path:string;occupant?:string;occupantRestricted?:boolean;patientId?:string};
export type Shift={id:string;staffId:string;person:string;areaId:string;area:string;start:string;end:string;type:string;state:string;justification?:string;version:number};
export type UserAccount={id:string;email:string;name:string;roles:string[];state:string;staffId?:string;version:number};
export type AuditRow={seq:string;at:string;role:string;actor:string;action:string;entity:string;entityId:string;result:string;reason?:string};
export type Summary={lastUpdate:string;beds?:{total:number;free:number;occupied:number};patients?:{total:number;active:number};staff?:{total:number;active:number};users?:{total:number;active:number};shifts?:{current:number;draft:number}};
export type SearchReceipt={token:string;expiresAt:string;candidates:Patient[]};
export type PatientInput=Omit<components['schemas']['PatientCreateDto'],'searchToken'|'searchQuery'>;
export type StaffInput=components['schemas']['StaffDto'];
export type RegistrationInput=components['schemas']['RegistrationDto'];
export type ShiftInput=components['schemas']['ShiftDto'];
export type SpaceInput=components['schemas']['SpaceDto'];
export type BedBlockInput=components['schemas']['BedBlockDto'];
export type BedTransitionInput=components['schemas']['BedTransitionDto'];
export type InvitationResult={userId:string;email:string;roles:string[];role:string;status:'sent'};
export interface Api {request<T>(path:string,init?:RequestInit):Promise<T>;write<T>(path:string,body:unknown,method?:string):Promise<T>;}
/** `code` y `currentVersion` vienen del problem+json de la API (`codigo`, `versionActual`); faltan en errores de red o sin cuerpo. */
export class ApiError extends Error {constructor(message:string,public status=0,public code?:string,public currentVersion?:number){super(message);}}
const base=(import.meta.env.VITE_API_BASE_URL as string|undefined)?.replace(/\/$/,'')??'http://localhost:3000/api/v1';
export class HttpApi implements Api {
 private attempts=new Map<string,string>();
 constructor(private readonly token:()=>Promise<string>,private readonly unauthorized?:()=>void){}
 async request<T>(path:string,init:RequestInit={}):Promise<T>{
  let response:Response;
  try{response=await fetch(base+path,{...init,cache:'no-store',headers:{Accept:'application/json',Authorization:`Bearer ${await this.token()}`,...(init.body?{'Content-Type':'application/json'}:{}),...init.headers}});}catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new ApiError('No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.');}
  const body=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401)this.unauthorized?.();throw new ApiError(body.detail??body.error?.message??body.message??'No se pudo completar la operación.',response.status,typeof body.codigo==='string'?body.codigo:undefined,typeof body.versionActual==='number'?body.versionActual:undefined);}
  return body as T;
 }
 async write<T>(path:string,body:unknown,method='POST'):Promise<T>{
  const signature=JSON.stringify([method,path,body]);
  const key=this.attempts.get(signature)??crypto.randomUUID();this.attempts.set(signature,key);
  const result=await this.request<T>(path,{method,body:JSON.stringify(body),headers:{'Idempotency-Key':key}});
  this.attempts.delete(signature);return result;
 }
}
export const getAccessProfile=(token:string)=>new HttpApi(async()=>token).request<AccessProfile>('/auth/me');
export const invitePatient=(token:string,input:{email:string;displayName:string})=>new HttpApi(async()=>token).write<InvitationResult>('/usuarios/invitaciones',input);
export const can=(profile:AccessProfile,permission:string)=>profile.permissions.some(p=>p.code===permission);
export const roleNames:Record<string,string>={ADM:'Administración',JOP:'Operaciones',REC:'Recepción',AST:'Asistencia',ENF:'Enfermería',MED:'Medicina',LAB:'Laboratorio',PAR:'Atención prehospitalaria',DPD:'Protección de datos',PAC:'Paciente'};
