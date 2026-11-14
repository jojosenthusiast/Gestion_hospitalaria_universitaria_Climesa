import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { InventoryPage } from '../features/inventory';
import { articleExport, daysUntil, emptyFilters, expiryText, filterArticles, gaugePercent, movementBody, movementTypesFor, emptyMovement, sortArticles, validateMovement, type ArticleDetail, type ArticleSummary } from '../features/inventory/model';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const article = (patch: Partial<ArticleSummary>): ArticleSummary => ({ id: 'a-1', code: 'PAR-1', name: 'Paracetamol 500 mg', type: 'insumo', unit: 'tableta', minimum: 100, active: true, version: 1, available: 300, expired: 0, expiringSoon: 0, nextExpiry: '2027-08-31', lots: 1, status: 'ok', ...patch });
const rows: ArticleSummary[] = [
  article({}),
  article({ id: 'a-2', code: 'CREA', name: 'Reactivo de creatinina', type: 'reactivo', unit: 'kit', minimum: 4, available: 2, status: 'bajo_minimo', nextExpiry: '2027-01-31' }),
  article({ id: 'a-3', code: 'TUBO', name: 'Tubo de muestra', type: 'reactivo', unit: 'unidad', minimum: 10, available: 0, status: 'agotado', nextExpiry: null }),
  article({ id: 'a-4', code: 'SUERO', name: 'Suero oral', type: 'insumo', unit: 'sobre', minimum: 10, available: 50, expiringSoon: 20, status: 'por_vencer', nextExpiry: '2026-11-30' }),
];
const detail: ArticleDetail = { ...rows[0], lotList: [
  { id: 'l-1', number: 'DL-26-A', expiresAt: '2027-08-31', active: true, version: 1, expired: false, total: 300, warehouses: [{ warehouseId: 'w-1', warehouseCode: 'BOD-CEN', warehouseName: 'Bodega central', quantity: 300 }] },
], warehouses: [{ warehouseId: 'w-1', warehouseCode: 'BOD-CEN', warehouseName: 'Bodega central', quantity: 300 }],
movements: [{ id: 'm-1', type: 'consumo', lotNumber: 'DL-26-A', quantity: 20, reason: 'Consumo ficticio', originWarehouseCode: 'BOD-CEN', destinationWarehouseCode: null, authorName: 'Enfermera Ficticia', registeredAt: '2026-11-13T15:00:00Z' }] };

