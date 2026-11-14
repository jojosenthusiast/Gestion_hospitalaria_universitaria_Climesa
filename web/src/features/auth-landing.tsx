import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { EmailOtpType, Session } from '@supabase/supabase-js';
import { ActivationView, AuthLayout, Field, Icon, Notice, SubmitButton, type IconName } from '../components/ui';
import { getAccessProfile, roleNames, type AccessProfile } from '../lib/api';
import { currentAuthRedirect, linkProblemMessage, type AuthRedirect } from '../lib/auth-redirect';
import { supabase } from '../lib/supabase';
import { PASSWORD_RULE, strongPassword } from './password';
import './auth-landing.css';

// E-mail landing pages (docs/operacion/correo-auth.md). Every Supabase e-mail of every platform (web, Android, iOS) redirects here:
// `/confirmar-correo` (patient sign-up), `/aceptar-invitacion` (staff invitation) and `/restablecer` (password reset).
// Where an account can sign in comes from `/auth/me` (`platforms` and `rolePlatforms`, read from `acceso.rol.plataformas`).

export const LANDING_PATHS = { confirm: '/confirmar-correo', invite: '/aceptar-invitacion', reset: '/restablecer' } as const;
const PLATFORM_ORDER = ['web', 'android', 'ios'];
const PLATFORM_NAMES: Record<string, string> = { web: 'web', android: 'Android', ios: 'iOS' };

type LinkResult = { session: Session | null; problem?: string; verifiedWithoutSession?: boolean };

/** A link is single use: React's development double effect must not exchange the same code twice. */
const resolved = new WeakMap<AuthRedirect, Promise<LinkResult>>();
export function resolveLinkSession(redirect: AuthRedirect): Promise<LinkResult> {
  const known = resolved.get(redirect);
  if (known) return known;
  const pending = resolveLink(redirect);
  resolved.set(redirect, pending);
  return pending;
}
/** Turns the link parameters into a session. A PKCE `code` that cannot be exchanged here (it was requested from an app) still
 * means Supabase verified the e-mail: it only redirects with a code after a successful verification. */
async function resolveLink(redirect: AuthRedirect): Promise<LinkResult> {
  const auth = supabase!.auth;
  if (redirect.error) return { session: null, problem: linkProblemMessage(redirect.error) };
  if (redirect.tokenHash && redirect.type) {
    const { data, error } = await auth.verifyOtp({ token_hash: redirect.tokenHash, type: redirect.type as EmailOtpType });
    cleanUrl();
    return error ? { session: null, problem: linkProblemMessage({ code: error.code, description: error.message }) } : { session: data.session };
  }
  if (redirect.code) {
    try {
      const { data, error } = await auth.exchangeCodeForSession(redirect.code);
      cleanUrl();
      if (!error && data.session) return { session: data.session };
    } catch { cleanUrl(); }
    return { session: null, verifiedWithoutSession: true };
  }
  const { data } = await auth.getSession();
  return { session: data.session };
}
/** The link is single use: once read, its parameters leave the address bar so a reload or a shared URL does not replay them. */
function cleanUrl() { if (location.search || location.hash) history.replaceState(null, '', location.pathname); }

