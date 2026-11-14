import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile } from '../lib/api';
import { parseAuthRedirect } from '../lib/auth-redirect';

// Páginas de destino de los correos (docs/operacion/correo-auth.md). Supabase simulado: ninguna prueba toca la red.
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateUser: vi.fn(),
  resend: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth, channel: vi.fn() } }));

import App from '../App';

const session = { access_token: 'token-ficticio', user: { id: 'u-1', email: 'cuenta@example.test' } };

function perfil(rolePlatforms: { role: string; platforms: string[] }[]): AccessProfile {
  return {
    id: 'u-1', user: { id: 'u-1', email: 'cuenta@example.test' }, email: 'cuenta@example.test', name: 'Cuenta ficticia',
    roles: rolePlatforms.map(r => r.role), platforms: [...new Set(rolePlatforms.flatMap(r => r.platforms))], rolePlatforms,
    permissions: [], channels: ['publico'], patientId: null, staffId: null,
  };
}
function responderPerfil(profile: AccessProfile) {
  const fetchSpy = vi.fn((url: string) => String(url).endsWith('/auth/me')
    ? Promise.resolve(new Response(JSON.stringify(profile), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : new Promise<Response>(() => {}));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}
const irA = (url: string) => window.history.pushState({}, '', url);
const PAC = [{ role: 'PAC', platforms: ['android', 'ios'] }];

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.signOut.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
  auth.resend.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); irA('/'); });

describe('lectura del enlace', () => {
  it('reconoce sesión en el hash, código PKCE, token_hash y errores', () => {
    expect(parseAuthRedirect({ pathname: '/confirmar-correo', search: '', hash: '#access_token=a&type=signup' })).toMatchObject({ hasAccessToken: true, type: 'signup' });
    expect(parseAuthRedirect({ pathname: '/restablecer', search: '?code=abc', hash: '' })).toMatchObject({ code: 'abc', hasAccessToken: false });
    expect(parseAuthRedirect({ pathname: '/confirmar-correo', search: '?token_hash=th&type=signup', hash: '' })).toMatchObject({ tokenHash: 'th', type: 'signup' });
    expect(parseAuthRedirect({ pathname: '/aceptar-invitacion', search: '', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' }).error).toEqual({ code: 'otp_expired', description: 'Email link is invalid or has expired' });
  });
});

describe('/confirmar-correo', () => {
  it('paciente desde el hash: confirma, cierra la sesión web y lo envía a la app móvil', async () => {
    irA('/confirmar-correo#access_token=a&type=signup');
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil(PAC));
    render(<App />);
    expect(await screen.findByText('Tu correo quedó confirmado.')).toBeTruthy();
    expect(await screen.findByText('Ya puedes iniciar sesión en la app CLIMESA (Android/iOS).')).toBeTruthy();
    expect(screen.getByText('App CLIMESA para Android')).toBeTruthy();
    expect(screen.getByText('App CLIMESA para iPhone (iOS)')).toBeTruthy();
    expect(screen.getByText(/El portal web no está habilitado/)).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.queryByRole('link', { name: /Ir al portal web/ })).toBeNull();
  });

  it('cuenta con web: conserva la sesión y ofrece entrar al portal', async () => {
    irA('/confirmar-correo#access_token=a&type=signup');
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil([{ role: 'REC', platforms: ['android', 'web'] }]));
    render(<App />);
    expect((await screen.findByRole('link', { name: /Ir al portal web/ })).getAttribute('href')).toBe('/');
    expect(screen.getByText('Tu cuenta está habilitada para web y Android.')).toBeTruthy();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('código PKCE pedido desde la app: el correo quedó confirmado aunque la web no pueda canjearlo', async () => {
    irA('/confirmar-correo?code=codigo-de-la-app');
    auth.exchangeCodeForSession.mockRejectedValue(new Error('PKCE code verifier not found in storage'));
    const fetchSpy = responderPerfil(perfil(PAC));
    render(<App />);
    expect(await screen.findByText('Tu correo quedó confirmado.')).toBeTruthy();
    expect(screen.getByText(/Ya puedes iniciar sesión en la app CLIMESA \(Android\/iOS\) con tu correo/)).toBeTruthy();
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('codigo-de-la-app');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(location.search).toBe('');
  });

  it('token_hash de una plantilla propia: verifica con verifyOtp', async () => {
    irA('/confirmar-correo?token_hash=th-1&type=signup');
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    responderPerfil(perfil(PAC));
    render(<App />);
    expect(await screen.findByText('Tu correo quedó confirmado.')).toBeTruthy();
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'th-1', type: 'signup' });
  });

  it('enlace vencido: lo explica en español y permite reenviar la confirmación', async () => {
    irA('/confirmar-correo#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    render(<App />);
    expect(await screen.findByText(/El enlace ya se usó o expiró/)).toBeTruthy();
    expect(screen.queryByText(/expired/)).toBeNull();
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'paciente@example.test');
    await userEvent.click(screen.getByRole('button', { name: /Reenviar correo de confirmación/ }));
    expect(auth.resend).toHaveBeenCalledWith({ type: 'signup', email: 'paciente@example.test', options: { emailRedirectTo: `${location.origin}/confirmar-correo` } });
    expect(await screen.findByText(/Si la cuenta existe y falta confirmarla/)).toBeTruthy();
  });
});

