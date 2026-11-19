import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { Dashboard } from '../features/dashboards';
import { AttentionList } from '../features/dashboards/parts';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

// R4a (S2, S8, §4.2): Inicio is the «panel del día»: critical banner (only when one exists), then ONE pending tray,
// then the day's figures shown once. No datum appears twice on the screen.
afterEach(cleanup);

function permisosDe(rol: string) {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
}
const perfil = (rol: string): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'p@example.test', name: 'Persona Ficticia', roles: [rol], platforms: ['web'], permissions: permisosDe(rol), channels: [], patientId: null, staffId: null });

const hoy = new Date().toISOString();
const enUnaHora = new Date(Date.now() + 3600_000).toISOString();
const nombreLargo = 'María de los Ángeles Hernández de Martínez';
const cita = (id: string, state: string, start = enUnaHora) => ({ id, patientId: 'p', patientName: `Paciente ${id}`, doctorId: 'd', doctorName: 'Dra. Ficticia', start, end: start, state, origin: 'app', version: 1 });
const respuestas: Record<string, unknown> = {
  '/inicio': { lastUpdate: hoy, beds: { total: 42, free: 21, occupied: 15 }, patients: { total: 330, active: 125 } },
  '/metricas/tablero': { actualizadoEn: hoy, fecha: hoy.slice(0, 10), camas: { total: 42, libres: 21, ocupadas: 15, limpieza: 3, bloqueadas: 0, reservadas: 0 }, ocupacionPorPlanta: [], ambulancia: { estado: 'disponible', paramedicoDeTurno: true }, fila: { emitidos: 19, enEspera: 7, llamados: 4, enAtencion: 2, atendidos: 6, noSePresento: 0 }, laboratorio: { pendiente: 13, enProceso: 5, completadoHoy: 9, canceladoHoy: 0 }, cobertura: { huecos: 2, detalle: [{ area: 'Emergencia', rol: 'ENF', inicio: hoy, fin: enUnaHora, requeridos: 1, actuales: 0 }, { area: 'Consulta', rol: 'MED', inicio: hoy, fin: enUnaHora, requeridos: 3, actuales: 1 }] }, turnosEnCurso: 38, pacientesActivos: 125 },
  '/fila': [
    ...Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, service: 'consulta_general', numero: i + 1, state: 'en_espera', issuedAt: hoy })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `l${i}`, service: 'consulta_general', numero: i + 20, state: 'llamado', issuedAt: hoy })),
  ],
  // 2 «solicitada» + 9 confirmed today.
  '/citas': [cita('s1', 'solicitada'), cita('s2', 'solicitada'), ...Array.from({ length: 9 }, (_, i) => cita(`c${i}`, 'confirmada'))],
  // S8: a request by category, without doctor, is also a «Solicitud de cita».
  '/citas/solicitudes-categoria': [{ id: 'q1', patientName: 'Paciente Por Motivo', categories: [{ code: 'piel', name: 'Piel' }], franja: 'tarde', note: null, state: 'pendiente', createdAt: hoy }],
  '/admisiones': [{ id: 'a1', patientName: 'Paciente Sin Cama', state: 'pendiente_cama', requestedCategory: 'general', isolation: false, bed: '' }],
  '/ambulancia': { unit: { id: 'u', plate: 'P-1', state: 'disponible', version: 1 }, activeService: null, paramedicOnDuty: true, pendingRequests: [] },
  '/inventario/existencias': Array.from({ length: 8 }, (_, i) => ({ articulo_id: `x${i}`, codigo: `R-${i}`, nombre: i === 0 ? 'Jeringa de 5 ml' : `Reactivo ${i}`, tipo: 'reactivo', unidad: 'unidad', minimo: 10, disponible: i === 0 ? 0 : 2, vencido: 0, bajo_minimo: true })),
  '/laboratorio/ordenes': [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, patientName: `Muestra ${i}`, priority: 'rutina', state: 'pendiente', createdAt: hoy, items: [{ id: 'i', name: 'Hemograma' }] })),
    ...Array.from({ length: 3 }, (_, i) => ({ id: `x${i}`, patientName: `Proceso ${i}`, priority: 'rutina', state: 'en_proceso', createdAt: hoy, items: [{ id: 'i', name: 'Glucosa' }] })),
  ],
  '/laboratorio/seguimientos': [], '/laboratorio/pendientes': [], '/turnos/mios': [],
  '/usuarios': [...Array.from({ length: 3 }, (_, i) => ({ id: `u${i}`, email: `m${i}@example.test`, name: `Médica ${i}`, roles: ['MED'], state: 'activo', staffId: `s${i}`, version: 1 })), { id: 'ub', email: 'b@example.test', name: 'Baja Ficticia', roles: ['REC'], state: 'desactivado', version: 1 }],
  '/personal': Array.from({ length: 2 }, (_, i) => ({ id: `s${i}`, givenNames: 'A', surnames: 'B', type: 'medico', active: true, version: 1 })),
  '/auditoria': [{ seq: '1', at: hoy, role: 'MED', actor: 'x', action: 'admision.leer', entity: 'ticket_fila', entityId: 'c', result: 'denegado' }],
};
function montar(rol: string) {
  const api = { request: vi.fn(async (path: string) => respuestas[path.split('?')[0]] ?? []), write: vi.fn() } as unknown as Api;
  return render(<Dashboard api={api} profile={perfil(rol)} version={0} />);
}
/** Every number the screen shows as a datum: figure values and tray counts. */
const datos = (container: HTMLElement) => [...container.querySelectorAll('[data-figure] .figure-value, .tray-count')].map(n => n.textContent?.trim()).filter(v => v && v !== '0' && v !== '—');

