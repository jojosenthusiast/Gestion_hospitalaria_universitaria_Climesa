import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type FormEvent } from 'react';
import type { DemoAccount } from '../lib/demoLogin';

export type IconName = 'arrow' | 'shield' | 'mail' | 'user' | 'users' | 'check' | 'close' | 'eye' | 'eyeOff' | 'logout' | 'grid' | 'phone' | 'chevron' | 'info' | 'lock' | 'plus' | 'search' | 'back' | 'home' | 'building' | 'bed' | 'ambulance' | 'calendar' | 'audit' | 'lab' | 'inventory' | 'queue' | 'privacy' | 'menu' | 'retry' | 'download' | 'clock' | 'alert' | 'chart' | 'userPlus' | 'megaphone' | 'steth' | 'drop' | 'pulse' | 'chevronsUp' | 'minus' | 'filter' | 'clipboard' | 'bell' | 'pencil' | 'trash';
const paths: Record<IconName, ReactNode> = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  pencil: <><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  back: <><path d="M19 12H5M11 6l-6 6 6 6" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z" /><path d="m8 12 3 3 5-6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="m3 3 18 18M10 5c7-1 12 7 12 7a19 19 0 0 1-4 5M6 6a19 19 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4" /></>,
  logout: <><path d="M9 4H4v16h5M10 12h11M17 8l4 4-4 4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></>,
  chevron: <path d="m9 5 7 7-7 7" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v.01" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></>,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-7h6v7" /></>,
  building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01M2 21h20" /></>,
  bed: <><path d="M3 19V7M21 19v-6a3 3 0 0 0-3-3H9v6h12M3 16h18M6 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" /></>,
  ambulance: <><path d="M3 6h11v13H3zM14 10h4l3 4v5h-7z" /><path d="M7 9v6M4 12h6M6 19a2 2 0 1 0 4 0M16 19a2 2 0 1 0 4 0" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 4v2h6V4M8.5 11h7M8.5 15h5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  audit: <><path d="M9 4H5a2 2 0 0 0-2 2v14h12v-4" /><path d="M9 2h6v4H9zM8 11h4M8 15h3" /><circle cx="17" cy="11" r="4" /><path d="m20 14 2 2" /></>,
  lab: <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8" /></>,
  inventory: <><path d="m4 7 8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10" /></>,
  queue: <><path d="M5 7h14M5 12h10M5 17h6" /><path d="m17 14 3 3-3 3" /></>,
  privacy: <><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z" /><path d="M9 12a3 3 0 0 1 6 0v3H9z" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  retry: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
  download: <><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M12 3 2 20h20z" /><path d="M12 10v5M12 18v.01" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  userPlus: <><circle cx="9" cy="8" r="4" /><path d="M2 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6" /></>,
  megaphone: <><path d="M3 10v4h4l8 5V5L7 10zM18 9a4 4 0 0 1 0 6" /></>,
  steth: <><path d="M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  drop: <><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z" /></>,
  pulse: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
  chevronsUp: <><path d="m6 13 6-6 6 6M6 19l6-6 6 6" /></>,
  minus: <path d="M5 12h14" />,
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand${light ? ' brand-light' : ''}`}>
      <span className="brand-mark" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M13 4v18M4 13h18" stroke="currentColor" strokeWidth="5" /></svg></span>
      <span className="brand-name"><strong>climesa</strong><small>Hospital universitario</small></span>
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'success' | 'error' | 'info' | 'warning'; children: ReactNode }) {
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'} aria-atomic="true"><span className="notice-icon"><Icon name={kind === 'success' ? 'check' : kind === 'warning' ? 'alert' : 'info'} /></span><span>{children}</span></div>;
}

/**
 * Audit D111: digits typed without separators take the dd/mm/aaaa shape as they are typed («01012020» → «01/01/2020»).
 * Text the person separates their own way («1/1/2026») is left as typed; an ISO date («2026-01-01») drops the slashes
 * the mask put in while only its year was typed.
 */
export function maskDateText(raw: string): string {
  if (/[.-]/.test(raw)) return /^[\d/]+[.-]/.test(raw) ? raw.replace(/\//g, '') : raw;
  if (raw.split('/').slice(0, -1).some(part => part.length !== 2)) return raw;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}` : digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

