import { useCallback,useEffect,useMemo,useRef,useState,type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccessProfile } from './lib/api';
import { IntentApi } from './features/intent';
import { LiveContext } from './features/live-scope';
import { SessionExpiryWarning,useIdleSession } from './features/session';
import { supabase } from './lib/supabase';
import { demoAccounts } from './lib/demoLogin';
import { useLive } from './lib/live';
import { LoginView,RegistrationView,StatusView } from './components/ui';
import { HospitalShell } from './features/shell';
import { PublicScreen } from './features/public-screen';
import { PasswordRecoveryView,strongPassword } from './features/password';
import { ConfirmEmail,LANDING_PATHS,PlatformGuidanceScreen,SetPasswordLanding } from './features/auth-landing';
import './modules.css';
/** La ruta del hash pertenece a la sesión: al salir se limpia para que la siguiente cuenta no herede una sección ajena (obs. 15). */
const resetRoute=()=>{if(location.hash)history.replaceState(null,'',location.pathname+location.search);};
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[expired,setExpired]=useState(false);
 useEffect(()=>{if(!supabase){setReady(true);return;}let cancelled=false;void supabase.auth.getSession().then(({data})=>{if(!cancelled){setSession(data.session);setReady(true);}});const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setReady(true);});return()=>{cancelled=true;data.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(ready&&!session)resetRoute();},[ready,session]);
 // W34: la pantalla pública no usa sesión; sin Supabase solo pierde el tiempo real.
 if(location.pathname==='/publico')return <PublicScreen/>;
 if(!supabase)return <StatusView title="Configura tu conexión" detail="Copia web/.env.example como web/.env y configura la conexión de CLIMESA antes de iniciar el portal."/>;
 // E-mail landing pages (docs/operacion/correo-auth.md): every platform's Supabase links redirect to these web paths.
 if(location.pathname===LANDING_PATHS.confirm)return <ConfirmEmail/>;
 if(location.pathname===LANDING_PATHS.invite)return <SetPasswordLanding/>;
 if(location.pathname==='/registro')return <Register/>;
 // WEB-13: the recovery e-mail links to /restablecer (Supabase redirect URL, owner setting).
 if(location.pathname==='/recuperar')return <PasswordRecoveryView onRequest={async email=>{await supabase!.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${LANDING_PATHS.reset}`});}}/>;
 if(location.pathname===LANDING_PATHS.reset)return <SetPasswordLanding reset/>;
 if(!ready)return <StatusView title="Comprobando tu sesión" detail="Estamos preparando tu espacio de trabajo."/>;
 if(!session)return <Login notice={expired?'Tu sesión se cerró por inactividad. Ingresa nuevamente.':new URLSearchParams(location.search).get('contrasena')==='actualizada'?'Contraseña actualizada. Ingresa con tu nueva contraseña.':undefined} onAttempt={()=>setExpired(false)}/>;
 return <Portal session={session} onExpired={()=>{setExpired(true);void supabase?.auth.signOut({scope:'local'});}}/>;
}
function Login({notice,onAttempt}:{notice?:string;onAttempt:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 async function submit(e:FormEvent){e.preventDefault();onAttempt();setBusy(true);setError(null);try{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)setError('Correo o contraseña incorrectos, o la cuenta todavía no está activa.');}catch{setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');}finally{setBusy(false);}}
 return <LoginView {...{email,password,setEmail,setPassword,busy,error,notice,demoAccounts}} accepted={new URLSearchParams(location.search).get('invitacion')==='aceptada'} onSubmit={submit}/>;
}
function Portal({session,onExpired}:{session:Session;onExpired:()=>void}){
 // WEB-10: one client per session. The token is read on every request, so a renewed token does not
 // recreate the client: pending intent keys survive and the views do not all reload on renewal.
 const token=useRef(session.access_token);token.current=session.access_token;
 const api=useMemo(()=>new IntentApi(async()=>{const {data}=await supabase!.auth.getSession();return data.session?.access_token??token.current;},()=>void supabase?.auth.signOut({scope:'local'})),[]);
 const [profile,setProfile]=useState<AccessProfile|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true);
 const load=useCallback(()=>{setLoading(true);setError(null);void api.request<AccessProfile>('/auth/me').then(setProfile).catch(e=>setError(e instanceof Error?e.message:'No se pudo verificar el acceso.')).finally(()=>setLoading(false));},[api]);
 useEffect(load,[load]);
 if(loading&&!profile)return <StatusView title="Validando tu acceso" detail="Consultando los permisos vigentes de tu cuenta."/>;
 if(error||!profile)return <div><StatusView title="No pudimos validar el acceso" detail={error??'Intenta nuevamente.'} action="Volver a intentar" onAction={load}/><button className="access-logout" onClick={()=>void supabase?.auth.signOut({scope:'local'})}>Cerrar sesión</button></div>;
 if(!profile.platforms.includes('web'))return <PlatformGuidanceScreen profile={profile} title="Tu rol no usa esta aplicación" action={{label:'Cerrar sesión',onClick:()=>void supabase?.auth.signOut({scope:'local'})}}/>;
 return <LivePortal {...{api,profile,session,onExpired}} refreshProfile={load}/>;
}
function LivePortal({api,profile,session,onExpired,refreshProfile}:{api:IntentApi;profile:AccessProfile;session:Session;onExpired:()=>void;refreshProfile:()=>void}){
 const live=useLive(api,profile,session.access_token,refreshProfile);
 const idle=useIdleSession(onExpired),logout=()=>{resetRoute();void supabase?.auth.signOut({scope:'local'});};
 return <LiveContext.Provider value={live.signal}><HospitalShell api={api} profile={profile} version={live.version} connection={live.status} onLogout={logout} onChangePassword={changePassword(profile.email)}/><SessionExpiryWarning remaining={idle.remaining} onContinue={idle.keepAlive} onLogout={logout}/></LiveContext.Provider>;
}
/** W35 (WEB-13): the current password is checked by signing in again; then Supabase stores the new one. */
const changePassword=(email:string)=>async(current:string,next:string):Promise<string|null>=>{
 const check=await supabase!.auth.signInWithPassword({email,password:current});
 if(check.error)return 'La contraseña actual no es correcta.';
 const {error}=await supabase!.auth.updateUser({password:next});
 if(!error)return null;
 if(error.code==='same_password')return 'La nueva contraseña debe ser distinta de la actual.';
 if(error.code==='reauthentication_needed')return 'Por seguridad, cierra sesión y usa «¿Olvidaste tu contraseña?» para cambiarla.';
 return 'No se pudo cambiar la contraseña. Intenta nuevamente.';
};
function Register(){
 const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[done,setDone]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();if(!strongPassword(password))return setError('Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo.');if(password!==confirmation)return setError('Las contraseñas no coinciden.');setBusy(true);setError(null);try{const result=await supabase!.auth.signUp({email:email.trim(),password,options:{data:{nombre:name.trim()},emailRedirectTo:`${location.origin}${LANDING_PATHS.confirm}`}});if(result.error)setError('No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión.');else{if(result.data.session)await supabase!.auth.signOut({scope:'local'});setDone(true);}}catch{setError('No se pudo conectar. Intenta nuevamente.');}finally{setBusy(false);}}
 return <RegistrationView {...{name,email,password,confirmation,setName,setEmail,setPassword,setConfirmation,busy,error,done}} onSubmit={submit}/>;
}
