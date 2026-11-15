import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { COLD_START, coldStartRetryable, retryColdStart } from '../lib/cold-start';

// MA-OPS-01: the free Render plan sleeps the API; the first read after a while can take up to a minute.
afterEach(() => { vi.useRealTimers(); });

describe('arranque en frío de la API', () => {
  it('reintenta una lectura sin respuesta o con 502-504 y avisa que el servidor se está activando', async () => {
    vi.useFakeTimers();
    const call = vi.fn()
      .mockRejectedValueOnce(new ApiError('No se pudo conectar.'))
      .mockRejectedValueOnce(new ApiError('Bad gateway', 503))
      .mockResolvedValueOnce('perfil');
    const onSlow = vi.fn();
    const result = retryColdStart(call, onSlow);
    await vi.advanceTimersByTimeAsync(COLD_START.slowHintMs);
    expect(onSlow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(COLD_START.backoffMs.reduce((a, b) => a + b, 0));
    await expect(result).resolves.toBe('perfil');
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('no reintenta errores de negocio (401, 403, 409)', async () => {
    const call = vi.fn().mockRejectedValue(new ApiError('Prohibido', 403, 'sin_permiso'));
    await expect(retryColdStart(call)).rejects.toMatchObject({ status: 403 });
    expect(call).toHaveBeenCalledTimes(1);
    expect(coldStartRetryable(new ApiError('x', 401))).toBe(false);
    expect(coldStartRetryable(new ApiError('x', 502))).toBe(true);
  });

  it('una respuesta rápida no muestra el aviso', async () => {
    vi.useFakeTimers();
    const onSlow = vi.fn();
    await expect(retryColdStart(async () => 'ok', onSlow)).resolves.toBe('ok');
    await vi.advanceTimersByTimeAsync(COLD_START.slowHintMs * 2);
    expect(onSlow).not.toHaveBeenCalled();
  });
});
