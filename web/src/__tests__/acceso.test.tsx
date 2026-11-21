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
vi.mock('../lib/live', () => ({ useLive: () => ({ version: 0, signal: { any: 0, counts: {} }, updatedAt: null, status: 'live' }) }));

import App from '../App';

const session = { access_token: 'token-ficticio', user: { id: 'u-1', email: 'prueba@example.test' } };

function perfil(roles: string[], platforms: string[], permisos: string[] = ['usuarios.ver']): AccessProfile {
  return {
    id: 'u-1', user: { id: 'u-1', email: 'prueba@example.test' }, email: 'prueba@example.test',
    name: 'Cuenta de prueba', roles, platforms, permissions: permisos.map(code => ({ code, context: 'global' })), channels: ['publico'], patientId: null, staffId: null,
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
  it('un rol sin web (MED: Android e iOS) vuelve al ingreso con el mismo error genérico de credenciales', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    responderPerfil(perfil(['MED'], ['android', 'ios']));
    render(<App />);
    expect(await screen.findByText('Correo o contraseña incorrectos, o la cuenta todavía no está activa.')).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.queryByText('Tu rol no usa esta aplicación')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
  });

  it('una cuenta que la API rechaza (403) tampoco revela el motivo', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ title: 'Cuenta desactivada', status: 403 }), { status: 403, headers: { 'Content-Type': 'application/problem+json' } }))));
    render(<App />);
    expect(await screen.findByText('Correo o contraseña incorrectos, o la cuenta todavía no está activa.')).toBeTruthy();
    expect(screen.queryByText(/Cuenta desactivada|no tiene acceso/)).toBeNull();
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

describe('registro de paciente (BL-06: solo en la app móvil)', () => {
  it('el ingreso no enlaza a un registro web y orienta al paciente a la app', async () => {
    render(<App />);
    expect(await screen.findByText('¿Eres paciente? Crea tu cuenta en la app CLIMESA para Android o iOS.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Crear cuenta de paciente/ })).toBeNull();
    expect(document.querySelector('a[href="/registro"]')).toBeNull();
  });

  it('/registro es una página informativa sin formulario y nunca llama a signUp', async () => {
    irA('/registro');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Crea tu cuenta en la app CLIMESA para Android o iOS' })).toBeTruthy();
    expect(screen.queryByLabelText('Contraseña')).toBeNull();
    expect(screen.queryByRole('button', { name: /Crear cuenta/ })).toBeNull();
    expect(screen.getByRole('link', { name: /Volver al ingreso/ }).getAttribute('href')).toBe('/');
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
