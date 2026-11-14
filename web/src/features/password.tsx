import { useState, type FormEvent } from 'react';
import { AuthLayout, Field, Icon, Notice, SubmitButton } from '../components/ui';

// WEB-13 (W01 «recuperar contraseña», W35 «cambiar contraseña»). Supabase Auth owns the password:
// the API never sees it (rule 4). These views only collect it and report the result in Spanish.

/** Same rule as account activation and patient sign-up. */
export const strongPassword = (s: string) => s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s);
export const PASSWORD_RULE = 'Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo.';

/** W01: asks for the reset link. The answer never says whether the e-mail has an account. */
export function PasswordRecoveryView({ onRequest }: { onRequest: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [sent, setSent] = useState(false), [problem, setProblem] = useState<string | undefined>();
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setProblem('Escribe un correo electrónico válido, por ejemplo nombre@correo.com.'); return; }
    setProblem(undefined); setBusy(true);
    try { await onRequest(email.trim()); } catch { /* same answer either way: no account enumeration */ } finally { setBusy(false); setSent(true); }
  }
  return (
    <AuthLayout>
      <form className="auth-form" onSubmit={submit} noValidate>
        <div className="form-heading"><span className="eyebrow">Recuperar contraseña</span><h1>¿Olvidaste tu contraseña?</h1><p>Escribe el correo de tu cuenta. Te enviaremos un enlace para crear una nueva.</p></div>
        {sent
          ? <Notice kind="success">Si el correo pertenece a una cuenta de CLIMESA, recibirás un enlace para crear una nueva contraseña. Revisa también el correo no deseado.</Notice>
          : <><div className="form-fields"><Field required label="Correo electrónico" type="email" placeholder="nombre@correo.com" value={email} onChange={setEmail} autoComplete="email" disabled={busy} error={problem} /></div><SubmitButton busy={busy}>Enviar enlace</SubmitButton></>}
        <div className="auth-help"><a className="auth-link" href="/">Volver al ingreso</a></div>
      </form>
    </AuthLayout>
  );
}

/** W35: change the password from Perfil. `onChange` returns an error message, or null when it worked. */
export function ChangePasswordForm({ onChange }: { onChange: (current: string, next: string) => Promise<string | null> }) {
  const [current, setCurrent] = useState(''), [next, setNext] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [done, setDone] = useState(false);
  const [problem, setProblem] = useState<{ field: 'current' | 'next' | 'confirmation'; message: string } | null>(null);
  const fieldError = (field: 'current' | 'next' | 'confirmation') => problem?.field === field ? problem.message : undefined;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(false); setError(null);
    const found = !current ? { field: 'current' as const, message: 'Escribe tu contraseña actual.' }
      : !strongPassword(next) ? { field: 'next' as const, message: PASSWORD_RULE }
      : next !== confirmation ? { field: 'confirmation' as const, message: 'Las contraseñas no coinciden.' } : null;
    setProblem(found);
    if (found) return;
    setBusy(true);
    try {
      const failure = await onChange(current, next);
      if (failure) setError(failure);
      else { setDone(true); setCurrent(''); setNext(''); setConfirmation(''); }
    } catch { setError('No se pudo conectar. Intenta nuevamente.'); } finally { setBusy(false); }
  }
  return <form className="module-form password-change" onSubmit={submit} noValidate aria-labelledby="password-change-title">
    <h3 id="password-change-title"><Icon name="lock" size={18} />Cambiar contraseña</h3>
    {done && <Notice kind="success">Tu contraseña se cambió. Úsala la próxima vez que ingreses.</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    <div className="form-grid">
      <Field label="Contraseña actual" type="password" value={current} onChange={setCurrent} autoComplete="current-password" disabled={busy} error={fieldError('current')} />
      <Field label="Nueva contraseña" type="password" value={next} onChange={setNext} autoComplete="new-password" disabled={busy} hint={PASSWORD_RULE} error={fieldError('next')} />
      <Field label="Confirmar nueva contraseña" type="password" value={confirmation} onChange={setConfirmation} autoComplete="new-password" disabled={busy} error={fieldError('confirmation')} />
    </div>
    <div className="dialog-actions"><SubmitButton busy={busy}>Cambiar contraseña</SubmitButton></div>
  </form>;
}
