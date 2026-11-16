import { createTestApp, TestApp } from './support/app';
import { scopeOf } from '../src/inventory/inventory.rules';

jest.setTimeout(240000);
const start = new Date('2026-11-14T16:00:00Z');

/** MA-REQ-01 y MA-REQ-02 (D-05, D-091): el control de recursos del Administrador es inventario + edificio; `recursos.*` se retira. */
describe('MA-REQ-01 · control de recursos del Administrador', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });

  test('configurar el inventario no da movimientos: el alcance de mover sale solo de inventario.mover', () => {
    expect(scopeOf([], true)).toEqual({ articleTypes: null, movementTypes: [] });
    expect(scopeOf(['x'], true).movementTypes.length).toBeGreaterThan(0);
  });

  test('el Administrador ve el inventario que configura, sin ofrecerle movimientos que el servidor rechaza', async () => {
    const code = `ADM-${Date.now()}`;
    const created = await t.call('ADM', 'POST', '/inventario/articulos', { code, name: `Artículo ficticio ${code}`, type: 'insumo', unit: 'unidad', minimum: 5 });
    expect(created.status).toBe(201);
    const list = await t.call('ADM', 'GET', '/inventario/articulos');
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).some(a => a.id === created.body.id)).toBe(true);
    const detail = await t.call('ADM', 'GET', `/inventario/articulos/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.allowedMovements).toEqual([]);
    expect((await t.call('ADM', 'GET', '/inventario/existencias')).status).toBe(200);
    expect((await t.call('ADM', 'POST', '/inventario/movimientos', { type: 'consumo', articleId: created.body.id, quantity: 1, reason: 'Prueba de permiso' })).status).toBe(403);
  });

  test('D-050: el Administrador ve movimientos sin paciente ni motivo libre; quien mueve sí los ve', async () => {
    const code = `ADM-MOV-${Date.now()}`;
    const article = await t.call('JOP', 'POST', '/inventario/articulos', { code, name: `Artículo ficticio ${code}`, type: 'insumo', unit: 'unidad', minimum: 1 });
    const warehouse = (await t.one<{ id: string }>("SELECT id FROM infra.espacio WHERE codigo='BOD-CEN'")).id;
    const entry = await t.call('JOP', 'POST', '/inventario/movimientos', { type: 'entrada', articleId: article.body.id, lotNumber: `L-${code}`, expiresAt: '2027-12-31', destinationWarehouseId: warehouse, quantity: 10, reason: 'Compra ficticia recibida' });
    expect(entry.status).toBe(201);
    const mine = (rows: any[]) => rows.filter(m => m.articleCode === code);
    const adm = mine((await t.call('ADM', 'GET', '/inventario/movimientos')).body);
    expect(adm).toHaveLength(1);
    expect(adm[0]).toMatchObject({ type: 'entrada', reason: null, patientId: null });
    expect(Number(adm[0].quantity)).toBe(10);
    const detail = await t.call('ADM', 'GET', `/inventario/articulos/${article.body.id}`);
    expect(detail.body.movements[0]).toMatchObject({ type: 'entrada', reason: null });
    expect(mine((await t.call('JOP', 'GET', '/inventario/movimientos')).body)[0].reason).toBe('Compra ficticia recibida');
  });

  test('los permisos del módulo de equipo médico ya no existen en la base', async () => {
    const rows = await t.pg.query("SELECT codigo FROM acceso.permiso WHERE codigo LIKE 'recursos.%'");
    expect(rows.rows).toEqual([]);
  });
});
