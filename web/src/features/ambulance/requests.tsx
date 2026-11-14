import { useEffect,useState } from 'react';
import { Notice } from '../../components/ui';
import { formatDateTime } from '../common';
import { channelNames,minutesBetween,requesterLabel,waitingLabel,type AmbulanceRequest,type AmbulanceStatus } from './types';

/**
 * Solicitudes por confirmar en maestro-detalle (obs. 7): a la izquierda quién pidió y cuánto espera; a la derecha
 * los datos completos para decidir y las acciones. Si la unidad no puede despachar, el detalle dice por qué y qué hacer.
 */
export function RequestsBoard({status,onDispatch,onDiscard}:{status:AmbulanceStatus;onDispatch:(r:AmbulanceRequest)=>void;onDiscard:(r:AmbulanceRequest)=>void}){
 const rows=status.pendingRequests??[],available=status.unit.state==='disponible'&&!status.dispatchBlock;
 const [selected,setSelected]=useState<string|null>(null),[now,setNow]=useState(()=>Date.now());
 // El reloj solo repinta el tiempo de espera; los datos llegan por tiempo real, no por sondeo.
 useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),30000);return()=>window.clearInterval(id);},[]);
 const current=rows.find(r=>r.id===selected)??rows[0]??null;
 return <section aria-label="Solicitudes por confirmar" className="amb-requests"><h2>Solicitudes por confirmar ({rows.length})</h2>
  {rows.length===0?<p className="muted">No hay solicitudes por confirmar.</p>:<div className="amb-master-detail">
   <ul className="amb-request-list" aria-label="Lista de solicitudes">{rows.map(r=>{const wait=minutesBetween(r.createdAt,now);return <li key={r.id}><button type="button" className={`amb-request-item${current?.id===r.id?' is-selected':''}${wait>=10?' is-urgent':''}`} aria-pressed={current?.id===r.id} onClick={()=>setSelected(r.id)}>
     <span className="amb-request-top"><strong>{requesterLabel(r)}</strong><span className="amb-wait">{waitingLabel(wait)}</span></span>
     <span className="amb-request-where">{r.address}{r.municipality?` · ${r.municipality}`:''}</span>
     <span className="amb-request-reason">{r.reason}</span>
     <span className={`amb-channel amb-channel-${r.channel}`}>{channelNames[r.channel]??r.channel}</span></button></li>;})}</ul>
   {current&&<RequestDetail request={current} now={now} available={available} block={status.dispatchBlock??null} onDispatch={onDispatch} onDiscard={onDiscard}/>}
  </div>}
 </section>;
}
function RequestDetail({request:r,now,available,block,onDispatch,onDiscard}:{request:AmbulanceRequest;now:number;available:boolean;block:AmbulanceStatus['dispatchBlock'];onDispatch:(r:AmbulanceRequest)=>void;onDiscard:(r:AmbulanceRequest)=>void}){
 const wait=minutesBetween(r.createdAt,now);
 return <article className="amb-request-detail" aria-label="Detalle de la solicitud">
  <header><h3>{requesterLabel(r)}</h3><span className={`amb-channel amb-channel-${r.channel}`}>{channelNames[r.channel]??r.channel}</span></header>
  <dl className="detail-grid">
   <div><dt>Quién pidió</dt><dd>{r.requesterName||r.callerName||'No dio su nombre'}{r.registeredPatient&&r.patientRecord?<> · expediente <span className="mono-data">{r.patientRecord}</span></>:r.registeredPatient?null:<> · sin expediente</>}</dd></div>
   <div><dt>Teléfono de contacto</dt><dd className="mono-data">{r.contactPhone}</dd></div>
   <div><dt>Dónde está</dt><dd>{r.address}</dd></div>
   <div><dt>Municipio</dt><dd>{r.municipality||'Sin indicar'}</dd></div>
   <div><dt>Motivo de la llamada</dt><dd>{r.reason}</dd></div>
   <div><dt>Recibida</dt><dd>{formatDateTime(r.createdAt)} · {waitingLabel(wait).toLowerCase()}</dd></div>
  </dl>
  {!available&&block&&<Notice kind="info"><strong>No se puede despachar ahora.</strong> {block.message} {block.action}</Notice>}
  <div className="row-actions amb-request-actions"><button type="button" className="primary-button" disabled={!available} onClick={()=>onDispatch(r)}>Confirmar y despachar</button><button type="button" className="secondary-button" onClick={()=>onDiscard(r)}>Descartar</button></div>
  {!available&&!block&&<p className="muted">La unidad no está disponible; confirma por teléfono y despacha cuando vuelva a estarlo.</p>}
 </article>;
}
