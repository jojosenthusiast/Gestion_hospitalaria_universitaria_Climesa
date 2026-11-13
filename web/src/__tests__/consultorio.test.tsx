import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ConsultationsPage, type Consultation } from '../features/consultations';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const profile = (permissions: string[]): AccessProfile => ({
  id: 'med-1', user: { id: 'med-1' }, email: 'med@example.test', name: 'Medicina de prueba', roles: ['MED'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'relacion' })), channels: [], patientId: null, staffId: 'staff-med-1',
});
const open: Consultation = {
  appointmentId: 'cita-1', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', start: '2026-11-13T15:00:00Z', end: '2026-11-13T15:20:00Z',
  appointmentState: 'confirmada', consultationId: 'cons-1', consultationState: 'abierta', consultationReason: 'Control', plan: 'Plan inicial', version: 2,
};

function mount(permissions: string[], routes: Record<string, unknown> = {}, write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/consultas/agenda') return [open];
      if (path in routes) return routes[path];
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(write),
  };
  render(<ConsultationsPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
async function openConsultation() {
  await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
  return screen.getByRole('dialog');
}

describe('W-consultorio · signos vitales (WEB-09)', () => {
  it('si la API rechaza los signos, conserva lo escrito y muestra el error', async () => {
    const api = mount(['consulta.iniciar', 'signos.registrar'], {}, async () => { throw new ApiError('La presión sistólica está fuera de rango.', 400); });
    const dialog = await openConsultation();
    await userEvent.type(within(dialog).getByLabelText('PA sistólica'), '130');
    await userEvent.type(within(dialog).getByLabelText('Frecuencia cardiaca'), '80');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar signos' }));
    expect(await within(dialog).findByText('La presión sistólica está fuera de rango.')).toBeTruthy();
    expect((within(dialog).getByLabelText('PA sistólica') as HTMLInputElement).value).toBe('130');
    expect((within(dialog).getByLabelText('Frecuencia cardiaca') as HTMLInputElement).value).toBe('80');
    expect(api.write).toHaveBeenCalledWith('/consultas/cons-1/signos', expect.objectContaining({ systolic: 130, heartRate: 80 }), 'POST');
  });

  it('al guardar con éxito limpia los campos y lo confirma', async () => {
    mount(['consulta.iniciar', 'signos.registrar'], {}, async () => ({ id: 'sv-1', takenAt: '2026-11-13T15:05:00Z' }) as never);
    const dialog = await openConsultation();
    await userEvent.type(within(dialog).getByLabelText('PA sistólica'), '120');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar signos' }));
    expect(await within(dialog).findByText('Signos vitales registrados.')).toBeTruthy();
    await waitFor(() => expect((within(dialog).getByLabelText('PA sistólica') as HTMLInputElement).value).toBe(''));
  });
});