/** dd/mm/aaaa (or an ISO date) to ISO; '' clears; null while the text is not a whole, real date. */
export function isoFromDateText(text: string): string | null {
  const t = text.trim();
  if (t === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t) ?? /^(\d{2})(\d{2})(\d{4})$/.exec(t);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const dateText = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

/** WEB-11: `error` marks the input `aria-invalid` and links the message with `aria-describedby`, so it is read with the field. */
export function Field({ label, value, onChange, hint, error, ...props }: { label: string; value: string; onChange: (value: string) => void; hint?: string; error?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [visible, setVisible] = useState(false);
  const hintId = useId(), errorId = useId(), ownId = useId(), inputId = props.id ?? ownId;
  const password = props.type === 'password', date = props.type === 'date';
  // Sweep 2026-11-17: a native date input follows the browser language (11/18/2026 in an English browser). Dates are
  // typed and shown as dd/mm/aaaa (es-SV); the native calendar stays one click away on the button.
  const [text, setText] = useState(() => dateText(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { if (date && isoFromDateText(text) !== value) setText(dateText(value)); }, [value]);
  const describedBy = [props['aria-describedby'], hint ? hintId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
  // The hint and the error sit outside the <label>: they describe the field, they are not its name.
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <span className="input-wrap">
        {date ? <>
          <input {...props} min={undefined} max={undefined} id={inputId} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy} type="text" inputMode="numeric" autoComplete="off" maxLength={10} placeholder={props.placeholder ?? 'dd/mm/aaaa'} value={text}
            onFocus={e => { e.target.select(); props.onFocus?.(e); }}
            onChange={e => { const masked = maskDateText(e.target.value); setText(masked); const iso = isoFromDateText(masked); if (iso !== null) onChange(iso); }} />
          <input ref={picker} className="date-native" type="date" tabIndex={-1} aria-hidden="true" value={value} min={props.min} max={props.max} disabled={props.disabled} onChange={e => { setText(dateText(e.target.value)); onChange(e.target.value); }} />
          <button type="button" className="password-toggle" aria-label={`Elegir ${label.toLowerCase()} en el calendario`} disabled={props.disabled} onClick={() => { try { picker.current?.showPicker?.(); } catch { picker.current?.focus(); } }}><Icon name="calendar" /></button>
        </>
          : <input {...props} id={inputId} aria-invalid={error ? true : props['aria-invalid']} aria-describedby={describedBy} type={password && visible ? 'text' : props.type} value={value} onChange={e => onChange(e.target.value)} />}
        {password && <button type="button" className="password-toggle" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button>}
      </span>
      {hint && <small id={hintId}>{hint}</small>}
      {error && <small id={errorId} className="field-error" role="alert">{error}</small>}
    </div>
  );
}

export function SubmitButton({ busy, children, disabled = false }: { busy: boolean; children: ReactNode; disabled?: boolean }) {
  return <button className="primary-button" disabled={disabled || busy}>{busy ? <><span className="spinner" />Un momento…</> : <><span>{children}</span><Icon name="arrow" size={20} /></>}</button>;
}

export function AuthLayout({ children, activation = false }: { children: ReactNode; activation?: boolean }) {
  return (
    <main className="auth-layout">
      <header className="auth-header"><Brand light /><span className="mono-label">Portal institucional</span></header>
      <div className="auth-stage">
        <section className="auth-sheet">{children}</section>
        <div className="auth-caption"><span>{activation ? 'Activa tu cuenta.' : 'Tu espacio de trabajo.'}</span><span>CLIMESA / Hospital universitario</span></div>
      </div>
      <footer className="auth-footer"><span><Icon name="lock" size={14} /> Conexión protegida</span><span>Tu información, en buenas manos.</span></footer>
    </main>
  );
}

/** TEMPORARY testing aid (docs/operacion/login-de-prueba.md): picks a fictitious test account; the user still signs in. */
function DemoAccountPicker({ accounts, disabled, onPick }: { accounts: DemoAccount[]; disabled: boolean; onPick: (account: DemoAccount) => void }) {
  const selectId = useId();
  return (
    <>
      <Notice kind="info">Modo de prueba: cuentas ficticias</Notice>
      <div className="field">
        <label htmlFor={selectId}>Cuenta de prueba</label>
        <select id={selectId} defaultValue="" disabled={disabled} onChange={e => { const account = accounts.find(a => a.rol === e.target.value); if (account) onPick(account); }}>
          <option value="" disabled>Elige un rol</option>
          {accounts.map(a => <option key={a.rol} value={a.rol}>{a.rol}</option>)}
        </select>
      </div>
    </>
  );
}

export function LoginView({ email, password, setEmail, setPassword, busy, error, accepted, onSubmit, notice, demoAccounts = [] }: { email: string; password: string; setEmail: (s: string) => void; setPassword: (s: string) => void; busy: boolean; error: string | null; accepted: boolean; onSubmit: (e: FormEvent) => void; notice?:string; demoAccounts?: DemoAccount[] }) {
  // W-11: la validación del navegador sale en su idioma; aquí se valida con mensajes propios en español.
  const [problems, setProblems] = useState<{ email?: string; password?: string }>({});
  function submit(event: FormEvent) {
    const found: { email?: string; password?: string } = {};
    if (!email.trim()) found.email = 'Escribe tu correo electrónico.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) found.email = 'Escribe un correo electrónico válido, por ejemplo nombre@correo.com.';
    if (!password) found.password = 'Escribe tu contraseña.';
    setProblems(found);
    if (found.email || found.password) { event.preventDefault(); return; }
    onSubmit(event);
  }
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="form-heading"><span className="eyebrow">Acceso a CLIMESA</span><h1>Bienvenido</h1><p>Ingresa con tu cuenta institucional.</p></div>
        {accepted && <Notice kind="success">Contraseña creada. Tu cuenta está lista para ingresar.</Notice>}
        {notice && <Notice kind="info">{notice}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {demoAccounts.length > 0 && <DemoAccountPicker accounts={demoAccounts} disabled={busy} onPick={a => { setEmail(a.correo); setPassword(a.contrasena); }} />}
        <div className="form-fields">
          <Field required label="Correo electrónico" type="email" placeholder="nombre@correo.com" value={email} onChange={setEmail} autoComplete="email" disabled={busy} aria-invalid={problems.email ? true : undefined} hint={problems.email} />
          <Field required label="Contraseña" type="password" placeholder="Tu contraseña" value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} aria-invalid={problems.password ? true : undefined} hint={problems.password} />
        </div>
        {(problems.email || problems.password) && <p className="sr-only" role="alert">Revisa los campos marcados.</p>}
        <SubmitButton busy={busy}>Iniciar sesión</SubmitButton>
        <a className="auth-link auth-forgot" href="/recuperar">¿Olvidaste tu contraseña?</a>
        <a className="auth-link auth-public" href="/publico">Ver información pública del hospital</a>
        <div className="auth-help"><span>¿Primera vez aquí?</span><p>El personal ingresa con una invitación del hospital.</p><p>¿Eres paciente? Crea tu cuenta en la app CLIMESA para Android o iOS.</p></div>
      </form>
    </AuthLayout>
  );
}

export function PortalLayout({ email, roles, onLogout, children, accountMenuOpen = false }: { email: string; roles: string[]; onLogout: () => void; children: ReactNode; accountMenuOpen?: boolean }) {
  const admin = roles.includes('ADM');
  return (
    <div className="portal-shell">
      <a className="skip-link" href="#main-content">Ir al contenido</a>
      <header className="portal-header">
        <Brand light />
        <nav className="portal-nav" aria-label="Navegación principal"><a href="#main-content" aria-current="page"><Icon name={admin ? 'users' : 'user'} size={18} />{admin ? 'Accesos' : 'Mi cuenta'}</a></nav>
        <div className="account-controls">
          <span className="role-label">{admin ? 'Administración' : roles.join(' · ') || 'Cuenta'}</span>
          <details className="account-menu" open={accountMenuOpen || undefined}><summary aria-label="Opciones de cuenta"><span className="account-avatar">{email.slice(0, 1).toUpperCase()}</span><span className="account-menu-label">Mi cuenta</span><span className="account-chevron" aria-hidden="true">⌄</span></summary><div className="account-popover"><span>Sesión iniciada</span><strong>{email}</strong><button onClick={onLogout}><Icon name="logout" size={18} />Cerrar sesión</button></div></details>
        </div>
      </header>
      <main className="portal-content" id="main-content">{children}</main>
      <footer className="portal-footer"><Brand /><span>Hospital universitario CLIMESA</span><span><Icon name="lock" size={13} /> Sesión protegida</span></footer>
    </div>
  );
}

export function WelcomeView({ roles }: { roles: string[] }) {
  return (
    <>
      <section className="page-heading"><div><span className="eyebrow">Mi cuenta / CLIMESA</span><h1>Bienvenido</h1><p>Tu espacio personal en el hospital universitario.</p></div></section>
      <section className="welcome-banner"><div><span className="eyebrow">Cuenta activada</span><h2>Tu cuenta<br />está lista.</h2><p>Ya puedes ingresar a la aplicación Android de CLIMESA.</p></div><span className="welcome-check"><Icon name="check" size={62} /></span></section>
      <div className="account-facts"><span>Roles asignados</span><strong>{roles.join(' · ') || 'Sin rol'}</strong></div>
      <p className="welcome-note"><Icon name="info" size={18} />Los servicios clínicos para pacientes se habilitarán en las próximas entregas.</p>
    </>
  );
}

/** `reset` (WEB-13): the same form, reached from the password recovery e-mail instead of an invitation. */
export function ActivationView({ ready, email, password, confirmation, setPassword, setConfirmation, busy, error, onSubmit, mode = 'activation' }: { ready: boolean; email?: string; password: string; confirmation: string; setPassword: (s: string) => void; setConfirmation: (s: string) => void; busy: boolean; error: string | null; onSubmit: (e: FormEvent) => void; mode?: 'activation' | 'reset' }) {
  const reset = mode === 'reset';
  const rules = [{ label: 'Al menos 8 caracteres', ok: password.length >= 8 }, { label: 'Mayúscula y minúscula', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) }, { label: 'Un número y un símbolo', ok: /\d/.test(password) && /[^A-Za-z0-9]/.test(password) }];
  return (
    <AuthLayout activation>
      <form className="auth-form" onSubmit={onSubmit}>
        {reset
          ? <div className="form-heading"><span className="eyebrow">Nueva contraseña</span><h1>Crea una nueva contraseña</h1><p>Elige una contraseña segura para tu cuenta de CLIMESA.</p></div>
          : <div className="form-heading"><span className="eyebrow">Activación de cuenta</span><h1>Hazla tuya</h1><p>Crea una contraseña para tu cuenta de CLIMESA.</p></div>}
        {!ready && <Notice kind="info">{reset ? 'Validando el enlace…' : 'Validando la invitación…'}</Notice>}
        {ready && !email && <><Notice kind="error">{error || (reset ? 'El enlace no es válido o ya expiró. Pide uno nuevo desde «¿Olvidaste tu contraseña?».' : 'El enlace no es válido o ya expiró. Solicita una nueva invitación.')}</Notice><a className="secondary-button" href="/"><Icon name="back" size={18} />Volver al inicio</a></>}
        {email && <>
          <div className="invited-email"><Icon name="mail" size={19} /><div><span>{reset ? 'Cuenta' : 'Cuenta invitada'}</span><strong>{email}</strong></div></div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="form-fields"><Field required label="Nueva contraseña" type="password" value={password} onChange={setPassword} autoComplete="new-password" disabled={busy} /><Field required label="Confirmar contraseña" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" disabled={busy} /></div>
          <ul className="password-rules">{rules.map(rule => <li className={rule.ok ? 'ok' : ''} key={rule.label}><Icon name="check" size={14} />{rule.label}</li>)}</ul>
          <SubmitButton busy={busy}>{reset ? 'Guardar contraseña' : 'Activar mi cuenta'}</SubmitButton>
        </>}
      </form>
    </AuthLayout>
  );
}

