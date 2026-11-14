import { useState,type FormEvent } from 'react';
import { Field,Notice } from '../../components/ui';
import { Dialog,SaveButton,WriteError,formatDateTime,isVersionConflict,useAction } from '../common';
import { type AccessProfile,type Api } from '../../lib/api';
import { CrewAction,crewCodes,crewProblem,missingCrew } from './crew';
import { stateNames,type AmbulanceStatus } from './types';

/**
 * FR-109-06: entrar o salir de mantenimiento (POST /ambulancia/mantenimiento). Solo sin servicio activo y, para salir,
 * con paramédico y motorista de turno (RN-30). Muestra desde cuándo y por qué está así, y qué hacer cuando algo lo impide.
 */
export function MaintenancePanel({status,api,profile,onSaved}:{status:AmbulanceStatus;api:Api;profile:AccessProfile;onSaved:()=>void}){
 const [open,setOpen]=useState(false),leaving=status.unit.state==='en_mantenimiento',missing=missingCrew(status),blocked=leaving&&!!missing;
 return <section aria-label="Mantenimiento de la unidad" className="amb-maintenance"><h2>Mantenimiento</h2>
  <p className="amb-maint-state">La unidad está <strong>{(stateNames[status.unit.state]??status.unit.state).toLowerCase()}</strong>{status.unit.stateSince?<> desde {formatDateTime(status.unit.stateSince)}</>:null}.{status.unit.stateReason&&<> Motivo registrado: «{status.unit.stateReason}».</>}</p>
  {blocked&&<><Notice kind="info">Para sacar la unidad de mantenimiento debe haber un paramédico y un motorista con turno en curso; ahora no hay {missing}. {status.dispatchBlock?.action??'Publica el turno que falta para que cubra la hora actual.'}</Notice><p className="amb-crew-next"><CrewAction profile={profile} missing={missing!}/></p></>}
  <button type="button" className={leaving?'primary-button':'secondary-button'} disabled={blocked} onClick={()=>setOpen(true)}>{leaving?'Sacar de mantenimiento':'Poner en mantenimiento'}</button>
  {open&&<MaintenanceForm api={api} unit={status.unit} leaving={leaving} onClose={()=>setOpen(false)} onSaved={()=>{setOpen(false);onSaved();}}/>}</section>;
}
function MaintenanceForm({api,unit,leaving,onClose,onSaved}:{api:Api;unit:AmbulanceStatus['unit'];leaving:boolean;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<10){setProblem('Indica el motivo, de al menos 10 caracteres.');return;}setProblem('');if(await action.run('/ambulancia/mantenimiento',{version:unit.version,inMaintenance:!leaving,reason:reason.trim()}))onSaved();}
 const title=leaving?'Sacar de mantenimiento':'Poner en mantenimiento',noCrew=(crewCodes as readonly string[]).includes(action.error?.code??'');
 return <Dialog title={title} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{problem&&<Notice kind="error">{problem}</Notice>}{isVersionConflict(action.error)?<><Notice kind="error">La unidad cambió. Cierra y vuelve a abrir para ver su estado actual; el cambio no se guardó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:noCrew?<Notice kind="error">{crewProblem(action.error?.code)} La unidad no puede quedar disponible sin paramédico y motorista de turno. Publica el turno que falta y vuelve a intentar.</Notice>:<WriteError error={action.error}/>}<p>{leaving?'La unidad queda Disponible.':'La unidad no podrá despacharse mientras esté en mantenimiento.'}</p><Field label="Motivo" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={title}/></div></form></Dialog>;
}
