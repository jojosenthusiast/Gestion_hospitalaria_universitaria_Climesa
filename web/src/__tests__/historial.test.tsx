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
const history = {
  patient: { id: 'pac-1', record: '000412-7', fullName: 'Paciente Ficticio Uno' }, access: 'relacion',
  consultations: [
    { id: 'cons-9', state: 'firmada', startedAt: '2026-11-01T15:00:00Z', signedAt: '2026-11-01T15:30:00Z', reason: 'Control de presión', plan: 'Dieta', doctor: { id: 'staff-otro', name: 'Otra Médica Ficticia', specialty: 'Medicina interna' },
      diagnoses: [{ code: 'I10', description: 'Hipertensión esencial', principal: true }], prescriptions: [] },
    { id: 'cons-1', state: 'firmada', startedAt: '2026-11-10T15:00:00Z', signedAt: '2026-11-10T15:30:00Z', reason: 'Dolor de cabeza', plan: 'Reposo', doctor: { id: 'staff-med-1', name: 'Medicina de prueba', specialty: null },
      diagnoses: [{ code: 'R51', description: 'Cefalea', principal: true, note: 'Cefalea tensional' }],
      prescriptions: [{ id: 'r-1', issuedAt: '2026-11-10T15:25:00Z', items: [{ medication: 'Acetaminofén', dose: '500 mg', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días' }] }] },
  ],
  laboratory: [
    { id: 'o-1', state: 'completado', createdAt: '2026-11-10T15:26:00Z', reviewedAt: '2026-11-11T10:00:00Z', items: [{ id: 'i-1', code: 'GLU', name: 'Glucosa en ayunas', unit: 'mg/dL', result: { value: 92, text: null, mark: 'normal' } }] },
    { id: 'o-2', state: 'en_proceso', createdAt: '2026-11-12T15:26:00Z', reviewedAt: null, items: [{ id: 'i-2', code: 'CRE', name: 'Creatinina sérica', result: null }] },
  ],
  admissions: [{ id: 'a-1', state: 'egresado', origin: 'consulta', createdAt: '2026-10-01T12:00:00Z', doctor: { id: 'staff-otro', name: 'Otra Médica Ficticia' } }],
};

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

describe('historial clínico (REQ-03, FR-106-09)', () => {
  it('pide el historial del paciente a la API y muestra consultas de todos los médicos con diagnósticos y recetas', async () => {
    const api = mount(['consulta.iniciar', 'expediente.ver'], { '/pacientes/pac-1/historial': history });
    const dialog = await openHistory();
    expect(await within(dialog).findByText('Dolor de cabeza')).toBeTruthy();
    expect(within(dialog).getByText('Control de presión')).toBeTruthy();
    expect(within(dialog).getByText(/Otra Médica Ficticia · Medicina interna/)).toBeTruthy();
    expect(within(dialog).getByText(/Hipertensión esencial/)).toBeTruthy();
    expect(within(dialog).getByText(/Cefalea tensional/)).toBeTruthy();
    expect(within(dialog).getByText(/Acetaminofén/)).toBeTruthy();
    expect(within(dialog).getByText(/000412-7/)).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/pacientes/pac-1/historial', expect.anything());
    expect(api.request.mock.calls.map(([path]) => path)).not.toContain('/laboratorio/ordenes');
  });

  it('muestra el estado de cada orden y el valor solo cuando la API lo entrega, más las hospitalizaciones', async () => {
    mount(['consulta.iniciar', 'expediente.ver'], { '/pacientes/pac-1/historial': history });
    const dialog = await openHistory();
    const lab = await within(dialog).findByRole('region', { name: 'Resultados de laboratorio' });
    expect(within(lab).getByText(/92 mg\/dL/)).toBeTruthy();
    expect(within(lab).getByText(/Creatinina sérica/).parentElement!.textContent).toContain('Sin valor disponible');
    expect(within(dialog).getByRole('region', { name: 'Hospitalizaciones' })).toBeTruthy();
  });

  it('sin consultas ni órdenes muestra los estados vacíos', async () => {
    mount(['consulta.iniciar', 'expediente.ver'], { '/pacientes/pac-2/historial': { ...history, patient: { id: 'pac-2', record: '000208-5', fullName: 'Paciente Ficticio Dos' }, consultations: [], laboratory: [], admissions: [] } });
    const dialog = await openHistory('Paciente Ficticio Dos');
    expect(await within(dialog).findByText('Sin consultas')).toBeTruthy();
    expect(within(dialog).getByText('Sin órdenes de laboratorio')).toBeTruthy();
  });

  it('si la API niega el acceso muestra el error y permite reintentar', async () => {
    mount(['consulta.iniciar', 'expediente.ver'], { '/pacientes/pac-1/historial': new ApiError('El historial requiere una relación de atención.', 403) });
    const dialog = await openHistory();
    expect(await within(dialog).findByText(/no tiene permiso/i)).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });

  it('sin expediente.ver no ofrece el historial', async () => {
    mount(['consulta.iniciar']);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Historial clínico/ })).toBeNull();
  });
});
