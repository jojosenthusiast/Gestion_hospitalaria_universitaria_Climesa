import { useRef,useState,type FormEvent } from 'react';
import { SearchPicker,type PickerItem } from '../../components/search-picker';
import { patientPicker } from '../appointments';
import { Field,Notice } from '../../components/ui';
import { Dialog,SaveButton,Select,WriteError,isVersionConflict,useAction } from '../common';
import { can,type AccessProfile,type Api,type Patient } from '../../lib/api';
import { crewProblem,defaultCrew,priorityNames,roleNames,typeNames,type AmbulanceRequest,type CrewCandidate } from './types';

/** Mensaje por `codigo` de la API: el despacho que pierde la carrera recibe `ambulancia_ya_despachada` (FR-109-05). */
export function dispatchProblem(code?:string){return code==='ambulancia_ya_despachada'?'La ambulancia ya fue despachada.':code==='sin_paramedico_de_turno'?'No hay un paramédico con turno en curso para el servicio.':code==='sin_motorista_de_turno'?'No hay un motorista con turno en curso para el servicio.':code==='sin_tripulacion_de_turno'?'No hay paramédico ni motorista con turno en curso para el servicio.':code==='unidad_en_mantenimiento'?'La ambulancia está en mantenimiento.':code==='solicitud_resuelta'?'Otra persona ya resolvió esta solicitud.':code==='tripulante_sin_turno'?'Alguien de la tripulación elegida ya no tiene turno en curso. Cierra y vuelve a abrir para elegir de nuevo.':null;}
/** MA-AMB-02: el despachador elige la tripulación entre el personal de turno; viene propuesta y solo ella atiende al paciente. */
export function DispatchForm({api,unitVersion,request,crewPool,onClose,onSaved}:{api:Api;unitVersion:number;request:AmbulanceRequest|null;crewPool:CrewCandidate[];onClose:()=>void;onSaved:()=>void}){
 const [crew,setCrew]=useState<string[]>(()=>defaultCrew(crewPool));
 const [type,setType]=useState(request?'emergencia_domicilio':'traslado_interhospitalario'),[priority,setPriority]=useState('naranja'),[origin,setOrigin]=useState(''),[destination,setDestination]=useState('Hospital CLIMESA, emergencia'),[municipality,setMunicipality]=useState(request?.municipality??''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(!request&&origin.trim().length<5){setProblem('Indica el origen, de al menos 5 caracteres.');return;}if(destination.trim().length<3){setProblem('Indica el destino.');return;}
  const missing=crewProblem(crewPool,crew);if(missing){setProblem(missing);return;}setProblem('');
  const body={version:unitVersion,type,priority,destination:destination.trim(),...(request?{requestId:request.id}:{origin:origin.trim()}),...(municipality.trim()?{municipality:municipality.trim()}:{}),crew:crewPool.filter(p=>crew.includes(p.staffId)).map(p=>p.staffId)};
  if(await action.run('/ambulancia/servicios',body))onSaved();}
 const known=dispatchProblem(action.error?.code);
 return <Dialog title="Confirmar y despachar" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}
  {known?<><Notice kind="error">{known}</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:isVersionConflict(action.error)?<><Notice kind="error">La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; no se despachó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:<WriteError error={action.error}/>}
  {request?<p>Confirmaste por teléfono la solicitud de <strong>{request.address}</strong>{request.requesterName?<> (pidió {request.requesterName})</>:null}. La unidad pasa a En Servicio.</p>:<Field label="Origen" value={origin} onChange={setOrigin} required minLength={5} maxLength={300}/>}
  <Select label="Tipo de servicio" value={type} onChange={setType} required>{Object.entries(typeNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Select label="Prioridad" value={priority} onChange={setPriority} required>{Object.entries(priorityNames).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
  <Field label="Destino" value={destination} onChange={setDestination} required maxLength={300}/>
  <Field label="Municipio" value={municipality} onChange={setMunicipality} maxLength={80}/>
  <fieldset className="choice-list"><legend>Tripulación</legend>{crewPool.length?crewPool.map(p=><label className="check-field" key={p.staffId}><input type="checkbox" checked={crew.includes(p.staffId)} onChange={e=>setCrew(list=>e.target.checked?[...list,p.staffId]:list.filter(id=>id!==p.staffId))} disabled={action.busy}/> <span><strong>{p.name}</strong> <small>{roleNames[p.role]??p.role}{p.role==='paramedico'&&!p.hasAccount?' · Sin cuenta en la app':''}</small></span></label>):<p className="muted">No hay paramédicos ni motoristas con turno en curso.</p>}</fieldset>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Despachar"/></div></form></Dialog>;
}
export function DiscardForm({api,request,onClose,onSaved}:{api:Api;request:AmbulanceRequest;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<5){setProblem('Indica el motivo, de al menos 5 caracteres.');return;}setProblem('');if(await action.run(`/ambulancia/solicitudes/${request.id}/descartar`,{version:request.version,reason:reason.trim()}))onSaved();}
 const known=dispatchProblem(action.error?.code);
 return <Dialog title="Descartar solicitud" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}{known?<Notice kind="error">{known}</Notice>:<WriteError error={action.error}/>}<p>{request.address}</p><Field label="Motivo" value={reason} onChange={setReason} required minLength={5} maxLength={500} autoFocus/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Descartar"/></div></form></Dialog>;
}
type CallField='caller'|'phone'|'address';
const callFieldNames:Record<CallField,string>={caller:'nombre de quien llama',phone:'teléfono',address:'dirección'};
const joinNames=(names:string[])=>names.length>1?`${names.slice(0,-1).join(', ')} y ${names[names.length-1]}`:names[0]??'';
/**
 * FR-109-03: recepción registra una solicitud recibida por teléfono; queda por confirmar.
 * S13: if the call is about a registered patient, choosing them copies the caller, phone and address from the record into
 * empty fields the person has not edited, and the notice names only what was copied. The patient is not sent to the API.
 */
