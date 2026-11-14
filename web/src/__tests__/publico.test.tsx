import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';

// Canal `publico` simulado: la prueba emite eventos sin red.
const realtime = vi.hoisted(() => ({ handler: undefined as undefined | (() => void), options: undefined as unknown, removeChannel: vi.fn(), channel: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabase: { channel: realtime.channel, removeChannel: realtime.removeChannel } }));

import { PublicScreen } from '../features/public-screen';
import { NoticesPage, localToIso } from '../features/notices';
import { NoticesPanel } from '../features/avisos/NoticesPanel';
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
  const lista = [{ id: 'a-1', titulo: 'Simulacro', cuerpo: 'Mañana a las 10.', desde: '2026-11-14T12:00:00.000Z', hasta: '2026-11-20T12:00:00.000Z', prioridad: 'urgente', publico: false, roles: ['MED', 'ENF'], estado: 'vigente', publicadoEn: '2026-11-14T12:00:00.000Z' }];
  const apiDe = (rows: unknown[] = []) => ({ request: vi.fn(async () => rows), write: vi.fn() });

  it('lista lo publicado con su prioridad, audiencia y estado', async () => {
    render(<NoticesPage api={apiDe(lista) as unknown as Api} profile={jop()} version={0} />);
    const row = (await screen.findByText('Simulacro')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Urgente')).toBeTruthy();
    expect(within(row).getByText('Medicina, Enfermería')).toBeTruthy();
    expect(within(row).getByText('Vigente')).toBeTruthy();
  });

  it('muestra la vista previa mientras se escribe y publica con audiencia y prioridad', async () => {
    const api = apiDe();
    api.write.mockResolvedValue({ id: 'a-2' });
    render(<NoticesPage api={api as unknown as Api} profile={jop()} version={0} />);
    expect(await screen.findByText('Todavía no hay avisos')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Título'), 'Corte de agua');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'Sin agua una hora.');
    const preview = screen.getByLabelText('Vista previa');
    expect(within(preview).getByText('Corte de agua')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Crítico' }));
    expect(within(preview).getByText(/^Para: Pantalla pública y apps sin sesión/)).toBeTruthy();
    await userEvent.click(screen.getByLabelText(/^Público/));
    await userEvent.click(screen.getByLabelText('Enfermería'));
    expect(within(preview).getByText(/Para: Enfermería/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
    expect(api.write.mock.calls[0][1]).toEqual(expect.objectContaining({ titulo: 'Corte de agua', cuerpo: 'Sin agua una hora.', prioridad: 'critico', publico: false, roles: ['ENF'] }));
    expect(await screen.findByText(/Aviso publicado/)).toBeTruthy();
  });

  it('no deja publicar sin audiencia', async () => {
    render(<NoticesPage api={apiDe() as unknown as Api} profile={jop()} version={0} />);
    await screen.findByText('Todavía no hay avisos');
    await userEvent.type(screen.getByLabelText('Título'), 'Aviso');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'Texto del aviso.');
    await userEvent.click(screen.getByLabelText(/^Público/));
    expect(screen.getByText(/Elige a quién va dirigido/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Publicar aviso' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('advierte si el aviso parece tener datos personales y permite publicarlo tras confirmar', async () => {
    const api = apiDe();
    api.write.mockRejectedValueOnce(new ApiError('El aviso parece contener datos personales (DUI, expediente o teléfono).', 422, 'aviso_con_datos_personales'));
    api.write.mockResolvedValueOnce({ id: 'a-2' });
    render(<NoticesPage api={api as unknown as Api} profile={jop()} version={0} />);
    await screen.findByText('Todavía no hay avisos');
    await userEvent.type(screen.getByLabelText('Título'), 'Objeto perdido');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'DUI 04512345-6 encontrado');
    expect(screen.getByText(/parece contener un DUI/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar de todos modos' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[1][1]).toEqual(expect.objectContaining({ confirmarDatosPersonales: true }));
  });

  it('sin avisos.publicar no ofrece el formulario', async () => {
    const api = apiDe();
    render(<NoticesPage api={api as unknown as Api} profile={jop([])} version={0} />);
    expect(screen.queryByLabelText('Nuevo aviso')).toBeNull();
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('Avisos en el tablero de inicio', () => {
  it('muestra los avisos del rol por prioridad y se calla si no hay', async () => {
    const aviso = (id: string, titulo: string, prioridad: string) => ({ id, titulo, cuerpo: 'Texto.', desde: null, hasta: '2026-11-20T12:00:00.000Z', prioridad, publico: true, roles: [] });
    const api = { request: vi.fn(async () => ({ actualizadoEn: '', avisos: [aviso('1', 'Corte de agua', 'critico'), aviso('2', 'Visitas', 'atencion'), aviso('3', 'Otro', 'atencion')], proximoCambio: null })), write: vi.fn() };
    const { unmount } = render(<NoticesPanel api={api as unknown as Api} version={0} />);
    expect(await screen.findByText('Corte de agua')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/me/avisos', expect.anything());
    expect(screen.queryByText('Otro')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Ver los 3 avisos/ }));
    expect(screen.getByText('Otro')).toBeTruthy();
    unmount();
    const vacio = { request: vi.fn(async () => ({ actualizadoEn: '', avisos: [], proximoCambio: null })), write: vi.fn() };
    const { container } = render(<NoticesPanel api={vacio as unknown as Api} version={0} />);
    await waitFor(() => expect(vacio.request).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
