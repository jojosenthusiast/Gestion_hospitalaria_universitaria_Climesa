import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api, type Bed } from '../lib/api';
import { BedsPage } from '../features/spaces';

afterEach(cleanup);

const profile = (permissions: string[]): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'staff@example.test', name: 'Personal de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 'staff-1',
});
const bed = (id: string, code: string, state: string, options: Partial<Bed> = {}): Bed => ({
  id, code, roomId: 'room-1', room: 'HAB-201', category: 'semiprivada', level: 2, state, path: `HAB-201 > ${code}`,
  version: 7, cleaningPending: false, cleaningCompleted: false, cleanedByCurrentUser: false, ...options,
} as Bed);
function mount(beds: Bed[], permissions: string[]) {
  const api = {
    request: vi.fn(async () => beds),
    write: vi.fn(async () => ({ ok: true })),
  };
  render(<BedsPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}

describe('acciones de camas', () => {
  it('bloquea una cama libre con su versión y motivo', async () => {
    const api = mount([bed('bed-1', 'HAB-201-A', 'libre')], ['camas.ver_tablero', 'camas.bloquear']);
    await userEvent.click(await screen.findByRole('button', { name: 'Bloquear cama HAB-201-A' }));
    const form = await screen.findByRole('form', { name: 'Bloquear HAB-201-A' });
    await userEvent.type(within(form).getByLabelText('Motivo'), 'Mantenimiento preventivo');
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar bloqueo' }));
    expect(api.write).toHaveBeenCalledWith('/camas/bed-1/bloquear', { version: 7, motivo: 'Mantenimiento preventivo' }, 'POST');
  });

  it('muestra solo las acciones de limpieza permitidas por estado', async () => {
    mount([
      bed('bed-2', 'HAB-201-B', 'ocupada'),
      bed('bed-3', 'HAB-201-C', 'limpieza', { cleaningPending: true }),
      bed('bed-4', 'HAB-201-D', 'limpieza', { cleaningPending: true, cleaningCompleted: true, cleanedByCurrentUser: false }),
      bed('bed-5', 'HAB-201-E', 'limpieza', { cleaningPending: true, cleaningCompleted: true, cleanedByCurrentUser: true }),
    ], ['camas.ver_tablero', 'camas.registrar_limpieza', 'camas.verificar_limpieza']);
    expect(await screen.findByRole('button', { name: 'Solicitar limpieza cama HAB-201-B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Completar limpieza cama HAB-201-C' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verificar limpieza cama HAB-201-D' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Verificar limpieza cama HAB-201-E' })).toBeNull();
  });

  it('envía versión y motivo para solicitar, completar y verificar la limpieza', async () => {
    const permissions = ['camas.ver_tablero', 'camas.registrar_limpieza', 'camas.verificar_limpieza'];
    const requestedApi = mount([bed('bed-7', 'HAB-201-G', 'ocupada')], permissions);
    await userEvent.click(await screen.findByRole('button', { name: 'Solicitar limpieza cama HAB-201-G' }));
    let form = await screen.findByRole('form', { name: 'Solicitar limpieza HAB-201-G' });
    await userEvent.type(within(form).getByLabelText('Motivo'), 'Salida programada de hospitalización');
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar solicitud' }));
    expect(requestedApi.write).toHaveBeenCalledWith('/camas/bed-7/limpieza', { version: 7, reason: 'Salida programada de hospitalización' }, 'POST');

    cleanup();
    const completedApi = mount([bed('bed-8', 'HAB-201-H', 'limpieza', { cleaningPending: true })], permissions);
    await userEvent.click(await screen.findByRole('button', { name: 'Completar limpieza cama HAB-201-H' }));
    form = await screen.findByRole('form', { name: 'Completar limpieza HAB-201-H' });
    await userEvent.type(within(form).getByLabelText('Motivo'), 'Superficies desinfectadas');
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar limpieza' }));
    expect(completedApi.write).toHaveBeenCalledWith('/camas/bed-8/limpieza/completar', { version: 7, reason: 'Superficies desinfectadas' }, 'POST');

    cleanup();
    const verifiedApi = mount([bed('bed-9', 'HAB-201-I', 'limpieza', { cleaningPending: true, cleaningCompleted: true })], permissions);
    await userEvent.click(await screen.findByRole('button', { name: 'Verificar limpieza cama HAB-201-I' }));
    form = await screen.findByRole('form', { name: 'Verificar limpieza HAB-201-I' });
    await userEvent.type(within(form).getByLabelText('Motivo'), 'Verificación independiente aprobada');
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar verificación' }));
    expect(verifiedApi.write).toHaveBeenCalledWith('/camas/bed-9/limpieza/verificar', { version: 7, reason: 'Verificación independiente aprobada' }, 'POST');
  });

  it('no ofrece mutaciones sin el permiso correspondiente', async () => {
    mount([bed('bed-6', 'HAB-201-F', 'libre')], ['camas.ver_tablero']);
    await screen.findByText('HAB-201-F');
    expect(screen.queryByRole('button', { name: /Bloquear cama/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Solicitar limpieza cama/ })).toBeNull();
  });
});
