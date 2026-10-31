import { useEffect,useState,type ReactNode } from 'react';
import { Brand,Icon,StatusView } from '../components/ui';
import { can,roleNames,type AccessProfile,type Api,type AuditRow,type Summary } from '../lib/api';
import { AmbulancePage } from './ambulance';
import { Empty,Heading,RemoteState,Tag,formatDateTime,useData } from './common';
import { PatientsPage } from './patients';
import { PersonnelPage,ShiftsPage } from './personnel';
import { Tablero } from './tablero';
import { BedsPage,SpacesPage } from './spaces';
import { UsersPage } from './users';
/** El menú depende solo del permiso (regla 8): sin `permission` el módulo es de toda cuenta con sesión. */
export type Module={id:string;label:string;permission?:string;future?:boolean};
export const modules:Module[]=[
 {id:'inicio',label:'Inicio'},
 {id:'pacientes',label:'Pacientes',permission:'pacientes.buscar'},
 {id:'personal',label:'Personal',permission:'personal.ver'},
 {id:'camas',label:'Camas',permission:'camas.ver_tablero'},
 {id:'espacios',label:'Edificio',permission:'espacios.ver'},
 {id:'ambulancia',label:'Ambulancia',permission:'ambulancia.ver_estado'},
 {id:'turnos',label:'Turnos',permission:'turnos.ver'},
 {id:'usuarios',label:'Usuarios',permission:'usuarios.ver'},
 {id:'auditoria',label:'Auditoría',permission:'auditoria.ver'},
 {id:'laboratorio',label:'Laboratorio',permission:'laboratorio.ver_cola',future:true},
 {id:'inventario',label:'Inventario',permission:'inventario.ver',future:true},
 {id:'fila',label:'Fila del día',permission:'fila.ver',future:true},
 {id:'citas',label:'Citas',permission:'citas.ver',future:true},
 {id:'privacidad',label:'Accesos excepcionales',permission:'privacidad.aprobar_acceso',future:true},
 {id:'perfil',label:'Perfil'},
];
/** Módulos que la cuenta ve: Inicio y Perfil siempre, el resto según el permiso del catálogo. */
export const visibleModules=(profile:AccessProfile)=>modules.filter(m=>!m.permission||can(profile,m.permission));
/** La web se abre solo si la cuenta tiene algún módulo de trabajo (con permiso) visible. */
export const hasWebModule=(profile:AccessProfile)=>visibleModules(profile).some(m=>m.permission);
const readRoute=()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'inicio';
export function HospitalShell({api,profile,version=0,connection='live',onLogout}:{api:Api;profile:AccessProfile;version?:number;connection?:'live'|'offline'|'reconnecting';onLogout:()=>void}){
 const [route,setRoute]=useState(readRoute),menu=visibleModules(profile),roleLabel=profile.roles.map(r=>roleNames[r]??r).join(' · ');
 useEffect(()=>{const handle=()=>setRoute(readRoute());window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[]);
 if(!hasWebModule(profile))return <StatusView title="Tu rol no usa esta aplicación" detail="Tu cuenta no tiene módulos habilitados en la web. Ingresa desde la aplicación que corresponde a tu función." action="Cerrar sesión" onAction={onLogout}/>;
 const active=menu.find(m=>m.id===route);
 let content:ReactNode;
 if(!active)content=<><Heading eyebrow="Acceso restringido" title="Sin permiso" description="Esta sección no corresponde a los permisos de tu cuenta."/><a href="#/inicio" className="secondary-button">Volver al inicio</a></>;
 else if(route==='inicio')content=<Dashboard api={api} profile={profile} version={version} menu={menu}/>;
 else if(route==='pacientes')content=<PatientsPage api={api} profile={profile} version={version}/>;
 else if(route==='personal')content=<PersonnelPage api={api} profile={profile} version={version}/>;
 else if(route==='turnos')content=<ShiftsPage api={api} profile={profile} version={version}/>;
 else if(route==='espacios')content=<SpacesPage api={api} profile={profile} version={version}/>;
 else if(route==='camas')content=<BedsPage api={api} profile={profile} version={version}/>;
 else if(route==='ambulancia')content=<AmbulancePage api={api} profile={profile} version={version}/>;
 else if(route==='usuarios')content=<UsersPage api={api} profile={profile} version={version}/>;
 else if(route==='auditoria')content=<AuditPage api={api} version={version}/>;
 else if(route==='perfil')content=<ProfilePage profile={profile} onLogout={onLogout}/>;
 else content=<><Heading eyebrow={`Próxima entrega / ${active.label}`} title={active.label} description="Espacio de trabajo del módulo."/><div className="future-module"><span className="eyebrow">Próxima entrega</span><h2>Este módulo todavía no está habilitado.</h2><p>Su acceso y navegación ya están definidos según tus permisos. Las operaciones se habilitarán en la siguiente entrega.</p><a href="#/inicio" className="row-action">Volver al inicio <Icon name="arrow" size={18}/></a></div></>;
 return <div className="hospital-shell"><a href="#main-content" className="skip-link">Ir al contenido</a><header className="hospital-header"><div className="hospital-header-inner"><Brand light/><div className="workspace-role"><span>{roleLabel}</span><span className="mono-label">HOSPITAL UNIVERSITARIO</span></div><details className="account-menu"><summary aria-label="Opciones de cuenta"><span className="account-avatar">{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><span className="account-menu-label">Mi cuenta</span><span aria-hidden="true">⌄</span></summary><div className="account-popover"><span>Sesión iniciada</span><strong>{profile.email}</strong><a href="#/perfil">Ver mi cuenta</a><button onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></div></details></div><nav className="module-nav" aria-label="Navegación principal">{menu.map(m=><a href={`#/${m.id}`} key={m.id} aria-current={route===m.id?'page':undefined}>{m.label}</a>)}</nav></header>{connection!=='live'&&<div role="status" className={`connection-band connection-${connection}`}><Icon name="info" size={16}/>{connection==='offline'?'Sin conexión. No se pueden guardar cambios.':'Recuperando la conexión…'}</div>}<main id="main-content" className="hospital-main" key={route}>{content}</main><footer className="hospital-footer"><Brand/><span>Hospital universitario CLIMESA</span><span><Icon name="lock" size={13}/>Acceso personal</span></footer></div>;
}
function Dashboard({api,profile,version,menu}:{api:Api;profile:AccessProfile;version:number;menu:Module[]}){
 const board=can(profile,'metricas.ver');
 const data=useData<Summary>(api,'/inicio',version,!board);
 return <><Heading eyebrow="CLIMESA / Inicio" title="Resumen del hospital" description={`Bienvenido${profile.name?', '+profile.name.split(' ')[0]:''}. Consulta la información de tu espacio de trabajo.`}/>{board?<Tablero api={api} profile={profile} version={version}/>:<RemoteState state={data}>{s=><><div className="number-strip">{s.beds&&<><div><strong>{s.beds.free}<small>/{s.beds.total}</small></strong><span>Camas libres</span></div><div><strong>{s.beds.occupied}</strong><span>Camas ocupadas</span></div></>}{s.patients&&<div><strong>{s.patients.active}</strong><span>Pacientes activos</span></div>}{s.staff&&<div><strong>{s.staff.active}</strong><span>Personas activas</span></div>}{s.users&&<div><strong>{s.users.active}</strong><span>Cuentas activas</span></div>}{s.shifts&&<div><strong>{s.shifts.draft}</strong><span>Turnos en borrador</span></div>}</div><p className="updated-at">Actualizado: {formatDateTime(s.lastUpdate)}</p></>}</RemoteState>}<section className="dashboard-links"><div><span className="eyebrow">Tu espacio de trabajo</span><h2>Accesos directos</h2></div><div>{menu.filter(m=>!m.future&&!['inicio','perfil'].includes(m.id)).map((m,i)=><a href={`#/${m.id}`} key={m.id}><span className="mono-data">{String(i+1).padStart(2,'0')}</span><span>{m.label}</span><Icon name="arrow" size={20}/></a>)}</div>{menu.filter(m=>!m.future&&!['inicio','perfil'].includes(m.id)).length===0&&<p className="muted">Tu cuenta está lista. Los módulos de atención se habilitarán en la siguiente entrega.</p>}</section><div className="dashboard-account"><Icon name="shield" size={24}/><div><h3>Acceso según tu función</h3><p>Las operaciones y los datos disponibles corresponden a los roles de tu cuenta.</p></div><a className="row-action" href="#/perfil">Ver mi cuenta <Icon name="arrow" size={16}/></a></div></>;
}
function ProfilePage({profile,onLogout}:{profile:AccessProfile;onLogout:()=>void}){return <><Heading eyebrow="CLIMESA / Cuenta personal" title="Mi cuenta" description="Tu identidad y acceso dentro del hospital."/><section className="profile-sheet"><div className="profile-identity"><span>{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><div><h2>{profile.name||'Cuenta de CLIMESA'}</h2><p>{profile.email}</p></div></div><dl className="detail-grid"><div><dt>Estado</dt><dd><Tag value="activo"/></dd></div><div><dt>Plataformas habilitadas</dt><dd>{profile.platforms.map(p=>({web:'Web',android:'Android',ios:'iOS'} as Record<string,string>)[p]??p).join(' · ')}</dd></div><div className="full-width"><dt>Roles asignados</dt><dd>{profile.roles.map(r=>roleNames[r]??r).join(' · ')}</dd></div></dl><div className="profile-security"><Icon name="lock" size={20}/><p>Tu contraseña es personal. El administrador gestiona tus roles, sin conocerla.</p></div><button className="secondary-button" onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></section></>;}
function AuditPage({api,version}:{api:Api;version:number}){
 const data=useData<AuditRow[]>(api,'/auditoria',version);
 return <><Heading eyebrow="Protección de datos / Trazabilidad" title="Auditoría" description="Quién realizó cada operación, cuándo y con qué resultado."/><section className="data-workbench"><RemoteState state={data}>{rows=>rows.length?<table className="record-table"><caption className="sr-only">Últimas cien operaciones auditadas</caption><thead><tr><th>Fecha</th><th>Persona</th><th>Operación</th><th>Entidad</th><th>Resultado</th></tr></thead><tbody>{rows.map(r=><tr key={r.seq}><td data-label="Fecha">{formatDateTime(r.at)}</td><td data-label="Persona"><strong>{r.actor||'Cuenta del sistema'}</strong><small>{r.role}</small></td><td data-label="Operación">{r.action}</td><td data-label="Entidad">{r.entity}<small className="mono-data">{r.entityId}</small></td><td data-label="Resultado"><Tag value={r.result}/></td></tr>)}</tbody></table>:<Empty title="Todavía no hay actividad" description="Las operaciones aparecerán aquí después de registrarse."/>}</RemoteState><p className="table-footnote">Se muestran las últimas 100 operaciones. Los eventos no incluyen valores clínicos.</p></section></>;
}
