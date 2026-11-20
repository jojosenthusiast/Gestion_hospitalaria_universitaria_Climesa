import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { MovementDialog } from '../features/inventory/MovementDialog';
import { emptyMovement, validateMovement, type ArticleSummary } from '../features/inventory/model';

// Audit 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T1): inventory movements for LAB.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const who: AccessProfile = { id: 'u-1', user: { id: 'u-1' }, email: 'lab@example.test', name: 'Laboratorio Ficticio', roles: ['LAB'], platforms: ['web'], permissions: [{ code: 'inventario.mover', context: 'x' }], channels: [], patientId: null, staffId: null };
const kit = { id: 'a-1', code: 'DEMO-KIT', name: 'Kit ficticio', type: 'reactivo', unit: 'kit', available: 7, minimum: 1, active: true } as unknown as ArticleSummary;
const lots = [
  { id: 'l-ok', number: 'DL-26-A', expiresAt: '2027-08-31', expired: false, quantity: 2, fefo: true },
  { id: 'l-old', number: 'DEMO-AUD-01', expiresAt: '2020-01-01', expired: true, quantity: 5, fefo: false },
];

function mountMerma() {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/inventario/bodegas') return [{ id: 'w-1', code: 'BOD-LAB', name: 'Bodega de laboratorio' }];
      if (path.startsWith('/inventario/articulos/')) return { id: 'a-1', warehouses: [{ warehouseId: 'w-1', quantity: 7 }], lotList: [] };
      if (path.startsWith('/inventario/lotes')) return lots;
      throw new Error(`ruta inesperada ${path}`);
    }),
    write: vi.fn(async () => ({})),
  };
  render(<MovementDialog api={api as unknown as Api} profile={who} articles={[kit]} allowedTypes={['merma']} initialArticleId="a-1" onClose={() => {}} onSaved={() => {}} />);
}

describe('Inventario · auditoría 2026-11-20', () => {
  it('D111: an entry of an already expired lot is stopped beside its date', () => {
    const entry = { ...emptyMovement('entrada'), articleId: 'a-1', destination: 'w-1', lotNumber: 'DEMO-AUD-01', expiresAt: '2020-01-01', quantity: '5', reason: 'Entrada ficticia' };
    expect(validateMovement(entry, null, '2026-11-20').expiresAt).toMatch(/ya venció/);
    expect(validateMovement({ ...entry, expiresAt: '2027-01-01' }, null, '2026-11-20').expiresAt).toBeUndefined();
  });

  it('D112/D113: a loss suggests the expired lot, and «Cambiar» opens the lot list instead of putting it back', async () => {
    mountMerma();
    await userEvent.selectOptions(await screen.findByLabelText('Bodega de origen'), 'w-1');
    const lot = await screen.findByRole('group', { name: 'Lote' });
    expect(within(lot).getByText('Lote DEMO-AUD-01 · vencido, sugerido para dar de baja')).toBeTruthy();
    await userEvent.click(within(lot).getByRole('button', { name: 'Cambiar' }));
    const options = await screen.findByRole('listbox', { name: 'Lote' });
    await userEvent.click(within(options).getByRole('option', { name: /DL-26-A/ }));
    expect(within(await screen.findByRole('group', { name: 'Lote' })).getByText(/^Lote DL-26-A/)).toBeTruthy();
  });
});