const profileOf = (session: Session | null) => session ? getAccessProfile(session.access_token).catch(() => null) : Promise.resolve(null);
const sortPlatforms = (platforms: string[]) => [...new Set(platforms)].sort((a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b));
/** «web y Android», «Android e iOS», «web, Android e iOS». */
export function platformList(platforms: string[]): string {
  const names = sortPlatforms(platforms).map(p => PLATFORM_NAMES[p] ?? p);
  if (names.length < 2) return names.join('');
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(', ')} ${/^i/i.test(last) ? 'e' : 'y'} ${last}`;
}
const mobileOf = (platforms: string[]) => sortPlatforms(platforms).filter(p => p !== 'web');

const PLATFORM_CARDS: Record<string, { title: string; icon: IconName; detail: () => string }> = {
  web: { title: 'Portal web CLIMESA', icon: 'grid', detail: () => `En el navegador, en ${location.host}.` },
  android: { title: 'App CLIMESA para Android', icon: 'phone', detail: () => 'En tu teléfono o tableta Android.' },
  ios: { title: 'App CLIMESA para iPhone (iOS)', icon: 'phone', detail: () => 'En tu iPhone o iPad.' },
};

/** Where the account can sign in: one card per platform and, for a multi-role account, which role brings each platform. */
export function PlatformGuidance({ profile }: { profile: AccessProfile }) {
  const platforms = sortPlatforms(profile.platforms), roles = profile.rolePlatforms ?? [];
  return <div className="platform-guidance">
    <p className="platform-summary">Tu cuenta está habilitada para {platformList(platforms)}.</p>
    <ul className="platform-list" aria-label="Dónde puedes iniciar sesión">
      {platforms.map(p => PLATFORM_CARDS[p] && <li key={p} className="platform-item"><Icon name={PLATFORM_CARDS[p].icon} size={20} /><div><strong>{PLATFORM_CARDS[p].title}</strong><span>{PLATFORM_CARDS[p].detail()} Ingresa con este mismo correo y tu contraseña.</span></div></li>)}
    </ul>
    {roles.length > 1 && <div className="platform-roles">
      <strong>Tus roles</strong>
      <ul>{roles.map(r => <li key={r.role}>{roleNames[r.role] ?? r.role}: {platformList(r.platforms)}</li>)}</ul>
      <p>Puedes ingresar en cualquiera de esas plataformas. En cada una verás solo las funciones de los roles que la usan.</p>
    </div>}
    {!platforms.includes('web') && <p className="platform-note">El portal web no está habilitado para tu cuenta; no necesitas usarlo.</p>}
  </div>;
}

/** Without a profile (the API did not answer) the guidance falls back to what every e-mail flow allows: the patient apps. */
function GenericGuidance({ patient }: { patient: boolean }) {
  return <p className="platform-summary">{patient ? 'Ya puedes iniciar sesión en la app CLIMESA (Android/iOS) con tu correo y contraseña.' : 'Ya puedes iniciar sesión con tu correo y tu nueva contraseña en la aplicación que usa tu rol.'}</p>;
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="form-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{children && <p>{children}</p>}</div>;
}

/** Screen for a signed-in account whose roles do not use the web: guidance instead of a broken dashboard. */
export function PlatformGuidanceScreen({ profile, title, action }: { profile: AccessProfile; title: string; action: { label: string; onClick: () => void } }) {
  return <AuthLayout><div className="auth-form"><Heading eyebrow="Acceso a CLIMESA" title={title} /><PlatformGuidance profile={profile} /><button className="primary-button" onClick={action.onClick}><span>{action.label}</span><Icon name="logout" size={18} /></button></div></AuthLayout>;
}

type ConfirmState = { stage: 'checking' } | { stage: 'problem'; message: string } | { stage: 'done'; profile: AccessProfile | null; web: boolean };

/** `/confirmar-correo`: the patient confirms the e-mail from any platform. Web stays signed in only when a role uses the web. */
export function ConfirmEmail() {
  const [state, setState] = useState<ConfirmState>({ stage: 'checking' });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const link = await resolveLinkSession(currentAuthRedirect()).catch((): LinkResult => ({ session: null, problem: 'No pudimos validar el enlace.' }));
      if (link.problem) { if (!cancelled) setState({ stage: 'problem', message: link.problem }); return; }
      if (!link.session && !link.verifiedWithoutSession) { if (!cancelled) setState({ stage: 'problem', message: 'El enlace no es válido o ya se usó.' }); return; }
      const profile = await profileOf(link.session), web = !!profile?.platforms.includes('web');
      if (link.session && !web) await supabase!.auth.signOut({ scope: 'local' });
      if (!cancelled) setState({ stage: 'done', profile, web });
    })();
    return () => { cancelled = true; };
  }, []);
  return <AuthLayout activation><div className="auth-form">
    {state.stage === 'checking' && <><Heading eyebrow="Confirmación de correo" title="Confirmando tu correo." /><Notice kind="info">Validando el enlace…</Notice></>}
    {state.stage === 'done' && <>
      <Heading eyebrow="Confirmación de correo" title="Tu correo quedó confirmado." />
      {state.profile ? <><Notice kind="success">{state.web ? 'Tu cuenta está activa.' : `Ya puedes iniciar sesión en la app CLIMESA (${mobileOf(state.profile.platforms).map(p => PLATFORM_NAMES[p]).join('/') || 'Android/iOS'}).`}</Notice><PlatformGuidance profile={state.profile} /></> : <GenericGuidance patient />}
      {state.web ? <a className="primary-button" href="/"><span>Ir al portal web</span><Icon name="arrow" size={18} /></a> : <a className="secondary-button" href="/"><Icon name="back" size={18} />Volver al inicio</a>}
    </>}
    {state.stage === 'problem' && <><Heading eyebrow="Confirmación de correo" title="No pudimos confirmar tu correo." /><Notice kind="error">{state.message} Si ya confirmaste tu correo, inicia sesión en la app. Si no, pide un enlace nuevo.</Notice><ResendConfirmation /><a className="auth-link" href="/">Volver al inicio</a></>}
  </div></AuthLayout>;
}

/** Sends a new sign-up confirmation. Same answer whether or not the account exists (no account enumeration). */
function ResendConfirmation() {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [problem, setProblem] = useState<string | undefined>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setProblem('Escribe un correo electrónico válido, por ejemplo nombre@correo.com.'); return; }
    setProblem(undefined); setBusy(true);
    try { await supabase!.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${location.origin}${LANDING_PATHS.confirm}` } }); } catch { /* same answer */ } finally { setBusy(false); setSent(true); }
  }
  if (sent) return <Notice kind="success">Si la cuenta existe y falta confirmarla, te enviamos un enlace nuevo. Revisa también el correo no deseado.</Notice>;
  return <form className="resend-form" onSubmit={submit} noValidate><div className="form-fields"><Field required label="Correo electrónico" type="email" placeholder="nombre@correo.com" value={email} onChange={setEmail} autoComplete="email" disabled={busy} error={problem} /></div><SubmitButton busy={busy}>Reenviar correo de confirmación</SubmitButton></form>;
}

