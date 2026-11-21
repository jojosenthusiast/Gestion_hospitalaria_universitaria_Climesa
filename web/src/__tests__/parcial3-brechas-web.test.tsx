import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { Dashboard } from '../features/dashboards';
import { dailyReport } from '../features/dashboards/daily-report';
import { LoginView } from '../components/ui';
import { StatusBadge } from '../components/system';
import { STAGE_LABEL } from '../features/listas/lab-worklist';
import { LAB_STEPS } from '../features/laboratory';
import { buildPdf, registerExportAuditor, toCsv } from '../lib/export';
import type { MetricsBoard } from '../features/tablero';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

afterEach(() => { cleanup(); registerExportAuditor(null); vi.restoreAllMocks(); });

// Real permissions of each role (permisos.csv), as in inicio-por-rol.test.tsx.
function permisosDe(rol: string) {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
}
const perfil = (rol: string): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'p@example.test', name: 'Persona Ficticia', roles: [rol], platforms: ['web'], permissions: permisosDe(rol), channels: [], patientId: null, staffId: null });

const hoy = new Date().toISOString();
const enUnaHora = new Date(Date.now() + 3600_000).toISOString();
const tablero = (ambulancia: MetricsBoard['ambulancia'] = { estado: 'en_servicio', paramedicoDeTurno: true }): MetricsBoard => ({
  actualizadoEn: hoy, fecha: hoy.slice(0, 10),
  camas: { total: 17, libres: 5, ocupadas: 10, limpieza: 2, bloqueadas: 0, reservadas: 0 },
  ocupacionPorPlanta: [{ planta: 2, camas: 12, libres: 4, ocupadas: 6, limpieza: 2, bloqueadas: 0, reservadas: 0 }, { planta: 3, camas: 5, libres: 1, ocupadas: 4, limpieza: 0, bloqueadas: 0, reservadas: 0 }],
  ambulancia,
  fila: { emitidos: 5, enEspera: 3, llamados: 1, enAtencion: 0, atendidos: 1, noSePresento: 0 },
  laboratorio: { pendiente: 2, enProceso: 1, completadoHoy: 4, canceladoHoy: 0 },
  cobertura: { huecos: 1, detalle: [{ area: 'Emergencia', rol: 'ENF', inicio: hoy, fin: enUnaHora, requeridos: 2, actuales: 1 }] },
  turnosEnCurso: 4, pacientesActivos: 30,
});
const ocupacionPublica = { actualizadoEn: hoy, ocupacion: [{ planta: 2, categoria: 'semiprivada', camas: 12, libres: 4, ocupadas: 8 }, { planta: 3, categoria: 'vip', camas: 5, libres: 1, ocupadas: 4 }] };

