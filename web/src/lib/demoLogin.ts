// TEMPORARY testing aid (docs/operacion/login-de-prueba.md): fills the login form with a fictitious test account.
// Remove before final delivery by setting VITE_DEMO_LOGIN=false. vite.config.ts only injects VITE_DEMO_CREDENTIALS
// when the flag is on, so with the flag off the bundle carries no credential.
export type DemoAccount = { rol: string; correo: string; contrasena: string };

function isAccount(value: unknown): value is DemoAccount {
  if (!value || typeof value !== 'object') return false;
  const { rol, correo, contrasena } = value as Record<string, unknown>;
  return typeof rol === 'string' && rol !== '' && typeof correo === 'string' && correo !== '' && typeof contrasena === 'string' && contrasena !== '';
}

/** Reads `[{"rol","correo","contrasena"}]`; anything malformed is dropped, never thrown. */
export function parseDemoCredentials(raw: string | undefined): DemoAccount[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAccount).map(({ rol, correo, contrasena }) => ({ rol, correo, contrasena })) : [];
  } catch {
    return [];
  }
}

export function demoAccountsFrom(flag: string | undefined, raw: string | undefined): DemoAccount[] {
  return flag === 'true' ? parseDemoCredentials(raw) : [];
}

export const demoAccounts: DemoAccount[] = import.meta.env.VITE_DEMO_LOGIN === 'true'
  ? parseDemoCredentials(import.meta.env.VITE_DEMO_CREDENTIALS as string | undefined)
  : [];
