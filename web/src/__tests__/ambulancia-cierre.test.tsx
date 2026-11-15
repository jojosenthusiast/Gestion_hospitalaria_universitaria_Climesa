import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { AmbulanceLogPage } from '../features/ambulance-log';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const profile = (permissions: string[]): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const serving = (allowedActions: string[]): AmbulanceStatus => ({
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'en_servicio', version: 4 },
  activeService: {
    id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Calle ficticia 1', destination: 'Hospital CLIMESA', version: 6,
    dispatchedAt: '2026-11-10T17:00:00.000Z', allowedActions,
    crew: [{ staffId: 'p-1', role: 'paramedico', name: 'Persona Ficticia A', hasAccount: true }, { staffId: 'm-1', role: 'motorista', name: 'Persona Ficticia B', hasAccount: false }],
  },
  paramedicOnDuty: true,
});
const apiWith = (status: AmbulanceStatus, write = vi.fn(async () => ({ id: 'svc-1', finalState: 'cancelado', version: 7, unitState: 'disponible', unitVersion: 5 }))) =>
  ({ request: vi.fn(async () => status), write }) as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

describe('BL-05 · cierre administrativo del servicio activo', () => {
  it('sin "cerrar" en allowedActions no ofrece el cierre, aunque el perfil tenga permisos', async () => {
    render(<AmbulancePage api={apiWith(serving([]))} profile={profile(['ambulancia.ver_estado', 'ambulancia.mantenimiento'])} version={0} />);
    expect(await screen.findByText('Servicio activo')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Cierre administrativo/ })).toBeNull();
  });

  it('marca a la tripulación sin cuenta en la app', async () => {
    render(<AmbulancePage api={apiWith(serving([]))} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    const service = await screen.findByRole('region', { name: 'Servicio activo' });
    expect(within(service).getByText(/Persona Ficticia B \(Motorista\) · sin cuenta en la app/)).toBeTruthy();
    expect(within(service).getByText(/no puede registrar hitos desde la app/)).toBeTruthy();
  });

  it('JOP cierra el servicio con motivo y la versión del servicio', async () => {
    const api = apiWith(serving(['cerrar']));
    render(<AmbulancePage api={api} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cierre administrativo' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'Corto');
    expect((within(dialog).getByRole('button', { name: 'Cerrar servicio' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), ': la tripulación perdió el teléfono.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar servicio' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/servicios/svc-1/cerrar', { version: 6, reason: 'Corto: la tripulación perdió el teléfono.' }, 'POST');
  });

  it('traduce servicio_finalizado al español', async () => {
    const api = apiWith(serving(['cerrar']), vi.fn(async () => { throw new ApiError('Service already finished', 409, 'servicio_finalizado'); }));
    render(<AmbulancePage api={api} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cierre administrativo' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'La tripulación no tiene cuenta.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar servicio' }));
    expect(await within(dialog).findByText(/El servicio ya terminó/)).toBeTruthy();
    expect(within(dialog).queryByText(/Service already finished/)).toBeNull();
  });
});

describe('BL-05 · bitácora', () => {
  it('marca los servicios cerrados por Jefatura como "Cierre administrativo"', async () => {
    const rows = [{ id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Ficticia', destination: 'Hospital CLIMESA', dispatchedAt: '2026-11-10T17:00:00.000Z', finishedAt: '2026-11-10T18:00:00.000Z', finalState: 'cancelado', responseMinutes: null, crew: [], milestones: [], administrativeClose: true }];
    const api = { request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api;
    render(<AmbulanceLogPage api={api} version={0} />);
    expect(await screen.findByText('Cierre administrativo')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(screen.getByRole('cell', { name: /Cierre administrativo/ })).toBeTruthy();
  });
});
