import { useEffect,useRef,useState,type ReactNode } from 'react';
import { ApiError,type Api } from '../lib/api';
import { Icon,Notice } from '../components/ui';
export type Remote<T>={data:T|null;loading:boolean;error:ApiError|null;refresh:()=>void};
export function useData<T>(api:Api,path:string,version=0,enabled=true):Remote<T>{
 const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<ApiError|null>(null),[tick,setTick]=useState(0);
 useEffect(()=>{if(!enabled){setLoading(false);setError(null);setData(null);return;}const controller=new AbortController();setLoading(true);setError(null);api.request<T>(path,{signal:controller.signal}).then(v=>{if(!controller.signal.aborted)setData(v);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof ApiError?e:new ApiError('No se pudo cargar la información.'));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[api,path,version,tick,enabled]);
 return {data,loading,error,refresh:()=>setTick(v=>v+1)};
}
export function useAction(api:Api){
 const [busy,setBusy]=useState(false),[error,setError]=useState<ApiError|null>(null);
 async function run<T>(path:string,body:unknown,method='POST'):Promise<T|undefined>{setBusy(true);setError(null);try{return await api.write<T>(path,body,method);}catch(e){setError(e instanceof ApiError?e:new ApiError('No se pudo guardar.'));return undefined;}finally{setBusy(false);}}
 return {busy,error,run};
}
export function Heading({eyebrow,title,description,actions}:{eyebrow:string;title:string;description:string;actions?:ReactNode}){return <div className="module-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}<span>.</span></h1><p>{description}</p></div>{actions&&<div className="heading-actions">{actions}</div>}</div>;}
export function RemoteState<T>({state,children}:{state:Remote<T>;children:(data:T)=>ReactNode}){
 if(state.loading&&!state.data)return <div className="module-state" role="status"><span className="status-spinner"/>Cargando información…</div>;
 if(state.error)return <div className="module-state"><Notice kind="error">{state.error.status===403?'Tu cuenta no tiene permiso para consultar esta sección.':state.error.message}</Notice><button className="secondary-button" onClick={state.refresh}>Volver a intentar</button></div>;
 if(!state.data)return null;
 return <>{state.loading&&<p className="refresh-hint" role="status">Actualizando…</p>}{children(state.data)}</>;
}
export function Empty({title,description}:{title:string;description:string}){return <div className="empty-state"><Icon name="search" size={26}/><h2>{title}</h2><p>{description}</p></div>;}
export function WriteError({error}:{error:ApiError|null}){return error?<Notice kind="error">{isVersionConflict(error)?`${error.message} Conservamos lo que escribiste; cierra y vuelve a abrir el registro para cargar su estado actual.`:error.message}</Notice>:null;}
export function Dialog({title,onClose,busy=false,children}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>{node?.close();};},[]);
 return <dialog ref={ref} className="work-dialog" aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><header><h2>{title}</h2><button className="icon-button" type="button" aria-label="Cerrar formulario" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><div className="dialog-content">{children}</div></dialog>;
}
export const formatDate=(s:string|undefined|null)=>s?new Intl.DateTimeFormat('es-SV',{timeZone:'UTC'}).format(new Date(s.length===10?s+'T12:00:00Z':s)):'Sin registrar';
export const formatDateTime=(s:string)=>new Intl.DateTimeFormat('es-SV',{dateStyle:'medium',timeStyle:'short',timeZone:'America/El_Salvador'}).format(new Date(s));
const statusNames:Record<string,string>={activo:'Activo',inactivo:'Inactivo',provisional:'Provisional',libre:'Libre',ocupada:'Ocupada',reservada:'Reservada',limpieza:'En limpieza',bloqueada:'Bloqueada',borrador:'Borrador',publicado:'Publicado',en_curso:'En curso',completado:'Completado',cancelado:'Cancelado',desactivado:'Desactivado',exito:'Correcto',denegado:'Denegado',fallido:'Fallido'};
export function Tag({value}:{value:string}){return <span className={`status-tag status-${value}`}>{statusNames[value]??value}</span>;}
export function Select({label,value,onChange,children,required=false,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;children:ReactNode;required?:boolean;disabled?:boolean}){return <label className="select-field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled}>{children}</select></label>;}
/** FR-102-07: la API responde 409 con `codigo` `version_conflicto` y `versionActual`; se reconoce por esos datos, no por el texto. */
export const isVersionConflict=(e:ApiError|null)=>e?.status===409&&(e.code==='version_conflicto'||e.currentVersion!==undefined);
export function SaveButton({busy,label='Guardar cambios',disabled=false}:{busy:boolean;label?:string;disabled?:boolean}){return <button className="primary-button" disabled={busy||disabled} type="submit"><span>{busy?'Guardando…':label}</span>{busy?<span className="spinner"/>:<Icon name="arrow" size={18}/>}</button>;}