describe('inventario · modelo', () => {
  it('busca sin tildes, filtra por categoría y estado y ordena por urgencia', () => {
    expect(filterArticles(rows, { ...emptyFilters, query: 'creatinína'.replace('í', 'i') }).map(a => a.id)).toEqual(['a-2']);
    expect(filterArticles(rows, { ...emptyFilters, types: ['reactivo'] }).map(a => a.id)).toEqual(['a-2', 'a-3']);
    expect(filterArticles(rows, { ...emptyFilters, statuses: ['agotado', 'por_vencer'] }).map(a => a.id)).toEqual(['a-3', 'a-4']);
    expect(sortArticles(rows, 'estado').map(a => a.id)).toEqual(['a-3', 'a-2', 'a-4', 'a-1']);
    expect(sortArticles(rows, 'vencimiento').map(a => a.id)).toEqual(['a-4', 'a-2', 'a-1', 'a-3']);
  });
  it('el medidor llena hasta el doble del mínimo', () => {
    expect(gaugePercent({ available: 100, minimum: 100 })).toBe(50);
    expect(gaugePercent({ available: 500, minimum: 100 })).toBe(100);
    expect(gaugePercent({ available: 0, minimum: 100 })).toBe(0);
  });
  it('cuenta los días hasta el vencimiento', () => {
    expect(daysUntil('2026-11-20', '2026-11-14')).toBe(6);
    expect(expiryText('2026-11-10', '2026-11-14')).toBe('Venció hace 4 días');
    expect(expiryText('2026-11-14', '2026-11-14')).toBe('Vence hoy');
    expect(expiryText(null, '2026-11-14')).toBe('No vence');
  });
  it('solo el traslado pide destino, y la entrada pide lote nuevo en lugar de lote existente', () => {
    const base = { ...emptyMovement('consumo'), articleId: 'a-1', origin: 'w-1', lotId: 'l-1', quantity: '2', reason: 'Consumo ficticio' };
    expect(movementBody(base)).toEqual({ type: 'consumo', quantity: 2, reason: 'Consumo ficticio', lotId: 'l-1', originWarehouseId: 'w-1' });
    expect(validateMovement(base, null)).toEqual({});
    const entry = { ...emptyMovement('entrada'), articleId: 'a-1', destination: 'w-1', lotNumber: ' L-9 ', expiresAt: '2027-01-01', quantity: '5', reason: 'Compra ficticia' };
    expect(movementBody(entry)).toEqual({ type: 'entrada', quantity: 5, reason: 'Compra ficticia', articleId: 'a-1', lotNumber: 'L-9', expiresAt: '2027-01-01', destinationWarehouseId: 'w-1' });
    expect(validateMovement({ ...entry, lotNumber: '' }, null).lotNumber).toBeDefined();
    expect(validateMovement({ ...emptyMovement('traslado'), articleId: 'a-1', origin: 'w-1', destination: 'w-1', lotId: 'l-1', quantity: '1', reason: 'Traslado ficticio' }, null).destination).toMatch(/otra bodega/);
  });
  it('rechaza más de lo disponible en el lote y la cantidad negativa fuera del ajuste', () => {
    const lot = { id: 'l-1', number: 'A', expiresAt: null, expired: false, quantity: 3, fefo: true };
    const form = { ...emptyMovement('merma'), articleId: 'a-1', origin: 'w-1', lotId: 'l-1', quantity: '4', reason: 'Se rompió el frasco' };
    expect(validateMovement(form, lot).quantity).toMatch(/Solo hay 3/);
    expect(validateMovement({ ...form, quantity: '-1' }, lot).quantity).toMatch(/mayor que cero/);
    expect(validateMovement({ ...form, type: 'ajuste', quantity: '-1' }, lot).quantity).toBeUndefined();
  });
  it('cada rol ve solo los movimientos de su contexto', () => {
    expect(movementTypesFor([{ code: 'inventario.mover', context: 'x' }])).toEqual(['entrada', 'consumo', 'traslado', 'ajuste', 'merma']);
    expect(movementTypesFor([{ code: 'inventario.mover', context: 'reactivos' }])).toContain('merma');
    expect(movementTypesFor([{ code: 'inventario.mover', context: 'consumo' }])).toEqual(['consumo']);
    expect(movementTypesFor([{ code: 'inventario.ver', context: 'x' }])).toEqual([]);
  });
  it('la exportación lleva lo que se ve', () => {
    const table = articleExport(rows.slice(0, 1), 'Insumos');
    expect(table.columns).toContain('Existencia');
    expect(table.rows[0].slice(0, 3)).toEqual(['PAR-1', 'Paracetamol 500 mg', 'Insumo']);
  });
});

const profile = (permissions: [string, string][]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'u@example.test', name: 'Persona ficticia', roles: ['JOP'], platforms: ['web'], permissions: permissions.map(([code, context]) => ({ code, context })), channels: [], patientId: null, staffId: null });
function mount(who: AccessProfile) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/inventario/articulos') return rows;
      if (path.startsWith('/inventario/articulos/')) return detail;
      if (path === '/inventario/bodegas') return [{ id: 'w-1', code: 'BOD-CEN', name: 'Bodega central' }, { id: 'w-2', code: 'BOD-LAB', name: 'Bodega de laboratorio' }];
      if (path.startsWith('/inventario/lotes')) return [{ id: 'l-1', number: 'DL-26-A', expiresAt: '2027-08-31', expired: false, quantity: 300, fefo: true }];
      throw new Error(`ruta inesperada ${path}`);
    }),
    write: vi.fn(async () => ({})),
  };
  render(<InventoryPage api={api as unknown as Api} profile={who} version={0} />);
  return api;
}
const jop = () => profile([['inventario.ver', 'x'], ['inventario.mover', 'x'], ['inventario.configurar', 'x']]);

