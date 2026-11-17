import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AccountLinksPage, type LinkRequest } from '../features/account-links';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const profile = (permissions: string[]): AccessProfile => ({
  id: 'rec-1', user: { id: 'rec-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: 'staff-rec-1',
});
const requests: LinkRequest[] = [
  { id: 'v-1', createdAt: '2026-11-13T15:12:00Z', version: 1, account: { email: 'paola@example.test', name: 'Paola Ficticia Rivas' }, declared: { dui: '06612345-2', birth: '1999-05-30' }, candidate: { id: 'pac-1', record: '000412-7', fullName: 'Paola Ficticia Rivas', birth: '1999-05-30' }, candidates: 1 },
  { id: 'v-2', createdAt: '2026-11-13T16:05:00Z', version: 3, account: { email: 'josue@example.test', name: 'Josué Ficticio' }, declared: { dui: '07788990-1', birth: '1988-02-14' }, candidate: null, candidates: 0 },
];

function mount(permissions: string[], list: unknown = requests, write: (path: string, body: unknown) => Promise<unknown> = async () => ({ state: 'aprobada' })) {
  const api = {
    request: vi.fn(async (path: string) => { if (path !== '/cuentas/vinculaciones') throw new ApiError(`Ruta inesperada: ${path}`, 404); if (list instanceof Error) throw list; return list; }),
    write: vi.fn(write),
  };
  render(<AccountLinksPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}

describe('W27 · vinculaciones por verificar (FR-101-08 a FR-101-11)', () => {
  it('compara lo que dio el paciente con el expediente candidato y aprueba con la versión', async () => {
    const api = mount(['cuentas.verificar']);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de paola@example.test' });
    expect(within(card).getAllByText('Coincide')).toHaveLength(3);
    expect(within(card).getAllByText(/000412-7/).length).toBeGreaterThan(0);
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }));
    // R7 U1 (G2): approving gives the account the whole record, so it confirms first, naming the record.
    const confirm = await screen.findByRole('dialog', { name: 'Aprobar vinculación' });
    expect(within(confirm).getByText(/000412-7 · Paola Ficticia Rivas/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Aprobar vinculación' }));
    expect(api.write).toHaveBeenCalledWith('/cuentas/vinculaciones/v-1/aprobar', { version: 1 }, 'POST');
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('explica qué es una vinculación, sus pasos y sus estados', async () => {
    mount(['cuentas.verificar']);
    expect(await screen.findByRole('heading', { name: '¿Qué es una vinculación?' })).toBeTruthy();
    expect(screen.getByText(/1\. Llega la solicitud/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Estados' })).toBeTruthy();
    expect((await screen.findAllByRole('status')).some(n => /2 solicitudes esperan tu revisión/.test(n.textContent ?? ''))).toBe(true);
  });

  it('con la lista vacía orienta en vez de dejar la pantalla en blanco', async () => {
    mount(['cuentas.verificar'], []);
    expect(await screen.findByText(/Estás al día/)).toBeTruthy();
  });

  it('sin expediente no ofrece aprobar y lleva a registrar al paciente', async () => {
    mount(['cuentas.verificar']);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de josue@example.test' });
    expect(within(card).queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(within(card).getByRole('link', { name: 'Registrar paciente' }).getAttribute('href')).toBe('#/pacientes?accion=registrar');
    expect(within(card).getByText(/No hay expediente con ese DUI/)).toBeTruthy();
  });

  it('rechazar exige un motivo de 10 caracteres y lo envía con la versión', async () => {
    const api = mount(['cuentas.verificar']);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de josue@example.test' });
    await userEvent.click(within(card).getByRole('button', { name: 'Rechazar con motivo' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Motivo del rechazo'), 'corto');
    await userEvent.click(within(dialog).getByRole('button', { name: /Rechazar solicitud/ }));
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText('Motivo del rechazo'), ' y sin expediente');
    await userEvent.click(within(dialog).getByRole('button', { name: /Rechazar solicitud/ }));
    expect(api.write).toHaveBeenCalledWith('/cuentas/vinculaciones/v-2/rechazar', { version: 3, reason: 'corto y sin expediente' }, 'POST');
  });

  it('muestra el error de la API al aprobar (por ejemplo, otra persona ya la resolvió)', async () => {
    mount(['cuentas.verificar'], requests, async () => { throw new ApiError('Esta solicitud ya fue resuelta.', 409); });
    const card = await screen.findByRole('listitem', { name: 'Solicitud de paola@example.test' });
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar vinculación' }));
    expect(await screen.findByText('Esta solicitud ya fue resuelta.')).toBeTruthy();
  });

  it('G2: compares the record DUI (not the declared one); the closest record is marked ✗ and cannot be approved', async () => {
    const near: LinkRequest = { id: 'v-3', createdAt: '2026-11-13T17:00:00Z', version: 1, account: { email: 'ana@example.test', name: 'Ana Ficticia' }, declared: { dui: '04567892-9', birth: '1990-01-01' },
      candidate: null, candidates: 0, closest: { id: 'pac-3', record: '000500-1', fullName: 'Ana Ficticia', birth: '1990-01-01', dui: '04567891-1' } };
    mount(['cuentas.verificar'], [near]);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de ana@example.test' });
    const dui = within(card).getByRole('row', { name: /DUI/ });
    expect(within(dui).getByText('04567892-9')).toBeTruthy();
    expect(within(dui).getByText('04567891-1')).toBeTruthy();
    expect(within(dui).getByText('✗')).toBeTruthy();
    expect(within(within(card).getByRole('row', { name: /Nacimiento/ })).getByText('✓')).toBeTruthy();
    expect(within(card).getByText(/El más parecido es 000500-1/)).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Aprobar' })).toBeNull();
  });

  it('lista vacía y error de carga tienen su estado', async () => {
    mount(['cuentas.verificar'], []);
    expect(await screen.findByText('No hay vinculaciones pendientes')).toBeTruthy();
    cleanup();
    mount(['cuentas.verificar'], new ApiError('Sin permiso', 403));
    expect(await screen.findByText(/no tiene permiso/i)).toBeTruthy();
  });
});
