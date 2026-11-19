import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Staff, type UserAccount } from '../lib/api';
import { clickRowAction, rowActionLabels } from './row-actions';
import { PersonnelPage } from '../features/personnel';

// U7 (odd/tasks/fase2-recorridos-auditoria.md, G1): register a person and invite the account in one act.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const profile = (permissions: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'adm@example.test', name: 'Administración de prueba', roles: ['ADM'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const admin = profile(['personal.ver', 'personal.gestionar', 'usuarios.ver', 'usuarios.invitar']);

describe('G1 · registrar e invitar en un solo acto', () => {
  function mountDirectory(invite: () => Promise<unknown>) {
    let staff: Staff[] = [];
    let accounts: UserAccount[] = [];
    const api = {
      request: vi.fn(async (path: string): Promise<unknown> => (path === '/personal' ? staff : path === '/usuarios' ? accounts : [])),
      write: vi.fn(async (path: string, body: Record<string, unknown>) => {
        if (path === '/personal') {
          staff = [{ id: 's-9', givenNames: String(body.givenNames), surnames: String(body.surnames), type: String(body.type), active: true, version: 1 }];
          return { id: 's-9', version: 1 };
        }
        const result = await invite();
        accounts = [{ id: 'u-9', email: String(body.email), name: String(body.displayName), roles: body.roles as string[], state: 'activo', staffId: 's-9', version: 1, invitationState: 'enviada' }];
        return result;
      }),
    };
    render(<PersonnelPage api={api as unknown as Api} profile={admin} version={0} />);
    return api;
  }
  async function fill() {
    await userEvent.click(await screen.findByRole('button', { name: /Agregar personal/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar personal' });
    await userEvent.type(within(dialog).getByLabelText('Nombres'), 'Ana');
    await userEvent.type(within(dialog).getByLabelText('Apellidos'), 'Pérez Ficticia');
    expect((within(dialog).getByLabelText('Darle acceso a la app') as HTMLInputElement).checked).toBe(true);
    await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'ana@example.test');
    expect((within(dialog).getByRole('checkbox', { name: /Medicina/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: /Agregar e invitar/ }));
    return dialog;
  }

  it('registra, invita con el vínculo a la ficha, avisa y resalta la fila', async () => {
    const api = mountDirectory(async () => ({ id: 'u-9' }));
    await fill();
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[0][0]).toBe('/personal');
    expect(api.write.mock.calls[1]).toEqual(['/usuarios/invitaciones', { email: 'ana@example.test', displayName: 'Ana Pérez Ficticia', roles: ['MED'], staffId: 's-9' }, 'POST']);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agregar personal' })).toBeNull());
    expect(await screen.findByText('Ana Pérez Ficticia registrada · Invitación enviada')).toBeTruthy();
    const row = (await screen.findAllByText('Ana Pérez Ficticia'))[0].closest('tr')!;
    expect(row.className).toMatch(/is-new/);
    expect(within(row).getByText('Invitación enviada')).toBeTruthy();
  });

  it('si la invitación falla, lo dice y reintenta solo la invitación sin registrar dos veces', async () => {
    let fail = true;
    const api = mountDirectory(async () => { if (fail) throw new ApiError('El servicio de correo no respondió.', 503); return { id: 'u-9' }; });
    const dialog = await fill();
    expect(await within(dialog).findByText(/Ana Pérez Ficticia quedó registrada, pero la invitación no se envió/)).toBeTruthy();
    expect(within(dialog).getByText('El servicio de correo no respondió.')).toBeTruthy();
    fail = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reintentar invitación' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Agregar personal' })).toBeNull());
    expect(api.write.mock.calls.filter(([p]) => p === '/personal')).toHaveLength(1);
    expect(api.write.mock.calls.filter(([p]) => p === '/usuarios/invitaciones')).toHaveLength(2);
    expect(await screen.findByText('Ana Pérez Ficticia registrada · Invitación enviada')).toBeTruthy();
  });

  it('cerrar tras el fallo conserva el registro, avisa y la invitación de la fila trae el correo', async () => {
    mountDirectory(async () => { throw new ApiError('El servicio de correo no respondió.', 503); });
    const dialog = await fill();
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Cerrar sin invitar' }));
    expect(await screen.findByText(/Ana Pérez Ficticia registrada · La invitación no se envió/)).toBeTruthy();
    await clickRowAction('Ana Pérez Ficticia', 'Dar acceso a la app');
    const invite = await screen.findByRole('dialog', { name: 'Dar acceso a la app' });
    expect((within(invite).getByLabelText('Correo electrónico') as HTMLInputElement).value).toBe('ana@example.test');
  });

  it('sin la casilla registra solo la ficha y lo avisa', async () => {
    const api = mountDirectory(async () => ({ id: 'u-9' }));
    await userEvent.click(await screen.findByRole('button', { name: /Agregar personal/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar personal' });
    await userEvent.type(within(dialog).getByLabelText('Nombres'), 'Ana');
    await userEvent.type(within(dialog).getByLabelText('Apellidos'), 'Pérez Ficticia');
    await userEvent.click(within(dialog).getByLabelText('Darle acceso a la app'));
    expect(within(dialog).queryByLabelText('Correo electrónico')).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: /Agregar persona/ }));
    expect(await screen.findByText('Ana Pérez Ficticia registrada')).toBeTruthy();
    expect(api.write).toHaveBeenCalledTimes(1);
  });

  it('con la casilla exige un correo válido antes de enviar', async () => {
    const api = mountDirectory(async () => ({ id: 'u-9' }));
    await userEvent.click(await screen.findByRole('button', { name: /Agregar personal/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar personal' });
    await userEvent.type(within(dialog).getByLabelText('Nombres'), 'Ana');
    await userEvent.type(within(dialog).getByLabelText('Apellidos'), 'Pérez Ficticia');
    await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'ana@');
    await userEvent.click(within(dialog).getByRole('button', { name: /Agregar e invitar/ }));
    expect(await within(dialog).findByText('Escribe un correo válido para la invitación.')).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });
});
