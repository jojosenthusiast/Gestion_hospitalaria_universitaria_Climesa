import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { LaboratoryPage, labProgress } from '../features/laboratory';

// WEB-12: Laboratorio (W20/W21) — flujo feliz, conflicto 409, permisos y sin UUID visible (WEB-11).
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const ORDER = '0a1b2c3d-1111-2222-3333-444455556666';
const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'lab@example.test', name: 'Laboratorio Ficticio', roles: ['LAB'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const resultado = { value: 13.2, mark: 'normal', version: 1 };
const orden = (state: string, over: Record<string, unknown> = {}, captured = true) => ({ id: ORDER, patientName: 'Paciente Ficticio Dos', priority: 'urgente', state, version: 4, createdAt: '2026-11-13T15:00:00Z', items: [{ id: 'i-1', code: 'HB', name: 'Hemoglobina', resultType: 'numerico', result: captured ? resultado : null }], ...over });

function montar(permissions: string[], state = 'en_proceso', write: Api['write'] = vi.fn(async () => ({})) as Api['write'], order: unknown = orden(state)) {
  const api = { request: vi.fn(async () => [order]), write: vi.fn(write) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<LaboratoryPage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}

describe('Laboratorio (W20, W21)', () => {
  it('lista la orden con prioridad y fecha, sin mostrar su identificador interno', async () => {
    montar(['laboratorio.ver_cola']);
    expect((await screen.findAllByText('Paciente Ficticio Dos')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Urgente').length).toBeGreaterThan(0);
    expect(screen.queryByText(ORDER)).toBeNull();
  });

  it('completa una orden en proceso con su versión y recarga la cola', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.procesar'], 'en_proceso', undefined, orden('en_proceso', { allowedActions: ['capturar', 'completar'] }));
    // R7 C1: while capturing, the sheet's single primary action completes (nothing left to save).
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar y completar (1)' }));
    expect(api.write).toHaveBeenCalledWith(`/laboratorio/ordenes/${ORDER}/completar`, { version: 4 }, 'POST');
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it('sin laboratorio.procesar no ofrece tomar muestra ni completar', async () => {
    montar(['laboratorio.ver_cola'], 'pendiente');
    await screen.findAllByText('Paciente Ficticio Dos');
    expect(screen.queryByRole('button', { name: /Tomar muestra|Completar/ })).toBeNull();
  });

  it('un 409 de versión al completar ofrece recargar la orden', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.procesar'], 'en_proceso', vi.fn(async () => { throw new ApiError('La orden cambió.', 409, 'version_conflicto', 5); }) as Api['write'], orden('en_proceso', { allowedActions: ['capturar', 'completar'] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar y completar (1)' }));
    await userEvent.click(await screen.findByRole('button', { name: /Recargar la orden/ }));
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });

  it('muestra un avance de seis pasos y marca cuál es el actual', async () => {
    montar(['laboratorio.ver_cola'], 'en_proceso', undefined, orden('en_proceso', { sampleTakenAt: '2026-11-13T15:30:00Z' }, false));
    const pasos = await screen.findByRole('list', { name: /Avance de la orden de Paciente Ficticio Dos/ });
    expect(within(pasos).getAllByRole('listitem').map(li => li.textContent?.replace(/^\d/, ''))).toEqual(['Solicitada', 'Muestra tomada', 'En Proceso · ahora', 'Completada', 'Revisada por médico', 'Visible al paciente']);
    expect(within(pasos).getByText('En Proceso · ahora').closest('li')?.getAttribute('aria-current')).toBe('step');
  });

  it('dice quién actúa ahora en cada estado', async () => {
    montar(['laboratorio.ver_cola'], 'pendiente');
    expect(await screen.findByText(/Ahora: Laboratorio/)).toBeTruthy();
    cleanup();
    montar(['laboratorio.ver_cola'], 'completado', undefined, orden('completado', { completedAt: '2026-11-13T16:00:00Z' }));
    expect(await screen.findByText(/Ahora: Medicina/)).toBeTruthy();
    expect(screen.getByText('Completada · falta revisión médica')).toBeTruthy();
  });

  it('una orden completada sin revisar se ve como pendiente de revisar para quien revisa y se libera con su versión', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.revisar'], 'completado', undefined, orden('completado', { completedAt: '2026-11-13T16:00:00Z', reviewedAt: null, allowedActions: ['revisar'] }));
    expect(await screen.findByText('Pendiente de revisar')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Revisar y liberar' }));
    // Sweep #12: release is irreversible, so it confirms with what the patient will see first.
    const dialogo = await screen.findByRole('dialog', { name: 'Revisar y liberar al paciente' });
    expect(within(dialogo).getByText('Hemoglobina 13.2')).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Liberar resultados' }));
    expect(api.write).toHaveBeenCalledWith(`/laboratorio/ordenes/${ORDER}/revisar`, { version: 4, followUp: true }, 'POST');
    expect(await screen.findByText(/Resultados liberados: Paciente Ficticio Dos ya los ve/)).toBeTruthy();
  });

  it('revisada: todos los pasos hechos y el paciente ya puede verla', async () => {
    montar(['laboratorio.ver_cola'], 'completado', undefined, orden('completado', { reviewedAt: '2026-11-13T17:00:00Z' }));
    expect(await screen.findByText('Revisada · visible al paciente')).toBeTruthy();
    expect(labProgress(orden('completado', { reviewedAt: 'x' }) as never).current).toBe(-1);
  });

  it('muestra qué falta para completar: todos los valores; sin ellos no deja completar', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.procesar'], 'en_proceso', undefined, orden('en_proceso', { allowedActions: ['capturar'] }, false));
    const guardar = await screen.findByRole('button', { name: 'Guardar resultados (0)' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /^Completar/ })).toBeNull();
    expect(screen.getByText('0 de 1 con valor')).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });

  it('cancela una orden pendiente con motivo y versión, solo con laboratorio.cancelar', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.cancelar'], 'pendiente', undefined, orden('pendiente', { allowedActions: ['cancelar'] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar orden' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar orden de laboratorio' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), 'Duplicada por error');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar orden' }));
    expect(api.write).toHaveBeenCalledWith(`/laboratorio/ordenes/${ORDER}/cancelar`, { version: 4, reason: 'Duplicada por error' }, 'POST');
    cleanup();
    montar(['laboratorio.ver_cola'], 'pendiente');
    await screen.findAllByText('Paciente Ficticio Dos');
    expect(screen.queryByRole('button', { name: 'Cancelar orden' })).toBeNull();
  });

  it('?accion=muestra abre la toma de muestra de la orden pendiente', async () => {
    location.hash = '#/laboratorio?accion=muestra';
    montar(['laboratorio.ver_cola', 'laboratorio.procesar'], 'pendiente', undefined, orden('pendiente', { allowedActions: ['tomar_muestra', 'cancelar'] }));
    expect(await screen.findByRole('dialog', { name: 'Confirmar identidad para toma de muestra' })).toBeTruthy();
    expect(location.hash).toBe('#/laboratorio');
    location.hash = '';
  });
  it('MA-LAB-01: guarda un resultado con la versión vigente de la orden', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.procesar'], 'en_proceso', undefined, orden('en_proceso', { allowedActions: ['capturar'] }, false));
    await userEvent.type(await screen.findByLabelText('Hemoglobina'), '13.4');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar resultados (1)' }));
    expect(api.write).toHaveBeenCalledWith(`/laboratorio/ordenes/${ORDER}/resultados/lote`, { version: 4, items: [{ orderItemId: 'i-1', value: 13.4 }] }, 'POST');
  });

  it('MA-LAB-02: corrige un resultado ya liberado con motivo y avisa que vuelve a revisión', async () => {
    const api = montar(['laboratorio.ver_cola', 'laboratorio.validar'], 'completado', undefined, orden('completado', { reviewedAt: '2026-11-13T17:00:00Z', allowedActions: ['enmendar'] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Corregir resultado' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Corregir Hemoglobina' });
    expect(within(dialogo).getByText(/El paciente deja de ver los valores/)).toBeTruthy();
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar corrección' }) as HTMLButtonElement;
    await userEvent.clear(within(dialogo).getByLabelText(/Valor corregido/));
    await userEvent.type(within(dialogo).getByLabelText(/Valor corregido/), '12.1');
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la corrección'), 'Error');
    expect(guardar.disabled).toBe(true);
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la corrección'), ' de digitación');
    await userEvent.click(guardar);
    expect(api.write).toHaveBeenCalledWith(`/laboratorio/ordenes/${ORDER}/enmendar`, { orderItemId: 'i-1', version: 4, value: 12.1, reason: 'Error de digitación' }, 'POST');
  });

  it('una orden con un resultado corregido dice que espera revisión otra vez y no ofrece acciones que el servidor no permite', async () => {
    montar(['laboratorio.ver_cola', 'laboratorio.procesar', 'laboratorio.cancelar'], 'completado', undefined, orden('completado', { amendedAt: '2026-11-13T18:00:00Z', reviewedAt: null, allowedActions: [] }));
    expect(await screen.findByText('Resultado corregido · falta revisión médica')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Corregir resultado|Cancelar orden|Completar|Revisar y liberar/ })).toBeNull();
  });
});