describe('inventario · maestro-detalle', () => {
  it('lista artículos con estado y resumen, y al elegir uno muestra lotes, bodegas e historial', async () => {
    mount(jop());
    expect(await screen.findByText('Reactivo de creatinina')).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'Resumen por estado' })).getByRole('button', { name: /Agotado/ }).textContent).toContain('1');
    await userEvent.click(screen.getByRole('button', { name: /Paracetamol 500 mg/ }));
    const detailPane = await screen.findByRole('region', { name: 'Detalle del artículo' });
    expect((await within(detailPane).findAllByText('DL-26-A')).length).toBeGreaterThan(0);
    expect(within(detailPane).getByText(/Bodega central/)).toBeTruthy();
    expect(within(detailPane).getByText('Consumo ficticio')).toBeTruthy();
    expect(within(detailPane).getByRole('button', { name: 'Editar artículo' })).toBeTruthy();
    expect(within(detailPane).getByRole('button', { name: 'Nuevo lote' })).toBeTruthy();
  });

  it('filtra mientras se escribe, muestra chips y «Quitar filtros»', async () => {
    mount(jop());
    await screen.findByText('Suero oral');
    await userEvent.type(screen.getByLabelText('Buscar artículo'), 'creatin');
    expect(screen.queryByText('Suero oral')).toBeNull();
    expect(screen.getByText('Reactivo de creatinina')).toBeTruthy();
    expect(screen.getByText(/Búsqueda: creatin/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(screen.getByText('Suero oral')).toBeTruthy();
  });

  it('enfermería no ve acciones de configuración y solo ofrece consumo', async () => {
    mount(profile([['inventario.ver', 'x'], ['inventario.mover', 'consumo']]));
    await screen.findByText('Suero oral');
    expect(screen.queryByRole('button', { name: 'Nuevo artículo' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar movimiento' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button', { pressed: true }).map(b => b.textContent)).toEqual([expect.stringContaining('Consumo')]);
    expect(within(dialog).queryByRole('button', { name: /Traslado/ })).toBeNull();
  });
});

describe('inventario · flujo guiado de movimientos', () => {
  it('la entrada pide lote nuevo y bodega destino, no bodega de origen', async () => {
    mount(jop());
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar movimiento' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Entrada/ }));
    expect(within(dialog).getByLabelText('Número de lote')).toBeTruthy();
    expect(within(dialog).getByLabelText('Llega a la bodega')).toBeTruthy();
    expect(within(dialog).queryByLabelText(/Bodega de origen/)).toBeNull();
    await userEvent.click(within(dialog).getByRole('button', { name: /Traslado/ }));
    expect(within(dialog).getByLabelText('Sale de la bodega')).toBeTruthy();
    expect(within(dialog).getByLabelText('Va a la bodega')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Número de lote')).toBeNull();
  });

  it('el consumo sugiere el lote que vence primero y envía solo lo que ese tipo necesita', async () => {
    const api = mount(jop());
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500 mg/ }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Registrar movimiento' }))[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/PAR-1 · Paracetamol 500 mg/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: /Consumo/ }));
    await userEvent.selectOptions(await within(dialog).findByLabelText('Bodega de origen'), 'w-1');
    expect(await within(dialog).findByText(/Lote DL-26-A · sugerido/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Cantidad'), '400');
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Consumo ficticio');
    await userEvent.click(within(dialog).getByRole('button', { name: /Guardar movimiento/ }));
    expect(await within(dialog).findByText(/Solo hay 300/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.clear(within(dialog).getByLabelText('Cantidad'));
    await userEvent.type(within(dialog).getByLabelText('Cantidad'), '20');
    await userEvent.click(within(dialog).getByRole('button', { name: /Guardar movimiento/ }));
    expect(api.write).toHaveBeenCalledWith('/inventario/movimientos', { type: 'consumo', quantity: 20, reason: 'Consumo ficticio', lotId: 'l-1', originWarehouseId: 'w-1' }, 'POST');
  });
});
