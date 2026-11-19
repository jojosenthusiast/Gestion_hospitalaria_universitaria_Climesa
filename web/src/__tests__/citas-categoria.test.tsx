import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';
import { Dashboard } from '../features/dashboards';

// Fase 2, flujo A (S8): el paciente pide cita por motivo, sin médico; recepción asigna médico y hora desde la bandeja.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); requests = [pending]; });

const profile = (roles: string[], permissions: [string, string][], patientId: string | null = null): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'cuenta@example.test', name: 'Cuenta Ficticia', roles, platforms: ['web'],
  permissions: permissions.map(([code, context]) => ({ code, context })), channels: [], patientId, staffId: null,
});
const pac = () => profile(['PAC'], [['citas.ver', 'propio'], ['citas.solicitar', 'propio'], ['citas.cancelar', 'propio']], 'p-1');
const rec = () => profile(['REC'], [['citas.ver', 'x'], ['citas.agendar', 'x'], ['citas.cancelar', 'x'], ['pacientes.buscar', 'x']]);

const categories = [
  { code: 'consulta_general', name: 'Consulta general', description: 'Malestar, fiebre o control', icon: 'general', specialties: ['Medicina general'], keywords: 'fiebre gripe' },
  { code: 'piel', name: 'Piel', description: 'Manchas, granos o alergias en la piel', icon: 'piel', specialties: ['Dermatología'], keywords: 'dermatologo acne mancha' },
  { code: 'alergias', name: 'Alergias', description: 'Estornudos o asma', icon: 'alergia', specialties: ['Alergología'], keywords: 'asma rinitis' },
];
const doctors = [
  { id: 'd-1', givenNames: 'Médica', surnames: 'General', type: 'medico', specialty: 'Medicina general', areaId: null, area: null, active: true, tieneTurno: true, motivo: null },
  { id: 'd-3', givenNames: 'Doctora', surnames: 'Dermis', type: 'medico', specialty: 'Dermatología', areaId: null, area: null, active: true, tieneTurno: true, motivo: null },
];
const today = () => new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10);
// Franjas del día en hora local (UTC-6): 09:00 mañana, 13:00 y 13:20 tarde.
const franjas = () => [
  { start: `${today()}T15:00:00.000Z`, end: `${today()}T15:20:00.000Z`, estado: 'libre', motivo: null },
  { start: `${today()}T19:00:00.000Z`, end: `${today()}T19:20:00.000Z`, estado: 'ocupado', motivo: 'Ocupado' },
  { start: `${today()}T19:20:00.000Z`, end: `${today()}T19:40:00.000Z`, estado: 'libre', motivo: null },
];
const pending = { id: 's-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', record: 'EXP-000001', categories: [{ code: 'piel', name: 'Piel', icon: 'piel' }], specialties: ['Dermatología'],
  franja: 'tarde', note: 'Mancha en el brazo', preferredDoctorId: null, preferredDoctorName: null, state: 'pendiente', rejectionReason: null, appointment: null,
  createdAt: '2026-11-16T14:00:00.000Z', version: 1, allowedActions: ['asignar', 'rechazar'], blockedActions: [] };
let requests: unknown[] = [pending];

function mount(who: AccessProfile, hash = '') {
  window.location.hash = hash;
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/citas') return [];
      if (path === '/citas/solicitudes-categoria') return requests;
      if (path === '/citas/categorias') return categories;
      if (path.startsWith('/citas/catalogos')) return { patients: [], doctors };
      if (path.startsWith('/citas/disponibilidad')) return { durationMinutes: 20, workPeriods: [], slots: [], franjas: franjas() };
      throw new Error(`ruta inesperada ${path}`);
    }),
    write: vi.fn(async () => ({ id: 's-1', version: 2, state: 'asignada', appointmentId: 'c-9' })),
  };
  render(<AppointmentsPage api={api as unknown as Api} profile={who} version={0} />);
  return api;
}

