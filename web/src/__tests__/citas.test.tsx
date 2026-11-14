import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

// REC real: tiene citas.agendar y citas.cancelar, pero no personal.ver.
const rec = (): AccessProfile => ({
  id: 'rec-1', user: { id: 'rec-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: ['citas.ver', 'citas.agendar', 'citas.cancelar', 'pacientes.buscar'].map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null,
});
const catalogs = {
  patients: [{ id: 'p-1', record: 'EXP-000001', fullName: 'Paciente Ficticio Uno', active: true }],
  doctors: [{ id: 'd-1', givenNames: 'Médica', surnames: 'Ficticia', type: 'medico', specialty: 'Medicina general', areaId: null, area: null, active: true }],
};
const appointment = { id: 'c-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', doctorId: 'd-1', doctorName: 'Médica Ficticia', start: '2026-11-20T15:00:00Z', end: '2026-11-20T15:20:00Z', state: 'confirmada', origin: 'recepcion', version: 1 };

function mount() {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/citas') return [appointment];
      if (path === '/citas/catalogos') return catalogs;
      if (path.startsWith('/citas/disponibilidad')) return { durationMinutes: 20, workPeriods: [], slots: [] };
      throw new ApiError(path.startsWith('/personal') ? 'No tienes permiso.' : 'limit must not be greater than 50', path.startsWith('/personal') ? 403 : 400);
    }),
    write: vi.fn(async () => ({})),
  };
  render(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={0} />);
  return api;
}

describe('W28 · agendar cita como Recepción (W-01)', () => {
  it('llena paciente y médico desde /citas/catalogos, sin pedir /personal ni /pacientes?limit=200', async () => {
    const api = mount();
    await userEvent.click(await screen.findByRole('button', { name: /Agendar cita/ }));
    const dialog = screen.getByRole('dialog');
    const patient = within(dialog).getByLabelText('Paciente');
    expect(await within(patient).findByRole('option', { name: /Paciente Ficticio Uno · EXP-000001/ })).toBeTruthy();
    expect(within(within(dialog).getByLabelText('Médico')).getByRole('option', { name: /Médica Ficticia · Medicina general/ })).toBeTruthy();
    const paths = api.request.mock.calls.map(([path]) => String(path));
    expect(paths).toContain('/citas/catalogos');
    expect(paths.some(p => p.startsWith('/personal') || p.startsWith('/pacientes'))).toBe(false);
  });

  it('el botón del modal de cancelación dice lo que hace', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Cancelar cita/ })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Guardar estado/ })).toBeNull();
  });
});
