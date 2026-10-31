import { useState,type FormEvent } from 'react';
import { Field,Notice } from '../components/ui';
import { Dialog,Heading,RemoteState,SaveButton,WriteError,formatDateTime,isVersionConflict,useAction,useData } from './common';
import { can,type AccessProfile,type Api } from '../lib/api';
/** Respuesta de `GET /ambulancia`: la única unidad, su servicio activo (sin datos del paciente) y si hay paramédico de turno. */
export type AmbulanceStatus={
 unit:{id:string;plate:string;state:string;version:number};
 activeService:null|{id:string;type:string;priority:string;origin:string;destination:string;dispatchedAt:string;crew:{staffId:string;role:string;name:string}[]};
 paramedicOnDuty:boolean;
};
const stateNames:Record<string,string>={disponible:'Disponible',en_servicio:'En servicio',en_mantenimiento:'En mantenimiento'};
const priorityNames:Record<string,string>={roja:'Roja',naranja:'Naranja',amarilla:'Amarilla',verde:'Verde'};
const typeNames:Record<string,string>={emergencia_domicilio:'Emergencia a domicilio',traslado_interhospitalario:'Traslado interhospitalario'};
const roleNames:Record<string,string>={paramedico:'Paramédico',motorista:'Motorista',medico:'Médico',enfermero:'Enfermería'};
/** W18 en su versión mínima (FR-109-01): estado de la unidad y servicio activo; se vuelve a pedir cuando llega un evento en vivo (`version`). */
export function AmbulancePage({api,profile,version}:{api:Api;profile:AccessProfile;version:number}){
 const data=useData<AmbulanceStatus>(api,'/ambulancia',version),[maintenance,setMaintenance]=useState(false),manage=can(profile,'ambulancia.mantenimiento');
 return <><Heading eyebrow="Operaciones / Ambulancia" title="Ambulancia" description="Estado de la unidad y del servicio en curso, actualizado en vivo."/><RemoteState state={data}>{s=><section className="data-workbench" aria-label="Estado de la unidad">
  <div className="number-strip"><div><strong className="mono-data">{s.unit.plate}</strong><span>Unidad única</span></div><div><strong><span className={`status-tag status-${s.unit.state}`}>{stateNames[s.unit.state]??s.unit.state}</span></strong><span>Estado actual</span></div><div><strong>{s.paramedicOnDuty?'Paramédico de turno':'Sin paramédico con turno en curso'}</strong><span>Cobertura de la tripulación</span></div></div>
  {s.activeService?<section aria-label="Servicio activo"><h2>Servicio activo</h2><dl className="detail-grid"><div><dt>Tipo</dt><dd>{typeNames[s.activeService.type]??s.activeService.type}</dd></div><div><dt>Prioridad</dt><dd>{priorityNames[s.activeService.priority]??s.activeService.priority}</dd></div><div><dt>Origen</dt><dd>{s.activeService.origin}</dd></div><div><dt>Destino</dt><dd>{s.activeService.destination}</dd></div><div><dt>Despachado</dt><dd>{formatDateTime(s.activeService.dispatchedAt)}</dd></div><div><dt>Tripulación</dt><dd>{s.activeService.crew.length?s.activeService.crew.map(c=>`${c.name} (${roleNames[c.role]??c.role})`).join(' · '):'Sin tripulación registrada'}</dd></div></dl></section>:<p className="muted">Sin servicio activo</p>}
  {manage&&s.unit.state!=='en_servicio'&&<MaintenanceControl status={s} open={maintenance} onOpen={()=>setMaintenance(true)} api={api} onClose={()=>setMaintenance(false)} onSaved={()=>{setMaintenance(false);data.refresh();}}/>}
 </section>}</RemoteState></>;
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