describe('Inicio · panel del día', () => {
  it('REC: una sola bandeja de pendientes antes de las cifras del día; sin KPI ni paneles repetidos', async () => {
    const { container } = montar('REC');
    const bandeja = await screen.findByRole('region', { name: 'Pendientes' });
    const cifras = await screen.findByRole('region', { name: 'Cifras del día' });
    expect(bandeja.compareDocumentPosition(cifras) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole('region', { name: 'Pendientes' })).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Requiere tu atención' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Fila del día por estado' })).toBeNull();
    expect(container.querySelector('.kpi-row')).toBeNull();
    await within(cifras).findByText('7');
  });

  it('REC: «Solicitudes de cita» cuenta también las solicitudes por motivo (S8)', async () => {
    montar('REC');
    const grupo = await screen.findByRole('region', { name: 'Solicitudes de cita' });
    expect((await within(grupo).findByText('3')).className).toContain('tray-count');
    expect(within(grupo).getByText('Paciente Por Motivo')).toBeTruthy();
    // #9: «Asignar» opens the assign panel of that request, not just the agenda.
    const row = within(grupo).getByText('Paciente Por Motivo').closest('li') as HTMLElement;
    expect(within(row).getByRole('link', { name: /Asignar/ }).getAttribute('href')).toBe('#/citas?asignar=q1');
  });

  it('REC: exactly one primary quick action («Emitir número»); the rest are secondary', async () => {
    montar('REC');
    const actions = await screen.findByRole('region', { name: 'Acciones rápidas' });
    const primary = actions.querySelectorAll('a.is-primary');
    expect(primary).toHaveLength(1);
    expect(primary[0].textContent).toContain('Emitir número');
    expect(within(actions).getAllByRole('link').length).toBeGreaterThan(1);
  });

  it('REC: ningún dato aparece dos veces', async () => {
    const { container } = montar('REC');
    await within(await screen.findByRole('region', { name: 'Cifras del día' })).findByText('7');
    const valores = datos(container);
    expect(valores.length).toBeGreaterThan(4);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('REC: el nombre largo ocupa su propia línea; ya no hay vinculaciones por verificar', async () => {
    montar('REC');
    // Owner observations 2026-11-18 (batch 2): accounts link on their own by verified email, so no tray group asks for it.
    await screen.findByRole('region', { name: 'Cifras del día' });
    expect(screen.queryByText('Vinculaciones por verificar')).toBeNull();
    expect(document.querySelector('a[href="#/vinculaciones"]')).toBeNull();
    cleanup();
    render(<AttentionList items={[{ id: 'n', title: nombreLargo, detail: 'pide una cita', tone: 'warn', href: '#/citas', action: 'Asignar', tag: 'Por asignar' }]} />);
    const nombre = screen.getByText(nombreLargo);
    // Line 1 is the name alone (no «(pide una cita)», no chip, no button inside it).
    expect(nombre.className).toContain('tray-row-name');
    expect(nombre.textContent).toBe(nombreLargo);
    expect(nombre.querySelector('.status-tag, .row-action')).toBeNull();
    expect(nombre.closest('li')!.querySelector('.tray-row-meta')!.textContent).not.toContain(nombreLargo);
  });

  it('JOP: sin la tercera rejilla de resumen y sin datos repetidos', async () => {
    const { container } = montar('JOP');
    await screen.findByRole('region', { name: 'Turnos por cubrir hoy' });
    await within(await screen.findByRole('region', { name: 'Cifras del día' })).findByText('21');
    expect(container.querySelector('.board-grid')).toBeNull();
    expect(screen.queryByText('Números en fila')).toBeNull();
    const valores = datos(container);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('LAB: las muestras por tomar viven en la bandeja, no se repiten como cifra', async () => {
    const { container } = montar('LAB');
    const grupo = await screen.findByRole('region', { name: 'Muestras por tomar' });
    expect(await within(grupo).findByText('6')).toBeTruthy();
    await within(await screen.findByRole('region', { name: 'Cifras del día' })).findByText('3');
    const valores = datos(container);
    expect(valores.filter(v => v === '6')).toHaveLength(1);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('JOP: sin existencias se lee «Agotado», y los huecos dicen cuántas personas faltan', async () => {
    montar('JOP');
    const inventario = await screen.findByRole('region', { name: 'Inventario bajo el mínimo' });
    const fila = within(inventario).getByText('Jeringa de 5 ml').closest('li')!;
    expect(within(fila).getByText('Agotado')).toBeTruthy();
    expect(within(await screen.findByRole('region', { name: 'Turnos por cubrir hoy' })).getByText(/falta 1 persona$/)).toBeTruthy();
  });

  it('LAB: un artículo con varios lotes aparece una sola vez, y «kit» se lee «kits»', async () => {
    // The endpoint returns one row per lot and warehouse; the article columns repeat on each row.
    const tubo = { articulo_id: 't', codigo: 'TUBO', nombre: 'Tubo de muestra tapón verde', tipo: 'insumo', unidad: 'unidad', minimo: 200, disponible: 500, vencido: 150, bajo_minimo: false };
    const kit = { articulo_id: 'k', codigo: 'CREA', nombre: 'Reactivo de creatinina', tipo: 'reactivo', unidad: 'kit', minimo: 4, disponible: 2, vencido: 0, bajo_minimo: true };
    const api = { request: vi.fn(async (path: string) => path.startsWith('/inventario/existencias') ? [tubo, tubo, kit] : respuestas[path.split('?')[0]] ?? []), write: vi.fn() } as unknown as Api;
    render(<Dashboard api={api} profile={perfil('LAB')} version={0} />);
    const inventario = await screen.findByRole('region', { name: 'Inventario bajo el mínimo' });
    expect(await within(inventario).findAllByText('Tubo de muestra tapón verde')).toHaveLength(1);
    expect(within(inventario).getByText('Quedan 2 kits · mínimo 4')).toBeTruthy();
  });

  it('DPD: acciones con nombre legible, nunca el código del permiso', async () => {
    montar('DPD');
    await screen.findByRole('region', { name: 'Eventos denegados o fallidos' });
    expect(screen.queryByText(/admision\.leer|ticket_fila/)).toBeNull();
    // W04: the failed events link to the filtered audit; the chain group asks to verify it today.
    expect(within(screen.getByRole('region', { name: 'Eventos denegados o fallidos' })).getAllByRole('link')[0].getAttribute('href')).toBe('#/auditoria?resultado=denegado,fallido');
    expect(screen.getByText('Cadena sin verificar hoy')).toBeTruthy();
  });

  it('ADM: un dato, un lugar: ocupación y cuentas solo como cifras', async () => {
    const { container } = montar('ADM');
    await within(await screen.findByRole('region', { name: 'Cifras del día' })).findByText(/^50\s%$/);
    expect(screen.queryByRole('region', { name: 'Cuentas por estado' })).toBeNull();
    const valores = datos(container);
    expect(new Set(valores).size).toBe(valores.length);
  });
});
