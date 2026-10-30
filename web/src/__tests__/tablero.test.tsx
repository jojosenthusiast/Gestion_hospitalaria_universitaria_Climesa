import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Summary } from '../lib/api';
import { Tablero } from '../features/tablero';

afterEach(cleanup);

const perfil = (permisos: string[] = ['metricas.ver']): AccessProfile => ({
  id: 'jop-1', user: { id: 'jop-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const resumen: Summary = {
  lastUpdate: '2026-10-29T15:30:00Z',
  beds: { total: 17, free: 12, occupied: 3, cleaning: 2 },
  patients: { total: 40, active: 38 },
  shifts: { current: 4, draft: 1 },
};

function montar(respuesta: () => Promise<unknown>, opciones: { perfil?: AccessProfile; version?: number } = {}) {
  const api = { request: vi.fn(respuesta), write: vi.fn() };
  const vista = (version: number) => <Tablero api={api as unknown as Api} profile={opciones.perfil ?? perfil()} version={version} />;
  const resultado = render(vista(opciones.version ?? 0));
  return { api, cambiarVersion: (version: number) => resultado.rerender(vista(version)) };
}
const tarjeta = (nombre: string) => screen.getByRole('region', { name: nombre });

describe('W03 · tablero inicial con datos reales', () => {
  it('muestra camas libres, ocupadas y en limpieza, turnos en curso y pacientes activos que entrega la API', async () => {
    const { api } = montar(async () => resumen);
    const camas = await screen.findByRole('region', { name: 'Camas' });
    expect(api.request).toHaveBeenCalledWith('/inicio', expect.anything());
    expect(within(camas).getByText('Libres').previousElementSibling?.textContent).toBe('12');
    expect(within(camas).getByText('Ocupadas').previousElementSibling?.textContent).toBe('3');
    expect(within(camas).getByText('En limpieza').previousElementSibling?.textContent).toBe('2');
    expect(within(camas).getByText('de 17 camas de hospitalización')).toBeTruthy();
    expect(within(tarjeta('Turnos')).getByText('En curso ahora').previousElementSibling?.textContent).toBe('4');
    expect(within(tarjeta('Pacientes')).getByText('Activos').previousElementSibling?.textContent).toBe('38');
    expect(screen.getByText(/Actualizado:/)).toBeTruthy();
  });

  it('las tarjetas de módulos sin construir dicen en qué semana llegan, no cero', async () => {
    montar(async () => resumen);
    await screen.findByRole('region', { name: 'Camas' });
    for (const nombre of ['Ambulancia', 'Números en fila', 'Órdenes de laboratorio']) {
      const marcador = tarjeta(nombre);
      expect(within(marcador).getByText('Disponible en la semana 4')).toBeTruthy();
      expect(within(marcador).queryByText('0')).toBeNull();
    }
  });

  it('solo muestra las tarjetas cuyos datos entrega la API según el permiso de la cuenta', async () => {
    montar(async () => ({ lastUpdate: resumen.lastUpdate, beds: resumen.beds }));
    await screen.findByRole('region', { name: 'Camas' });
    expect(screen.queryByRole('region', { name: 'Turnos' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Pacientes' })).toBeNull();
  });

  it('en el tablero solo hay agregados: ningún nombre, DUI ni expediente', async () => {
    montar(async () => resumen);
    await screen.findByRole('region', { name: 'Camas' });
    const texto = document.body.textContent ?? '';
    expect(texto).not.toMatch(/\d{8}-\d/);
    expect(texto).not.toMatch(/EXP-/);
  });

  it('muestra el estado cargando mientras llega la respuesta', () => {
    montar(() => new Promise(() => {}));
    expect(screen.getByRole('status').textContent).toContain('Cargando');
  });

  it('muestra el error en español y permite reintentar', async () => {
    let intento = 0;
    const { api } = montar(async () => { if (++intento === 1) throw new ApiError('No se pudo cargar el tablero.', 500); return resumen; });
    expect(await screen.findByText('No se pudo cargar el tablero.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(await screen.findByRole('region', { name: 'Camas' })).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('sin camas registradas muestra el estado vacío con una explicación', async () => {
    montar(async () => ({ lastUpdate: resumen.lastUpdate, beds: { total: 0, free: 0, occupied: 0, cleaning: 0 }, patients: resumen.patients }));
    const camas = await screen.findByRole('region', { name: 'Camas' });
    expect(within(camas).getByText('Todavía no hay camas registradas.')).toBeTruthy();
    expect(within(camas).queryByText('Libres')).toBeNull();
  });

  it('sin el permiso metricas.ver no pide datos y avisa que no hay acceso', () => {
    const { api } = montar(async () => resumen, { perfil: perfil([]) });
    expect(screen.getByText('Tu cuenta no tiene permiso para ver el tablero.')).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
  });

  it('al llegar un evento en vivo (cambia la versión) vuelve a pedir los datos y actualiza las cifras', async () => {
    let libres = 12;
    const { api, cambiarVersion } = montar(async () => ({ ...resumen, beds: { ...resumen.beds!, free: libres } }));
    const camas = await screen.findByRole('region', { name: 'Camas' });
    expect(within(camas).getByText('Libres').previousElementSibling?.textContent).toBe('12');
    libres = 11;
    cambiarVersion(1);
    await waitFor(() => expect(within(tarjeta('Camas')).getByText('Libres').previousElementSibling?.textContent).toBe('11'));
    expect(api.request).toHaveBeenCalledTimes(2);
  });
});
