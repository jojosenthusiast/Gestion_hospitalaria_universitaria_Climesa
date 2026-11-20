import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

/**
 * S2 and S3 (parcial 3, RN-02, FR-108-05): two users take the last free bed at the same time. PostgreSQL decides: one
 * assignment wins, the other answers 409 `cama_ocupada` "Otra persona tomó esta cama." and only one occupancy exists.
 */
describe('última cama libre: dos asignaciones simultáneas', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); });
  afterAll(async () => { await t?.close(); });

  const pending = async () => {
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(await t.patient(), { requestedCategory: 'vip', isolation: false }));
    expect(created.status).toBe(201);
    return created.body.id as string;
  };

  test('una gana con 201, la otra recibe 409 cama_ocupada y queda una sola ocupación', async () => {
    // Every other VIP bed is blocked, so VIP-301-A is the last free one of its category.
    await t.pg.query(`INSERT INTO infra.bloqueo_cama(cama_id,periodo,motivo) SELECT id,tstzrange($1::timestamptz - interval '1 hour',NULL,'[)'),'Bloqueo de prueba'
      FROM infra.espacio WHERE tipo='cama' AND codigo LIKE 'VIP-30%' AND codigo<>'VIP-301-A'`, [now]);
    const bed = await t.one<{ id: string; version: number }>("SELECT id,version FROM infra.espacio WHERE codigo='VIP-301-A'");
    const free = await t.one<{ n: number }>("SELECT count(*)::int AS n FROM infra.v_estado_cama WHERE categoria='vip' AND estado='libre'");
    expect(free.n).toBe(1);
    const [first, second] = [await pending(), await pending()];
    const results = await Promise.all([
      t.call('REC', 'POST', `/admisiones/${first}/cama`, { bedId: bed.id, version: bed.version }),
      t.call('JOP', 'POST', `/admisiones/${second}/cama`, { bedId: bed.id, version: bed.version }),
    ]);
    const won = results.filter(r => r.status === 201), lost = results.filter(r => r.status !== 201);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].status).toBe(409);
    expect(lost[0].body).toMatchObject({ codigo: 'cama_ocupada', detail: 'Otra persona tomó esta cama.' });
    const occupancies = await t.one<{ n: number }>('SELECT count(*)::int AS n FROM hospitalizacion.ocupacion_cama WHERE cama_id=$1', [bed.id]);
    expect(occupancies.n).toBe(1);
    const states = (await t.pg.query<{ estado: string }>('SELECT estado FROM hospitalizacion.admision WHERE id = ANY($1::uuid[]) ORDER BY estado', [[first, second]])).rows.map(r => r.estado);
    expect(states).toEqual(['hospitalizado', 'pendiente_cama']);
  });

  test('la restricción de exclusión de la base es la que el filtro traduce a cama_ocupada', async () => {
    const occupied = await t.one<{ cama_id: string; habitacion_id: string }>("SELECT o.cama_id,o.habitacion_id FROM hospitalizacion.ocupacion_cama o JOIN infra.espacio e ON e.id=o.cama_id WHERE e.codigo='VIP-301-A'");
    const loser = await t.one<{ id: string }>("SELECT id FROM hospitalizacion.admision WHERE estado='pendiente_cama' ORDER BY creado_en DESC LIMIT 1");
    const error = await t.pg.query(`INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) VALUES($1,$2,$3,'vip',tstzrange($4::timestamptz,NULL,'[)'))`,
      [loser.id, occupied.cama_id, occupied.habitacion_id, now]).then(() => null, (e: { code?: string; constraint?: string }) => e);
    expect(error).toMatchObject({ code: '23P01', constraint: 'ocupacion_cama_cama_id_periodo_excl' });
  });
});
