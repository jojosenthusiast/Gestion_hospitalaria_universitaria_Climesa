import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

/** Owner observation 11: Administración publishes, edits and withdraws notices like Jefatura de Operaciones. */
describe('avisos · Administración publica avisos', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });

  test('ADM tiene avisos.publicar en la base', async () => {
    const rows = (await t.pg.query<{ contexto: string }>("SELECT contexto FROM acceso.rol_permiso WHERE rol_codigo='ADM' AND permiso_codigo='avisos.publicar'")).rows;
    expect(rows).toEqual([{ contexto: 'x' }]);
  });

  test('ADM publica, ve la lista con sus acciones y retira; un rol sin el permiso sigue rechazado', async () => {
    const hasta = new Date(start.valueOf() + 24 * 3600_000).toISOString();
    const created = await t.call('ADM', 'POST', '/avisos', { titulo: 'Mantenimiento del sistema', cuerpo: 'El sistema se actualiza esta noche.', hasta, publico: false, roles: ['JOP'], nivel: 'informativo' });
    expect(created.status).toBe(201);
    const listed = ((await t.call('ADM', 'GET', '/avisos')).body as any[]).find(a => a.id === created.body.id);
    expect(listed).toMatchObject({ titulo: 'Mantenimiento del sistema', allowedActions: expect.arrayContaining(['editar', 'retirar']) });
    expect((await t.call('ADM', 'GET', '/avisos/estadisticas')).status).toBe(200);
    const withdrawn = await t.call('ADM', 'POST', `/avisos/${created.body.id}/retirar`, { version: listed.version, motivo: 'Se publicó por error en la prueba.' });
    expect(withdrawn.status).toBe(201);
    expect((await t.call('REC', 'POST', '/avisos', { titulo: 'No debe salir', cuerpo: 'Recepción no publica.', hasta })).status).toBe(403);
  });
});
