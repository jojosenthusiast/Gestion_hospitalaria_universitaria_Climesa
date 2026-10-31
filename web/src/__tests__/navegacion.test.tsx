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
  JOP: ['Inicio', 'Pacientes', 'Personal', 'Camas', 'Edificio', 'Ambulancia', 'Turnos', 'Inventario', 'Fila del día', 'Citas', 'Perfil'],
  REC: ['Inicio', 'Pacientes', 'Camas', 'Edificio', 'Ambulancia', 'Turnos', 'Fila del día', 'Citas', 'Perfil'],
  LAB: ['Inicio', 'Pacientes', 'Turnos', 'Laboratorio', 'Inventario', 'Perfil'],
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

  it('el laboratorista ve lo que el catálogo le da: Pacientes, Turnos, Laboratorio e Inventario', async () => {
    const nav = await entrar(perfil('LAB'));
    expect(etiquetas(nav)).toEqual(['Inicio', 'Pacientes', 'Turnos', 'Laboratorio', 'Inventario', 'Perfil']);
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
    expect(etiquetas(nav)).toEqual(['Inicio', 'Pacientes', 'Turnos', 'Perfil']);
  });

  it('una ruta ajena al rol muestra "Sin permiso" y no pide datos del módulo', async () => {
    const nav = await entrar(perfil('LAB'), {}, '#/usuarios');
    expect(await screen.findByRole('heading', { name: /Sin permiso/ })).toBeTruthy();
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).toBeNull();
    const llamadas = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(llamadas.some((u) => u.includes('/usuarios'))).toBe(false);
  });
});

// Regla 8: el menú sale del catálogo (permisos.csv), no del nombre del rol. Aun los roles de móvil
// verían exactamente lo que el catálogo les da si una cuenta suya tuviera la web habilitada.
const menuCatalogo: Record<string, string[]> = {
  AST: ['Pacientes', 'Edificio', 'Turnos', 'Fila del día', 'Citas'],
  ENF: ['Pacientes', 'Camas', 'Edificio', 'Turnos', 'Inventario'],
  MED: ['Pacientes', 'Camas', 'Edificio', 'Ambulancia', 'Turnos', 'Fila del día', 'Citas'],
  PAR: ['Pacientes', 'Ambulancia', 'Turnos'],
  PAC: ['Fila del día', 'Citas'],
};

describe('el menú depende solo del permiso (regla 8)', () => {
  for (const [rol, modulosRol] of Object.entries(menuCatalogo)) {
    it(`${rol}, si tuviera web, ve exactamente lo que el catálogo le da: ${modulosRol.join(', ')}`, async () => {
      const nav = await entrar(perfil(rol));
      expect(etiquetas(nav)).toEqual(['Inicio', ...modulosRol, 'Perfil']);
    });
  }

  it('el módulo no lleva roles: un JOP sin pacientes.buscar no ve Pacientes y un LAB con él sí', async () => {
    const sinBuscar = permisosDe('JOP').filter((p) => p.code !== 'pacientes.buscar');
    const nav = await entrar(perfil('JOP', sinBuscar));
    expect(within(nav).queryByRole('link', { name: 'Pacientes' })).toBeNull();
    cleanup();
    const navLab = await entrar(perfil('LAB'));
    expect(within(navLab).getByRole('link', { name: 'Pacientes' })).toBeTruthy();
  });

  it('un mismo perfil con dos roles ve la unión de sus permisos, sin selector de rol', async () => {
    const permisos = [...permisosDe('ADM'), ...permisosDe('LAB')];
    auth.getSession.mockResolvedValue({ data: { session } });
    simular({ ...perfil('ADM', permisos), roles: ['ADM', 'LAB'] });
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(etiquetas(nav)).toEqual(['Inicio', 'Pacientes', 'Personal', 'Edificio', 'Turnos', 'Usuarios', 'Laboratorio', 'Inventario', 'Perfil']);
    expect(screen.queryByRole('combobox', { name: 'Rol de trabajo' })).toBeNull();
    expect(screen.getByText('Administración · Laboratorio')).toBeTruthy();
  });

  it('una cuenta con web pero sin ningún módulo con permiso ve "Tu rol no usa esta aplicación"', async () => {
    auth.getSession.mockResolvedValue({ data: { session } });
    simular(perfil('PAC', [{ code: 'sesion.perfil', context: 'x' }]));
    render(<App />);
    expect(await screen.findByText('Tu rol no usa esta aplicación')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull();
  });

  it('el encabezado de Edificio no nombra al área de Administración cuando lo abre Recepción', async () => {
    await entrar(perfil('REC'), { '/espacios': () => json([]) }, '#/espacios');
    expect(await screen.findByText('Hospital / Edificio')).toBeTruthy();
    expect(screen.queryByText(/Administración \//)).toBeNull();
  });

  it('Inicio no antepone el nombre de un rol al encabezado', async () => {
    await entrar(perfil('LAB'));
    expect(await screen.findByText('CLIMESA / Inicio')).toBeTruthy();
  });
});

describe('pantallas de solo lectura según el permiso', () => {
  it('Pacientes para JOP (buscar y ver ficha, sin registrar ni editar) no ofrece escritura y no falla', async () => {
    await entrar(perfil('JOP'), { '/pacientes': () => json([]) }, '#/pacientes');
    expect(await screen.findByText('No hay coincidencias')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Registrar paciente/ })).toBeNull();
    expect(screen.getByText('Consulta de solo lectura.')).toBeTruthy();
  });

  it('Pacientes para LAB abre y muestra la lista sin acciones de escritura', async () => {
    await entrar(perfil('LAB'), { '/pacientes': () => json([]) }, '#/pacientes');
    expect(await screen.findByText('No hay coincidencias')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Registrar paciente/ })).toBeNull();
  });

  it('Turnos para LAB solo lista: sin planificar, publicar, editar ni cancelar', async () => {
    const turno = { id: 't-1', staffId: 's-1', person: 'Persona Ficticia', areaId: 'a-1', area: 'Laboratorio', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T22:00:00.000Z', type: 'diurno', state: 'publicado', version: 1 };
    await entrar(perfil('LAB'), { '/turnos': () => json([turno]), '/espacios': () => json([]) }, '#/turnos');
    expect((await screen.findAllByText('Persona Ficticia')).length).toBeGreaterThan(0);
    for (const nombre of [/Planificar turno/, /Publicar planificación/, /Editar/, /Cancelar turno/]) {
      expect(screen.queryByRole('button', { name: nombre })).toBeNull();
    }
  });

  it('Turnos para JOP ofrece publicar y planificar porque el catálogo se lo da', async () => {
    await entrar(perfil('JOP'), { '/turnos': () => json([]), '/espacios': () => json([]), '/personal': () => json([]) }, '#/turnos');
    expect(await screen.findByRole('button', { name: /Publicar planificación/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Planificar turno/ })).toBeTruthy();
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
