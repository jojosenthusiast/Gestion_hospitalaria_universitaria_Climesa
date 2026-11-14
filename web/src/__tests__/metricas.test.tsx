import { cleanup, render, screen, within } from '@testing-library/react';
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
    expect(await within(lab).findByText('90 min')).toBeTruthy();
    expect(within(lab).getByText('Sin datos')).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(indicators.length);
    expect(api.request.mock.calls.every(([path]) => /^\/metricas\/\w+\?desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}$/.test(String(path)))).toBe(true);
  });

  it('sin metricas.ver no pide nada', () => {
    const api = { request: vi.fn(), write: vi.fn() };
    render(<MetricsPage api={api as unknown as Api} profile={perfil([])} version={0} />);
    expect(screen.getByText('Tu cuenta no tiene permiso para ver las métricas.')).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
  });
});
