import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';

// Canal `publico` simulado: la prueba emite eventos sin red.
const realtime = vi.hoisted(() => ({ handler: undefined as undefined | (() => void), options: undefined as unknown, removeChannel: vi.fn(), channel: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { channel: realtime.channel, removeChannel: realtime.removeChannel } }));

import { PublicScreen } from '../features/public-screen';
import { NoticesPage, localToIso } from '../features/notices';
import { INVALIDATION_BATCH_MS } from '../lib/live';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  realtime.channel.mockImplementation((_name: string, options: unknown) => {
    realtime.options = options;
    const objeto = { on: (_t: string, _f: unknown, handler: () => void) => { realtime.handler = handler; return objeto; }, subscribe: (estado: (s: string) => void) => { estado('SUBSCRIBED'); return objeto; } };
    return objeto;
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const datos = (libres = 4) => (path: string): unknown => {
  if (path === '/publico/ocupacion') return { actualizadoEn: '2026-11-15T15:00:00Z', ocupacion: [{ planta: 2, categoria: 'semiprivada', camas: 10, libres, ocupadas: 10 - libres }, { planta: 3, categoria: 'vip', camas: 2, libres: 1, ocupadas: 1 }] };
  if (path === '/publico/medicos-de-turno') return { actualizadoEn: '', medicos: [{ nombre: 'Ana Ficticia', especialidad: 'Pediatría', area: 'Consulta externa', hasta: '2026-11-15T20:00:00Z' }], proximoCambio: null };
  if (path === '/publico/avisos') return { actualizadoEn: '', avisos: [{ id: 'a-1', titulo: 'Laboratorio cerrado', cuerpo: 'Laboratorio cerrado el domingo.', desde: '2026-11-15T00:00:00Z', hasta: '2026-11-17T00:00:00Z' }], proximoCambio: null };
  if (path === '/publico/fila/consulta_general') return { actualizadoEn: '', servicio: 'consulta_general', fecha: '2026-11-15', llamados: [{ numero: 17, consultorio: 'Consultorio 3', llamados: 1 }] };
  if (path.startsWith('/publico/fila/')) return { actualizadoEn: '', servicio: '', fecha: '', llamados: [] };
  throw new Error(`Ruta inesperada: ${path}`);
};
const crearApi = (respuesta: (path: string) => unknown) => ({ request: vi.fn(async (path: string) => respuesta(path)), write: vi.fn() });

describe('W34 · pantalla pública sin sesión', () => {
  it('muestra ocupación por planta, médicos de turno, avisos y números llamados, sin datos de pacientes', async () => {
    const api = crearApi(datos());
    render(<PublicScreen api={api as unknown as Api} />);
    const ocupacion = await screen.findByRole('region', { name: 'Ocupación por planta' });
    await waitFor(() => expect(within(ocupacion).getByText('Planta 2')).toBeTruthy());
    expect(within(ocupacion).getByText(/Semiprivada/).textContent).toBe('Semiprivada: 4 libres de 10');
    expect(await screen.findByText('Ana Ficticia')).toBeTruthy();
    expect(screen.getByText('Laboratorio cerrado')).toBeTruthy();
    const general = screen.getByLabelText('Consulta general');
    expect(within(general).getByText('17')).toBeTruthy();
    expect(within(general).getByText('Consultorio 3')).toBeTruthy();
    expect(within(screen.getByLabelText('Emergencia')).getByText('Sin números llamados')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(realtime.channel).toHaveBeenCalledWith('publico', { config: { private: false } });
  });

  it('escenario 1: un evento del canal publico vuelve a pedir y solo cambia el conteo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let libres = 4;
    const api = crearApi(path => datos(libres)(path));
    render(<PublicScreen api={api as unknown as Api} />);
    const ocupacion = await screen.findByRole('region', { name: 'Ocupación por planta' });
    await waitFor(() => expect(within(ocupacion).getByText(/Semiprivada/).textContent).toContain('4 libres'));
    libres = 3;
    await act(async () => { realtime.handler?.(); await vi.advanceTimersByTimeAsync(INVALIDATION_BATCH_MS + 10); });
    await waitFor(() => expect(within(ocupacion).getByText(/Semiprivada/).textContent).toContain('3 libres'));
  });

  it('cuando la API falla lo dice sin romper la pantalla', async () => {
    const api = crearApi(() => { throw new ApiError('caída', 500); });
    render(<PublicScreen api={api as unknown as Api} />);
    expect((await screen.findAllByText('Información no disponible por ahora.')).length).toBeGreaterThan(0);
  });
});

const jop = (permisos = ['avisos.publicar']): AccessProfile => ({ id: 'jop', user: { id: 'jop' }, email: 'jop@example.test', name: 'Jefatura', roles: ['JOP'], platforms: ['web'], permissions: permisos.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null });

describe('W25 · avisos generales', () => {
  it('convierte la hora local de El Salvador a UTC', () => {
    expect(localToIso('2026-11-15T08:30')).toBe('2026-11-15T14:30:00.000Z');
  });

  it('advierte si el aviso parece tener datos personales y permite publicarlo tras confirmar', async () => {
    const api = { request: vi.fn(async () => ({ actualizadoEn: '', avisos: [], proximoCambio: null })), write: vi.fn() };
    api.write.mockRejectedValueOnce(new ApiError('El aviso parece contener datos personales (DUI, expediente o teléfono).', 422, 'aviso_con_datos_personales'));
    api.write.mockResolvedValueOnce({ id: 'a-2' });
    render(<NoticesPage api={api as unknown as Api} profile={jop()} version={0} />);
    expect(await screen.findByText('No hay avisos vigentes')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Nuevo aviso/ }));
    await userEvent.type(screen.getByLabelText('Título'), 'Objeto perdido');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'DUI 04512345-6 encontrado');
    await userEvent.type(screen.getByLabelText('Hasta'), '2026-11-20T18:00');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    expect(await screen.findByText(/parece contener datos personales/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar de todos modos' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[0][1]).toEqual({ titulo: 'Objeto perdido', cuerpo: 'DUI 04512345-6 encontrado', hasta: '2026-11-21T00:00:00.000Z' });
    expect(api.write.mock.calls[1][1]).toEqual(expect.objectContaining({ confirmarDatosPersonales: true }));
  });

  it('sin avisos.publicar no ofrece el botón de publicar', async () => {
    const api = { request: vi.fn(async () => ({ actualizadoEn: '', avisos: [], proximoCambio: null })), write: vi.fn() };
    render(<NoticesPage api={api as unknown as Api} profile={jop([])} version={0} />);
    await screen.findByText('No hay avisos vigentes');
    expect(screen.queryByRole('button', { name: /Nuevo aviso/ })).toBeNull();
  });
});
