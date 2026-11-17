import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { QueuePage } from '../features/queue';

// R7 U1 (odd/tasks/fase2-recorridos-auditoria.md), journeys B1-B3: the front desk issues and shows the number,
// registers the arrival of a booked patient in one click, and the board keeps undo, errors and closing per card.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const REC = ['fila.ver', 'fila.emitir', 'fila.gestionar', 'fila.llamar'];
const booked = { id: 'p-1', fullName: 'Ana Ficticia Mostrador', record: '000101-1', appointmentToday: { id: 'c-1', start: '2026-11-17T16:20:00Z', doctorId: 'm-1', doctorName: 'Dra. Rosa Prueba' }, ticketToday: null };
const walkIn = { id: 'p-2', fullName: 'Luis Ficticio Sin Cita', record: '000102-1', appointmentToday: null, ticketToday: null };
const holding = { id: 'p-3', fullName: 'Marta Ficticia Con Número', record: '000103-1', appointmentToday: null, ticketToday: { id: 't-3', service: 'laboratorio', numero: 4, state: 'en_espera', appointmentId: null } };
const ticket = (over: Record<string, unknown> = {}) => ({ id: 't-7', service: 'consulta_general', area: 'CON', fecha: '2026-11-17', numero: 7, patientName: 'Paciente Ficticio Uno', state: 'en_espera', llamados: 0, version: 2, issuedAt: '2026-11-17T14:00:00Z', maxCalls: 3, allowedActions: [], ...over });

function montar(rows: unknown[] = [], write: Api['write'] = vi.fn(async () => ({})) as Api['write'], permissions = REC) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path.startsWith('/pacientes/selector')) return { items: [booked, walkIn, holding], hasMore: false };
      if (path === '/pacientes/p-2') return { id: 'p-2', record: '000102-1', fullName: walkIn.fullName };
      if (path === '/fila/mi-puesto') return { service: 'laboratorio', area: 'LAB', areaName: 'Laboratorio', officeId: null, officeCode: null, shiftEnd: null };
      if (path.startsWith('/fila/siguiente')) return { service: 'laboratorio', area: 'LAB', rule: 'orden', proposal: null };
      return rows;
    }),
    write: vi.fn(write),
  } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<QueuePage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}
const openDesk = async () => {
  await userEvent.click(await screen.findByRole('button', { name: /Emitir número/ }));
  return screen.findByRole('dialog', { name: 'Mostrador' });
};
const pick = async (dialog: HTMLElement, name: RegExp) => {
  await userEvent.type(within(dialog).getByRole('combobox', { name: 'Paciente' }), 'fic');
  await userEvent.click(await within(dialog).findByRole('option', { name }));
};

