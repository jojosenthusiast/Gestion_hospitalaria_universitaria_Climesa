import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile } from '../lib/api';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';
import apiFuente from '../lib/api.ts?raw';
import clienteGenerado from '../lib/generated/openapi.d.ts?raw';

// Supabase simulado: ninguna prueba toca la red ni una cuenta real.
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
}));
const live = vi.hoisted(() => ({ status: 'live' as 'live' | 'polling' | 'offline' | 'reconnecting' }));
vi.mock('../lib/supabase', () => ({ supabase: { auth, channel: vi.fn() } }));
vi.mock('../lib/live', () => ({ useLive: () => ({ version: 0, status: live.status }) }));

import App from '../App';

const session = { access_token: 'token-ficticio', user: { id: 'u-1', email: 'prueba@example.test' } };

// Permisos REALES de cada rol: se leen de docs/arquitectura/datos/permisos.csv (fuente de verdad).
function permisosDe(rol: string): { code: string; context: string }[] {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  expect(columna, `rol ${rol} en permisos.csv`).toBeGreaterThan(1);
  return filas
    .map((fila) => fila.split(','))
    .filter((celdas) => celdas[columna]?.trim())
    .map((celdas) => ({ code: celdas[0], context: celdas[columna].trim() }));
}

function perfil(rol: string, permisos = permisosDe(rol), plataformas = ['web']): AccessProfile {
  return {
    id: 'u-1', user: { id: 'u-1', email: 'prueba@example.test' }, email: 'prueba@example.test',
    name: 'Cuenta de prueba', roles: [rol], platforms: plataformas, permissions: permisos, channels: ['publico'], patientId: null, staffId: null,
  };
}

const json = (cuerpo: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } }));

type Rutas = Record<string, () => Promise<Response>>;
function simular(profile: AccessProfile, rutas: Rutas = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const ruta = String(url).replace(/^https?:\/\/[^/]+\/api\/v1/, '').split('?')[0];
    if (ruta === '/auth/me') return json(profile);
    return rutas[ruta]?.() ?? new Promise<Response>(() => {});
  }));
}

async function entrar(profile: AccessProfile, rutas: Rutas = {}, hash = '') {
  auth.getSession.mockResolvedValue({ data: { session } });
  simular(profile, rutas);
  window.history.pushState({}, '', '/');
  window.location.hash = hash;
  render(<App />);
  return screen.findByRole('navigation', { name: 'Navegación principal' });
}

const etiquetas = (nav: HTMLElement) => within(nav).getAllByRole('link').map((a) => a.textContent);

beforeEach(() => {
  live.status = 'live';
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.signOut.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.location.hash = ''; });

// FR-120-02 / escenario 1: cada rol con web ve únicamente el menú que sus permisos reales habilitan.
const menuEsperado: Record<string, string[]> = {
  ADM: ['Inicio', 'Personal', 'Edificio', 'Turnos', 'Usuarios', 'Perfil'],
  JOP: ['Inicio', 'Personal', 'Camas', 'Edificio', 'Ambulancia', 'Turnos', 'Inventario', 'Perfil'],
  REC: ['Inicio', 'Pacientes', 'Camas', 'Edificio', 'Ambulancia', 'Turnos', 'Fila del día', 'Citas', 'Perfil'],
  LAB: ['Inicio', 'Laboratorio', 'Inventario', 'Perfil'],
  DPD: ['Inicio', 'Usuarios', 'Auditoría', 'Accesos excepcionales', 'Perfil'],
};
const todas = [...new Set(Object.values(menuEsperado).flat())];

