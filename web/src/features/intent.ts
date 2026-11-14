import { HttpApi } from '../lib/api';

// WEB-10 / CON-07: the Idempotency-Key belongs to the person's intent (one open form or dialog
// sending one operation), not to the request signature. `useAction` opens an intent scope with
// `withIntentKey`; `IntentApi.write` reads that key synchronously, before its first `await`, so the
// ambient value never leaks into another call. Writes made outside a scope keep the signature key.
let ambientKey: string | undefined;

export function withIntentKey<T>(key: string, call: () => Promise<T>): Promise<T> {
  ambientKey = key;
  try { return call(); } finally { ambientKey = undefined; }
}

export const newIntentKey = () => crypto.randomUUID();

/** `HttpApi` that honours the intent key opened by `useAction`. Create it once per session. */
export class IntentApi extends HttpApi {
  override write<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
    const key = ambientKey;
    ambientKey = undefined;
    if (!key) return super.write<T>(path, body, method);
    return this.request<T>(path, { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': key } });
  }
}
