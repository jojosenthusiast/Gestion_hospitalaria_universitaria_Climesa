import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { LiveContext, liveScope } from '../features/live-scope';
import { LabResultsInbox, sortFollowUps } from '../features/dashboards/lab-results-inbox';
import { Dashboard } from '../features/dashboards';

// Fase 2, flujo C (S10): «Resultados por revisar» del médico en Mi día (GET /laboratorio/pendientes), como en iOS.
afterEach(cleanup);

const base = { orderId: 'o-1', patientId: 'pac-1', patientRecord: '000201-1', state: 'pendiente', orderState: 'completado', priority: 'rutina', external: false, updatedAt: '2026-11-15T15:00:00Z' };
const observacionVieja = { ...base, id: 'f-1', patientName: 'Paciente Ficticia Uno', reason: 'observacion', detail: 'Glucosa: muestra hemolizada', createdAt: '2026-11-15T13:00:00Z', version: 3 };
const critico = { ...base, id: 'f-2', patientName: 'Paciente Ficticio Dos', reason: 'critico', detail: 'Hemoglobina: Crítico bajo', createdAt: '2026-11-15T16:00:00Z', version: 1 };
const observacionNueva = { ...base, id: 'f-3', patientName: null, patientRecord: null, reason: 'observacion', detail: 'Potasio: repetir', createdAt: '2026-11-15T14:00:00Z', version: 1 };

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'm@example.test', name: 'Médica Ficticia', roles: ['MED'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'relacion' })), channels: [], patientId: null, staffId: 'med-1' });
const conPermiso = perfil(['laboratorio.revisar']);

type MockApi = Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
function apiCon(request: (path: string) => Promise<unknown>, write: (path: string, body: unknown) => Promise<unknown> = async () => ({ id: 'f-1', state: 'revisado', version: 4, reviewedAt: '2026-11-15T17:00:00Z' })): MockApi {
  return { request: vi.fn(request), write: vi.fn(write) } as unknown as MockApi;
}
const lecturas = (api: MockApi) => api.request.mock.calls.filter(([path]) => path === '/laboratorio/pendientes').length;

