export type AmbulanceMilestone={type:string;occurredAt:string};
export type AmbulanceRequest={id:string;channel:string;address:string;municipality?:string|null;latitude?:number|null;longitude?:number|null;reason:string;contactPhone:string;createdAt:string;version:number;registeredPatient:boolean;requesterName?:string|null;callerName?:string|null;patientRecord?:string|null};
/** Por qué no se puede despachar ahora y qué hacer (la calcula la API, RN-29 y RN-30). */
export type DispatchBlock={code:string;message:string;action:string};
/** Respuesta de `GET /ambulancia`: la única unidad, su servicio activo (sin datos del paciente), si hay paramédico y motorista de turno y, para despacho, las solicitudes por confirmar. */
export type AmbulanceStatus={
 unit:{id:string;plate:string;state:string;version:number;stateReason?:string|null;stateSince?:string|null};
 activeService:null|{id:string;type:string;priority:string;origin:string;destination:string;municipality?:string|null;dispatchedAt:string;version?:number;requestId?:string|null;hasPrehospital?:boolean;crew:{staffId:string;role:string;name:string;hasAccount?:boolean}[];milestones?:AmbulanceMilestone[];allowedActions?:string[];nextMilestones?:string[];lastLocation?:{latitude:number;longitude:number;capturedAt:string}|null};
 paramedicOnDuty:boolean;
 /** RN-30 exige también motorista de turno; ausente en una API anterior. */
 driverOnDuty?:boolean;
 dispatchBlock?:DispatchBlock|null;
 pendingRequests?:AmbulanceRequest[];
 /** MA-AMB-02: solo con `ambulancia.despachar`; personal de turno entre el que se elige la tripulación. */
 availableCrew?:CrewCandidate[];
};
export type CrewCandidate={staffId:string;role:string;name:string;hasAccount:boolean};
/** Tripulación propuesta: el primer paramédico con cuenta (registra los hitos) y el primer motorista. */
export function defaultCrew(pool:CrewCandidate[]){const paramedic=pool.find(p=>p.role==='paramedico'&&p.hasAccount);const driver=pool.find(p=>p.role==='motorista');return [paramedic,driver].filter((p):p is CrewCandidate=>!!p).map(p=>p.staffId);}
/** Qué falta en la tripulación elegida (RN-30, BL-05); null si se puede despachar con ella. */
export function crewProblem(pool:CrewCandidate[],chosen:string[]){const picked=pool.filter(p=>chosen.includes(p.staffId));
 if(!picked.some(p=>p.role==='paramedico'&&p.hasAccount))return 'Elige un paramédico con cuenta en la app: registra los hitos del servicio.';
 if(!picked.some(p=>p.role==='motorista'))return 'Elige un motorista de turno para el servicio.';
 return null;}
/** MA-AMB-04: `handover` dice quién recibió al paciente; marcar recibido es del personal clínico en las apps (`allowedActions`). */
export type PrehospitalView={serviceId:string;version:number;active:boolean;arrived:boolean;priority:string;patientLinked:boolean;clinical:boolean;handover:{receivedAt:string;receivedByName:string|null}|null;allowedActions:string[];reports:{id:string;priority:string;estimatedArrival?:string|null;capturedAt:string;receivedAt:string;reason?:string;vitalSigns?:Record<string,number>}[]};
export const stateNames:Record<string,string>={disponible:'Disponible',en_servicio:'En servicio',en_mantenimiento:'En mantenimiento'};
export const priorityNames:Record<string,string>={roja:'Roja',naranja:'Naranja',amarilla:'Amarilla',verde:'Verde'};
/** Triage colour on the shared priority scale: red is the only emergency; orange and yellow are urgent; green is routine. */
export const priorityLevel=(priority:string):'emergencia'|'urgente'|'rutina'=>priority==='roja'?'emergencia':priority==='naranja'||priority==='amarilla'?'urgente':'rutina';
export const typeNames:Record<string,string>={emergencia_domicilio:'Emergencia a domicilio',traslado_interhospitalario:'Traslado interhospitalario'};
export const milestoneNames:Record<string,string>={salida:'Salida',en_escena:'En escena',trasladando:'Trasladando',en_hospital:'En hospital',finalizado:'Finalizado'};
export const finalStateNames:Record<string,string>={completado:'Completado',cancelado:'Cancelado',sin_traslado:'Sin traslado',rechaza_traslado:'Paciente rechaza traslado',fallecido:'Paciente fallecido',desviado:'Desviado a otro centro'};
export const roleNames:Record<string,string>={paramedico:'Paramédico',motorista:'Motorista',medico:'Médico',enfermero:'Enfermería'};
export const channelNames:Record<string,string>={app_paciente:'App del paciente',telefono:'Llamada telefónica'};
export const minutesBetween=(fromIso:string,now=Date.now())=>Math.max(0,Math.round((now-new Date(fromIso).getTime())/60000));
/** «hace 5 min», «hace 2 h 10 min»: lo que espera una persona que lleva rato sin respuesta. */
export function waitingLabel(minutes:number){if(minutes<1)return 'Recién recibida';if(minutes<60)return `Espera ${minutes} min`;const h=Math.floor(minutes/60),m=minutes%60;return `Espera ${h} h${m?` ${m} min`:''}`;}
/** Quién pidió la ambulancia: paciente (nombre o alias), quien llamó, o «Llamada sin identificar». */
export const requesterLabel=(r:Pick<AmbulanceRequest,'requesterName'|'callerName'|'registeredPatient'>)=>r.requesterName?.trim()||r.callerName?.trim()||(r.registeredPatient?'Paciente registrado':'Llamada sin identificar');

/** R4a: a service still «en curso» 12 h after dispatch was most likely never closed; it gets an amber «Sin cierre» flag. */
export const UNCLOSED_HOURS=12;
export const isUnclosed=(dispatchedAt:string,now=Date.now())=>now-new Date(dispatchedAt).getTime()>UNCLOSED_HOURS*3600_000;
/** OpenStreetMap link for a reported position (no key, no tracking script on our page). */
export const mapLink=({latitude,longitude}:{latitude:number;longitude:number})=>`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
