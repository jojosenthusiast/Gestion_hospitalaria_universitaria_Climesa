import { useCallback,useEffect,useMemo,useRef,useState,type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { AccessProfile } from './lib/api';
import { IntentApi } from './features/intent';
import { LiveContext } from './features/live-scope';
import { SessionExpiryWarning,useIdleSession } from './features/session';
import { supabase } from './lib/supabase';
import { demoAccounts } from './lib/demoLogin';
import { useLive } from './lib/live';
import { retryColdStart,SLOW_SERVER_MESSAGE,warmUpApi } from './lib/cold-start';
import { renewOnce } from './lib/session-renewal';
import { registerExportAuditor } from './lib/export';
import { LoginView,PatientSignupInfoView,StatusView } from './components/ui';
import { HospitalShell } from './features/shell';
import { PublicScreen } from './features/public-screen';
import { PasswordRecoveryView } from './features/password';
import { ConfirmEmail,LANDING_PATHS,PlatformGuidanceScreen,SetPasswordLanding } from './features/auth-landing';
import './modules.css';
/**
 * Fase 2, S3: una sola pantalla de arranque. Comprobar la sesión y validar los permisos se ven como un mismo paso,
 * con el mismo título, en lugar de dos pantallas completas seguidas. Si el servidor está despertando, lo dice.
 */
function StartupView({slow=false}:{slow?:boolean}){return <StatusView title="Abriendo tu espacio de trabajo" detail={slow?SLOW_SERVER_MESSAGE:'Comprobando tu sesión y los permisos de tu cuenta.'}/>;}
/** La ruta del hash pertenece a la sesión: al salir se limpia para que la siguiente cuenta no herede una sección ajena (obs. 15). */
const resetRoute=()=>{if(location.hash)history.replaceState(null,'',location.pathname+location.search);};
export default function App(){
 const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[expired,setExpired]=useState<false|'idle'|'expired'>(false);
 useEffect(()=>{if(!supabase){setReady(true);return;}let cancelled=false;void supabase.auth.getSession().then(({data})=>{if(!cancelled){setSession(data.session);setReady(true);}});const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setReady(true);});return()=>{cancelled=true;data.subscription.unsubscribe();};},[]);
 useEffect(()=>{if(ready&&!session)resetRoute();},[ready,session]);
 // W34: la pantalla pública no usa sesión; sin Supabase solo pierde el tiempo real.
 if(location.pathname==='/publico')return <PublicScreen/>;
 if(!supabase)return <StatusView title="Configura tu conexión" detail="Copia web/.env.example como web/.env y configura la conexión de CLIMESA antes de iniciar el portal."/>;
 // E-mail landing pages (docs/operacion/correo-auth.md): every platform's Supabase links redirect to these web paths.
 if(location.pathname===LANDING_PATHS.confirm)return <ConfirmEmail/>;
 if(location.pathname===LANDING_PATHS.invite)return <SetPasswordLanding/>;
 // BL-06 (D-04): patient sign-up lives only in the mobile apps; old /registro links land on guidance.
 if(location.pathname==='/registro')return <PatientSignupInfoView/>;
 // WEB-13: the recovery e-mail links to /restablecer (Supabase redirect URL, owner setting).
 if(location.pathname==='/recuperar')return <PasswordRecoveryView onRequest={async email=>{await supabase!.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${LANDING_PATHS.reset}`});}}/>;
 if(location.pathname===LANDING_PATHS.reset)return <SetPasswordLanding reset/>;
 if(!ready)return <StartupView/>;
 if(!session)return <Login notice={expired==='idle'?'Tu sesión se cerró por inactividad. Ingresa nuevamente.':expired==='expired'?EXPIRED_NOTICE:new URLSearchParams(location.search).get('contrasena')==='actualizada'?'Contraseña actualizada. Ingresa con tu nueva contraseña.':undefined} onAttempt={()=>setExpired(false)}/>;
 return <Portal session={session} onExpired={(reason='idle')=>{setExpired(reason);void supabase?.auth.signOut({scope:'local'});}}/>;
}
function Login({notice,onAttempt}:{notice?:string;onAttempt:()=>void}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 // MA-OPS-01: wake the sleeping API while the person types, so the profile check after signing in answers quickly.
 useEffect(()=>{if(import.meta.env.PROD)warmUpApi();},[]);
 async function submit(e:FormEvent){e.preventDefault();onAttempt();setBusy(true);setError(null);try{const {error}=await supabase!.auth.signInWithPassword({email:email.trim(),password});if(error)setError('Correo o contraseña incorrectos, o la cuenta todavía no está activa.');}catch{setError('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');}finally{setBusy(false);}}
 return <LoginView {...{email,password,setEmail,setPassword,busy,error,notice,demoAccounts}} accepted={new URLSearchParams(location.search).get('invitacion')==='aceptada'} onSubmit={submit}/>;
}
const EXPIRED_NOTICE='Tu sesión expiró. Ingresa nuevamente.';
function Portal({session,onExpired}:{session:Session;onExpired:(reason?:'idle'|'expired')=>void}){
 // WEB-10: one client per session. The token is read on every request, so a renewed token does not
 // recreate the client: pending intent keys survive and the views do not all reload on renewal.
 const token=useRef(session.access_token);token.current=session.access_token;
 // A 401 first tries to renew the session once (shared by requests that fail together); only if that fails, or the API
 // rejects the renewed token too, the session ends with the expired-session notice.
 const expire=useRef(onExpired);expire.current=onExpired;
 const api=useMemo(()=>new IntentApi(async()=>{const {data}=await supabase!.auth.getSession();return data.session?.access_token??token.current;},renewOnce(()=>supabase!.auth.refreshSession().then(({data,error})=>!error&&!!data.session,()=>false),()=>expire.current('expired'))),[]);
 const [profile,setProfile]=useState<AccessProfile|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[slow,setSlow]=useState(false);
 // MA-OPS-01: /auth/me is usually the request that wakes the API; it is retried and, after 5 s, the screen says why it waits.
 const load=useCallback(()=>{setLoading(true);setError(null);setSlow(false);void retryColdStart(()=>api.request<AccessProfile>('/auth/me'),()=>setSlow(true)).then(setProfile).catch(e=>setError(e instanceof Error?e.message:'No se pudo verificar el acceso.')).finally(()=>{setLoading(false);setSlow(false);});},[api]);
 useEffect(load,[load]);
 if(loading&&!profile)return <StartupView slow={slow}/>;
 if(error||!profile)return <div><StatusView title="No pudimos validar el acceso" detail={error??'Intenta nuevamente.'} action="Volver a intentar" onAction={load}/><button className="access-logout" onClick={()=>void supabase?.auth.signOut({scope:'local'})}>Cerrar sesión</button></div>;
 if(!profile.platforms.includes('web'))return <PlatformGuidanceScreen profile={profile} title="Tu rol no usa esta aplicación" action={{label:'Cerrar sesión',onClick:()=>void supabase?.auth.signOut({scope:'local'})}}/>;
 return <LivePortal {...{api,profile,session,onExpired}} refreshProfile={load}/>;
}
function LivePortal({api,profile,session,onExpired,refreshProfile}:{api:IntentApi;profile:AccessProfile;session:Session;onExpired:()=>void;refreshProfile:()=>void}){
 // MA-SEG-05: every list export is recorded in the API audit before the file is saved.
 useEffect(()=>{registerExportAuditor(entry=>api.write('/exportaciones',entry));return()=>registerExportAuditor(null);},[api]);
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