describe('B1 · mostrador', () => {
  it('each result says the appointment of today or the number already held', async () => {
    montar();
    const dialog = await openDesk();
    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Paciente' }), 'fic');
    expect(await within(dialog).findByRole('option', { name: /Ana Ficticia Mostrador.*Cita hoy 10:20 · Dra. Rosa Prueba/ })).toBeTruthy();
    expect(within(dialog).getByRole('option', { name: /Marta Ficticia Con Número.*Ya tiene LAB 4 \(en espera\)/ })).toBeTruthy();
  });

  it('a booked patient: «Registrar llegada» is one click, sends the appointment and shows the number issued', async () => {
    const api = montar([], vi.fn(async () => ({ id: 't-12', numero: 12, service: 'consulta_general', area: 'CON', state: 'en_espera', version: 1, patientName: booked.fullName, appointmentId: 'c-1', ahead: 3, voidableUntil: new Date(Date.now() + 600_000).toISOString() })) as Api['write']);
    const dialog = await openDesk();
    await pick(dialog, /Ana Ficticia Mostrador/);
    await userEvent.click(within(dialog).getByRole('button', { name: /Registrar llegada/ }));
    expect(api.write).toHaveBeenCalledTimes(1);
    expect(api.write).toHaveBeenCalledWith('/fila', { service: 'consulta_general', patientId: 'p-1', appointmentId: 'c-1' }, 'POST');
    const card = await within(dialog).findByRole('status', { name: 'Número emitido' });
    expect(within(card).getByText('12')).toBeTruthy();
    expect(within(card).getByText(/3 antes/)).toBeTruthy();
    expect(within(card).getByText(/Llegada registrada · cita 10:20 con Dra. Rosa Prueba/)).toBeTruthy();
    // The board re-reads after the issue, without a reload.
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([p]) => p === '/fila').length).toBe(2));
  });

  it('a walk-in chooses service and priority as chips; «Anular» voids the number just issued', async () => {
    const write = vi.fn(async (path: string) => path === '/fila'
      ? { id: 't-5', numero: 5, service: 'laboratorio', area: 'LAB', state: 'en_espera', version: 1, patientName: walkIn.fullName, appointmentId: null, ahead: 0, voidableUntil: new Date(Date.now() + 600_000).toISOString() }
      : { version: 2, state: 'cerrado' });
    const api = montar([], write as unknown as Api['write']);
    const dialog = await openDesk();
    await pick(dialog, /Luis Ficticio Sin Cita/);
    expect(within(dialog).queryByRole('button', { name: /Registrar llegada/ })).toBeNull();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Laboratorio' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Urgente' }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Emitir número/ }));
    expect(api.write).toHaveBeenCalledWith('/fila', { service: 'laboratorio', patientId: 'p-2', priority: 'urgente' }, 'POST');
    expect(within(await within(dialog).findByRole('status', { name: 'Número emitido' })).getByText(/Nadie antes/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anular este número' }));
    expect(api.write).toHaveBeenCalledWith('/fila/t-5/anular', { version: 1 }, 'POST');
    expect(await within(dialog).findByText('Se anuló LAB 5. Puedes emitir otro número.')).toBeTruthy();
  });

  it('a patient who already holds a number gets no second issue button', async () => {
    montar();
    const dialog = await openDesk();
    await pick(dialog, /Marta Ficticia Con Número/);
    expect(within(dialog).getByText(/ya tiene el número LAB 4 \(en espera\)/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /Emitir número|Registrar llegada/ })).toBeNull();
  });

  it('from the patient record (#/fila?accion=emitir&paciente=…) the patient comes chosen', async () => {
    location.hash = '#/fila?accion=emitir&paciente=p-2';
    montar();
    const dialog = await screen.findByRole('dialog', { name: 'Mostrador' });
    expect(await within(dialog).findByRole('button', { name: /Emitir número/ })).toBeTruthy();
    expect(within(dialog).getByText('Luis Ficticio Sin Cita')).toBeTruthy();
    expect(location.hash).not.toContain('paciente=');
  });

  it('an error stays in the dialog in plain words and the button is not sent twice', async () => {
    const write = vi.fn(async () => { throw new ApiError('La llegada de esta cita ya se registró con el número 12.', 409, 'ticket_activo_existente'); });
    const api = montar([], write as unknown as Api['write']);
    const dialog = await openDesk();
    await pick(dialog, /Ana Ficticia Mostrador/);
    await userEvent.click(within(dialog).getByRole('button', { name: /Registrar llegada/ }));
    expect(await within(dialog).findByText('La llegada de esta cita ya se registró con el número 12.')).toBeTruthy();
    expect(within(dialog).queryByText('ticket_activo_existente')).toBeNull();
    expect(api.write).toHaveBeenCalledTimes(1);
  });
});

