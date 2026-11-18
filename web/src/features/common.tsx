import { useEffect,useId,useMemo,useRef,useState,type ReactNode } from 'react';
import { ApiError,type Api } from '../lib/api';
import { liveScope,scopedVersion,useLiveSignal } from './live-scope';
import { Icon,Notice } from '../components/ui';
import { SectionState,StatusBadge } from '../components/system';
import { newIntentKey,withIntentKey } from './intent';
export type Remote<T>={data:T|null;loading:boolean;error:ApiError|null;refresh:()=>void};
/**
 * Fase 2, S3 (stale-while-revalidate): la última respuesta de cada ruta queda en memoria, una caché por cliente de API.
 * El portal crea un cliente por sesión, así que al cerrar sesión la caché se va con él y otra cuenta nunca ve datos ajenos.
 * Solo vive en memoria: nada se guarda en el navegador.
 */
const caches=new WeakMap<object,Map<string,unknown>>();
const cacheOf=(api:Api)=>{let cache=caches.get(api);if(!cache){cache=new Map();caches.set(api,cache);}return cache;};
/** Bounded cache (least recently written out first): patient searches and records are not kept for the whole session. */
const CACHE_LIMIT=30;
const remember=(cache:Map<string,unknown>,path:string,value:unknown)=>{cache.delete(path);cache.set(path,value);while(cache.size>CACHE_LIMIT)cache.delete(cache.keys().next().value as string);};
/**
 * `version` sube al reconectar (todo se vuelve a pedir); `live` sube solo con eventos de las entidades que afectan a `path` (WEB-01).
 * Al montar, si la ruta ya se leyó en esta sesión, el dato guardado se muestra al instante (`loading` sigue en `true`
 * mientras se revalida en segundo plano). La lectura se repite siempre: la caché nunca reemplaza a la API.
 */
export function useData<T>(api:Api,path:string,version=0,enabled=true):Remote<T>{
 const cache=cacheOf(api);
 const [data,setData]=useState<T|null>(()=>enabled?(cache.get(path) as T|undefined)??null:null),[loading,setLoading]=useState(true),[error,setError]=useState<ApiError|null>(null),[tick,setTick]=useState(0);
 const scope=useMemo(()=>liveScope(path),[path]),live=scopedVersion(useLiveSignal(),scope);
 useEffect(()=>{
  if(!enabled){setLoading(false);setError(null);setData(null);return;}
  // Otra ruta en el mismo componente (filtro, página): si ya se leyó, se muestra su dato; si no, se muestra la carga.
  // Nunca se dejan a la vista filas de otros filtros bajo los filtros nuevos.
  setData(cache.has(path)?cache.get(path) as T:null);
  const controller=new AbortController();setLoading(true);setError(null);
  api.request<T>(path,{signal:controller.signal}).then(v=>{if(!controller.signal.aborted){remember(cache,path,v);setData(v);}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof ApiError?e:new ApiError('No se pudo cargar la información.'));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[api,cache,path,version,live,tick,enabled]);
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
/** Fase 2, S1: la cabecera de cada módulo es `CompactHeader` (components/system.tsx). */
export { CompactHeader,headerText } from '../components/system';
/** S3, R1: estado de carga, error y vacío de una sección; es `SectionState` del sistema (components/system.tsx). */
export function RemoteState<T>({state,children,skeletonRows=4,empty}:{state:Remote<T>;children:(data:T)=>ReactNode;skeletonRows?:number;empty?:(data:T)=>string|null}){
 return <SectionState state={state} rows={skeletonRows} empty={empty}>{children}</SectionState>;
}
/** R1 (S1): an empty list is one quiet line (what is missing, then what to do); no second heading, no decoration. */
export function Empty({title,description}:{title:string;description?:string}){return <p className="empty-state" role="status"><strong>{title}</strong>{description&&<span>{description}</span>}</p>;}
/** WEB-04: with `onReload`, a version conflict offers the common "Cerrar y recargar" action (design 04, state "Conflicto"). */
/** Error de una escritura. Se desplaza a la vista al aparecer: en un formulario largo quedaba arriba, fuera de pantalla, y parecía que el botón no hacía nada. */
export function WriteError({error,onReload,reloadLabel='Cerrar y recargar'}:{error:ApiError|null;onReload?:()=>void;reloadLabel?:string}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(error)ref.current?.scrollIntoView?.({block:'center',behavior:'smooth'});},[error]);
 if(!error)return null;
 return <div ref={ref} className="write-error"><WriteErrorBody error={error} onReload={onReload} reloadLabel={reloadLabel}/></div>;}
function WriteErrorBody({error,onReload,reloadLabel}:{error:ApiError;onReload?:()=>void;reloadLabel:string}){
 if(onReload&&isVersionConflict(error))return <div className="conflict-notice"><Notice kind="error">{error.message} Alguien cambió este registro mientras lo tenías abierto; tus cambios no se guardaron.</Notice><button type="button" className="secondary-button" onClick={onReload}><Icon name="retry" size={18}/>{reloadLabel}</button></div>;
 return <Notice kind="error">{isVersionConflict(error)?`${error.message} Conservamos lo que escribiste; cierra y vuelve a abrir el registro para cargar su estado actual.`:error.message}</Notice>;}
export function Dialog({title,onClose,busy=false,children}:{title:string;onClose:()=>void;busy?:boolean;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 useEffect(()=>{const node=ref.current;node?.showModal();return()=>{node?.close();};},[]);
 return <dialog ref={ref} className="work-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><header><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" aria-label="Cerrar formulario" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><div className="dialog-content">{children}</div></dialog>;
}
// R4: one date style for the whole app, short and without the year (lib/format); audit and legal screens pass `withYear: true`.
export { formatDate, formatDateTime } from '../lib/format';
/** `label` reemplaza la etiqueta común cuando el mismo código significa otra cosa en un módulo (por ejemplo `pendiente` en laboratorio). */
export function Tag({value,label}:{value:string;label?:string}){return <StatusBadge value={value} label={label}/>;}
export function Select({label,value,onChange,children,required=false,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;children:ReactNode;required?:boolean;disabled?:boolean}){const id=useId();return <div className="select-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled}>{children}</select></div>;}
/** FR-102-07: la API responde 409 con `codigo` `version_conflicto` y `versionActual`; se reconoce por esos datos, no por el texto. */
export const isVersionConflict=(e:ApiError|null)=>e?.status===409&&(e.code==='version_conflicto'||e.currentVersion!==undefined);
export function SaveButton({busy,label='Guardar cambios',disabled=false}:{busy:boolean;label?:string;disabled?:boolean}){return <button className="primary-button" disabled={busy||disabled} type="submit"><span>{busy?'Guardando…':label}</span>{busy?<span className="spinner"/>:<Icon name="arrow" size={18}/>}</button>;}
