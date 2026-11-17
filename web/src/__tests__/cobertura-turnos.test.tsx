import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../lib/api';
import { AreaCoverageAlert, upcomingGaps, type AreaGap } from '../features/shifts/AreaCoverageAlert';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const now = new Date('2026-11-20T15:30:00.000Z');
const gap = (area: string, role: string, start: string, end: string): AreaGap => ({ areaId: `id-${area}`, area, role, start, end, required: 1, actual: 0 });
const gaps = [
  gap('Emergencia', 'MED', '2026-11-20T08:00:00.000Z', '2026-11-20T10:00:00.000Z'),
  gap('Recepción', 'REC', '2026-11-21T14:00:00.000Z', '2026-11-21T16:00:00.000Z'),
  gap('Emergencia', 'ENF', '2026-11-20T18:00:00.000Z', '2026-11-20T20:00:00.000Z'),
];

/** MA-REQ-02: `GET /turnos/cobertura` tiene cliente en la planificación de turnos (RN-15). */
describe('cobertura mínima por área en Turnos', () => {
  it('solo cuenta los huecos que aún no terminan, del más próximo al más lejano', () => {
    expect(upcomingGaps(gaps, now).map(g => `${g.area}-${g.role}`)).toEqual(['Emergencia-ENF', 'Recepción-REC']);
  });

  it('pide los próximos 7 días y lista área, rol, tramo y personal frente al mínimo', async () => {
    const api = { request: vi.fn(async () => ({ from: '2026-11-20', to: '2026-11-26', gaps })), write: vi.fn() };
    const plan = vi.fn();
    render(<AreaCoverageAlert api={api as unknown as Api} version={0} now={now} onPlan={plan} />);
    const region = await screen.findByRole('region', { name: 'Cobertura mínima por área' });
    expect(api.request).toHaveBeenCalledWith('/turnos/cobertura?from=2026-11-20&to=2026-11-26', expect.anything());
    expect(within(region).getByText(/2 tramos seguidos de los próximos 7 días/)).toBeTruthy();
    expect(within(region).getByText('Emergencia · Enfermería')).toBeTruthy();
    expect(within(region).queryByText('Emergencia · Medicina')).toBeNull();
    await userEvent.click(within(region).getByRole('button', { name: 'Asignar un turno para cubrirlo' }));
    expect(plan).toHaveBeenCalled();
  });

  it('sin huecos o sin permiso no muestra nada; un error se ve y se puede reintentar', async () => {
    const empty = { request: vi.fn(async () => ({ from: '', to: '', gaps: [] })), write: vi.fn() };
    const { container } = render(<AreaCoverageAlert api={empty as unknown as Api} version={0} now={now} />);
    await vi.waitFor(() => expect(empty.request).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    cleanup();
    const denied = { request: vi.fn(async () => { throw new ApiError('Sin permiso', 403); }), write: vi.fn() };
    const second = render(<AreaCoverageAlert api={denied as unknown as Api} version={0} now={now} />);
    await vi.waitFor(() => expect(denied.request).toHaveBeenCalled());
    expect(second.container.textContent).toBe('');
    cleanup();
    const failing = { request: vi.fn(async () => { throw new ApiError('Sin conexión', 0); }), write: vi.fn() };
    render(<AreaCoverageAlert api={failing as unknown as Api} version={0} now={now} />);
    expect(await screen.findByText(/No pudimos revisar la cobertura mínima/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });

  it('una respuesta 200 sin la lista de huecos no se confunde con "sin huecos": muestra el error y reintenta', async () => {
    const api = { request: vi.fn(async () => ({ from: '', to: '' })), write: vi.fn() };
    render(<AreaCoverageAlert api={api as unknown as Api} version={0} now={now} />);
    expect(await screen.findByText(/No pudimos revisar la cobertura mínima/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });
});
