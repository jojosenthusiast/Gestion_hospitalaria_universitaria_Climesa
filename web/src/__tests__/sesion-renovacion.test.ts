import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpApi } from '../lib/api';
import { renewOnce } from '../lib/session-renewal';

afterEach(() => { vi.unstubAllGlobals(); });

const answer = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('un 401 intenta renovar la sesión una vez antes de cerrarla', () => {
  it('renueva y repite la petición con el token nuevo y la misma clave de idempotencia', async () => {
    let token = 'viejo';
    const fetchMock = vi.fn().mockResolvedValueOnce(answer(401)).mockResolvedValueOnce(answer(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const expire = vi.fn();
    const api = new HttpApi(async () => token, renewOnce(async () => { token = 'nuevo'; return true; }, expire));
    await expect(api.write('/citas', { a: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [first, second] = fetchMock.mock.calls.map(c => c[1] as RequestInit & { headers: Record<string, string> });
    expect(first.headers.Authorization).toBe('Bearer viejo');
    expect(second.headers.Authorization).toBe('Bearer nuevo');
    expect(second.headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key']);
    expect(expire).not.toHaveBeenCalled();
  });

  it('si la renovación falla, cierra la sesión con el aviso de sesión vencida y lanza el 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(401, { detail: 'Sesión vencida' })));
    const expire = vi.fn();
    const api = new HttpApi(async () => 't', renewOnce(async () => false, expire));
    await expect(api.request('/me')).rejects.toMatchObject({ status: 401 });
    expect(expire).toHaveBeenCalledTimes(1);
  });

  it('si la API rechaza también el token renovado, cierra la sesión una sola vez', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(401));
    vi.stubGlobal('fetch', fetchMock);
    const expire = vi.fn();
    const renew = vi.fn(async () => true);
    const api = new HttpApi(async () => 't', renewOnce(renew, expire));
    await expect(api.request('/me')).rejects.toMatchObject({ status: 401 });
    await expect(api.request('/citas')).rejects.toMatchObject({ status: 401 });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(expire).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('varias peticiones que fallan juntas comparten una sola renovación', async () => {
    const renew = vi.fn(() => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 5)));
    const handler = renewOnce(renew, vi.fn());
    await expect(Promise.all([handler(false), handler(false)])).resolves.toEqual([true, true]);
    expect(renew).toHaveBeenCalledTimes(1);
  });
});
