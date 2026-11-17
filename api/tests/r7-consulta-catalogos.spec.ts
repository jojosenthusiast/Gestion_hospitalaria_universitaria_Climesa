import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
/** Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. */
const NOW = new Date('2026-12-02T15:00:00Z');

/** R7 U3, journey B4 gaps owned here: lab orders in the consultation detail (B-6) and CIE-10 search (B-7). */
describe('R7 · consulta: órdenes de laboratorio y CIE-10', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(NOW); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  test('B-6: el detalle de la consulta trae al médico sus órdenes con los exámenes', async () => {
    const patientId = await t.patient({ linkPac: true });
    const consultation = await t.consultation(patientId);
    const glu = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='GLU'")).id;
    const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [glu] });
    expect(order.status).toBe(201);
    const detail = await t.call('MED', 'GET', `/consultas/${consultation.id}/detalle`);
    expect(detail.status).toBe(200);
    expect(detail.body.labOrders).toEqual([{ id: order.body.id, state: 'pendiente', priority: expect.any(String), createdAt: NOW.toISOString(), reviewedAt: null, items: [{ code: 'GLU', name: expect.any(String) }] }].map(o => ({ ...o, createdAt: expect.any(String) })));
    // Existing fields keep their shape.
    expect(Object.keys(detail.body).sort()).toEqual(['consultation', 'diagnoses', 'labOrders', 'prescriptions', 'vitalSigns']);
  });

  test('B-7: busca por inicio de código o por palabras sin acentos, hasta 20, y pide al menos 2 letras', async () => {
    const sample = await t.one<{ codigo: string; descripcion: string }>('SELECT codigo,descripcion FROM atencion.cie10 ORDER BY codigo LIMIT 1');
    const byCode = await t.call('MED', 'GET', `/consultas/cie10?q=${encodeURIComponent(sample.codigo.slice(0, 3))}`);
    expect(byCode.status).toBe(200);
    expect(byCode.body[0]).toEqual({ code: expect.stringMatching(new RegExp(`^${sample.codigo.slice(0, 3)}`, 'i')), description: expect.any(String) });
    expect(byCode.body.length).toBeLessThanOrEqual(20);
    const word = sample.descripcion.split(/\s+/).find(w => w.length >= 4)!.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const byWord = await t.call('MED', 'GET', `/consultas/cie10?q=${encodeURIComponent(word)}`);
    expect(byWord.body.some((r: { code: string }) => r.code === sample.codigo)).toBe(true);
    const short = await t.call('MED', 'GET', '/consultas/cie10?q=a');
    expect([short.status, short.body.codigo, short.body.campo]).toEqual([400, 'validacion', 'q']);
    expect((await t.call('PAC', 'GET', '/consultas/cie10?q=gripe')).status).toBe(403);
  });

  test('A8: «%» y «_» se buscan como texto, no como comodines', async () => {
    for (const q of ['%%', '__', '%_']) {
      const wild = await t.call('MED', 'GET', `/consultas/cie10?q=${encodeURIComponent(q)}`);
      expect([q, wild.status, wild.body]).toEqual([q, 200, []]);
    }
  });
});
