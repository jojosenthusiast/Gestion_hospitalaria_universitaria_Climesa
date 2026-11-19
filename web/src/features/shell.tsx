import { NoticesBell } from './avisos/NoticesBell';
import { Component,lazy,Suspense,useEffect,useLayoutEffect,useRef,useState,type ComponentType,type ReactNode } from 'react';
import { Brand,Icon,StatusView,type IconName } from '../components/ui';
import { Skeleton } from '../components/system';
import { can,roleNames,type AccessProfile,type Api } from '../lib/api';
import { CompactHeader,Tag } from './common';
import { ChangePasswordForm } from './password';
import { Dashboard } from './dashboards';
/**
 * Fase 2, S3: división de código por ruta. Inicio (la primera pantalla tras el ingreso) va en el paquete principal;
 * cada otro módulo es un archivo aparte. Para que abrir un módulo no espere su descarga, el armazón descarga en
 * segundo plano, una sola vez, el código de los módulos que la cuenta ve (`preloadModules`).
 */
const loaders={
 patients:()=>import('./patients'),personnel:()=>import('./personnel'),spaces:()=>import('./spaces'),ambulance:()=>import('./ambulance'),
 ambulanceLog:()=>import('./ambulance-log'),appointments:()=>import('./appointments'),consultations:()=>import('./consultations'),history:()=>import('./clinical-history'),
 queue:()=>import('./queue'),laboratory:()=>import('./laboratory'),labCatalog:()=>import('./lab-catalog'),inventory:()=>import('./inventory'),
 hospitalization:()=>import('./hospitalization'),privacy:()=>import('./privacy'),
 notices:()=>import('./notices'),metrics:()=>import('./metrics'),
};
type LoaderId=keyof typeof loaders;
const moduleCode:Record<string,LoaderId>={pacientes:'patients',personal:'personnel',turnos:'personnel',camas:'spaces',espacios:'spaces',ambulancia:'ambulance','bitacora-ambulancia':'ambulanceLog',auditoria:'privacy',laboratorio:'laboratory','catalogo-laboratorio':'labCatalog',inventario:'inventory',hospitalizacion:'hospitalization',fila:'queue',citas:'appointments',consultas:'consultations',historial:'history',avisos:'notices',metricas:'metrics'};
type Loaded={[I in LoaderId]:Awaited<ReturnType<(typeof loaders)[I]>>};
const warmers:Partial<Record<LoaderId,(()=>Promise<void>)[]>>={};
/**
 * Un módulo con carga diferida. Si su código ya llegó (por la precarga), se pinta directo, sin pasar por Suspense:
 * React mantiene un respaldo de Suspense ya mostrado unos 300 ms, y eso retrasaba la lectura de datos del módulo.
 * La elección se hace al montar, para que un módulo abierto nunca cambie de componente y pierda su estado.
 */
