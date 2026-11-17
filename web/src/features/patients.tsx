import { useEffect,useRef,useState,type FormEvent } from 'react';
import { Field,Icon,Notice } from '../components/ui';
import { ExportMenu } from '../components/export-menu';
import { takePatientSearch } from './patient-handoff';
import { RegisterExternalResultDialog } from './lab-external-record';
import { ActiveFilters,ChipGroup } from './listas/chips';
import { FilterPopover } from '../components/filter-popover';
import { plural } from '../lib/format';
import { ageFrom,profileGaps,validatePatientDraft } from './listas/patient-rules';
import type { ClinicalHistory } from './clinical-history';
import { dayKey,dayLabel,timeRange } from './listas/schedule';
import './listas/lists.css';
import { matchesPatientState,sanitizePatientFilters,canFilterAdmissions,patientEmptyState,patientFilterDefaults,patientListPath,patientStateOptions,situationChip,situationOptions,stateChip,type PatientFilters } from './listas/patient-filters';
import type { ShiftCatalog } from './shifts/rules';
import { useHashFilters } from '../lib/hash-params';
import { useQuickAction } from './personal/accion';
import { can,type AccessProfile,type Api,type ApiError,type Appointment,type Patient,type PatientInput,type SearchReceipt } from '../lib/api';
import { Dialog,Empty,CompactHeader,RemoteState,SaveButton,Select,Tag,WriteError,formatDate,formatDateTime,isVersionConflict,useAction,useData } from './common';
const sexNames:Record<string,string>={femenino:'Femenino',masculino:'Masculino',indeterminado:'Indeterminado',no_registrado:'No registrado'};
const fieldNames:Record<string,string>={nombres:'Nombres',primer_apellido:'Apellidos',segundo_apellido:'Segundo apellido',sexo:'Sexo',nacimiento:'Nacimiento',precision_nacimiento:'Precisión del nacimiento',telefono:'Teléfono',correo:'Correo',direccion:'Dirección',dui:'DUI',estado:'Estado'};
const expiredText='La búsqueda venció; vuelve a buscar.';
/** FR-102-02: el recibo de búsqueda dura 10 minutos; avisa cuando vence aunque la pantalla siga abierta. */
function useExpired(expiresAt?:string){
 const [gone,setGone]=useState(false);
 useEffect(()=>{setGone(false);if(!expiresAt)return;const ms=Date.parse(expiresAt)-Date.now();if(ms<=0){setGone(true);return;}const t=setTimeout(()=>setGone(true),Math.min(ms,2**31-1));return()=>clearTimeout(t);},[expiresAt]);
 return gone;
}
/** FR-102-03 y FR-102-07: el 409 de versión pide recargar; el de duplicado muestra el detalle de la API (nombra el expediente). */
function SaveFailure({error,onReload}:{error:ApiError|null;onReload:()=>void}){
 if(isVersionConflict(error))return <><Notice kind="error">La ficha cambió. Vuelve a abrirla para ver los datos actuales; tus cambios no se guardaron.</Notice><button type="button" className="secondary-button" onClick={onReload}>Cerrar y recargar</button></>;
 if(error?.status===409)return <Notice kind="error">{error.message}</Notice>;
 return <WriteError error={error}/>;
}
/** Rellena nombre o DUI a partir de lo que se buscó, para no volver a escribirlo. */
export function prefillFromQuery(query:string):Partial<PatientInput>{
 const t=query.trim();
 if(/^\d{8}-?\d$/.test(t))return {dui:t.length===9?`${t.slice(0,8)}-${t[8]}`:t};
 if(/\d/.test(t))return {};
 const w=t.split(/\s+/).filter(Boolean);
 if(!w.length)return {};
 if(w.length===1)return {givenNames:w[0]};
 const n=w.length>=4?2:1;
 return {givenNames:w.slice(0,n).join(' '),surnames:w.slice(n).join(' ')};
}
export function PatientsPage({api,profile,version}:{api:Api;profile:AccessProfile;version:number}){
 // Filtros en la dirección (#/pacientes?situacion=hospitalizado&area=…): se comparten, sobreviven a recargar y el servidor los aplica.
 // El texto buscado (nombre, DUI) no va a la dirección: quedaría en el historial del navegador de un equipo compartido.
 const [rawFilters,setFilters]=useHashFilters<keyof PatientFilters>(patientFilterDefaults);
 // Un enlace compartido o editado puede traer filtros que esta cuenta no puede usar: se limpian antes de pedir la lista y en la dirección.
 const filters=sanitizePatientFilters(rawFilters,profile);
 const dirty=(Object.keys(filters) as (keyof PatientFilters)[]).filter(k=>filters[k]!==rawFilters[k]).join(',');
 useEffect(()=>{if(dirty)setFilters(filters);},[dirty]);
 const [query,setQuery]=useState(''),[typed,setTyped]=useState('');
 // Búsqueda mientras se escribe: la lista se pide con una pequeña espera; el botón «Buscar» sigue registrando la constancia que exige el alta.
 useEffect(()=>{const t=setTimeout(()=>setTyped(query.trim().length>=2?query.trim():''),300);return()=>clearTimeout(t);},[query]);
 const initial=useData<Patient[]>(api,patientListPath(filters,typed),version),search=useAction(api);
 const situations=situationOptions(profile),byAdmission=canFilterAdmissions(profile)&&can(profile,'turnos.ver');
 const catalog=useData<ShiftCatalog>(api,'/turnos/catalogo',version,byAdmission);
 const areas=(catalog.data?.areas??[]).filter(a=>a.type==='area'||a.type==='planta'),doctors=(catalog.data?.staff??[]).filter(s=>s.type==='medico');
 const areaName=areas.find(a=>a.id===filters.area)?.name,doctorName=doctors.find(d=>d.id===filters.medico)?.name;
 const [receipt,setReceipt]=useState<SearchReceipt|null>(null);
 const [selected,setSelected]=useState<string|null>(null),[editing,setEditing]=useState<Patient|null>(null),[creating,setCreating]=useState(false),[status,setStatus]=useState<Patient|null>(null);
 // Con la constancia de «Buscar» se muestran sus candidatos (lo que el alta revisa); el estado se aplica igual que en el servidor.
 // Un filtro de atención de hoy solo lo resuelve el servidor, así que entonces manda la lista filtrada.
 const byCare=!!filters.situacion||!!filters.area||!!filters.medico;
 const rows=receipt&&!byCare?receipt.candidates.filter(p=>matchesPatientState(p.state,filters.estado)):initial.data??[];
 const register=can(profile,'pacientes.registrar'),viewFicha=can(profile,'pacientes.ver_ficha');
 const expired=useExpired(receipt?.expiresAt),validReceipt=!!receipt&&!expired&&Date.parse(receipt.expiresAt)>Date.now();
 const [quick,consumeQuick]=useQuickAction();
 // B1: from the front desk the register arrives with what was searched (in memory) and, once saved, offers the number.
 const [deskQuery,setDeskQuery]=useState<string|null>(null),[registered,setRegistered]=useState<{id:string;record?:string}|null>(null);
 useEffect(()=>{if(quick==='registrar'&&register){setDeskQuery(takePatientSearch());setRegistered(null);setCreating(true);}if(quick)consumeQuick();},[quick,register,consumeQuick]);
 const done=()=>{setCreating(false);setEditing(null);setStatus(null);setReceipt(null);setDeskQuery(null);initial.refresh();};
 const saved=(created?:{id:string;record?:string})=>{if(created&&creating&&!editing&&deskQuery!==null&&can(profile,'fila.emitir'))setRegistered(created);done();};
 async function find(e:FormEvent){e.preventDefault();const text=query.trim();setTyped(text);const result=await search.run<SearchReceipt>('/pacientes/busquedas',{query:text});if(result)setReceipt(result);}
 const clearQuery=()=>{setQuery('');setTyped('');setReceipt(null);};
 const filtered=filters.estado!=='vigente'||!!filters.situacion||!!filters.area||!!filters.medico;
 const active=[
  ...(filters.estado!=='vigente'?[{key:'estado',label:stateChip(filters.estado),remove:()=>setFilters({estado:'vigente'})}]:[]),
  ...(filters.situacion?[{key:'situacion',label:situationChip(filters.situacion),remove:()=>setFilters({situacion:''})}]:[]),
  ...(filters.area?[{key:'area',label:`Área: ${areaName??'elegida'}`,remove:()=>setFilters({area:''})}]:[]),
  ...(filters.medico?[{key:'medico',label:`Médico: ${doctorName??'elegido'}`,remove:()=>setFilters({medico:''})}]:[]),
  ...(query.trim()?[{key:'texto',label:`«${query.trim()}»`,remove:clearQuery}]:[]),
 ];
 const filterCount=[filters.estado!=='vigente',!!filters.situacion,!!filters.area,!!filters.medico].filter(Boolean).length;
 // R4a: the server sorts the list by name; the reason only shows when a search matched a document or a record.
 const reasonOf=(p:Patient)=>(typed||receipt)&&/documento|expediente/i.test(p.matchReason??'')?p.matchReason:null;
 const yearsText=(n:number)=>plural(n,'año','años');
 const empty=patientEmptyState(filters,{area:areaName,medico:doctorName});
 const exportTable=()=>({filename:'pacientes',title:'Pacientes',subtitle:`${rows.length} expedientes${active.length?` · ${active.map(f=>f.label).join(' · ')}`:''}`,columns:['Expediente','Paciente','Sexo','Nacimiento','Estado'],rows:rows.map(p=>[p.record,p.fullName,sexNames[p.sex]??p.sex,p.birth?formatDate(p.birth):p.ageRange?`${p.ageRange} años`:'',p.active?'Activo':'Inactivo'])});
 return <><CompactHeader breadcrumb="Pacientes / Registro compartido" title="Pacientes" actions={register?<button className="primary-button" onClick={()=>setCreating(true)}><Icon name="plus" size={18}/>Registrar paciente</button>:<span className="qb-readonly"><Icon name="eye" size={16}/>Solo lectura</span>}/>
 {/* R4a: the search first; every filter in one «Filtros» popover that counts what is on. */}
 <section className="data-workbench" aria-label="Registro de pacientes"><div className="cl-toolbar pt-toolbar"><form className="search-form" onSubmit={find}><Field label="Nombre, DUI o expediente" placeholder="Escribe al menos dos caracteres" value={query} onChange={v=>{setQuery(v);setReceipt(null);}} minLength={2} maxLength={100} required/><button className="secondary-button" disabled={search.busy} type="submit"><Icon name="search" size={18}/>{search.busy?'Buscando…':'Buscar'}</button></form>
 <FilterPopover count={filterCount}>
  <div className="filter-field"><span>Expediente</span><ChipGroup label="Estado del expediente" value={filters.estado} onChange={estado=>setFilters({estado})} options={patientStateOptions.map(o=>({...o}))}/></div>
  {situations.length>0&&<div className="filter-field"><span>Hoy</span><ChipGroup label="Situación de hoy" value={filters.situacion} onChange={situacion=>setFilters({situacion})} options={[{value:'',label:'Cualquiera'},...situations.map(s=>({value:s.value,label:s.label}))]}/></div>}
  {byAdmission&&<><Select label="Área de la cama" value={filters.area} onChange={area=>setFilters({area})} disabled={!catalog.data}><option value="">Todas las áreas</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</Select><Select label="Médico tratante" value={filters.medico} onChange={medico=>setFilters({medico})} disabled={!catalog.data}><option value="">Todos los médicos</option>{doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</Select>{catalog.error&&<span className="muted">No pudimos cargar áreas y médicos.</span>}</>}
 </FilterPopover><span className="pt-toolbar-end"><ExportMenu table={exportTable} disabled={!rows.length}/></span></div>
 <ActiveFilters filters={active} onClear={()=>{clearQuery();setFilters({estado:'vigente',situacion:'',area:'',medico:''});}}/>
 <WriteError error={search.error}/><p className="table-caption">{receipt?`${rows.length} coincidencias · ${query}`:typed?`${rows.length} resultados mientras escribes · ${typed}`:filtered?`${plural(rows.length,'expediente','expedientes')} con estos filtros · por nombre`:'Pacientes por nombre (A–Z)'}{register&&receipt&&<span>{validReceipt?'Puedes registrar después de revisar las coincidencias.':expiredText}</span>}</p>
 {register&&validReceipt&&receipt.candidates.length>0&&<Notice kind="info">Posibles coincidencias: revisa cada ficha y su motivo antes de registrar a alguien nuevo.</Notice>}
 <RemoteState state={initial}>{()=>rows.length?<div className={`cl-master-detail${selected?'':' is-collapsed'}`}><ul className="cl-master" aria-label="Pacientes encontrados">{rows.map(p=><li key={p.id}><button type="button" className="pt-row" aria-current={p.id===selected} aria-label={viewFicha?`Abrir ficha de ${p.fullName}`:`Paciente ${p.fullName}`} disabled={!viewFicha} onClick={()=>setSelected(p.id)}><span className="pt-name"><strong>{p.fullName}</strong>{reasonOf(p)&&<small>{reasonOf(p)}</small>}</span><span className="mono-data">{p.record}</span><span className="pt-meta">{p.birth?`${formatDate(p.birth)}${ageFrom(p.birth)!==null?` · ${yearsText(ageFrom(p.birth)!)}`:''}`:p.ageRange?`${p.ageRange} años`:'Sin fecha'} · {sexNames[p.sex]}</span>{p.state!=='activo'&&<Tag value={p.state}/>}</button></li>)}</ul>
  {selected?<PatientPanel key={selected} api={api} id={selected} profile={profile} version={version} onClose={()=>setSelected(null)} onEdit={p=>setEditing(p)} onState={p=>setStatus(p)}/>:null}</div>:<Empty title={empty.title} description={empty.description}/>}</RemoteState>
 {rows.length>=50&&<p className="table-footnote">Se muestran los primeros 50. Afina la búsqueda o los filtros.</p>}</section>
 {registered&&<Notice kind="success">Paciente registrado{registered.record?` con expediente ${registered.record}`:''}. <a className="cl-link-button" href={`#/fila?accion=emitir&paciente=${registered.id}`}>Emitir número</a></Notice>}
 {(creating||editing)&&<PatientForm api={api} patient={editing} receipt={editing?receipt:deskQuery!==null?null:receipt} query={!editing&&deskQuery!==null?deskQuery:query} prefill={!editing&&deskQuery!==null} onClose={()=>{setCreating(false);setEditing(null);setDeskQuery(null);}} onSaved={saved}/>}
 {status&&<PatientStateForm api={api} patient={status} onClose={()=>setStatus(null)} onSaved={done}/>}</>;
}
/**
 * R7 U1 (G2, hub): the record is where the front desk starts. Each action opens its module with this patient already
 * chosen (`&paciente=<id>`); the module decides with the server (allowedActions, the patient's appointment of today).
 */
function PatientHubActions({profile,patient}:{profile:AccessProfile;patient:Patient}){
 if(!patient.active)return null;
 const links=[
  can(profile,'fila.emitir')&&{href:`#/fila?accion=emitir&paciente=${patient.id}`,label:'Emitir número o registrar llegada',icon:'megaphone' as const},
  can(profile,'citas.agendar')&&{href:`#/citas?accion=agendar&paciente=${patient.id}`,label:'Agendar cita',icon:'calendar' as const},
  can(profile,'admision.crear')&&{href:`#/hospitalizacion?accion=admision&paciente=${patient.id}`,label:'Ingresar',icon:'bed' as const},
 ].filter(Boolean) as {href:string;label:string;icon:'megaphone'|'calendar'|'bed'}[];
 if(!links.length)return null;
 return <nav className="pt-hub" aria-label={`Acciones con ${patient.fullName}`}>{links.map((l,i)=><a key={l.href} className={i===0?'primary-button':'secondary-button'} href={l.href}><Icon name={l.icon} size={18}/>{l.label}</a>)}</nav>;
}
type Tab='datos'|'citas'|'consultas'|'laboratorio'|'ingresos'|'cambios';
const tabNames:Record<Tab,string>={datos:'Datos',citas:'Citas',consultas:'Consultas',laboratorio:'Laboratorio',ingresos:'Ingresos',cambios:'Cambios'};
/** Ficha del paciente en el panel de detalle: pestañas, estado de carga propio por pestaña y los datos que faltan. */
function PatientPanel({api,id,profile,version,onClose,onEdit,onState}:{api:Api;id:string;profile:AccessProfile;version:number;onClose:()=>void;onEdit:(p:Patient)=>void;onState:(p:Patient)=>void}){
 const data=useData<Patient>(api,`/pacientes/${id}`,version),[tab,setTab]=useState<Tab>('datos');
 const seesAppointments=can(profile,'citas.ver'),seesClinical=can(profile,'expediente.ver');
 // R7 C-5: a doctor records an exam done elsewhere without a prior order; the API checks the care relationship.
 const [external,setExternal]=useState(false),[externalDone,setExternalDone]=useState(''),recordsExternal=seesClinical&&can(profile,'laboratorio.ordenar');
 const tabs:Tab[]=['datos',...(seesAppointments?['citas' as Tab]:[]),...(seesClinical?['consultas','laboratorio','ingresos'] as Tab[]:[]),'cambios'];
 return <aside className="cl-detail" aria-label="Ficha de paciente"><button type="button" className="cl-link-button" onClick={onClose}>Cerrar ficha</button><RemoteState state={data}>{p=>{const gaps=profileGaps(p),age='birth'in p?ageFrom(p.birth):null;return <>
  <div className="patient-banner"><span className="mono-label">EXPEDIENTE {p.record}</span><h3>{p.fullName}</h3><p className="patient-banner-meta"><Tag value={p.state}/>{age!==null&&<span>{plural(age,'año','años')} · {sexNames[p.sex]}</span>}</p></div>
  {gaps.length>0&&<Notice kind="info">Faltan datos: {gaps.join(', ')}.</Notice>}
  <PatientHubActions profile={profile} patient={p}/>
  {recordsExternal&&<div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>{setExternalDone('');setExternal(true);}}>Registrar resultado externo</button></div>}
  {externalDone&&<Notice kind="success">{externalDone}</Notice>}
  {external&&<RegisterExternalResultDialog api={api} patient={p} onClose={()=>setExternal(false)} onSaved={message=>{setExternal(false);setExternalDone(message);setTab('laboratorio');}}/>}
  {can(profile,'pacientes.editar_demograficos')&&<div className="dialog-actions"><button type="button" className="secondary-button" onClick={()=>onEdit(p)}>Editar datos</button>{/* R4a: inactivating is rare and serious: a quiet danger link, apart from the normal action; it confirms in a dialog. */}<button type="button" className={p.active?'danger-link':'cl-link-button'} onClick={()=>onState(p)}>{p.active?'Inactivar paciente':'Reactivar paciente'}</button></div>}
  <div className="cl-tabs" role="tablist" aria-label="Secciones de la ficha">{tabs.map(t=><button key={t} type="button" role="tab" id={`pt-tab-${t}`} aria-selected={tab===t} aria-controls="pt-panel" className="cl-tab" onClick={()=>setTab(t)}>{tabNames[t]}</button>)}</div>
  <div role="tabpanel" id="pt-panel" aria-labelledby={`pt-tab-${tab}`}>
   {tab==='datos'&&<><dl className="detail-grid"><div><dt>Sexo</dt><dd>{sexNames[p.sex]}</dd></div>{'birth'in p&&<div><dt>Nacimiento</dt><dd>{formatDate(p.birth)}</dd></div>}{'dui'in p&&<div><dt>DUI</dt><dd>{p.dui||'Sin documento registrado'}</dd></div>}{'phone'in p&&<div><dt>Teléfono</dt><dd>{p.phone||'Sin registrar'}</dd></div>}{'email'in p&&<div><dt>Correo</dt><dd>{p.email||'Sin registrar'}</dd></div>}{'address'in p&&<div><dt>Dirección</dt><dd>{p.address||'Sin registrar'}</dd></div>}</dl></>}
   {tab==='citas'&&<PatientAppointmentsTab api={api} id={id} version={version}/>}
   {(tab==='consultas'||tab==='laboratorio'||tab==='ingresos')&&<PatientClinicalTab api={api} id={id} version={version} tab={tab}/>}
   {tab==='cambios'&&(p.history?<section className="change-history"><h3>Historial de cambios</h3>{p.history.length?p.history.map(h=><details key={h.version}><summary>{formatDateTime(h.at)} · {h.reason}</summary><dl>{Object.entries(h.changes).map(([key,change])=><div key={key}><dt>{fieldNames[key]??key}</dt><dd>{String(change.before??'Sin registrar')} → {String(change.after??'Sin registrar')}</dd></div>)}</dl></details>):<p className="muted">Todavía no hay modificaciones.</p>}</section>:<p className="muted">Tu rol no ve el historial de cambios de esta ficha.</p>)}
  </div></>;}}</RemoteState></aside>;
}
function PatientAppointmentsTab({api,id,version}:{api:Api;id:string;version:number}){
 const data=useData<Appointment[]>(api,`/citas?patientId=${encodeURIComponent(id)}`,version);
 return <RemoteState state={data}>{rows=>rows.length?<ul className="cl-list">{[...rows].sort((a,b)=>Date.parse(b.start)-Date.parse(a.start)).map(a=><li key={a.id}><span><strong>{dayLabel(dayKey(a.start))}</strong><small>{timeRange(a.start,a.end)} · {a.doctorName}{a.reason?` · ${a.reason}`:''}</small></span><Tag value={a.state}/></li>)}</ul>:<Empty title="Sin citas" description="Este paciente todavía no tiene citas registradas."/>}</RemoteState>;
}
function PatientClinicalTab({api,id,version,tab}:{api:Api;id:string;version:number;tab:'consultas'|'laboratorio'|'ingresos'}){
 const data=useData<ClinicalHistory>(api,`/pacientes/${id}/historial`,version);
 return <RemoteState state={data}>{h=>{
  if(tab==='consultas')return h.consultations.length?<ul className="cl-list">{h.consultations.map(k=><li key={k.id}><span><strong>{k.reason||'Consulta sin motivo registrado'}</strong><small>{formatDateTime(k.signedAt??k.startedAt)} · {k.doctor.name}{k.diagnoses[0]?` · ${k.diagnoses[0].description}`:''}</small></span><Tag value={k.state}/></li>)}</ul>:<Empty title="Sin consultas" description="No hay consultas registradas para este paciente."/>;
  if(tab==='laboratorio')return h.laboratory.length?<ul className="cl-list">{h.laboratory.map(o=><li key={o.id}><span><strong>{o.items.map(i=>i.name).join(', ')||'Orden de laboratorio'}</strong><small>{formatDateTime(o.createdAt)}{o.reviewedAt?' · revisada':''}</small></span><Tag value={o.state}/></li>)}</ul>:<Empty title="Sin estudios" description="No hay órdenes de laboratorio para este paciente."/>;
  return h.admissions.length?<ul className="cl-list">{h.admissions.map(a=><li key={a.id}><span><strong>Ingreso por {a.origin.replace(/_/g,' ')}</strong><small>{formatDateTime(a.createdAt)} · {a.doctor.name}</small></span><Tag value={a.state}/></li>)}</ul>:<Empty title="Sin ingresos" description="Este paciente no ha sido hospitalizado."/>;
 }}</RemoteState>;
}
const prefillNames:Partial<Record<keyof PatientInput,string>>={givenNames:'nombres',surnames:'apellidos',dui:'DUI'};
/** Names the prefilled fields in plain Spanish: "nombres y apellidos". */
export const prefillNotice=(keys:(keyof PatientInput)[])=>{const names=keys.map(k=>prefillNames[k]??k);return names.length?`Copiamos de tu búsqueda: ${names.length>1?`${names.slice(0,-1).join(', ')} y ${names[names.length-1]}`:names[0]}.`:'';};
/** The search text register uses when the person skipped «Buscar»: the typed search, the DUI, or first name and first surname; at most 100 characters (the API limit). */
export const autoQuery=(form:Pick<PatientInput,'givenNames'|'surnames'|'dui'>,query:string)=>{
 const first=(v:string)=>v.trim().split(/\s+/)[0]??'';
 return (query.trim()||form.dui?.trim()||`${first(form.givenNames)} ${first(form.surnames)}`.trim()).slice(0,100);
};
/**
 * W1 (S13): one form, search first. The search row sits on top of the data; its result prefills only empty fields the person
 * has not touched and names them. «Registrar paciente» runs the search itself when there is no valid one, stops if it finds
 * candidates (so they are reviewed), and registers on the next press. One busy flag covers the whole search-then-register run.
 */
