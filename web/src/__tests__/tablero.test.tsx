import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { Tablero, type MetricsBoard } from '../features/tablero';

afterEach(cleanup);

const perfil = (permisos: string[] = ['metricas.ver']): AccessProfile => ({
  id: 'jop-1', user: { id: 'jop-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const tablero = (cambios: Partial<MetricsBoard> = {}): MetricsBoard => ({
  actualizadoEn: '2026-11-15T15:30:00Z', fecha: '2026-11-15',
  camas: { total: 17, libres: 12, ocupadas: 3, limpieza: 2, bloqueadas: 0, reservadas: 0 },
  ocupacionPorPlanta: [
    { planta: 2, camas: 12, libres: 6, ocupadas: 4, limpieza: 2, bloqueadas: 0, reservadas: 0 },
    { planta: 3, camas: 5, libres: 1, ocupadas: 4, limpieza: 0, bloqueadas: 0, reservadas: 0 },
  ],
  ambulancia: { estado: 'en_servicio', paramedicoDeTurno: true },
  fila: { emitidos: 4, enEspera: 2, llamados: 1, enAtencion: 0, atendidos: 1, noSePresento: 0 },
  laboratorio: { pendiente: 3, enProceso: 2, completadoHoy: 5, canceladoHoy: 0 },
  cobertura: { huecos: 1, detalle: [{ area: 'Emergencia', rol: 'ENF', inicio: '2026-11-15T14:00:00Z', fin: '2026-11-15T22:00:00Z', requeridos: 2, actuales: 1 }] },
  turnosEnCurso: 4, pacientesActivos: 38,
  ...cambios,
});

function montar(respuesta: (path: string) => Promise<unknown>, opciones: { perfil?: AccessProfile; version?: number } = {}) {
  const api = { request: vi.fn((path: string) => respuesta(path)), write: vi.fn() };
  const vista = (version: number) => <Tablero api={api as unknown as Api} profile={opciones.perfil ?? perfil()} version={version} />;
  const resultado = render(vista(opciones.version ?? 0));
  return { api, cambiarVersion: (version: number) => resultado.rerender(vista(version)) };
}
const tarjeta = (nombre: string) => screen.getByRole('region', { name: nombre });
const cifra = (region: HTMLElement, etiqueta: string) => within(region).getByText(etiqueta, { selector: '.board-figures span' }).previousElementSibling?.textContent;

describe('W03 · tablero inicial sobre GET /metricas/tablero', () => {
  it('pide un solo agregado y muestra todas las tarjetas de FR-113-01', async () => {
    const { api } = montar(async () => tablero());
    const camas = await screen.findByRole('region', { name: 'Camas' });
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith('/metricas/tablero', expect.anything());
    expect(cifra(camas, 'Libres')).toBe('12');
    expect(cifra(camas, 'En limpieza')).toBe('2');
    expect(within(camas).getByText('de 17 camas de hospitalización')).toBeTruthy();
    expect(within(tarjeta('Ambulancia')).getByText('En servicio')).toBeTruthy();
    expect(cifra(tarjeta('Números en fila'), 'En espera')).toBe('2');
    expect(cifra(tarjeta('Órdenes de laboratorio'), 'Pendientes')).toBe('3');
    expect(cifra(tarjeta('Turnos'), 'En curso ahora')).toBe('4');
    expect(cifra(tarjeta('Pacientes'), 'Activos')).toBe('38');
    const plantas = tarjeta('Ocupación por planta');
    expect(within(plantas).getByText('6 no disponibles de 12')).toBeTruthy();
    expect(within(plantas).getByRole('img', { name: /^Planta 3: 80% de camas no disponibles/ })).toBeTruthy();
    expect(within(tarjeta('Cobertura de turnos')).getByText('1 hueco de cobertura')).toBeTruthy();
    expect(within(tarjeta('Cobertura de turnos')).getByText(/Emergencia · Enfermería/)).toBeTruthy();
    expect(screen.getByText(/Actualizado:/)).toBeTruthy();
  });

  it('dice qué falta en lugar de mostrar ceros sin contexto', async () => {
    montar(async () => tablero({ camas: { total: 0, libres: 0, ocupadas: 0, limpieza: 0, bloqueadas: 0, reservadas: 0 }, ocupacionPorPlanta: [], ambulancia: null, fila: { emitidos: 0, enEspera: 0, llamados: 0, enAtencion: 0, atendidos: 0, noSePresento: 0 }, cobertura: { huecos: 0, detalle: [] } }));
    expect(within(await screen.findByRole('region', { name: 'Camas' })).getByText('Todavía no hay camas registradas.')).toBeTruthy();
    expect(within(tarjeta('Ambulancia')).getByText('No hay una unidad registrada.')).toBeTruthy();
    expect(within(tarjeta('Números en fila')).getByText('Todavía no se han emitido números hoy.')).toBeTruthy();
    expect(within(tarjeta('Cobertura de turnos')).getByText('Cobertura completa para hoy.')).toBeTruthy();
  });

  it('en el tablero solo hay agregados: ningún nombre, DUI ni expediente', async () => {
    montar(async () => tablero());
    await screen.findByRole('region', { name: 'Camas' });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/\d{8}-\d/);
    expect(texto).not.toMatch(/\d{7}-[\dX]/);
    expect(screen.queryByText(/semana/i)).toBeNull();
  });

  it('muestra el estado cargando mientras llega la respuesta', () => {
    montar(() => new Promise(() => {}));
    expect(screen.getByRole('status').textContent).toContain('Cargando');
  });

  it('muestra el error en español y permite reintentar', async () => {
    let intento = 0;
    const { api } = montar(async () => { if (++intento === 1) throw new ApiError('No se pudo cargar el tablero.', 500); return tablero(); });
    expect(await screen.findByText('No se pudo cargar el tablero.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(await screen.findByRole('region', { name: 'Camas' })).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('sin el permiso metricas.ver no pide datos y avisa que no hay acceso', () => {
    const { api } = montar(async () => tablero(), { perfil: perfil([]) });
    expect(screen.getByText('Tu cuenta no tiene permiso para ver el tablero.')).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('escenario 1: al llegar un evento en vivo (cambia la versión) vuelve a pedir y actualiza la ocupación', async () => {
    let libres = 12;
    const { api, cambiarVersion } = montar(async () => tablero({ camas: { ...tablero().camas, libres } }));
    expect(cifra(await screen.findByRole('region', { name: 'Camas' }), 'Libres')).toBe('12');
    libres = 11;
    cambiarVersion(1);
    await waitFor(() => expect(cifra(tarjeta('Camas'), 'Libres')).toBe('11'));
    expect(api.request).toHaveBeenCalledTimes(2);
  });
});
