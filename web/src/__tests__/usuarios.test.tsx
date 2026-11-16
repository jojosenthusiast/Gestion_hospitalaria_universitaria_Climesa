import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type UserAccount } from '../lib/api';
import { PersonnelPage } from '../features/personnel';

// WEB-12: Usuarios (W05/W06) — flujo feliz, conflicto 409 y permisos.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
// Los filtros viven en la dirección: cada prueba empieza sin filtros.
afterEach(() => { cleanup(); location.hash = ''; });

const perfil = (permissions: string[]): AccessProfile => ({ id: 'adm-1', user: { id: 'adm-1' }, email: 'adm@example.test', name: 'Administración Ficticia', roles: ['ADM'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null });
const cuentas: UserAccount[] = [
  { id: 'u-2', email: 'jop@example.test', name: 'Operaciones Ficticia', roles: ['JOP'], state: 'activo', version: 3 },
  { id: 'u-3', email: 'dpd@example.test', name: 'Delegado Ficticio', roles: ['DPD'], state: 'desactivado', version: 1 },
];

function montar(permissions: string[], write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = { request: vi.fn(async (path: string) => path === '/usuarios' ? cuentas : []), write: vi.fn(write) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<PersonnelPage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}
const usuarios = (api: { request: ReturnType<typeof vi.fn> }) => api.request.mock.calls.filter(([p]) => p === '/usuarios').length;

describe('Personal · cuentas de acceso (W05, W06)', () => {
  it('filtra por nombre, correo o rol', async () => {
    montar(['usuarios.ver']);
    await screen.findByText('Operaciones Ficticia');
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'todos');
    await userEvent.type(screen.getByLabelText('Buscar en el directorio'), 'dpd');
    expect(screen.queryByText('Operaciones Ficticia')).toBeNull();
    expect(screen.getByText('Delegado Ficticio')).toBeTruthy();
  });

  it('desactiva una cuenta con motivo y versión, y recarga la lista', async () => {
    const api = montar(['usuarios.ver', 'usuarios.desactivar']);
    await screen.findByText('Operaciones Ficticia');
    await userEvent.click(screen.getByRole('button', { name: /Desactivar cuenta de Operaciones Ficticia/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar cuenta' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Fin del contrato de prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Confirmar cambio/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-2/estado', { state: 'desactivado', version: 3, reason: 'Fin del contrato de prueba' }, 'PATCH');
    await vi.waitFor(() => expect(usuarios(api)).toBe(2));
  });

  it('Protección de datos (solo usuarios.ver) ve una lista de cuentas en solo lectura, sin columnas vacías de personal (obs. 17)', async () => {
    montar(['usuarios.ver']);
    await screen.findByText('Operaciones Ficticia');
    expect(screen.getByText('Protección de datos / Cuentas')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Roles' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Área' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Estado' })).toBeNull();
    expect(screen.queryByText('Solo cuenta')).toBeNull();
    expect(screen.getAllByText('Solo consulta').length).toBeGreaterThan(0);
  });

  it('solo con usuarios.ver es de consulta: sin invitar, roles ni desactivar', async () => {
    montar(['usuarios.ver']);
    await screen.findByText('Operaciones Ficticia');
    expect(screen.queryByRole('button', { name: /Invitar persona|Roles|Desactivar|Reactivar/ })).toBeNull();
    expect(screen.getAllByText('Solo consulta').length).toBe(1);
  });

  // S13 (T10w, W1): with both permissions the header keeps one action; inviting someone without a record is a quiet link.
  it('con registrar e invitar, el encabezado tiene una sola acción y la invitación sigue a mano', async () => {
    montar(['usuarios.ver', 'usuarios.invitar', 'personal.ver', 'personal.gestionar']);
    const encabezado = (await screen.findByRole('heading', { level: 1, name: 'Personal' })).closest('header')!;
    expect(within(encabezado).getAllByRole('button').map(b => b.textContent)).toEqual(['Registrar personal']);
    expect(document.querySelectorAll('.primary-button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Invitar persona' }));
    expect(await screen.findByRole('dialog', { name: 'Invitar persona' })).toBeTruthy();
  });

  it('?accion=invitar abre la invitación y limpia el parámetro', async () => {
    location.hash = '#/personal?accion=invitar';
    montar(['usuarios.ver', 'usuarios.invitar']);
    expect(await screen.findByRole('dialog', { name: 'Invitar persona' })).toBeTruthy();
    expect(location.hash).toBe('#/personal');
    location.hash = '';
  });

  it('un 409 de versión al desactivar ofrece cerrar y recargar', async () => {
    const api = montar(['usuarios.ver', 'usuarios.desactivar'], vi.fn(async () => { throw new ApiError('La cuenta cambió.', 409, 'version_conflicto', 4); }) as Api['write']);
    await screen.findByText('Operaciones Ficticia');
    await userEvent.click(screen.getByRole('button', { name: /Desactivar cuenta de Operaciones Ficticia/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar cuenta' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Fin del contrato de prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Confirmar cambio/ }));
    await userEvent.click(await within(dialogo).findByRole('button', { name: /Cerrar y recargar/ }));
    await vi.waitFor(() => expect(usuarios(api)).toBe(2));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Personal · invitaciones y acciones según el servidor (MA-CTA-01 a 03)', () => {
  const pendiente: UserAccount = { id: 'u-9', email: 'nueva@example.test', name: 'Persona Invitada', roles: ['JOP'], state: 'activo', version: 1, invitationState: 'enviada', allowedActions: ['roles', 'desactivar', 'reenviar_invitacion', 'cancelar_invitacion'] };
  const principal: UserAccount = { id: 'u-1', email: 'principal@example.test', name: 'Administración Principal', roles: ['ADM'], state: 'activo', version: 2, invitationState: null, allowedActions: [] };
  function montarCon(lista: UserAccount[], write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
    const api = { request: vi.fn(async (path: string) => path === '/usuarios' ? lista : []), write: vi.fn(write) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
    render(<PersonnelPage api={api} profile={perfil(['usuarios.ver', 'usuarios.invitar', 'usuarios.asignar_roles', 'usuarios.desactivar'])} version={0} />);
    return api;
  }

  it('una invitación sin aceptar se ve como "Invitación enviada", no como activa, y se puede reenviar', async () => {
    const api = montarCon([pendiente]);
    await screen.findByText('Persona Invitada');
    expect(screen.getByText('Invitación enviada')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Reenviar invitación a Persona Invitada/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reenviar invitación' });
    await userEvent.click(within(dialogo).getByRole('button', { name: /Reenviar invitación/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-9/invitacion/reenvio', {}, 'POST');
  });

  it('cancelar una invitación pide motivo', async () => {
    const api = montarCon([pendiente]);
    await screen.findByText('Persona Invitada');
    await userEvent.click(screen.getByRole('button', { name: /Cancelar invitación de Persona Invitada/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar invitación' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), 'El correo de la invitación estaba mal');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Cancelar invitación/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-9/invitacion/cancelacion', { reason: 'El correo de la invitación estaba mal' }, 'POST');
  });

  it('no ofrece roles ni desactivar cuando el servidor no lo permite (jerarquía de administración)', async () => {
    montarCon([principal]);
    await screen.findByText('Administración Principal');
    expect(screen.queryByRole('button', { name: /Roles de Administración Principal/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desactivar cuenta de Administración Principal/ })).toBeNull();
  });

  it('la invitación no ofrece el rol de paciente: el paciente se registra en la app', async () => {
    montarCon([]);
    await userEvent.click(await screen.findByRole('button', { name: /Invitar persona/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Invitar persona' });
    expect(within(dialogo).queryByText('PAC')).toBeNull();
    expect(within(dialogo).getByRole('button', { name: /Enviar invitación/ }).hasAttribute('disabled')).toBe(true);
  });
});