function PatientForm({api,patient,receipt:initialReceipt,query:initialQuery,prefill=false,onClose,onSaved}:{api:Api;patient:Patient|null;receipt:SearchReceipt|null;query:string;prefill?:boolean;onClose:()=>void;onSaved:(created?:{id:string;record?:string})=>void}){
 const initialPrefill=patient||!(initialReceipt||prefill)?{}:prefillFromQuery(initialQuery);
 const [form,setForm]=useState<PatientInput>({givenNames:patient?.givenNames??'',surnames:patient?.surnames??'',sex:(patient?.sex??'no_registrado') as PatientInput['sex'],dui:patient?.dui??'',birth:patient?.birth?.slice(0,10)??'',phone:patient?.phone??'',email:patient?.email??'',address:patient?.address??'',...initialPrefill});
 const [reason,setReason]=useState(''),[reasonError,setReasonError]=useState(false);const action=useAction(api),lookup=useAction(api);
 const [tried,setTried]=useState(false),[touched,setTouched]=useState<Record<string,boolean>>({}),errors=validatePatientDraft(form);
 const touch=(k:string)=>setTouched(t=>({...t,[k]:true})),shown=(k:keyof typeof errors)=>tried||touched[k]?errors[k]:undefined;
 const [receipt,setReceipt]=useState<SearchReceipt|null>(initialReceipt),[query,setQuery]=useState(initialQuery);
 const [filled,setFilled]=useState<(keyof PatientInput)[]>(Object.keys(initialPrefill) as (keyof PatientInput)[]);
 const edited=useRef(new Set<keyof PatientInput>()),running=useRef(false),[pending,setPending]=useState(false);
 const busy=pending||action.busy||lookup.busy;
 const expired=useExpired(patient?undefined:receipt?.expiresAt),candidates=patient?[]:receipt?.candidates??[];
 const put=<K extends keyof PatientInput>(k:K,v:PatientInput[K])=>{edited.current.add(k);setFilled(f=>f.filter(x=>x!==k));setForm(f=>({...f,[k]:v}));};
 const valid=(r:SearchReceipt|null):r is SearchReceipt=>!!r&&Date.parse(r.expiresAt)>Date.now();
 async function searchNow(text:string){
  const result=await lookup.run<SearchReceipt>('/pacientes/busquedas',{query:text});
  if(!result)return undefined;
  setReceipt(result);
  const fill=Object.entries(prefillFromQuery(text)).filter(([k])=>!edited.current.has(k as keyof PatientInput)&&!form[k as keyof PatientInput]) as [keyof PatientInput,string][];
  setFilled(fill.map(([k])=>k));
  // The merged values go back to the caller: a register in the same run must not send the stale `form` of this render.
  const merged={...form,...Object.fromEntries(fill)} as PatientInput;
  // Functional update: a field typed while the search was in flight keeps what the person wrote.
  if(fill.length)setForm(f=>({...f,...Object.fromEntries(fill.filter(([k])=>!edited.current.has(k)&&!f[k]))}));
  return {receipt:result,form:merged};
 }
 async function lookupNow(){
  const text=query.trim();if(text.length<2||running.current)return;
  running.current=true;setPending(true);
  try{await searchNow(text);}finally{running.current=false;setPending(false);}
 }
 async function submit(confirmNew:boolean){
  setReasonError(false);setTried(true);
  if(Object.keys(errors).length)return;
  if(patient&&reason.trim().length<10){setReasonError(true);return;}
  if(running.current)return;
  running.current=true;setPending(true);
  try{
   let current=receipt,text=query.trim(),values=form;
   if(!patient&&!valid(current)){
    text=autoQuery(form,query);setQuery(text);
    const found=await searchNow(text);
    if(!found)return;
    current=found.receipt;values=found.form;
    // A fresh search with candidates stops here so they are reviewed; the next press registers with this receipt.
    if(current.candidates.length)return;
   }
   const result=patient?await action.run(`/pacientes/${patient.id}`,{...values,version:patient.version,reason},'PATCH'):await action.run('/pacientes',{...values,searchToken:current?.token,searchQuery:text,...(confirmNew?{confirmarNuevo:true}:{})});
   if(result)onSaved(patient?undefined:result as {id:string;record?:string});
  }finally{running.current=false;setPending(false);}
 }
 const save=(e:FormEvent)=>{e.preventDefault();void submit(false);};
 const similar=action.error?.code==='posible_duplicado'?(action.error.details?.candidatos as {id:string;record:string;fullName:string;birth?:string}[]|undefined)??[]:[];
 const existing=action.error?.code==='dui_duplicado'?(action.error.details?.paciente as {record:string;fullName:string}|undefined):undefined;
 const intro=patient?'Completa los datos conocidos. El documento y la fecha pueden quedar vacíos; el expediente se asigna automáticamente.':receipt&&!expired?'Revisa las coincidencias; si la persona no está, completa los datos. El documento y la fecha pueden quedar vacíos; el expediente se asigna automáticamente.':'Busca primero si la persona ya existe: lo que escribas se copia al formulario. Si no buscas, lo hacemos al registrar.';
 return <Dialog title={patient?'Corregir datos personales':'Registrar paciente'} busy={busy} onClose={onClose}><form onSubmit={save} className="module-form" aria-busy={busy}><p className="form-intro">{intro}</p>
  {!patient&&<div className="search-form pt-register-search"><Field label="Nombre, DUI o expediente" placeholder="Escribe al menos dos caracteres" value={query} onChange={v=>{setQuery(v);setReceipt(null);}} maxLength={100} autoFocus onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void lookupNow();}}}/><button type="button" className="secondary-button" disabled={busy||query.trim().length<2} onClick={()=>void lookupNow()}><Icon name="search" size={18}/>{lookup.busy?'Buscando…':'Buscar'}</button></div>}
  <WriteError error={lookup.error}/>{receipt&&expired&&<Notice kind="error">{expiredText}</Notice>}
  {filled.length>0&&<p className="muted" role="status">{prefillNotice(filled)}</p>}
  <SaveFailure error={action.error} onReload={onSaved}/>{existing&&<Notice kind="info">Ese DUI ya tiene expediente: {existing.fullName} · {existing.record}. Búscalo en la lista en vez de crear otro.</Notice>}{similar.length>0&&<section aria-label="Pacientes con el mismo nombre y nacimiento"><span className="eyebrow">Ya existe alguien igual</span><ul className="muted">{similar.map(c=><li key={c.id}><strong>{c.fullName}</strong> · {c.record}{c.birth?` · nace ${formatDate(c.birth)}`:''}</li>)}</ul><button type="button" className="secondary-button" disabled={busy} onClick={()=>void submit(true)}>Es otra persona: registrar de todos modos</button></section>}{candidates.length>0&&!expired&&<section aria-label="Posibles duplicados"><span className="eyebrow">Revisa estos expedientes antes de crear uno nuevo</span><ul className="muted">{candidates.map(c=><li key={c.id}><strong>{c.fullName}</strong> · {c.record} · {c.matchReason}</li>)}</ul></section>}
  <span className="eyebrow">01 / Identificación</span><div className="form-grid"><Field label="Nombres" value={form.givenNames} onChange={v=>put('givenNames',v)} required minLength={2} maxLength={80} autoFocus={!!patient} onBlur={()=>touch('givenNames')} error={shown('givenNames')}/><Field label="Apellidos" value={form.surnames} onChange={v=>put('surnames',v)} required minLength={2} maxLength={100} onBlur={()=>touch('surnames')} error={shown('surnames')}/><Field label="DUI · opcional" placeholder="00000000-0" value={form.dui??''} onChange={v=>put('dui',v)} maxLength={10} onBlur={()=>touch('dui')} error={shown('dui')}/><Field label="Nacimiento · opcional" type="date" value={form.birth??''} onChange={v=>put('birth',v)} max={new Date().toISOString().slice(0,10)} onBlur={()=>touch('birth')} error={shown('birth')}/><Select label="Sexo registrado" value={form.sex} onChange={v=>put('sex',v as PatientInput['sex'])}>{Object.entries(sexNames).map(([k,v])=><option value={k} key={k}>{v}</option>)}</Select><Field label="Teléfono · opcional" type="tel" value={form.phone??''} onChange={v=>put('phone',v)} maxLength={9} onBlur={()=>touch('phone')} error={shown('phone')}/></div><span className="eyebrow">02 / Contacto</span><div className="form-grid"><Field label="Correo · opcional" type="email" value={form.email??''} onChange={v=>put('email',v)} maxLength={254} onBlur={()=>touch('email')} error={shown('email')}/><Field label="Dirección · opcional" value={form.address??''} onChange={v=>put('address',v)} maxLength={500}/></div>{patient&&<Field label="Motivo de la corrección" value={reason} onChange={setReason} minLength={10} maxLength={500} required hint="El historial conservará los valores anteriores y este motivo." error={reasonError?'El motivo debe tener al menos 10 caracteres.':undefined}/>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cancelar</button><SaveButton busy={busy} label={patient?'Guardar corrección':'Registrar paciente'}/></div></form></Dialog>;
}
function PatientStateForm({api,patient,onClose,onSaved}:{api:Api;patient:Patient;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[reasonError,setReasonError]=useState(false),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();setReasonError(false);if(reason.trim().length<10){setReasonError(true);return;}if(await action.run(`/pacientes/${patient.id}/estado`,{active:!patient.active,version:patient.version,reason}))onSaved();}
 return <Dialog title={patient.active?'Inactivar paciente':'Reactivar paciente'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p>Se conserva la ficha de <strong>{patient.fullName}</strong> y todo su historial.</p><SaveFailure error={action.error} onReload={onSaved}/><Field label="Motivo" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus error={reasonError?'El motivo debe tener al menos 10 caracteres.':undefined}/><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Confirmar cambio"/></div></form></Dialog>;
}