/** `settled`: a final answer with no action (e.g. a 403), so it shows the info symbol instead of the waiting spinner. */
export function StatusView({ title, detail, action, onAction, settled = false }: { title: string; detail: string; action?: string; onAction?: () => void; settled?: boolean }) {
  return (
    <main className="status-screen"><header><Brand light /><span className="mono-label">Portal institucional</span></header><section className="status-content"><span className="status-symbol">{action || settled ? <Icon name="info" size={38} /> : <span className="status-spinner" />}</span><span className="eyebrow">Acceso a CLIMESA</span><h1>{title}</h1><p>{detail}</p>{action && <button className="primary-button" onClick={onAction}><span>{action}</span><Icon name="arrow" size={18} /></button>}</section><footer>Hospital universitario CLIMESA</footer></main>
  );
}

/** BL-06 (D-04): patients create their account only in the mobile apps; `/registro` stays as guidance so old links do not break. */
export function PatientSignupInfoView(){
 return <AuthLayout><div className="auth-form"><div className="form-heading"><span className="eyebrow">Cuenta de paciente</span><h1>Crea tu cuenta en la app CLIMESA para Android o iOS</h1><p>El registro de pacientes se hace solo en la app móvil. Descárgala, elige «Crear cuenta» y confirma tu correo desde el enlace que te enviaremos.</p></div><Notice kind="info">El portal web es para el personal del hospital. Con tu cuenta de paciente ingresas en la app.</Notice><a className="secondary-button" href="/"><Icon name="back" size={18}/>Volver al ingreso</a></div></AuthLayout>;
}
