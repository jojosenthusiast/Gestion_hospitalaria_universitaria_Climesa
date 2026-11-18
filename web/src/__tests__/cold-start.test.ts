import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { COLD_START, coldStartRetryable, isLikelyCold, recordServerAnswer, resetServerWarmth, retryColdStart } from '../lib/cold-start';

// MA-OPS-01: the free Render plan sleeps the API; the first read after a while can take up to a minute.
beforeEach(() => { resetServerWarmth(); });
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

  it('con el servidor despierto, una llamada lenta no muestra el aviso', async () => {
    vi.useFakeTimers();
    recordServerAnswer(200);
    const onSlow = vi.fn();
    const result = retryColdStart(() => new Promise(resolve => setTimeout(() => resolve('ok'), COLD_START.slowHintMs * 3)), onSlow);
    await vi.advanceTimersByTimeAsync(COLD_START.slowHintMs * 3);
    await expect(result).resolves.toBe('ok');
    expect(onSlow).not.toHaveBeenCalled();
  });

  it('con el servidor despierto, el aviso sale si el primer intento falla sin respuesta tras 5 s', async () => {
    vi.useFakeTimers();
    recordServerAnswer(200);
    const onSlow = vi.fn();
    const call = vi.fn()
      .mockImplementationOnce(() => new Promise((_, reject) => setTimeout(() => reject(new ApiError('Bad gateway', 502)), COLD_START.slowHintMs + 1_000)))
      .mockResolvedValueOnce('ok');
    const result = retryColdStart(call, onSlow);
    await vi.advanceTimersByTimeAsync(COLD_START.slowHintMs);
    expect(onSlow).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSlow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(COLD_START.backoffMs[0]);
    await expect(result).resolves.toBe('ok');
  });

  it('se considera dormido sin respuestas aún, tras unos 14 minutos sin respuestas o tras un fallo sin respuesta', () => {
    const now = 1_800_000_000_000;
    expect(isLikelyCold(undefined, false, now)).toBe(true);
    expect(isLikelyCold(now - 60_000, false, now)).toBe(false);
    expect(isLikelyCold(now - COLD_START.idleUntilColdMs - 1, false, now)).toBe(true);
    expect(isLikelyCold(now - 60_000, true, now)).toBe(true);
  });
});
