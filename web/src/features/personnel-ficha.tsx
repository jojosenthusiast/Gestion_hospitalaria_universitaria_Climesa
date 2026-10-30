import { useState,type FormEvent } from 'react';
import { Field,Icon,Notice } from '../components/ui';
import { can,type AccessProfile,type Api,type Registration,type RegistrationInput,type Shift,type Staff } from '../lib/api';
import { Dialog,Empty,RemoteState,SaveButton,Select,Tag,WriteError,formatDate,formatDateTime,isVersionConflict,useAction,useData } from './common';

/** Aviso de vencimiento: no hay regla escrita en la spec 103; se usa una ventana fija de 30 días, pendiente de confirmar con el negocio. */
export const DIAS_AVISO_VENCIMIENTO=30;
const DAY=86400000;
const boards:Record<string,string>={JVPM:'JVPM · Medicina',JVPE:'JVPE · Enfermería',JVPL:'JVPL · Laboratorio',JVPO:'JVPO · Odontología',otra:'Otra junta'};
const shiftTypes:Record<string,string>={diurno:'Diurno',nocturno:'Nocturno',guardia:'Guardia'};
export type RegistrationState='vigente'|'por_vencer'|'vencida'|'proxima';
const registrationLabels:Record<RegistrationState,string>={vigente:'Vigente',por_vencer:'Por vencer',vencida:'Vencida',proxima:'Aún no vigente'};
const registrationTone:Record<RegistrationState,string>={vigente:'activo',por_vencer:'borrador',vencida:'cancelado',proxima:'provisional'};
/** Fecha civil de El Salvador (yyyy-MM-dd) del instante dado. */
export const businessToday=(at=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/El_Salvador'}).format(at);
/** La vigencia viene con ambos extremos incluidos (FR-103-03). */
export function registrationState(r:Pick<Registration,'validFrom'|'validTo'>,today=businessToday()):RegistrationState{
 if(r.validTo<today)return 'vencida';
 if(r.validFrom>today)return 'proxima';
 const left=(Date.parse(r.validTo+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/DAY;
 return left<=DIAS_AVISO_VENCIMIENTO?'por_vencer':'vigente';
}

/** W08 · Ficha de personal: datos, inscripciones con vencimiento y turnos próximos. */
export function StaffFicha({api,profile,person,version,onClose,onEdit,onChanged}:{api:Api;profile:AccessProfile;person:Staff;version:number;onClose:()=>void;onEdit:()=>void;onChanged:()=>void}){
 const [adding,setAdding]=useState(false),manage=can(profile,'personal.gestionar'),viewShifts=can(profile,'turnos.ver');
 const shifts=useData<Shift[]>(api,'/turnos',version,viewShifts),today=businessToday(),now=Date.now();
 const registrations=person.registrations??[];
 const upcoming=(shifts.data??[]).filter(s=>s.staffId===person.id&&['publicado','en_curso'].includes(s.state)&&Date.parse(s.end)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 return <Dialog title={`Ficha de ${person.givenNames} ${person.surnames}`} onClose={onClose}>
  <div className="module-form">
   <section aria-labelledby="ficha-datos"><h3 id="ficha-datos">Datos</h3>
    <dl className="detail-list">
     <div><dt>Función</dt><dd>{person.type}</dd></div>
     <div><dt>Especialidad</dt><dd>{person.specialty||'Sin especialidad registrada'}</dd></div>
     <div><dt>Área</dt><dd>{person.area||'Sin asignar'}</dd></div>
     <div><dt>Estado</dt><dd><Tag value={person.active?'activo':'inactivo'}/></dd></div>
     {person.phone&&<div><dt>Teléfono</dt><dd>{person.phone}</dd></div>}
     {person.dui&&<div><dt>DUI</dt><dd>{person.dui}</dd></div>}
    </dl>
   </section>
   <section aria-labelledby="ficha-inscripciones"><h3 id="ficha-inscripciones">Inscripciones profesionales</h3>
    {registrations.length?<table className="record-table"><caption className="sr-only">Inscripciones profesionales</caption><thead><tr><th>Junta</th><th>Número</th><th>Vigencia</th><th>Estado</th></tr></thead><tbody>{registrations.map(r=>{const s=registrationState(r,today);return <tr key={r.id}><td data-label="Junta">{boards[r.board]??r.board}</td><td data-label="Número">{r.number}</td><td data-label="Vigencia">{formatDate(r.validFrom)} al {formatDate(r.validTo)}</td><td data-label="Estado"><span className={`status-tag status-${registrationTone[s]}`}>{registrationLabels[s]}</span></td></tr>;})}</tbody></table>
     :<Empty title="Sin inscripciones registradas" description="Sin una inscripción vigente no se programan turnos de medicina ni de enfermería."/>}
    {manage&&!adding&&<button type="button" className="secondary-button" onClick={()=>setAdding(true)}><Icon name="plus" size={18}/>Registrar inscripción</button>}
    {manage&&adding&&<RegistrationForm api={api} person={person} onCancel={()=>setAdding(false)} onSaved={()=>{setAdding(false);onChanged();}} onStale={()=>{setAdding(false);onChanged();}}/>}
   </section>
   {viewShifts&&<section aria-labelledby="ficha-turnos"><h3 id="ficha-turnos">Turnos próximos</h3>
    <RemoteState state={shifts}>{()=>upcoming.length?<table className="record-table"><caption className="sr-only">Turnos próximos publicados</caption><thead><tr><th>Inicio</th><th>Fin</th><th>Área</th><th>Tipo</th></tr></thead><tbody>{upcoming.map(s=><tr key={s.id}><td data-label="Inicio">{formatDateTime(s.start)}</td><td data-label="Fin">{formatDateTime(s.end)}</td><td data-label="Área">{s.area}</td><td data-label="Tipo">{shiftTypes[s.type]??s.type}</td></tr>)}</tbody></table>
     :<Empty title="Sin turnos próximos" description="Esta persona no tiene turnos publicados por venir."/>}</RemoteState>
   </section>}
   <div className="dialog-actions">{manage&&<button type="button" className="secondary-button" onClick={onEdit}>Editar datos</button>}<button type="button" className="primary-button" onClick={onClose}>Cerrar</button></div>
  </div>
 </Dialog>;
}

function RegistrationForm({api,person,onCancel,onSaved,onStale}:{api:Api;person:Staff;onCancel:()=>void;onSaved:()=>void;onStale:()=>void}){
 const [form,setForm]=useState({board:'JVPM' as RegistrationInput['board'],number:'',validFrom:'',validTo:''}),[reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 const validDate=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 function check():string{
  if(form.number.trim().length<2)return 'Escribe el número de inscripción, de al menos 2 caracteres.';
  if(!validDate(form.validFrom)||!validDate(form.validTo))return 'Indica el inicio y el fin de la vigencia con fechas válidas.';
  if(form.validTo<form.validFrom)return 'El fin de la vigencia no puede ser anterior al inicio.';
  if(reason.trim().length<10)return 'Indica el motivo del registro, de al menos 10 caracteres.';
  return '';
 }
 async function save(e:FormEvent){e.preventDefault();const found=check();setProblem(found);if(found)return;const body:RegistrationInput={...form,number:form.number.trim(),version:person.version,reason:reason.trim()};if(await action.run(`/personal/${person.id}/inscripciones`,body))onSaved();}
 return <form className="module-form" onSubmit={save} noValidate aria-label="Registrar inscripción">
  {problem&&<Notice kind="error">{problem}</Notice>}
  {isVersionConflict(action.error)?<><Notice kind="error">La ficha cambió. Recárgala para ver los datos actuales; la inscripción no se guardó.</Notice><button type="button" className="secondary-button" onClick={onStale}>Recargar ficha</button></>:<WriteError error={action.error}/>}
  <div className="form-grid">
   <Select label="Junta" value={form.board} onChange={v=>setForm(f=>({...f,board:v as RegistrationInput['board']}))}>{Object.entries(boards).map(([k,v])=><option key={k} value={k}>{v}</option>)}</Select>
   <Field label="Número de inscripción" value={form.number} onChange={v=>setForm(f=>({...f,number:v}))} required minLength={2} maxLength={40}/>
   <Field label="Vigente desde" type="date" value={form.validFrom} onChange={v=>setForm(f=>({...f,validFrom:v}))} required/>
   <Field label="Vigente hasta" type="date" value={form.validTo} onChange={v=>setForm(f=>({...f,validTo:v}))} min={form.validFrom||undefined} required/>
  </div>
  <Field label="Motivo del registro" value={reason} onChange={setReason} required minLength={10} maxLength={500}/>
  <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onCancel} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Guardar inscripción"/></div>
 </form>;
}
