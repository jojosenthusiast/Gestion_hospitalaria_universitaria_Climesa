import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { WorkInbox } from '../features/inbox';

// W04 «Inicio de trabajo» (FR-113-04): pendientes por permiso, con contadores de los listados existentes.
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Cuenta Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null });
const respuestas: Record<string, unknown> = {
  '/cuentas/vinculaciones': [{ id: 'v-1' }, { id: 'v-2' }],
  '/citas': [{ id: 'c-1', state: 'solicitada' }, { id: 'c-2', state: 'confirmada' }],
  '/ambulancia': { unit: { id: 'a', plate: 'P-0', state: 'disponible', version: 1 }, activeService: null, paramedicOnDuty: true, pendingRequests: [{ id: 'r-1' }] },
  '/admisiones': [{ state: 'pendiente_cama' }, { state: 'hospitalizado' }, { state: 'pendiente_cama' }],
  '/laboratorio/ordenes': [{ state: 'pendiente' }, { state: 'completado' }],
  '/accesos-excepcionales?estado=pendiente': [{ id: 'x-1' }],
};
const montar = (permissions: string[]) => {
  const api = { request: vi.fn(async (path: string) => respuestas[path]), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
  render(<WorkInbox api={api} profile={perfil(permissions)} version={0} />);
  return api;
};
const contador = async (label: string) => (await screen.findByText(label)).closest('a')!;

describe('bandeja de inicio de trabajo (W04)', () => {
  it('Recepción ve vinculaciones, solicitudes de cita y ambulancia, y admisiones sin cama', async () => {
    montar(['cuentas.verificar', 'citas.agendar', 'ambulancia.ver_estado', 'admision.ver']);
    expect((await contador('Vinculaciones por verificar')).textContent).toMatch(/^2/);
    expect((await contador('Solicitudes de cita')).textContent).toMatch(/^1/);
    expect((await contador('Solicitudes de ambulancia por confirmar')).getAttribute('href')).toBe('#/ambulancia');
    await vi.waitFor(async () => expect((await contador('Admisiones sin cama')).textContent).toMatch(/^2/));
    expect(screen.queryByText(/laboratorio/)).toBeNull();
  });

  it('Laboratorio ve su cola y Protección de datos los accesos por aprobar', async () => {
    montar(['laboratorio.ver_cola', 'privacidad.aprobar_acceso']);
    await vi.waitFor(async () => expect((await contador('Órdenes de laboratorio en cola')).textContent).toMatch(/^1/));
    expect((await contador('Accesos excepcionales por aprobar')).textContent).toMatch(/^1/);
  });

  it('sin permisos de trabajo no muestra la bandeja ni pide datos', () => {
    const api = montar(['sesion.perfil']);
    expect(screen.queryByText('Pendientes de tu trabajo')).toBeNull();
    expect(api.request).not.toHaveBeenCalled();
  });
});
