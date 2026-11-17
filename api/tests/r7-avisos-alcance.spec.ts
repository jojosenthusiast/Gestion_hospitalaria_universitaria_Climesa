import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
/** Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. */
const NOW = new Date('2026-12-02T15:00:00Z');
const HOUR = 3_600_000;

/** R7 U3, journey D1 (D-2): the composer sees "llega a N personas" before publishing, with the same rule as the stats. */
describe('R7 · avisos: alcance al redactar', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(NOW); });
  afterAll(async () => { await t?.close(); });
  const reach = async (query: string) => (await t.call('JOP', 'GET', `/avisos/alcance${query}`));

  test('D-2: el alcance por rol y área coincide con los destinatarios del aviso ya publicado', async () => {
    const before = await reach('?roles=PAR,DPD');
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ destinatarios: 2 });
    const published = await t.call('JOP', 'POST', '/avisos', { titulo: 'Simulacro de sismo', cuerpo: 'Texto del aviso para el personal.', hasta: new Date(NOW.valueOf() + 30 * 24 * HOUR).toISOString(), publico: false, roles: ['PAR', 'DPD'], nivel: 'importante' });
    expect(published.status).toBe(201);
    const stats = ((await t.call('JOP', 'GET', '/avisos/estadisticas')).body as any[]).find(s => s.avisoId === published.body.id);
    expect(stats.destinatarios).toBe(before.body.destinatarios);
    // D-1: the level alone sets the old priority axis (importante -> urgente) for clients that still read it.
    expect(((await t.call('JOP', 'GET', '/avisos')).body as any[]).find(n => n.id === published.body.id)).toMatchObject({ nivel: 'importante', prioridad: 'urgente' });
  });

  test('D-2: un turno en curso en el área cuenta, y sin destinatarios el alcance es 0', async () => {
    const lab = async () => (await reach('?areas=P1-LAB')).body.destinatarios as number;
    const base = await lab();
    await t.shift('ENF', new Date(NOW.valueOf() - HOUR), new Date(NOW.valueOf() + 3 * HOUR), 'P1-LAB');
    expect(await lab()).toBe(base + 1);
    expect((await reach('')).body).toEqual({ destinatarios: 0 });
  });

  test('D-2: códigos mal formados responden validación en español y solo quien publica consulta el alcance', async () => {
    const bad = await reach('?roles=enf');
    expect([bad.status, bad.body.codigo, bad.body.campo]).toEqual([400, 'validacion', 'roles']);
    expect((await t.call('MED', 'GET', '/avisos/alcance?roles=ENF')).status).toBe(403);
  });
});
