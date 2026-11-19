import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, HttpApi, type Api } from '../lib/api';
import { WriteError } from '../features/common';
import { ShiftStatusBanner, nextShiftText, showsShiftBanner, SHIFT_BANNER_TITLE } from '../features/shift-status';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

// Tomorrow 07:00 in El Salvador (UTC-6, no daylight saving), whatever the machine's zone.
const tomorrow7 = () => { const sv = new Date(Date.now() - 6 * 3_600_000); return new Date(Date.UTC(sv.getUTCFullYear(), sv.getUTCMonth(), sv.getUTCDate() + 1, 13)); };
const next = () => { const s = tomorrow7(); return { id: 't-2', start: s.toISOString(), end: new Date(s.valueOf() + 8 * 3_600_000).toISOString(), area: 'Consulta externa', state: 'publicado' }; };
const apiAnswering = (answer: () => Promise<unknown>) => ({ request: vi.fn(answer), write: vi.fn() }) as unknown as Api & { request: ReturnType<typeof vi.fn> };

describe('Lote 5 S9 · banner de turno activo', () => {
  it('shows only when the account works by shifts and has none now', () => {
    expect(showsShiftBanner({ required: true, active: false })).toBe(true);
    expect(showsShiftBanner({ required: true, active: true })).toBe(false);
    expect(showsShiftBanner({ required: false, active: true })).toBe(false);
    expect(showsShiftBanner(null)).toBe(false);
    expect(showsShiftBanner({})).toBe(false);
  });

  it('without an active shift it says what the person can do and when the next shift starts', async () => {
    const api = apiAnswering(async () => ({ required: true, active: false, graceMinutes: 30, shift: null, next: next(), message: 'x' }));
    render(<ShiftStatusBanner api={api} />);
    expect(await screen.findByText('Sin turno activo: puedes consultar pero no registrar.')).toBeTruthy();
    expect(screen.getByText('Próximo turno: Mañana 07:00 a 15:00 · Consulta externa')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/me/turno-activo', expect.anything());
  });

  it('without a published next shift it shows only the title', async () => {
    render(<ShiftStatusBanner api={apiAnswering(async () => ({ required: true, active: false, shift: null, next: null }))} />);
    expect(await screen.findByText(SHIFT_BANNER_TITLE)).toBeTruthy();
    expect(screen.queryByText(/Próximo turno/)).toBeNull();
    expect(nextShiftText(null)).toBeNull();
  });

  it('with an active shift, or for ADM/DPD (required false), nothing shows', async () => {
    const api = apiAnswering(async () => ({ required: true, active: true, shift: next(), next: null }));
    const { container } = render(<ShiftStatusBanner api={api} />);
    await vi.waitFor(() => expect(api.request).toHaveBeenCalled());
    await act(async () => {});
    expect(container.textContent).toBe('');
  });

  it('an older API without the endpoint (404) shows nothing', async () => {
    const api = apiAnswering(async () => { throw new ApiError('Not Found', 404); });
    const { container } = render(<ShiftStatusBanner api={api} />);
    await vi.waitFor(() => expect(api.request).toHaveBeenCalled());
    await act(async () => {});
    expect(container.textContent).toBe('');
  });

  it('reads the state again when the window gets the focus back, never on a timer', async () => {
    let active = true;
    const api = apiAnswering(async () => ({ required: true, active, shift: null, next: null }));
    render(<ShiftStatusBanner api={api} />);
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    active = false;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(await screen.findByText(SHIFT_BANNER_TITLE)).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('a 403 sin_turno_activo shows the API message where write errors are shown', async () => {
    const detail = 'Tu turno terminó a las 15:00. Puedes consultar, pero registrar necesita un turno activo.';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ codigo: 'sin_turno_activo', detail }), { status: 403 })));
    const error = await new HttpApi(async () => 't').write('/fila', {}).catch(e => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('sin_turno_activo');
    render(<WriteError error={error as ApiError} />);
    expect(screen.getByText(detail)).toBeTruthy();
  });

  it('a 403 sin_turno_activo with no readable body still explains the shift rule', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ codigo: 'sin_turno_activo' }), { status: 403 })));
    const error = await new HttpApi(async () => 't').request('/fila').catch(e => e as ApiError);
    expect((error as ApiError).message).toBe('No tienes un turno activo. Pide a Jefatura que publique tu turno.');
  });
});
