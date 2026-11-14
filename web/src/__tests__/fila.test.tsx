import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { QueuePage } from '../features/queue';

// WEB-12: Fila del día (W29) — flujo feliz, conflicto 409 y permisos.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const ticket = (state: string, numero = 7) => ({ id: `t-${numero}`, service: 'consulta_general', fecha: '2026-11-13', numero, patientName: 'Paciente Ficticio Uno', state, llamados: state === 'llamado' ? 1 : 0, version: 2, issuedAt: '2026-11-13T14:00:00Z' });

function montar(permissions: string[], rows = [ticket('en_espera')], write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = {
    request: vi.fn(async (path: string) => path.startsWith('/pacientes/selector') ? { items: [{ id: 'p-1', fullName: 'Paciente Ficticio Uno', record: '000101-1' }], hasMore: false } : rows),
    write: vi.fn(write),
  } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<QueuePage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}

describe('Fila del día (W29)', () => {
  it('llama al siguiente con la versión del número y recarga la fila', async () => {
    const api = montar(['fila.ver', 'fila.llamar']);
    await userEvent.click(await screen.findByRole('button', { name: /^Llamar/ }));
    expect(api.write).toHaveBeenCalledWith('/fila/t-7/llamar', { version: 2 }, 'POST');
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([p]) => String(p).startsWith('/fila')).length).toBe(2));
  });

  it('muestra los estados en español, no el código', async () => {
    montar(['fila.ver'], [ticket('en_espera', 1), ticket('no_se_presento', 2)]);
    expect(await screen.findByRole('region', { name: 'En espera' })).toBeTruthy();
    const terminados = screen.getByRole('region', { name: 'Terminados' });
    expect(within(terminados).getByText('No se presentó')).toBeTruthy();
  });

  it('sin fila.llamar ni fila.gestionar solo consulta: no hay acciones ni botón de emitir', async () => {
    montar(['fila.ver'], [ticket('llamado')]);
    await screen.findByText('Paciente Ficticio Uno');
    expect(screen.getByText(/Vista de solo lectura/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Llamar|Iniciar atención|No se presentó/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Emitir número/ })).toBeNull();
  });

  it('un 409 de versión ofrece recargar la fila', async () => {
    const api = montar(['fila.ver', 'fila.gestionar'], [ticket('llamado')], vi.fn(async () => { throw new ApiError('El número cambió.', 409, 'version_conflicto', 3); }) as Api['write']);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar atención' }));
    await userEvent.click(await screen.findByRole('button', { name: /Recargar la fila/ }));
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([p]) => String(p).startsWith('/fila')).length).toBe(2));
  });

  it('emite un número para el paciente elegido', async () => {
    const api = montar(['fila.ver', 'fila.emitir', 'fila.gestionar']);
    await userEvent.click(await screen.findByRole('button', { name: /Emitir número/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Emitir número de fila' });
    await userEvent.type(within(dialogo).getByRole('combobox', { name: 'Paciente' }), 'pac');
    await userEvent.click(await within(dialogo).findByRole('option', { name: /Paciente Ficticio Uno/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: /Emitir|Guardar/ }));
    expect(api.write).toHaveBeenCalledWith('/fila', { service: 'consulta_general', patientId: 'p-1' }, 'POST');
  });

  it('filtra por servicio con chips y cuenta cada estado en el resumen', async () => {
    montar(['fila.ver'], [{ ...ticket('en_espera', 1) }, { ...ticket('llamado', 2), service: 'laboratorio' }, { ...ticket('atendido', 3) }]);
    await screen.findByRole('region', { name: 'En espera' });
    const resumen = screen.getByLabelText('Resumen de la fila');
    expect(within(resumen).getAllByText('1').length).toBeGreaterThanOrEqual(3);
    await userEvent.click(screen.getByRole('button', { name: /^Laboratorio/ }));
    expect(within(screen.getByRole('region', { name: 'Llamados' })).getByText('2')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'En espera' })).getByText('Nadie por ahora.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(within(screen.getByRole('region', { name: 'En espera' })).queryByText('Nadie por ahora.')).toBeNull();
  });
});
