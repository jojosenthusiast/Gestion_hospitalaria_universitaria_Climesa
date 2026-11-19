import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { InventoryPage } from '../features/inventory';
import { articleExport, daysUntil, warehouseNames, quantityText, emptyFilters, expiryText, filterArticles, gaugePercent, movementBody, movementTypesFor, emptyMovement, sortArticles, validateMovement, type ArticleDetail, type ArticleSummary } from '../features/inventory/model';

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
movements: [
  { id: 'm-1', type: 'consumo', lotNumber: 'DL-26-A', quantity: 20, reason: 'Consumo ficticio', originWarehouseCode: 'BOD-CEN', destinationWarehouseCode: null, authorName: 'Enfermera Ficticia', registeredAt: '2026-11-13T15:00:00Z' },
  { id: 'm-2', type: 'traslado', lotNumber: 'DL-26-A', quantity: 5, reason: 'Traslado ficticio', originWarehouseCode: 'BOD-CEN', destinationWarehouseCode: 'BOD-LAB', authorName: 'Jefe Ficticio', registeredAt: '2026-11-12T15:00:00Z' },
] };

describe('inventario · modelo', () => {
  it('la cantidad lleva la unidad en plural salvo con 1, y las abreviaturas no cambian', () => {
    expect(quantityText(0, 'caja')).toBe('0 cajas');
    expect(quantityText(1, 'tableta')).toBe('1 tableta');
    expect(quantityText(260, 'Tableta')).toBe('260 Tabletas');
    expect(quantityText(4, 'unidad')).toBe('4 unidades');
    expect(quantityText(2, 'kit')).toBe('2 kits');
    expect(quantityText(3, 'frasco')).toBe('3 frascos');
    expect(quantityText(1.5, 'ml')).toBe('1.5 ml');
  });

  it('busca sin tildes, filtra por categoría y estado y ordena por urgencia', () => {
    expect(filterArticles(rows, { ...emptyFilters, query: 'creatinína'.replace('í', 'i') }).map(a => a.id)).toEqual(['a-2']);
    expect(filterArticles(rows, { ...emptyFilters, types: ['reactivo'] }).map(a => a.id)).toEqual(['a-2', 'a-3']);
    expect(filterArticles(rows, { ...emptyFilters, statuses: ['agotado', 'por_vencer'] }).map(a => a.id)).toEqual(['a-3', 'a-4']);
    expect(sortArticles(rows, 'estado').map(a => a.id)).toEqual(['a-3', 'a-2', 'a-4', 'a-1']);
    expect(sortArticles(rows, 'vencimiento').map(a => a.id)).toEqual(['a-4', 'a-2', 'a-1', 'a-3']);
  });
  // Owner obs. 10: inactive articles stay out of the list until «Mostrar inactivos» is checked.
  it('oculta los inactivos salvo con «Mostrar inactivos»', () => {
    const withInactive = [...rows, article({ id: 'a-9', code: 'OLD', name: 'Guante viejo', active: false, status: 'inactivo' })];
    expect(filterArticles(withInactive, emptyFilters).map(a => a.id)).not.toContain('a-9');
    expect(filterArticles(withInactive, { ...emptyFilters, showInactive: true }).map(a => a.id)).toContain('a-9');
  });
  it('resuelve el nombre de la bodega por su código y deja el código si no lo conoce', () => {
    const names = warehouseNames(detail, [{ id: 'w-2', code: 'BOD-LAB', name: 'Bodega de laboratorio' }]);
    expect(names.get('BOD-CEN')).toBe('Bodega central');
    expect(names.get('BOD-LAB')).toBe('Bodega de laboratorio');
    expect(names.get('BOD-X')).toBeUndefined();
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
    expect(within(screen.getByRole('group', { name: 'Filtrar por estado' })).getByRole('button', { name: /Agotado/ }).textContent).toContain('1');
    await userEvent.click(screen.getByRole('button', { name: /Paracetamol 500 mg/ }));
    const detailPane = await screen.findByRole('region', { name: 'Detalle del artículo' });
    expect((await within(detailPane).findAllByText('DL-26-A')).length).toBeGreaterThan(0);
    expect(within(detailPane).getAllByText('Bodega central').length).toBeGreaterThan(0);
    expect(within(detailPane).getByText('Consumo ficticio')).toBeTruthy();
    expect(within(detailPane).getByRole('button', { name: 'Editar artículo' })).toBeTruthy();
    expect(within(detailPane).getByRole('button', { name: 'Nuevo lote' })).toBeTruthy();
  });

  // S13 (T10w, W2): the header keeps the only primary action; the article detail no longer repeats it as primary.
  it('con un artículo abierto hay una sola acción principal en la pantalla', async () => {
    mount(jop());
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500 mg/ }));
    await screen.findByRole('region', { name: 'Detalle del artículo' });
    expect([...document.querySelectorAll('.primary-button')].map(b => b.textContent)).toEqual(['Registrar movimiento']);
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

  it('el Administrador ve y configura todo el inventario, sin ofrecer movimientos (MA-REQ-01, D-091)', async () => {
    mount(profile([['inventario.ver', 'x'], ['inventario.configurar', 'x']]));
    await screen.findByText('Suero oral');
    // Fase 2, S1: sin descripción en la cabecera; el alcance del inventario queda en la ruta compacta.
    expect(screen.getByText(/· Todas las categorías, solo consulta y configuración$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nuevo artículo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar movimiento' })).toBeNull();
  });
});

// Owner obs. 10: one status filter, export with the page actions, CRUD colors, warehouse names and movement detail.
describe('inventario · observación 10', () => {
  it('el estado se filtra solo con las tarjetas de conteo; el panel no lo repite y ofrece «Mostrar inactivos»', async () => {
    mount(jop());
    await screen.findByText('Suero oral');
    await userEvent.click(within(screen.getByRole('group', { name: 'Filtrar por estado' })).getByRole('button', { name: /Agotado/ }));
    expect(screen.queryByText('Suero oral')).toBeNull();
    expect(screen.getByText('Tubo de muestra')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Filtros/ }));
    const panel = document.getElementById('inv-filters')!;
    expect(within(panel).queryByText('Estado')).toBeNull();
    expect(within(panel).queryByRole('button', { name: /Agotado|Bajo mínimo|En orden/ })).toBeNull();
    expect(within(panel).getByRole('checkbox', { name: /Mostrar inactivos/ })).toBeTruthy();
  });

  it('exportar vive en la cabecera y «Nuevo artículo» es el botón de crear', async () => {
    mount(profile([['inventario.ver', 'x'], ['inventario.configurar', 'x']]));
    await screen.findByText('Suero oral');
    expect(within(screen.getByRole('region', { name: 'Artículos' })).queryByRole('button', { name: /Exportar/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nuevo artículo' }).className).toContain('crud-create');
  });

  it('el detalle usa los colores de crear, editar y desactivar, y el lote se edita con el lápiz', async () => {
    mount(jop());
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500 mg/ }));
    const pane = await screen.findByRole('region', { name: 'Detalle del artículo' });
    await within(pane).findByRole('button', { name: 'Editar artículo' });
    expect(within(pane).getByRole('button', { name: 'Editar artículo' }).className).toContain('crud-edit');
    expect(within(pane).getByRole('button', { name: 'Nuevo lote' }).className).toContain('crud-create');
    expect(within(pane).getByRole('button', { name: 'Desactivar' }).className).toContain('crud-deactivate');
    const lotEdit = within(pane).getByRole('button', { name: 'Editar lote DL-26-A' });
    expect(lotEdit.className).toContain('crud-icon');
    expect(within(pane).getByRole('combobox', { name: 'Tipo' }).closest('.select-field')).toBeTruthy();
  });

  it('el historial muestra nombres de bodega y abre el detalle del movimiento', async () => {
    mount(jop());
    await userEvent.click(await screen.findByRole('button', { name: /Paracetamol 500 mg/ }));
    const pane = await screen.findByRole('region', { name: 'Detalle del artículo' });
    const history = within(pane).getByRole('region', { name: 'Historial de movimientos' });
    expect(await within(history).findByText('Bodega de laboratorio')).toBeTruthy();
    await userEvent.click(within(history).getAllByRole('button', { name: /Ver detalle del movimiento/ })[1]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Bodega central (BOD-CEN)')).toBeTruthy();
    expect(within(dialog).getByText('Bodega de laboratorio (BOD-LAB)')).toBeTruthy();
    expect(within(dialog).getByText('Traslado ficticio')).toBeTruthy();
    expect(within(dialog).getByText('Jefe Ficticio')).toBeTruthy();
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
