import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import type { LiveSignal } from '../lib/live';
import { useData } from '../features/common';
import { LiveContext } from '../features/live-scope';

// Fase 2, S3 (protocolo de carga): `useData` guarda la última respuesta de cada ruta en memoria
// (por sesión de API) y la muestra al instante al volver; luego la revalida en segundo plano.

type Pending = { path: string; resolve: (value: unknown) => void };
function fakeApi() {
  const pending: Pending[] = [];
  const request = vi.fn((path: string) => new Promise(resolve => { pending.push({ path, resolve }); }));
  return { api: { request } as unknown as Api, request, pending };
}

afterEach(cleanup);

describe('useData con caché stale-while-revalidate (S3)', () => {
  it('al volver a montar la misma ruta muestra el dato guardado al instante y lo revalida', async () => {
    const { api, request, pending } = fakeApi();
    const first = renderHook(() => useData<{ n: number }>(api, '/camas'));
    expect(first.result.current.data).toBeNull();
    await act(async () => { pending[0].resolve({ n: 1 }); });
    expect(first.result.current.data).toEqual({ n: 1 });
    first.unmount();

    const second = renderHook(() => useData<{ n: number }>(api, '/camas'));
    // Primer render: el dato guardado, sin esperar a la red.
    expect(second.result.current.data).toEqual({ n: 1 });
    expect(second.result.current.loading).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => { pending[1].resolve({ n: 2 }); });
    expect(second.result.current.data).toEqual({ n: 2 });
    expect(second.result.current.loading).toBe(false);
  });

  it('la caché es de cada cliente de API: otra sesión no ve datos de la anterior', async () => {
    const one = fakeApi();
    const hook = renderHook(() => useData<{ n: number }>(one.api, '/pacientes'));
    await act(async () => { one.pending[0].resolve({ n: 1 }); });
    hook.unmount();
    const other = fakeApi();
    const next = renderHook(() => useData<{ n: number }>(other.api, '/pacientes'));
    expect(next.result.current.data).toBeNull();
  });

  it('un evento de tiempo real vuelve a pedir solo la ruta afectada y conserva el dato mientras tanto', async () => {
    const { api, request, pending } = fakeApi();
    let setSignal: (s: LiveSignal) => void = () => {};
    function Harness() {
      const beds = useData<{ n: number }>(api, '/camas');
      const staff = useData<{ n: number }>(api, '/personal');
      return <p>{`camas:${beds.data?.n ?? '-'} personal:${staff.data?.n ?? '-'}`}</p>;
    }
    function Root() {
      const [signal, set] = useState<LiveSignal>({ any: 0, counts: {} });
      setSignal = set;
      return <LiveContext.Provider value={signal}><Harness /></LiveContext.Provider>;
    }
    render(<Root />);
    await act(async () => { pending.forEach((p, i) => p.resolve({ n: i + 1 })); });
    const before = request.mock.calls.length;
    expect(screen.getByText(/camas:\d personal:\d/)).toBeTruthy();

    act(() => setSignal({ any: 1, counts: { cama: 1 } }));
    await waitFor(() => expect(request.mock.calls.length).toBe(before + 1));
    expect(request.mock.calls.at(-1)?.[0]).toBe('/camas');
    // El dato anterior sigue en pantalla hasta que llega el nuevo.
    expect(screen.getByText(/camas:\d personal:\d/).textContent).not.toContain('-');
    await act(async () => { pending.at(-1)!.resolve({ n: 9 }); });
    expect(screen.getByText(/camas:9/)).toBeTruthy();
  });
});

