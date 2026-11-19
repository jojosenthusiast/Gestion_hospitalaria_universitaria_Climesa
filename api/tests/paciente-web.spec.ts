import { createTestApp, TestApp } from './support/app';

jest.setTimeout(120000);

// Lote 5 (owner decision 2026-11-19): the patient also uses the web app; the web shell admits an account by `platforms`.
describe('Lote 5 · el Paciente usa la Web', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(new Date('2026-12-02T18:00:00Z')); });
  afterAll(async () => { await t?.close(); });

  test('GET /auth/me de una cuenta PAC incluye web junto con android e ios', async () => {
    const me = await t.call('PAC', 'GET', '/auth/me');
    expect(me.status).toBe(200);
    expect([...me.body.platforms].sort()).toEqual(['android', 'ios', 'web']);
    expect(me.body.rolePlatforms).toEqual([{ role: 'PAC', platforms: expect.arrayContaining(['android', 'ios', 'web']) }]);
  });

  test('las plataformas de los demás roles no cambian', async () => {
    const rows = (await t.pg.query<{ codigo: string; plataformas: string[] }>("SELECT codigo,plataformas FROM acceso.rol WHERE codigo IN ('MED','REC','DPD') ORDER BY codigo")).rows;
    expect(rows.map(r => ({ codigo: r.codigo, plataformas: [...r.plataformas].sort() }))).toEqual([
      { codigo: 'DPD', plataformas: ['Web'] }, { codigo: 'MED', plataformas: ['Android', 'iOS'] }, { codigo: 'REC', plataformas: ['Android', 'Web'] },
    ]);
  });
});