describe('A06 web · el paciente pide cita por motivo', () => {
  it('elige categorías con ícono y búsqueda, franja y nota, sin el combo de médicos', async () => {
    const api = mount(pac());
    await userEvent.click(await screen.findByRole('button', { name: 'Pedir una cita' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('combobox', { name: /Médico/ })).toBeNull();
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Buscar motivo' }), 'acne');
    expect(within(dialog).queryByRole('button', { name: /Consulta general/ })).toBeNull();
    const piel = within(dialog).getByRole('button', { name: /^Piel/ });
    expect(piel.querySelector('svg')).not.toBeNull();
    await userEvent.click(piel);
    await userEvent.clear(within(dialog).getByRole('searchbox', { name: 'Buscar motivo' }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^Alergias/ }));
    expect(within(dialog).getByRole('button', { name: /^Piel/ }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tarde' }));
    await userEvent.type(within(dialog).getByLabelText(/Nota/), 'Mancha en el brazo');
    await userEvent.click(within(dialog).getByRole('button', { name: /Enviar solicitud/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/solicitudes-categoria', { categories: ['piel', 'alergias'], franja: 'tarde', note: 'Mancha en el brazo' }, 'POST');
  });

  it('el médico es opción secundaria: se busca por nombre y viaja como preferencia', async () => {
    const api = mount(pac());
    await userEvent.click(await screen.findByRole('button', { name: 'Pedir una cita' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^Consulta general/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Ya tengo médico/ }));
    await userEvent.type(within(dialog).getByRole('combobox', { name: /Médico preferido/ }), 'derm');
    await userEvent.click(await within(dialog).findByRole('option', { name: /Doctora Dermis/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Enviar solicitud/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/solicitudes-categoria', { categories: ['consulta_general'], franja: 'cualquiera', preferredDoctorId: 'd-3' }, 'POST');
  });

  it('la acción rápida del inicio abre el formulario y "Mis solicitudes" muestra el estado y retirar', async () => {
    requests = [{ ...pending, allowedActions: ['cancelar'] }, { ...pending, id: 's-2', state: 'rechazada', rejectionReason: 'Sin dermatología este mes', allowedActions: [] }];
    const api = mount(pac(), '#/citas?accion=solicitar');
    expect(await screen.findByRole('dialog')).toBeTruthy();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Volver' }));
    const mine = await screen.findByRole('region', { name: 'Mis solicitudes' });
    expect(within(mine).getByText('Sin dermatología este mes')).toBeTruthy();
    await userEvent.click(within(mine).getByRole('button', { name: /Retirar solicitud/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/solicitudes-categoria/s-1/cancelar', { version: 1 }, 'POST');
  });
});

/** Owner batch 2 (S29): the requests are the «Solicitudes» segment of the agenda, not a card on top. */
async function openRequests() {
  await userEvent.click(within(await screen.findByRole('group', { name: 'Estado de la cita' })).getByRole('button', { name: /^Solicitudes/ }));
  return screen.findByRole('region', { name: 'Solicitudes' });
}

describe('W28 · bandeja de solicitudes por asignar (Recepción)', () => {
  it('muestra la nota y asigna con médico sugerido y franja de la tarde ya elegidos', async () => {
    const api = mount(rec());
    const inbox = await openRequests();
    expect(within(inbox).getByText('Mancha en el brazo')).toBeTruthy();
    expect(within(inbox).getByText('EXP-000001')).toBeTruthy();
    await userEvent.click(within(inbox).getByRole('button', { name: /Asignar · Paciente Ficticio Uno/ }));
    // Prellenado: la doctora de Dermatología (la especialidad sugerida) y la primera franja libre de la tarde.
    expect(await within(inbox).findByText('Doctora Dermis')).toBeTruthy();
    const chosen = await within(inbox).findByRole('button', { pressed: true, name: /13:20/ });
    expect(chosen).toBeTruthy();
    expect(within(inbox).queryByRole('button', { name: /^09:00/ })).toBeNull();
    await userEvent.click(within(inbox).getByRole('button', { name: /Confirmar cita/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/solicitudes-categoria/s-1/asignar', { version: 1, doctorId: 'd-3', start: `${today()}T19:20:00.000Z`, end: `${today()}T19:40:00.000Z` }, 'POST');
    expect(api.request.mock.calls.map(([p]) => String(p))).toContain(`/citas/disponibilidad?doctorId=d-3&date=${today()}`);
  });

  it('rechaza con motivo y la bandeja vacía dice que está al día', async () => {
    const api = mount(rec());
    const inbox = await openRequests();
    await userEvent.click(within(inbox).getByRole('button', { name: /Rechazar · Paciente Ficticio Uno/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Motivo del rechazo/), 'No hay dermatología este mes');
    await userEvent.click(within(dialog).getByRole('button', { name: /Rechazar solicitud/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/solicitudes-categoria/s-1/rechazar', { version: 1, rejectionReason: 'No hay dermatología este mes' }, 'POST');
    cleanup();
    requests = [];
    mount(rec());
    await openRequests();
    expect(await screen.findByText(/Al día: no hay solicitudes por atender/)).toBeTruthy();
  });

  it('las acciones salen del servidor: sin allowedActions no hay botones', async () => {
    requests = [{ ...pending, allowedActions: [] }];
    mount(rec());
    const inbox = await openRequests();
    expect(within(inbox).queryByRole('button', { name: /Asignar/ })).toBeNull();
  });
});

describe('inicio de Recepción · solicitudes por asignar', () => {
  // R4a: the tray group «Solicitudes de cita» holds them (one count with the asked appointments, S8).
  it('aparecen en «Solicitudes de cita» con su motivo y la acción Asignar', async () => {
    const api = { request: vi.fn(async (path: string) => path === '/citas/solicitudes-categoria' ? [pending] : path === '/inicio' ? { beds: null, patients: null } : []), write: vi.fn() };
    render(<Dashboard api={api as unknown as Api} profile={rec()} version={0} />);
    const attention = await screen.findByRole('region', { name: 'Solicitudes de cita' });
    expect(await within(attention).findByText('Paciente Ficticio Uno')).toBeTruthy();
    expect(within(attention).getByText(/Piel · Mancha en el brazo/)).toBeTruthy();
    expect(within(attention).getByRole('link', { name: /Asignar/ }).getAttribute('href')).toBe('#/citas?asignar=s-1');
  });
});
