import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { MetricsPage, indicators } from '../features/metrics';

afterEach(cleanup);
const perfil = (permisos: string[]): AccessProfile => ({ id: 'adm', user: { id: 'adm' }, email: 'adm@example.test', name: 'Admin', roles: ['ADM'], platforms: ['web'], permissions: permisos.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null });

describe('W33 · métricas por rango', () => {
  it('pide los cinco indicadores del rango y muestra "Sin datos" en lugar de cero', async () => {
    const api = { request: vi.fn(async (path: string) => ({ indicador: path.split('?')[0].split('/').pop(), unidad: 'minutos', desde: '2026-11-14', hasta: '2026-11-15', actualizadoEn: '', serie: [{ fecha: '2026-11-14', valor: 90, muestras: 1 }, { fecha: '2026-11-15', valor: null, muestras: 0 }] })), write: vi.fn() };
    render(<MetricsPage api={api as unknown as Api} profile={perfil(['metricas.ver'])} version={0} />);
    const lab = await screen.findByRole('region', { name: 'Tiempo de laboratorio (orden a completado)' });
    expect((await within(lab).findAllByText('90 min')).length).toBeGreaterThan(0);
    expect(within(lab).getAllByText('Sin datos').length).toBeGreaterThan(0);
    expect(api.request).toHaveBeenCalledTimes(indicators.length);
    expect(api.request.mock.calls.every(([path]) => /^\/metricas\/\w+\?desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}$/.test(String(path)))).toBe(true);
  });

  it('explica cada indicador, colorea según el umbral, ofrece rangos rápidos y exportación', async () => {
    const api = { request: vi.fn(async (path: string) => ({ indicador: 'x', unidad: 'minutos', desde: '2026-11-14', hasta: '2026-11-15', actualizadoEn: '', serie: [{ fecha: '2026-11-14', valor: 130, muestras: 2 }] })), write: vi.fn() };
    render(<MetricsPage api={api as unknown as Api} profile={perfil(['metricas.ver'])} version={0} />);
    const lab = await screen.findByRole('region', { name: 'Tiempo de laboratorio (orden a completado)' });
    expect(within(lab).getByText(/Minutos entre que se pide el examen/)).toBeTruthy();
    expect(within(lab).getByText(/Menos es mejor/)).toBeTruthy();
    expect(await within(lab).findByText('Crítico')).toBeTruthy();
    expect(within(lab).getByRole('img', { name: /Tiempo de laboratorio \(orden a completado\) por día/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Últimos 7 días' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Últimos 30 días' }));
    expect(screen.getByRole('button', { name: 'Últimos 30 días' }).getAttribute('aria-pressed')).toBe('true');
    expect((await screen.findByRole('button', { name: 'Exportar todo' })).hasAttribute('disabled')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Exportar todo' }));
    expect(screen.getAllByRole('menuitem').map(m => m.textContent)).toEqual([expect.stringContaining('CSV'), expect.stringContaining('Excel'), expect.stringContaining('PDF')]);
  });

  it('sin metricas.ver no pide nada', () => {
    const api = { request: vi.fn(), write: vi.fn() };
    render(<MetricsPage api={api as unknown as Api} profile={perfil([])} version={0} />);
    expect(screen.getByText('Tu cuenta no tiene permiso para ver las métricas.')).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
  });
});
