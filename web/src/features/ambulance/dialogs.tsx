import { useState,type FormEvent } from 'react';
import { Field,Notice } from '../../components/ui';
import { Dialog,SaveButton,Select,WriteError,isVersionConflict,useAction } from '../common';
import { type Api } from '../../lib/api';
import { priorityNames,typeNames,type AmbulanceRequest } from './types';

/** Mensaje por `codigo` de la API: el despacho que pierde la carrera recibe `ambulancia_ya_despachada` (FR-109-05). */
export function dispatchProblem(code?:string){return code==='ambulancia_ya_despachada'?'La ambulancia ya fue despachada.':code==='sin_paramedico_de_turno'?'No hay un paramédico con turno en curso para el servicio.':code==='sin_motorista_de_turno'?'No hay un motorista con turno en curso para el servicio.':code==='sin_tripulacion_de_turno'?'No hay paramédico ni motorista con turno en curso para el servicio.':code==='unidad_en_mantenimiento'?'La ambulancia está en mantenimiento.':code==='solicitud_resuelta'?'Otra persona ya resolvió esta solicitud.':null;}
export function DispatchForm({api,unitVersion,request,onClose,onSaved}:{api:Api;unitVersion:number;request:AmbulanceRequest|null;onClose:()=>void;onSaved:()=>void}){
 const [type,setType]=useState(request?'emergencia_domicilio':'traslado_interhospitalario'),[priority,setPriority]=useState('naranja'),[origin,setOrigin]=useState(''),[destination,setDestination]=useState('Hospital CLIMESA, emergencia'),[municipality,setMunicipality]=useState(request?.municipality??''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(!request&&origin.trim().length<5){setProblem('Indica el origen, de al menos 5 caracteres.');return;}if(destination.trim().length<3){setProblem('Indica el destino.');return;}setProblem('');
  const body={version:unitVersion,type,priority,destination:destination.trim(),...(request?{requestId:request.id}:{origin:origin.trim()}),...(municipality.trim()?{municipality:municipality.trim()}:{})};
  if(await action.run('/ambulancia/servicios',body))onSaved();}
 const known=dispatchProblem(action.error?.code);
 return <Dialog title="Confirmar y despachar" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}
  {known?<><Notice kind="error">{known}</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:isVersionConflict(action.error)?<><Notice kind="error">La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; no se despachó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:<WriteError error={action.error}/>}
  {request?<p>Confirmaste por teléfono la solicitud de <strong>{request.address}</strong>{request.requesterName?<> (pidió {request.requesterName})</>:null}. La unidad pasa a En Servicio.</p>:<Field label="Origen" value={origin} onChange={setOrigin} required minLength={5} maxLength={300}/>}
  <Select label="Tipo de servicio" value={type} onChange={setType} required>{Object.entries(typeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Select label="Prioridad" value={priority} onChange={setPriority} required>{Object.entries(priorityNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Field label="Destino" value={destination} onChange={setDestination} required maxLength={300}/>
  <Field label="Municipio" value={municipality} onChange={setMunicipality} maxLength={80}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Despachar"/></div></form></Dialog>;
}
export function DiscardForm({api,request,onClose,onSaved}:{api:Api;request:AmbulanceRequest;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<5){setProblem('Indica el motivo, de al menos 5 caracteres.');return;}setProblem('');if(await action.run(`/ambulancia/solicitudes/${request.id}/descartar`,{version:request.version,reason:reason.trim()}))onSaved();}
 const known=dispatchProblem(action.error?.code);
 return <Dialog title="Descartar solicitud" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}{known?<Notice kind="error">{known}</Notice>:<WriteError error={action.error}/>}<p>{request.address}</p><Field label="Motivo" value={reason} onChange={setReason} required minLength={5} maxLength={500} autoFocus/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Descartar"/></div></form></Dialog>;
}
/** FR-109-03: recepción registra una solicitud recibida por teléfono; queda por confirmar. */
export function PhoneRequestForm({api,onClose,onSaved}:{api:Api;onClose:()=>void;onSaved:()=>void}){
 const [address,setAddress]=useState(''),[municipality,setMunicipality]=useState(''),[reason,setReason]=useState(''),[phone,setPhone]=useState(''),[caller,setCaller]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();
  if(address.trim().length<5||reason.trim().length<5){setProblem('Indica la dirección y el motivo, de al menos 5 caracteres cada uno.');return;}
  if(caller.trim()&&caller.trim().length<2){setProblem('El nombre de quien llama debe tener al menos 2 caracteres.');return;}
  if(!/^[0-9+ -]{8,20}$/.test(phone.trim())){setProblem('Indica un teléfono de contacto de 8 a 20 dígitos.');return;}
  setProblem('');if(await action.run('/ambulancia/solicitudes',{address:address.trim(),reason:reason.trim(),contactPhone:phone.trim(),...(caller.trim()?{callerName:caller.trim()}:{}),...(municipality.trim()?{municipality:municipality.trim()}:{})}))onSaved();}
 return <Dialog title="Registrar llamada" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}<WriteError error={action.error}/>
  <Notice kind="info">Si hay riesgo de vida, indica a la persona que llame al 911.</Notice>
  <Field label="Nombre de quien llama" value={caller} onChange={setCaller} maxLength={120} autoFocus/><Field label="Dirección" value={address} onChange={setAddress} required maxLength={300}/><Field label="Municipio" value={municipality} onChange={setMunicipality} maxLength={80}/><Field label="Motivo" value={reason} onChange={setReason} required maxLength={500}/><Field label="Teléfono de contacto" value={phone} onChange={setPhone} required inputMode="tel" maxLength={20}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Registrar solicitud"/></div></form></Dialog>;
}
