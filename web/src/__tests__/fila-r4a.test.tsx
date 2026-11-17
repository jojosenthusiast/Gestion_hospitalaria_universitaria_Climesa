import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api } from '../lib/api';
import { QueuePage } from '../features/queue';

// R4a (board pattern, flow B): counts live in the column headers, one segmented service filter, a «Quién sigue» line
// with the call button always in reach, booked vs walk-in on every card, and no helper sentences.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
type Row = Record<string, unknown>;
const ticket = (over: Row = {}): Row => ({ id: 't-7', service: 'consulta_general', area: 'CON', fecha: '2026-11-17', numero: 7, patientName: 'Paciente Ficticio Uno', state: 'en_espera', llamados: 0, version: 2, issuedAt: '2026-11-17T15:00:00Z', priority: 'rutina', appointmentAt: null, walkIn: true, maxCalls: 3, callsForAbsence: 3, allowedActions: [], blockedActions: [], undoActions: [], ...over });
const proposal = { service: 'consulta_general', area: 'CON', rule: 'Emergencias primero; luego urgentes; luego citas dentro de su ventana; luego el resto en orden de llegada.', proposal: { id: 't-9', numero: 9, area: 'CON', patientName: 'Paciente Ficticio Nueve', priority: 'urgente', appointmentAt: null, version: 1, reason: 'urgente', reasonText: 'Urgente: pasa antes que las citas y la fila.' } };

function montar(permissions: string[], rows: Row[], write: (path: string, body: unknown) => unknown = async () => ({})) {
  const api = {
    request: vi.fn(async (path: string) => path.startsWith('/fila/siguiente') ? proposal : path.startsWith('/espacios') ? [{ id: 'c-1', type: 'consultorio', code: 'C-101', name: 'Consultorio 1', active: true }] : path.startsWith('/pacientes/selector') ? { items: [{ id: 'p-1', fullName: 'Paciente Ficticio Uno', record: '000101-1' }], hasMore: false } : rows),
    write: vi.fn(async (path: string, body: unknown) => write(path, body)),
  } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<QueuePage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}

describe('Fila · tablero (R4a)', () => {
  it('sin tarjetas de conteo repetidas: el conteo vive en el encabezado de cada columna', async () => {
    montar(['fila.ver', 'fila.llamar'], [ticket(), ticket({ id: 't-8', numero: 8 })]);
    const espera = await screen.findByRole('region', { name: 'En espera' });
    expect(within(espera).getByText('2')).toBeTruthy();
    expect(screen.queryByLabelText('Resumen de la fila')).toBeNull();
    expect(screen.queryByText(/máxima 0 min/)).toBeNull();
  });

  it('el servicio se filtra con un solo control segmentado, sin chip de filtro activo repetido', async () => {
    montar(['fila.ver', 'fila.llamar'], [ticket()]);
    const servicio = await screen.findByRole('group', { name: 'Servicio' });
    await userEvent.click(within(servicio).getByRole('button', { name: /^Consulta general/ }));
    expect(screen.queryByRole('button', { name: /Quitar filtro/ })).toBeNull();
    expect(screen.getAllByText('Consulta general', { selector: 'button span, .cl-active-filter *' })).toHaveLength(1);
  });

  it('«Quién sigue» nombra el siguiente número y «Llamar siguiente» está a mano aun con «Todos»', async () => {
    const api = montar(['fila.ver', 'fila.llamar', 'espacios.ver'], [ticket({ allowedActions: ['llamar'] })]);
    const next = await screen.findByRole('region', { name: 'Quién sigue' });
    expect(await within(next).findByText('Paciente Ficticio Nueve')).toBeTruthy();
    expect(within(next).queryByText(/^Regla:/)).toBeNull();
    expect(screen.queryByText(/Elige un servicio/)).toBeNull();
    await userEvent.selectOptions(await within(next).findByRole('combobox', { name: 'Consultorio' }), 'c-1');
    await userEvent.click(within(next).getByRole('button', { name: /Llamar siguiente/ }));
    expect(api.write).toHaveBeenCalledWith('/fila/llamar-siguiente', { service: 'consulta_general', officeId: 'c-1' }, 'POST');
  });

  it('cada tarjeta dice si trae cita o llegó sin cita, y la hora de emisión es corta', async () => {
    montar(['fila.ver'], [ticket({ walkIn: false }), ticket({ id: 't-8', numero: 8, appointmentAt: '2026-11-17T16:30:00Z', walkIn: false })]);
    const espera = await screen.findByRole('region', { name: 'En espera' });
    const cards = within(espera).getAllByRole('listitem');
    expect(within(cards[0]).queryByText(/Sin cita|Cita \d/)).toBeTruthy();
    expect(within(cards[1]).queryByText(/Sin cita|Cita \d/)).toBeTruthy();
    expect(within(espera).queryByText(/2026/)).toBeNull();
  });

  it('solo lectura es una marca corta, no una frase', async () => {
    montar(['fila.ver'], [ticket()]);
    await screen.findByRole('region', { name: 'En espera' });
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.queryByText(/Vista de solo lectura/)).toBeNull();
  });

  it('emitir número no tiene párrafos de ayuda', async () => {
    montar(['fila.ver', 'fila.emitir', 'fila.gestionar'], []);
    await userEvent.click(await screen.findByRole('button', { name: /Emitir número/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Mostrador' });
    expect(within(dialogo).queryByText(/cuenta desde 1|pasan antes que las citas/)).toBeNull();
  });
});
