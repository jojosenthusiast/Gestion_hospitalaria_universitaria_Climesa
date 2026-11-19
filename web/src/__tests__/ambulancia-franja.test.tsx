import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';

// Owner obs. 19: the top strip says the unit's real state, who is on shift by name, whether a service is running and,
// when the unit cannot be dispatched, why; «Disponible» never appears next to «No se puede despachar».
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const profile = (permissions: string[], roles = ['JOP']): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'staff@example.test', name: 'Personal de prueba', roles, platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const apiWith = (status: AmbulanceStatus) => ({ request: vi.fn().mockResolvedValue(status), write: vi.fn() }) as unknown as Api;
const blocked: AmbulanceStatus = {
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 3 }, activeService: null, paramedicOnDuty: true, driverOnDuty: true,
  dispatchBlock: { code: 'sin_paramedico_de_turno', message: 'No hay paramédico con cuenta en la app con turno en curso.', action: 'Publica el turno de un paramédico con cuenta activa (RN-30).' },
  pendingRequests: [],
  availableCrew: [{ staffId: 's1', role: 'paramedico', name: 'Paramédico Ficticio Uno', hasAccount: false }, { staffId: 's2', role: 'motorista', name: 'Motorista Ficticio Dos', hasAccount: true }],
};
const dispatcher = profile(['ambulancia.ver_estado', 'ambulancia.despachar', 'ambulancia.solicitar']);

describe('ambulancia · franja de estado (obs. 19)', () => {
  it('con despacho bloqueado la unidad no dice «Disponible» y el motivo va en la franja, una sola vez', async () => {
    render(<AmbulancePage api={apiWith(blocked)} profile={dispatcher} version={0} />);
    const block = await screen.findByRole('region', { name: 'Despacho bloqueado' });
    expect(screen.queryByText('Disponible')).toBeNull();
    expect(screen.getByText('No se puede despachar')).toBeTruthy();
    expect(within(block).getByText(/No hay paramédico con cuenta en la app con turno en curso\./)).toBeTruthy();
    expect(block.closest('.amb-unit')).toBeTruthy();
    expect(screen.getAllByText(/No hay paramédico con cuenta en la app con turno en curso/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Despachar traslado sin solicitud' })).toBeNull();
  });

  it('sin bloqueo la unidad disponible sí dice «Disponible»', async () => {
    render(<AmbulancePage api={apiWith({ ...blocked, dispatchBlock: null })} profile={dispatcher} version={0} />);
    expect(await screen.findByText('Disponible')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Despacho bloqueado' })).toBeNull();
  });

  it('los puestos muestran a la persona de turno y «Sin servicio activo» va en la franja', async () => {
    const { container } = render(<AmbulancePage api={apiWith(blocked)} profile={dispatcher} version={0} />);
    await screen.findByText('P-000-001');
    const strip = container.querySelector('.amb-unit') as HTMLElement;
    expect(within(strip).getByText('Paramédico Ficticio Uno (sin cuenta en la app)')).toBeTruthy();
    expect(within(strip).getByText('Motorista Ficticio Dos')).toBeTruthy();
    expect(within(strip).getByText('Sin servicio activo')).toBeTruthy();
    expect(within(strip).queryByText('Paramédico de turno')).toBeNull();
  });

  it('sin paramédico de turno el puesto lo dice', async () => {
    render(<AmbulancePage api={apiWith({ ...blocked, paramedicOnDuty: false, availableCrew: [] })} profile={dispatcher} version={0} />);
    expect(await screen.findByText('Sin paramédico de turno')).toBeTruthy();
  });

  it('el servicio en curso usa su tripulación para los puestos', async () => {
    const serving: AmbulanceStatus = { ...blocked, unit: { ...blocked.unit, state: 'en_servicio' }, dispatchBlock: null,
      activeService: { id: 'svc', type: 'emergencia_domicilio', priority: 'roja', origin: 'Calle ficticia', destination: 'Hospital', dispatchedAt: new Date().toISOString(), crew: [{ staffId: 's9', role: 'paramedico', name: 'Paramédica Asignada', hasAccount: true }] } };
    const { container } = render(<AmbulancePage api={apiWith(serving)} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    await screen.findByText('P-000-001');
    const strip = container.querySelector('.amb-unit') as HTMLElement;
    expect(within(strip).getByText('Paramédica Asignada')).toBeTruthy();
    expect(within(strip).getByText('En curso · Emergencia a domicilio')).toBeTruthy();
    expect(within(strip).getByText('En servicio')).toBeTruthy();
  });

  it('«Registrar llamada» es el botón de crear (azul con más)', async () => {
    render(<AmbulancePage api={apiWith(blocked)} profile={dispatcher} version={0} />);
    expect((await screen.findByRole('button', { name: 'Registrar llamada' })).className).toContain('crud-create');
  });
});
