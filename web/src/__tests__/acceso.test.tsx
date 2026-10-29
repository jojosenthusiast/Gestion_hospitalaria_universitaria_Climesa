import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile } from '../lib/api';

// Cliente de Supabase simulado: ninguna prueba toca la red ni una cuenta real.
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: { auth, channel: vi.fn() } }));
vi.mock('../lib/live', () => ({ useLive: () => ({ version: 0, status: 'live' }) }));

import App from '../App';

const session = { access_token: 'token-ficticio', user: { id: 'u-1', email: 'prueba@example.test' } };

function perfil(roles: string[], platforms: string[]): AccessProfile {
  return {
    id: 'u-1', user: { id: 'u-1', email: 'prueba@example.test' }, email: 'prueba@example.test',
    name: 'Cuenta de prueba', roles, platforms, permissions: [], channels: ['publico'], patientId: null, staffId: null,
  };
}

// La API real se alcanza con fetch: devolvemos el perfil para /auth/me. Las demás consultas
// (el tablero del portal) quedan pendientes: responderles `{}` hacía que el tablero llamara a
// formatDateTime(undefined) y la prueba fallara de forma intermitente según el momento del render.
function responderPerfil(profile: AccessProfile) {
  vi.stubGlobal('fetch', vi.fn((url: string) => String(url).endsWith('/auth/me')
    ? Promise.resolve(new Response(JSON.stringify(profile), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    : new Promise<Response>(() => {})));
}

function irA(path: string) { window.history.pushState({}, '', path); }

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.signOut.mockResolvedValue({ error: null });
  irA('/');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('portal según plataformas del perfil', () => {
  it('muestra "Tu rol no usa esta aplicación" si el perfil no incluye web (MED: Android e iOS)', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil(['MED'], ['android', 'ios']));
    render(<App />);
    expect(await screen.findByText('Tu rol no usa esta aplicación')).toBeTruthy();
    expect(screen.getByText(/Android e iOS|iOS e Android/)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
  });

  it('muestra "Tu rol no usa esta aplicación" para un paciente (PAC)', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil(['PAC'], ['android', 'ios']));
    render(<App />);
    expect(await screen.findByText('Tu rol no usa esta aplicación')).toBeTruthy();
  });

  it('cierra la sesión local desde el aviso de rol sin web', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil(['MED'], ['android', 'ios']));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Cerrar sesión/ }));
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('muestra la navegación del portal si el perfil incluye web (ADM)', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil(['ADM'], ['web']));
    render(<App />);
    expect(await screen.findByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
    expect(screen.queryByText('Tu rol no usa esta aplicación')).toBeNull();
  });
});

describe('ingreso', () => {
  it('con credenciales incorrectas muestra el error y no entra al portal', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), '  prueba@example.test ');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await userEvent.click(screen.getByRole('button', { name: /Ingresar|Entrar|Iniciar/i }));
    expect(await screen.findByText(/Correo o contraseña incorrectos/)).toBeTruthy();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'prueba@example.test', password: 'incorrecta' });
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('con campos vacíos no llama a Supabase (la validación nativa del formulario lo impide)', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Ingresar|Entrar|Iniciar/i }));
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('si falla la conexión muestra el aviso de red', async () => {
    auth.signInWithPassword.mockRejectedValue(new Error('network'));
    render(<App />);
    await userEvent.type(await screen.findByLabelText('Correo electrónico'), 'prueba@example.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Clave#1234');
    await userEvent.click(screen.getByRole('button', { name: /Ingresar|Entrar|Iniciar/i }));
    expect(await screen.findByText(/No se pudo conectar/)).toBeTruthy();
  });
});

describe('registro de paciente en /registro', () => {
  async function llenar(password: string, confirmation = password) {
    await userEvent.type(await screen.findByLabelText('Nombre completo'), 'Paciente Ficticio');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'paciente@example.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), password);
    await userEvent.type(screen.getByLabelText('Confirmar contraseña'), confirmation);
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta de paciente/ }));
  }

  it('rechaza una contraseña débil antes de llamar a signUp', async () => {
    irA('/registro');
    render(<App />);
    await llenar('abcdefgh');
    expect(await screen.findByText(/Usa al menos 8 caracteres, mayúscula, minúscula, número y símbolo/)).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('rechaza contraseñas que no coinciden sin llamar a signUp', async () => {
    irA('/registro');
    render(<App />);
    await llenar('Clave#1234', 'Clave#12345');
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('con una contraseña fuerte llama a signUp una sola vez y confirma el registro', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    irA('/registro');
    render(<App />);
    await llenar('Clave#1234');
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1));
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'paciente@example.test', password: 'Clave#1234',
      options: { data: { nombre: 'Paciente Ficticio' }, emailRedirectTo: location.origin },
    });
    expect(await screen.findByText(/Si el correo necesita confirmación/)).toBeTruthy();
  });
});
