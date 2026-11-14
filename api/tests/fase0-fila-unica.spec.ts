import { businessDate } from '../src/platform/clock';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('Fase 0 · un número activo por paciente, servicio y día (W-07)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); });
  afterAll(async () => { await t?.close(); });

  test('un segundo número activo del mismo paciente y servicio responde 409 ticket_activo_existente', async () => {
    const patientId = await t.patient();
    const first = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
    expect(first.status).toBe(201);
    const second = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
    expect(second.status).toBe(409);
    expect(second.body.codigo).toBe('ticket_activo_existente');
    const other = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId });
    expect(other.status).toBe(201);
  });

  test('la base impide el duplicado aunque la API no lo revise', async () => {
    const patientId = await t.patient();
    expect((await t.call('REC', 'POST', '/fila', { service: 'admisiones', patientId })).status).toBe(201);
    await expect(t.pg.query("INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id) VALUES('admisiones',$1::date,999,$2)", [businessDate(now), patientId]))
      .rejects.toThrow(/ticket_fila_activo_unico/);
  });

  test('cuando el número anterior terminó, el paciente puede volver a la fila', async () => {
    const patientId = await t.patient();
    const first = await t.call('REC', 'POST', '/fila', { service: 'emergencia', patientId });
    expect((await t.call('REC', 'POST', `/fila/${first.body.id}/no-se-presento`, { version: first.body.version, reason: 'No respondió a tres llamados' })).status).toBe(201);
    expect((await t.call('REC', 'POST', '/fila', { service: 'emergencia', patientId })).status).toBe(201);
  });
});
