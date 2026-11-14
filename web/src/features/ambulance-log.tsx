import { useEffect,useId,useState } from 'react';
import { Field,Icon } from '../components/ui';
import { ExportMenu } from '../components/export-menu';
import { exportName,type ExportTable } from '../lib/export';
import { Empty,Heading,RemoteState,Select,formatDateTime,useData } from './common';
import { type Api } from '../lib/api';
import { finalStateNames,priorityNames,roleNames,typeNames } from './ambulance/types';
import { activeFilters,emptyFilters,logPath,narrate,timeline,type AmbulanceLogRow,type LogFilters } from './ambulance/narrative';
import './ambulance/ambulance.css';
export { logPath };
export type { AmbulanceLogRow };

const rowsOf=(rows:AmbulanceLogRow[]):ExportTable=>({filename:exportName('bitacora-ambulancia'),title:'Bitácora de ambulancia',subtitle:'Servicios con tiempos y destinos; sin datos del paciente (solo expediente enmascarado).',
 columns:['Despachado','Tipo','Prioridad','Origen','Municipio','Destino','Tripulación','Paciente (expediente)','Respuesta (min)','Estado final'],
 rows:rows.map(r=>[formatDateTime(r.dispatchedAt),typeNames[r.type]??r.type,priorityNames[r.priority]??r.priority,r.origin,r.municipality??'',r.destination,r.crew.map(c=>`${c.name} (${roleNames[c.role]??c.role})`).join('; '),r.patientRef??'',r.responseMinutes,r.finalState?finalStateNames[r.finalState]??r.finalState:'En curso'])});

/**
 * W19 Bitácora de ambulancia (FR-109-14, D-056). Búsqueda compacta, filtros en un panel plegable con chips de lo activo,
 * un servicio por tarjeta con su línea de tiempo (o tabla densa) y exportación. La API nunca entrega el nombre del paciente.
 */
