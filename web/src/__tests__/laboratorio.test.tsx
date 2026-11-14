import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { LaboratoryPage } from '../features/laboratory';

// WEB-12: Laboratorio (W20/W21) — flujo feliz, conflicto 409, permisos y sin UUID visible (WEB-11).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const ORDER = '0a1b2c3d-1111-2222-3333-444455556666';
const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'lab@example.test', name: 'Laboratorio Ficticio', roles: ['LAB'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const orden = (state: string) => ({ id: ORDER, patientName: 'Paciente Ficticio Dos', priority: 'urgente', state, version: 4, createdAt: '2026-11-13T15:00:00Z', items: [{ id: 'i-1', code: 'HB', name: 'Hemoglobina', result: null }] });

function montar(permissions: string[], state = 'en_proceso', write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = { request: vi.fn(async () => [orden(state)]), write: vi.fn(write) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<LaboratoryPage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}

describe('Laboratorio (W20, W21)', () => {
  it('lista la orden con prioridad y fecha, sin mostrar su identificador interno', async () => {
    montar(['laboratorio.ver_cola']);
    expect(await screen.findByText('Paciente Ficticio Dos')).toBeTruthy();
    expect(screen.getByText('Urgente')).toBeTruthy();
    expect(screen.queryByText(ORDER)).toBeNull();
  });

  it('completa una orden en proceso con su versión y recarga la cola', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.procesar']);
    await userEvent.click(await screen.findByRole('button', { name: 'Completar' }));
    expect(api.write).toHaveBeenCalledWith(`/laboratorio/ordenes/${ORDER}/completar`, { version: 4 }, 'POST');
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it('sin laboratorio.procesar no ofrece tomar muestra ni completar', async () => {
    montar(['laboratorio.ver_cola'], 'pendiente');
    await screen.findByText('Paciente Ficticio Dos');
    expect(screen.queryByRole('button', { name: /Tomar muestra|Completar/ })).toBeNull();
  });

  it('un 409 de versión al completar ofrece recargar la orden', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.procesar'], 'en_proceso', vi.fn(async () => { throw new ApiError('La orden cambió.', 409, 'version_conflicto', 5); }) as Api['write']);
    await userEvent.click(await screen.findByRole('button', { name: 'Gestionar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Completar' }));
    await userEvent.click(await screen.findByRole('button', { name: /Recargar la orden/ }));
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });
});
