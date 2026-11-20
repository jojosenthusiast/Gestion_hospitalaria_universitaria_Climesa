import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { QueuePage } from '../features/queue';
import { avatarInitial } from '../lib/identity';
import { HoldCountdown, secondsLeft } from '../components/countdown';

// Audit 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T1): Fila del día for Recepción.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
type Row = Record<string, unknown>;
const ticket = (over: Row = {}): Row => ({ id: 't-7', service: 'consulta_general', area: 'CON', fecha: '2026-11-17', numero: 7, patientName: 'Paciente Ficticio Uno', state: 'en_espera', llamados: 0, version: 2, issuedAt: '2026-11-17T15:00:00Z', priority: 'rutina', appointmentAt: null, walkIn: true, maxCalls: 3, callsForAbsence: 3, allowedActions: [], blockedActions: [], undoActions: [], ...over });

function montar(permissions: string[], rows: Row[], write: (path: string) => unknown = async () => ({})) {
  const api = {
    request: vi.fn(async (path: string) => path.startsWith('/fila/siguiente') ? { service: 'consulta_general', area: 'CON', rule: '', proposal: null } : path.startsWith('/espacios') ? [] : rows),
    write: vi.fn(async (path: string) => write(path)),
  } as unknown as Api & { write: ReturnType<typeof vi.fn> };
  render(<QueuePage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}

describe('Fila del día · auditoría 2026-11-20', () => {
  it('D38: a voided number reads «Anulado», not «Cerrado sin atender»', async () => {
    montar(['fila.ver', 'fila.llamar'], [ticket({ state: 'cerrado' })]);
    const done = await screen.findByRole('region', { name: 'Terminados' });
    expect(within(done).getByText('Anulado')).toBeTruthy();
    expect(within(done).queryByText('Cerrado sin atender')).toBeNull();
  });

  it('D41: a number only called reads «Llamado» on top, not «En atención»', async () => {
    montar(['fila.ver', 'fila.llamar'], [ticket({ state: 'llamado', llamados: 1 })]);
    const summary = await screen.findByRole('region', { name: 'Resumen de atención' });
    expect(within(summary).getByText('Llamado')).toBeTruthy();
    expect(within(summary).queryByText('En atención')).toBeNull();
  });

  it('D43: after the last call «Llamar de nuevo» stays on the card, disabled with its reason', async () => {
    montar(['fila.ver', 'fila.llamar'], [ticket({ state: 'llamado', llamados: 3, allowedActions: ['atender'] })]);
    const card = within(await screen.findByRole('region', { name: 'Llamados' })).getByRole('listitem');
    const again = within(card).getByRole('button', { name: /Llamar de nuevo/ });
    expect(again.getAttribute('aria-disabled')).toBe('true');
    expect(within(card).getByText('Ya se llamó 3 veces de 3.')).toBeTruthy();
  });

  it('D42/D31: «Deshacer llamado» is on a called card after a reload and says where the number went', async () => {
    const api = montar(['fila.ver', 'fila.llamar'], [ticket({ state: 'llamado', llamados: 1, version: 4, allowedActions: ['atender'], undoActions: ['deshacer_llamado'] })],
      async () => ({ id: 't-7', version: 5, state: 'en_espera', llamados: 0 }));
    await userEvent.click(await screen.findByRole('button', { name: /Deshacer llamado/ }));
    expect(api.write).toHaveBeenCalledWith('/fila/t-7/deshacer-llamado', { version: 4 }, 'POST');
    expect(await screen.findByText('Se deshizo el llamado: CON 7 volvió a En espera.')).toBeTruthy();
  });

  it('D30: voiding from the card menu asks first and sends nothing on «Volver»', async () => {
    const api = montar(['fila.ver', 'fila.emitir'], [ticket({ voidableUntil: '2999-01-01T00:00:00Z' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Más acciones de CON 7' }));
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Anular número (emitido por error)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anular número' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Volver' }));
    expect(api.write).not.toHaveBeenCalled();
  });
});

describe('pieces shared by every role', () => {
  it('D5: the avatar letter skips the «[DEMO]» mark', () => {
    expect(avatarInitial('[DEMO] Ana Prueba')).toBe('A');
    expect(avatarInitial('rec@example.test')).toBe('R');
  });

  it('D45: a held action shows the seconds left', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
      const deadline = Date.now() + 15_000;
      expect(secondsLeft(deadline)).toBe(15);
      render(<HoldCountdown deadline={deadline} what="No se presentó" />);
      expect(screen.getByText('15')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(1000); });
      expect(screen.getByText('14')).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });
});
