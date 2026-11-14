import { finalStateNames,milestoneNames,priorityNames,typeNames } from './types';
/** Fila de `GET /ambulancia/bitacora`: nunca trae nombre ni identificadores del paciente (FR-109-15); solo el expediente enmascarado. */
export type AmbulanceLogRow={id:string;type:string;priority:string;origin:string;destination:string;municipality?:string|null;dispatchedAt:string;finishedAt?:string|null;finalState?:string|null;responseMinutes:number|null;crew:{staffId:string;role:string;name:string}[];milestones?:{type:string;occurredAt:string}[];patientRef?:string|null};
export type LogFilters={q:string;from:string;to:string;type:string;finalState:string;priority:string;municipality:string;minResponseMinutes:string};
export const emptyFilters:LogFilters={q:'',from:'',to:'',type:'',finalState:'',priority:'',municipality:'',minResponseMinutes:''};
export const logPath=(f:Partial<LogFilters>)=>{const q=new URLSearchParams();for(const [k,v] of Object.entries(f))if(typeof v==='string'&&v.trim())q.set(k,v.trim());const s=q.toString();return '/ambulancia/bitacora'+(s?`?${s}`:'');};
const filterLabels:Record<Exclude<keyof LogFilters,'q'>,string>={from:'Desde',to:'Hasta',type:'Tipo',finalState:'Estado final',priority:'Prioridad',municipality:'Municipio',minResponseMinutes:'Respuesta desde'};
const valueLabel=(key:keyof LogFilters,value:string)=>key==='type'?typeNames[value]:key==='finalState'?finalStateNames[value]:key==='priority'?priorityNames[value]:key==='minResponseMinutes'?`${value} min`:value;
/** Un chip por filtro activo (la búsqueda libre tiene su propia caja). */
export const activeFilters=(f:LogFilters)=>(Object.keys(filterLabels) as Array<Exclude<keyof LogFilters,'q'>>).filter(k=>f[k].trim()).map(k=>({key:k,label:filterLabels[k],value:valueLabel(k,f[k].trim())??f[k].trim()}));
const clock=(iso:string)=>new Intl.DateTimeFormat('es-SV',{hour:'2-digit',minute:'2-digit',timeZone:'America/El_Salvador'}).format(new Date(iso));
/** «Ambulancia salió de A hacia B…»: la historia de un servicio en una frase, sin identidad del paciente. */
export function narrate(r:AmbulanceLogRow){
 const left=r.milestones?.find(m=>m.type==='salida'),moved=!!left||!!r.milestones?.some(m=>m.type!=='finalizado');
 const verb=moved?'salió':'fue despachada';
 const where=r.municipality?` (${r.municipality})`:'';
 const patient=r.patientRef?`paciente con expediente ${r.patientRef}`:'sin paciente vinculado';
 const crew=r.crew.length?`, con ${r.crew.map(c=>c.name).join(' y ')}`:'';
 const end=r.finalState?`, ${(finalStateNames[r.finalState]??r.finalState).toLowerCase()}`:', en curso';
 return `La ambulancia ${verb} de ${r.origin}${where} hacia ${r.destination} — ${patient}${crew}${end}.`;
}
/** Hitos con hora local en orden; los que faltan no se muestran. */
export const timeline=(r:AmbulanceLogRow)=>(r.milestones??[]).map(m=>({type:m.type,label:milestoneNames[m.type]??m.type,time:clock(m.occurredAt)}));
