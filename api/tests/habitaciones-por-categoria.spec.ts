import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);

/**
 * S1 (parcial 3, 20261130002000): PostgreSQL, not only the seed, keeps the 5 VIP rooms (nivel 3, capacidad 1) and the
 * 6 semi-private rooms (nivel 2, capacidad 2). The API answers each rejection with its business code and Spanish text.
 */
describe('habitaciones VIP y semiprivadas garantizadas por la base', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(new Date()); });
  afterAll(async () => { await t?.close(); });

  const area = async (code: string) => (await t.one<{ id: string }>('SELECT id FROM infra.espacio WHERE codigo=$1', [code])).id;
  const room = (parent: string, code: string, category: string, capacity: number, level: number) =>
    t.pg.query("INSERT INTO infra.espacio(padre_id,tipo,codigo,nombre,categoria,capacidad,nivel) VALUES($1,'habitacion',$2,$2,$3,$4,$5)", [parent, code, category, capacity, level]);
  const rejected = (work: Promise<unknown>) => work.then(() => 'aceptado', (e: { code?: string; message?: string }) => `${e.code} ${e.message?.split(' ')[0]}`);
  const active = async (category: string) => (await t.one<{ n: number }>("SELECT count(*)::int AS n FROM infra.espacio WHERE tipo='habitacion' AND activo AND categoria=$1", [category])).n;

  test('la semilla queda exactamente en el límite: 5 VIP y 6 semiprivadas activas, 17 camas', async () => {
    expect(await active('vip')).toBe(5);
    expect(await active('semiprivada')).toBe(6);
    const beds = await t.one<{ n: number }>("SELECT count(*)::int AS n FROM infra.espacio c JOIN infra.espacio h ON h.id=c.padre_id WHERE c.tipo='cama' AND c.activo AND h.categoria IS NOT NULL");
    expect(beds.n).toBe(17);
  });

  test('no entra una sexta VIP ni una séptima semiprivada', async () => {
    expect(await rejected(room(await area('P3-VIP'), 'VIP-306', 'vip', 1, 3))).toBe('P0001 limite_habitaciones_vip');
    expect(await rejected(room(await area('P2-HOS'), 'HAB-207', 'semiprivada', 2, 2))).toBe('P0001 limite_habitaciones_semiprivadas');
    expect(await active('vip')).toBe(5);
    expect(await active('semiprivada')).toBe(6);
  });

  test('una VIP solo vive en la planta 3 con una cama; una semiprivada solo en la planta 2 con hasta dos', async () => {
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET nivel=2 WHERE codigo='VIP-301'"))).toBe('P0001 habitacion_fuera_de_planta');
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET nivel=3 WHERE codigo='HAB-201'"))).toBe('P0001 habitacion_fuera_de_planta');
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET capacidad=2 WHERE codigo='VIP-301'"))).toBe('P0001 capacidad_de_categoria');
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET capacidad=3 WHERE codigo='HAB-201'"))).toBe('P0001 capacidad_de_categoria');
    // Changing category moves the room into a full category.
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET categoria='vip',capacidad=1,nivel=3 WHERE codigo='HAB-206'"))).toMatch(/^P0001 (limite_habitaciones_vip|capacidad_menor_que_camas)$/);
  });

  test('al desactivar una VIP, otra puede ocupar su lugar; reactivar la primera vuelve a pasar el límite', async () => {
    await t.pg.query("UPDATE infra.espacio SET activo=false WHERE codigo='VIP-305-A'");
    await t.pg.query("UPDATE infra.espacio SET activo=false WHERE codigo='VIP-305'");
    expect(await rejected(room(await area('P3-VIP'), 'VIP-306', 'vip', 1, 3))).toBe('aceptado');
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET activo=true WHERE codigo='VIP-305'"))).toBe('P0001 limite_habitaciones_vip');
    // Editing an active room without changing its category does not count it twice.
    expect(await rejected(t.pg.query("UPDATE infra.espacio SET nombre='VIP 306 renovada' WHERE codigo='VIP-306'"))).toBe('aceptado');
    expect(await active('vip')).toBe(5);
  });

  test('la API traduce el rechazo a 409 con código y mensaje en español', async () => {
    const parentId = await area('P2-HOS');
    const created = await t.call('ADM', 'POST', '/espacios', { type: 'habitacion', code: 'HAB-207', name: 'HAB-207', parentId, category: 'semiprivada', capacity: 2, level: 2 });
    expect(created.status).toBe(409);
    expect(created.body).toMatchObject({ codigo: 'limite_habitaciones_semiprivadas', detail: 'El hospital ya tiene sus 6 habitaciones semiprivadas activas.' });
    const tree = (await t.call('ADM', 'GET', '/espacios')).body as any[];
    const vip = tree.find(n => n.code === 'VIP-302');
    const moved = await t.call('ADM', 'PATCH', `/espacios/${vip.id}`, { code: vip.code, name: vip.name, type: vip.type, parentId: vip.parentId, category: vip.category, capacity: vip.capacity, level: 2, version: vip.version, reason: 'Mover de planta de prueba' });
    expect(moved.status).toBe(409);
    expect(moved.body).toMatchObject({ codigo: 'habitacion_fuera_de_planta', detail: 'Las habitaciones VIP van en la planta 3 y las semiprivadas en la planta 2.' });
  });
});
