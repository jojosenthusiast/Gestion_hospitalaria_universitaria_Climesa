import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(300000);
/** Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. Nothing here depends on the real "now". */
const NOW = new Date('2026-12-02T15:00:00Z');
const attachment = { fileName: 'informe-externo.pdf', mimeType: 'application/pdf', sizeBytes: 182000 };

/**
 * R7 U3, journey C2 (audit `fase2-recorridos-auditoria.md`): an exam done elsewhere without a prior order (C-5, D-5),
 * the patient told where to go (C-6), and an old app that marks a follow-up item the release already closed (A1).
 */
describe('R7 · laboratorio: resultado externo sin orden, aviso al paciente y pendientes ya cerrados', () => {
  let t: TestApp;
  let glu: string, hemo: string;

  beforeAll(async () => {
    t = await createTestApp(NOW);
    await t.enroll('MED');
    glu = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='GLU'")).id;
    hemo = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HEMO'")).id;
  });
  afterAll(async () => { await t?.close(); });

  const record = (patientId: string, body: Record<string, unknown>) => t.call('MED', 'POST', `/laboratorio/pacientes/${patientId}/resultado-externo`, body);

  test('C-5 (D-5): el médico con relación de atención registra un examen hecho fuera sin orden; queda completado para revisarlo', async () => {
    const patientId = await t.patient({ linkPac: true });
    const consultation = await t.consultation(patientId);
    const saved = await record(patientId, { place: 'Laboratorio Ejemplo, San Salvador', results: [{ examId: glu, value: 250 }], attachment, note: 'Lo trajo el paciente' });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ state: 'completado', consultationId: consultation.id, attachmentId: expect.any(String), version: expect.any(Number) });
    const detail = await t.call('MED', 'GET', `/laboratorio/ordenes/${saved.body.id}`);
    expect(detail.body).toMatchObject({ consultationId: consultation.id, external: true, externalPlace: 'Laboratorio Ejemplo, San Salvador', state: 'completado', reviewedAt: null });
    expect(detail.body.items).toEqual([expect.objectContaining({ code: 'GLU', result: expect.objectContaining({ value: 250, mark: 'alto' }) })]);
    expect(detail.body.allowedActions).toContain('revisar');
    expect((await t.audits('laboratorio.resultado_externo_sin_orden')).length).toBe(1);
    // The patient does not see values until the doctor releases them (D-040).
    const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(o => o.id === saved.body.id);
    expect(mine.items[0].result).toBeNull();
  });

  test('C-5: sin relación de atención no se registra; un panel o un examen repetido se rechaza en el campo', async () => {
    const stranger = await t.patient({});
    const denied = await record(stranger, { place: 'Laboratorio Ejemplo', results: [{ examId: glu, value: 90 }], attachment });
    expect([denied.status, denied.body.codigo]).toEqual([403, 'sin_permiso']);
    const patientId = await t.patient({});
    await t.consultation(patientId);
    const panel = await record(patientId, { place: 'Laboratorio Ejemplo', results: [{ examId: hemo, value: 1 }], attachment });
    expect([panel.status, panel.body.codigo, panel.body.campo]).toEqual([400, 'validacion', 'results']);
    const twice = await record(patientId, { place: 'Laboratorio Ejemplo', results: [{ examId: glu, value: 1 }, { examId: glu, value: 2 }], attachment });
    expect([twice.status, twice.body.campo]).toEqual([400, 'results']);
    expect((await t.call('LAB', 'POST', `/laboratorio/pacientes/${patientId}/resultado-externo`, { place: 'Laboratorio Ejemplo', results: [{ examId: glu, value: 1 }], attachment })).status).toBe(403);
  });

  test('C-6: enviar a externo dice si el paciente recibe el aviso en su app', async () => {
    const linked = await t.patient({ linkPac: true });
    const order = (await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: (await t.consultation(linked)).id, exams: [glu] })).body;
    const sent = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.id}/externa`, { version: order.version, place: 'Laboratorio Ejemplo', instructions: 'Ir en ayunas con este documento.' });
    expect(sent.status).toBe(201);
    expect(sent.body.patientNotified).toBe(true);
    expect((await t.events('laboratorio.actualizado', order.id)).at(-1)).toContain(`usuario:${userId('PAC')}`);
    const unlinked = await t.patient({});
    const other = (await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: (await t.consultation(unlinked)).id, exams: [glu] })).body;
    const sentOther = await t.call('LAB', 'POST', `/laboratorio/ordenes/${other.id}/externa`, { version: other.version, place: 'Laboratorio Ejemplo', instructions: 'Ir en ayunas con este documento.' });
    expect(sentOther.body.patientNotified).toBe(false);
  });

  test('A1: marcar «revisado» un pendiente que la liberación ya cerró sigue respondiendo 201 (apps publicadas)', async () => {
    const patientId = await t.patient({ linkPac: true });
    const created = (await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: (await t.consultation(patientId)).id, exams: [glu] })).body;
    const expediente = (await t.one<{ expediente: string; nombres: string }>('SELECT expediente,nombres FROM pacientes.paciente WHERE id=$1', [patientId]));
    const sampled = await t.call('LAB', 'POST', `/laboratorio/ordenes/${created.id}/muestra`, { version: created.version, expediente: expediente.expediente, nombreCompleto: `${expediente.nombres} Ficticio` });
    expect(sampled.status).toBe(201);
    const item = (await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [created.id])).id;
    const done = await t.call('LAB', 'POST', `/laboratorio/ordenes/${created.id}/resultados/lote`, { version: sampled.body.version, items: [{ orderItemId: item, value: 600 }], complete: true });
    expect(done.status).toBe(201);
    const pending = ((await t.call('MED', 'GET', '/laboratorio/pendientes')).body as any[]).find(p => p.orderId === created.id);
    expect(pending).toBeDefined();
    const released = await t.call('MED', 'POST', `/laboratorio/ordenes/${created.id}/revisar`, { version: done.body.orderVersion, followUp: false });
    expect(released.body.followUpsClosed).toBe(1);
    const old = await t.call('MED', 'POST', `/laboratorio/pendientes/${pending.id}/revisar`, { version: pending.version });
    expect(old.status).toBe(201);
    expect(old.body).toMatchObject({ id: pending.id, state: 'revisado' });
    // The release closed it, so every repeat answers the same (idempotent).
    const again = await t.call('MED', 'POST', `/laboratorio/pendientes/${pending.id}/revisar`, { version: old.body.version });
    expect(again.status).toBe(201);
  });

  test('A5: la nota opcional para el paciente se guarda al liberar y solo él la ve después de liberar', async () => {
    const patientId = await t.patient({ linkPac: true });
    await t.consultation(patientId);
    const saved = await record(patientId, { place: 'Laboratorio Ejemplo', results: [{ examId: glu, value: 95 }], attachment });
    const before = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(o => o.id === saved.body.id);
    expect(before.patientNote ?? null).toBeNull();
    const released = await t.call('MED', 'POST', `/laboratorio/ordenes/${saved.body.id}/revisar`, { version: saved.body.version, followUp: false, patientNote: '  Repetir en ayunas el lunes.  ' });
    expect(released.status).toBe(201);
    const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(o => o.id === saved.body.id);
    expect(mine.patientNote).toBe('Repetir en ayunas el lunes.');
    const long = await t.call('MED', 'POST', `/laboratorio/ordenes/${saved.body.id}/revisar`, { version: released.body.version, patientNote: 'x'.repeat(501) });
    expect(long.status).toBe(400);
  });
});
