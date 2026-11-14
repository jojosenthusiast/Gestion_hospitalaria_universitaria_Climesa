import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type UserAccount } from '../lib/api';
import { UsersPage } from '../features/users';

// WEB-12: Usuarios (W05/W06) — flujo feliz, conflicto 409 y permisos.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'adm-1', user: { id: 'adm-1' }, email: 'adm@example.test', name: 'Administración Ficticia', roles: ['ADM'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null });
const cuentas: UserAccount[] = [
  { id: 'u-2', email: 'jop@example.test', name: 'Operaciones Ficticia', roles: ['JOP'], state: 'activo', version: 3 },
  { id: 'u-3', email: 'dpd@example.test', name: 'Delegado Ficticio', roles: ['DPD'], state: 'desactivado', version: 1 },
];

function montar(permissions: string[], write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = { request: vi.fn(async (path: string) => path === '/usuarios' ? cuentas : []), write: vi.fn(write) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<UsersPage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}
const usuarios = (api: { request: ReturnType<typeof vi.fn> }) => api.request.mock.calls.filter(([p]) => p === '/usuarios').length;

describe('Usuarios (W05, W06)', () => {
  it('filtra por nombre, correo o rol', async () => {
    montar(['usuarios.ver']);
    await screen.findByText('Operaciones Ficticia');
    await userEvent.type(screen.getByLabelText('Buscar cuenta'), 'dpd');
    expect(screen.queryByText('Operaciones Ficticia')).toBeNull();
    expect(screen.getByText('Delegado Ficticio')).toBeTruthy();
  });

  it('desactiva una cuenta con motivo y versión, y recarga la lista', async () => {
    const api = montar(['usuarios.ver', 'usuarios.desactivar']);
    await screen.findByText('Operaciones Ficticia');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar cuenta' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Fin del contrato de prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Confirmar cambio/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-2/estado', { state: 'desactivado', version: 3, reason: 'Fin del contrato de prueba' }, 'PATCH');
    await vi.waitFor(() => expect(usuarios(api)).toBe(2));
  });

  it('solo con usuarios.ver es de consulta: sin invitar, roles ni desactivar', async () => {
    montar(['usuarios.ver']);
    await screen.findByText('Operaciones Ficticia');
    expect(screen.queryByRole('button', { name: /Invitar persona|Roles|Desactivar|Reactivar/ })).toBeNull();
    expect(screen.getAllByText('Solo consulta').length).toBe(2);
  });

  it('un 409 de versión al desactivar ofrece cerrar y recargar', async () => {
    const api = montar(['usuarios.ver', 'usuarios.desactivar'], vi.fn(async () => { throw new ApiError('La cuenta cambió.', 409, 'version_conflicto', 4); }) as Api['write']);
    await screen.findByText('Operaciones Ficticia');
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar cuenta' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Fin del contrato de prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Confirmar cambio/ }));
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Cerrar y recargar/ }));
    await vi.waitFor(() => expect(usuarios(api)).toBe(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
