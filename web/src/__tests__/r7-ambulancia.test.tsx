import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';

/** R7 U3, journey G4 "Comprobaciones" on a fixed clock (Wednesday 2026-12-02, 09:00 local). */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const profile = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'x@example.test', name: 'Cuenta Ficticia', roles: [], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: ['ambulancia'], patientId: null, staffId: 's-1' });
const crew = [{ staffId: 'p-1', role: 'paramedico', name: 'Paramédico Ficticio', hasAccount: true }, { staffId: 'm-1', role: 'motorista', name: 'Motorista Ficticio', hasAccount: true }];
const serving = (allowedActions: string[] = ['hito', 'deshacer_hito', 'reportar']): AmbulanceStatus => ({
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'en_servicio', version: 4 },
  activeService: { id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Calle Ficticia 1', destination: 'Hospital CLIMESA', version: 6, dispatchedAt: '2026-12-02T14:40:00Z', crew,
    milestones: [{ type: 'salida', occurredAt: '2026-12-02T14:45:00Z' }, { type: 'en_escena', occurredAt: '2026-12-02T14:55:00Z' }], allowedActions } as AmbulanceStatus['activeService'],
  paramedicOnDuty: true,
});
const available = (): AmbulanceStatus => ({
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 4 }, activeService: null, paramedicOnDuty: true, availableCrew: crew,
  pendingRequests: [{ id: 'req-1', channel: 'app', address: 'Colonia Ficticia, pasaje 9', reason: 'Dolor de pecho', contactPhone: '7000-0002', createdAt: '2026-12-02T14:58:00Z', version: 1, registeredPatient: true }],
} as unknown as AmbulanceStatus);

describe('R7 G4 · ambulancia en web', () => {
  it('la tripulación deshace el último hito con la versión del servicio y lo ve explicado en el lugar', async () => {
    const write = vi.fn(async () => ({ id: 'svc-1', undoneType: 'en_escena', version: 7, nextMilestones: ['en_escena'] }));
    render(<AmbulancePage api={{ request: vi.fn(async () => serving()), write } as unknown as Api} profile={profile(['ambulancia.ver_estado', 'ambulancia.operar'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer «En escena»' }));
    expect(write).toHaveBeenCalledWith('/ambulancia/servicios/svc-1/hitos/deshacer', { version: 6 }, 'POST');
    expect(await screen.findByText('Se deshizo «En escena»; vuelve a marcarlo cuando ocurra.')).toBeTruthy();
  });

  it('sin ambulancia.operar no se ofrece deshacer', async () => {
    render(<AmbulancePage api={{ request: vi.fn(async () => serving()), write: vi.fn() } as unknown as Api} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    await screen.findByRole('list', { name: 'Hitos del servicio' });
    expect(screen.queryByRole('button', { name: /^Deshacer/ })).toBeNull();
  });

  it('S5: a paramedic outside the crew sees the service read-only, with the reason and no undo', async () => {
    render(<AmbulancePage api={{ request: vi.fn(async () => serving([])), write: vi.fn() } as unknown as Api} profile={profile(['ambulancia.ver_estado', 'ambulancia.operar'])} version={0} />);
    expect(await screen.findByText('No estás en la tripulación de este servicio.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Deshacer/ })).toBeNull();
  });

  it('S5: the crew is not offered an undo the API no longer accepts (no deshacer_hito)', async () => {
    render(<AmbulancePage api={{ request: vi.fn(async () => serving(['hito', 'reportar'])), write: vi.fn() } as unknown as Api} profile={profile(['ambulancia.ver_estado', 'ambulancia.operar'])} version={0} />);
    await screen.findByRole('list', { name: 'Hitos del servicio' });
    expect(screen.queryByRole('button', { name: /^Deshacer/ })).toBeNull();
    expect(screen.queryByText('No estás en la tripulación de este servicio.')).toBeNull();
  });

  it('el despacho que falla deja el diálogo abierto con lo elegido; el que sale bien lo dice en el lugar', async () => {
    let fail = true;
    const write = vi.fn(async () => { if (fail) throw new ApiError('Sin conexión con el servidor.', 0, 'red'); return { id: 'svc-2' }; });
    render(<AmbulancePage api={{ request: vi.fn(async () => available()), write } as unknown as Api} profile={profile(['ambulancia.ver_estado', 'ambulancia.despachar'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar y despachar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar y despachar' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despachar' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Confirmar y despachar' })).toBeTruthy();
    fail = false;
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Confirmar y despachar' })).getByRole('button', { name: 'Despachar' }));
    expect(await screen.findByText('Ambulancia despachada a Colonia Ficticia, pasaje 9.')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Confirmar y despachar' })).toBeNull();
  });
});