function page<I extends LoaderId,P extends object>(id:I,pick:(module:Loaded[I])=>ComponentType<P>){
 let ready:ComponentType<P>|null=null;
 const load=()=>(loaders[id]() as Promise<Loaded[I]>).then(m=>{ready=pick(m);return ready;});
 const list:(()=>Promise<void>)[]=warmers[id as LoaderId]??=[];list.push(()=>load().then(()=>undefined));
 // React memoizes a rejected lazy import: after a failed download a new lazy is made, so "Reintentar" downloads again.
 const deferred=():ComponentType<P>=>lazy(()=>load().then(component=>({default:component})).catch(error=>{Deferred=deferred();throw error;})) as unknown as ComponentType<P>;
 let Deferred=deferred();
 return function ModulePage(props:P){const [Loaded]=useState(()=>ready);const [Current]=useState(()=>Deferred);return Loaded?<Loaded {...props}/>:<Current {...props}/>;};
}
const PatientsPage=page('patients',m=>m.PatientsPage);
const PersonnelPage=page('personnel',m=>m.PersonnelPage);
const ShiftsPage=page('personnel',m=>m.ShiftsPage);
const BedsPage=page('spaces',m=>m.BedsPage);
const SpacesPage=page('spaces',m=>m.SpacesPage);
const AmbulancePage=page('ambulance',m=>m.AmbulancePage);
const AmbulanceLogPage=page('ambulanceLog',m=>m.AmbulanceLogPage);
const AppointmentsPage=page('appointments',m=>m.AppointmentsPage);
const ConsultationsPage=page('consultations',m=>m.ConsultationsPage);
const MyHistoryPage=page('history',m=>m.MyHistoryPage);
const QueuePage=page('queue',m=>m.QueuePage);
const LaboratoryPage=page('laboratory',m=>m.LaboratoryPage);
const LabCatalogPage=page('labCatalog',m=>m.LabCatalogPage);
const InventoryPage=page('inventory',m=>m.InventoryPage);
const HospitalizationPage=page('hospitalization',m=>m.HospitalizationPage);
const AuditPage=page('privacy',m=>m.AuditPage);
const NoticesPage=page('notices',m=>m.NoticesPage);
const MetricsPage=page('metrics',m=>m.MetricsPage);
/** Descarga el código de los módulos visibles cuando el navegador queda libre. Es una sola vez por sesión, no un sondeo. */
export function preloadModules(ids:string[]){const wanted=[...new Set(ids.map(id=>moduleCode[id]).filter((id):id is LoaderId=>!!id))];for(const id of wanted)for(const warm of warmers[id]??[])void warm().catch(()=>undefined);}
/**
 * A module whose code or render failed (for example a tab left open across a deploy that replaced the files) shows a
 * notice in the content area; the navigation stays usable. "Reintentar" mounts the module again; "Recargar la página"
 * brings the current files.
 */