export function PhoneRequestForm({api,profile,onClose,onSaved}:{api:Api;profile:AccessProfile;onClose:()=>void;onSaved:()=>void}){
 const [address,setAddress]=useState(''),[municipality,setMunicipality]=useState(''),[reason,setReason]=useState(''),[phone,setPhone]=useState(''),[caller,setCaller]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 const [patient,setPatient]=useState<PickerItem|null>(null),[filled,setFilled]=useState<CallField[]>([]),[loading,setLoading]=useState(false),[lookupFailed,setLookupFailed]=useState(false);
 const edited=useRef(new Set<CallField>()),values={caller,phone,address};
 const setters:Record<CallField,(v:string)=>void>={caller:setCaller,phone:setPhone,address:setAddress};
 const edit=(k:CallField)=>(v:string)=>{edited.current.add(k);setFilled(f=>f.filter(x=>x!==k));setters[k](v);};
 const canPick=can(profile,'pacientes.buscar')&&can(profile,'pacientes.ver_ficha'),busy=action.busy||loading;
 async function pick(item:PickerItem|null){
  setPatient(item);setLookupFailed(false);if(!item)return;
  setLoading(true);
  try{
   const record=await api.request<Patient>(`/pacientes/${item.id}`);
   const known:Record<CallField,string>={caller:record.fullName??'',phone:record.phone??'',address:record.address??''};
   const fill=(Object.keys(known) as CallField[]).filter(k=>known[k]&&!values[k]&&!edited.current.has(k));
   fill.forEach(k=>setters[k](known[k]));setFilled(fill);
  }catch{setFilled([]);setLookupFailed(true);}
  finally{setLoading(false);}
 }
 async function save(e:FormEvent){e.preventDefault();if(busy)return;
  if(address.trim().length<5||reason.trim().length<5){setProblem('Indica la dirección y el motivo, de al menos 5 caracteres cada uno.');return;}
  if(caller.trim()&&caller.trim().length<2){setProblem('El nombre de quien llama debe tener al menos 2 caracteres.');return;}
  if(!/^[0-9+ -]{8,20}$/.test(phone.trim())){setProblem('Indica un teléfono de contacto de 8 a 20 dígitos.');return;}
  setProblem('');if(await action.run('/ambulancia/solicitudes',{address:address.trim(),reason:reason.trim(),contactPhone:phone.trim(),...(caller.trim()?{callerName:caller.trim()}:{}),...(municipality.trim()?{municipality:municipality.trim()}:{})}))onSaved();}
 return <Dialog title="Registrar llamada" onClose={onClose} busy={busy}><form className="module-form" onSubmit={save} noValidate aria-busy={busy}>{problem&&<Notice kind="error">{problem}</Notice>}<WriteError error={action.error}/>
  <Notice kind="info">Si hay riesgo de vida, indica a la persona que llame al 911.</Notice>
  {canPick&&<SearchPicker label="Paciente · opcional" value={patient} onChange={item=>void pick(item)} search={patientPicker(api)} hint="Si la llamada es por un paciente con expediente, elígelo para copiar sus datos de contacto." emptyText="No hay pacientes con ese nombre, DUI o expediente."/>}
  {lookupFailed&&<Notice kind="error">No pudimos leer el expediente. Escribe los datos de contacto a mano.</Notice>}
  {filled.length>0&&<p className="muted" role="status">Copiamos del expediente: {joinNames(filled.map(k=>callFieldNames[k]))}.</p>}
  <Field label="Nombre de quien llama" value={caller} onChange={edit('caller')} maxLength={120} autoFocus={!canPick}/><Field label="Dirección" value={address} onChange={edit('address')} required maxLength={300}/><Field label="Municipio" value={municipality} onChange={setMunicipality} maxLength={80}/><Field label="Motivo" value={reason} onChange={setReason} required maxLength={500}/><Field label="Teléfono de contacto" value={phone} onChange={edit('phone')} required inputMode="tel" maxLength={20}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancelar</button><SaveButton busy={busy} label="Registrar solicitud"/></div></form></Dialog>;
}
