import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(300000);
/** Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. Nothing here depends on the real "now". */
const NOW = new Date('2026-12-02T15:00:00Z');

/**
 * R7 U3, journey C1 (audit `fase2-recorridos-auditoria.md`): the lab saves the whole sheet in one step (C-1) with the
 * patient's ranges at hand (C-3); the doctor sees the key values in "Resultados por revisar" (C-4), and one release
 * closes the order and its pending item together (C-2), deciding the follow-up appointment (D-4).
 */
describe('R7 · laboratorio: hoja de resultados, bandeja y liberación', () => {
  let t: TestApp;
  let hemo: string, glu: string;

  beforeAll(async () => {
    t = await createTestApp(NOW);
    await t.enroll('MED');
    hemo = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HEMO'")).id;
    glu = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='GLU'")).id;
  });
  afterAll(async () => { await t?.close(); });

  /** Order with five exams (hemogram panel + glucose), sample taken. */
  async function inProcess() {
    const name = `Rec${Math.random().toString(36).slice(2, 8)}`;
    const patientId = await t.patient({ name, linkPac: true });
    const consultation = await t.consultation(patientId);
    const created = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hemo, glu] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
    const sampled = await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/muestra`, { version: created.body.version, expediente: record, nombreCompleto: `${name} Ficticio` });
    expect(sampled.status).toBe(201);
    const items = (await t.pg.query<{ id: string; code: string }>('SELECT oi.id,e.codigo AS code FROM laboratorio.orden_item oi JOIN laboratorio.examen e ON e.id=oi.examen_id WHERE oi.orden_id=$1', [id])).rows;
    const item = (code: string) => items.find(i => i.code === code)!.id;
    return { id, patientId, version: sampled.body.version as number, item, items };
  }
  /** Normal values except a critical haemoglobin (5.1 g/dL, below the critical low of 7.0). */
  const sheet = (o: Awaited<ReturnType<typeof inProcess>>, hb = 5.1) => [
    { orderItemId: o.item('HB'), value: hb }, { orderItemId: o.item('HTO'), value: 40 }, { orderItemId: o.item('LEU'), value: 7.2 },
    { orderItemId: o.item('PLQ'), value: 250 }, { orderItemId: o.item('GLU'), value: 88 },
  ];
  const listed = async (role: string, id: string) => ((await t.call(role, 'GET', '/laboratorio/ordenes')).body as any[]).find(o => o.id === id);
  const inbox = async () => (await t.call('MED', 'GET', '/laboratorio/pendientes')).body as any[];
  const proposals = async () => (await t.call('REC', 'GET', '/laboratorio/seguimientos')).body as any[];

  test('C-3: la lista trae el rango y los críticos del paciente para el laboratorio, nunca para el paciente', async () => {
    const o = await inProcess();
    const hb = (await listed('LAB', o.id)).items.find((i: any) => i.code === 'HB');
    expect(hb.referenceRange).toEqual({ min: 12, max: 15.5, criticalLow: 7, criticalHigh: 20 });
    const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(x => x.id === o.id);
    expect(mine.items.every((i: any) => i.referenceRange == null)).toBe(true);
  });

  test('C-1: un clic guarda las cinco filas y completa la orden con una sola versión; el crítico avisa al médico', async () => {
    const o = await inProcess();
    const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version, items: sheet(o), complete: true });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ id: o.id, state: 'completado', orderVersion: o.version + 1, criticalCount: 1 });
    expect(saved.body.completedAt).toBe(NOW.toISOString());
    expect(saved.body.results.find((r: any) => r.orderItemId === o.item('HB')).mark).toBe('critico_bajo');
    expect(saved.body.results).toHaveLength(5);
    const critical = (await t.events('laboratorio.critico', o.id)).at(-1);
    expect(critical).toEqual(expect.arrayContaining([`usuario:${userId('MED')}`, 'rol:LAB']));
    expect((await inbox()).find(p => p.orderId === o.id)).toMatchObject({ reason: 'critico', orderState: 'completado' });
  });

  test('C-1: la hoja es todo o nada; un examen inválido no deja ningún valor guardado', async () => {
    const o = await inProcess();
    const items = sheet(o);
    (items[4] as any) = { orderItemId: o.item('GLU'), text: 'no es número' };
    const bad = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version, items });
    expect(bad.status).toBe(400);
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM laboratorio.resultado r JOIN laboratorio.orden_item oi ON oi.id=r.orden_item_id WHERE oi.orden_id=$1', [o.id])).n).toBe(0);
    const twice = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version, items: [items[0], items[0]] });
    expect(twice.status).toBe(400);
    const partial = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version, items: sheet(o).slice(0, 2), complete: true });
    expect(partial.status).toBe(409);
    const stale = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version + 7, items: sheet(o) });
    expect([stale.status, stale.body.codigo]).toEqual([409, 'version_conflicto']);
  });

  test('C-1: sin completar, la hoja deja la orden en proceso con «completar» disponible', async () => {
    const o = await inProcess();
    const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version, items: sheet(o, 13.2) });
    expect([saved.status, saved.body.state, saved.body.criticalCount, saved.body.completedAt]).toEqual([201, 'en_proceso', 0, null]);
    expect((await listed('LAB', o.id)).allowedActions).toContain('completar');
  });

  test('C-4 + C-2: la bandeja trae los valores clave y la versión; liberar cierra la orden y el pendiente juntos y el paciente ve los valores', async () => {
    const o = await inProcess();
    const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados/lote`, { version: o.version, items: sheet(o), complete: true });
    const item = (await inbox()).find(p => p.orderId === o.id);
    expect(item.orderVersion).toBe(saved.body.orderVersion);
    expect(item.orderActions).toEqual(['revisar']);
    expect(item.values[0]).toMatchObject({ code: 'HB', value: 5.1, mark: 'critico_bajo', unit: 'g/dL' });
    expect(item.values).toHaveLength(5);
    const released = await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/revisar`, { version: item.orderVersion, followUp: false });
    expect(released.status).toBe(201);
    expect(released.body).toMatchObject({ followUpsClosed: 1, followUpProposalId: null });
    expect((await inbox()).some(p => p.orderId === o.id)).toBe(false);
    expect((await listed('MED', o.id))?.reviewedAt ?? (await t.one('SELECT revisada_en FROM laboratorio.orden WHERE id=$1', [o.id])).revisada_en).toBeTruthy();
    const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(x => x.id === o.id);
    expect(mine.items.find((i: any) => i.code === 'HB').result).toMatchObject({ value: 5.1, mark: 'critico_bajo' });
  });

  test('D-4: completar ya no propone cita; el médico decide al revisar (sin decidir, se propone como antes)', async () => {
    const decline = await inProcess();
    const a = await t.call('LAB', 'POST', `/laboratorio/ordenes/${decline.id}/resultados/lote`, { version: decline.version, items: sheet(decline, 13), complete: true });
    expect((await proposals()).some(p => p.orderId === decline.id)).toBe(false);
    await t.call('MED', 'POST', `/laboratorio/ordenes/${decline.id}/revisar`, { version: a.body.orderVersion, followUp: false });
    expect((await proposals()).some(p => p.orderId === decline.id)).toBe(false);

    const legacy = await inProcess();
    const b = await t.call('LAB', 'POST', `/laboratorio/ordenes/${legacy.id}/resultados/lote`, { version: legacy.version, items: sheet(legacy, 13), complete: true });
    const released = await t.call('MED', 'POST', `/laboratorio/ordenes/${legacy.id}/revisar`, { version: b.body.orderVersion });
    expect(released.status).toBe(201);
    const proposal = (await proposals()).find(p => p.orderId === legacy.id);
    expect(proposal).toMatchObject({ state: 'propuesta', doctorId: await t.staffOf('MED') });
    expect(released.body.followUpProposalId).toBe(proposal.id);
    expect(released.body.followUpsClosed).toBe(0);
  });
});
