import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { RemoteState, WriteError, type Remote } from '../features/common';
import { IDLE_LIMIT_MS, IDLE_WARNING_MS, SessionExpiryWarning, useIdleSession } from '../features/session';
import { HospitalShell } from '../features/shell';

// WEB-04: estados comunes del diseño 04 (sesión por vencer, en vivo, conflicto, sin permiso, error).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ''; });

describe('sesión por vencer', () => {
  it('avisa antes del cierre, "Seguir trabajando" reinicia la cuenta y sin actividad se cierra a los 15 minutos', async () => {
    vi.useFakeTimers();
    const onExpired = vi.fn();
    const { result } = renderHook(() => useIdleSession(onExpired));
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_LIMIT_MS - IDLE_WARNING_MS + 15_000); });
    expect(result.current.remaining).not.toBeNull();
    expect(result.current.remaining!).toBeLessThanOrEqual(IDLE_WARNING_MS);
    act(() => result.current.keepAlive());
    expect(result.current.remaining).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_LIMIT_MS - IDLE_WARNING_MS - 30_000); });
    expect(result.current.remaining).toBeNull();
    expect(onExpired).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_WARNING_MS + 60_000); });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('la actividad de la persona también reinicia la cuenta', async () => {
    vi.useFakeTimers();
    const onExpired = vi.fn();
    renderHook(() => useIdleSession(onExpired));
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_LIMIT_MS - 60_000); });
    act(() => { window.dispatchEvent(new Event('keydown')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(IDLE_LIMIT_MS - 60_000); });
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('el aviso muestra la cuenta regresiva y ofrece seguir o cerrar sesión', async () => {
    const onContinue = vi.fn(), onLogout = vi.fn();
    render(<SessionExpiryWarning remaining={58_000} onContinue={onContinue} onLogout={onLogout} />);
    expect(screen.getByRole('dialog', { name: 'Tu sesión se cierra en 0:58' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Seguir trabajando' }));
    expect(onContinue).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }));
    expect(onLogout).toHaveBeenCalled();
  });
});

describe('en vivo, conflicto y carga', () => {
  const perfil: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'jop@example.test', name: 'Cuenta', roles: ['JOP'], platforms: ['web'], permissions: [{ code: 'personal.ver', context: 'global' }], channels: [], patientId: null, staffId: null };
  const api = { request: vi.fn(async () => ({ lastUpdate: '2026-11-13T16:40:00Z' })), write: vi.fn() } as unknown as Api;

  it('con la conexión al día no muestra el indicador "En vivo" y conserva el reloj del hospital', () => {
    render(<HospitalShell api={api} profile={perfil} connection="live" onLogout={() => undefined} />);
    expect(screen.queryByText(/En vivo/)).toBeNull();
    expect(screen.getByLabelText(/Hora actual/)).toBeTruthy();
  });

  it('sin conexión no dice "En vivo"', () => {
    render(<HospitalShell api={api} profile={perfil} connection="offline" onLogout={() => undefined} />);
    expect(screen.queryByText(/En vivo/)).toBeNull();
  });

  it('un 409 de versión ofrece "Cerrar y recargar" cuando el módulo sabe recargar', async () => {
    const onReload = vi.fn();
    render(<WriteError error={new ApiError('El registro cambió.', 409, 'version_conflicto', 4)} onReload={onReload} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar y recargar' }));
    expect(onReload).toHaveBeenCalled();
  });

  it('un 409 que no es de versión no ofrece recargar', () => {
    render(<WriteError error={new ApiError('Ese DUI ya existe.', 409, 'conflicto')} onReload={() => undefined} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Ese DUI ya existe.')).toBeTruthy();
  });

  it('distingue sin permiso de un error de carga', () => {
    const estado = (error: ApiError): Remote<unknown> => ({ data: null, loading: false, error, refresh: () => undefined });
    const { rerender } = render(<RemoteState state={estado(new ApiError('Prohibido', 403))}>{() => null}</RemoteState>);
    expect(screen.getByText('No tienes acceso a esta información')).toBeTruthy();
    expect(screen.getByText(/pide a un administrador que revise los permisos/)).toBeTruthy();
    rerender(<RemoteState state={estado(new ApiError('El servicio no está disponible.', 500))}>{() => null}</RemoteState>);
    expect(screen.getByText('No pudimos cargar esta información')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });
});
