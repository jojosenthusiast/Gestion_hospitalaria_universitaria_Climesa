import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { LabCatalogPage, rangeFormProblem, type CatalogExam } from '../features/lab-catalog';

// W10 (MA-LAB-06): el administrador edita nombre, unidad, estado y rangos de un examen; los rangos se versionan por vigencia.
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'adm@example.test', name: 'Administración Ficticia', roles: ['ADM'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null });
const glucosa: CatalogExam = { id: 'e-1', code: 'GLU', name: 'Glucosa', isPanel: false, unit: 'mg/dL', resultType: 'numerico', active: true, version: 3, hasResults: true, components: [],
  ranges: [{ id: 'r-1', sex: 'cualquiera', ageFrom: 18, ageTo: 120, min: 70, max: 100, criticalLow: 40, criticalHigh: 400, validFrom: '2026-01-01', source: 'Ilustrativo' }] };
const hemograma: CatalogExam = { id: 'e-2', code: 'HEMO', name: 'Hemograma', isPanel: true, unit: null, resultType: 'numerico', active: true, version: 1, hasResults: false, components: [{ id: 'e-3', code: 'HB', name: 'Hemoglobina' }], ranges: [] };

function montar(write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = { request: vi.fn(async () => [glucosa, hemograma]), write: vi.fn(write) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<LabCatalogPage api={api} profile={perfil(['catalogo.configurar'])} version={0} />);
  return api;
}

describe('Catálogo de laboratorio (W10)', () => {
  it('edita el máximo normal y envía solo los rangos con la versión del examen', async () => {
    const api = montar();
    const editor = await screen.findByRole('complementary', { name: 'Editar Glucosa' });
    expect((within(editor).getByLabelText('Unidad') as HTMLInputElement).disabled).toBe(true);
    const guardar = within(editor).getByRole('button', { name: 'Guardar examen' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    const maximo = within(editor).getByLabelText('Máximo normal');
    await userEvent.clear(maximo);
    await userEvent.type(maximo, '99');
    await userEvent.click(guardar);
    expect(api.write).toHaveBeenCalledWith('/catalogo/examenes/e-1', { version: 3, ranges: [{ sex: 'cualquiera', ageFrom: 18, ageTo: 120, min: 70, max: 99, criticalLow: 40, criticalHigh: 400, source: 'Ilustrativo' }] }, 'PUT');
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it('un panel muestra sus componentes y no ofrece unidad ni rangos', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Hemograma/ }));
    const editor = await screen.findByRole('complementary', { name: 'Editar Hemograma' });
    expect(within(editor).getByText('HB · Hemoglobina')).toBeTruthy();
    expect(within(editor).queryByLabelText('Unidad')).toBeNull();
    expect(within(editor).queryByText('Rangos de referencia vigentes')).toBeNull();
  });

  it('un conflicto de versión ofrece recargar el catálogo', async () => {
    const api = montar(vi.fn(async () => { throw new ApiError('El examen cambió.', 409, 'version_conflicto', 4); }) as Api['write']);
    const editor = await screen.findByRole('complementary', { name: 'Editar Glucosa' });
    await userEvent.click(within(editor).getByLabelText('Disponible para nuevas órdenes'));
    await userEvent.click(within(editor).getByRole('button', { name: 'Guardar examen' }));
    expect(api.write).toHaveBeenCalledWith('/catalogo/examenes/e-1', { version: 3, active: false }, 'PUT');
    await userEvent.click(await screen.findByRole('button', { name: /Recargar el catálogo/ }));
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it('explica en español qué falta en un rango', () => {
    const base = { sex: 'cualquiera', ageFrom: '18', ageTo: '120', min: '70', max: '100', criticalLow: '', criticalHigh: '', source: 'Guía' };
    expect(rangeFormProblem([base])).toBeNull();
    expect(rangeFormProblem([{ ...base, min: '120' }])).toBe('El mínimo no puede ser mayor que el máximo.');
    expect(rangeFormProblem([{ ...base, ageTo: '10' }])).toBe('La edad final debe ser mayor que la inicial.');
    expect(rangeFormProblem([{ ...base, source: '' }])).toBe('Indica la fuente de cada rango.');
  });
});
