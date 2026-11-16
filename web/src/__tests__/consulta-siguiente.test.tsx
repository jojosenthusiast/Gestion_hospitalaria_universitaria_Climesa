import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ConsultationsPage, type Consultation } from '../features/consultations';

// Fase 2, flujo B (S9): consulta → procedimientos → receta y/o exámenes → cerrar; al cerrar, quién pasa después.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); localStorage.clear(); });

const profile = (permissions: string[]): AccessProfile => ({ id: 'med-1', user: { id: 'med-1' }, email: 'med@example.test', name: 'Medicina de prueba', roles: ['MED'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: code === 'fila.ver' ? 'global' : 'relacion' })), channels: [], patientId: null, staffId: 'staff-med-1' });
const open: Consultation = { appointmentId: 'cita-1', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', start: '2026-11-13T15:00:00Z', end: '2026-11-13T15:20:00Z',
  appointmentState: 'confirmada', consultationId: 'cons-1', consultationState: 'abierta', consultationReason: 'Control', plan: 'Plan inicial', version: 2 };
const nextProposal = { service: 'consulta_general', area: 'CON', rule: 'Emergencias primero; luego urgentes; luego citas dentro de su ventana; luego el resto en orden de llegada.',
  proposal: { id: 't-4', numero: 4, area: 'CON', patientName: 'Paciente Ficticio Cuatro', priority: 'emergencia', appointmentAt: null, version: 1, reason: 'emergencia', reasonText: 'Emergencia: pasa antes que todos.' } };

function mount(permissions: string[], signResult: unknown) {
  const write = vi.fn(async (path: string) => path.endsWith('/firmar') ? signResult : path.endsWith('/llamar') ? { id: 't-4', version: 2, state: 'llamado', llamados: 1 } : { id: 'cons-1', version: 3, state: 'abierta' });
  const api = { request: vi.fn(async (path: string) => {
    if (path === '/consultas/agenda') return [open];
    if (path === '/consultas/sin-firmar' || path === '/fila') return [];
    throw new ApiError(`Ruta inesperada: ${path}`, 404);
  }), write };
  render(<ConsultationsPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return write;
}

describe('Mi consultorio · pasos y quién pasa después', () => {
  it('la consulta muestra sus cuatro pasos en orden', async () => {
    mount(['consulta.iniciar', 'consulta.registrar'], {});
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    const pasos = within(screen.getByRole('dialog')).getByRole('list', { name: 'Pasos de la consulta' });
    expect(within(pasos).getAllByRole('listitem').map(li => li.textContent)).toEqual(['1. Consulta', '2. Procedimientos', '3. Receta y exámenes', '4. Cerrar consulta']);
  });

  it('al firmar propone al siguiente con su motivo y lo llama con un clic', async () => {
    const write = mount(['consulta.iniciar', 'consulta.registrar', 'fila.ver', 'fila.llamar'], { id: 'cons-1', version: 4, state: 'firmada', signedAt: '2026-11-13T15:30:00Z', nextProposal });
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Firmar consulta' }));
    const handoff = await screen.findByRole('region', { name: 'Quién pasa después' });
    expect(within(handoff).getByText('Paciente Ficticio Cuatro')).toBeTruthy();
    expect(within(handoff).getByText('Emergencia: pasa antes que todos.')).toBeTruthy();
    await userEvent.click(within(handoff).getByRole('button', { name: 'Llamar a CON 4' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('/fila/t-4/llamar', { version: 1 }, 'POST'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Quién pasa después' })).toBeNull());
  });

  it('sin propuesta (nadie espera o sin permiso de fila) no queda nada que llamar', async () => {
    mount(['consulta.iniciar', 'consulta.registrar'], { id: 'cons-1', version: 4, state: 'firmada', signedAt: '2026-11-13T15:30:00Z', nextProposal: null });
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Firmar consulta' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('region', { name: 'Quién pasa después' })).toBeNull();
  });
});
