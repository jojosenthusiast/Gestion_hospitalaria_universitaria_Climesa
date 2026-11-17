import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);
const now = new Date('2026-11-16T15:00:00Z');

/**
 * U7 (odd/tasks/fase2-recorridos-auditoria.md, G2, gap G-1): `GET /me/vinculacion` also returns what the account
 * declared in its latest request, so a rejected patient can ask again with the form prefilled.
 */
describe('U7 · estado de la vinculación con lo declarado', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.patient({ linkPac: true, name: 'Marta' });
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
  });
  afterAll(async () => { await t?.close(); });

  test('with no request the state is empty and carries no declared data', async () => {
    const res = await t.call('PAC', 'GET', '/me/vinculacion');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: false, request: null });
  });

  test('a rejected request returns its date, reason and the declared DUI and birth to ask again', async () => {
    const sent = await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: '04567891-1', birth: '1990-01-01' });
    expect(sent.status).toBe(201);
    const pending = (await t.call('PAC', 'GET', '/me/vinculacion')).body;
    expect(pending).toEqual({
      linked: false,
      request: { id: sent.body.id, state: 'pendiente', createdAt: now.toISOString(), resolvedAt: null, rejectionReason: null, version: sent.body.version },
      declared: { dui: '04567891-1', birth: '1990-01-01' },
    });
    await t.call('REC', 'POST', `/cuentas/vinculaciones/${sent.body.id}/rechazar`, { version: sent.body.version, reason: 'El DUI no coincide con el expediente' });
    const rejected = (await t.call('PAC', 'GET', '/me/vinculacion')).body;
    expect(rejected.request).toMatchObject({ state: 'rechazada', rejectionReason: 'El DUI no coincide con el expediente' });
    expect(rejected.declared).toEqual({ dui: '04567891-1', birth: '1990-01-01' });
  });

  test('the read is still limited to accounts that link themselves', async () => {
    expect((await t.call('REC', 'GET', '/me/vinculacion')).status).toBe(403);
  });
});

/**
 * Requests store the declared DUI as digits, but seeded or older rows may carry the hyphen ("04567891-1"). Reception must
 * still see one hyphen, find the record and approve; before the fix it showed "04567891--1" and never matched.
 */
describe('vinculación con el DUI declarado guardado con guion', () => {
  let t: TestApp;
  afterAll(async () => { await t?.close(); });

  test('the hyphenated row shows one hyphen, matches its record and can be approved', async () => {
    t = await createTestApp(now);
    const patientId = await t.patient({ name: 'Rosa' });
    await t.pg.query(`INSERT INTO pacientes.identificador(paciente_id,tipo,emisor,valor_original,valor_normalizado,estado,exclusivo)
      VALUES($1,'dui','RNPN','04567891-1','045678911','sin_verificar',true)`, [patientId]);
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
    const row = (await t.pg.query<{ id: string }>(`INSERT INTO acceso.vinculacion_paciente(usuario_id,dui_declarado,nacimiento_declarado,creado_en)
      VALUES($1,'04567891-1','1990-01-01',$2) RETURNING id`, [userId('PAC'), now])).rows[0];

    const list = await t.call('REC', 'GET', '/cuentas/vinculaciones');
    expect(list.status).toBe(200);
    const item = list.body.find((r: any) => r.id === row.id);
    expect(item.declared).toEqual({ dui: '04567891-1', birth: '1990-01-01' });
    expect(item.candidate).toMatchObject({ id: patientId, dui: '04567891-1', exact: true });
    expect((await t.call('PAC', 'GET', '/me/vinculacion')).body.declared).toEqual({ dui: '04567891-1', birth: '1990-01-01' });

    const approved = await t.call('REC', 'POST', `/cuentas/vinculaciones/${row.id}/aprobar`, { version: item.version });
    expect(approved.status).toBeLessThan(300);
    expect((await t.one('SELECT paciente_id FROM acceso.usuario WHERE id=$1', [userId('PAC')])).paciente_id).toBe(patientId);
  });
});
