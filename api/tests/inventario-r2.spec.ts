import { createTestApp, TestApp } from './support/app';
import { fefo, movementFields, scopeOf, stockStatus } from '../src/inventory/inventory.rules';

jest.setTimeout(240000);
const start = new Date('2026-11-14T16:00:00Z');

describe('inventario r2 · reglas puras', () => {
  test('el alcance sale del contexto del permiso mover', () => {
    expect(scopeOf(['x'])).toMatchObject({ articleTypes: null });
    expect(scopeOf(['reactivos'])).toMatchObject({ articleTypes: ['reactivo'] });
    expect(scopeOf(['consumo'])).toEqual({ articleTypes: ['insumo', 'equipo_menor'], movementTypes: ['consumo'] });
    expect(scopeOf([], true).articleTypes).toBeNull();
  });
  test('estado: inactivo, agotado, bajo mínimo, por vencer, ok', () => {
    const base = { active: true, available: 50, minimum: 10, expiringSoon: 0 };
    expect(stockStatus({ ...base, active: false })).toBe('inactivo');
    expect(stockStatus({ ...base, available: 0 })).toBe('agotado');
    expect(stockStatus({ ...base, available: 9 })).toBe('bajo_minimo');
    expect(stockStatus({ ...base, expiringSoon: 5 })).toBe('por_vencer');
    expect(stockStatus(base)).toBe('ok');
  });
  test('FEFO ordena por vencimiento y deja los lotes sin fecha al final', () => {
    const order = fefo([{ number: 'C', expiresAt: null }, { number: 'B', expiresAt: '2027-05-01' }, { number: 'A', expiresAt: '2027-01-01' }]).map(l => l.number);
    expect(order).toEqual(['A', 'B', 'C']);
  });
  test('cada tipo pide solo sus campos', () => {
    expect(movementFields('entrada')).toMatchObject({ origin: false, destination: true, newLot: true });
    expect(movementFields('traslado')).toMatchObject({ origin: true, destination: true });
    expect(movementFields('merma')).toMatchObject({ origin: true, destination: false, patient: false });
    expect(movementFields('consumo').patient).toBe(true);
  });
});

