import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { Brand,Icon,StatusView,type IconName } from '../components/ui';
import { can,roleNames,type AccessProfile,type Api } from '../lib/api';
import { AmbulancePage } from './ambulance';
import { AmbulanceLogPage } from './ambulance-log';
import { Heading,Tag } from './common';
import { PatientsPage } from './patients';
import { PersonnelPage,ShiftsPage } from './personnel';
import { BedsPage,SpacesPage } from './spaces';
import { UsersPage } from './users';
import { AppointmentsPage } from './appointments';
import { ConsultationsPage } from './consultations';
import { QueuePage } from './queue';
import { LaboratoryPage } from './laboratory';
import { InventoryPage } from './inventory';
import { HospitalizationPage } from './hospitalization';
import { AuditPage } from './privacy';
import { AccountLinksPage } from './account-links';
import { NoticesPage } from './notices';
import { MetricsPage } from './metrics';
import { ChangePasswordForm } from './password';
import { Dashboard } from './dashboards';
/** El menú depende solo del permiso (regla 8): sin `permission` el módulo es de toda cuenta con sesión; `alsoPermissions` abre el mismo módulo a otros permisos. */
export type Module={id:string;label:string;permission?:string;alsoPermissions?:string[];future?:boolean};
export const modules:Module[]=[
 {id:'inicio',label:'Inicio'},
 {id:'pacientes',label:'Pacientes',permission:'pacientes.buscar'},
 {id:'vinculaciones',label:'Vinculaciones',permission:'cuentas.verificar'},
 {id:'personal',label:'Personal',permission:'personal.ver'},
 {id:'camas',label:'Camas',permission:'camas.ver_tablero'},
 {id:'espacios',label:'Edificio',permission:'espacios.ver'},
 {id:'ambulancia',label:'Ambulancia',permission:'ambulancia.ver_estado'},
 {id:'bitacora-ambulancia',label:'Bitácora de ambulancia',permission:'ambulancia.ver_bitacora'},
 {id:'turnos',label:'Turnos',permission:'turnos.ver'},
 {id:'usuarios',label:'Usuarios',permission:'usuarios.ver'},
 {id:'auditoria',label:'Auditoría',permission:'auditoria.ver'},
 {id:'laboratorio',label:'Laboratorio',permission:'laboratorio.ver_cola',alsoPermissions:['laboratorio.ordenar']},
 {id:'inventario',label:'Inventario',permission:'inventario.ver'},
 {id:'hospitalizacion',label:'Hospitalización',permission:'admision.ver',alsoPermissions:['admision.crear']},
 {id:'fila',label:'Fila del día',permission:'fila.ver'},
 {id:'citas',label:'Citas',permission:'citas.ver'},
 {id:'consultas',label:'Mi consultorio',permission:'consulta.iniciar'},
 {id:'avisos',label:'Avisos',permission:'avisos.publicar'},
 {id:'metricas',label:'Métricas',permission:'metricas.ver'},
 {id:'perfil',label:'Perfil'},
];
const moduleIcons:Record<string,IconName>={inicio:'home',pacientes:'users',vinculaciones:'shield',personal:'user',camas:'bed',espacios:'building',ambulancia:'ambulance','bitacora-ambulancia':'ambulance',turnos:'calendar',usuarios:'shield',auditoria:'audit',laboratorio:'lab',inventario:'inventory',hospitalizacion:'bed',fila:'queue',citas:'calendar',consultas:'calendar',perfil:'user',avisos:'info',metricas:'grid'};
/** Módulos que la cuenta ve: Inicio y Perfil siempre, el resto según el permiso del catálogo. */
export const visibleModules=(profile:AccessProfile)=>modules.filter(m=>!m.permission||[m.permission,...(m.alsoPermissions??[])].some(p=>can(profile,p)));
/** La web se abre solo si la cuenta tiene algún módulo de trabajo (con permiso) visible. */
export const hasWebModule=(profile:AccessProfile)=>visibleModules(profile).some(m=>m.permission);
const readRoute=()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'inicio';
function HospitalClock(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{let timer:number;const tick=()=>{setNow(new Date());timer=window.setTimeout(tick,1000);};timer=window.setTimeout(tick,1000);return()=>window.clearTimeout(timer);},[]);
 const time=new Intl.DateTimeFormat('es-SV',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,hourCycle:'h23',timeZone:'America/El_Salvador'}).format(now).replace(/^24:/,'00:');
 const date=new Intl.DateTimeFormat('es-SV',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'America/El_Salvador'}).format(now);
 return <div className="hospital-clock" aria-label={`Hora actual ${time}, ${date}`}><Icon name="calendar" size={18}/><div><time className="hospital-clock-time" dateTime={now.toISOString()}>{time}</time><span className="hospital-clock-date">{date}</span></div></div>;
}
export function HospitalShell({api,profile,version=0,connection='live',onLogout,onChangePassword}:{api:Api;profile:AccessProfile;version?:number;connection?:'live'|'offline'|'reconnecting';onLogout:()=>void;onChangePassword?:(current:string,next:string)=>Promise<string|null>}){
 const [route,setRoute]=useState(readRoute),[navOpen,setNavOpen]=useState(false),[mobileNav,setMobileNav]=useState(false),menu=visibleModules(profile),roleLabel=profile.roles.map(r=>roleNames[r]??r).join(' · ');
 const navRef=useRef<HTMLElement>(null),toggleRef=useRef<HTMLButtonElement>(null);
 // Una ruta de la sesión anterior (o escrita a mano) que esta cuenta no ve vuelve a Inicio: nunca queda una pantalla «Sin permiso» fuera del menú.
 const menuIds=menu.map(m=>m.id).join('|');
 useLayoutEffect(()=>{const current=readRoute();if(modules.some(m=>m.id===current)&&!menuIds.split('|').includes(current)){history.replaceState(null,'','#/inicio');setRoute('inicio');}},[menuIds]);
 useEffect(()=>{const handle=()=>{setRoute(readRoute());setNavOpen(false);};window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[]);
 useEffect(()=>{if(!window.matchMedia)return;const media=window.matchMedia('(max-width: 767px)'),sync=()=>setMobileNav(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 useEffect(()=>{
  if(!navOpen)return;
  const nav=navRef.current,focusable=nav?[...nav.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')]:[];
  focusable[0]?.focus();
  const handleKey=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setNavOpen(false);toggleRef.current?.focus();return;}
   if(event.key!=='Tab'||focusable.length===0)return;
   const first=focusable[0],last=focusable[focusable.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',handleKey);return()=>document.removeEventListener('keydown',handleKey);
 },[navOpen]);
 if(!hasWebModule(profile))return <StatusView title="Tu rol no usa esta aplicación" detail="Tu cuenta no tiene módulos habilitados en la web. Ingresa desde la aplicación que corresponde a tu función." action="Cerrar sesión" onAction={onLogout}/>;
 const active=menu.find(m=>m.id===route);
 let content:ReactNode;
 if(!modules.some(m=>m.id===route))content=<><Heading eyebrow="CLIMESA" title="Página no encontrada" description="La dirección que abriste no corresponde a ninguna sección del sistema."/><a href="#/inicio" className="secondary-button">Volver al inicio</a></>;
 else if(!active)content=<><Heading eyebrow="Acceso restringido" title="Sin permiso" description="Esta sección no corresponde a los permisos de tu cuenta."/><a href="#/inicio" className="secondary-button">Volver al inicio</a></>;
 else if(route==='inicio')content=<Dashboard api={api} profile={profile} version={version}/>;
 else if(route==='pacientes')content=<PatientsPage api={api} profile={profile} version={version}/>;
 else if(route==='personal')content=<PersonnelPage api={api} profile={profile} version={version}/>;
 else if(route==='turnos')content=<ShiftsPage api={api} profile={profile} version={version}/>;
 else if(route==='espacios')content=<SpacesPage api={api} profile={profile} version={version}/>;
 else if(route==='camas')content=<BedsPage api={api} profile={profile} version={version}/>;
 else if(route==='ambulancia')content=<AmbulancePage api={api} profile={profile} version={version}/>;
 else if(route==='bitacora-ambulancia')content=<AmbulanceLogPage api={api} version={version}/>;
 else if(route==='usuarios')content=<UsersPage api={api} profile={profile} version={version}/>;
 else if(route==='vinculaciones')content=<AccountLinksPage api={api} profile={profile} version={version}/>;
 else if(route==='citas')content=<AppointmentsPage api={api} profile={profile} version={version}/>;
 else if(route==='consultas')content=<ConsultationsPage api={api} profile={profile} version={version}/>;
 else if(route==='fila')content=<QueuePage api={api} profile={profile} version={version}/>;
 else if(route==='laboratorio')content=<LaboratoryPage api={api} profile={profile} version={version}/>;
 else if(route==='inventario')content=<InventoryPage api={api} profile={profile} version={version}/>;
 else if(route==='hospitalizacion')content=<HospitalizationPage api={api} profile={profile} version={version}/>;
 else if(route==='avisos')content=<NoticesPage api={api} profile={profile} version={version}/>;
 else if(route==='metricas')content=<MetricsPage api={api} profile={profile} version={version}/>;
 else if(route==='auditoria')content=<AuditPage api={api} version={version}/>;
 else if(route==='perfil')content=<ProfilePage profile={profile} onLogout={onLogout} onChangePassword={onChangePassword}/>;
 else content=<><Heading eyebrow={`CLIMESA / ${active.label}`} title={active.label} description="Espacio de trabajo del módulo."/><div className="future-module" role="status"><span className="eyebrow">Sin operaciones disponibles</span><h2>Este módulo no tiene operaciones habilitadas.</h2><p>Tu cuenta tiene acceso a esta sección, pero el sistema todavía no ofrece sus operaciones. Mientras tanto, no hay datos que mostrar.</p><a href="#/inicio" className="row-action">Volver al inicio <Icon name="arrow" size={18}/></a></div></>;
 return <div className={`hospital-shell${navOpen?' nav-open':''}`}>
  <a href="#main-content" className="skip-link">Ir al contenido</a>
  <header className="hospital-header">
   <div className="hospital-header-inner">
    <button ref={toggleRef} className="nav-toggle" type="button" aria-label={navOpen?'Cerrar navegación':'Abrir navegación'} aria-expanded={navOpen} aria-controls="primary-navigation" onClick={()=>setNavOpen(open=>!open)}><Icon name={navOpen?'close':'menu'} size={22}/></button>
    <Brand light/>
    <div className="workspace-role"><span>{roleLabel}</span><span className="mono-label">HOSPITAL UNIVERSITARIO</span></div><HospitalClock />
    <details className="account-menu"><summary aria-label="Opciones de cuenta"><span className="account-avatar">{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><span className="account-menu-label">Mi cuenta</span><span aria-hidden="true">⌄</span></summary><div className="account-popover"><span>Sesión iniciada</span><strong>{profile.email}</strong><a href="#/perfil">Ver mi cuenta</a><button onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></div></details>
   </div>
  </header>
  <div className="hospital-frame">
   <nav ref={navRef} id="primary-navigation" className={`module-nav shell-sidebar${navOpen?' is-open':''}`} aria-label="Navegación principal" aria-hidden={mobileNav&&!navOpen||undefined}>
    <div className="sidebar-heading"><span className="mono-label">ESPACIO DE TRABAJO</span><strong>CLIMESA</strong></div>
    {menu.map(m=><a href={`#/${m.id}`} key={m.id} aria-label={m.label} title={m.label} aria-current={route===m.id?'page':undefined} tabIndex={mobileNav&&!navOpen?-1:undefined} onClick={()=>setNavOpen(false)}><span className="module-icon" aria-hidden="true"><Icon name={moduleIcons[m.id]??'grid'} size={20}/></span><span className="module-label">{m.label}</span>{m.future&&<span className="module-future" aria-hidden="true"/>}</a>)}
   </nav>
   {navOpen&&<button className="nav-backdrop" type="button" aria-label="Cerrar panel de navegación" onClick={()=>{setNavOpen(false);toggleRef.current?.focus();}}/>}
   <div className="hospital-workspace">
    {connection!=='live'&&<div role="status" className={`connection-band connection-${connection}`}><Icon name="info" size={16}/>{connection==='offline'?'Sin conexión. No se pueden guardar cambios.':'Recuperando la conexión…'}</div>}
    <main id="main-content" className="hospital-main" key={route}>{content}</main>
    <footer className="hospital-footer"><Brand/><span>Hospital universitario CLIMESA</span><span><Icon name="lock" size={13}/>Acceso personal</span></footer>
   </div>
  </div>
 </div>;
}
function ProfilePage({profile,onLogout,onChangePassword}:{profile:AccessProfile;onLogout:()=>void;onChangePassword?:(current:string,next:string)=>Promise<string|null>}){return <><Heading eyebrow="CLIMESA / Cuenta personal" title="Mi cuenta" description="Tu identidad y acceso dentro del hospital."/><section className="profile-sheet"><div className="profile-identity"><span>{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><div><h2>{profile.name||'Cuenta de CLIMESA'}</h2><p>{profile.email}</p></div></div><dl className="detail-grid"><div><dt>Estado</dt><dd><Tag value="activo"/></dd></div><div><dt>Plataformas habilitadas</dt><dd>{profile.platforms.map(p=>({web:'Web',android:'Android',ios:'iOS'} as Record<string,string>)[p]??p).join(' · ')}</dd></div><div className="full-width"><dt>Roles asignados</dt><dd>{profile.roles.map(r=>roleNames[r]??r).join(' · ')}</dd></div></dl><div className="profile-security"><Icon name="lock" size={20}/><p>Tu contraseña es personal. El administrador gestiona tus roles, sin conocerla.</p></div>{onChangePassword&&<ChangePasswordForm onChange={onChangePassword}/>}<button className="secondary-button" onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></section></>;}