function montar(profile: AccessProfile, board: MetricsBoard = tablero()) {
  const respuestas: Record<string, unknown> = { '/metricas/tablero': board, '/publico/ocupacion': ocupacionPublica, '/inicio': { lastUpdate: hoy },
    '/ambulancia': { unit: { id: 'u', plate: 'P-1', state: 'disponible', version: 1 }, activeService: null, paramedicOnDuty: true, pendingRequests: [] } };
  const api = { request: vi.fn(async (path: string) => respuestas[path.split('?')[0]] ?? []), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
  const view = render(<Dashboard api={api} profile={profile} version={0} />);
  return { api, view };
}
const figura = async (container: HTMLElement, id: string) => { await waitFor(() => expect(container.querySelector(`[data-figure="${id}"]`)).toBeTruthy()); return container.querySelector(`[data-figure="${id}"]`) as HTMLElement; };

describe('P3 S5 · ambulancia y camas libres por tipo en Inicio', () => {
  it('ADM ve el estado de la ambulancia y las camas libres VIP / Semiprivada sin pedir permisos nuevos', async () => {
    const { api, view } = montar(perfil('ADM'));
    const ambulancia = await figura(view.container, 'ambulancia');
    await waitFor(() => expect(ambulancia.textContent).toContain('En servicio'));
    expect(ambulancia.textContent).toContain('Ambulancia');
    // ADM cannot open the ambulance screen, so the figure is not a link it would be refused.
    expect(ambulancia.querySelector('a')).toBeNull();
    const ocupacion = await figura(view.container, 'ocupacion');
    const tipos = await within(ocupacion).findByRole('list', { name: 'Camas libres por tipo de habitación' });
    expect(within(tipos).getAllByRole('listitem').map(li => li.textContent)).toEqual(['VIP 1', 'Semiprivada 4']);
    const pedidas = api.request.mock.calls.map(c => c[0] as string);
    expect(pedidas).toContain('/publico/ocupacion');
    expect(pedidas).not.toContain('/camas');
    expect(pedidas).not.toContain('/ambulancia');
  });

  it('JOP siempre ve la ambulancia, aun sin unidad registrada, con el enlace a Ambulancia', async () => {
    const { view } = montar(perfil('JOP'), tablero(null));
    const ambulancia = await figura(view.container, 'ambulancia');
    await waitFor(() => expect(ambulancia.textContent).toContain('Sin unidad'));
    expect(ambulancia.querySelector('a')?.getAttribute('href')).toBe('#/ambulancia');
  });

  it('JOP con unidad disponible lee «Disponible»', async () => {
    const { view } = montar(perfil('JOP'), tablero({ estado: 'disponible', paramedicoDeTurno: false }));
    const ambulancia = await figura(view.container, 'ambulancia');
    await waitFor(() => expect(ambulancia.textContent).toContain('Disponible'));
    expect(ambulancia.textContent).toContain('Sin paramédico de turno');
  });
});

describe('P3 S6 · Reporte del día', () => {
  it('arma la tabla con camas por estado y planta, fila, laboratorio, ambulancia, huecos y turnos', () => {
    const table = dailyReport(tablero(), new Date('2026-11-20T15:00:00Z'));
    expect(table.title).toBe('Reporte del día');
    expect(table.filename).toBe('reporte-del-dia-2026-11-20');
    expect(table.columns).toEqual(['Sección', 'Indicador', 'Valor']);
    const sections = new Set(table.rows.map(r => r[0]));
    for (const s of ['Camas', 'Camas por planta', 'Fila', 'Laboratorio', 'Ambulancia', 'Cobertura de turnos', 'Turnos', 'Pacientes']) expect(sections.has(s)).toBe(true);
    expect(table.rows).toContainEqual(['Camas', 'Libres', 5]);
    expect(table.rows).toContainEqual(['Camas por planta', 'Planta 3', '1 libres de 5 · 4 ocupadas · 0 reservadas · 0 en limpieza · 0 bloqueadas']);
    expect(table.rows).toContainEqual(['Laboratorio', 'En Proceso', 1]);
    expect(table.rows).toContainEqual(['Ambulancia', 'Estado', 'En servicio']);
    expect(table.rows).toContainEqual(['Turnos', 'En curso ahora', 4]);
    expect(table.rows.find(r => r[0] === 'Cobertura de turnos' && String(r[1]).startsWith('Emergencia'))?.[1]).toBe('Emergencia · Enfermería');
    expect(toCsv(table)).toContain('Camas;Libres;5');
  });

  it('el PDF del reporte se genera', async () => {
    const doc = await buildPdf(dailyReport(tablero()));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('ADM descarga el reporte en CSV después de registrarlo en /exportaciones; PDF también se ofrece', async () => {
    const orden: string[] = [];
    const auditor = vi.fn(async () => { orden.push('auditoria'); });
    registerExportAuditor(auditor);
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { orden.push('descarga'); });
    montar(perfil('ADM'));
    fireEvent.click(await screen.findByRole('button', { name: /Reporte del día/ }));
    expect(screen.getByRole('menuitem', { name: /PDF/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(auditor).toHaveBeenCalledWith(expect.objectContaining({ resource: expect.stringMatching(/^reporte-del-dia-\d{4}-\d{2}-\d{2}$/), format: 'csv' }));
    expect(orden).toEqual(['auditoria', 'descarga']);
  });

  it('JOP también tiene el reporte; otros roles con métricas (DPD) no', async () => {
    montar(perfil('JOP'));
    expect(await screen.findByRole('button', { name: /Reporte del día/ })).toBeTruthy();
    cleanup();
    montar(perfil('DPD'));
    await screen.findByRole('region', { name: 'Acciones rápidas' });
    expect(screen.queryByRole('button', { name: /Reporte del día/ })).toBeNull();
  });
});

describe('P3 S7 · enlace a la información pública desde el ingreso', () => {
  it('el login enlaza a /publico', () => {
    render(<LoginView email="" password="" setEmail={() => undefined} setPassword={() => undefined} busy={false} error={null} accepted={false} onSubmit={e => e.preventDefault()} />);
    expect(screen.getByRole('link', { name: 'Ver información pública del hospital' }).getAttribute('href')).toBe('/publico');
  });
});

describe('P3 S12 · el estado en_proceso de laboratorio se lee «En Proceso»', () => {
  it('la etiqueta, la etapa de la lista y el paso de la orden dicen «En Proceso»; los demás estados no cambian', () => {
    render(<StatusBadge value="en_proceso" />);
    expect(screen.getByText('En Proceso')).toBeTruthy();
    expect(STAGE_LABEL.en_proceso).toBe('En Proceso');
    expect(STAGE_LABEL.pendiente).toBe('Pendiente');
    expect(LAB_STEPS).toContain('En Proceso');
    expect(LAB_STEPS).toContain('Muestra tomada');
  });
});
