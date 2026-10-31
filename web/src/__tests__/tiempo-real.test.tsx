import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Bed } from '../lib/api';
import { BedsPage } from '../features/spaces';

// Supabase simulado: cada canal guarda su función de estado y su manejador de mensajes
// para que la prueba pueda emitir eventos y caídas sin tocar la red.
type Canal = { name: string; estado: (s: string) => void; mensaje: (m: { payload?: { entidad?: string } }) => void };
const realtime = vi.hoisted(() => ({
  canales: [] as unknown[],
  setAuth: vi.fn(),
  removeChannel: vi.fn(),
  channel: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  supabase: { realtime: { setAuth: realtime.setAuth }, channel: realtime.channel, removeChannel: realtime.removeChannel },
}));

import { INVALIDATION_BATCH_MS, useLive } from '../lib/live';

const perfil = (channels: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'prueba@example.test', name: 'Cuenta de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: [{ code: 'camas.ver_tablero', context: 'global' }], channels, patientId: null, staffId: 'u-1',
});
const cama = (id: string, code: string): Bed => ({
  id, code, roomId: 'room-1', room: 'HAB-201', category: 'semiprivada', level: 2, state: 'libre', path: `HAB-201 > ${code}`,
  version: 1, cleaningPending: false, cleaningCompleted: false, cleanedByCurrentUser: false,
} as Bed);

const canales = () => realtime.canales as Canal[];
const consultas = (api: { request: ReturnType<typeof vi.fn> }, prefijo: string) =>
  api.request.mock.calls.filter(([ruta]) => String(ruta).startsWith(prefijo)).length;

function crearApi(eventos: () => Promise<unknown> = async () => ({ cursor: '7', events: [] })) {
  return {
    request: vi.fn(async (ruta: string) => String(ruta).startsWith('/eventos') ? eventos() : [cama('bed-1', 'HAB-201-A')]),
    write: vi.fn(),
  };
}

