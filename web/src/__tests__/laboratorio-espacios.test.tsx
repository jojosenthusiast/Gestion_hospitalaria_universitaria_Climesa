import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LaboratoryPage } from '../features/laboratory';

afterEach(cleanup);

// Owner obs. lote 3: «no se adapta cuando no hay espacio» and «no hay espacio entre las cards». jsdom cannot measure, so
// these tests pin the structure the CSS relies on: padded controls band, padded body, flexible split with a back control.
const perfil: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'l@example.test', name: 'Lab', roles: ['LAB'], platforms: ['web'], permissions: [{ code: 'laboratorio.ver_cola', context: 'global' }, { code: 'laboratorio.procesar', context: 'global' }], channels: [], patientId: null, staffId: 's' };
const longDoctor = 'Dra. María de los Ángeles Hernández Castellanos de la Fuente';
const orders = [
  { id: 'a', patientName: 'Lucía Fernanda Guardado Pineda', priority: 'rutina', state: 'en_proceso', version: 1, createdAt: '2026-11-18T10:00:00Z', doctorName: longDoctor, allowedActions: ['capturar', 'cancelar'],
    items: [{ id: 'g', code: 'GLU', name: 'Glucosa', unit: 'mg/dL', resultType: 'numerico', result: null, referenceRange: { min: 70, max: 100, criticalLow: 40, criticalHigh: 400 } }] },
  { id: 'b', patientName: 'Paola Estefany Rodríguez Alvarado', priority: 'urgente', state: 'pendiente', version: 1, createdAt: '2026-11-18T09:00:00Z', doctorName: 'Dr. Ficticio', allowedActions: [], items: [{ id: 'h', code: 'HB', name: 'Hemoglobina', result: null }] },
];
const montar = () => render(<LaboratoryPage api={{ request: vi.fn(async () => orders), write: vi.fn() } as unknown as Api} profile={perfil} version={0} />);

describe('laboratorio: espacios y adaptación (obs. lote 3)', () => {
  it('search and filters sit in a padded controls band; the list lives in a padded body', async () => {
    const { container } = montar();
    const lista = await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    const controls = container.querySelector('.lab-controls')!;
    expect(controls).not.toBeNull();
    expect(within(controls as HTMLElement).getByRole('searchbox')).toBeTruthy();
    expect(controls.querySelector('.cl-filter-row')).not.toBeNull();
    expect(lista.closest('.lab-body')).not.toBeNull();
    expect(lista.closest('.lab-controls')).toBeNull();
  });

  it('the split stacks on narrow screens: choosing an order opens its detail with «Volver a la lista»', async () => {
    const { container } = montar();
    await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    const split = container.querySelector('.cl-master-detail.lab-split')!;
    expect(split.classList.contains('is-detail-open')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /Orden de Lucía Fernanda/ }));
    expect(split.classList.contains('is-detail-open')).toBe(true);
    const detalle = screen.getByRole('complementary', { name: /Detalle de la orden de Lucía/ });
    expect(detalle.classList.contains('lab-detail')).toBe(true);
    await userEvent.click(within(detalle).getByRole('button', { name: 'Volver a la lista' }));
    expect(split.classList.contains('is-detail-open')).toBe(false);
  });

  it('a reference range keeps the normal range and the critical limits as two whole lines', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Orden de Lucía Fernanda/ }));
    const fila = screen.getByRole('rowheader', { name: /Glucosa/ }).closest('tr')!;
    expect([...fila.querySelectorAll('.lab-range-part')].map(part => part.textContent)).toEqual(['70–100', 'crítico < 40 o > 400']);
  });

  it('a long doctor name stays on one line with the full name in its tooltip', async () => {
    montar();
    const lista = await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    expect(within(lista).getByTitle(`Pidió: ${longDoctor}`)).toBeTruthy();
  });

  it('«Cancelar orden» is the shared deactivate button', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Orden de Lucía Fernanda/ }));
    expect(screen.getByRole('button', { name: 'Cancelar orden' }).classList.contains('crud-deactivate')).toBe(true);
  });
});
