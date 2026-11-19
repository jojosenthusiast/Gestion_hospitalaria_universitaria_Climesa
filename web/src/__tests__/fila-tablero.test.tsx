import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { destinations, moveFor } from '../lib/queue-moves';
import { QueuePage } from '../features/queue';

// Fase 2, flujo B (S9): tablero de la fila con número por área, prioridad, citados, arrastre con alternativa y deshacer.
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
const dataTransfer = () => { const store = new Map<string, string>(); return { setData: (k: string, v: string) => { store.set(k, v); }, getData: (k: string) => store.get(k) ?? '', get types() { return [...store.keys()]; }, effectAllowed: 'move', dropEffect: 'move' }; };

describe('reglas de movimiento del tablero', () => {
  it('cada movimiento es una acción del servidor y solo vale si el servidor la permite', () => {
    expect(moveFor({ state: 'en_espera', allowedActions: ['llamar'] }, 'llamado')).toEqual({ action: 'llamar', allowed: true });
    expect(moveFor({ state: 'llamado', allowedActions: [], undoActions: ['deshacer_llamado'] }, 'espera')).toEqual({ action: 'deshacer_llamado', allowed: true });
    expect(moveFor({ state: 'en_espera', allowedActions: ['llamar'] }, 'atencion')).toMatchObject({ allowed: false, action: null });
    expect(moveFor({ state: 'llamado', allowedActions: ['atender'], blockedActions: [{ action: 'no_se_presento', reason: 'Disponible después de 3 llamados (van 1).' }] }, 'cerrado'))
      .toEqual({ action: 'no_se_presento', allowed: false, reason: 'Disponible después de 3 llamados (van 1).' });
    expect(destinations({ state: 'llamado', allowedActions: ['atender'], undoActions: ['deshacer_llamado'] }).map(d => d.to)).toEqual(['espera', 'atencion']);
  });
});

