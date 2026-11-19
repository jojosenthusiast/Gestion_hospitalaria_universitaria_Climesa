import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { formatDuration, localDayKey } from '../lib/format';
import { Dashboard } from '../features/dashboards';
import { modules } from '../features/shell';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

afterEach(cleanup);

// Permisos reales de cada rol (permisos.csv), como en navegacion.test.tsx.
function permisosDe(rol: string) {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
}
const perfil = (rol: string, roles = [rol]): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'p@example.test', name: 'Persona Ficticia', roles, platforms: ['web'], permissions: roles.flatMap(permisosDe), channels: [], patientId: null, staffId: null });

const hoy = new Date().toISOString();
const enUnaHora = new Date(Date.now() + 3600_000).toISOString();
const tablero = { actualizadoEn: hoy, fecha: hoy.slice(0, 10), camas: { total: 17, libres: 5, ocupadas: 10, limpieza: 2, bloqueadas: 0, reservadas: 0 }, ocupacionPorPlanta: [], ambulancia: { estado: 'disponible', paramedicoDeTurno: true }, fila: { emitidos: 5, enEspera: 3, llamados: 1, enAtencion: 0, atendidos: 1, noSePresento: 0 }, laboratorio: { pendiente: 2, enProceso: 1, completadoHoy: 4, canceladoHoy: 0 }, cobertura: { huecos: 1, detalle: [{ area: 'Emergencia', rol: 'ENF', inicio: hoy, fin: enUnaHora, requeridos: 2, actuales: 1 }] }, turnosEnCurso: 4, pacientesActivos: 30 };
const respuestas: Record<string, unknown> = {
  '/inicio': { lastUpdate: hoy, beds: { total: 17, free: 5, occupied: 10 }, patients: { total: 40, active: 38 } },
  '/metricas/tablero': tablero,
  '/fila': [{ id: 't1', service: 'consulta', numero: 7, patientName: 'Ana Ficticia', state: 'en_espera', issuedAt: hoy }, { id: 't2', service: 'consulta', numero: 8, state: 'atendido', issuedAt: hoy }],
  '/citas': [{ id: 'c1', patientId: 'p1', patientName: 'Luis Ficticio', doctorId: 'd', doctorName: 'Dra. Ficticia', start: enUnaHora, end: enUnaHora, state: 'solicitada', origin: 'app', version: 1 }],
  '/admisiones': [{ id: 'a1', patientName: 'Paciente Ficticio', state: 'pendiente_cama', requestedCategory: 'vip', isolation: false, bed: '' }],
  '/ambulancia': { unit: { id: 'u', plate: 'P-1', state: 'disponible', version: 1 }, activeService: null, paramedicOnDuty: true, pendingRequests: [] },
  '/laboratorio/ordenes': [{ id: 'o1', patientName: 'Marta Ficticia', priority: 'urgente', state: 'pendiente', createdAt: hoy, items: [{ id: 'i', name: 'Hemograma' }] }, { id: 'o2', patientName: 'Ivo Ficticio', priority: 'rutina', state: 'completado', createdAt: hoy, completedAt: enUnaHora, items: [{ id: 'i', name: 'Glucosa' }] }],
  '/inventario/existencias': [{ articulo_id: 'x', codigo: 'R-1', nombre: 'Reactivo ficticio', tipo: 'reactivo', unidad: 'u', minimo: 10, disponible: 2, vencido: 0, bajo_minimo: true }],
  '/turnos/mios': [], '/usuarios': [{ id: 'u1', email: 'm@example.test', name: 'Médica Ficticia', roles: ['MED'], state: 'activo', version: 1 }], '/personal': [{ id: 's', givenNames: 'A', surnames: 'B', type: 'medico', active: true, version: 1 }],
  '/auditoria': [{ seq: '1', at: hoy, role: 'MED', actor: 'x', action: 'consulta.leer', entity: 'consulta', entityId: 'c', result: 'denegado' }],
  '/camas': [{ id: 'b1', code: 'H2-01A', roomId: 'r', room: 'Hab 201', category: 'semiprivada', level: 2, state: 'limpieza', version: 1, cleaningPending: true, cleaningCompleted: false, cleanedByCurrentUser: false, path: '' }],
  '/consultas/agenda': [{ appointmentId: 'c1', patientId: 'p', patientName: 'Luis Ficticio', start: enUnaHora, end: enUnaHora, appointmentState: 'confirmada' }],
  '/me/laboratorio': [],
};
function montar(profile: AccessProfile, falla: string[] = []) {
  const api = { request: vi.fn(async (path: string) => { const clave = path.split('?')[0]; if (falla.includes(clave)) throw new ApiError('El servicio no está disponible.', 500); return respuestas[clave] ?? []; }), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
  render(<Dashboard api={api} profile={profile} version={0} />);
  return api;
}
const hrefs = () => screen.getAllByRole('link').map(a => a.getAttribute('href'));

describe('R7 C-6 · aviso al paciente', () => {
  it('PAC ve «Examen en otro sitio» con el lugar y las instrucciones de su orden externa pendiente', async () => {
    respuestas['/me/laboratorio'] = [
      { id: 'o-ext', priority: 'rutina', state: 'pendiente', createdAt: hoy, items: [{ id: 'i', name: 'Glucosa' }], external: true, externalPlace: 'Laboratorio Ejemplo, San Salvador', externalInstructions: 'Ir en ayunas con este documento.' },
      { id: 'o-int', priority: 'rutina', state: 'pendiente', createdAt: hoy, items: [{ id: 'i', name: 'Hemograma' }], external: false, externalPlace: null },
    ];
    try {
      montar(perfil('PAC'));
      const tray = await screen.findByRole('region', { name: 'Pendientes' });
      expect(await within(tray).findByText('Examen en otro sitio: Laboratorio Ejemplo, San Salvador')).toBeTruthy();
      expect(within(tray).getByText(/Glucosa · Ir en ayunas con este documento\./)).toBeTruthy();
      expect(within(tray).queryByText(/Hemograma/)).toBeNull();
    } finally { respuestas['/me/laboratorio'] = []; }
  });
});

describe('inicio por rol', () => {
  it('REC: acciones rápidas reales con ?accion=, cifras y lista de atención con acción directa', async () => {
    montar(perfil('REC'));
    const acciones = screen.getByRole('region', { name: 'Acciones rápidas' });
    expect(within(acciones).getByRole('link', { name: /Registrar paciente/ }).getAttribute('href')).toBe('#/pacientes?accion=registrar');
    expect(within(acciones).getByRole('link', { name: /Agendar cita/ }).getAttribute('href')).toBe('#/citas?accion=agendar');
    expect(within(acciones).getByRole('link', { name: /Solicitar ambulancia/ }).getAttribute('href')).toBe('#/ambulancia?accion=solicitud');
    // R4a: «Requiere tu atención» and «Fila del día por estado» became the ONE pending tray and the day's figures.
    const atencion = await screen.findByRole('region', { name: 'Pendientes' });
    // Accounts link on their own by verified email (owner observations 2026-11-18, batch 2): no group asks to verify them.
    expect(within(atencion).queryByText('Vinculaciones por verificar')).toBeNull();
    expect(await screen.findByRole('region', { name: 'Cifras del día' })).toBeTruthy();
    expect(screen.queryByText('Accesos directos')).toBeNull();
  });

  it('las acciones solo aparecen con el permiso: JOP no registra pacientes ni invita personas', async () => {
    montar(perfil('JOP'));
    const acciones = screen.getByRole('region', { name: 'Acciones rápidas' });
    expect(within(acciones).getByRole('link', { name: /Planificar turno/ }).getAttribute('href')).toBe('#/turnos?accion=planificar');
    expect(within(acciones).queryByRole('link', { name: /Registrar paciente/ })).toBeNull();
    expect(within(acciones).queryByRole('link', { name: /Invitar persona/ })).toBeNull();
    // R4a: coverage gaps are a tray group; its count is the only place the number shows.
    expect(await screen.findByRole('region', { name: 'Turnos por cubrir hoy' })).toBeTruthy();
  });

  it('ADM: invitar y agregar espacio, sin contenido clínico', async () => {
    montar(perfil('ADM'));
    const acciones = screen.getByRole('region', { name: 'Acciones rápidas' });
    expect(within(acciones).getByRole('link', { name: /Invitar persona/ }).getAttribute('href')).toBe('#/personal?accion=invitar');
    expect(within(acciones).getByRole('link', { name: /Agregar espacio/ }).getAttribute('href')).toBe('#/espacios?accion=crear');
    // R4a: the «Cuentas por estado» donut repeated the account figures; the breakdown by role stays.
    expect(await screen.findByRole('region', { name: 'Cuentas activas por rol' })).toBeTruthy();
    expect(screen.queryByText(/Hemograma|Paciente Ficticio/)).toBeNull();
  });

  it('LAB: cola, tiempo promedio y muestra pendiente con su acción', async () => {
    montar(perfil('LAB'));
    // R4a: pending samples and low stock are groups of the one pending tray.
    const atencion = await screen.findByRole('region', { name: 'Muestras por tomar' });
    expect(await within(atencion).findByText('Marta Ficticia')).toBeTruthy();
    expect(within(atencion).getByRole('link', { name: /Tomar muestra/ }).getAttribute('href')).toBe('#/laboratorio?orden=o1&accion=muestra');
    expect(await screen.findByRole('region', { name: 'Inventario bajo el mínimo' })).toBeTruthy();
    expect(await screen.findByText('Reactivo ficticio')).toBeTruthy();
  });

  it('D3: LAB lee su tiempo de entrega de /laboratorio/tiempo-entrega (promedio y mediana), no de la lista de órdenes', async () => {
    const dia = localDayKey(new Date());
    respuestas['/laboratorio/tiempo-entrega'] = { indicador: 'tiempo_laboratorio', unidad: 'minutos', desde: dia, hasta: dia, actualizadoEn: hoy, serie: [{ fecha: dia, valor: 70, mediana: 40, muestras: 3 }], resumen: { promedio: 70, mediana: 40, muestras: 3 } };
    try {
      const { container } = render(<Dashboard api={{ request: vi.fn(async (path: string) => respuestas[path.split('?')[0]] ?? []), write: vi.fn() } as unknown as Api} profile={perfil('LAB')} version={0} />);
      const figura = async (id: string) => { await screen.findAllByText(/Mediana hoy/); return container.querySelector(`[data-figure="${id}"] .figure-value`)?.textContent; };
      expect(await figura('lab-mediana')).toBe(formatDuration(40));
      expect(await figura('lab-tiempo')).toBe(formatDuration(70));
      // The list has one completed order; the API counted three today.
      expect(await figura('lab-hoy')).toBe('3');
      expect(await screen.findByRole('region', { name: 'Tiempo de entrega (7 días)' })).toBeTruthy();
    } finally { delete respuestas['/laboratorio/tiempo-entrega']; }
  });

  it('DPD: denegados en rojo y acción de verificar la cadena', async () => {
    montar(perfil('DPD'));
    expect(screen.getByRole('link', { name: /Verificar la cadena/ }).getAttribute('href')).toBe('#/auditoria?accion=verificar');
    // R4a (W-DPD-2): the action reads as a label, never the permission code.
    expect((await screen.findAllByText('Consulta · consulta')).length).toBeGreaterThan(0);
    expect(screen.queryByText('consulta.leer')).toBeNull();
  });

  it('ENF, MED, PAR y PAC también tienen su tablero; ENF absorbe «Quién sigue» del asistente', async () => {
    for (const [rol, titulo] of [['ENF', 'Limpiezas por registrar o verificar'], ['MED', 'Mi agenda de hoy'], ['ENF', 'Quién sigue'], ['PAR', 'Servicio en curso'], ['PAC', 'Mis próximas citas']] as const) {
      montar(perfil(rol));
      expect(await screen.findByRole('region', { name: titulo }), rol).toBeTruthy();
      cleanup();
    }
  });

  it('una fuente que falla no tumba el resto: muestra el error con reintento y sigue con lo demás', async () => {
    montar(perfil('REC'), ['/fila']);
    expect(await screen.findByText('El servicio no está disponible.')).toBeTruthy();
    // R1: one section state everywhere; the retry reads «Volver a intentar» in modules, panels and trays.
    expect(screen.getAllByRole('button', { name: 'Volver a intentar' }).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Luis Ficticio')).length).toBeGreaterThan(0);
  });

  it('estado vacío: sin datos dice qué falta', async () => {
    const api = { request: vi.fn(async () => []), write: vi.fn() } as unknown as Api;
    render(<Dashboard api={api} profile={perfil('LAB')} version={0} />);
    // R4a: an empty tray is one line for the whole tray, not one per panel.
    expect(await screen.findByText('Al día: nada pendiente.')).toBeTruthy();
  });

  it('con dos roles muestra ambos tableros sin selector de rol y sin pedir fuentes que nadie usa', async () => {
    const api = montar(perfil('ADM', ['ADM', 'LAB']));
    // R4a: one tray and one figure strip for both roles; each role keeps its own panels.
    expect(await screen.findByRole('region', { name: 'Cuentas activas por rol' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Tiempo de entrega (7 días)' })).toBeTruthy();
    expect(screen.getAllByRole('region', { name: 'Pendientes' })).toHaveLength(1);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(api.request.mock.calls.some(([p]) => String(p).startsWith('/consultas/agenda'))).toBe(false);
    expect(hrefs().length).toBeGreaterThan(0);
  });

  it('sin rol conocido no inventa un tablero', () => {
    montar({ ...perfil('REC'), roles: ['XYZ'], permissions: [{ code: 'sesion.perfil', context: 'x' }] });
    expect(screen.getByText('Tu función no tiene un tablero en la web')).toBeTruthy();
  });
  it('ADM: cada enlace del tablero abre un módulo que existe (antes «#/usuarios» daba «Página no encontrada»)', async () => {
    montar(perfil('ADM'));
    await screen.findAllByText('Cuentas activas por rol');
    const routes = hrefs().filter((h): h is string => !!h && h.startsWith('#/')).map(h => h.slice(2).split('?')[0]);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.filter(r => !modules.some(m => m.id === r))).toEqual([]);
  });
});
