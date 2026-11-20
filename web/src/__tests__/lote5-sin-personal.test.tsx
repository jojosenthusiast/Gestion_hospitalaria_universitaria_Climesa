import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HttpApi, type AccessProfile, type Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';
import { patientFacts } from '../features/listas/patient-facts';
import { QueuePage } from '../features/queue';

// Lote 5 S6: «si no hay doctores disponibles a ese dia, se rechazaria porque la validacion automaticamente se activaria».
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const NO_STAFF = 'No hay médicos de turno para ese día y servicio.';
const rec = (): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Cuenta Ficticia', roles: ['REC'], platforms: ['web'],
  permissions: [['citas.ver', 'x'], ['citas.agendar', 'x'], ['citas.cancelar', 'x'], ['pacientes.buscar', 'x']].map(([code, context]) => ({ code, context })), channels: [], patientId: null, staffId: null,
});
const today = () => new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
const doctors = [{ id: 'd-3', givenNames: 'Doctora', surnames: 'Dermis', type: 'medico', specialty: 'Dermatología', areaId: null, area: null, active: true, tieneTurno: true, motivo: null }];
const franjas = () => [{ start: `${today()}T19:20:00.000Z`, end: `${today()}T19:40:00.000Z`, estado: 'libre', motivo: null }];
const request = (extra: Record<string, unknown> = {}) => ({ id: 's-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', record: 'EXP-000001', categories: [{ code: 'piel', name: 'Piel', icon: 'piel' }], specialties: ['Dermatología'],
  franja: 'cualquiera', note: null, preferredDoctorId: null, preferredDoctorName: null, state: 'pendiente', rejectionReason: null, appointment: null,
  createdAt: '2026-11-16T14:00:00.000Z', version: 1, allowedActions: ['asignar', 'rechazar'], blockedActions: [], ...extra });
const asked = { id: 'c-1', patientId: 'p-2', patientName: 'Paciente Ficticio Dos', doctorId: 'd-3', doctorName: 'Doctora Dermis', start: `${today()}T19:20:00.000Z`, end: `${today()}T19:40:00.000Z`,
  reason: null, state: 'solicitada', origin: 'app', version: 3, allowedActions: ['confirmar', 'rechazar'], blockedActions: [] };

function mount(requests: unknown[], appointments: unknown[] = [], write = vi.fn(async (): Promise<unknown> => { throw new ApiError(NO_STAFF, 409, 'sin_personal_disponible'); })) {
  window.location.hash = '';
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/citas') return appointments;
      if (path === '/citas/solicitudes-categoria') return requests;
      if (path.startsWith('/citas/catalogos')) return { patients: [], doctors };
      if (path.startsWith('/citas/disponibilidad')) return { durationMinutes: 20, workPeriods: [], slots: [], franjas: franjas() };
      throw new ApiError(`ruta inesperada ${path}`, 404);
    }),
    write,
  };
  render(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={0} />);
  return api;
}
async function openRequests() {
  await userEvent.click(within(await screen.findByRole('group', { name: 'Estado de la cita' })).getByRole('button', { name: /^Solicitudes/ }));
  return screen.findByRole('region', { name: 'Solicitudes' });
}

describe('Lote 5 S6 · sin personal disponible', () => {
  it('a request no doctor can take (staffAvailable: false) warns and hides «Asignar»; «Rechazar» stays', async () => {
    mount([request({ staffAvailable: false })]);
    const inbox = await openRequests();
    expect(within(inbox).getByText('No hay médicos con turno que puedan atender este motivo en los próximos días. Rechaza la solicitud indicando ese motivo.')).toBeTruthy();
    expect(within(inbox).queryByRole('button', { name: /Asignar · Paciente Ficticio Uno/ })).toBeNull();
    expect(within(inbox).getByRole('button', { name: /Rechazar · Paciente Ficticio Uno/ })).toBeTruthy();
  });

  it('an older API without the field still offers «Asignar»', async () => {
    mount([request()]);
    const inbox = await openRequests();
    expect(within(inbox).getByRole('button', { name: /Asignar · Paciente Ficticio Uno/ })).toBeTruthy();
  });

  it('request rows show age and sex when the API sends them', async () => {
    mount([request({ patientAge: 34, patientSex: 'femenino' })]);
    const inbox = await openRequests();
    expect(within(inbox).getByText('34 años · Femenino')).toBeTruthy();
  });

  it('assigning refused with sin_personal_disponible shows the message in the assign form, at the schedule', async () => {
    mount([request()]);
    const inbox = await openRequests();
    await userEvent.click(within(inbox).getByRole('button', { name: /Asignar · Paciente Ficticio Uno/ }));
    await within(inbox).findByRole('button', { pressed: true, name: /13:20/ });
    await userEvent.click(within(inbox).getByRole('button', { name: /Confirmar cita/ }));
    const schedule = within(inbox).getByRole('region', { name: 'Horarios del día' });
    expect(await within(schedule).findByText(NO_STAFF)).toBeTruthy();
    // It reads as a warning about the day, not a failure alert at the top of the form.
    expect(within(inbox).queryByRole('alert')).toBeNull();
  });

  it('confirming a requested appointment refused for no staff shows the message on that card', async () => {
    mount([], [asked]);
    const inbox = await openRequests();
    await userEvent.click(within(inbox).getByRole('button', { name: /Confirmar · Paciente Ficticio Dos/ }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Confirmar cita' })).getByRole('button', { name: 'Confirmar cita' }));
    const card = within(inbox).getByText('Paciente Ficticio Dos').closest('li')!;
    expect(await within(card as HTMLElement).findByText(NO_STAFF)).toBeTruthy();
  });

  it('a 409 sin_personal_disponible with no readable body still says why', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ codigo: 'sin_personal_disponible' }), { status: 409 })));
    const error = await new HttpApi(async () => 't').write('/citas', {}).catch(e => e as ApiError);
    expect((error as ApiError).message).toBe(NO_STAFF);
  });

  it('queue cards show age and sex under the name when the API sends them', async () => {
    const row = { id: 't-7', service: 'consulta_general', area: 'CON', fecha: '2026-11-17', numero: 7, patientName: 'Paciente Ficticio Uno', state: 'en_espera', llamados: 0, version: 2, issuedAt: '2026-11-17T15:00:00Z', priority: 'rutina', appointmentAt: null, walkIn: true, maxCalls: 3, callsForAbsence: 3, allowedActions: [], blockedActions: [], undoActions: [], patientAge: 67, patientSex: 'masculino' };
    const api = { request: vi.fn(async (path: string) => path.startsWith('/espacios') ? [] : [row]), write: vi.fn() } as unknown as Api;
    render(<QueuePage api={api} profile={{ ...rec(), permissions: [{ code: 'fila.ver', context: 'x' }] }} version={0} />);
    const waiting = await screen.findByRole('region', { name: 'En espera' });
    expect(within(waiting).getByText('67 años · Masculino')).toBeTruthy();
  });

  it('age and sex words: only the parts the role may see', () => {
    expect(patientFacts({ patientAge: 1, patientSex: 'masculino' })).toBe('1 año · Masculino');
    expect(patientFacts({ patientAge: 52 })).toBe('52 años');
    expect(patientFacts({ patientSex: 'femenino' })).toBe('Femenino');
    expect(patientFacts({ patientAge: null, patientSex: 'no_registrado' })).toBe('');
    expect(patientFacts({})).toBe('');
  });
});
