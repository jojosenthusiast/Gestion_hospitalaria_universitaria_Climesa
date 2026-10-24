import { useState, type InputHTMLAttributes, type ReactNode, type FormEvent } from 'react';

export type IconName = 'arrow' | 'shield' | 'mail' | 'user' | 'users' | 'check' | 'close' | 'eye' | 'eyeOff' | 'logout' | 'grid' | 'phone' | 'chevron' | 'info' | 'lock' | 'plus' | 'search' | 'back';
const paths: Record<IconName, ReactNode> = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
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
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand${light ? ' brand-light' : ''}`}>
      <span className="brand-mark" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 26 26" fill="none"><path d="M13 4v18M4 13h18" stroke="currentColor" strokeWidth="5" /></svg></span>
      <span className="brand-name"><strong>climesa</strong><small>Hospital universitario</small></span>
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'success' | 'error' | 'info'; children: ReactNode }) {
  return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name={kind === 'success' ? 'check' : 'info'} /><span>{children}</span></div>;
}

export function Field({ label, value, onChange, hint, ...props }: { label: string; value: string; onChange: (value: string) => void; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [visible, setVisible] = useState(false);
  const password = props.type === 'password';
  return (
    <label className="field">
      <span>{label}</span>
      <span className="input-wrap">
        <input {...props} type={password && visible ? 'text' : props.type} value={value} onChange={e => onChange(e.target.value)} />
        {password && <button type="button" className="password-toggle" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible} onClick={() => setVisible(!visible)}><Icon name={visible ? 'eyeOff' : 'eye'} /></button>}
      </span>
      {hint && <small>{hint}</small>}
    </label>
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

export function LoginView({ email, password, setEmail, setPassword, busy, error, accepted, onSubmit, notice }: { email: string; password: string; setEmail: (s: string) => void; setPassword: (s: string) => void; busy: boolean; error: string | null; accepted: boolean; onSubmit: (e: FormEvent) => void; notice?:string }) {
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={onSubmit}>
        <div className="form-heading"><span className="eyebrow">Acceso a CLIMESA</span><h1>Hola de nuevo.</h1><p>Ingresa con tu cuenta institucional.</p></div>
        {accepted && <Notice kind="success">Contraseña creada. Tu cuenta está lista para ingresar.</Notice>}
        {notice && <Notice kind="info">{notice}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        <div className="form-fields">
          <Field required label="Correo electrónico" type="email" placeholder="nombre@correo.com" value={email} onChange={setEmail} autoComplete="email" disabled={busy} />
          <Field required label="Contraseña" type="password" placeholder="Tu contraseña" value={password} onChange={setPassword} autoComplete="current-password" disabled={busy} />
        </div>
        <SubmitButton busy={busy}>Iniciar sesión</SubmitButton>
        <div className="auth-help"><span>¿Primera vez aquí?</span><p>El personal ingresa con una invitación del hospital.</p><a className="auth-link" href="/registro">Crear cuenta de paciente</a></div>
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

export function InvitationView({ displayName, email, setDisplayName, setEmail, busy, message, onSubmit }: { displayName: string; email: string; setDisplayName: (s: string) => void; setEmail: (s: string) => void; busy: boolean; message: { kind: 'success' | 'error'; text: string } | null; onSubmit: (e: FormEvent) => void }) {
  const initials = displayName.trim() ? displayName.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() : '—';
  return (
    <>
      <section className="page-heading">
        <div><span className="eyebrow">Administración / Cuentas</span><h1>Accesos<span>.</span></h1><p>Gestiona la entrada de tus pacientes a CLIMESA.</p></div>
        <a className="outline-link" href="#account-activation">Cómo se activa una cuenta <Icon name="arrow" size={18} /></a>
      </section>
      <section className="access-workbench" aria-labelledby="invite-title">
        <div className="workbench-heading"><span className="section-number">01</span><div><h2 id="invite-title">Invita a un paciente.</h2><p>Un correo es todo lo que necesita para empezar.</p></div><span className="access-tag"><span />Acceso personal</span></div>
        <form className="invite-form" onSubmit={onSubmit}>
          {message && <Notice kind={message.kind}>{message.text}</Notice>}
          <div className="invite-fields">
            <Field required label="Nombre completo" placeholder="Nombre y apellidos" value={displayName} onChange={setDisplayName} minLength={2} maxLength={120} autoComplete="name" disabled={busy} />
            <Field required label="Correo electrónico" type="email" placeholder="paciente@correo.com" value={email} onChange={setEmail} autoComplete="email" disabled={busy} hint="Aquí recibirá su enlace de activación." />
          </div>
          <div className="identity-strip">
            <span className="identity-avatar" aria-hidden="true">{initials}</span>
            <div className="identity-person"><strong>{displayName.trim() || 'La próxima cuenta de tu paciente'}</strong><span>{email.trim() || 'Completa sus datos para preparar la invitación.'}</span></div>
            <span className="patient-type"><Icon name="user" size={17} />Paciente</span>
          </div>
          <div className="form-action"><p><Icon name="lock" size={16} />El paciente crea su propia contraseña.</p><SubmitButton busy={busy} disabled={displayName.trim().length < 2 || !email.includes('@')}>Enviar invitación</SubmitButton></div>
        </form>
      </section>
      <section className="activation-flow" id="account-activation" aria-labelledby="activation-title">
        <div className="flow-heading"><h2 id="activation-title">Del correo a su cuenta.</h2><span className="mono-label">Tres pasos. Un acceso personal.</span></div>
        <ol className="flow-steps">
          <li><span className="flow-number">01</span><div><h3>Recibe la invitación</h3><p>Un enlace personal llega a su correo electrónico.</p></div></li>
          <li><span className="flow-number">02</span><div><h3>Crea su contraseña</h3><p>Activa su cuenta desde el enlace recibido.</p></div></li>
          <li><span className="flow-number">03</span><div><h3>Ya puede ingresar</h3><p>Utiliza su cuenta en el portal y la aplicación.</p></div></li>
        </ol>
      </section>
    </>
  );
}

export function WelcomeView({ roles }: { roles: string[] }) {
  return (
    <>
      <section className="page-heading"><div><span className="eyebrow">Mi cuenta / CLIMESA</span><h1>Bienvenido<span>.</span></h1><p>Tu espacio personal en el hospital universitario.</p></div></section>
      <section className="welcome-banner"><div><span className="eyebrow">Cuenta activada</span><h2>Tu cuenta<br />está lista.</h2><p>Ya puedes ingresar a la aplicación Android de CLIMESA.</p></div><span className="welcome-check"><Icon name="check" size={62} /></span></section>
      <div className="account-facts"><span>Roles asignados</span><strong>{roles.join(' · ') || 'Sin rol'}</strong></div>
      <p className="welcome-note"><Icon name="info" size={18} />Los servicios clínicos para pacientes se habilitarán en las próximas entregas.</p>
    </>
  );
}

export function ActivationView({ ready, email, password, confirmation, setPassword, setConfirmation, busy, error, onSubmit }: { ready: boolean; email?: string; password: string; confirmation: string; setPassword: (s: string) => void; setConfirmation: (s: string) => void; busy: boolean; error: string | null; onSubmit: (e: FormEvent) => void }) {
  const rules = [{ label: 'Al menos 8 caracteres', ok: password.length >= 8 }, { label: 'Mayúscula y minúscula', ok: /[a-z]/.test(password) && /[A-Z]/.test(password) }, { label: 'Un número y un símbolo', ok: /\d/.test(password) && /[^A-Za-z0-9]/.test(password) }];
  return (
    <AuthLayout activation>
      <form className="auth-form activation-form" onSubmit={onSubmit}>
        <div className="form-heading"><span className="eyebrow">Activación de cuenta</span><h1>Hazla tuya.</h1><p>Crea una contraseña para tu cuenta de CLIMESA.</p></div>
        {!ready && <Notice kind="info">Validando la invitación…</Notice>}
        {ready && !email && <><Notice kind="error">{error || 'El enlace no es válido o ya expiró. Solicita una nueva invitación.'}</Notice><a className="secondary-button" href="/"><Icon name="back" size={18} />Volver al inicio</a></>}
        {email && <>
          <div className="invited-email"><Icon name="mail" size={19} /><div><span>Cuenta invitada</span><strong>{email}</strong></div></div>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="form-fields"><Field required label="Nueva contraseña" type="password" value={password} onChange={setPassword} autoComplete="new-password" disabled={busy} /><Field required label="Confirmar contraseña" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" disabled={busy} /></div>
          <ul className="password-rules">{rules.map(rule => <li className={rule.ok ? 'ok' : ''} key={rule.label}><Icon name="check" size={14} />{rule.label}</li>)}</ul>
          <SubmitButton busy={busy}>Activar mi cuenta</SubmitButton>
        </>}
      </form>
    </AuthLayout>
  );
}

export function StatusView({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return (
    <main className="status-screen"><header><Brand light /><span className="mono-label">Portal institucional</span></header><section className="status-content"><span className="status-symbol">{action ? <Icon name="info" size={38} /> : <span className="status-spinner" />}</span><span className="eyebrow">Acceso a CLIMESA</span><h1>{title}</h1><p>{detail}</p>{action && <button className="primary-button" onClick={onAction}><span>{action}</span><Icon name="arrow" size={18} /></button>}</section><footer>Hospital universitario CLIMESA</footer></main>
  );
}

export function RegistrationView({name,email,password,confirmation,setName,setEmail,setPassword,setConfirmation,busy,error,done,onSubmit}:{name:string;email:string;password:string;confirmation:string;setName:(s:string)=>void;setEmail:(s:string)=>void;setPassword:(s:string)=>void;setConfirmation:(s:string)=>void;busy:boolean;error:string|null;done:boolean;onSubmit:(e:FormEvent)=>void}){
 return <AuthLayout><form onSubmit={onSubmit} className="auth-form"><div className="form-heading"><span className="eyebrow">Cuenta de paciente</span><h1>Tu acceso personal.</h1><p>Crea tu cuenta para utilizar la aplicación móvil de CLIMESA.</p></div>{done?<><Notice kind="success">Si el correo necesita confirmación, recibirás un enlace para activarlo. Después podrás ingresar en Android o iOS.</Notice><a className="secondary-button" href="/">Volver al ingreso</a></>:<>{error&&<Notice kind="error">{error}</Notice>}<Field label="Nombre completo" value={name} onChange={setName} required minLength={2} maxLength={120} autoComplete="name"/><Field label="Correo electrónico" type="email" value={email} onChange={setEmail} required maxLength={254} autoComplete="email"/><Field label="Contraseña" type="password" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password"/><Field label="Confirmar contraseña" type="password" value={confirmation} onChange={setConfirmation} required minLength={8} autoComplete="new-password"/><SubmitButton busy={busy}>Crear cuenta de paciente</SubmitButton><a className="auth-link" href="/">Ya tengo cuenta</a></>}</form></AuthLayout>;
}
