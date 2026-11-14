import { useState,type FormEvent } from 'react';
import { Field } from '../components/ui';
import { Empty,Heading,RemoteState,Select,formatDateTime,useData } from './common';
import { type Api } from '../lib/api';
import { finalStateNames,priorityNames,typeNames } from './ambulance';
/** Fila de `GET /ambulancia/bitacora`: nunca trae datos del paciente (FR-109-15). */
export type AmbulanceLogRow={id:string;type:string;priority:string;origin:string;destination:string;municipality?:string|null;dispatchedAt:string;finishedAt?:string|null;finalState?:string|null;responseMinutes:number|null;crew:{staffId:string;role:string;name:string}[]};
type Filters={from:string;to:string;type:string;finalState:string;priority:string;municipality:string;minResponseMinutes:string};
const empty:Filters={from:'',to:'',type:'',finalState:'',priority:'',municipality:'',minResponseMinutes:''};
export const logPath=(f:Filters)=>{const q=new URLSearchParams();for(const [k,v] of Object.entries(f))if(v.trim())q.set(k,v.trim());const s=q.toString();return '/ambulancia/bitacora'+(s?`?${s}`:'');};
/** W19 Bitácora de ambulancia (FR-109-14, D-056): filtros por fecha, tipo, estado final, prioridad, municipio y tiempo de respuesta. */
export function AmbulanceLogPage({api,version}:{api:Api;version:number}){
 const [draft,setDraft]=useState<Filters>(empty),[applied,setApplied]=useState<Filters>(empty);
 const data=useData<AmbulanceLogRow[]>(api,logPath(applied),version);
 const set=(k:keyof Filters)=>(v:string)=>setDraft(d=>({...d,[k]:v}));
 function apply(e:FormEvent){e.preventDefault();setApplied(draft);}
 return <><Heading eyebrow="Operaciones / Ambulancia" title="Bitácora de ambulancia" description="Historial de servicios con tiempos y destinos. Los datos del paciente no se muestran."/>
 <form className="module-form filter-bar" onSubmit={apply} aria-label="Filtros de la bitácora">
  <Field label="Desde" type="date" value={draft.from} onChange={set('from')}/><Field label="Hasta" type="date" value={draft.to} onChange={set('to')}/>
  <Select label="Tipo" value={draft.type} onChange={set('type')}><option value="">Todos</option>{Object.entries(typeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Select label="Estado final" value={draft.finalState} onChange={set('finalState')}><option value="">Todos</option>{Object.entries(finalStateNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Select label="Prioridad" value={draft.priority} onChange={set('priority')}><option value="">Todas</option>{Object.entries(priorityNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Field label="Municipio" value={draft.municipality} onChange={set('municipality')} maxLength={80}/>
  <Field label="Respuesta mayor o igual a (min)" type="number" min={0} max={1440} value={draft.minResponseMinutes} onChange={set('minResponseMinutes')}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>{setDraft(empty);setApplied(empty);}}>Limpiar</button><button type="submit" className="primary-button">Filtrar</button></div>
 </form>
 <section className="data-workbench"><RemoteState state={data}>{rows=>rows.length?<table className="record-table"><caption className="sr-only">Servicios de ambulancia</caption><thead><tr><th>Fecha</th><th>Tipo</th><th>Prioridad</th><th>Origen</th><th>Destino</th><th>Tripulación</th><th>Respuesta</th><th>Estado final</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
  <td data-label="Fecha">{formatDateTime(r.dispatchedAt)}</td><td data-label="Tipo">{typeNames[r.type]??r.type}</td><td data-label="Prioridad">{priorityNames[r.priority]??r.priority}</td>
  <td data-label="Origen">{r.origin}{r.municipality?` · ${r.municipality}`:''}</td><td data-label="Destino">{r.destination}</td><td data-label="Tripulación">{r.crew.map(c=>c.name).join(', ')||'Sin registrar'}</td>
  <td data-label="Respuesta">{r.responseMinutes===null?'Sin llegada a escena':`${r.responseMinutes} min`}</td><td data-label="Estado final">{r.finalState?finalStateNames[r.finalState]??r.finalState:'En curso'}</td></tr>)}</tbody></table>:<Empty title="Sin servicios con esos filtros" description="Ajusta los filtros para ver otros servicios."/>}</RemoteState></section></>;
}
