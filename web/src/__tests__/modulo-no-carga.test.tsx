import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile } from '../lib/api';

// Fase 2, S3 (revisión PR #125): un módulo con carga diferida cuyo archivo no llega (pestaña abierta durante un
// despliegue que reemplazó los archivos, o conexión caída) no deja la aplicación en blanco.
const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn(), signOut: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { auth, channel: vi.fn() } }));
vi.mock('../lib/live', () => ({ useLive: () => ({ version: 0, signal: { any: 0, counts: {} }, updatedAt: null, status: 'live' }) }));
// A rejected lazy import reaches the boundary the same way: React rethrows it while rendering the module.
vi.mock('../features/metrics', () => ({ MetricsPage: () => { throw new TypeError('Failed to fetch dynamically imported module'); } }));

import App from '../App';

const profile: AccessProfile = {
  id: 'u-1', user: { id: 'u-1', email: 'adm@example.test' }, email: 'adm@example.test', name: 'Cuenta de prueba', roles: ['ADM'],
  platforms: ['web'], permissions: [{ code: 'metricas.ver', context: 'x' }], channels: ['publico'], patientId: null, staffId: null,
};
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.getSession.mockResolvedValue({ data: { session: { access_token: 'token-ficticio', user: { id: 'u-1', email: 'adm@example.test' } } } });
  vi.stubGlobal('fetch', vi.fn((url: string) => String(url).includes('/auth/me') ? json(profile) : new Promise<Response>(() => {})));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.location.hash = ''; });

describe('módulo que no se pudo descargar', () => {
  it('muestra un aviso con reintentar y recargar, y el menú sigue disponible', async () => {
    window.history.pushState({}, '', '/');
    window.location.hash = '#/metricas';
    render(<App />);
    expect(await screen.findByText(/No se pudo abrir este módulo/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recargar la página' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
  });
});
