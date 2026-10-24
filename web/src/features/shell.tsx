import { useEffect,useState,type ReactNode } from 'react';
import { Brand,Icon } from '../components/ui';
import { can,roleNames,type AccessProfile,type Api,type AuditRow,type Summary } from '../lib/api';
import { Empty,Heading,RemoteState,Tag,formatDateTime,useData } from './common';
import { PatientsPage } from './patients';
import { PersonnelPage,ShiftsPage } from './personnel';
import { BedsPage,SpacesPage } from './spaces';
import { UsersPage } from './users';
export type Module={id:string;label:string;permission?:string;roles:string[];future?:boolean};
export const modules:Module[]=[
 {id:'inicio',label:'Inicio',roles:['ADM','JOP','REC','LAB','DPD']},
 {id:'pacientes',label:'Pacientes',permission:'pacientes.buscar',roles:['REC']},
 {id:'personal',label:'Personal',permission:'personal.ver',roles:['ADM','JOP']},
 {id:'camas',label:'Camas',permission:'camas.ver_tablero',roles:['JOP','REC']},
 {id:'espacios',label:'Edificio',permission:'espacios.ver',roles:['ADM','JOP','REC']},
 {id:'turnos',label:'Turnos',permission:'turnos.ver',roles:['ADM','JOP','REC']},
 {id:'usuarios',label:'Usuarios',permission:'usuarios.ver',roles:['ADM','DPD']},
 {id:'auditoria',label:'Auditoría',permission:'auditoria.ver',roles:['DPD']},
 {id:'laboratorio',label:'Laboratorio',roles:['LAB'],future:true},
 {id:'inventario',label:'Inventario',roles:['JOP','LAB'],future:true},
 {id:'fila',label:'Fila del día',roles:['REC'],future:true},
 {id:'citas',label:'Citas',roles:['REC'],future:true},
 {id:'privacidad',label:'Accesos excepcionales',roles:['DPD'],future:true},
 {id:'perfil',label:'Mi cuenta',roles:['ADM','JOP','REC','LAB','DPD']},
];
const readRoute=()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'inicio';
export function HospitalShell({api,profile,version=0,connection='live',onLogout}:{api:Api;profile:AccessProfile;version?:number;connection?:'live'|'polling'|'offline'|'reconnecting';onLogout:()=>void}){
 const roles=profile.roles.filter(r=>['ADM','JOP','REC','LAB','DPD'].includes(r)),[role,setRole]=useState(roles[0]??''),[route,setRoute]=useState(readRoute);
 const menu=modules.filter(m=>m.roles.includes(role)&&(!m.permission||can(profile,m.permission)));
 useEffect(()=>{const handle=()=>setRoute(readRoute());window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[]);
 useEffect(()=>{if(!roles.includes(role)){setRole(roles[0]??'');location.hash='/inicio';}},[profile.roles.join('|')]);
 const active=menu.find(m=>m.id===route);
 let content:ReactNode;
 if(!active)content=<><Heading eyebrow="Acceso restringido" title="Sin permiso" description="Esta sección no corresponde al rol seleccionado."/><a href="#/inicio" className="secondary-button">Volver al inicio</a></>;
 else if(route==='inicio')content=<Dashboard api={api} profile={profile} role={role} version={version} menu={menu}/>;
 else if(route==='pacientes')content=<PatientsPage api={api} profile={profile} version={version}/>;
 else if(route==='personal')content=<PersonnelPage api={api} profile={profile} version={version}/>;
 else if(route==='turnos')content=<ShiftsPage api={api} profile={profile} version={version}/>;
 else if(route==='espacios')content=<SpacesPage api={api} profile={profile} version={version}/>;
 else if(route==='camas')content=<BedsPage api={api} version={version}/>;
 else if(route==='usuarios')content=<UsersPage api={api} profile={profile} version={version}/>;
 else if(route==='auditoria')content=<AuditPage api={api} version={version}/>;
 else if(route==='perfil')content=<ProfilePage profile={profile} onLogout={onLogout}/>;
 else content=<><Heading eyebrow={`${roleNames[role]} / ${active.label}`} title={active.label} description="Espacio de trabajo del módulo."/><div className="future-module"><span className="eyebrow">Próxima entrega</span><h2>Este módulo todavía no está habilitado.</h2><p>Su acceso y navegación ya están definidos para tu rol. Las operaciones se habilitarán en la siguiente entrega.</p><a href="#/inicio" className="row-action">Volver al inicio <Icon name="arrow" size={18}/></a></div></>;
 return <div className="hospital-shell"><a href="#main-content" className="skip-link">Ir al contenido</a><header className="hospital-header"><div className="hospital-header-inner"><Brand light/><div className="workspace-role">{roles.length>1?<label><span className="sr-only">Rol de trabajo</span><select value={role} onChange={e=>{setRole(e.target.value);location.hash='/inicio';}}>{roles.map(r=><option value={r} key={r}>{roleNames[r]}</option>)}</select></label>:<span>{roleNames[role]}</span>}<span className="mono-label">HOSPITAL UNIVERSITARIO</span></div><details className="account-menu"><summary aria-label="Opciones de cuenta"><span className="account-avatar">{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><span className="account-menu-label">Mi cuenta</span><span aria-hidden="true">⌄</span></summary><div className="account-popover"><span>Sesión iniciada</span><strong>{profile.email}</strong><a href="#/perfil">Ver mi cuenta</a><button onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></div></details></div><nav className="module-nav" aria-label="Navegación principal">{menu.map(m=><a href={`#/${m.id}`} key={m.id} aria-current={route===m.id?'page':undefined}>{m.label}</a>)}</nav></header>{connection!=='live'&&<div role="status" className={`connection-band connection-${connection}`}><Icon name="info" size={16}/>{connection==='offline'?'Sin conexión. No se pueden guardar cambios.':connection==='reconnecting'?'Recuperando la conexión…':'Actualización automática activa. Recuperando el canal en vivo.'}</div>}<main id="main-content" className="hospital-main" key={role+'-'+route}>{content}</main><footer className="hospital-footer"><Brand/><span>Hospital universitario CLIMESA</span><span><Icon name="lock" size={13}/>Acceso personal</span></footer></div>;
}
function Dashboard({api,profile,role,version,menu}:{api:Api;profile:AccessProfile;role:string;version:number;menu:Module[]}){
 const data=useData<Summary>(api,'/inicio',version);
 return <><Heading eyebrow={`${roleNames[role]} / Inicio`} title="Resumen del hospital" description={`Bienvenido${profile.name?', '+profile.name.split(' ')[0]:''}. Consulta la información de tu espacio de trabajo.`}/><RemoteState state={data}>{s=><><div className="number-strip">{s.beds&&<><div><strong>{s.beds.free}<small>/{s.beds.total}</small></strong><span>Camas libres</span></div><div><strong>{s.beds.occupied}</strong><span>Camas ocupadas</span></div></>}{s.patients&&<div><strong>{s.patients.active}</strong><span>Pacientes activos</span></div>}{s.staff&&<div><strong>{s.staff.active}</strong><span>Personas activas</span></div>}{s.users&&<div><strong>{s.users.active}</strong><span>Cuentas activas</span></div>}{s.shifts&&<div><strong>{s.shifts.draft}</strong><span>Turnos en borrador</span></div>}</div><p className="updated-at">Actualizado: {formatDateTime(s.lastUpdate)}</p></>}</RemoteState><section className="dashboard-links"><div><span className="eyebrow">Tu espacio de trabajo</span><h2>Accesos directos</h2></div><div>{menu.filter(m=>!m.future&&!['inicio','perfil'].includes(m.id)).map((m,i)=><a href={`#/${m.id}`} key={m.id}><span className="mono-data">{String(i+1).padStart(2,'0')}</span><span>{m.label}</span><Icon name="arrow" size={20}/></a>)}</div>{menu.filter(m=>!m.future&&!['inicio','perfil'].includes(m.id)).length===0&&<p className="muted">Tu cuenta está lista. Los módulos de atención se habilitarán en la siguiente entrega.</p>}</section><div className="dashboard-account"><Icon name="shield" size={24}/><div><h3>Acceso según tu función</h3><p>Las operaciones y los datos disponibles corresponden a los roles de tu cuenta.</p></div><a className="row-action" href="#/perfil">Ver mi cuenta <Icon name="arrow" size={16}/></a></div></>;
}
function ProfilePage({profile,onLogout}:{profile:AccessProfile;onLogout:()=>void}){return <><Heading eyebrow="CLIMESA / Cuenta personal" title="Mi cuenta" description="Tu identidad y acceso dentro del hospital."/><section className="profile-sheet"><div className="profile-identity"><span>{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><div><h2>{profile.name||'Cuenta de CLIMESA'}</h2><p>{profile.email}</p></div></div><dl className="detail-grid"><div><dt>Estado</dt><dd><Tag value="activo"/></dd></div><div><dt>Plataformas habilitadas</dt><dd>{profile.platforms.map(p=>({web:'Web',android:'Android',ios:'iOS'} as Record<string,string>)[p]??p).join(' · ')}</dd></div><div className="full-width"><dt>Roles asignados</dt><dd>{profile.roles.map(r=>roleNames[r]??r).join(' · ')}</dd></div></dl><div className="profile-security"><Icon name="lock" size={20}/><p>Tu contraseña es personal. El administrador gestiona tus roles, sin conocerla.</p></div><button className="secondary-button" onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></section></>;}
function AuditPage({api,version}:{api:Api;version:number}){
 const data=useData<AuditRow[]>(api,'/auditoria',version);
 return <><Heading eyebrow="Protección de datos / Trazabilidad" title="Auditoría" description="Quién realizó cada operación, cuándo y con qué resultado."/><section className="data-workbench"><RemoteState state={data}>{rows=>rows.length?<table className="record-table"><caption className="sr-only">Últimas cien operaciones auditadas</caption><thead><tr><th>Fecha</th><th>Persona</th><th>Operación</th><th>Entidad</th><th>Resultado</th></tr></thead><tbody>{rows.map(r=><tr key={r.seq}><td data-label="Fecha">{formatDateTime(r.at)}</td><td data-label="Persona"><strong>{r.actor||'Cuenta del sistema'}</strong><small>{r.role}</small></td><td data-label="Operación">{r.action}</td><td data-label="Entidad">{r.entity}<small className="mono-data">{r.entityId}</small></td><td data-label="Resultado"><Tag value={r.result}/></td></tr>)}</tbody></table>:<Empty title="Todavía no hay actividad" description="Las operaciones aparecerán aquí después de registrarse."/>}</RemoteState><p className="table-footnote">Se muestran las últimas 100 operaciones. Los eventos no incluyen valores clínicos.</p></section></>;
}
