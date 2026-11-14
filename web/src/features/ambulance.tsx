import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Field,Notice } from '../components/ui';
import { Dialog,Heading,RemoteState,SaveButton,Select,WriteError,formatDateTime,isVersionConflict,useAction,useData } from './common';
import { can,type AccessProfile,type Api } from '../lib/api';
export type AmbulanceMilestone={type:string;occurredAt:string};
export type AmbulanceRequest={id:string;channel:string;address:string;municipality?:string|null;latitude?:number|null;longitude?:number|null;reason:string;contactPhone:string;createdAt:string;version:number;registeredPatient:boolean};
/** Respuesta de `GET /ambulancia`: la única unidad, su servicio activo (sin datos del paciente), si hay paramédico de turno y, para despacho, las solicitudes por confirmar. */
export type AmbulanceStatus={
 unit:{id:string;plate:string;state:string;version:number};
 activeService:null|{id:string;type:string;priority:string;origin:string;destination:string;municipality?:string|null;dispatchedAt:string;version?:number;requestId?:string|null;hasPrehospital?:boolean;crew:{staffId:string;role:string;name:string}[];milestones?:AmbulanceMilestone[];nextMilestones?:string[];lastLocation?:{latitude:number;longitude:number;capturedAt:string}|null};
 paramedicOnDuty:boolean;
 pendingRequests?:AmbulanceRequest[];
};
export type PrehospitalView={serviceId:string;active:boolean;priority:string;patientLinked:boolean;clinical:boolean;reports:{id:string;priority:string;estimatedArrival?:string|null;capturedAt:string;receivedAt:string;reason?:string;vitalSigns?:Record<string,number>}[]};
export const stateNames:Record<string,string>={disponible:'Disponible',en_servicio:'En servicio',en_mantenimiento:'En mantenimiento'};
export const priorityNames:Record<string,string>={roja:'Roja',naranja:'Naranja',amarilla:'Amarilla',verde:'Verde'};
export const typeNames:Record<string,string>={emergencia_domicilio:'Emergencia a domicilio',traslado_interhospitalario:'Traslado interhospitalario'};
export const milestoneNames:Record<string,string>={salida:'Salida',en_escena:'En escena',trasladando:'Trasladando',en_hospital:'En hospital',finalizado:'Finalizado'};
export const finalStateNames:Record<string,string>={completado:'Completado',cancelado:'Cancelado',sin_traslado:'Sin traslado',rechaza_traslado:'Paciente rechaza traslado'};
const roleNames:Record<string,string>={paramedico:'Paramédico',motorista:'Motorista',medico:'Médico',enfermero:'Enfermería'};
const channelNames:Record<string,string>={app_paciente:'App del paciente',telefono:'Llamada telefónica'};
const signNames:Record<string,string>={heartRate:'Frecuencia cardiaca',systolic:'Presión sistólica',diastolic:'Presión diastólica',respiratoryRate:'Frecuencia respiratoria',oxygenSaturation:'Saturación de oxígeno',temperature:'Temperatura',glasgow:'Glasgow'};
const minutesSince=(iso:string)=>Math.max(0,Math.round((Date.now()-new Date(iso).getTime())/60000));
/** Aviso sonoro breve cuando entra una solicitud (W18); si el navegador no lo permite, no pasa nada. */
function beep(){try{const Ctx=(window as unknown as {AudioContext?:typeof AudioContext}).AudioContext;if(!Ctx)return;const ctx=new Ctx(),osc=ctx.createOscillator();osc.frequency.value=880;osc.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.25);}catch{/* sin audio */}}
/** W18 Centro de despacho (FR-109-01, 04, 07): estado, solicitudes por confirmar, servicio activo con hitos y prehospital; todo se vuelve a pedir con la versión del canal en vivo. */
export function AmbulancePage({api,profile,version}:{api:Api;profile:AccessProfile;version:number}){
 const data=useData<AmbulanceStatus>(api,'/ambulancia',version),[maintenance,setMaintenance]=useState(false),manage=can(profile,'ambulancia.mantenimiento');
 const dispatcher=can(profile,'ambulancia.despachar'),phoneDesk=profile.permissions.some(p=>p.code==='ambulancia.solicitar'&&p.context!=='propio'),receiver=can(profile,'ambulancia.recibir_prehospital');
 const [dispatching,setDispatching]=useState<AmbulanceRequest|'direct'|null>(null),[discarding,setDiscarding]=useState<AmbulanceRequest|null>(null),[calling,setCalling]=useState(false),[report,setReport]=useState<string|null>(null);
 const pendingCount=data.data?.pendingRequests?.length??0,previous=useRef<number|null>(null);
 useEffect(()=>{if(previous.current!==null&&pendingCount>previous.current)beep();if(data.data)previous.current=pendingCount;},[pendingCount,data.data]);
 const saved=()=>{setDispatching(null);setDiscarding(null);setCalling(false);data.refresh();};
 return <><Heading eyebrow="Operaciones / Ambulancia" title="Centro de despacho" description="Estado de la unidad, solicitudes y servicio en curso, actualizado en vivo." actions={phoneDesk?<button type="button" className="secondary-button" onClick={()=>setCalling(true)}>Registrar llamada</button>:undefined}/><RemoteState state={data}>{s=><section className="data-workbench" aria-label="Estado de la unidad">
  <div className="number-strip"><div><strong className="mono-data">{s.unit.plate}</strong><span>Unidad única</span></div><div><strong><span className={`status-tag status-${s.unit.state}`}>{stateNames[s.unit.state]??s.unit.state}</span></strong><span>Estado actual</span></div><div><strong>{s.paramedicOnDuty?'Paramédico de turno':'Sin paramédico con turno en curso'}</strong><span>Cobertura de la tripulación</span></div></div>
  {s.activeService?<ActiveService service={s.activeService} onReport={receiver&&s.activeService.hasPrehospital?()=>setReport(s.activeService!.id):undefined}/>:<p className="muted">Sin servicio activo</p>}
  {dispatcher&&s.pendingRequests&&<PendingRequests rows={s.pendingRequests} available={s.unit.state==='disponible'} onDispatch={setDispatching} onDiscard={setDiscarding}/>}
  {dispatcher&&s.unit.state==='disponible'&&<p><button type="button" className="secondary-button" onClick={()=>setDispatching('direct')}>Despachar traslado sin solicitud</button></p>}
  {manage&&s.unit.state!=='en_servicio'&&<MaintenanceControl status={s} open={maintenance} onOpen={()=>setMaintenance(true)} api={api} onClose={()=>setMaintenance(false)} onSaved={()=>{setMaintenance(false);data.refresh();}}/>}
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
  <div><dt>Despachado</dt><dd>{formatDateTime(service.dispatchedAt)} · hace {minutesSince(service.dispatchedAt)} min</dd></div>
  <div><dt>Tripulación</dt><dd>{service.crew.length?service.crew.map(c=>`${c.name} (${roleNames[c.role]??c.role})`).join(' · '):'Sin tripulación registrada'}</dd></div>
  {service.lastLocation&&<div><dt>Última ubicación</dt><dd className="mono-data">{service.lastLocation.latitude.toFixed(5)}, {service.lastLocation.longitude.toFixed(5)} · {formatDateTime(service.lastLocation.capturedAt)}</dd></div>}
 </dl>
 <ol className="milestone-list" aria-label="Hitos del servicio">{['salida','en_escena','trasladando','en_hospital','finalizado'].map(type=>{const m=milestones.find(x=>x.type===type);return <li key={type} className={m?'done':''}><strong>{milestoneNames[type]}</strong> <span>{m?formatDateTime(m.occurredAt):'Pendiente'}</span></li>;})}</ol>
 {onReport&&<button type="button" className="row-action" onClick={onReport}>Ver reporte prehospital</button>}
 </section>;
}
function PendingRequests({rows,available,onDispatch,onDiscard}:{rows:AmbulanceRequest[];available:boolean;onDispatch:(r:AmbulanceRequest)=>void;onDiscard:(r:AmbulanceRequest)=>void}){
 return <section aria-label="Solicitudes por confirmar"><h2>Solicitudes por confirmar ({rows.length})</h2>{!available&&rows.length>0&&<p className="muted">La unidad no está Disponible; confirma por teléfono y despacha cuando vuelva a estarlo.</p>}
 {rows.length?<table className="record-table"><caption className="sr-only">Solicitudes por confirmar</caption><thead><tr><th>Recibida</th><th>Canal</th><th>Dirección</th><th>Motivo</th><th>Teléfono</th><th>Acción</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
  <td data-label="Recibida">{formatDateTime(r.createdAt)}</td><td data-label="Canal">{channelNames[r.channel]??r.channel}</td><td data-label="Dirección">{r.address}{r.municipality?` · ${r.municipality}`:''}</td><td data-label="Motivo">{r.reason}</td><td data-label="Teléfono" className="mono-data">{r.contactPhone}</td>
  <td data-label="Acción"><div className="row-actions"><button type="button" className="row-action" disabled={!available} onClick={()=>onDispatch(r)}>Confirmar y despachar</button><button type="button" className="row-action" onClick={()=>onDiscard(r)}>Descartar</button></div></td></tr>)}</tbody></table>:<p className="muted">No hay solicitudes por confirmar.</p>}
 </section>;
}
/** Mensaje por `codigo` de la API: el despacho que pierde la carrera recibe `ambulancia_ya_despachada` (FR-109-05). */
function dispatchProblem(code?:string){return code==='ambulancia_ya_despachada'?'La ambulancia ya fue despachada.':code==='sin_paramedico_de_turno'?'No hay un paramédico con turno en curso para el servicio.':code==='unidad_en_mantenimiento'?'La ambulancia está en mantenimiento.':code==='solicitud_resuelta'?'Otra persona ya resolvió esta solicitud.':null;}
function DispatchForm({api,unitVersion,request,onClose,onSaved}:{api:Api;unitVersion:number;request:AmbulanceRequest|null;onClose:()=>void;onSaved:()=>void}){
 const [type,setType]=useState(request?'emergencia_domicilio':'traslado_interhospitalario'),[priority,setPriority]=useState('naranja'),[origin,setOrigin]=useState(''),[destination,setDestination]=useState('Hospital CLIMESA, emergencia'),[municipality,setMunicipality]=useState(request?.municipality??''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(!request&&origin.trim().length<5){setProblem('Indica el origen, de al menos 5 caracteres.');return;}if(destination.trim().length<3){setProblem('Indica el destino.');return;}setProblem('');
  const body={version:unitVersion,type,priority,destination:destination.trim(),...(request?{requestId:request.id}:{origin:origin.trim()}),...(municipality.trim()?{municipality:municipality.trim()}:{})};
  if(await action.run('/ambulancia/servicios',body))onSaved();}
 const known=dispatchProblem(action.error?.code);
 return <Dialog title="Confirmar y despachar" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}
  {known?<><Notice kind="error">{known}</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:isVersionConflict(action.error)?<><Notice kind="error">La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; no se despachó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:<WriteError error={action.error}/>}
  {request?<p>Confirmaste por teléfono la solicitud de <strong>{request.address}</strong>. La unidad pasa a En Servicio.</p>:<Field label="Origen" value={origin} onChange={setOrigin} required minLength={5} maxLength={300}/>}
  <Select label="Tipo de servicio" value={type} onChange={setType} required>{Object.entries(typeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Select label="Prioridad" value={priority} onChange={setPriority} required>{Object.entries(priorityNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Field label="Destino" value={destination} onChange={setDestination} required maxLength={300}/>
  <Field label="Municipio" value={municipality} onChange={setMunicipality} maxLength={80}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Despachar"/></div></form></Dialog>;
}
function DiscardForm({api,request,onClose,onSaved}:{api:Api;request:AmbulanceRequest;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<5){setProblem('Indica el motivo, de al menos 5 caracteres.');return;}setProblem('');if(await action.run(`/ambulancia/solicitudes/${request.id}/descartar`,{version:request.version,reason:reason.trim()}))onSaved();}
 const known=dispatchProblem(action.error?.code);
 return <Dialog title="Descartar solicitud" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}{known?<Notice kind="error">{known}</Notice>:<WriteError error={action.error}/>}<p>{request.address}</p><Field label="Motivo" value={reason} onChange={setReason} required minLength={5} maxLength={500} autoFocus/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Descartar"/></div></form></Dialog>;
}
/** FR-109-03: recepción registra una solicitud recibida por teléfono; queda por confirmar. */
function PhoneRequestForm({api,onClose,onSaved}:{api:Api;onClose:()=>void;onSaved:()=>void}){
 const [address,setAddress]=useState(''),[municipality,setMunicipality]=useState(''),[reason,setReason]=useState(''),[phone,setPhone]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();
  if(address.trim().length<5||reason.trim().length<5){setProblem('Indica la dirección y el motivo, de al menos 5 caracteres cada uno.');return;}
  if(!/^[0-9+ -]{8,20}$/.test(phone.trim())){setProblem('Indica un teléfono de contacto de 8 a 20 dígitos.');return;}
  setProblem('');if(await action.run('/ambulancia/solicitudes',{address:address.trim(),reason:reason.trim(),contactPhone:phone.trim(),...(municipality.trim()?{municipality:municipality.trim()}:{})}))onSaved();}
 return <Dialog title="Registrar llamada" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}<WriteError error={action.error}/>
  <Notice kind="info">Si hay riesgo de vida, indica a la persona que llame al 911.</Notice>
  <Field label="Dirección" value={address} onChange={setAddress} required maxLength={300} autoFocus/><Field label="Municipio" value={municipality} onChange={setMunicipality} maxLength={80}/><Field label="Motivo" value={reason} onChange={setReason} required maxLength={500}/><Field label="Teléfono de contacto" value={phone} onChange={setPhone} required inputMode="tel" maxLength={20}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Registrar solicitud"/></div></form></Dialog>;
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
/** FR-109-06: entrar o salir de mantenimiento (POST /ambulancia/mantenimiento); solo sin servicio activo y, para salir, con paramédico de turno. */
function MaintenanceControl({status,open,onOpen,api,onClose,onSaved}:{status:AmbulanceStatus;open:boolean;onOpen:()=>void;api:Api;onClose:()=>void;onSaved:()=>void}){
 const leaving=status.unit.state==='en_mantenimiento',blocked=leaving&&!status.paramedicOnDuty;
 return <section aria-label="Mantenimiento de la unidad"><h2>Mantenimiento</h2>{blocked&&<p className="muted">Para sacar la unidad de mantenimiento debe haber un paramédico con turno en curso.</p>}<button type="button" className={leaving?'primary-button':'secondary-button'} disabled={blocked} onClick={onOpen}>{leaving?'Sacar de mantenimiento':'Poner en mantenimiento'}</button>{open&&<MaintenanceForm api={api} unit={status.unit} leaving={leaving} onClose={onClose} onSaved={onSaved}/>}</section>;
}
function MaintenanceForm({api,unit,leaving,onClose,onSaved}:{api:Api;unit:AmbulanceStatus['unit'];leaving:boolean;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<10){setProblem('Indica el motivo, de al menos 10 caracteres.');return;}setProblem('');if(await action.run('/ambulancia/mantenimiento',{version:unit.version,inMaintenance:!leaving,reason:reason.trim()}))onSaved();}
 const title=leaving?'Sacar de mantenimiento':'Poner en mantenimiento';
 return <Dialog title={title} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}{isVersionConflict(action.error)?<><Notice kind="error">La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; el cambio no se guardó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:<WriteError error={action.error}/>}<p>{leaving?'La unidad queda Disponible.':'La unidad no podrá despacharse mientras esté en mantenimiento.'}</p><Field label="Motivo" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={title}/></div></form></Dialog>;
}
