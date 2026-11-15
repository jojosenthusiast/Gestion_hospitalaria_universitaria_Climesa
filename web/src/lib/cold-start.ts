import { ApiError } from './api';

/**
 * MA-OPS-01 / E-01: the free Render plan sleeps the API, and the first request after a while takes up to a minute.
 * A read (or the session profile) that fails without an answer, or with a gateway 502-504, is retried with a growing wait;
 * after `slowHintMs` the screen explains that the server is waking up. Writes are not retried here: their Idempotency-Key
 * already makes the person's own retry safe. Same values as Android (`ColdStart.kt`) and iOS (`ColdStart.swift`).
 */
export const COLD_START = { backoffMs: [2_000, 5_000, 10_000], slowHintMs: 5_000 } as const;
export const SLOW_SERVER_MESSAGE = 'El servidor se está activando. La primera conexión del día puede tardar hasta un minuto.';

export const coldStartRetryable = (error: unknown) =>
  error instanceof ApiError && (error.status === 0 || (error.status >= 502 && error.status <= 504));

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function retryColdStart<T>(call: () => Promise<T>, onSlow?: () => void): Promise<T> {
  const timer = onSlow ? setTimeout(onSlow, COLD_START.slowHintMs) : undefined;
  try {
    for (const delay of COLD_START.backoffMs) {
      try { return await call(); } catch (error) { if (!coldStartRetryable(error)) throw error; }
      await wait(delay);
    }
    return await call();
  } finally { if (timer) clearTimeout(timer); }
}

const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3000/api/v1';
/** `/salud` lives outside the `/api/v1` prefix. Asked when the login opens, so the API is awake by the time the person signs in. */
export function warmUpApi(fetcher: typeof fetch = fetch) {
  const origin = apiBase.replace(/\/api\/v\d+$/, '');
  void fetcher(`${origin}/salud`, { cache: 'no-store' }).catch(() => undefined);
}
