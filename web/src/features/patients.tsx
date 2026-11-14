import { useEffect,useState,type FormEvent } from 'react';
import { Field,Icon,Notice } from '../components/ui';
import { ExportMenu } from '../components/export-menu';
import { ActiveFilters,ChipGroup,LiveSearch,ListToolbar } from './listas/chips';
import { ageFrom,profileGaps,validatePatientDraft } from './listas/patient-rules';
import type { ClinicalHistory } from './clinical-history';
import { dayKey,dayLabel,timeRange } from './listas/schedule';
import './listas/lists.css';
import { useQuickAction } from './personal/accion';
import { can,type AccessProfile,type Api,type ApiError,type Appointment,type Patient,type PatientInput,type SearchReceipt } from '../lib/api';
import { Dialog,Empty,Heading,RemoteState,SaveButton,Select,Tag,WriteError,formatDate,formatDateTime,isVersionConflict,useAction,useData } from './common';
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
 const [query,setQuery]=useState(''),[typed,setTyped]=useState('');
 // Búsqueda mientras se escribe: la lista se pide con una pequeña espera; el botón «Buscar» sigue registrando la constancia que exige el alta.
 useEffect(()=>{const t=setTimeout(()=>setTyped(query.trim().length>=2?query.trim():''),300);return()=>clearTimeout(t);},[query]);
 const initial=useData<Patient[]>(api,`/pacientes?limit=50${typed?`&query=${encodeURIComponent(typed)}`:''}`,version),search=useAction(api);
 const [receipt,setReceipt]=useState<SearchReceipt|null>(null),[filter,setFilter]=useState('activo');
 const [selected,setSelected]=useState<string|null>(null),[editing,setEditing]=useState<Patient|null>(null),[creating,setCreating]=useState(false),[status,setStatus]=useState<Patient|null>(null);
 const candidates=receipt?.candidates??initial.data??[],rows=candidates.filter(p=>filter==='todos'||(filter==='activo'?p.active:!p.active));
 const register=can(profile,'pacientes.registrar'),viewFicha=can(profile,'pacientes.ver_ficha');
 const expired=useExpired(receipt?.expiresAt),validReceipt=!!receipt&&!expired&&Date.parse(receipt.expiresAt)>Date.now();
 const [quick,consumeQuick]=useQuickAction();
 useEffect(()=>{if(quick==='registrar'&&register)setCreating(true);if(quick)consumeQuick();},[quick,register,consumeQuick]);
 const done=()=>{setCreating(false);setEditing(null);setStatus(null);setReceipt(null);initial.refresh();};
 async function find(e:FormEvent){e.preventDefault();const result=await search.run<SearchReceipt>('/pacientes/busquedas',{query:query.trim()});if(result)setReceipt(result);}
 const active=candidates.filter(p=>p.active).length,inactive=candidates.length-active;
 const filters=[...(filter!=='activo'?[{key:'estado',label:filter==='todos'?'Todos los estados':'Inactivos',remove:()=>setFilter('activo')}]:[]),...(query.trim()?[{key:'texto',label:`«${query.trim()}»`,remove:()=>{setQuery('');setReceipt(null);}}]:[])];
 const exportTable=()=>({filename:'pacientes',title:'Pacientes',subtitle:`${rows.length} expedientes`,columns:['Expediente','Paciente','Sexo','Nacimiento','Estado'],rows:rows.map(p=>[p.record,p.fullName,sexNames[p.sex]??p.sex,p.birth?formatDate(p.birth):'',p.active?'Activo':'Inactivo'])});
 return <><Heading eyebrow="Pacientes / Registro compartido" title="Pacientes" description="Busca primero y registra solo si la persona no existe: así evitamos expedientes duplicados. Cada expediente conserva su identidad y sus cambios." actions={register&&<button className="primary-button" onClick={()=>setCreating(true)}><Icon name="plus" size={18}/>Registrar paciente</button>}/>
 <section className="data-workbench" aria-label="Registro de pacientes"><ListToolbar trailing={<ExportMenu table={exportTable} disabled={!rows.length}/>}><form className="search-form" onSubmit={find}><Field label="Nombre, DUI o expediente" placeholder="Escribe al menos dos caracteres" value={query} onChange={v=>{setQuery(v);setReceipt(null);}} minLength={2} maxLength={100} required/><button className="primary-button" disabled={search.busy} type="submit"><Icon name="search" size={18}/>{search.busy?'Buscando…':'Buscar'}</button></form></ListToolbar>
 <div className="cl-filter-row"><span className="cl-filter-label">Estado</span><ChipGroup label="Estado del expediente" value={filter} onChange={setFilter} options={[{value:'activo',label:'Activos',count:active},{value:'inactivo',label:'Inactivos',count:inactive},{value:'todos',label:'Todos',count:candidates.length}]}/></div>
 <ActiveFilters filters={filters} onClear={()=>{setFilter('activo');setQuery('');setReceipt(null);}}/>
 <WriteError error={search.error}/><p className="table-caption">{receipt?`${rows.length} coincidencias · ${query}`:typed?`${rows.length} resultados mientras escribes · ${typed}`:'Expedientes recientes'}<span>{!register?'Consulta de solo lectura.':validReceipt?'Puedes registrar después de revisar las coincidencias.':receipt?expiredText:'Para registrar a alguien nuevo, primero busca si ya existe.'}</span></p>
 {register&&validReceipt&&receipt.candidates.length>0&&<Notice kind="info">Posibles coincidencias: revisa cada ficha y su motivo antes de registrar a alguien nuevo.</Notice>}
 <RemoteState state={initial}>{()=>rows.length?<div className="cl-master-detail"><ul className="cl-master" aria-label="Pacientes encontrados">{rows.map(p=><li key={p.id}><button type="button" className="pt-row" aria-current={p.id===selected} aria-label={viewFicha?`Abrir ficha de ${p.fullName}`:`Paciente ${p.fullName}`} disabled={!viewFicha} onClick={()=>setSelected(p.id)}><span className="pt-name"><strong>{p.fullName}</strong><small>{p.matchReason}</small></span><span className="mono-data">{p.record}</span><span className="pt-meta">{p.birth?`${formatDate(p.birth)}${ageFrom(p.birth)!==null?` · ${ageFrom(p.birth)} años`:''}`:'Sin fecha'} · {sexNames[p.sex]}</span><Tag value={p.state}/></button></li>)}</ul>
  {selected?<PatientPanel key={selected} api={api} id={selected} profile={profile} version={version} onClose={()=>setSelected(null)} onEdit={p=>setEditing(p)} onState={p=>setStatus(p)}/>:<aside className="cl-detail"><p className="muted">{viewFicha?'Elige un paciente de la lista para ver su ficha completa: datos, citas, historial clínico y cambios.':'Tu rol consulta la lista pero no abre fichas.'}</p></aside>}</div>:<Empty title="No hay coincidencias" description="Revisa el filtro y también los registros inactivos antes de crear un expediente."/>}</RemoteState>
 <p className="table-footnote">Se muestran hasta 50 resultados. Afina la búsqueda si no encuentras el expediente.</p></section>
 {(creating||editing)&&<PatientForm api={api} patient={editing} receipt={receipt} query={query} onClose={()=>{setCreating(false);setEditing(null);}} onSaved={done}/>}
 {status&&<PatientStateForm api={api} patient={status} onClose={()=>setStatus(null)} onSaved={done}/>}</>;
}
type Tab='datos'|'citas'|'consultas'|'laboratorio'|'ingresos'|'cambios';
const tabNames:Record<Tab,string>={datos:'Datos',citas:'Citas',consultas:'Consultas',laboratorio:'Laboratorio',ingresos:'Ingresos',cambios:'Cambios'};
/** Ficha del paciente en el panel de detalle: pestañas, estado de carga propio por pestaña y los datos que faltan. */
function PatientPanel({api,id,profile,version,onClose,onEdit,onState}:{api:Api;id:string;profile:AccessProfile;version:number;onClose:()=>void;onEdit:(p:Patient)=>void;onState:(p:Patient)=>void}){
 const data=useData<Patient>(api,`/pacientes/${id}`,version),[tab,setTab]=useState<Tab>('datos');
 const seesAppointments=can(profile,'citas.ver'),seesClinical=can(profile,'expediente.ver');
 const tabs:Tab[]=['datos',...(seesAppointments?['citas' as Tab]:[]),...(seesClinical?['consultas','laboratorio','ingresos'] as Tab[]:[]),'cambios'];
 return <aside className="cl-detail" aria-label="Ficha de paciente"><button type="button" className="cl-link-button" onClick={onClose}>Cerrar ficha</button><RemoteState state={data}>{p=>{const gaps=profileGaps(p),age='birth'in p?ageFrom(p.birth):null;return <>
  <div className="patient-banner"><span className="mono-label">EXPEDIENTE {p.record}</span><h3>{p.fullName}</h3><Tag value={p.state}/>{age!==null&&<small>{age} años · {sexNames[p.sex]}</small>}</div>
  {gaps.length>0?<Notice kind="info">Faltan datos: {gaps.join(', ')}. Se pueden completar con «Editar datos».</Notice>:<p className="muted">Ficha completa para los datos que tu rol puede ver.</p>}
  {can(profile,'pacientes.editar_demograficos')&&<div className="dialog-actions"><button className="primary-button" onClick={()=>onEdit(p)}>Editar datos <Icon name="arrow" size={18}/></button><button className="secondary-button" onClick={()=>onState(p)}>{p.active?'Inactivar paciente':'Reactivar paciente'}</button></div>}
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
function PatientForm({api,patient,receipt:initialReceipt,query:initialQuery,onClose,onSaved}:{api:Api;patient:Patient|null;receipt:SearchReceipt|null;query:string;onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<PatientInput>({givenNames:patient?.givenNames??'',surnames:patient?.surnames??'',sex:(patient?.sex??'no_registrado') as PatientInput['sex'],dui:patient?.dui??'',birth:patient?.birth?.slice(0,10)??'',phone:patient?.phone??'',email:patient?.email??'',address:patient?.address??'',...(patient||!initialReceipt?{}:prefillFromQuery(initialQuery))});
 const [reason,setReason]=useState(''),[reasonError,setReasonError]=useState(false);const action=useAction(api),lookup=useAction(api);
 const [tried,setTried]=useState(false),[touched,setTouched]=useState<Record<string,boolean>>({}),errors=validatePatientDraft(form);
 const touch=(k:string)=>setTouched(t=>({...t,[k]:true})),shown=(k:keyof typeof errors)=>tried||touched[k]?errors[k]:undefined;
 // Registrar dentro del propio formulario: si no hay una búsqueda vigente se pide primero; la constancia se conserva mientras se editan los datos.
 const [receipt,setReceipt]=useState<SearchReceipt|null>(initialReceipt),[query,setQuery]=useState(initialQuery);
 const expired=useExpired(patient?undefined:receipt?.expiresAt),candidates=patient?[]:receipt?.candidates??[],ready=!patient&&!!receipt&&!expired;
 const put=<K extends keyof PatientInput>(k:K,v:PatientInput[K])=>setForm(f=>({...f,[k]:v}));
 async function lookupNow(e:FormEvent){e.preventDefault();e.stopPropagation();const result=await lookup.run<SearchReceipt>('/pacientes/busquedas',{query:query.trim()});if(result){setReceipt(result);setForm(f=>({...f,...Object.fromEntries(Object.entries(prefillFromQuery(query)).filter(([k])=>!f[k as keyof PatientInput]))}));}}
 async function submit(confirmNew:boolean){setReasonError(false);setTried(true);
  if(Object.keys(errors).length)return;
  if(patient&&reason.trim().length<10){setReasonError(true);return;}
  if(!patient&&(expired||!receipt||Date.parse(receipt.expiresAt)<=Date.now()))return;
  const result=patient?await action.run(`/pacientes/${patient.id}`,{...form,version:patient.version,reason},'PATCH'):await action.run('/pacientes',{...form,searchToken:receipt?.token,searchQuery:query.trim(),...(confirmNew?{confirmarNuevo:true}:{})});if(result)onSaved();}
 const save=(e:FormEvent)=>{e.preventDefault();void submit(false);};
 const similar=action.error?.code==='posible_duplicado'?(action.error.details?.candidatos as {id:string;record:string;fullName:string;birth?:string}[]|undefined)??[]:[];
 const existing=action.error?.code==='dui_duplicado'?(action.error.details?.paciente as {record:string;fullName:string}|undefined):undefined;
 return <Dialog title={patient?'Corregir datos personales':'Registrar paciente'} busy={action.busy} onClose={onClose}>{!patient&&!ready&&<form onSubmit={lookupNow} className="module-form"><p className="form-intro">Antes de crear un expediente nuevo, busca si la persona ya existe. La búsqueda vale 10 minutos y, si no la encuentras, podrás registrarla con los datos que escribas aquí.</p><WriteError error={lookup.error}/>{receipt&&expired&&<Notice kind="error">{expiredText}</Notice>}<Field label="Nombre, DUI o expediente" placeholder="Escribe al menos dos caracteres" value={query} onChange={setQuery} minLength={2} maxLength={100} required autoFocus/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={lookup.busy}><Icon name="search" size={18}/>{lookup.busy?'Buscando…':'Buscar'}</button></div></form>}
 {(patient||ready)&&<form onSubmit={save} className="module-form"><p className="form-intro">{patient?'Completa los datos conocidos. El documento y la fecha pueden quedar vacíos; el expediente se asigna automáticamente.':'Revisa las coincidencias; si la persona no está, completa los datos (ya copiamos lo que buscaste). El documento y la fecha pueden quedar vacíos; el expediente se asigna automáticamente.'}</p><SaveFailure error={action.error} onReload={onSaved}/>{existing&&<Notice kind="info">Ese DUI ya tiene expediente: {existing.fullName} · {existing.record}. Búscalo en la lista en vez de crear otro.</Notice>}{similar.length>0&&<section aria-label="Pacientes con el mismo nombre y nacimiento"><span className="eyebrow">Ya existe alguien igual</span><ul className="muted">{similar.map(c=><li key={c.id}><strong>{c.fullName}</strong> · {c.record}{c.birth?` · nace ${formatDate(c.birth)}`:''}</li>)}</ul><button type="button" className="secondary-button" disabled={action.busy} onClick={()=>void submit(true)}>Es otra persona: registrar de todos modos</button></section>}{candidates.length>0&&<section aria-label="Posibles duplicados"><span className="eyebrow">Revisa estos expedientes antes de crear uno nuevo</span><ul className="muted">{candidates.map(c=><li key={c.id}><strong>{c.fullName}</strong> · {c.record} · {c.matchReason}</li>)}</ul></section>}<span className="eyebrow">01 / Identificación</span><div className="form-grid"><Field label="Nombres" value={form.givenNames} onChange={v=>put('givenNames',v)} required minLength={2} maxLength={80} autoFocus onBlur={()=>touch('givenNames')} error={shown('givenNames')}/><Field label="Apellidos" value={form.surnames} onChange={v=>put('surnames',v)} required minLength={2} maxLength={100} onBlur={()=>touch('surnames')} error={shown('surnames')}/><Field label="DUI · opcional" placeholder="00000000-0" value={form.dui??''} onChange={v=>put('dui',v)} maxLength={10} onBlur={()=>touch('dui')} error={shown('dui')}/><Field label="Nacimiento · opcional" type="date" value={form.birth??''} onChange={v=>put('birth',v)} max={new Date().toISOString().slice(0,10)} onBlur={()=>touch('birth')} error={shown('birth')}/><Select label="Sexo registrado" value={form.sex} onChange={v=>put('sex',v as PatientInput['sex'])}>{Object.entries(sexNames).map(([k,v])=><option value={k} key={k}>{v}</option>)}</Select><Field label="Teléfono · opcional" type="tel" value={form.phone??''} onChange={v=>put('phone',v)} maxLength={9} onBlur={()=>touch('phone')} error={shown('phone')}/></div><span className="eyebrow">02 / Contacto</span><div className="form-grid"><Field label="Correo · opcional" type="email" value={form.email??''} onChange={v=>put('email',v)} maxLength={254} onBlur={()=>touch('email')} error={shown('email')}/><Field label="Dirección · opcional" value={form.address??''} onChange={v=>put('address',v)} maxLength={500}/></div>{patient&&<Field label="Motivo de la corrección" value={reason} onChange={setReason} minLength={10} maxLength={500} required hint="El historial conservará los valores anteriores y este motivo." error={reasonError?'El motivo debe tener al menos 10 caracteres.':undefined}/>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={patient?'Guardar corrección':'Registrar paciente'}/></div></form>}</Dialog>;
}
function PatientStateForm({api,patient,onClose,onSaved}:{api:Api;patient:Patient;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[reasonError,setReasonError]=useState(false),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();setReasonError(false);if(reason.trim().length<10){setReasonError(true);return;}if(await action.run(`/pacientes/${patient.id}/estado`,{active:!patient.active,version:patient.version,reason}))onSaved();}
 return <Dialog title={patient.active?'Inactivar paciente':'Reactivar paciente'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><p>Se conserva la ficha de <strong>{patient.fullName}</strong> y todo su historial.</p><SaveFailure error={action.error} onReload={onSaved}/><Field label="Motivo" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus error={reasonError?'El motivo debe tener al menos 10 caracteres.':undefined}/><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Confirmar cambio"/></div></form></Dialog>;
}
