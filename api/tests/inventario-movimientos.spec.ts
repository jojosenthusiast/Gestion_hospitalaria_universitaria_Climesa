import { createTestApp, TestApp } from './support/app';
import { alertExcludedContexts, crossesBelowMinimum, subtracts } from '../src/inventory/inventory.rules';

jest.setTimeout(240000);
const start = new Date('2026-11-14T16:00:00Z');

describe('111 · reglas puras de inventario', () => {
  test('el ajuste negativo resta; la entrada y el ajuste positivo suman (API-15)', () => {
    expect(subtracts('ajuste', -2)).toBe(true);
    expect(subtracts('ajuste', 2)).toBe(false);
    expect(subtracts('consumo', 1)).toBe(true);
    expect(subtracts('entrada', 1)).toBe(false);
  });
  test('la alerta solo salta al cruzar el mínimo (RN-37)', () => {
    expect(crossesBelowMinimum(11, 9, 10)).toBe(true);
    expect(crossesBelowMinimum(9, 8, 10)).toBe(false);
    expect(crossesBelowMinimum(11, 10, 10)).toBe(false);
    expect(crossesBelowMinimum(1, 0, 0)).toBe(false);
  });
  test('el laboratorio solo recibe la alerta de reactivos', () => {
    expect(alertExcludedContexts('reactivo')).toEqual(['consumo']);
    expect(alertExcludedContexts('insumo')).toEqual(['consumo', 'reactivos']);
  });
});

describe('111 · movimientos y alerta de mínimo', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });

  /** Fresh article with one lot holding `quantity` units in the given warehouse. */
  async function article(type: string, minimum: number, quantity: number, warehouse = 'BOD-CEN') {
    const code = `T-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const created = await t.call('JOP', 'POST', '/inventario/articulos', { code, name: `Artículo ficticio ${code}`, type, unit: 'unidad', minimum });
    expect(created.status).toBe(201);
    const lot = await t.one<{ id: string }>("INSERT INTO inventario.lote(articulo_id,numero,vence) VALUES($1,'L-1','2027-12-31') RETURNING id", [created.body.id]);
    const bodega = await t.one<{ id: string }>('SELECT id FROM infra.espacio WHERE codigo=$1', [warehouse]);
    await t.pg.query('INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,$3)', [lot.id, bodega.id, quantity]);
    return { articleId: created.body.id as string, version: created.body.version as number, lotId: lot.id, warehouseId: bodega.id };
  }
  const stock = async (lotId: string) => Number((await t.one<{ cantidad: string }>('SELECT cantidad FROM inventario.existencia WHERE lote_id=$1', [lotId])).cantidad);

  test('escenario 1: con 5 unidades, dos salidas de 4 dejan pasar una y rechazan la otra', async () => {
    const a = await article('insumo', 0, 5);
    const exit = () => t.call('JOP', 'POST', '/inventario/movimientos', { type: 'salida', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: 4, reason: 'Salida a sala ficticia' });
    const results = await Promise.all([exit(), exit()]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await stock(a.lotId)).toBe(1);
  });

  test('API-15: el ajuste negativo resta, no deja saldo negativo y el historial lo muestra con signo', async () => {
    const a = await article('insumo', 0, 5);
    const down = await t.call('JOP', 'POST', '/inventario/movimientos', { type: 'ajuste', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: -3, reason: 'Conteo físico con faltante' });
    expect(down.status).toBe(201);
    expect(down.body.quantity).toBe(-3);
    expect(await stock(a.lotId)).toBe(2);
    expect((await t.call('JOP', 'POST', '/inventario/movimientos', { type: 'ajuste', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: -3, reason: 'Conteo que dejaría negativo' })).body.codigo).toBe('existencia_insuficiente');
    expect((await t.call('JOP', 'POST', '/inventario/movimientos', { type: 'ajuste', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: 4, reason: 'Conteo físico con sobrante' })).status).toBe(201);
    expect(await stock(a.lotId)).toBe(6);
    expect((await t.call('JOP', 'POST', '/inventario/movimientos', { type: 'salida', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: -1, reason: 'Salida con cantidad negativa' })).status).toBe(400);
    expect((await t.call('JOP', 'POST', '/inventario/movimientos', { type: 'ajuste', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: 0, reason: 'Ajuste sin cantidad' })).status).toBe(400);
    const history = await t.call('JOP', 'GET', '/inventario/movimientos');
    const mine = history.body.filter((m: any) => m.lotId === a.lotId).map((m: any) => Number(m.quantity)).sort();
    expect(mine).toEqual([-3, 4]);
  });

  test('escenario 2: mínimo 10 y 11 unidades, consumir 2 avisa a Operaciones (no a enfermería) una sola vez', async () => {
    const a = await article('insumo', 10, 11);
    const consume = (quantity: number) => t.call('ENF', 'POST', '/inventario/movimientos', { type: 'consumo', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity, reason: 'Curación en planta' });
    expect((await consume(2)).status).toBe(201);
    const alerts = await t.events('inventario.bajo_minimo', a.articleId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain('rol:JOP');
    expect(alerts[0]).not.toContain('rol:LAB');
    expect(alerts[0]).not.toContain('rol:ENF');
    expect((await consume(1)).status).toBe(201);
    expect(await t.events('inventario.bajo_minimo', a.articleId)).toHaveLength(1);
    const rows = (await t.call('JOP', 'GET', '/inventario/existencias')).body.filter((r: any) => r.articulo_id === a.articleId);
    expect(rows[0].bajo_minimo).toBe(true);
  });

  test('FR-111-06: un reactivo bajo el mínimo también avisa al laboratorio', async () => {
    const a = await article('reactivo', 5, 5, 'BOD-LAB');
    expect((await t.call('LAB', 'POST', '/inventario/movimientos', { type: 'consumo', lotId: a.lotId, originWarehouseId: a.warehouseId, quantity: 1, reason: 'Corrida de control' })).status).toBe(201);
    expect((await t.events('inventario.bajo_minimo', a.articleId))[0]).toEqual(expect.arrayContaining(['rol:JOP', 'rol:LAB']));
  });

  test('subir el mínimo por encima de la existencia también avisa', async () => {
    const a = await article('insumo', 2, 5);
    const edited = await t.call('JOP', 'PUT', `/inventario/articulos/${a.articleId}`, { code: `E-${a.articleId.slice(0, 6)}`, name: 'Artículo ficticio editado', type: 'insumo', unit: 'unidad', minimum: 8, version: a.version, reason: 'Nuevo mínimo por consumo alto' });
    expect(edited.status).toBe(200);
    expect(await t.events('inventario.bajo_minimo', a.articleId)).toHaveLength(1);
  });
});
