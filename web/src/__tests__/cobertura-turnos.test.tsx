import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../lib/api';
import { AreaCoverageAlert, type AreaGap } from '../features/shifts/AreaCoverageAlert';
import { findGapBlock, gapHref, parseGapParam, pendingGapBlocks } from '../features/shifts/GapCover';
import { BoardView, type MetricsBoard } from '../features/tablero';
import { coverageTodayGroup } from '../features/dashboards/coverage-tray';
import type { DashboardData } from '../features/dashboards/data';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// Friday 2026-11-20, 09:30 in El Salvador; «esta semana» is Monday 16 to Sunday 22.
const now = new Date('2026-11-20T15:30:00.000Z');
const gap = (area: string, role: string, start: string, end: string, extra: Partial<AreaGap> = {}): AreaGap => ({ areaId: `id-${area}`, area, role, start, end, required: 1, actual: 0, ...extra });
const gaps = [
  gap('Emergencia', 'MED', '2026-11-20T08:00:00.000Z', '2026-11-20T10:00:00.000Z'),
  gap('Recepción', 'REC', '2026-11-21T14:00:00.000Z', '2026-11-21T16:00:00.000Z'),
  gap('Emergencia', 'ENF', '2026-11-20T18:00:00.000Z', '2026-11-20T20:00:00.000Z'),
  gap('Laboratorio', 'LAB', '2026-11-22T14:00:00.000Z', '2026-11-22T18:00:00.000Z', { actualConBorradores: 1 }),
];

describe('regla única de huecos', () => {
  it('cuenta los huecos que terminan después de ahora, aparta los cubiertos en borrador y recorta el que está pasando', () => {
    const current = gap('Emergencia', 'MED', '2026-11-20T15:00:00.000Z', '2026-11-21T04:00:00.000Z');
    const { open, inDraft } = pendingGapBlocks([...gaps, current], now);
    // The hole happening now is kept (start clipped to now) and cut into 12 h blocks; the one that ended is gone.
    expect(open.map(b => [b.area, b.role, b.start, b.end])).toEqual([
      ['Emergencia', 'MED', '2026-11-20T15:30:00.000Z', '2026-11-21T03:30:00.000Z'],
      ['Emergencia', 'ENF', '2026-11-20T18:00:00.000Z', '2026-11-20T20:00:00.000Z'],
      ['Emergencia', 'MED', '2026-11-21T03:30:00.000Z', '2026-11-21T04:00:00.000Z'],
      ['Recepción', 'REC', '2026-11-21T14:00:00.000Z', '2026-11-21T16:00:00.000Z'],
    ]);
    expect(inDraft.map(b => b.area)).toEqual(['Laboratorio']);
  });

  it('el enlace de Inicio lleva al bloque de la semana que contiene ese hueco', () => {
    const week = pendingGapBlocks(gaps, now).open;
    const wanted = parseGapParam(decodeURIComponent(gapHref(week[1]).split('hueco=')[1]));
    expect(wanted).toEqual({ areaId: 'id-Recepción', role: 'REC', at: Date.parse('2026-11-21T14:00:00.000Z') });
    expect(findGapBlock(week, wanted!)?.key).toBe(week[1].key);
    expect(parseGapParam('roto')).toBeNull();
  });

  it('Inicio y Métricas dicen el mismo número para hoy con la misma redacción', () => {
    const vigentes = [gap('Emergencia', 'ENF', '2026-11-20T18:00:00.000Z', '2026-11-20T20:00:00.000Z'), gap('Recepción', 'REC', '2026-11-20T20:00:00.000Z', '2026-11-20T22:00:00.000Z'), gap('Laboratorio', 'LAB', '2026-11-20T16:00:00.000Z', '2026-11-20T18:00:00.000Z', { actualConBorradores: 1 })]
      .map(g => ({ areaId: g.areaId, area: g.area, rol: g.role, inicio: g.start, fin: g.end, requeridos: g.required, actuales: g.actual, actualesConBorradores: g.actualConBorradores ?? g.actual }));
    const board = { camas: { total: 0, libres: 0, ocupadas: 0, limpieza: 0, bloqueadas: 0, reservadas: 0 }, ocupacionPorPlanta: [], ambulancia: null, fila: { emitidos: 0, enEspera: 0, llamados: 0, enAtencion: 0, atendidos: 0, noSePresento: 0 }, laboratorio: { pendiente: 0, enProceso: 0, completadoHoy: 0, canceladoHoy: 0 },
      cobertura: { huecos: 9, detalle: [], vigentes }, turnosEnCurso: 0, pacientesActivos: 0, actualizadoEn: now.toISOString(), fecha: '2026-11-20' } as MetricsBoard;
    const tray = coverageTodayGroup({ board: { data: board, loading: false } } as unknown as DashboardData, now);
    expect(tray.title).toBe('Turnos por cubrir hoy');
    expect(tray.items.map(i => [i.title, i.action])).toEqual([['Emergencia · Enfermería', 'Cubrir'], ['Recepción · Recepción', 'Cubrir']]);
    expect(tray.items[0].href).toMatch(/^#\/turnos\?hueco=/);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now);
    render(<BoardView board={board} />);
    vi.useRealTimers();
    expect(screen.getByText('2 turnos por cubrir hoy · 1 cubierto en borrador')).toBeTruthy();
  });
});

/** MA-REQ-02: `GET /turnos/cobertura` tiene cliente en la planificación de turnos (RN-15). */
describe('cobertura mínima por área en Turnos', () => {
  it('pide esta semana y resume con la regla única, sin abrir un turno en blanco', async () => {
    const api = { request: vi.fn(async () => ({ from: '2026-11-16', to: '2026-11-22', gaps })), write: vi.fn() };
    const show = vi.fn();
    render(<AreaCoverageAlert api={api as unknown as Api} version={0} now={now} onShow={show} />);
    const region = await screen.findByRole('region', { name: 'Cobertura mínima por área' });
    expect(api.request).toHaveBeenCalledWith('/turnos/cobertura?from=2026-11-16&to=2026-11-22', expect.anything());
    expect(within(region).getByText(/2 turnos por cubrir esta semana · 1 cubierto en borrador\./)).toBeTruthy();
    expect(within(region).queryByRole('button', { name: /Asignar un turno/ })).toBeNull();
    await userEvent.click(within(region).getByRole('button', { name: 'Ver los huecos de esta semana' }));
    expect(show).toHaveBeenCalled();
  });

  it('respeta el filtro de área de la pantalla', async () => {
    const api = { request: vi.fn(async () => ({ from: '2026-11-16', to: '2026-11-22', gaps })), write: vi.fn() };
    render(<AreaCoverageAlert api={api as unknown as Api} version={0} now={now} areaId="id-Recepción" />);
    expect(await screen.findByText(/1 turno por cubrir esta semana\./)).toBeTruthy();
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