class ModuleBoundary extends Component<{label:string;children:ReactNode},{failed:boolean;attempt:number}>{
 state={failed:false,attempt:0};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:unknown){console.error(error);}
 render(){
  if(!this.state.failed)return <Suspense key={this.state.attempt} fallback={<ModuleFallback label={this.props.label}/>}>{this.props.children}</Suspense>;
  return <><CompactHeader title={this.props.label}/><div className="notice notice-error" role="alert"><p><strong>No se pudo abrir este módulo.</strong> Revisa tu conexión. Si el sistema se actualizó, recarga la página.</p><div className="row-actions"><button type="button" className="secondary-button" onClick={()=>this.setState(s=>({failed:false,attempt:s.attempt+1}))}>Reintentar</button><button type="button" className="primary-button" onClick={()=>window.location.reload()}>Recargar la página</button></div></div></>;
 }
}
/** Lo que se ve mientras llega el código de un módulo: la barra y el contenido reservan su lugar. */
function ModuleFallback({label}:{label:string}){return <><CompactHeader title={label}/><Skeleton rows={6} label={`Cargando ${label.toLowerCase()}…`}/></>;}
/** El menú depende solo del permiso (regla 8): sin `permission` el módulo es de toda cuenta con sesión; `alsoPermissions` abre el mismo módulo a otros permisos. */
/** `replacedBy`: the module hides when the account also sees that one (obs. 17: Edificio replaces Camas); its deep links go there. */
/** `context`: the module needs that context of the permission (S19: «Mi historial» is `expediente.ver` in `propio_revisado`, the patient's own record). */
export type Module={id:string;label:string;permission?:string;context?:string;alsoPermissions?:string[];future?:boolean;replacedBy?:string};
export const modules:Module[]=[
 {id:'inicio',label:'Inicio'},
 {id:'pacientes',label:'Pacientes',permission:'pacientes.buscar'},
 {id:'personal',label:'Personal',permission:'personal.ver',alsoPermissions:['usuarios.ver']},
 {id:'camas',label:'Camas',permission:'camas.ver_tablero',replacedBy:'espacios'},
 {id:'espacios',label:'Edificio',permission:'espacios.ver'},
 {id:'ambulancia',label:'Ambulancia',permission:'ambulancia.ver_estado'},
 {id:'bitacora-ambulancia',label:'Bitácora de ambulancia',permission:'ambulancia.ver_bitacora'},
 {id:'turnos',label:'Turnos',permission:'turnos.ver'},
 {id:'auditoria',label:'Auditoría',permission:'auditoria.ver'},
 {id:'laboratorio',label:'Laboratorio',permission:'laboratorio.ver_cola',alsoPermissions:['laboratorio.ordenar']},
 {id:'catalogo-laboratorio',label:'Catálogo de laboratorio',permission:'catalogo.configurar'},
 {id:'inventario',label:'Inventario',permission:'inventario.ver'},
 {id:'hospitalizacion',label:'Hospitalización',permission:'admision.ver',alsoPermissions:['admision.crear']},
 {id:'fila',label:'Fila del día',permission:'fila.ver'},
 {id:'citas',label:'Citas',permission:'citas.ver'},
 {id:'consultas',label:'Mi consultorio',permission:'consulta.iniciar'},
 {id:'historial',label:'Mi historial',permission:'expediente.ver',context:'propio_revisado'},
 // S11: Avisos es de toda cuenta con sesión (bandeja «Para mí»); publicar, editar y retirar siguen con avisos.publicar.
 {id:'avisos',label:'Avisos'},
 {id:'metricas',label:'Métricas',permission:'metricas.ver'},
 {id:'perfil',label:'Perfil'},
];
export const moduleIcons:Record<string,IconName>={inicio:'home',pacientes:'users',personal:'user',camas:'bed',espacios:'building',ambulancia:'ambulance','bitacora-ambulancia':'clipboard',turnos:'calendar',usuarios:'shield',auditoria:'audit',laboratorio:'lab','catalogo-laboratorio':'lab',inventario:'inventory',hospitalizacion:'pulse',fila:'queue',citas:'calendar',consultas:'calendar',historial:'clipboard',perfil:'user',avisos:'info',metricas:'grid'};
/** Módulos que la cuenta ve: Inicio y Perfil siempre, el resto según el permiso del catálogo. */
const allowed=(profile:AccessProfile,m:Module)=>!m.permission||(m.context?profile.permissions.some(p=>p.code===m.permission&&p.context===m.context):[m.permission,...(m.alsoPermissions??[])].some(p=>can(profile,p)));
export const visibleModules=(profile:AccessProfile)=>modules.filter(m=>{if(!allowed(profile,m))return false;const replacement=m.replacedBy&&modules.find(x=>x.id===m.replacedBy);return !(replacement&&allowed(profile,replacement));});
/** La web se abre solo si la cuenta tiene algún módulo de trabajo (con permiso) visible. */
export const hasWebModule=(profile:AccessProfile)=>visibleModules(profile).some(m=>m.permission);
const readRoute=()=>location.hash.replace(/^#\/?/,'').split('?')[0]||'inicio';
/** Owner batch 1 (S2): the hospital clock, live: time with seconds over weekday, day and month (El Salvador time). */
function HospitalDate(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{let timer:number;const tick=()=>{setNow(new Date());timer=window.setTimeout(tick,1000-(Date.now()%1000));};timer=window.setTimeout(tick,1000-(Date.now()%1000));return()=>window.clearTimeout(timer);},[]);
 const zone='America/El_Salvador';
 const time=new Intl.DateTimeFormat('es-SV',{hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:zone}).format(now);
 const date=new Intl.DateTimeFormat('es-SV',{weekday:'long',day:'numeric',month:'long',timeZone:zone}).format(now);
 return <time className="topbar-date topbar-clock" dateTime={now.toISOString()} aria-label={`${date}, ${time}`}><strong>{time}</strong><span>{date}</span></time>;
}
export function HospitalShell({api,profile,version=0,connection='live',onLogout,onChangePassword}:{api:Api;profile:AccessProfile;version?:number;connection?:'live'|'offline'|'reconnecting';onLogout:()=>void;onChangePassword?:(current:string,next:string)=>Promise<string|null>}){
 const [route,setRoute]=useState(readRoute),[navOpen,setNavOpen]=useState(false),[mobileNav,setMobileNav]=useState(false),menu=visibleModules(profile),roleLabel=profile.roles.map(r=>roleNames[r]??r).join(' · ');
 const navRef=useRef<HTMLElement>(null),toggleRef=useRef<HTMLButtonElement>(null);
 // Una ruta de la sesión anterior (o escrita a mano) que esta cuenta no ve vuelve a Inicio: nunca queda una pantalla «Sin permiso» fuera del menú.
 const menuIds=menu.map(m=>m.id).join('|');
 useLayoutEffect(()=>{
  const current=readRoute(),ids=menuIds.split('|');
  if(!modules.some(m=>m.id===current)||ids.includes(current))return;
  // Obs. 17: a link to a replaced module (#/camas) opens its replacement (#/espacios) with the same query.
  const replacement=modules.find(m=>m.id===current)?.replacedBy,target=replacement&&ids.includes(replacement)?replacement:'inicio';
  const query=target==='inicio'?'':location.hash.split('?').slice(1).join('?');
  history.replaceState(null,'',`#/${target}${query?`?${query}`:''}`);setRoute(target);
 },[menuIds,route]);
 useEffect(()=>{try{window.scrollTo(0,0);document.getElementById('main-content')?.scrollTo?.(0,0);}catch{/* jsdom has no scrolling */}},[route]);
 useEffect(()=>{const handle=()=>{setRoute(readRoute());setNavOpen(false);};window.addEventListener('hashchange',handle);return()=>window.removeEventListener('hashchange',handle);},[]);
 // S3: con el armazón ya pintado, se descarga en segundo plano el código de los módulos del menú (una vez).
 useEffect(()=>{const ids=menuIds.split('|'),run=()=>preloadModules(ids);if(typeof window.requestIdleCallback==='function'){const handle=window.requestIdleCallback(run,{timeout:2000});return()=>window.cancelIdleCallback(handle);}const timer=window.setTimeout(run,300);return()=>window.clearTimeout(timer);},[menuIds]);
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
 if(!modules.some(m=>m.id===route))content=<><CompactHeader breadcrumb="CLIMESA" title="Página no encontrada"/><p className="module-message">La dirección que abriste no corresponde a ninguna sección del sistema.</p><a href="#/inicio" className="secondary-button">Volver al inicio</a></>;
 else if(!active)content=<><CompactHeader breadcrumb="Acceso restringido" title="Sin permiso"/><p className="module-message">Esta sección no corresponde a los permisos de tu cuenta.</p><a href="#/inicio" className="secondary-button">Volver al inicio</a></>;
 else if(route==='inicio')content=<Dashboard api={api} profile={profile} version={version}/>;
 else if(route==='pacientes')content=<PatientsPage api={api} profile={profile} version={version}/>;
 else if(route==='personal')content=<PersonnelPage api={api} profile={profile} version={version}/>;
 else if(route==='turnos')content=<ShiftsPage api={api} profile={profile} version={version}/>;
 else if(route==='espacios')content=<SpacesPage api={api} profile={profile} version={version}/>;
 else if(route==='camas')content=<BedsPage api={api} profile={profile} version={version}/>;
 else if(route==='ambulancia')content=<AmbulancePage api={api} profile={profile} version={version}/>;
 else if(route==='bitacora-ambulancia')content=<AmbulanceLogPage api={api} version={version}/>;
 else if(route==='citas')content=<AppointmentsPage api={api} profile={profile} version={version}/>;
 else if(route==='consultas')content=<ConsultationsPage api={api} profile={profile} version={version}/>;
 else if(route==='historial')content=<MyHistoryPage api={api} profile={profile} version={version}/>;
 else if(route==='fila')content=<QueuePage api={api} profile={profile} version={version}/>;
 else if(route==='laboratorio')content=<LaboratoryPage api={api} profile={profile} version={version}/>;
 else if(route==='catalogo-laboratorio')content=<LabCatalogPage api={api} profile={profile} version={version}/>;
 else if(route==='inventario')content=<InventoryPage api={api} profile={profile} version={version}/>;
 else if(route==='hospitalizacion')content=<HospitalizationPage api={api} profile={profile} version={version}/>;
 else if(route==='avisos')content=<NoticesPage api={api} profile={profile} version={version}/>;
 else if(route==='metricas')content=<MetricsPage api={api} profile={profile} version={version}/>;
 else if(route==='auditoria')content=<AuditPage api={api} version={version}/>;
 else if(route==='perfil')content=<ProfilePage profile={profile} onLogout={onLogout} onChangePassword={onChangePassword}/>;
 else content=<><CompactHeader breadcrumb={`CLIMESA / ${active.label}`} title={active.label}/><div className="future-module" role="status"><span className="eyebrow">Sin operaciones disponibles</span><h2>Este módulo no tiene operaciones habilitadas.</h2><p>Tu cuenta tiene acceso a esta sección, pero el sistema todavía no ofrece sus operaciones. Mientras tanto, no hay datos que mostrar.</p><a href="#/inicio" className="row-action">Volver al inicio <Icon name="arrow" size={18}/></a></div></>;
 return <div className={`hospital-shell${navOpen?' nav-open':''}`}>
  <a href="#main-content" className="skip-link">Ir al contenido</a>
  <header className="hospital-header">
   <div className="hospital-header-inner">
    <button ref={toggleRef} className="nav-toggle" type="button" aria-label={navOpen?'Cerrar navegación':'Abrir navegación'} aria-expanded={navOpen} aria-controls="primary-navigation" onClick={()=>setNavOpen(open=>!open)}><Icon name={navOpen?'close':'menu'} size={22}/></button>
    <Brand light/>
    <div className="workspace-role"><span>{roleLabel}</span><span className="mono-label">HOSPITAL UNIVERSITARIO</span></div><HospitalDate />
    <NoticesBell api={api} version={version} current={route==='avisos'}/>
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
    {/* S3: sin `key` por ruta. Cada módulo es su propio componente y se monta solo; la caché de `useData` muestra al instante lo ya leído. */}
    <main id="main-content" className="hospital-main"><ModuleBoundary key={route} label={active?.label??'Módulo'}>{content}</ModuleBoundary></main>
    <footer className="hospital-footer"><Brand/><span>Hospital universitario CLIMESA</span><span><Icon name="lock" size={13}/>Acceso personal</span></footer>
   </div>
  </div>
 </div>;
}
function ProfilePage({profile,onLogout,onChangePassword}:{profile:AccessProfile;onLogout:()=>void;onChangePassword?:(current:string,next:string)=>Promise<string|null>}){return <><CompactHeader breadcrumb="CLIMESA / Cuenta personal" title="Mi cuenta"/><section className="profile-sheet"><div className="profile-identity"><span>{(profile.name||profile.email).slice(0,1).toUpperCase()}</span><div><h2>{profile.name||'Cuenta de CLIMESA'}</h2><p>{profile.email}</p></div></div><dl className="detail-grid"><div><dt>Estado</dt><dd><Tag value="activo"/></dd></div><div><dt>Plataformas habilitadas</dt><dd>{profile.platforms.map(p=>({web:'Web',android:'Android',ios:'iOS'} as Record<string,string>)[p]??p).join(' · ')}</dd></div><div className="full-width"><dt>Roles asignados</dt><dd>{profile.roles.map(r=>roleNames[r]??r).join(' · ')}</dd></div></dl><div className="profile-security"><Icon name="lock" size={20}/><p>Tu contraseña es personal. El administrador gestiona tus roles, sin conocerla.</p></div>{onChangePassword&&<ChangePasswordForm onChange={onChangePassword}/>}<button className="secondary-button" onClick={onLogout}><Icon name="logout" size={18}/>Cerrar sesión</button></section></>;}