type PasswordState = { stage: 'checking' } | { stage: 'problem'; message: string } | { stage: 'form'; session: Session } | { stage: 'done'; profile: AccessProfile | null; web: boolean };

/** `/aceptar-invitacion` (W02) and, with `reset`, `/restablecer` (W01, WEB-13): both arrive with a Supabase link session. */
export function SetPasswordLanding({ reset = false }: { reset?: boolean }) {
  const [state, setState] = useState<PasswordState>({ stage: 'checking' });
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const link = await resolveLinkSession(currentAuthRedirect()).catch((): LinkResult => ({ session: null, problem: 'No pudimos validar el enlace.' }));
      if (cancelled) return;
      if (link.session) setState({ stage: 'form', session: link.session });
      else setState({ stage: 'problem', message: link.problem ?? (link.verifiedWithoutSession ? 'Este enlace se pidió desde otra aplicación o navegador y no se puede usar aquí.' : 'El enlace no es válido o ya expiró.') });
    })();
    return () => { cancelled = true; };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state.stage !== 'form') return;
    if (!strongPassword(password)) { setError(PASSWORD_RULE); return; }
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: failure } = await supabase!.auth.updateUser({ password });
      if (failure) { setError(failure.code === 'same_password' ? 'La nueva contraseña debe ser distinta de la anterior.' : reset ? 'No se pudo guardar la contraseña. Pide un enlace nuevo.' : 'No se pudo activar la cuenta. Revisa el enlace de invitación.'); return; }
      const profile = await profileOf(state.session), web = !!profile?.platforms.includes('web');
      // An invited web user goes straight into the portal; everybody else signs in again where their role works.
      if (reset || !web) await supabase!.auth.signOut({ scope: 'local' });
      setState({ stage: 'done', profile, web });
    } catch { setError('No se pudo conectar. Intenta nuevamente.'); } finally { setBusy(false); }
  }
  if (state.stage === 'problem') return <AuthLayout activation><div className="auth-form">
    <Heading eyebrow={reset ? 'Nueva contraseña' : 'Activación de cuenta'} title={reset ? 'No pudimos abrir el enlace.' : 'No pudimos abrir tu invitación.'} />
    <Notice kind="error">{state.message} {reset ? 'Pide un enlace nuevo; el anterior deja de servir.' : 'Pide al administrador de CLIMESA que te reenvíe la invitación.'}</Notice>
    {reset ? <a className="primary-button" href="/recuperar"><span>Pedir un enlace nuevo</span><Icon name="mail" size={18} /></a> : <a className="secondary-button" href="/"><Icon name="back" size={18} />Volver al inicio</a>}
  </div></AuthLayout>;
  if (state.stage === 'done') return <AuthLayout activation><div className="auth-form">
    <Heading eyebrow={reset ? 'Nueva contraseña' : 'Activación de cuenta'} title={reset ? 'Contraseña actualizada.' : 'Tu cuenta está activa.'} />
    {state.profile ? <PlatformGuidance profile={state.profile} /> : <GenericGuidance patient={false} />}
    {state.web && (reset ? <a className="primary-button" href="/?contrasena=actualizada"><span>Ir al ingreso</span><Icon name="arrow" size={18} /></a> : <a className="primary-button" href="/"><span>Entrar al portal web</span><Icon name="arrow" size={18} /></a>)}
    {!state.web && <a className="secondary-button" href="/"><Icon name="back" size={18} />Volver al inicio</a>}
  </div></AuthLayout>;
  const session = state.stage === 'form' ? state.session : null;
  return <ActivationView ready={state.stage !== 'checking'} email={session?.user.email} {...{ password, confirmation, setPassword, setConfirmation, busy, error }} mode={reset ? 'reset' : 'activation'} onSubmit={submit} />;
}
