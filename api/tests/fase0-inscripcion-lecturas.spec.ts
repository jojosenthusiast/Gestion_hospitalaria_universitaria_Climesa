import { randomUUID } from 'node:crypto';
import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('Fase 0 · inscripción vigente, consultas firmadas y lecturas auditadas (API-02, SEG-07, SEG-02)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); });
  afterAll(async () => { await t?.close(); });

  const draft = async (id: string, version: number) => {
    const saved = await t.call('MED', 'PATCH', `/consultas/${id}`, { version, reason: 'Cefalea de tres días', plan: 'Analgésico y control' });
    expect(saved.status).toBe(200);
    return saved.body.version as number;
  };
  const item = { medication: 'Acetaminofén 500 mg', dose: '1 tableta', route: 'oral', frequency: 'cada 8 horas', duration: '3 días' };
  const hospitalized = async () => {
    const created = await t.call('REC', 'POST', '/admisiones', { patientId: await t.patient(), origin: 'emergencia', originId: randomUUID(), requestedCategory: 'vip', isolation: false, attendingDoctorId: await t.staffOf('MED') });
    const bed = await t.one<{ id: string; version: number }>("SELECT id,version FROM infra.espacio WHERE codigo='VIP-301-A'");
    expect((await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);
    return created.body.id as string;
  };

  test('API-02: sin inscripción vigente no se firma, no se receta ni se firma el alta', async () => {
    const consultation = await t.consultation(await t.patient());
    const version = await draft(consultation.id, consultation.version);
    const sign = await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version });
    expect(sign.status).toBe(409);
    expect(sign.body.codigo).toBe('inscripcion_no_vigente');
    const prescription = await t.call('MED', 'POST', `/consultas/${consultation.id}/receta`, { items: [item] });
    expect(prescription.status).toBe(409);
    expect(prescription.body.codigo).toBe('inscripcion_no_vigente');
    const admission = await hospitalized();
    const discharge = await t.call('MED', 'POST', `/admisiones/${admission}/alta`, { type: 'medica', summary: 'Evolución favorable sin complicaciones' });
    expect(discharge.status).toBe(409);
    expect(discharge.body.codigo).toBe('inscripcion_no_vigente');

    await t.enroll('MED');
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/receta`, { items: [item] })).status).toBe(201);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version })).status).toBe(201);
    expect((await t.call('MED', 'POST', `/admisiones/${admission}/alta`, { type: 'medica', summary: 'Evolución favorable sin complicaciones' })).status).toBe(201);
  });

  test('SEG-07: el paciente no ve su consulta mientras no esté firmada', async () => {
    const own = await t.patient({ linkPac: true });
    const consultation = await t.consultation(own);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 72 })).status).toBe(201);
    expect((await t.call('PAC', 'GET', `/consultas/${consultation.id}/detalle`)).status).toBe(404);
    const version = await draft(consultation.id, consultation.version);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version })).status).toBe(201);
    const detail = await t.call('PAC', 'GET', `/consultas/${consultation.id}/detalle`);
    expect(detail.status).toBe(200);
    expect(detail.body.vitalSigns).toHaveLength(1);
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
  });

  test('SEG-02: el detalle, la agenda, las citas y la fila dejan auditoría de lectura', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    expect((await t.call('MED', 'GET', `/consultas/${consultation.id}/detalle`)).status).toBe(200);
    expect((await t.audits('consulta.leer')).some(row => row.paciente_id === patientId)).toBe(true);
    expect((await t.call('MED', 'GET', '/consultas/agenda')).status).toBe(200);
    expect((await t.audits('consulta.agenda_leer')).at(-1)?.detalle.patientIds).toContain(patientId);
    expect((await t.call('REC', 'GET', '/citas')).status).toBe(200);
    expect((await t.audits('citas.leer')).at(-1)?.detalle.patientIds).toContain(patientId);
    expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId })).status).toBe(201);
    expect((await t.call('AST', 'GET', '/fila')).status).toBe(200);
    expect((await t.audits('fila.leer')).at(-1)?.detalle.patientIds).toContain(patientId);
  });
});
