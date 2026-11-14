export type AmbulanceMilestone={type:string;occurredAt:string};
export type AmbulanceRequest={id:string;channel:string;address:string;municipality?:string|null;latitude?:number|null;longitude?:number|null;reason:string;contactPhone:string;createdAt:string;version:number;registeredPatient:boolean;requesterName?:string|null;callerName?:string|null;patientRecord?:string|null};
/** Por qué no se puede despachar ahora y qué hacer (la calcula la API, RN-29 y RN-30). */
export type DispatchBlock={code:string;message:string;action:string};
/** Respuesta de `GET /ambulancia`: la única unidad, su servicio activo (sin datos del paciente), si hay paramédico de turno y, para despacho, las solicitudes por confirmar. */
export type AmbulanceStatus={
 unit:{id:string;plate:string;state:string;version:number;stateReason?:string|null;stateSince?:string|null};
 activeService:null|{id:string;type:string;priority:string;origin:string;destination:string;municipality?:string|null;dispatchedAt:string;version?:number;requestId?:string|null;hasPrehospital?:boolean;crew:{staffId:string;role:string;name:string}[];milestones?:AmbulanceMilestone[];nextMilestones?:string[];lastLocation?:{latitude:number;longitude:number;capturedAt:string}|null};
 paramedicOnDuty:boolean;
 dispatchBlock?:DispatchBlock|null;
 pendingRequests?:AmbulanceRequest[];
};
export type PrehospitalView={serviceId:string;active:boolean;priority:string;patientLinked:boolean;clinical:boolean;reports:{id:string;priority:string;estimatedArrival?:string|null;capturedAt:string;receivedAt:string;reason?:string;vitalSigns?:Record<string,number>}[]};
export const stateNames:Record<string,string>={disponible:'Disponible',en_servicio:'En servicio',en_mantenimiento:'En mantenimiento'};
export const priorityNames:Record<string,string>={roja:'Roja',naranja:'Naranja',amarilla:'Amarilla',verde:'Verde'};
export const typeNames:Record<string,string>={emergencia_domicilio:'Emergencia a domicilio',traslado_interhospitalario:'Traslado interhospitalario'};
export const milestoneNames:Record<string,string>={salida:'Salida',en_escena:'En escena',trasladando:'Trasladando',en_hospital:'En hospital',finalizado:'Finalizado'};
export const finalStateNames:Record<string,string>={completado:'Completado',cancelado:'Cancelado',sin_traslado:'Sin traslado',rechaza_traslado:'Paciente rechaza traslado'};
export const roleNames:Record<string,string>={paramedico:'Paramédico',motorista:'Motorista',medico:'Médico',enfermero:'Enfermería'};
export const channelNames:Record<string,string>={app_paciente:'App del paciente',telefono:'Llamada telefónica'};
export const minutesBetween=(fromIso:string,now=Date.now())=>Math.max(0,Math.round((now-new Date(fromIso).getTime())/60000));
/** «hace 5 min», «hace 2 h 10 min»: lo que espera una persona que lleva rato sin respuesta. */
export function waitingLabel(minutes:number){if(minutes<1)return 'Recién recibida';if(minutes<60)return `Espera ${minutes} min`;const h=Math.floor(minutes/60),m=minutes%60;return `Espera ${h} h${m?` ${m} min`:''}`;}
/** Quién pidió la ambulancia: paciente (nombre o alias), quien llamó, o «Llamada sin identificar». */
export const requesterLabel=(r:Pick<AmbulanceRequest,'requesterName'|'callerName'|'registeredPatient'>)=>r.requesterName?.trim()||r.callerName?.trim()||(r.registeredPatient?'Paciente registrado':'Llamada sin identificar');
