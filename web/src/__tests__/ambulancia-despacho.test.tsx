import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { AmbulanceLogPage, logPath } from '../features/ambulance-log';
import { modules, visibleModules } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); });

const profile = (permissions: Array<string | [string, string]>, roles = ['REC']): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'staff@example.test', name: 'Personal de prueba', roles, platforms: ['web'],
  permissions: permissions.map(p => Array.isArray(p) ? { code: p[0], context: p[1] } : { code: p, context: 'x' }), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const request = { id: 'req-1', channel: 'app_paciente', address: 'Colonia Ficticia 12', municipality: 'San Salvador', reason: 'Caída en casa', contactPhone: '7000-0001', createdAt: '2026-11-15T14:00:00.000Z', version: 1, registeredPatient: true };
const board: AmbulanceStatus = { unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 5 }, activeService: null, paramedicOnDuty: true, pendingRequests: [request] };
const serving: AmbulanceStatus = {
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'en_servicio', version: 6 }, paramedicOnDuty: true, pendingRequests: [],
  activeService: { id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Ficticia 12', destination: 'Hospital CLIMESA', dispatchedAt: '2026-11-15T14:00:00.000Z', hasPrehospital: true, crew: [], milestones: [{ type: 'salida', occurredAt: '2026-11-15T14:05:00.000Z' }], nextMilestones: ['en_escena', 'finalizado'] },
};
const dispatcher = profile(['ambulancia.ver_estado', 'ambulancia.despachar', 'ambulancia.solicitar', 'ambulancia.recibir_prehospital']);
const apiReturning = (status: AmbulanceStatus, extra: Record<string, unknown> = {}) => {
  const request = vi.fn(async (path: string) => path === '/ambulancia' ? status : extra[path]);
  return { request, write: vi.fn().mockResolvedValue({ id: 'svc-1' }) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
};

describe('W18 centro de despacho', () => {
  it('confirma y despacha una solicitud con la versión de la unidad', async () => {
    const api = apiReturning(board);
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    const table = await screen.findByRole('region', { name: 'Solicitudes por confirmar' });
    expect(within(table).getByText('Colonia Ficticia 12 · San Salvador')).toBeTruthy();
    await userEvent.click(within(table).getByRole('button', { name: 'Confirmar y despachar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar y despachar' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Prioridad'), 'roja');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despachar' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/servicios', { version: 5, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia', requestId: 'req-1', municipality: 'San Salvador' }, 'POST');
  });

  it('quien pierde la carrera ve "La ambulancia ya fue despachada."', async () => {
    const api = apiReturning(board);
    api.write.mockRejectedValue(new ApiError('La ambulancia ya fue despachada.', 409, 'ambulancia_ya_despachada'));
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar y despachar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar y despachar' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despachar' }));
    expect(await within(dialog).findByText('La ambulancia ya fue despachada.')).toBeTruthy();
  });

  it('descarta con motivo y registra una llamada telefónica', async () => {
    const api = apiReturning(board);
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    const discard = await screen.findByRole('dialog', { name: 'Descartar solicitud' });
    await userEvent.type(within(discard).getByLabelText('Motivo'), 'Llamada duplicada');
    await userEvent.click(within(discard).getByRole('button', { name: 'Descartar' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/solicitudes/req-1/descartar', { version: 1, reason: 'Llamada duplicada' }, 'POST');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    const call = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    expect(within(call).getByText(/llame al 911/)).toBeTruthy();
    await userEvent.type(within(call).getByLabelText('Dirección'), 'Barrio Ficticio, calle 2');
    await userEvent.type(within(call).getByLabelText('Motivo'), 'Dolor de pecho');
    await userEvent.type(within(call).getByLabelText('Teléfono de contacto'), '2200-0000');
    await userEvent.click(within(call).getByRole('button', { name: 'Registrar solicitud' }));
    expect(api.write).toHaveBeenLastCalledWith('/ambulancia/solicitudes', { address: 'Barrio Ficticio, calle 2', reason: 'Dolor de pecho', contactPhone: '2200-0000' }, 'POST');
  });

  it('sin despachar no muestra solicitudes ni acciones de despacho', async () => {
    render(<AmbulancePage api={apiReturning(board)} profile={profile(['ambulancia.ver_estado'], ['MED'])} version={0} />);
    await screen.findByText('P-000-001');
    expect(screen.queryByRole('region', { name: 'Solicitudes por confirmar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar llamada' })).toBeNull();
  });

  it('muestra los hitos del servicio activo y el prehospital sin datos clínicos cuando la API los omite', async () => {
    const api = apiReturning(serving, { '/ambulancia/servicios/svc-1/prehospital': { serviceId: 'svc-1', active: true, priority: 'roja', patientLinked: false, clinical: false, reports: [{ id: 'r1', priority: 'roja', estimatedArrival: '2026-11-15T14:30:00.000Z', capturedAt: '2026-11-15T14:10:00.000Z', receivedAt: '2026-11-15T14:10:00.000Z' }] } });
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    const milestones = await screen.findByRole('list', { name: 'Hitos del servicio' });
    expect(within(milestones).getAllByText('Pendiente')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Ver reporte prehospital' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reporte prehospital' });
    expect(await within(dialog).findByText(/solo los ve el equipo que recibe/)).toBeTruthy();
    expect(within(dialog).queryByText('Motivo')).toBeNull();
  });
});

describe('W19 bitácora de ambulancia', () => {
  it('arma la consulta solo con los filtros llenos', () => {
    expect(logPath({ from: '2026-11-01', to: '', type: '', finalState: 'completado', priority: '', municipality: ' ', minResponseMinutes: '15' })).toBe('/ambulancia/bitacora?from=2026-11-01&finalState=completado&minResponseMinutes=15');
  });

  it('muestra tiempos y destinos, y vuelve a pedir con los filtros', async () => {
    const rows = [{ id: 's1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Ficticia', destination: 'Hospital CLIMESA', municipality: 'San Salvador', dispatchedAt: '2026-11-15T14:00:00.000Z', finishedAt: '2026-11-15T14:40:00.000Z', finalState: 'completado', responseMinutes: 20, crew: [{ staffId: 'p1', role: 'paramedico', name: 'Persona Ficticia' }] }];
    const api = { request: vi.fn().mockResolvedValue(rows), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
    render(<AmbulanceLogPage api={api} version={0} />);
    expect(await screen.findByText('20 min')).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Completado' })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Prioridad'), 'roja');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(api.request).toHaveBeenLastCalledWith('/ambulancia/bitacora?priority=roja', expect.anything());
  });

  it('aparece en el menú solo con ambulancia.ver_bitacora', () => {
    expect(modules.find(m => m.id === 'bitacora-ambulancia')).toMatchObject({ permission: 'ambulancia.ver_bitacora' });
    expect(visibleModules(profile(['ambulancia.ver_bitacora'], ['DPD'])).map(m => m.id)).toContain('bitacora-ambulancia');
    expect(visibleModules(profile(['ambulancia.ver_estado'])).map(m => m.id)).not.toContain('bitacora-ambulancia');
  });
});
