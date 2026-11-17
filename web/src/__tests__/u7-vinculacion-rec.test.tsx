import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AccountLinksPage, type LinkRequest } from '../features/account-links';

// U7 (odd/tasks/fase2-recorridos-auditoria.md, G2): reception compares, confirms and registers the missing record.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const profile = (permissions: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'adm@example.test', name: 'Administración de prueba', roles: ['ADM'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});

describe('G2 · Recepción verifica la vinculación', () => {
  const rec = profile(['cuentas.verificar', 'pacientes.registrar']);
  const exact: LinkRequest = { id: 'v-1', createdAt: '2026-11-16T15:00:00Z', version: 1, account: { email: 'paola@example.test', name: 'Paola Rivas' }, declared: { dui: '06612345-2', birth: '1999-05-30' },
    candidate: { id: 'pac-1', record: '000412-7', fullName: 'Paola Ficticia Rivas', birth: '1999-05-30', dui: '06612345-2', exact: true }, candidates: 1 };
  const none: LinkRequest = { id: 'v-2', createdAt: '2026-11-16T15:05:00Z', version: 3, account: { email: 'josue@example.test', name: 'Josué Ficticio Luna' }, declared: { dui: '00000001-8', birth: '1988-02-14' }, candidate: null, candidates: 0 };

  function mountLinks(lists: LinkRequest[][], write: (path: string, body: unknown) => Promise<unknown> = async () => ({ state: 'aprobada' })) {
    let call = 0;
    const api = {
      request: vi.fn(async (path: string) => { if (path !== '/cuentas/vinculaciones') throw new ApiError(`Ruta inesperada: ${path}`, 404); return lists[Math.min(call++, lists.length - 1)]; }),
      write: vi.fn(write),
    };
    render(<AccountLinksPage api={api as unknown as Api} profile={rec} version={0} />);
    return api;
  }

  it('never shows the declared DUI as the record DUI when the record has none', async () => {
    mountLinks([[{ ...exact, candidate: { ...exact.candidate!, dui: null } }]]);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de paola@example.test' });
    const dui = within(card).getByRole('row', { name: /DUI/ });
    expect(within(dui).getAllByText('06612345-2')).toHaveLength(1);
    expect(within(dui).getByText('Sin DUI en el expediente')).toBeTruthy();
    expect(within(dui).getByText('✗')).toBeTruthy();
  });

  it('confirma "Vincular <correo> con expediente <número>", advierte un dato ✗ y avisa al terminar', async () => {
    const api = mountLinks([[exact], []]);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de paola@example.test' });
    expect(within(within(card).getByRole('row', { name: /Nombre/ })).getByText('✗')).toBeTruthy();
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Aprobar vinculación' });
    expect(within(confirm).getByText('Vincular paola@example.test con expediente 000412-7')).toBeTruthy();
    expect(within(confirm).getByText(/No coincide: nombre/)).toBeTruthy();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Aprobar vinculación' }));
    expect(api.write).toHaveBeenCalledWith('/cuentas/vinculaciones/v-1/aprobar', { version: 1 }, 'POST');
    expect(await screen.findByText('paola@example.test quedó vinculada con el expediente 000412-7.')).toBeTruthy();
  });

  it('sin advertencia cuando todos los datos coinciden', async () => {
    mountLinks([[{ ...exact, account: { ...exact.account, name: 'Paola Ficticia Rivas' } }]]);
    const card = await screen.findByRole('listitem', { name: 'Solicitud de paola@example.test' });
    await userEvent.click(within(card).getByRole('button', { name: 'Aprobar' }));
    const confirm = await screen.findByRole('dialog', { name: 'Aprobar vinculación' });
    expect(within(confirm).queryByText(/No coincide/)).toBeNull();
  });

  it('"Registrar paciente" abre el formulario prellenado y al guardar vuelve a la tarjeta lista para aprobar', async () => {
    const ready: LinkRequest = { ...none, candidate: { id: 'pac-9', record: '000900-4', fullName: 'Josué Ficticio Luna', birth: '1988-02-14', dui: '00000001-8', exact: true }, candidates: 1 };
    const api = mountLinks([[none], [ready]], async (path: string) => {
      if (path === '/pacientes/busquedas') return { token: 'tk', expiresAt: new Date(Date.now() + 600_000).toISOString(), candidates: [] };
      if (path === '/pacientes') return { id: 'pac-9', record: '000900-4' };
      return { state: 'aprobada' };
    });
    const card = await screen.findByRole('listitem', { name: 'Solicitud de josue@example.test' });
    await userEvent.click(within(card).getByRole('button', { name: 'Registrar paciente' }));
    const form = await screen.findByRole('dialog', { name: 'Registrar paciente' });
    expect((within(form).getByLabelText('Nombres') as HTMLInputElement).value).toBe('Josué');
    expect((within(form).getByLabelText('Apellidos') as HTMLInputElement).value).toBe('Ficticio Luna');
    expect((within(form).getByLabelText('DUI · opcional') as HTMLInputElement).value).toBe('00000001-8');
    expect((within(form).getByLabelText('Nacimiento · opcional') as HTMLInputElement).value).toBe('14/02/1988');
    expect((within(form).getByLabelText('Correo · opcional') as HTMLInputElement).value).toBe('josue@example.test');
    expect(within(form).getByText(/Copiamos de la solicitud/)).toBeTruthy();
    await userEvent.click(within(form).getByRole('button', { name: /Registrar paciente/ }));
    await waitFor(() => expect(api.write.mock.calls.some(([p]) => p === '/pacientes')).toBe(true));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar paciente' })).toBeNull());
    const back = await screen.findByRole('listitem', { name: 'Solicitud de josue@example.test' });
    expect(await within(back).findByText(/Expediente 000900-4 registrado/)).toBeTruthy();
    expect(within(back).getByRole('button', { name: 'Aprobar' })).toBeTruthy();
  });
});
