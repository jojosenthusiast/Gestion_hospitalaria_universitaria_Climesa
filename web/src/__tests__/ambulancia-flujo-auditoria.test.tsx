import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { AmbulanceLogPage, type AmbulanceLogRow } from '../features/ambulance-log';
import { groupByDay, narrate } from '../features/ambulance/narrative';
import { unclosedAmbulance } from '../features/dashboards/roles';
import type { DashboardData } from '../features/dashboards/data';

// Ambulance workflow audit: the block notice carries the close, the log groups by day and finds open services,
// and Jefatura's Inicio shows a service nobody closed.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const profile = (permissions: string[]): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const blocked = (allowedActions: string[], dispatchedAt = '2026-11-10T17:00:00.000Z'): AmbulanceStatus => ({
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'en_servicio', version: 4 },
  activeService: { id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Calle ficticia 1', destination: 'Hospital CLIMESA', version: 6, dispatchedAt, allowedActions, crew: [] },
  paramedicOnDuty: true, driverOnDuty: true, pendingRequests: [], availableCrew: [],
  dispatchBlock: { code: 'en_servicio', message: 'La unidad tiene un servicio activo.', action: 'Espera a que la tripulación finalice el servicio o pide a Jefatura su cierre administrativo; después podrás despachar.' },
});
const statusApi = (status: AmbulanceStatus) => ({ request: vi.fn(async () => status), write: vi.fn() }) as unknown as Api;
const row = (over: Partial<AmbulanceLogRow>): AmbulanceLogRow => ({ id: 'svc', type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Ficticia', destination: 'Hospital CLIMESA', dispatchedAt: '2026-11-18T15:00:00.000Z', finalState: 'completado', responseMinutes: 8, crew: [], milestones: [], ...over });

describe('aviso de despacho bloqueado', () => {
  it('a quien puede cerrar le dice «Cierre administrativo» y le da el botón en el aviso, una sola vez', async () => {
    render(<AmbulancePage api={statusApi(blocked(['cerrar']))} profile={profile(['ambulancia.ver_estado', 'ambulancia.despachar', 'ambulancia.mantenimiento'])} version={0} />);
    const notice = await screen.findByRole('region', { name: 'Despacho bloqueado' });
    expect(within(notice).getByText(/usa «Cierre administrativo»/)).toBeTruthy();
    expect(within(notice).queryByText(/pide a Jefatura/)).toBeNull();
    expect(within(notice).getByRole('button', { name: 'Cierre administrativo' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Cierre administrativo' })).toHaveLength(1);
  });

  it('a quien no puede cerrar le sigue diciendo que lo pida a Jefatura', async () => {
    render(<AmbulancePage api={statusApi(blocked([]))} profile={profile(['ambulancia.ver_estado', 'ambulancia.despachar'])} version={0} />);
    const notice = await screen.findByRole('region', { name: 'Despacho bloqueado' });
    expect(within(notice).getByText(/pide a Jefatura su cierre administrativo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cierre administrativo' })).toBeNull();
  });

  it('el detalle de una solicitud no repite la instrucción del aviso de arriba', async () => {
    const request = { id: 'req-1', origin: 'Colonia Ficticia', reason: 'Dolor de pecho', channel: 'telefono', createdAt: '2026-11-18T14:50:00.000Z', state: 'pendiente', version: 1 } as unknown as NonNullable<AmbulanceStatus['pendingRequests']>[number];
    render(<AmbulancePage api={statusApi({ ...blocked(['cerrar']), pendingRequests: [request] })} profile={profile(['ambulancia.ver_estado', 'ambulancia.despachar', 'ambulancia.mantenimiento'])} version={0} />);
    const detail = await screen.findByRole('article', { name: 'Detalle de la solicitud' });
    expect(within(detail).getByText(/Despacha cuando la unidad termine ese servicio/)).toBeTruthy();
    expect(within(detail).queryByText(/pide a Jefatura/)).toBeNull();
  });
});

describe('bitácora', () => {
  it('la frase de un cierre administrativo dice «cierre administrativo», no «cancelado»', () => {
    expect(narrate(row({ finalState: 'cancelado', administrativeClose: true }))).toMatch(/, cierre administrativo\.$/);
    expect(narrate(row({ finalState: 'cancelado' }))).toMatch(/, cancelado\.$/);
  });

  it('agrupa por día: hoy aparte y los días anteriores del más reciente al más antiguo', () => {
    const rows = [row({ id: 'a', dispatchedAt: '2026-11-18T15:00:00.000Z' }), row({ id: 'b', dispatchedAt: '2026-11-17T15:00:00.000Z' }), row({ id: 'c', dispatchedAt: '2026-11-16T15:00:00.000Z' }), row({ id: 'd', dispatchedAt: '2026-11-17T14:00:00.000Z' })];
    const groups = groupByDay(rows, '2026-11-18T18:00:00.000Z');
    expect(groups.today?.rows.map(r => r.id)).toEqual(['a']);
    expect(groups.past.map(g => [g.day, g.rows.map(r => r.id)])).toEqual([['2026-11-17', ['b', 'd']], ['2026-11-16', ['c']]]);
    expect(groupByDay([rows[2]], '2026-11-18T18:00:00.000Z').today).toBeNull();
  });

  it('pliega los días anteriores, filtra «En curso» y enlaza el servicio sin cierre para resolverlo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-11-18T18:00:00.000Z') });
    const rows = [row({ id: 'hoy' }), row({ id: 'abierto', dispatchedAt: '2026-11-16T15:00:00.000Z', finalState: null, responseMinutes: null })];
    const api = { request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
    render(<AmbulanceLogPage api={api} version={0} />);
    const past = (await screen.findByText(/Días anteriores · 1 servicio/)).closest('details')!;
    expect(past.open).toBe(false);
    expect(within(past).getByRole('link', { name: 'Resolver' }).getAttribute('href')).toBe('#/ambulancia');
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.selectOptions(screen.getByLabelText('Estado final'), 'en_curso');
    expect(api.request).toHaveBeenLastCalledWith('/ambulancia/bitacora?finalState=en_curso', expect.anything());
    expect(screen.getByText('Estado final: En curso (sin cierre)')).toBeTruthy();
  });

  it('en la tabla la prioridad y el estado final son etiquetas de color', async () => {
    const api = { request: vi.fn(async () => [row({})]), write: vi.fn() } as unknown as Api;
    const { container } = render(<AmbulanceLogPage api={api} version={0} />);
    await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    const cells = container.querySelectorAll('tbody td');
    expect(cells[2].querySelector('.priority-badge')).toBeTruthy();
    expect(cells[7].querySelector('.status-badge')).toBeTruthy();
  });
});

describe('Inicio de Jefatura', () => {
  const data = (status: AmbulanceStatus) => ({ ambulance: { data: status, loading: false, error: null, refresh: () => {} } }) as unknown as DashboardData;
  it('muestra el servicio sin cierre que Jefatura puede cerrar, con «Cerrar»', () => {
    vi.useFakeTimers({ now: new Date('2026-11-18T18:00:00.000Z') });
    expect(unclosedAmbulance(data(blocked(['cerrar']))).items).toEqual([expect.objectContaining({ href: '#/ambulancia', action: 'Cerrar', tag: 'Sin cierre' })]);
    expect(unclosedAmbulance(data(blocked([]))).items).toEqual([]);
    expect(unclosedAmbulance(data(blocked(['cerrar'], '2026-11-18T16:00:00.000Z'))).items).toEqual([]);
  });
});
