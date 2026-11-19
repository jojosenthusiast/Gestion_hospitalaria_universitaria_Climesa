import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type UserAccount } from '../lib/api';
import { clickRowAction, rowActionLabels } from './row-actions';
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
    await clickRowAction('Operaciones Ficticia', 'Desactivar');
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar a Operaciones Ficticia' });
    expect(within(dialogo).getByText(/Desactivar no borra a nadie/)).toBeTruthy();
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Fin del contrato de prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /^Desactivar$/ }));
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
    expect(screen.getByText('Solo lectura')).toBeTruthy();
  });

  it('solo con usuarios.ver es de consulta: sin invitar, roles ni desactivar', async () => {
    montar(['usuarios.ver']);
    await screen.findByText('Operaciones Ficticia');
    expect(screen.queryByRole('button', { name: /Invitar persona|Roles|Desactivar|Reactivar/ })).toBeNull();
    expect(screen.getAllByText('Solo consulta').length).toBe(1);
  });

  // S4/S5 (owner obs. 4-5): one create action in the filter bar; no header button, no separate «Invitar persona» link.
  it('con registrar e invitar hay una sola acción de alta, en la barra de filtros, con el acceso a la app opcional', async () => {
    montar(['usuarios.ver', 'usuarios.invitar', 'personal.ver', 'personal.gestionar']);
    const encabezado = (await screen.findByRole('heading', { level: 1, name: 'Personal' })).closest('header')!;
    expect(within(encabezado).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /Agregar personal|Invitar persona|Registrar personal/ })).toHaveLength(1);
    expect(screen.queryByText(/Alguien sin ficha/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Agregar personal' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar personal' });
    expect(within(dialogo).getByText('Acceso a la app · opcional')).toBeTruthy();
    expect(within(dialogo).getByLabelText('Darle acceso a la app')).toBeTruthy();
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
    await clickRowAction('Operaciones Ficticia', 'Desactivar');
    const dialogo = await screen.findByRole('dialog', { name: 'Desactivar a Operaciones Ficticia' });
    expect(within(dialogo).getByText(/Desactivar no borra a nadie/)).toBeTruthy();
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Fin del contrato de prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /^Desactivar$/ }));
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
    await clickRowAction('Persona Invitada', 'Editar');
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Editar cuenta de acceso' })).getByRole('button', { name: 'Reenviar invitación' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Reenviar invitación' });
    await userEvent.click(within(dialogo).getByRole('button', { name: /Reenviar invitación/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-9/invitacion/reenvio', {}, 'POST');
  });

  it('cancelar una invitación pide motivo', async () => {
    const api = montarCon([pendiente]);
    await screen.findByText('Persona Invitada');
    await clickRowAction('Persona Invitada', 'Editar');
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Editar cuenta de acceso' })).getByRole('button', { name: 'Cancelar invitación' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar invitación' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), 'El correo de la invitación estaba mal');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Cancelar invitación/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-9/invitacion/cancelacion', { reason: 'El correo de la invitación estaba mal' }, 'POST');
  });

  it('no ofrece roles ni desactivar cuando el servidor no lo permite (jerarquía de administración)', async () => {
    montarCon([principal]);
    await screen.findByText('Administración Principal');
    expect(await rowActionLabels('Administración Principal')).toEqual([]);
    expect(screen.getByText('Solo consulta')).toBeTruthy();
  });

  it('la invitación no ofrece el rol de paciente: el paciente se registra en la app', async () => {
    montarCon([]);
    await userEvent.click(await screen.findByRole('button', { name: /Invitar persona/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Invitar persona' });
    expect(within(dialogo).queryByText('PAC')).toBeNull();
    expect(within(dialogo).getByRole('button', { name: /Enviar invitación/ }).hasAttribute('disabled')).toBe(true);
  });
});

describe('Personal · cuentas sin ficha vinculada (Inicio de Administración)', () => {
  const sinFicha: UserAccount = { id: 'u-5', email: 'rec@example.test', name: 'Recepción Sin Ficha', roles: ['REC'], state: 'activo', version: 2, allowedActions: ['roles', 'desactivar'] };
  const vinculada: UserAccount = { id: 'u-6', email: 'enf@example.test', name: 'Enfermería Vinculada', roles: ['ENF'], state: 'activo', version: 1, staffId: 's-1', allowedActions: ['roles', 'desactivar'] };
  const ficha = { id: 's-1', givenNames: 'Enfermería', surnames: 'Vinculada', type: 'enfermero', active: true, version: 1, registrations: [] };
  const libre = { id: 's-2', givenNames: 'Rosa', surnames: 'Sin Cuenta', type: 'recepcionista', active: true, version: 1, registrations: [] };
  function montarSinFicha() {
    const api = { request: vi.fn(async (path: string) => path === '/usuarios' ? [...cuentas, sinFicha, vinculada] : path === '/personal' ? [ficha, libre] : []), write: vi.fn(async () => ({})) } as unknown as Api & { write: ReturnType<typeof vi.fn> };
    render(<PersonnelPage api={api} profile={perfil(['usuarios.ver', 'usuarios.asignar_roles', 'usuarios.desactivar', 'personal.ver'])} version={0} />);
    return api;
  }

  it('?cuenta=sin_ficha deja solo las cuentas de turno sin ficha (no las de Jefatura ni las vinculadas)', async () => {
    location.hash = '#/personal?cuenta=sin_ficha';
    montarSinFicha();
    expect(await screen.findByText('Recepción Sin Ficha')).toBeTruthy();
    expect(screen.queryByText('Operaciones Ficticia')).toBeNull();
    expect(screen.queryByText('Enfermería Vinculada')).toBeNull();
    expect(screen.queryByText('Rosa Sin Cuenta')).toBeNull();
    expect(screen.getByRole('button', { name: /Cuenta sin ficha vinculada/ })).toBeTruthy();
  });

  it('las acciones de la fila son iconos CRUD (ver, editar, desactivar); «Vincular con su ficha» abre la vinculación', async () => {
    const api = montarSinFicha();
    await screen.findByText('Recepción Sin Ficha');
    expect(await rowActionLabels('Enfermería Vinculada')).toEqual(['Ver ficha', 'Editar', 'Desactivar']);
    expect(await rowActionLabels('Recepción Sin Ficha')).toEqual(['Vincular con su ficha', 'Desactivar']);
    await clickRowAction('Recepción Sin Ficha', 'Vincular con su ficha');
    const dialogo = await screen.findByRole('dialog', { name: 'Vincular con su ficha' });
    await userEvent.selectOptions(within(dialogo).getByLabelText('Persona del directorio'), 's-2');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Guardar/ }));
    expect(api.write).toHaveBeenCalledWith('/usuarios/u-5/roles', { roles: ['REC'], staffId: 's-2', version: 2, reason: 'Vincular la cuenta con su ficha de personal' }, 'PATCH');
  });

  it('?vincular=<cuenta> desde Inicio abre la vinculación de esa cuenta y limpia el parámetro', async () => {
    location.hash = '#/personal?cuenta=sin_ficha&vincular=u-5';
    montarSinFicha();
    const dialogo = await screen.findByRole('dialog', { name: 'Vincular con su ficha' });
    expect(within(dialogo).getByText('Recepción Sin Ficha')).toBeTruthy();
    expect(location.hash).toBe('#/personal?cuenta=sin_ficha');
  });

  it('los roles de cada cuenta se ven como etiquetas de rol', async () => {
    montarSinFicha();
    const row = (await screen.findByText('Recepción Sin Ficha')).closest('tr')!;
    expect(row.querySelector('.role-tags .identity-chip')).toBeTruthy();
  });
});