export function AmbulanceLogPage({api,version}:{api:Api;version:number}){
 const [filters,setFilters]=useState<LogFilters>(emptyFilters),[text,setText]=useState(''),[open,setOpen]=useState(false),[view,setView]=useState<'cards'|'table'>('cards'),panel=useId();
 useEffect(()=>{const id=window.setTimeout(()=>setFilters(f=>f.q===text.trim()?f:{...f,q:text.trim()}),300);return()=>window.clearTimeout(id);},[text]);
 const data=useData<AmbulanceLogRow[]>(api,logPath(filters),version);
 const set=(k:keyof LogFilters)=>(v:string)=>setFilters(f=>({...f,[k]:v}));
 const chips=activeFilters(filters),anyActive=chips.length>0||filters.q!=='';
 const clear=()=>{setFilters(emptyFilters);setText('');};
 return <><Heading eyebrow="Operaciones / Ambulancia" title="Bitácora de ambulancia" description="Historia de cada servicio con sus tiempos y destinos. Los datos del paciente no se muestran."/>
 <section className="data-workbench amb-log" aria-label="Bitácora de servicios">
  <div className="amb-toolbar">
   <div className="amb-search"><Field label="Buscar en la bitácora" type="search" placeholder="Lugar, municipio o tripulación" value={text} onChange={setText} maxLength={80}/></div>
   <button type="button" className="secondary-button" aria-expanded={open} aria-controls={panel} onClick={()=>setOpen(v=>!v)}><Icon name="chart" size={18}/>Filtros{chips.length?` (${chips.length})`:''}</button>
   <div className="amb-view-toggle" role="group" aria-label="Vista"><button type="button" aria-pressed={view==='cards'} onClick={()=>setView('cards')}>Tarjetas</button><button type="button" aria-pressed={view==='table'} onClick={()=>setView('table')}>Tabla</button></div>
   <ExportMenu table={()=>rowsOf(data.data??[])} disabled={!data.data?.length}/>
  </div>
  {open&&<div id={panel} className="amb-filter-panel" role="region" aria-label="Filtros de la bitácora">
   <Field label="Desde" type="date" value={filters.from} onChange={set('from')}/><Field label="Hasta" type="date" value={filters.to} onChange={set('to')}/>
   <Select label="Tipo" value={filters.type} onChange={set('type')}><option value="">Todos</option>{Object.entries(typeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
   <Select label="Estado final" value={filters.finalState} onChange={set('finalState')}><option value="">Todos</option>{Object.entries(finalStateNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
   <Select label="Prioridad" value={filters.priority} onChange={set('priority')}><option value="">Todas</option>{Object.entries(priorityNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
   <Field label="Municipio" value={filters.municipality} onChange={set('municipality')} maxLength={80}/>
   <Field label="Respuesta mayor o igual a (min)" type="number" min={0} max={1440} value={filters.minResponseMinutes} onChange={set('minResponseMinutes')}/>
  </div>}
  {anyActive&&<div className="amb-chips" aria-label="Filtros activos">{filters.q&&<span className="amb-chip">Búsqueda: {filters.q}<button type="button" aria-label="Quitar búsqueda" onClick={()=>{setText('');setFilters(f=>({...f,q:''}));}}>×</button></span>}
   {chips.map(c=><span className="amb-chip" key={c.key}>{c.label}: {c.value}<button type="button" aria-label={`Quitar filtro ${c.label}`} onClick={()=>setFilters(f=>({...f,[c.key]:''}))}>×</button></span>)}
   <button type="button" className="row-action" onClick={clear}>Quitar filtros</button></div>}
  <RemoteState state={data}>{rows=>rows.length?<><p className="amb-count" role="status">{rows.length} {rows.length===1?'servicio':'servicios'}{rows.length>=500?' (se muestran los 500 más recientes)':''}</p>{view==='cards'?<ol className="amb-service-list" aria-label="Servicios de ambulancia">{rows.map(r=><li key={r.id} className={`amb-service amb-prio-${r.priority}`}>
    <header><span className="amb-prio-chip">{priorityNames[r.priority]??r.priority}</span><strong>{typeNames[r.type]??r.type}</strong><time dateTime={r.dispatchedAt}>{formatDateTime(r.dispatchedAt)}</time><span className={`status-tag status-${r.finalState??'en_curso'}`}>{r.finalState?finalStateNames[r.finalState]??r.finalState:'En curso'}</span></header>
    <p className="amb-narrative">{narrate(r)}</p>
    {timeline(r).length>0&&<ol className="amb-timeline" aria-label="Hitos del servicio">{timeline(r).map(m=><li key={m.type}><span>{m.label}</span><time>{m.time}</time></li>)}</ol>}
    <p className="muted amb-response">{r.responseMinutes===null?'Sin llegada a escena':`Llegó a la escena en ${r.responseMinutes} min`}</p></li>)}</ol>
   :<table className="record-table"><caption className="sr-only">Servicios de ambulancia</caption><thead><tr><th>Fecha</th><th>Tipo</th><th>Prioridad</th><th>Origen</th><th>Destino</th><th>Tripulación</th><th>Respuesta</th><th>Estado final</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
    <td data-label="Fecha">{formatDateTime(r.dispatchedAt)}</td><td data-label="Tipo">{typeNames[r.type]??r.type}</td><td data-label="Prioridad">{priorityNames[r.priority]??r.priority}</td>
    <td data-label="Origen">{r.origin}{r.municipality?` · ${r.municipality}`:''}</td><td data-label="Destino">{r.destination}</td><td data-label="Tripulación">{r.crew.map(c=>c.name).join(', ')||'Sin registrar'}</td>
    <td data-label="Respuesta">{r.responseMinutes===null?'Sin llegada a escena':`${r.responseMinutes} min`}</td><td data-label="Estado final">{r.finalState?finalStateNames[r.finalState]??r.finalState:'En curso'}</td></tr>)}</tbody></table>}</>:<Empty title="Sin servicios con esos filtros" description="Quita algún filtro o cambia la búsqueda para ver otros servicios."/>}</RemoteState>
 </section></>;
}
