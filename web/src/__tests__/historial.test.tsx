import { cleanup, render, screen, within } from '@testing-library/react';
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
const row = (over: Partial<Consultation>): Consultation => ({
  appointmentId: 'cita-x', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', start: '2026-11-10T15:00:00Z', end: '2026-11-10T15:20:00Z',
  appointmentState: 'atendida', consultationId: null, consultationState: null, version: 1, ...over,
});
const agenda = [
  row({ appointmentId: 'cita-1', consultationId: 'cons-1', consultationState: 'firmada', consultationReason: 'Dolor de cabeza', plan: 'Reposo', signedAt: '2026-11-10T15:30:00Z' }),
  row({ appointmentId: 'cita-2', consultationId: 'cons-2', consultationState: 'abierta', appointmentState: 'confirmada', start: '2026-11-13T15:00:00Z' }),
  row({ appointmentId: 'cita-3', patientId: 'pac-2', patientName: 'Paciente Ficticio Dos', consultationId: 'cons-3', consultationState: 'firmada' }),
];
const detail = {
  consultation: { id: 'cons-1' },
  vitalSigns: [{ id: 'sv-1', takenAt: '2026-11-10T15:05:00Z', systolic: 120, diastolic: 80, heartRate: 72, temperature: 36.6, oxygenSaturation: 98 }],
  diagnoses: [{ id: 'd-1', code: 'R51', principal: true, note: 'Cefalea tensional' }],
  prescriptions: [{ id: 'r-1', issuedAt: '2026-11-10T15:25:00Z', items: [{ id: 'ri-1', medication: 'Acetaminofén', dose: '500 mg', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' }] }],
};
const orders = [
  { id: 'o-1', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', priority: 'rutina', state: 'completado', version: 3, createdAt: '2026-11-10T15:26:00Z', reviewedAt: '2026-11-11T10:00:00Z', items: [{ id: 'i-1', code: 'GLU', name: 'Glucosa en ayunas', result: { value: 92, text: null, mark: 'normal', version: 1 } }] },
  { id: 'o-2', patientId: 'pac-1', patientName: 'Paciente Ficticio Uno', priority: 'rutina', state: 'en_proceso', version: 2, createdAt: '2026-11-12T15:26:00Z', reviewedAt: null, items: [{ id: 'i-2', code: 'CRE', name: 'Creatinina sérica', result: null }] },
  { id: 'o-3', patientId: 'pac-2', patientName: 'Paciente Ficticio Dos', priority: 'rutina', state: 'completado', version: 3, createdAt: '2026-11-10T15:26:00Z', reviewedAt: '2026-11-11T10:00:00Z', items: [{ id: 'i-3', code: 'COL', name: 'Colesterol total', result: { value: 180, text: null, mark: 'normal', version: 1 } }] },
];

function mount(permissions: string[], routes: Record<string, unknown> = {}) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/consultas/agenda') return agenda;
      if (path in routes) { const value = routes[path]; if (value instanceof Error) throw value; return value; }
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(),
  };
  render(<ConsultationsPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
async function openHistory(patient = 'Paciente Ficticio Uno') {
  const table = await screen.findByRole('table');
  const first = within(table).getAllByRole('row').find(r => r.textContent?.includes(patient))!;
  await userEvent.click(within(first).getByRole('button', { name: `Historial clínico de ${patient}` }));
  return screen.getByRole('dialog');
}

describe('historial clínico mínimo (REQ-03)', () => {
  it('muestra solo las consultas firmadas del paciente y, al abrir una, sus diagnósticos, recetas y signos', async () => {
    const api = mount(['consulta.iniciar', 'expediente.ver'], { '/consultas/cons-1/detalle': detail });
    const dialog = await openHistory();
    expect(within(dialog).getByText('Dolor de cabeza')).toBeTruthy();
    expect(within(dialog).queryByText(/cons-2|cons-3/)).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: /Ver detalle/ })).toHaveLength(1);
    await userEvent.click(within(dialog).getByRole('button', { name: /Ver detalle/ }));
    expect(await within(dialog).findByText(/R51/)).toBeTruthy();
    expect(within(dialog).getByText(/Cefalea tensional/)).toBeTruthy();
    expect(within(dialog).getByText(/Acetaminofén/)).toBeTruthy();
    expect(within(dialog).getByText(/120\/80/)).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/consultas/cons-1/detalle', expect.anything());
    expect(api.request.mock.calls.map(([path]) => path)).not.toContain('/laboratorio/ordenes');
  });

  it('con resultados.ver agrega solo los resultados liberados del mismo paciente', async () => {
    mount(['consulta.iniciar', 'expediente.ver', 'resultados.ver'], { '/laboratorio/ordenes': orders });
    const dialog = await openHistory();
    const lab = await within(dialog).findByRole('region', { name: 'Resultados de laboratorio liberados' });
    expect(within(lab).getByText(/Glucosa en ayunas/)).toBeTruthy();
    expect(within(lab).getByText(/92/)).toBeTruthy();
    expect(within(lab).queryByText(/Creatinina/)).toBeNull();
    expect(within(lab).queryByText(/Colesterol/)).toBeNull();
  });

  it('sin resultados liberados muestra el estado vacío de esa sección', async () => {
    mount(['consulta.iniciar', 'expediente.ver', 'resultados.ver'], { '/laboratorio/ordenes': [] });
    const dialog = await openHistory('Paciente Ficticio Dos');
    expect(await within(dialog).findByText('Sin resultados liberados')).toBeTruthy();
  });

  it('si falla el detalle muestra el error de la API y permite reintentar', async () => {
    mount(['consulta.iniciar', 'expediente.ver'], { '/consultas/cons-1/detalle': new ApiError('No tienes relación de atención con este paciente.', 403) });
    const dialog = await openHistory();
    await userEvent.click(within(dialog).getByRole('button', { name: /Ver detalle/ }));
    expect(await within(dialog).findByText(/no tiene permiso/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });

  it('sin expediente.ver no ofrece el historial', async () => {
    mount(['consulta.iniciar']);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Historial clínico/ })).toBeNull();
  });
});