describe('inventario r2 · maestro-detalle, lotes y flujo guiado', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });
  const wh = async (code: string) => (await t.one<{ id: string }>('SELECT id FROM infra.espacio WHERE codigo=$1', [code])).id;
  async function article(type: string, minimum = 0) {
    const code = `R2-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const created = await t.call('JOP', 'POST', '/inventario/articulos', { code, name: `Artículo ficticio ${code}`, type, unit: 'unidad', minimum });
    expect(created.status).toBe(201);
    return created.body.id as string;
  }
  const entry = async (articleId: string, lotNumber: string, quantity: number, expiresAt?: string, role = 'JOP') =>
    t.call(role, 'POST', '/inventario/movimientos', { type: 'entrada', articleId, lotNumber, expiresAt, destinationWarehouseId: await wh('BOD-CEN'), quantity, reason: 'Compra ficticia recibida' });

  test('una entrada con lote nuevo lo crea y una segunda suma al mismo lote', async () => {
    const id = await article('insumo', 5);
    expect((await entry(id, 'lt-1', 10, '2027-06-30')).status).toBe(201);
    expect((await entry(id, 'LT-1', 5, '2027-06-30')).status).toBe(201);
    expect((await entry(id, 'LT-1', 5, '2028-01-01')).status).toBe(409);
    const detail = await t.call('JOP', 'GET', `/inventario/articulos/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.lotList).toHaveLength(1);
    expect(detail.body.lotList[0]).toMatchObject({ number: 'LT-1', expiresAt: '2027-06-30', total: 15 });
    expect(detail.body.warehouses).toEqual([expect.objectContaining({ warehouseCode: 'BOD-CEN', quantity: 15 })]);
    expect(detail.body.movements).toHaveLength(2);
    expect(detail.body).toMatchObject({ available: 15, status: 'ok' });
  });

  test('la lista marca agotado, bajo mínimo y por vencer', async () => {
    const low = await article('insumo', 20); await entry(low, 'B-1', 5, '2027-12-31');
    const soon = await article('insumo', 1); await entry(soon, 'S-1', 5, '2026-12-01');
    const empty = await article('insumo', 1);
    const list = (await t.call('JOP', 'GET', '/inventario/articulos')).body as { id: string; status: string }[];
    const status = (id: string) => list.find(a => a.id === id)?.status;
    expect(status(low)).toBe('bajo_minimo');
    expect(status(soon)).toBe('por_vencer');
    expect(status(empty)).toBe('agotado');
  });

  test('el laboratorio solo ve reactivos y enfermería solo consume insumos', async () => {
    const reagent = await article('reactivo'); const supply = await article('insumo');
    await entry(reagent, 'R-1', 4, '2027-03-01'); await entry(supply, 'I-1', 4, '2027-03-01');
    const lab = (await t.call('LAB', 'GET', '/inventario/articulos')).body as { id: string; type: string }[];
    expect(lab.length).toBeGreaterThan(0);
    expect(new Set(lab.map(a => a.type))).toEqual(new Set(['reactivo']));
    const nurse = (await t.call('ENF', 'GET', '/inventario/articulos')).body as { id: string; type: string }[];
    expect(nurse.some(a => a.type === 'reactivo')).toBe(false);
    expect((await t.call('LAB', 'GET', `/inventario/articulos/${supply}`)).status).toBe(404);
    expect((await t.call('ENF', 'GET', `/inventario/articulos/${supply}`)).body.allowedMovements).toEqual(['consumo']);
    expect((await t.call('LAB', 'GET', `/inventario/articulos/${reagent}`)).body.allowedMovements).toEqual(expect.arrayContaining(['entrada', 'merma']));
    expect((await entry(supply, 'I-2', 1, undefined, 'LAB')).status).toBe(403);
    expect((await entry(reagent, 'R-2', 1, undefined, 'ENF')).status).toBe(403);
    const lot = (await t.call('ENF', 'GET', `/inventario/lotes?articleId=${supply}&warehouseId=${await wh('BOD-CEN')}`)).body[0];
    const base = { lotId: lot.id, originWarehouseId: await wh('BOD-CEN'), quantity: 1, reason: 'Consumo en el área ficticia' };
    expect((await t.call('ENF', 'POST', '/inventario/movimientos', { ...base, type: 'salida' })).status).toBe(403);
    expect((await t.call('ENF', 'POST', '/inventario/movimientos', { ...base, type: 'consumo' })).status).toBe(201);
    expect((await t.call('LAB', 'POST', '/inventario/movimientos', { ...base, type: 'consumo' })).status).toBe(403);
  });

  test('los lotes llegan en orden FEFO, filtrados por bodega, y el vencido no se ofrece', async () => {
    const id = await article('insumo');
    await entry(id, 'LATE', 3, '2027-09-01'); await entry(id, 'EARLY', 3, '2027-02-01');
    await t.pg.query("INSERT INTO inventario.lote(articulo_id,numero,vence) SELECT $1,'OLD','2026-01-01'", [id]);
    await t.pg.query("INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) SELECT l.id,$2,2 FROM inventario.lote l WHERE l.articulo_id=$1 AND l.numero='OLD'", [id, await wh('BOD-CEN')]);
    const lots = (await t.call('JOP', 'GET', `/inventario/lotes?articleId=${id}&warehouseId=${await wh('BOD-CEN')}`)).body;
    expect(lots.map((l: any) => l.number)).toEqual(['EARLY', 'LATE']);
    expect(lots.map((l: any) => l.fefo)).toEqual([true, false]);
    expect((await t.call('JOP', 'GET', `/inventario/lotes?articleId=${id}&warehouseId=${await wh('BOD-LAB')}`)).body).toEqual([]);
    const withOld = (await t.call('JOP', 'GET', `/inventario/lotes?articleId=${id}&includeExpired=true`)).body;
    expect(withOld.map((l: any) => l.number)).toEqual(['OLD', 'EARLY', 'LATE']);
  });

  test('un lote vencido no se consume pero sí se da de baja con merma', async () => {
    const id = await article('insumo');
    await t.pg.query("INSERT INTO inventario.lote(articulo_id,numero,vence) VALUES($1,'OLD','2026-01-01')", [id]);
    const lot = await t.one<{ id: string }>("SELECT id FROM inventario.lote WHERE articulo_id=$1", [id]);
    const bodega = await wh('BOD-CEN');
    await t.pg.query('INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,4)', [lot.id, bodega]);
    const body = { lotId: lot.id, originWarehouseId: bodega, quantity: 4, reason: 'Lote vencido retirado' };
    expect((await t.call('JOP', 'POST', '/inventario/movimientos', { ...body, type: 'consumo' })).status).toBe(409);
    expect((await t.call('JOP', 'POST', '/inventario/movimientos', { ...body, type: 'merma' })).status).toBe(201);
    expect(Number((await t.one<{ cantidad: string }>('SELECT cantidad FROM inventario.existencia WHERE lote_id=$1', [lot.id])).cantidad)).toBe(0);
  });

  test('el traslado exige una bodega real y el paciente solo va en el consumo', async () => {
    const id = await article('insumo'); await entry(id, 'T-1', 5, '2027-05-05');
    const lot = (await t.call('JOP', 'GET', `/inventario/lotes?articleId=${id}`)).body[0];
    const origin = await wh('BOD-CEN');
    const room = (await t.one<{ id: string }>("SELECT id FROM infra.espacio WHERE tipo<>'bodega' LIMIT 1")).id;
    const move = (extra: object) => t.call('JOP', 'POST', '/inventario/movimientos', { lotId: lot.id, quantity: 1, reason: 'Movimiento de prueba', ...extra });
    expect((await move({ type: 'traslado', originWarehouseId: origin, destinationWarehouseId: room })).status).toBe(400);
    expect((await move({ type: 'traslado', originWarehouseId: origin, destinationWarehouseId: await wh('BOD-LAB') })).status).toBe(201);
    expect((await move({ type: 'merma', originWarehouseId: origin, patientId: '00000000-0000-4000-8000-000000000001' })).status).toBe(400);
  });

  test('lotes: crear, editar con versión, no dar de baja con existencia y eliminar artículo solo sin historial', async () => {
    const id = await article('insumo');
    const created = await t.call('JOP', 'POST', `/inventario/articulos/${id}/lotes`, { number: 'x-9', expiresAt: '2027-10-10' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ number: 'X-9', expiresAt: '2027-10-10', active: true, version: 1 });
    expect((await t.call('JOP', 'POST', `/inventario/articulos/${id}/lotes`, { number: 'X-9' })).status).toBe(409);
    const stale = await t.call('JOP', 'PUT', `/inventario/lotes/${created.body.id}`, { number: 'X-9', expiresAt: '2027-11-11', version: 9, reason: 'Corrección de la fecha' });
    expect(stale.status).toBe(409);
    const edited = await t.call('JOP', 'PUT', `/inventario/lotes/${created.body.id}`, { number: 'X-9', expiresAt: '2027-11-11', version: 1, reason: 'Corrección de la fecha' });
    expect(edited.body).toMatchObject({ expiresAt: '2027-11-11', version: 2 });
    await t.pg.query('INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,3)', [created.body.id, await wh('BOD-CEN')]);
    expect((await t.call('JOP', 'PUT', `/inventario/lotes/${created.body.id}`, { number: 'X-9', active: false, version: 2, reason: 'Baja del lote en prueba' })).status).toBe(409);
    expect((await t.call('JOP', 'DELETE', `/inventario/articulos/${id}`, {})).status).toBe(409);
    const fresh = await article('insumo');
    const gone = await t.call('JOP', 'DELETE', `/inventario/articulos/${fresh}`, {});
    expect(gone.status).toBe(200);
    expect(gone.body).toEqual({ id: fresh, deleted: true });
    expect((await t.call('ENF', 'DELETE', `/inventario/articulos/${id}`, {})).status).toBe(403);
  });
});
