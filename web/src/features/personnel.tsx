import { useEffect,useMemo,useState,type FormEvent } from 'react';
import { Field,Icon,Notice } from '../components/ui';
import { can,staffTypeNames,type AccessProfile,type Api,type Staff,type Shift,type ShiftInput,type Space } from '../lib/api';
import { Dialog,Empty,Heading,RemoteState,SaveButton,Select,Tag,WriteError,formatDateTime,isVersionConflict,useAction,useData } from './common';
import { useQuickAction } from './personal/accion';
// Obs. 9: Usuarios y Personal son un solo módulo; vive en `personal/`.
export { PersonnelPage } from './personal/DirectoryPage';
/** El tipo de personal de cada turno llega en la respuesta (`staffType`); no hace falta leer `/personal` para filtrar por rol. */
type ShiftRow=Shift&{staffType?:string};
export function ShiftsPage({api,profile,version}:{api:Api;profile:AccessProfile;version:number}) {
 const data=useData<ShiftRow[]>(api,'/turnos',version),plan=can(profile,'turnos.planificar'),staff=useData<Staff[]>(api,'/personal',version,plan),spaces=useData<Space[]>(api,'/espacios',version,plan&&can(profile,'espacios.ver'));
 const [open,setOpen]=useState(false),[editing,setEditing]=useState<Shift|null>(null),[areaFilter,setAreaFilter]=useState('todos'),[roleFilter,setRoleFilter]=useState('todos'),[person,setPerson]=useState('todos'),[filter,setFilter]=useState('todos'),[cancelling,setCancelling]=useState<Shift|null>(null),[clockNow,setClockNow]=useState(()=>new Date());
 const [quick,consumeQuick]=useQuickAction();
 useEffect(()=>{const timer=window.setInterval(()=>setClockNow(new Date()),1000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{if(!quick)return;if(quick==='planificar'&&plan){setEditing(null);setOpen(true);}consumeQuick();},[quick,plan,consumeQuick]);
 const jornadaDate=new Intl.DateTimeFormat('es-SV',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/El_Salvador'}).format(clockNow);
 // Obs. 6: los filtros salen de los propios turnos (`area`, `staffType`, `person`), así funcionan igual para todo rol sin leer /personal ni /espacios.
 const staffById=useMemo(()=>new Map((staff.data??[]).map(p=>[p.id,p])),[staff.data]);
 const typeOf=(t:ShiftRow)=>t.staffType??staffById.get(t.staffId)?.type;
 const all=data.data??[];
 const areaOptions=useMemo(()=>[...new Map(all.map(t=>[t.areaId,t.area])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es')),[all]);
 const roleOptions=Object.keys(staffTypeNames);
 const people=useMemo(()=>[...new Map(all.filter(t=>(areaFilter==='todos'||t.areaId===areaFilter)&&(roleFilter==='todos'||typeOf(t)===roleFilter)).map(t=>[t.staffId,t.person])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es')),[all,areaFilter,roleFilter,staffById]);
 const effectiveState=(shift:Shift)=>{if(shift.state!=='publicado')return shift.state;const start=Date.parse(shift.start),end=Date.parse(shift.end),now=clockNow.valueOf();return now<start?'pendiente':now<end?'en_curso':'completado';};
 const rows=all.filter(t=>(person==='todos'||t.staffId===person)&&(areaFilter==='todos'||t.areaId===areaFilter)&&(roleFilter==='todos'||typeOf(t)===roleFilter)&&(filter==='todos'||effectiveState(t)===filter));
 const filtering=areaFilter!=='todos'||roleFilter!=='todos'||person!=='todos'||filter!=='todos';
 return <>
  <Heading eyebrow="Operaciones / Jornada" title="Turnos" description="La jornada se abre automáticamente a las 00:00. Asigna horarios según el área, el rol y la disponibilidad real del personal." actions={plan&&<button className="primary-button" onClick={()=>{setEditing(null);setOpen(true);}}><Icon name="plus" size={18}/>Asignar turno</button>}/>
  <div className="planning-window"><strong>Jornada laboral abierta</strong><span>{jornadaDate} · Asignaciones habilitadas durante toda la jornada. El sistema controla traslapes y descansos.</span></div>
  <section className="data-workbench">
   <div className="table-toolbar">
    <Select label="Área de trabajo" value={areaFilter} onChange={value=>{setAreaFilter(value);setPerson('todos');}}><option value="todos">Todas las áreas</option>{areaOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select>
    <Select label="Rol del personal" value={roleFilter} onChange={value=>{setRoleFilter(value);setPerson('todos');}}><option value="todos">Todos los roles</option>{roleOptions.map(role=><option key={role} value={role}>{staffTypeNames[role]}</option>)}</Select>
    <Select label="Persona" value={person} onChange={setPerson}><option value="todos">Todas las personas</option>{people.map(([id,name])=><option key={id} value={id}>{name}</option>)}</Select>
    <Select label="Estado del turno" value={filter} onChange={setFilter}><option value="todos">Todos los estados</option>{['borrador','pendiente','en_curso','completado','cancelado'].map(s=><option key={s} value={s}>{({borrador:'Borradores',pendiente:'Pendientes de iniciar',en_curso:'En curso',completado:'Completados',cancelado:'Cancelados'} as Record<string,string>)[s]}</option>)}</Select>
    {filtering&&<button type="button" className="secondary-button" onClick={()=>{setAreaFilter('todos');setRoleFilter('todos');setPerson('todos');setFilter('todos');}}>Quitar filtros</button>}
   </div>
   <p className="refresh-hint">Los filtros se combinan: por ejemplo, “Emergencia” + “Enfermería” muestra solo los turnos de enfermería en esa área.</p>
   <RemoteState state={data}>{()=>rows.length?<table className="record-table"><caption className="sr-only">Planificación de turnos</caption><thead><tr><th>Persona / área</th><th>Inicio</th><th>Fin</th><th>Tipo</th><th>Estado</th>{plan&&<th>Acción</th>}</tr></thead><tbody>{rows.map(t=>{const state=effectiveState(t);return <tr key={t.id}><td data-label="Persona y área"><strong>{t.person}</strong><small>{typeOf(t)?`${staffTypeNames[typeOf(t)!]??typeOf(t)} · ${t.area}`:t.area}</small></td><td data-label="Inicio">{formatDateTime(t.start)}</td><td data-label="Fin">{formatDateTime(t.end)}</td><td data-label="Tipo">{({diurno:'Diurno',nocturno:'Nocturno',guardia:'Guardia'} as Record<string,string>)[t.type]}</td><td data-label="Estado"><Tag value={state}/></td>{plan&&<td data-label="Acción"><button className="row-action" onClick={()=>{setEditing(t);setOpen(true);}}>Editar <Icon name="arrow" size={16}/></button>{['borrador','publicado','en_curso'].includes(t.state)&&<button className="row-action" aria-label={`Cancelar turno de ${t.person}`} onClick={()=>setCancelling(t)}>Cancelar turno</button>}</td>}</tr>;})}</tbody></table>:<Empty title="Sin turnos en esta vista" description="Ajusta los filtros para consultar otros horarios."/>}</RemoteState>
  </section>
  {open&&<ShiftForm api={api} shift={editing} people={staff.data??[]} shifts={data.data??[]} spaces={spaces.data??[]} onClose={()=>setOpen(false)} onSaved={()=>{setOpen(false);data.refresh();}}/>}
  {cancelling&&<CancelShiftForm api={api} shift={cancelling} onClose={()=>{setCancelling(null);data.refresh();}} onSaved={()=>{setCancelling(null);data.refresh();}}/>}
 </>;
}

/** Cancela con `PATCH /turnos/{id}` y `state:'cancelado'`; la API exige versión y motivo de al menos 10 caracteres. */
function CancelShiftForm({api,shift,onClose,onSaved}:{api:Api;shift:Shift;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<10){setProblem('Indica el motivo de la cancelación, de al menos 10 caracteres.');return;}setProblem('');const body={staffId:shift.staffId,areaId:shift.areaId,start:shift.start,end:shift.end,type:shift.type,state:'cancelado',version:shift.version,reason:reason.trim()};if(await action.run(`/turnos/${shift.id}`,body,'PATCH'))onSaved();}
 return <Dialog title="Cancelar turno" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{isVersionConflict(action.error)?<><Notice kind="error">El turno cambió. Cierra y vuelve a abrirlo para ver su estado actual; la cancelación no se guardó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:<WriteError error={action.error}/>}<p>Se cancelará el turno de <strong>{shift.person}</strong> en {shift.area}, del {formatDateTime(shift.start)} al {formatDateTime(shift.end)}. El registro se conserva con tu motivo.</p><Field label="Motivo de la cancelación" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus error={problem||undefined}/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Cancelar turno"/></div></form></Dialog>;
}
function localDate(s:string){return new Date(new Date(s).valueOf()-6*3600000).toISOString().slice(0,16);}
const SALVADOR_DAY=24*3600000;
function localParts(value:Date){return new Intl.DateTimeFormat('en-US',{timeZone:'America/El_Salvador',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hour12:false}).formatToParts(value).reduce<Record<string,string>>((out,part)=>(out[part.type]=part.value,out),{});}
function localDateOf(value:Date){const p=localParts(value);return `${p.year}-${p.month}-${p.day}`;}
function mandatoryRestUntil(start:string,end:string,type:string){
 const from=new Date(start),to=new Date(end),hours=(to.valueOf()-from.valueOf())/3600000,startLocal=localParts(from),endDate=localDateOf(new Date(to.valueOf()-1));
 const crossesMidnight=localDateOf(from)!==endDate,startsAtNight=Number(startLocal.hour)>=18;
 if(hours<24&&(!crossesMidnight||(!startsAtNight&&type!=='nocturno')))return null;
 const endDateStart=new Date(`${localDateOf(to)}T00:00:00-06:00`);
 return new Date(endDateStart.valueOf()+SALVADOR_DAY);
}
function personAvailability(personId:string,start:string,shifts:Shift[],currentId?:string){
 if(!start)return null;
 const targetStart=new Date(`${start}-06:00`),dayStart=new Date(`${start.slice(0,10)}T00:00:00-06:00`),dayEnd=new Date(dayStart.valueOf()+SALVADOR_DAY);
 const assigned=shifts.filter(item=>item.staffId===personId&&item.id!==currentId&&item.state!=='cancelado');
 for(const item of assigned){
  const itemStart=new Date(item.start),itemEnd=new Date(item.end),restUntil=mandatoryRestUntil(item.start,item.end,item.type);
  if(restUntil&&targetStart<restUntil)return `Descanso obligatorio hasta ${formatDateTime(restUntil.toISOString())}`;
  if(itemStart<dayEnd&&itemEnd>dayStart)return 'Ya tiene un turno en esta jornada';
 }
 return null;
}
function ShiftForm({api,shift,people,shifts,spaces,onClose,onSaved}:{api:Api;shift:Shift|null;people:Staff[];shifts:Shift[];spaces:Space[];onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState<ShiftInput>({staffId:shift?.staffId??'',areaId:shift?.areaId??'',start:shift?localDate(shift.start):'',end:shift?localDate(shift.end):'',type:(shift?.type??'diurno') as ShiftInput['type'],justification:shift?.justification??''}),[areaFilter,setAreaFilter]=useState('todos'),[roleFilter,setRoleFilter]=useState('todos'),[reason,setReason]=useState(''),[cancel,setCancel]=useState(shift?.state==='cancelado');
 const action=useAction(api),put=<K extends keyof ShiftInput>(k:K,v:ShiftInput[K])=>setForm(f=>({...f,[k]:v}));
 const activePeople=people.filter(p=>p.active),areaOptions=spaces.filter(s=>s.active&&['area','planta','consultorio','hospital'].includes(s.type)).sort((a,b)=>a.name.localeCompare(b.name,'es')),visiblePeople=activePeople.filter(p=>(areaFilter==='todos'||p.areaId===areaFilter)&&(roleFilter==='todos'||p.type===roleFilter));
 const roleOptions=[...new Set(activePeople.map(p=>p.type))].sort((a,b)=>(staffTypeNames[a]??a).localeCompare(staffTypeNames[b]??b,'es'));
 const selectedAvailability=form.staffId?personAvailability(form.staffId,form.start,shifts,shift?.id):null;
 async function save(e:FormEvent){e.preventDefault();const body={...form,start:new Date(form.start+'-06:00').toISOString(),end:new Date(form.end+'-06:00').toISOString(),...(shift?{version:shift.version,reason,...(cancel?{state:'cancelado'}:{})}:{})};if(await action.run(shift?`/turnos/${shift.id}`:'/turnos',body,shift?'PATCH':'POST'))onSaved();}
 return <Dialog title={shift?'Editar turno':'Asignar turno'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><WriteError error={action.error}/><p className="form-intro">La jornada se abre automáticamente a las 00:00. El sistema evita duplicar turnos y bloquea el día de descanso después de jornadas nocturnas o de 24 horas.</p><div className="form-grid"><Select label="Filtrar personal por área" value={areaFilter} onChange={value=>{setAreaFilter(value);if(value!=='todos'&&form.staffId&&people.find(p=>p.id===form.staffId)?.areaId!==value)put('staffId','');}}><option value="todos">Todas las áreas</option>{areaOptions.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</Select><Select label="Filtrar personal por rol" value={roleFilter} onChange={value=>{setRoleFilter(value);if(value!=='todos'&&form.staffId&&people.find(p=>p.id===form.staffId)?.type!==value)put('staffId','');}}><option value="todos">Todos los roles</option>{roleOptions.map(role=><option key={role} value={role}>{staffTypeNames[role]??role}</option>)}</Select><Select label="Persona · disponibilidad" value={form.staffId} onChange={v=>put('staffId',v)} required><option value="">Selecciona personal activo</option>{visiblePeople.map(p=>{const status=personAvailability(p.id,form.start,shifts,shift?.id);return <option key={p.id} value={p.id} disabled={Boolean(status)}>{p.givenNames} {p.surnames} · {staffTypeNames[p.type]??p.type}{status?` · ${status}`:''}</option>;})}</Select><Select label="Área del turno" value={form.areaId} onChange={v=>put('areaId',v)} required><option value="">Selecciona un área</option>{areaOptions.map(s=><option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select><Field label="Inicio" type="datetime-local" value={form.start} onChange={v=>put('start',v)} required/><Field label="Fin" type="datetime-local" value={form.end} onChange={v=>put('end',v)} min={form.start||undefined} required/><Select label="Tipo de turno" value={form.type} onChange={v=>put('type',v as ShiftInput['type'])}><option value="diurno">Diurno</option><option value="nocturno">Nocturno</option><option value="guardia">Guardia / 24 horas</option></Select><Field label="Observación · opcional" value={form.justification??''} onChange={v=>put('justification',v)} maxLength={500}/></div>{selectedAvailability&&<Notice kind="info">{selectedAvailability}. El personal no podrá asignarse hasta cumplir la regla de descanso.</Notice>}{shift&&<><label className="check-field"><input type="checkbox" checked={cancel} onChange={e=>setCancel(e.target.checked)}/>Cancelar este turno</label><Field label="Motivo del cambio" value={reason} onChange={setReason} minLength={10} maxLength={500} required/></>}<div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={shift?'Guardar turno':'Asignar turno'}/></div></form></Dialog>;
}