describe('menú por rol con los permisos reales (escenario 1, FR-120-02)', () => {
  it('los permisos de la prueba salen de permisos.csv y coinciden con las plataformas de roles.csv', () => {
    expect(permisosDe('LAB').map((p) => p.code)).toContain('laboratorio.ver_cola');
    expect(permisosDe('DPD').map((p) => p.code)).toContain('auditoria.ver');
    expect(permisosDe('ADM').map((p) => p.code)).not.toContain('camas.ver_tablero');
  });

  for (const [rol, menu] of Object.entries(menuEsperado)) {
    it(`${rol} ve exactamente: ${menu.join(', ')}`, async () => {
      const nav = await entrar(perfil(rol));
      expect(etiquetas(nav)).toEqual(menu);
      for (const ajena of todas.filter((e) => !menu.includes(e))) {
        expect(within(nav).queryByRole('link', { name: ajena }), `${rol} no debe ver ${ajena}`).toBeNull();
      }
    });
  }

  it('el laboratorista del escenario 1 solo ve Inicio, Laboratorio, Inventario y Perfil', async () => {
    const nav = await entrar(perfil('LAB'));
    expect(etiquetas(nav)).toEqual(['Inicio', 'Laboratorio', 'Inventario', 'Perfil']);
  });

  it('el menú depende de los permisos de /auth/me, no del nombre del rol', async () => {
    // Un REC al que la API no le concede fila.ver ni citas.ver no ve esas entradas.
    const sinAgenda = permisosDe('REC').filter((p) => !['fila.ver', 'citas.ver'].includes(p.code));
    const nav = await entrar(perfil('REC', sinAgenda));
    expect(etiquetas(nav)).toEqual(['Inicio', 'Pacientes', 'Camas', 'Edificio', 'Ambulancia', 'Turnos', 'Perfil']);
  });

  it('un laboratorista sin laboratorio.ver_cola ni inventario.ver no ve esos módulos', async () => {
    const solo = permisosDe('LAB').filter((p) => !['laboratorio.ver_cola', 'inventario.ver'].includes(p.code));
    const nav = await entrar(perfil('LAB', solo));
    expect(etiquetas(nav)).toEqual(['Inicio', 'Perfil']);
  });

  it('una ruta ajena al rol muestra "Sin permiso" y no pide datos del módulo', async () => {
    const nav = await entrar(perfil('LAB'), {}, '#/usuarios');
    expect(await screen.findByRole('heading', { name: /Sin permiso/ })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).toBeNull();
    const llamadas = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(llamadas.some((u) => u.includes('/usuarios'))).toBe(false);
  });
});

describe('rol sin web (FR-120-03)', () => {
  it('un médico (Android e iOS) ve "Tu rol no usa esta aplicación" y ningún menú', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    simular(perfil('MED', permisosDe('MED'), ['ios', 'android']));
    render(<App />);
    expect(await screen.findByText('Tu rol no usa esta aplicación')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
  });
});

describe('estados comunes (FR-120-06)', () => {
  it('cargando: el resumen muestra "Cargando información" mientras la API responde', async () => {
    await entrar(perfil('JOP'));
    expect(await screen.findByText(/Cargando información/)).toBeTruthy();
  });

  it('vacío: la auditoría sin eventos muestra "Todavía no hay actividad"', async () => {
    await entrar(perfil('DPD'), { '/auditoria': () => json([]) }, '#/auditoria');
    expect(await screen.findByText('Todavía no hay actividad')).toBeTruthy();
  });

  it('error: un fallo del servidor muestra el aviso y permite volver a intentar', async () => {
    await entrar(perfil('DPD'), { '/auditoria': () => json({ detail: 'El servicio no está disponible.' }, 500) }, '#/auditoria');
    expect(await screen.findByText('El servicio no está disponible.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });

  it('sin permiso: un 403 de la API muestra que la cuenta no puede consultar la sección', async () => {
    await entrar(perfil('DPD'), { '/auditoria': () => json({ detail: 'Prohibido' }, 403) }, '#/auditoria');
    expect(await screen.findByText('Tu cuenta no tiene permiso para consultar esta sección.')).toBeTruthy();
  });

  it('sin conexión: muestra la banda y avisa que no se pueden guardar cambios', async () => {
    live.status = 'offline';
    await entrar(perfil('JOP'));
    expect(await screen.findByText('Sin conexión. No se pueden guardar cambios.')).toBeTruthy();
  });

  it('reconectando: muestra la banda de recuperación del canal', async () => {
    live.status = 'reconnecting';
    await entrar(perfil('JOP'));
    expect(await screen.findByText(/Recuperando la conexión/)).toBeTruthy();
  });
});

describe('cliente de API generado (FR-120-01)', () => {
  it('api.ts tipa los DTO con el cliente generado desde el contrato OpenAPI', () => {
    expect(apiFuente).toContain("from './generated/openapi'");
    expect(apiFuente).toMatch(/components\['schemas'\]\['PatientCreateDto'\]/);
  });

  it('el cliente generado incluye las rutas que usa el portal', () => {
    for (const ruta of ['/api/v1/auth/me', '/api/v1/pacientes', '/api/v1/usuarios']) {
      expect(clienteGenerado, ruta).toContain(`"${ruta}"`);
    }
  });
});
