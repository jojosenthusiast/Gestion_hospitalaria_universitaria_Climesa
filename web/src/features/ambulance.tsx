import { useEffect,useRef,useState } from 'react';
import { Notice } from '../components/ui';
import { Dialog,Heading,RemoteState,formatDateTime,useData } from './common';
import { can,type AccessProfile,type Api } from '../lib/api';
import { DiscardForm,DispatchForm,PhoneRequestForm } from './ambulance/dialogs';
import { MaintenancePanel } from './ambulance/maintenance';
import { RequestsBoard } from './ambulance/requests';
import { CrewAction,CrewCoverage,missingCrew } from './ambulance/crew';
import { milestoneNames,minutesBetween,priorityNames,roleNames,stateNames,typeNames,type AmbulanceRequest,type AmbulanceStatus,type PrehospitalView } from './ambulance/types';
import './ambulance/ambulance.css';
export * from './ambulance/types';
const signNames:Record<string,string>={heartRate:'Frecuencia cardiaca',systolic:'Presión sistólica',diastolic:'Presión diastólica',respiratoryRate:'Frecuencia respiratoria',oxygenSaturation:'Saturación de oxígeno',temperature:'Temperatura',glasgow:'Glasgow'};
/** Aviso sonoro breve cuando entra una solicitud (W18); si el navegador no lo permite, no pasa nada. */
function beep(){try{const Ctx=(window as unknown as {AudioContext?:typeof AudioContext}).AudioContext;if(!Ctx)return;const ctx=new Ctx(),osc=ctx.createOscillator();osc.frequency.value=880;osc.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.25);}catch{/* sin audio */}}
/** W18 Centro de despacho (FR-109-01, 04, 07): estado, solicitudes por confirmar, servicio activo con hitos y prehospital; todo se vuelve a pedir con la versión del canal en vivo. */
export function AmbulancePage({api,profile,version}:{api:Api;profile:AccessProfile;version:number}){
 const data=useData<AmbulanceStatus>(api,'/ambulancia',version),manage=can(profile,'ambulancia.mantenimiento');
 const dispatcher=can(profile,'ambulancia.despachar'),phoneDesk=profile.permissions.some(p=>p.code==='ambulancia.solicitar'&&p.context!=='propio'),receiver=can(profile,'ambulancia.recibir_prehospital');
 const [dispatching,setDispatching]=useState<AmbulanceRequest|'direct'|null>(null),[discarding,setDiscarding]=useState<AmbulanceRequest|null>(null),[calling,setCalling]=useState(false),[report,setReport]=useState<string|null>(null);
 const pendingCount=data.data?.pendingRequests?.length??0,previous=useRef<number|null>(null);
 useEffect(()=>{if(previous.current!==null&&pendingCount>previous.current)beep();if(data.data)previous.current=pendingCount;},[pendingCount,data.data]);
 const saved=()=>{setDispatching(null);setDiscarding(null);setCalling(false);data.refresh();};
 return <><Heading eyebrow="Operaciones / Ambulancia" title="Centro de despacho" description="Estado de la unidad, solicitudes y servicio en curso, actualizado en vivo." actions={phoneDesk?<button type="button" className="secondary-button" onClick={()=>setCalling(true)}>Registrar llamada</button>:undefined}/><RemoteState state={data}>{s=><section className="data-workbench" aria-label="Estado de la unidad">
  <div className="number-strip"><div><strong className="mono-data">{s.unit.plate}</strong><span>Unidad única</span></div><div><strong><span className={`status-tag status-${s.unit.state}`}>{stateNames[s.unit.state]??s.unit.state}</span></strong><span>Estado actual</span></div><CrewCoverage status={s}/></div>
  {dispatcher&&s.dispatchBlock&&<section aria-label="Despacho bloqueado"><Notice kind="info"><strong>No se puede despachar ahora.</strong> {s.dispatchBlock.message} {s.dispatchBlock.action}</Notice>{missingCrew(s)&&<p className="amb-crew-next"><CrewAction profile={profile} missing={missingCrew(s)!}/></p>}</section>}
  {s.activeService?<ActiveService service={s.activeService} onReport={receiver&&s.activeService.hasPrehospital?()=>setReport(s.activeService!.id):undefined}/>:<p className="muted">Sin servicio activo</p>}
  {dispatcher&&s.pendingRequests&&<RequestsBoard status={s} onDispatch={setDispatching} onDiscard={setDiscarding}/>}
  {dispatcher&&s.unit.state==='disponible'&&!s.dispatchBlock&&<p><button type="button" className="secondary-button" onClick={()=>setDispatching('direct')}>Despachar traslado sin solicitud</button></p>}
  {manage&&s.unit.state!=='en_servicio'&&<MaintenancePanel status={s} api={api} profile={profile} onSaved={data.refresh}/>}
  {dispatching&&<DispatchForm api={api} unitVersion={s.unit.version} request={dispatching==='direct'?null:dispatching} onClose={()=>setDispatching(null)} onSaved={saved}/>}
  {discarding&&<DiscardForm api={api} request={discarding} onClose={()=>setDiscarding(null)} onSaved={saved}/>}
 </section>}</RemoteState>
 {calling&&<PhoneRequestForm api={api} onClose={()=>setCalling(false)} onSaved={saved}/>}
 {report&&<PrehospitalDialog api={api} serviceId={report} version={version} onClose={()=>setReport(null)}/>}
 </>;
}
function ActiveService({service,onReport}:{service:NonNullable<AmbulanceStatus['activeService']>;onReport?:()=>void}){
 const milestones=service.milestones??[];
 return <section aria-label="Servicio activo"><h2>Servicio activo</h2><dl className="detail-grid">
  <div><dt>Tipo</dt><dd>{typeNames[service.type]??service.type}</dd></div><div><dt>Prioridad</dt><dd>{priorityNames[service.priority]??service.priority}</dd></div>
  <div><dt>Origen</dt><dd>{service.origin}</dd></div><div><dt>Destino</dt><dd>{service.destination}</dd></div>
  <div><dt>Despachado</dt><dd>{formatDateTime(service.dispatchedAt)} · hace {minutesBetween(service.dispatchedAt)} min</dd></div>
  <div><dt>Tripulación</dt><dd>{service.crew.length?service.crew.map(c=>`${c.name} (${roleNames[c.role]??c.role})`).join(' · '):'Sin tripulación registrada'}</dd></div>
  {service.lastLocation&&<div><dt>Última ubicación</dt><dd className="mono-data">{service.lastLocation.latitude.toFixed(5)}, {service.lastLocation.longitude.toFixed(5)} · {formatDateTime(service.lastLocation.capturedAt)}</dd></div>}
 </dl>
 <ol className="milestone-list" aria-label="Hitos del servicio">{['salida','en_escena','trasladando','en_hospital','finalizado'].map(type=>{const m=milestones.find(x=>x.type===type);return <li key={type} className={m?'done':''}><strong>{milestoneNames[type]}</strong> <span>{m?formatDateTime(m.occurredAt):'Pendiente'}</span></li>;})}</ol>
 {onReport&&<button type="button" className="row-action" onClick={onReport}>Ver reporte prehospital</button>}
 </section>;
}
/** FR-109-11: reporte prehospital; la API omite motivo y signos a quien no tiene relación de atención. */
function PrehospitalDialog({api,serviceId,version,onClose}:{api:Api;serviceId:string;version:number;onClose:()=>void}){
 const data=useData<PrehospitalView>(api,`/ambulancia/servicios/${serviceId}/prehospital`,version);
 return <Dialog title="Reporte prehospital" onClose={onClose}><RemoteState state={data}>{v=>v.reports.length?<div>{!v.clinical&&<Notice kind="info">Los datos clínicos solo los ve el equipo que recibe al paciente.</Notice>}{v.reports.map(r=><dl key={r.id} className="detail-grid">
  <div><dt>Prioridad</dt><dd>{priorityNames[r.priority]??r.priority}</dd></div><div><dt>Hora estimada de llegada</dt><dd>{r.estimatedArrival?formatDateTime(r.estimatedArrival):'Sin estimar'}</dd></div><div><dt>Capturado</dt><dd>{formatDateTime(r.capturedAt)}</dd></div>
  {r.reason!==undefined&&<div><dt>Motivo</dt><dd>{r.reason}</dd></div>}
  {r.vitalSigns&&Object.entries(r.vitalSigns).map(([k,val])=><div key={k}><dt>{signNames[k]??k}</dt><dd>{val}</dd></div>)}
 </dl>)}</div>:<p className="muted">Aún no llega un reporte.</p>}</RemoteState></Dialog>;
}
