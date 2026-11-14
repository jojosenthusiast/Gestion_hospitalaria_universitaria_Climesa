import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import type { LiveSignal } from '../lib/live';
import { useData } from '../features/common';
import { LiveContext, liveScope } from '../features/live-scope';

// WEB-01 (FR-120-04): un evento vuelve a pedir solo lo que afecta su entidad, no todas las vistas.
afterEach(cleanup);

const PATIENT = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-2222-3333-4444-555555555555';

function Lectura({ api, path }: { api: Api; path: string }) { useData(api, path, 0); return null; }

function montar(paths: string[]) {
  const api = { request: vi.fn(async () => ({})), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
  let signal: LiveSignal = { any: 0, counts: {} };
  const view = () => <LiveContext.Provider value={signal}>{paths.map(p => <Lectura key={p} api={api} path={p} />)}</LiveContext.Provider>;
  const utils = render(view());
  const llamadas = (path: string) => api.request.mock.calls.filter(([p]) => p === path).length;
  const evento = async (...keys: string[]) => {
    const counts = { ...signal.counts };
    for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
    signal = { any: signal.any + 1, counts };
    await act(async () => { utils.rerender(view()); });
  };
  return { llamadas, evento };
}

describe('invalidación por entidad (WEB-01)', () => {
  it('un evento de cama no vuelve a pedir la ficha auditada del paciente ni el personal', async () => {
    const { llamadas, evento } = montar(['/camas', `/pacientes/${PATIENT}`, '/personal']);
    await evento('cama', 'cama:bed-1');
    expect(llamadas('/camas')).toBe(2);
    expect(llamadas(`/pacientes/${PATIENT}`)).toBe(1);
    expect(llamadas('/personal')).toBe(1);
  });

  it('la ficha de un paciente se vuelve a pedir solo con eventos de ese mismo paciente', async () => {
    const { llamadas, evento } = montar([`/pacientes/${PATIENT}`]);
    await evento('paciente', `paciente:${OTHER}`);
    expect(llamadas(`/pacientes/${PATIENT}`)).toBe(1);
    await evento('paciente', `paciente:${PATIENT}`);
    expect(llamadas(`/pacientes/${PATIENT}`)).toBe(2);
  });

  it('las lecturas sin dueño único (auditoría) siguen atentas a cualquier evento', async () => {
    const { llamadas, evento } = montar(['/auditoria?limit=100']);
    await evento('turno', 'turno:t-1');
    expect(llamadas('/auditoria?limit=100')).toBe(2);
  });

  it('una búsqueda de pacientes no se repite sola porque otra persona editó un expediente', async () => {
    const { llamadas, evento } = montar(['/pacientes?query=ana&limit=20']);
    await evento('paciente', `paciente:${PATIENT}`);
    expect(llamadas('/pacientes?query=ana&limit=20')).toBe(1);
  });

  it('asigna las rutas del cliente a las entidades del catálogo de eventos', () => {
    expect(liveScope('/laboratorio/ordenes')).toEqual([{ entity: 'orden_laboratorio' }]);
    expect(liveScope('/laboratorio/catalogo')).toEqual([]);
    expect(liveScope('/fila?service=admisiones')).toEqual([{ entity: 'ticket_fila' }, { entity: 'cita' }, { entity: 'consulta' }]);
    expect(liveScope(`/pacientes/${PATIENT}/historial`)).toContainEqual({ entity: 'paciente', id: PATIENT });
    expect(liveScope('/metricas/tablero')).toBe('*');
  });

  it('un turno asignado en otra plataforma vuelve a pedir la tripulación de la ambulancia y los médicos disponibles, no las admisiones', async () => {
    const doctors = '/admisiones/medicos-disponibles?at=2026-11-20T10%3A00%3A00Z';
    const { llamadas, evento } = montar(['/ambulancia', doctors, '/admisiones']);
    await evento('turno', 'turno:turno-1');
    expect(llamadas('/ambulancia')).toBe(2);
    expect(llamadas(doctors)).toBe(2);
    expect(llamadas('/admisiones')).toBe(1);
    expect(liveScope('/admisiones/mapa-camas?patientId=p-1')).toContainEqual({ entity: 'espacio' });
  });
});