describe('B2-B3 · tablero', () => {
  it('?accion=llamar preselects the service of the shift in progress', async () => {
    location.hash = '#/fila?accion=llamar';
    const api = montar([ticket({ service: 'laboratorio', area: 'LAB', allowedActions: ['llamar'] })]);
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledWith('/fila/siguiente?service=laboratorio', expect.anything()));
    expect(location.hash).not.toContain('accion=');
  });

  it('the card shows the appointment time with the doctor and that the arrival was registered', async () => {
    montar([ticket({ appointmentAt: '2026-11-17T16:20:00Z', appointmentDoctorName: 'Dra. Rosa Prueba', arrivalFromAppointment: true })]);
    const card = within(await screen.findByRole('region', { name: 'En espera' })).getByRole('listitem');
    expect(within(card).getByText(/Cita 10:20 · Dra. Rosa Prueba/)).toBeTruthy();
    expect(within(card).getByText('Llegada registrada')).toBeTruthy();
  });

  it('each called card keeps its own «Deshacer llamado»', async () => {
    const rows = [ticket({ allowedActions: ['llamar'] }), ticket({ id: 't-8', numero: 8, allowedActions: ['llamar'] })];
    const write = vi.fn(async (path: string) => {
      const id = path.split('/')[2], index = rows.findIndex(r => r.id === id);
      if (index >= 0 && path.endsWith('/llamar')) rows[index] = { ...rows[index], state: 'llamado', llamados: 1, version: 3, allowedActions: ['atender'] };
      return { id, version: 3, state: 'llamado', llamados: 1 };
    });
    const api = montar(rows, write as unknown as Api['write']);
    await userEvent.click((await screen.findAllByRole('button', { name: /^Llamar$/ }))[0]);
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: /^Llamar$/ })).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /^Llamar$/ }));
    const called = await screen.findByRole('region', { name: 'Llamados' });
    await vi.waitFor(() => expect(within(called).getAllByRole('button', { name: /Deshacer llamado/ })).toHaveLength(2));
    await userEvent.click(within(called).getAllByRole('button', { name: /Deshacer llamado/ })[0]);
    expect(api.write).toHaveBeenCalledWith(expect.stringMatching(/^\/fila\/t-[78]\/deshacer-llamado$/), { version: 3 }, 'POST');
  });

  it('dropping on «Terminados» asks first, naming the patient, and uses the live version', async () => {
    const api = montar([ticket({ state: 'llamado', llamados: 3, version: 5, allowedActions: ['atender', 'no_se_presento'] })]);
    const card = within(await screen.findByRole('region', { name: 'Llamados' })).getByRole('listitem');
    const data = new Map<string, string>();
    const transfer = { setData: (k: string, v: string) => data.set(k, v), getData: (k: string) => data.get(k) ?? '', get types() { return [...data.keys()]; }, effectAllowed: 'move' };
    fireEvent.dragStart(card, { dataTransfer: transfer });
    expect(JSON.parse(data.get('application/x-climesa-ticket')!)).toEqual({ id: 't-7' });
    fireEvent.drop(screen.getByRole('region', { name: 'Terminados' }), { dataTransfer: transfer });
    const confirm = await screen.findByRole('dialog', { name: 'Cerrar número' });
    expect(within(confirm).getByText(/CON 7 · Paciente Ficticio Uno/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'No se presentó' }));
    expect(api.write).toHaveBeenCalledWith('/fila/t-7/no-se-presento', { version: 5 }, 'POST');
  });

  it('a failed card action shows its message on that card', async () => {
    montar([ticket({ allowedActions: ['llamar'] })], vi.fn(async () => { throw new ApiError('Ese número ya fue llamado desde otro puesto.', 409, 'transicion_invalida'); }) as Api['write']);
    await userEvent.click(await screen.findByRole('button', { name: /^Llamar$/ }));
    const card = within(screen.getByRole('region', { name: 'En espera' })).getByRole('listitem');
    expect((await within(card).findByRole('alert')).textContent).toBe('Ese número ya fue llamado desde otro puesto.');
  });

  it('the issuer can void a fresh number from the card menu', async () => {
    const api = montar([ticket({ voidableUntil: new Date(Date.now() + 300_000).toISOString() })]);
    const menu = await screen.findByRole('combobox', { name: 'Mover o cambiar prioridad de CON 7' });
    await userEvent.selectOptions(menu, 'anular');
    expect(api.write).toHaveBeenCalledWith('/fila/t-7/anular', { version: 2 }, 'POST');
  });
});
