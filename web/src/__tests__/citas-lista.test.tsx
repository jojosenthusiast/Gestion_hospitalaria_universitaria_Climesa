import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';

// R4a (flow A, S1, S8): Citas is a list grouped by day with a compact filter bar, one primary action, the requests
// tray agreeing with the Solicitadas count, past appointments shown as «Vencida», and correct plurals.
afterEach(cleanup);

const profile = (codes: string[]): AccessProfile => ({ id: 'rec', user: { id: 'rec' }, email: 'rec@example.test', name: 'Recepción', roles: ['REC'], platforms: ['web'], permissions: codes.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null });
const rec = () => profile(['citas.ver', 'citas.agendar', 'citas.cancelar', 'citas.solicitar']);
const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const cita = (id: string, state: string, start: string, doctor = 'd-1', allowedActions: string[] = []) => ({ id, patientId: `p-${id}`, patientName: `Paciente ${id}`, doctorId: doctor, doctorName: doctor === 'd-1' ? 'Médica Uno' : 'Médico Dos', start, end: new Date(Date.parse(start) + 20 * 60_000).toISOString(), state, origin: 'app', version: 1, allowedActions, blockedActions: [] });
const rows = [
  cita('s1', 'solicitada', future(30), 'd-1', ['confirmar', 'rechazar']), cita('s2', 'solicitada', future(30.5), 'd-2', ['confirmar', 'rechazar']),
  cita('c1', 'confirmada', future(48), 'd-1'), cita('c2', 'confirmada', future(48.4), 'd-1'), cita('c3', 'confirmada', future(48.8), 'd-1'), cita('c4', 'confirmada', future(49), 'd-2'),
  // Two days ago and still «confirmada»: the server has no state for it.
  cita('old', 'confirmada', future(-50), 'd-1', ['no_asistio']),
];
const requests = [{ id: 'q1', patientId: 'p', patientName: 'Paciente Por Motivo', record: 'EXP-1', categories: [{ code: 'piel', name: 'Piel', icon: 'piel' }], specialties: ['Dermatología'], franja: 'tarde', note: null, preferredDoctorId: null, preferredDoctorName: null, state: 'pendiente', createdAt: future(-2), version: 1, allowedActions: ['asignar', 'rechazar'], blockedActions: [] }];
function mount() {
  const api = { request: vi.fn(async (path: string) => path === '/citas' ? rows : path === '/citas/solicitudes-categoria' ? requests : path.startsWith('/citas/categorias') ? [] : { doctors: [] }), write: vi.fn(async () => ({})) };
  render(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={0} />);
  return api;
}

describe('Citas · lista por día (R4a)', () => {
  it('barra compacta: a lo sumo 4 estados visibles y el resto en «Más»', async () => {
    mount();
    const estados = await screen.findByRole('group', { name: 'Estado de la cita' });
    expect(within(estados).getAllByRole('button').length).toBeLessThanOrEqual(4);
    expect(within(estados).getByRole('combobox', { name: /Más opciones/ })).toBeTruthy();
    expect(screen.queryByText(/agrupadas por día/)).toBeNull();
  });

  it('una sola acción principal: «Agendar cita»', async () => {
    const { container } = render(<></>);
    mount();
    await screen.findByRole('group', { name: 'Estado de la cita' });
    const primaries = document.querySelectorAll('.compact-header .primary-button');
    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toContain('Agendar cita');
    expect(container).toBeTruthy();
  });

  it('la bandeja de solicitudes cuenta lo mismo que «Solicitadas»: con médico y por motivo', async () => {
    mount();
    const bandeja = await screen.findByRole('region', { name: 'Solicitudes por asignar' });
    expect(await within(bandeja).findByText('Paciente Por Motivo')).toBeTruthy();
    expect(within(bandeja).getByText('Paciente s1')).toBeTruthy();
    expect(within(bandeja).getByRole('button', { name: /^Confirmar · Paciente s2/ })).toBeTruthy();
    expect(within(bandeja).getByLabelText('3 pendientes')).toBeTruthy();
    const more = within(await screen.findByRole('group', { name: 'Estado de la cita' })).getByRole('combobox');
    expect(within(more).getByRole('option', { name: 'Solicitadas (3)' })).toBeTruthy();
  });

  it('una cita confirmada cuya hora ya pasó se ve «Vencida» y no está entre las próximas', async () => {
    mount();
    await screen.findByText('Paciente c1');
    expect(screen.queryByText('Paciente old')).toBeNull();
    await userEvent.click(within(screen.getByRole('group', { name: 'Estado de la cita' })).getByRole('button', { name: /^Vencidas/ }));
    const fila = (await screen.findByText('Paciente old')).closest('.ag-slot')!;
    expect(within(fila as HTMLElement).getByText('Vencida')).toBeTruthy();
    expect(within(fila as HTMLElement).queryByText('Confirmada')).toBeNull();
  });

  it('plurales correctos por médico: «1 cita», «3 citas», nunca «cita(s)»', async () => {
    mount();
    await screen.findByText('Paciente c1');
    expect(screen.getByText('3 citas')).toBeTruthy();
    expect(screen.getAllByText('1 cita').length).toBeGreaterThan(0);
    expect(screen.queryByText(/cita\(s\)/)).toBeNull();
  });
});
