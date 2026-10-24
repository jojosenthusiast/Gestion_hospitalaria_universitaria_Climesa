import { useCallback,useEffect,useMemo,useState,type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { HttpApi,type AccessProfile } from './lib/api';
import { supabase } from './lib/supabase';
import { useLive } from './lib/live';
import { ActivationView,LoginView,RegistrationView,StatusView } from './components/ui';
import { HospitalShell } from './features/shell';
import './modules.css';
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[expired,setExpired]=useState(false);
 useEffect(()=>{if(!supabase){setReady(true);return;}let cancelled=false;void supabase.auth.getSession().then(({data})=>{if(!cancelled){setSession(data.session);setReady(true);}});const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setReady(true);});return()=>{cancelled=true;data.subscription.unsubscribe();};},[]);
 if(!supabase)return <StatusView title="Configura tu conexión" detail="Copia web/.env.example como web/.env y configura la conexión de CLIMESA antes de iniciar el portal."/>;
 if(location.pathname==='/aceptar-invitacion')return <AcceptInvitation/>;
 if(location.pathname==='/registro')return <Register/>;
 if(!ready)return <StatusView title="Comprobando tu sesión" detail="Estamos preparando tu espacio de trabajo."/>;
 if(!session)return <Login notice={expired?'Tu sesión se cerró por inactividad. Ingresa nuevamente.':undefined} onAttempt={()=>setExpired(false)}/>;
 return <Portal session={session} onExpired={()=>{setExpired(true);void supabase?.auth.signOut({scope:'local'});}}/>;
}
function Login({notice,onAttempt}:{notice?:string;onAttempt:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function submit(e:FormEvent){e.preventDefault();onAttempt();setBusy(true);setError(null);try{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)setError('Correo o contraseña incorrectos, o la cuenta todavía no está activa.');}catch{setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');}finally{setBusy(false);}}
 return <LoginView {...{email,password,setEmail,setPassword,busy,error,notice}} accepted={new URLSearchParams(location.search).get('invitacion')==='aceptada'} onSubmit={submit}/>;
}
function Portal({session,onExpired}:{session:Session;onExpired:()=>void}){
 const api=useMemo(()=>new HttpApi(async()=>{const {data}=await supabase!.auth.getSession();return data.session?.access_token??session.access_token;},()=>void supabase?.auth.signOut({scope:'local'})),[session.access_token]);
 const [profile,setProfile]=useState<AccessProfile|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true);
 const load=useCallback(()=>{setLoading(true);setError(null);void api.request<AccessProfile>('/auth/me').then(setProfile).catch(e=>setError(e instanceof Error?e.message:'No se pudo verificar el acceso.')).finally(()=>setLoading(false));},[api]);
 useEffect(load,[load]);
 if(loading&&!profile)return <StatusView title="Validando tu acceso" detail="Consultando los permisos vigentes de tu cuenta."/>;
 if(error||!profile)return <div><StatusView title="No pudimos validar el acceso" detail={error??'Intenta nuevamente.'} action="Volver a intentar" onAction={load}/><button className="access-logout" onClick={()=>void supabase?.auth.signOut({scope:'local'})}>Cerrar sesión</button></div>;
 if(!profile.platforms.includes('web'))return <StatusView title="Tu rol no usa esta aplicación" detail={`Tu cuenta está habilitada para ${profile.platforms.map(p=>p==='ios'?'iOS':'Android').join(' e ')}. Ingresa desde la aplicación correspondiente.`} action="Cerrar sesión" onAction={()=>void supabase?.auth.signOut({scope:'local'})}/>;
 return <LivePortal {...{api,profile,session,onExpired}} refreshProfile={load}/>;
}
function LivePortal({api,profile,session,onExpired,refreshProfile}:{api:HttpApi;profile:AccessProfile;session:Session;onExpired:()=>void;refreshProfile:()=>void}){
 const live=useLive(api,profile,session.access_token,refreshProfile);
 useEffect(()=>{let last=Date.now();const active=()=>{last=Date.now();};const events=['pointerdown','keydown','scroll'] as const;for(const e of events)window.addEventListener(e,active,{passive:true});const timer=setInterval(()=>{if(Date.now()-last>15*60*1000)onExpired();},30000);return()=>{clearInterval(timer);for(const e of events)window.removeEventListener(e,active);};},[onExpired]);
 return <HospitalShell api={api} profile={profile} version={live.version} connection={live.status} onLogout={()=>void supabase?.auth.signOut({scope:'local'})}/>;
}
function Register(){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[done,setDone]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(!strongPassword(password))return setError('Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo.');if(password!==confirmation)return setError('Las contraseñas no coinciden.');setBusy(true);setError(null);try{const result=await supabase!.auth.signUp({email:email.trim(),password,options:{data:{nombre:name.trim()},emailRedirectTo:location.origin}});if(result.error)setError('No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión.');else{if(result.data.session)await supabase!.auth.signOut({scope:'local'});setDone(true);}}catch{setError('No se pudo conectar. Intenta nuevamente.');}finally{setBusy(false);}}
 return <RegistrationView {...{name,email,password,confirmation,setName,setEmail,setPassword,setConfirmation,busy,error,done}} onSubmit={submit}/>;
}
const strongPassword=(s:string)=>s.length>=8&&/[a-z]/.test(s)&&/[A-Z]/.test(s)&&/\d/.test(s)&&/[^A-Za-z0-9]/.test(s);
function AcceptInvitation(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(new URLSearchParams(location.search).get('error_description'));
 useEffect(()=>{void supabase!.auth.getSession().then(({data})=>{setSession(data.session);setReady(true);});const {data}=supabase!.auth.onAuthStateChange((_event,next)=>{setSession(next);setReady(true);});return()=>data.subscription.unsubscribe();},[]);
 async function submit(e:FormEvent){e.preventDefault();if(!strongPassword(password))return setError('Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo.');if(password!==confirmation)return setError('Las contraseñas no coinciden.');setBusy(true);setError(null);try{const {error}=await supabase!.auth.updateUser({password});if(error){setError('No se pudo activar la cuenta. Revisa el enlace de invitación.');return;}await supabase!.auth.signOut({scope:'local'});location.assign('/?invitacion=aceptada');}finally{setBusy(false);}}
 return <ActivationView {...{ready,password,confirmation,setPassword,setConfirmation,busy,error}} email={session?.user.email} onSubmit={submit}/>;
}
