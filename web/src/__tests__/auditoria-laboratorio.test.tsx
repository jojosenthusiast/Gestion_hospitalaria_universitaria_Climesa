import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LaboratoryPage, impossibleValue } from '../features/laboratory';

// Audit 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T1): laboratory for LAB.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ''; });

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'x@example.test', name: 'Cuenta Ficticia', roles: [], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const glucose = { id: 'i-glu', code: 'GLU', name: 'Glucosa', unit: 'mg/dL', resultType: 'numerico', result: null, referenceRange: { min: 70, max: 100, criticalLow: 40, criticalHigh: 400 } };
const order = (over: Record<string, unknown> = {}) => ({ id: 'o-1', patientName: 'Ana Menéndez Ficticia', patientRecord: '000123', doctorName: 'Dra. Ejemplo', priority: 'rutina', state: 'en_proceso', version: 4, createdAt: '2026-12-02T14:00:00Z', sampleTakenAt: '2026-12-02T14:20:00Z', items: [glucose], allowedActions: ['capturar'], ...over });
const mount = (rows: unknown[], write = vi.fn()) => {
  const api = { request: vi.fn(async () => rows), write } as unknown as Api;
  render(<LaboratoryPage api={api} profile={perfil(['laboratorio.ver_cola', 'laboratorio.procesar', 'laboratorio.validar'])} version={0} />);
  return write;
};

describe('Laboratorio · auditoría 2026-11-20', () => {
  it('D103: a negative glucose is refused in place and does not save', async () => {
    mount([order()]);
    await userEvent.type(await screen.findByLabelText('Glucosa (mg/dL)'), '-5');
    await userEvent.tab();
    expect(screen.getByText('El valor no puede ser negativo.')).toBeTruthy();
    expect(screen.queryByText('Crítico')).toBeNull();
    expect((screen.getByRole('button', { name: /^Guardar/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(impossibleValue(-5, { min: -10, max: 10, criticalLow: null, criticalHigh: null })).toBe(false);
  });

  it('D102: a name that only misses its accents says so, and confirming stays off', async () => {
    mount([order({ state: 'pendiente', sampleTakenAt: null, allowedActions: ['tomar_muestra'] })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Tomar muestra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar identidad para toma de muestra' });
    await userEvent.type(within(dialog).getByLabelText('Número de expediente'), '000123');
    await userEvent.type(within(dialog).getByLabelText('Nombre completo'), 'ana menendez ficticia');
    expect(within(dialog).getByText('Coincide salvo las tildes: escríbelo con tildes, como en el expediente.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Confirmar identidad' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('D104: after a correction its own message replaces the old one and the standing note', async () => {
    const done = order({ state: 'completado', items: [{ ...glucose, result: { value: 88, mark: 'normal' } }], allowedActions: ['enmendar'], amendedAt: '2026-12-02T14:50:00Z' });
    const write = mount([done], vi.fn(async () => ({})));
    expect(await screen.findByRole('note')).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: /Corregir resultado/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Corregir Glucosa' });
    const value = within(dialog).getByLabelText(/Valor corregido/);
    await userEvent.clear(value);
    await userEvent.type(value, '90');
    await userEvent.type(within(dialog).getByLabelText('Motivo de la corrección'), 'Error de transcripción');
    await userEvent.click(within(dialog).getByRole('button', { name: /Guardar corrección/ }));
    expect(write).toHaveBeenCalled();
    expect(await screen.findByText(/^Se corrigió Glucosa; el valor anterior queda en el historial\./)).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('D105: changing a filter with the detail open goes back to the filtered list', async () => {
    mount([order(), order({ id: 'o-2', patientName: 'Luis Otro Ficticio', patientRecord: '000999' })]);
    const row = (await screen.findAllByText('Luis Otro Ficticio'))[0].closest<HTMLElement>('.lab-row')!;
    await userEvent.click(row);
    const split = document.querySelector('.lab-split')!;
    expect(split.classList.contains('is-detail-open')).toBe(true);
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar órdenes' }), 'ana');
    expect(split.classList.contains('is-detail-open')).toBe(false);
  });

  it('D110: typing lists matching orders under the search, never a «texto» chip; picking opens that order', async () => {
    mount([order(), order({ id: 'o-2', patientName: 'Luis Otro Ficticio', patientRecord: '000999' })]);
    await userEvent.type(await screen.findByRole('combobox', { name: 'Buscar órdenes' }), 'luis');
    const list = screen.getByRole('listbox', { name: 'Coincidencias de buscar órdenes' });
    expect(within(list).getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByText('«luis»')).toBeNull();
    await userEvent.click(within(list).getByRole('option', { name: /Luis Otro Ficticio/ }));
    expect(screen.getByRole('complementary', { name: 'Detalle de la orden de Luis Otro Ficticio' })).toBeTruthy();
  });
});
