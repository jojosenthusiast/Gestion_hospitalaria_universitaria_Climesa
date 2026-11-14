import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('Fase 0 · fila y eventos sin datos ajenos para pacientes (SEG-01, SEG-05)', () => {
  let t: TestApp;
  const pac = () => `usuario:${userId('PAC')}`;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });
  const unlink = () => t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);

  test('SEG-01: un PAC sin expediente vinculado recibe [] de la fila, nunca los números de otros', async () => {
    await unlink();
    const other = await t.patient({ name: 'Ajena' });
    expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: other })).status).toBe(201);
    const list = await t.call('PAC', 'GET', '/fila');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  });

  test('SEG-01: un PAC vinculado ve solo su número', async () => {
    const own = await t.patient({ linkPac: true, name: 'Propia' });
    const ticket = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: own });
    expect(ticket.status).toBe(201);
    const list = await t.call('PAC', 'GET', '/fila');
    expect(list.body.map((row: any) => row.patientId)).toEqual([own]);
    await unlink();
  });

  test('SEG-05: fila.actualizada de otro paciente no llega a rol:PAC', async () => {
    const other = await t.patient();
    const ticket = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: other });
    const [channels] = await t.events('fila.actualizada', ticket.body.id);
    expect(channels).not.toContain('rol:PAC');
    expect(channels).not.toContain(pac());
    expect(channels).toContain('rol:REC');
  });

  test('SEG-05: el resultado crítico no llega al paciente antes de la revisión médica', async () => {
    const own = await t.patient({ linkPac: true, name: 'Critica' });
    const consultation = await t.consultation(own);
    const exam = await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'");
    const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [exam.id] });
    expect(order.status).toBe(201);
    const identity = await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [own]);
    const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente: identity.expediente, nombreCompleto: 'Critica Ficticio' });
    expect(sample.status).toBe(201);
    const item = await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [order.body.id]);
    expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: item.id, value: 5.0 })).status).toBe(201);
    const critical = await t.events('laboratorio.critico', order.body.id);
    expect(critical).toHaveLength(1);
    expect(critical[0]).not.toContain(pac());
    expect(critical[0]).not.toContain('rol:PAC');
    expect(critical[0]).toContain('rol:MED');
    const before = await t.events('laboratorio.actualizado', order.body.id);
    for (const channels of before) expect(channels).not.toContain(pac());
    const completed = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/completar`, { version: sample.body.version + 1 /* API-10: the captured result moved it */ });
    expect(completed.status).toBe(201);
    const reviewed = await t.call('MED', 'POST', `/laboratorio/ordenes/${order.body.id}/revisar`, { version: completed.body.version });
    expect(reviewed.status).toBe(201);
    const after = await t.events('laboratorio.actualizado', order.body.id);
    expect(after.at(-1)).toContain(pac());
    expect(after.at(-1)).not.toContain('rol:PAC');
    await unlink();
  });

  test('SEG-05: la consulta abierta no avisa al paciente; la firma sí, y nunca a rol:PAC', async () => {
    const own = await t.patient({ linkPac: true, name: 'Consulta' });
    const consultation = await t.consultation(own);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 80 })).status).toBe(201);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/diagnosticos`, { code: 'J06.9' })).status).toBe(201);
    const draft = await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Dolor de garganta', plan: 'Reposo e hidratación' });
    expect(draft.status).toBe(200);
    const open = await t.events('consulta.actualizada', consultation.id);
    for (const channels of open) { expect(channels).not.toContain(pac()); expect(channels).not.toContain('rol:PAC'); }
    const signed = await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: draft.body.version });
    expect(signed.status).toBe(201);
    const last = (await t.events('consulta.actualizada', consultation.id)).at(-1)!;
    expect(last).toContain(pac());
    expect(last).not.toContain('rol:PAC');
    await unlink();
  });
});