describe('Fila del día · tablero (S9)', () => {
  it('la tarjeta muestra el código de área junto al número, la prioridad y si tiene cita o no', async () => {
    montar(['fila.ver'], [ticket({ priority: 'urgente', appointmentAt: '2026-11-17T16:30:00Z', walkIn: false }), ticket({ id: 't-8', numero: 8 })]);
    const espera = await screen.findByRole('region', { name: 'En espera' });
    const cards = within(espera).getAllByRole('listitem');
    expect(within(cards[0]).getByLabelText('Área Consulta general')).toBeTruthy();
    expect(within(cards[0]).getByText('7')).toBeTruthy();
    expect(within(cards[0]).getByText('Urgente')).toBeTruthy();
    expect(within(cards[0]).getByText(/Cita 10:30/)).toBeTruthy();
    expect(within(cards[1]).getByText('Sin cita')).toBeTruthy();
    expect(within(cards[1]).queryByText('Rutina')).toBeNull();
  });

  it('arrastrar a "Llamados" llama el número; soltar donde no se puede explica por qué y no escribe', async () => {
    const api = montar(['fila.ver', 'fila.llamar'], [ticket({ allowedActions: ['llamar'] })]);
    const card = within(await screen.findByRole('region', { name: 'En espera' })).getByRole('listitem');
    const transfer = dataTransfer();
    fireEvent.dragStart(card, { dataTransfer: transfer });
    fireEvent.dragOver(screen.getByRole('region', { name: 'En atención' }), { dataTransfer: transfer });
    fireEvent.drop(screen.getByRole('region', { name: 'En atención' }), { dataTransfer: transfer });
    expect(await within(card).findByRole('alert')).toHaveProperty('textContent', expect.stringMatching(/Ese cambio no existe en la fila/));
    expect(api.write).not.toHaveBeenCalled();
    fireEvent.drop(screen.getByRole('region', { name: 'Llamados' }), { dataTransfer: transfer });
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/fila/t-7/llamar', { version: 2 }, 'POST'));
  });

  // Owner batch 2 (S28): the next step is a button on the card; the «Más» menu holds only what the card does not show.
  it('la tarjeta muestra su siguiente paso como botón y el menú «Más» no lo repite', async () => {
    const api = montar(['fila.ver', 'fila.gestionar', 'fila.llamar'], [ticket({ state: 'llamado', llamados: 1, allowedActions: ['atender', 'no_se_presento'], undoActions: ['deshacer_llamado'] })]);
    const card = within(await screen.findByRole('region', { name: 'Llamados' })).getByRole('listitem');
    expect(within(card).queryByRole('combobox')).toBeNull();
    await userEvent.click(within(card).getByRole('button', { name: 'Más acciones de CON 7' }));
    const menu = within(card).getByRole('menu', { name: 'Más acciones de CON 7' });
    const labels = within(menu).getAllByRole('menuitem').map(item => item.textContent);
    expect(labels).toEqual(['Mover a En espera', 'Cambiar a Emergencia', 'Cambiar a Urgente']);
    expect(labels.some(text => /Iniciar atención|Completar|No se presentó|Mover…|Mover a$/.test(text ?? ''))).toBe(false);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Mover a En espera' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/fila/t-7/deshacer-llamado', { version: 2 }, 'POST'));
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: /^Iniciar atención/ }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/fila/t-7/atender', { version: 2 }, 'POST'));
  });

  it('una tarjeta en atención ofrece «Completar» una sola vez y sin menú de mover', async () => {
    montar(['fila.ver', 'fila.gestionar'], [ticket({ state: 'en_atencion', allowedActions: ['completar'] })]);
    const card = within(await screen.findByRole('region', { name: 'En atención' })).getByRole('listitem');
    expect(within(card).getAllByRole('button', { name: /Completar/ })).toHaveLength(1);
    expect(within(card).queryByRole('button', { name: /Más acciones/ })).toBeNull();
  });

  it('el menú cambia la prioridad y se cierra con Escape', async () => {
    const api = montar(['fila.ver', 'fila.gestionar'], [ticket()]);
    await userEvent.click(await screen.findByRole('button', { name: 'Más acciones de CON 7' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones de CON 7' }));
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Cambiar a Emergencia' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/fila/t-7/prioridad', { version: 2, priority: 'emergencia' }, 'POST'));
  });

  it('después de llamar ofrece deshacer con la versión que devolvió el servidor', async () => {
    const api = montar(['fila.ver', 'fila.llamar'], [ticket({ allowedActions: ['llamar'] })], async path => path.endsWith('/llamar') ? { id: 't-7', version: 3, state: 'llamado', llamados: 1 } : { id: 't-7', version: 4, state: 'en_espera', llamados: 0 });
    await userEvent.click(await screen.findByRole('button', { name: /^Llamar$/ }));
    expect(await screen.findByText('Llamaste CON 7.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(api.write).toHaveBeenLastCalledWith('/fila/t-7/deshacer-llamado', { version: 3 }, 'POST');
    await vi.waitFor(() => expect(screen.queryByText('Llamaste CON 7.')).toBeNull());
  });

  it('arriba muestra quién pasa después con su motivo y llama al siguiente hacia un consultorio', async () => {
    const api = montar(['fila.ver', 'fila.llamar', 'espacios.ver'], [ticket({ allowedActions: ['llamar'] })]);
    await userEvent.click(await screen.findByRole('button', { name: /^Consulta general/ }));
    // R4a: the region is «Quién sigue»; the ordering rule moved from printed text to the line's tooltip.
    const next = await screen.findByRole('region', { name: 'Quién sigue' });
    expect(await within(next).findByText('Paciente Ficticio Nueve')).toBeTruthy();
    expect(within(next).getByText('Urgente: pasa antes que las citas y la fila.')).toBeTruthy();
    expect(next.getAttribute('title')).toMatch(/Emergencias primero/);
    await userEvent.selectOptions(await within(next).findByRole('combobox', { name: 'Consultorio' }), 'c-1');
    // Android parity: the call button lives in the bottom dock, with the room chosen in «Quién sigue».
    await userEvent.click(within(screen.getByRole('region', { name: 'Resumen de atención' })).getByRole('button', { name: /Llamar siguiente/ }));
    expect(api.write).toHaveBeenCalledWith('/fila/llamar-siguiente', { service: 'consulta_general', officeId: 'c-1' }, 'POST');
  });

  it('emitir con prioridad urgente la envía; rutina deja el cuerpo como antes', async () => {
    const api = montar(['fila.ver', 'fila.emitir', 'fila.gestionar'], []);
    await userEvent.click(await screen.findByRole('button', { name: /Emitir número/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Mostrador' });
    await userEvent.type(within(dialogo).getByRole('combobox', { name: 'Paciente' }), 'pac');
    await userEvent.click(await within(dialogo).findByRole('option', { name: /Paciente Ficticio Uno/ }));
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Urgente' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: /Emitir número/ }));
    expect(api.write).toHaveBeenCalledWith('/fila', { service: 'consulta_general', patientId: 'p-1', priority: 'urgente' }, 'POST');
  });

  it('con 2 o más llamados no se arrastra a "En espera": el menú ofrece "Quitar un llamado"', async () => {
    const twice = { state: 'llamado', llamados: 2, allowedActions: ['atender'], undoActions: ['deshacer_llamado'] };
    expect(moveFor(twice, 'espera')).toMatchObject({ allowed: false, action: null });
    expect(destinations(twice).map(d => d.to)).toEqual(['atencion']);
    expect(moveFor({ ...twice, llamados: 1 }, 'espera')).toEqual({ action: 'deshacer_llamado', allowed: true });
    const api = montar(['fila.ver', 'fila.llamar'], [ticket({ state: 'llamado', llamados: 2, allowedActions: ['atender'], undoActions: ['deshacer_llamado'] })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Más acciones de CON 7' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: /En espera/ })).toBeNull();
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Quitar un llamado (van 2)' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/fila/t-7/deshacer-llamado', { version: 2 }, 'POST'));
  });

  it('un paciente (fila propia) no ve ni pide "Quién pasa después"', async () => {
    const api = { request: vi.fn(async () => [ticket()]), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
    const paciente: AccessProfile = { ...perfil([]), roles: ['PAC'], permissions: [{ code: 'fila.ver', context: 'propio' }] };
    render(<QueuePage api={api} profile={paciente} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Consulta general/ }));
    expect(screen.queryByRole('region', { name: 'Quién sigue' })).toBeNull();
    expect(api.request.mock.calls.some(([path]) => String(path).startsWith('/fila/siguiente'))).toBe(false);
  });

  it('si la propuesta no se puede leer muestra el error, nunca "Nadie espera"', async () => {
    const api = { request: vi.fn(async (path: string) => { if (path.startsWith('/fila/siguiente')) throw new ApiError('No se pudo calcular quién pasa después.', 500); return [ticket()]; }), write: vi.fn() } as unknown as Api;
    render(<QueuePage api={api} profile={perfil(['fila.ver', 'fila.llamar'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /^Consulta general/ }));
    const next = await screen.findByRole('region', { name: 'Quién sigue' });
    expect(await within(next).findByText(/No se pudo calcular quién pasa después/)).toBeTruthy();
    expect(within(next).queryByText('Nadie espera en este servicio.')).toBeNull();
  });
});