const lote = () => act(async () => { await vi.advanceTimersByTimeAsync(INVALIDATION_BATCH_MS + 10); });
const vaciar = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const enRed = (valor: boolean) => vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(valor);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  realtime.canales = [];
  realtime.setAuth.mockResolvedValue(undefined);
  realtime.removeChannel.mockResolvedValue('ok');
  realtime.channel.mockImplementation((name: string) => {
    const canal = { name } as Canal;
    const objeto = {
      on: (_tipo: string, _filtro: unknown, manejador: Canal['mensaje']) => { canal.mensaje = manejador; return objeto; },
      subscribe: (estado: Canal['estado']) => { canal.estado = estado; realtime.canales.push(canal); return objeto; },
    };
    return objeto;
  });
  enRed(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

function montarHook(api = crearApi(), refreshProfile = vi.fn(), canalesPerfil = ['rol:JOP'], token = 'token-ficticio') {
  const hook = renderHook(({ t }) => useLive(api as unknown as Api, perfil(canalesPerfil), t, refreshProfile), { initialProps: { t: token } });
  return { api, refreshProfile, ...hook };
}

describe('tiempo real sin sondeo', () => {
  it('no consulta /eventos al montar ni al avanzar el reloj', async () => {
    const { api } = montarHook();
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    await vaciar();
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(consultas(api, '/eventos')).toBe(0);
  });

  it('un evento del canal incrementa la versión y solo refresca el perfil si cambia un usuario', async () => {
    const { result, refreshProfile } = montarHook();
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    await lote();
    const base = result.current.version;
    act(() => canales()[0].mensaje({ payload: { entidad: 'cama' } }));
    await lote();
    expect(result.current.version).toBe(base + 1);
    expect(refreshProfile).not.toHaveBeenCalled();
    act(() => canales()[0].mensaje({ payload: { entidad: 'usuario' } }));
    await lote();
    expect(result.current.version).toBe(base + 2);
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('se suscribe a cada canal del perfil y pasa a en vivo cuando todos están unidos', async () => {
    const { result } = montarHook(crearApi(), vi.fn(), ['rol:JOP', 'usuario:u-1']);
    await vaciar();
    expect(canales().map(c => c.name)).toEqual(['rol:JOP', 'usuario:u-1']);
    expect(result.current.status).toBe('reconnecting');
    act(() => canales()[0].estado('SUBSCRIBED'));
    expect(result.current.status).toBe('reconnecting');
    act(() => canales()[1].estado('SUBSCRIBED'));
    expect(result.current.status).toBe('live');
  });

  it('no se une al canal publico: el portal no lo usa (S12)', async () => {
    const { result } = montarHook(crearApi(), vi.fn(), ['rol:JOP', 'publico']);
    await vaciar();
    expect(canales().map(c => c.name)).toEqual(['rol:JOP']);
    act(() => canales()[0].estado('SUBSCRIBED'));
    expect(result.current.status).toBe('live');
  });

  it('una ráfaga de eventos y de uniones de canal produce una sola invalidación, no una por canal (S9)', async () => {
    const { result } = montarHook(crearApi(), vi.fn(), ['rol:JOP', 'usuario:u-1', 'ambulancia']);
    await vaciar();
    await lote();
    const base = result.current.version;
    act(() => { for (const c of canales()) c.estado('SUBSCRIBED'); });
    act(() => { for (const c of canales()) c.mensaje({ payload: { entidad: 'cama' } }); });
    expect(result.current.version).toBe(base);
    await lote();
    expect(result.current.version).toBe(base + 1);
    await lote();
    expect(result.current.version).toBe(base + 1);
  });

  it('al renovarse el token los canales unidos reciben el nuevo sin quitarse ni volver a crearse (S10)', async () => {
    const { rerender } = montarHook();
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    expect(realtime.setAuth).toHaveBeenCalledTimes(1);
    expect(realtime.setAuth).toHaveBeenLastCalledWith('token-ficticio');
    rerender({ t: 'token-renovado' });
    await vaciar();
    expect(realtime.setAuth).toHaveBeenCalledTimes(2);
    expect(realtime.setAuth).toHaveBeenLastCalledWith('token-renovado');
    expect(realtime.removeChannel).not.toHaveBeenCalled();
    expect(canales()).toHaveLength(1);
  });

  it('al reconectar un canal caído hace una sola consulta de recuperación e invalida las vistas', async () => {
    const { api, result } = montarHook();
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    act(() => canales()[0].estado('CLOSED'));
    expect(result.current.status).toBe('reconnecting');
    expect(consultas(api, '/eventos')).toBe(0);
    await lote();
    const base = result.current.version;
    act(() => canales()[0].estado('SUBSCRIBED'));
    await vaciar();
    await lote();
    expect(api.request).toHaveBeenCalledWith('/eventos?after=0');
    expect(consultas(api, '/eventos')).toBe(1);
    expect(result.current.version).toBeGreaterThan(base);
    expect(result.current.status).toBe('live');
  });

  it('la recuperación pide solo lo posterior al cursor anterior y refresca el perfil si cambió un usuario', async () => {
    const api = crearApi(async () => ({ cursor: '9', events: [{ entity: 'usuario' }] }));
    const { refreshProfile } = montarHook(api);
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    act(() => canales()[0].estado('TIMED_OUT'));
    act(() => canales()[0].estado('SUBSCRIBED'));
    await vaciar();
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    act(() => canales()[0].estado('CLOSED'));
    act(() => canales()[0].estado('SUBSCRIBED'));
    await vaciar();
    expect(api.request).toHaveBeenLastCalledWith('/eventos?after=9');
  });

  it('si la recuperación falla no reintenta por reloj y vuelve a intentar en la siguiente reconexión', async () => {
    let fallar = true;
    const api = crearApi(async () => { if (fallar) throw new Error('sin red'); return { cursor: '3', events: [] }; });
    const { result } = montarHook(api);
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    act(() => canales()[0].estado('CLOSED'));
    act(() => canales()[0].estado('SUBSCRIBED'));
    await vaciar();
    expect(consultas(api, '/eventos')).toBe(1);
    expect(result.current.status).toBe('reconnecting');
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(consultas(api, '/eventos')).toBe(1);
    fallar = false;
    act(() => canales()[0].estado('CLOSED'));
    act(() => canales()[0].estado('SUBSCRIBED'));
    await vaciar();
    expect(consultas(api, '/eventos')).toBe(2);
    expect(result.current.status).toBe('live');
  });

  it('al desmontar quita los canales y deja de escuchar la red', async () => {
    const { api, unmount } = montarHook();
    await vaciar();
    unmount();
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event('online')); });
    await vaciar();
    expect(consultas(api, '/eventos')).toBe(0);
  });
});

describe('escenario 2: pérdida y regreso de la red con el tablero de camas', () => {
  const perfilTablero = perfil(['rol:JOP']);
  const sinCambios = () => {};
  function Tablero({ api }: { api: ReturnType<typeof crearApi> }) {
    const live = useLive(api as unknown as Api, perfilTablero, 'token-ficticio', sinCambios);
    return <><p data-testid="conexion">{live.status}</p><BedsPage api={api as unknown as Api} profile={perfilTablero} version={live.version} /></>;
  }

  it('sin red queda sin conexión; al volver hace una consulta, invalida y el tablero pide datos otra vez', async () => {
    const api = crearApi();
    render(<Tablero api={api} />);
    await screen.findByText('HAB-201-A');
    await vaciar();
    act(() => canales()[0].estado('SUBSCRIBED'));
    await waitFor(() => expect(screen.getByTestId('conexion').textContent).toBe('live'));
    await screen.findByText('HAB-201-A');

    enRed(false);
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByTestId('conexion').textContent).toBe('offline');
    act(() => canales()[0].estado('CLOSED'));
    expect(screen.getByTestId('conexion').textContent).toBe('offline');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(consultas(api, '/eventos')).toBe(0);

    const tableroAntes = consultas(api, '/camas');
    enRed(true);
    act(() => { window.dispatchEvent(new Event('online')); });
    act(() => canales()[0].estado('SUBSCRIBED'));
    await waitFor(() => expect(screen.getByTestId('conexion').textContent).toBe('live'));
    await waitFor(() => expect(consultas(api, '/camas')).toBeGreaterThan(tableroAntes));
    expect(consultas(api, '/eventos')).toBe(1);
  });
});
