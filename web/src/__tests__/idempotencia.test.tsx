import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAction } from '../features/common';
import { IntentApi } from '../features/intent';

// WEB-10 / CON-07: la clave Idempotency-Key nace con la intención de la persona (un formulario o
// diálogo abierto que envía una operación) y se conserva en los reintentos de esa misma intención.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function servidor(...estados: number[]) {
  const fetchMock = vi.fn(async () => {
    const status = estados.length > 1 ? estados.shift()! : estados[0];
    return new Response(JSON.stringify(status < 300 ? { id: 'x-1' } : { detail: 'No se pudo guardar.' }), { status, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  const claves = () => fetchMock.mock.calls.map(call => ((call as unknown as [string, RequestInit])[1].headers as Record<string, string>)['Idempotency-Key']);
  return { fetchMock, claves };
}

describe('clave de idempotencia por intención (WEB-10)', () => {
  it('reintentar la misma intención tras un fallo reutiliza la clave aunque cambie el cuerpo', async () => {
    const { claves } = servidor(500, 200);
    const api = new IntentApi(async () => 't');
    const { result } = renderHook(() => useAction(api));
    await act(async () => { await result.current.run('/pacientes', { nombre: 'Ana' }); });
    await act(async () => { await result.current.run('/pacientes', { nombre: 'Ana María' }); });
    const [primera, segunda] = claves();
    expect(primera).toMatch(/^[a-zA-Z0-9_-]{8,128}$/);
    expect(segunda).toBe(primera);
  });

  it('después de un éxito, la siguiente operación es una intención nueva con otra clave', async () => {
    const { claves } = servidor(200);
    const api = new IntentApi(async () => 't');
    const { result } = renderHook(() => useAction(api));
    await act(async () => { await result.current.run('/fila', { servicio: 'admisiones' }); });
    await act(async () => { await result.current.run('/fila', { servicio: 'admisiones' }); });
    const [primera, segunda] = claves();
    expect(segunda).not.toBe(primera);
  });

  it('otro formulario (otra instancia) con los mismos datos usa otra clave', async () => {
    const { claves } = servidor(500);
    const api = new IntentApi(async () => 't');
    const uno = renderHook(() => useAction(api)), dos = renderHook(() => useAction(api));
    await act(async () => { await uno.result.current.run('/citas', { motivo: 'Control' }); });
    await act(async () => { await dos.result.current.run('/citas', { motivo: 'Control' }); });
    const [primera, segunda] = claves();
    expect(segunda).not.toBe(primera);
  });

  it('operaciones distintas del mismo formulario no comparten clave', async () => {
    const { claves } = servidor(500);
    const api = new IntentApi(async () => 't');
    const { result } = renderHook(() => useAction(api));
    await act(async () => { await result.current.run('/camas/b-1/bloqueo', { version: 1 }); });
    await act(async () => { await result.current.run('/camas/b-2/bloqueo', { version: 1 }); });
    const [primera, segunda] = claves();
    expect(segunda).not.toBe(primera);
  });

  it('sin intención (llamada directa a write) conserva la clave por firma de la petición', async () => {
    const { claves } = servidor(500);
    const api = new IntentApi(async () => 't');
    await api.write('/x', { a: 1 }).catch(() => undefined);
    await api.write('/x', { a: 1 }).catch(() => undefined);
    const [primera, segunda] = claves();
    expect(segunda).toBe(primera);
  });
});
