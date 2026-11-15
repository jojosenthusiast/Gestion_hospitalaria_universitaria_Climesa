import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const MINUTE = 60_000;
const now = new Date(Math.floor(Date.now() / (20 * MINUTE)) * 20 * MINUTE);

describe('una sola consulta vigente por número de fila (RN-22, retomar sin bifurcar)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); });
  afterAll(async () => { await t?.close(); });

  const calledTicket = async () => {
    const issued = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() });
    expect(issued.status).toBe(201);
    expect((await t.call('AST', 'POST', `/fila/${issued.body.id}/llamar`, { version: issued.body.version })).status).toBe(201);
    const patientId = (await t.one<{ paciente_id: string }>('SELECT paciente_id FROM atencion.ticket_fila WHERE id=$1', [issued.body.id])).paciente_id;
    return { id: issued.body.id as string, patientId };
  };
  const insertConsultation = async (patientId: string, ticketId: string) =>
    t.pg.query(`INSERT INTO atencion.consulta(paciente_id,medico_id,ticket_id,estado,iniciada_en) VALUES($1,$2,$3,'abierta',now())`, [patientId, await t.staffOf('MED'), ticketId]);

  test('la base rechaza una segunda consulta vigente del mismo número aunque la API no lo revise', async () => {
    const ticket = await calledTicket();
    const started = await t.call('MED', 'POST', '/consultas', { ticketId: ticket.id });
    expect(started.status).toBe(201);
    await expect(insertConsultation(ticket.patientId, ticket.id)).rejects.toThrow(/consulta_ticket_unico/);
  });

  test('una consulta ingresada por error no bloquea una nueva consulta del mismo número', async () => {
    const ticket = await calledTicket();
    const started = await t.call('MED', 'POST', '/consultas', { ticketId: ticket.id });
    expect(started.status).toBe(201);
    await t.pg.query(`UPDATE atencion.consulta SET estado='ingresada_por_error',version=version+1 WHERE id=$1`, [started.body.id]);
    const again = await t.call('MED', 'POST', '/consultas', { ticketId: ticket.id });
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(started.body.id);
    expect((await t.one<{ n: number }>(`SELECT count(*)::int AS n FROM atencion.consulta WHERE ticket_id=$1 AND estado<>'ingresada_por_error'`, [ticket.id])).n).toBe(1);
  });

  test('consultas de distintos números y de cita (sin número) no chocan', async () => {
    const first = await calledTicket();
    const second = await calledTicket();
    await insertConsultation(first.patientId, first.id);
    await insertConsultation(second.patientId, second.id);
    expect((await t.one<{ n: number }>(`SELECT count(*)::int AS n FROM atencion.consulta WHERE ticket_id = ANY($1::uuid[])`, [[first.id, second.id]])).n).toBe(2);
  });
});
