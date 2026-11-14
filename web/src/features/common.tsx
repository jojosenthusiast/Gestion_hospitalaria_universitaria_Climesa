import { useEffect,useId,useMemo,useRef,useState,type ReactNode } from 'react';
import { ApiError,type Api } from '../lib/api';
import { liveScope,scopedVersion,useLiveSignal } from './live-scope';
import { Icon,Notice } from '../components/ui';
import { newIntentKey,withIntentKey } from './intent';
export type Remote<T>={data:T|null;loading:boolean;error:ApiError|null;refresh:()=>void};
/** `version` sube al reconectar (todo se vuelve a pedir); `live` sube solo con eventos de las entidades que afectan a `path` (WEB-01). */
export function useData<T>(api:Api,path:string,version=0,enabled=true):Remote<T>{
 const [data,setData]=useState<T|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<ApiError|null>(null),[tick,setTick]=useState(0);
 const scope=useMemo(()=>liveScope(path),[path]),live=scopedVersion(useLiveSignal(),scope);
 useEffect(()=>{if(!enabled){setLoading(false);setError(null);setData(null);return;}const controller=new AbortController();setLoading(true);setError(null);api.request<T>(path,{signal:controller.signal}).then(v=>{if(!controller.signal.aborted)setData(v);}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof ApiError?e:new ApiError('No se pudo cargar la información.'));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[api,path,version,live,tick,enabled]);
 return {data,loading,error,refresh:()=>setTick(v=>v+1)};
}
export function useAction(api:Api){
 const [busy,setBusy]=useState(false),[error,setError]=useState<ApiError|null>(null);
 // WEB-10: one Idempotency-Key per intent (this form or dialog sending this operation). A retry
 // after a failure reuses it, even if the person corrected the data: a failed write leaves nothing
 // stored in the API, and a write whose answer was lost must not run twice. After a success the
 // next send is a new intent; another form (another `useAction`) never shares the key.
 const intents=useRef(new Map<string,string>());
 async function run<T>(path:string,body:unknown,method='POST'):Promise<T|undefined>{
  const operation=`${method} ${path}`,key=intents.current.get(operation)??newIntentKey();intents.current.set(operation,key);
  setBusy(true);setError(null);
  try{const result=await withIntentKey(key,()=>api.write<T>(path,body,method));intents.current.delete(operation);return result;}
  catch(e){setError(e instanceof ApiError?e:new ApiError('No se pudo guardar.'));return undefined;}
  finally{setBusy(false);}
 }
 return {busy,error,run};
}
export function Heading({eyebrow,title,description,actions}:{eyebrow:string;title:string;description:string;actions?:ReactNode}){return <header className="module-heading reveal"><div><span className="eyebrow">{eyebrow}</span><h1>{title}<span>.</span></h1><p>{description}</p></div>{actions&&<div className="heading-actions">{actions}</div>}</header>;}
export function RemoteState<T>({state,children}:{state:Remote<T>;children:(data:T)=>ReactNode}){
 if(state.loading&&!state.data)return <div className="module-state module-state-loading" role="status" aria-live="polite"><span className="status-symbol"><span className="status-spinner"/></span><div><strong>Cargando información…</strong><span>Estamos preparando esta sección…</span></div></div>;
 // WEB-04 (diseño 04): "sin permiso" y "error de carga" son estados distintos; ambos permiten reintentar (un acceso puede concederse).
 if(state.error?.status===403)return <div className="module-state module-state-error"><strong>No tienes acceso a esta información</strong><Notice kind="error">Tu cuenta no tiene permiso para consultar esta sección.</Notice><p className="muted">Si la necesitas para atender a alguien, pide el acceso con un motivo y vuelve a intentar.</p><button className="secondary-button" onClick={state.refresh}><Icon name="retry" size={18}/>Volver a intentar</button></div>;
 if(state.error)return <div className="module-state module-state-error"><strong>No pudimos cargar esta información</strong><Notice kind="error">{state.error.message}</Notice><button className="secondary-button" onClick={state.refresh}><Icon name="retry" size={18}/>Volver a intentar</button></div>;
 if(!state.data)return null;
 return <>{state.loading&&<p className="refresh-hint" role="status" aria-live="polite"><span className="spinner"/>Actualizando información…</p>}{children(state.data)}</>;
}
export function Empty({title,description}:{title:string;description:string}){return <div className="empty-state" role="status"><span className="empty-state-icon"><Icon name="search" size={28}/></span><h2>{title}</h2><p>{description}</p></div>;}
/** WEB-04: with `onReload`, a version conflict offers the common "Cerrar y recargar" action (design 04, state "Conflicto"). */
export function WriteError({error,onReload,reloadLabel='Cerrar y recargar'}:{error:ApiError|null;onReload?:()=>void;reloadLabel?:string}){
 if(error&&onReload&&isVersionConflict(error))return <div className="conflict-notice"><Notice kind="error">{error.message} Alguien cambió este registro mientras lo tenías abierto; tus cambios no se guardaron.</Notice><button type="button" className="secondary-button" onClick={onReload}><Icon name="retry" size={18}/>{reloadLabel}</button></div>;
 return error?<Notice kind="error">{isVersionConflict(error)?`${error.message} Conservamos lo que escribiste; cierra y vuelve a abrir el registro para cargar su estado actual.`:error.message}</Notice>:null;}
export function Dialog({title,onClose,busy=false,children}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>{node?.close();};},[]);
 return <dialog ref={ref} className="work-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><header><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label="Cerrar formulario" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><div className="dialog-content">{children}</div></dialog>;
}
export const formatDate=(s:string|undefined|null)=>s?new Intl.DateTimeFormat('es-SV',{timeZone:'UTC'}).format(new Date(s.length===10?s+'T12:00:00Z':s)):'Sin registrar';
export const formatDateTime=(s:string)=>new Intl.DateTimeFormat('es-SV',{dateStyle:'medium',timeStyle:'short',timeZone:'America/El_Salvador'}).format(new Date(s));
const statusNames:Record<string,string>={activo:'Activo',inactivo:'Inactivo',provisional:'Provisional',libre:'Libre',ocupada:'Ocupada',reservada:'Reservada',limpieza:'En limpieza',bloqueada:'Bloqueada',borrador:'Borrador',publicado:'Pendiente de iniciar',pendiente:'Pendiente de iniciar',en_curso:'En curso',completado:'Completado',cancelado:'Cancelado',cancelada:'Cancelada',solicitada:'Solicitada',confirmada:'Confirmada',atendida:'Atendida',firmada:'Firmada',rechazada:'Rechazada',no_asistio:'No asistió',desactivado:'Desactivado',pendiente_cama:'Pendiente de cama',hospitalizado:'Hospitalizado',alta_firmada:'Alta firmada',egresado:'Egresado',exito:'Correcto',denegado:'Denegado',fallido:'Fallido',en_espera:'En espera',llamado:'Llamado',en_atencion:'En atención',no_se_presento:'No se presentó',en_proceso:'En proceso',abierta:'Abierta',bajo_minimo:'Bajo mínimo',vencido:'Vencido',normal:'Normal',alto:'Alto',bajo:'Bajo',critico_alto:'Crítico alto',critico_bajo:'Crítico bajo',sin_rango:'Sin rango',disponible:'Disponible',en_servicio:'En servicio',en_mantenimiento:'En mantenimiento'};
/** `label` reemplaza la etiqueta común cuando el mismo código significa otra cosa en un módulo (por ejemplo `pendiente` en laboratorio). */
export function Tag({value,label}:{value:string;label?:string}){return <span className={`status-tag status-${value}`}>{label??statusNames[value]??value.replace(/_/g,' ')}</span>;}
export function Select({label,value,onChange,children,required=false,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;children:ReactNode;required?:boolean;disabled?:boolean}){const id=useId();return <div className="select-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled}>{children}</select></div>;}
/** FR-102-07: la API responde 409 con `codigo` `version_conflicto` y `versionActual`; se reconoce por esos datos, no por el texto. */
export const isVersionConflict=(e:ApiError|null)=>e?.status===409&&(e.code==='version_conflicto'||e.currentVersion!==undefined);
export function SaveButton({busy,label='Guardar cambios',disabled=false}:{busy:boolean;label?:string;disabled?:boolean}){return <button className="primary-button" disabled={busy||disabled} type="submit"><span>{busy?'Guardando…':label}</span>{busy?<span className="spinner"/>:<Icon name="arrow" size={18}/>}</button>;}