describe('Resultados por revisar (médico)', () => {
  it('ordena como iOS: críticos primero y luego los más antiguos', () => {
    expect(sortFollowUps([observacionVieja, critico, observacionNueva]).map(f => f.id)).toEqual(['f-2', 'f-1', 'f-3']);
  });

  it('muestra críticos primero con paciente, examen y observación; rojo solo para el crítico', async () => {
    render(<LabResultsInbox api={apiCon(async () => [observacionNueva, observacionVieja, critico])} profile={conPermiso} version={0} />);
    const seccion = await screen.findByRole('region', { name: 'Resultados por revisar' });
    const filas = await within(seccion).findAllByRole('listitem');
    expect(filas.map(f => f.textContent)).toEqual([
      expect.stringContaining('Paciente Ficticio Dos'),
      expect.stringContaining('Paciente Ficticia Uno'),
      expect.stringContaining('Paciente'),
    ]);
    expect(within(filas[0]).getByText('Hemoglobina: Crítico bajo')).toBeTruthy();
    expect(within(filas[0]).getByText('Crítico').closest('.status-badge')?.className).toContain('fam-critico');
    expect(within(filas[1]).getByText('Exp. 000201-1')).toBeTruthy();
    expect(within(filas[1]).getByText('Glucosa: muestra hemolizada')).toBeTruthy();
    expect(within(filas[1]).getByText('Observación').closest('.status-badge')?.className).not.toContain('fam-critico');
    expect(within(seccion).getByText('3 pendientes')).toBeTruthy();
  });

  it('no aparece ni consulta la API sin el permiso laboratorio.revisar', async () => {
    const api = apiCon(async () => [critico]);
    const { container } = render(<LabResultsInbox api={api} profile={perfil(['laboratorio.ordenar'])} version={0} />);
    await Promise.resolve();
    expect(container.textContent).toBe('');
    expect(lecturas(api)).toBe(0);
  });

  it('«Marcar como revisado» envía la versión, ocupa solo su fila y vuelve a cargar', async () => {
    let filas: unknown[] = [critico, observacionVieja];
    let soltar: (v: unknown) => void = () => undefined;
    const api = apiCon(async () => filas, () => new Promise(resolve => { soltar = resolve; }));
    render(<LabResultsInbox api={api} profile={conPermiso} version={0} />);
    const fila = (await screen.findByText('Paciente Ficticia Uno')).closest('li')!;
    await userEvent.click(within(fila).getByRole('button', { name: 'Marcar como revisado' }));
    expect(api.write).toHaveBeenCalledWith('/laboratorio/pendientes/f-1/revisar', { version: 3 }, 'POST');
    expect((within(fila).getByRole('button', { name: /Guardando/ }) as HTMLButtonElement).disabled).toBe(true);
    const otra = screen.getByText('Paciente Ficticio Dos').closest('li')!;
    expect((within(otra).getByRole('button', { name: 'Marcar como revisado' }) as HTMLButtonElement).disabled).toBe(false);
    const antes = lecturas(api);
    filas = [critico];
    soltar({ id: 'f-1', state: 'revisado', version: 4, reviewedAt: '2026-11-15T17:00:00Z' });
    await vi.waitFor(() => expect(lecturas(api)).toBe(antes + 1));
    await vi.waitFor(() => expect(screen.queryByText('Paciente Ficticia Uno')).toBeNull());
  });

  it('si marcar falla, explica en español y vuelve a cargar', async () => {
    const api = apiCon(async () => [observacionVieja], async () => { throw new ApiError('Not Found', 404, 'no_encontrado'); });
    render(<LabResultsInbox api={api} profile={conPermiso} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como revisado' }));
    expect(await screen.findByText('No encontramos este registro; vuelve a cargar.')).toBeTruthy();
    await vi.waitFor(() => expect(lecturas(api)).toBe(2));
  });

  it('sin pendientes dice que está al día', async () => {
    render(<LabResultsInbox api={apiCon(async () => [])} profile={conPermiso} version={0} />);
    expect(await screen.findByText('Al día: no tienes resultados por revisar.')).toBeTruthy();
  });

  // R1: the shared SectionState names the retry «Volver a intentar», as every other section.
  it('un error de carga muestra «Volver a intentar», no el texto de al día', async () => {
    let falla = true;
    const api = apiCon(async () => { if (falla) throw new ApiError('El servicio no está disponible.', 503, 'no_disponible'); return [critico]; });
    render(<LabResultsInbox api={api} profile={conPermiso} version={0} />);
    const reintentar = await screen.findByRole('button', { name: 'Volver a intentar' });
    expect(screen.queryByText('Al día: no tienes resultados por revisar.')).toBeNull();
    falla = false;
    await userEvent.click(reintentar);
    expect(await screen.findByText('Paciente Ficticio Dos')).toBeTruthy();
  });

  it('muestra un esqueleto mientras carga', async () => {
    render(<LabResultsInbox api={apiCon(() => new Promise(() => undefined))} profile={conPermiso} version={0} />);
    expect(await screen.findByText('Cargando información…')).toBeTruthy();
  });

  it('se vuelve a pedir con un evento de laboratorio', async () => {
    const api = apiCon(async () => [critico]);
    const { rerender } = render(<LiveContext.Provider value={{ any: 0, counts: {} }}><LabResultsInbox api={api} profile={conPermiso} version={0} /></LiveContext.Provider>);
    await screen.findByText('Paciente Ficticio Dos');
    expect(liveScope('/laboratorio/pendientes')).toEqual([{ entity: 'orden_laboratorio' }]);
    rerender(<LiveContext.Provider value={{ any: 1, counts: { orden_laboratorio: 1 } }}><LabResultsInbox api={api} profile={conPermiso} version={0} /></LiveContext.Provider>);
    await vi.waitFor(() => expect(lecturas(api)).toBe(2));
  });

  it('aparece en Mi día del médico', async () => {
    const api = apiCon(async path => path === '/laboratorio/pendientes' ? [critico] : []);
    render(<Dashboard api={api} profile={{ ...conPermiso, permissions: [{ code: 'laboratorio.revisar', context: 'relacion' }, { code: 'laboratorio.ver', context: 'relacion' }] }} version={0} />);
    const seccion = await screen.findByRole('region', { name: 'Resultados por revisar' });
    expect(await within(seccion).findByText('Paciente Ficticio Dos')).toBeTruthy();
  });
});