describe('/aceptar-invitacion', () => {
  async function crearContrasena(clave: string, confirmacion = clave) {
    await userEvent.type(await screen.findByLabelText(/^Nueva contraseña/), clave);
    await userEvent.type(screen.getByLabelText(/^Confirmar contraseña/), confirmacion);
    await userEvent.click(screen.getByRole('button', { name: /Activar mi cuenta/ }));
  }

  it('rol solo web (JOP): exige contraseña segura, la guarda y entra al portal', async () => {
    irA('/aceptar-invitacion#access_token=a&type=invite');
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil([{ role: 'JOP', platforms: ['web'] }]));
    render(<App />);
    await crearContrasena('debil');
    expect(await screen.findByText(/Usa al menos 8 caracteres/)).toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/^Nueva contraseña/));
    await userEvent.clear(screen.getByLabelText(/^Confirmar contraseña/));
    await crearContrasena('Clave#2026x');
    expect(await screen.findByText('Tu cuenta está activa.')).toBeTruthy();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Clave#2026x' });
    expect(screen.getByText('Portal web CLIMESA')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Entrar al portal web/ })).toBeTruthy();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('rol móvil (PAR): cierra la sesión web y explica dónde ingresar', async () => {
    irA('/aceptar-invitacion#access_token=a&type=invite');
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil([{ role: 'PAR', platforms: ['android'] }]));
    render(<App />);
    await crearContrasena('Clave#2026x');
    expect(await screen.findByText('Tu cuenta está habilitada para Android.')).toBeTruthy();
    expect(screen.getByText(/El portal web no está habilitado/)).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.queryByRole('link', { name: /Entrar al portal web/ })).toBeNull();
  });

  it('varios roles: muestra la unión y qué rol aporta cada plataforma', async () => {
    irA('/aceptar-invitacion#access_token=a&type=invite');
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil([{ role: 'ENF', platforms: ['android'] }, { role: 'LAB', platforms: ['web'] }]));
    render(<App />);
    await crearContrasena('Clave#2026x');
    expect(await screen.findByText('Tu cuenta está habilitada para web y Android.')).toBeTruthy();
    expect(screen.getByText('Tus roles')).toBeTruthy();
    expect(screen.getByText('Enfermería: Android')).toBeTruthy();
    expect(screen.getByText('Laboratorio: web')).toBeTruthy();
  });

  it('invitación vencida: pide reenviarla al administrador', async () => {
    irA('/aceptar-invitacion#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    render(<App />);
    expect(await screen.findByText('No pudimos abrir tu invitación.')).toBeTruthy();
    expect(screen.getByText(/Pide al administrador de CLIMESA que te reenvíe la invitación/)).toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe('/restablecer', () => {
  it('guarda la nueva contraseña, cierra la sesión y lleva al ingreso', async () => {
    irA('/restablecer#access_token=a&type=recovery');
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil([{ role: 'ADM', platforms: ['web'] }]));
    render(<App />);
    await userEvent.type(await screen.findByLabelText(/^Nueva contraseña/), 'Nueva#2026x');
    await userEvent.type(screen.getByLabelText(/^Confirmar contraseña/), 'Nueva#2026x');
    await userEvent.click(screen.getByRole('button', { name: /Guardar contraseña/ }));
    expect(await screen.findByText('Contraseña actualizada.')).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.getByRole('link', { name: /Ir al ingreso/ }).getAttribute('href')).toBe('/?contrasena=actualizada');
  });

  it('código de otro dispositivo o vencido: ofrece pedir un enlace nuevo', async () => {
    irA('/restablecer?code=codigo-ajeno');
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: 'invalid' } });
    render(<App />);
    expect(await screen.findByText('No pudimos abrir el enlace.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pedir un enlace nuevo/ }).getAttribute('href')).toBe('/recuperar');
  });

  it('enlace vencido en el hash: mensaje en español, sin formulario', async () => {
    irA('/restablecer#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    render(<App />);
    expect(await screen.findByText(/El enlace ya se usó o expiró/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Guardar contraseña/ })).toBeNull();
  });

  it('la recuperación pide el enlace hacia /restablecer', async () => {
    irA('/recuperar');
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<App />);
    await userEvent.type(await screen.findByLabelText(/Correo electrónico/), 'persona@example.test');
    await userEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    await waitFor(() => expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('persona@example.test', { redirectTo: `${location.origin}/restablecer` }));
  });
});
