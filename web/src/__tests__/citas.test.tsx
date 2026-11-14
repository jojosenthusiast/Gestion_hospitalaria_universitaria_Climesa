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
  patients: [],
  doctors: [
    { id: 'd-1', givenNames: 'Médica', surnames: 'Ficticia', type: 'medico', specialty: 'Medicina general', areaId: null, area: null, active: true, tieneTurno: true, motivo: null },
    { id: 'd-2', givenNames: 'Doctor', surnames: 'Sin Jornada', type: 'medico', specialty: 'Pediatría', areaId: null, area: null, active: true, tieneTurno: false, motivo: 'Sin turno ese día' },
  ],
};
const franjas = [
  { start: '2026-11-20T14:00:00Z', end: '2026-11-20T14:20:00Z', estado: 'ocupado', motivo: 'Ocupado' },
  { start: '2026-11-20T14:20:00Z', end: '2026-11-20T14:40:00Z', estado: 'libre', motivo: null },
];
const appointment = { id: 'c-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', doctorId: 'd-1', doctorName: 'Médica Ficticia', start: '2026-11-20T15:00:00Z', end: '2026-11-20T15:20:00Z', state: 'confirmada', origin: 'recepcion', version: 1 };

function mount() {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/citas') return [appointment];
      if (path.startsWith('/citas/catalogos')) return catalogs;
      if (path.startsWith('/pacientes/selector')) return { items: [{ id: 'p-1', record: 'EXP-000001', fullName: 'María Ficticia Uno', age: 34 }], offset: 0, limit: 10, hasMore: false };
      if (path.startsWith('/citas/disponibilidad')) return { durationMinutes: 20, workPeriods: [{ start: '2026-11-20T14:00:00Z', end: '2026-11-20T18:00:00Z' }], slots: [franjas[1]], franjas };
      throw new ApiError(path.startsWith('/personal') ? 'No tienes permiso.' : 'limit must not be greater than 50', path.startsWith('/personal') ? 403 : 400);
    }),
    write: vi.fn(async () => ({})),
  };
  render(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={0} />);
  return api;
}

describe('W28 · agendar cita como Recepción (W-01)', () => {
  it('busca pacientes sin tildes con el selector y atenúa al médico sin turno, sin pedir /personal', async () => {
    const api = mount();
    await userEvent.click(await screen.findByRole('button', { name: /Agendar cita/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Paciente' }), 'maria');
    const option = await within(dialog).findByRole('option', { name: /María Ficticia Uno/ }, { timeout: 2000 });
    expect(option.textContent).toContain('EXP-000001');
    await userEvent.click(option);
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Médico' }));
    const sinTurno = await within(dialog).findByRole('option', { name: /Doctor Sin Jornada/ });
    expect(sinTurno.getAttribute('aria-disabled')).toBe('true');
    expect(sinTurno.textContent).toContain('Sin turno');
    const paths = api.request.mock.calls.map(([path]) => String(path));
    expect(paths.some(p => p.startsWith('/pacientes/selector?query=maria'))).toBe(true);
    expect(paths.some(p => p.startsWith('/personal') || p === '/pacientes' || p.startsWith('/pacientes?'))).toBe(false);
  });

  it('muestra todas las franjas: las libres se eligen y las ocupadas salen apagadas con su motivo', async () => {
    const api = mount();
    await userEvent.click(await screen.findByRole('button', { name: /Agendar cita/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Paciente' }), 'maria');
    await userEvent.click(await within(dialog).findByRole('option', { name: /María Ficticia Uno/ }, { timeout: 2000 }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Médico' }));
    await userEvent.click(await within(dialog).findByRole('option', { name: /Médica Ficticia/ }));
    const busy = await within(dialog).findByRole('button', { name: /no disponible: Ocupado/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    const confirm = within(dialog).getByRole('button', { name: /Confirmar cita/ }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: /^08:20/ }));
    expect(confirm.disabled).toBe(false);
    await userEvent.click(confirm);
    expect(api.write).toHaveBeenCalledWith('/citas', expect.objectContaining({ patientId: 'p-1', doctorId: 'd-1', start: '2026-11-20T14:20:00Z' }), 'POST');
  });

  it('el botón del modal de cancelación dice lo que hace', async () => {
    mount();
    await userEvent.click(await screen.findByRole('button', { name: /^Cancelar la cita de Paciente Ficticio Uno/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Cancelar cita/ })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Guardar estado/ })).toBeNull();
  });
});

describe('agenda de citas (obs. 12)', () => {
  it('muestra el rango en una sola celda, agrupado por día y médico, sin filas de entrada y salida', async () => {
    mount();
    const dia = await screen.findByRole('region', { name: /viernes, 20 de noviembre|viernes 20 de noviembre/ });
    expect(within(dia).getByText('Médica Ficticia', { exact: false })).toBeTruthy();
    expect(within(dia).getByText('09:00 – 09:20')).toBeTruthy();
    expect(within(dia).getByText('20 min')).toBeTruthy();
  });

  it('los chips de estado cuentan y filtran; «Quitar filtros» vuelve a las activas', async () => {
    mount();
    await screen.findByText('09:00 – 09:20');
    await userEvent.click(screen.getByRole('button', { name: /^Canceladas/ }));
    expect(await screen.findByText('Ninguna cita coincide con los filtros')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(await screen.findByText('09:00 – 09:20')).toBeTruthy();
  });
});
