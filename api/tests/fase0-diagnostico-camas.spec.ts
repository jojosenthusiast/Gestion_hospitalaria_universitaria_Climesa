import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
// Database views compare against now(); the API clock stays slightly in the past so both agree.
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('Fase 0 · diagnóstico principal y asignación de camas (DAT-01, DAT-02, DAT-05)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const admission = async (patientId: string, isolation = false, requestedCategory = 'semiprivada') => {
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(patientId, { requestedCategory, isolation }));
    expect(created.status).toBe(201);
    return created.body.id as string;
  };
  const bed = (code: string) => t.one<{ id: string; version: number }>("SELECT id,version FROM infra.espacio WHERE codigo=$1", [code]);
  const assign = async (admissionId: string, code: string) => { const b = await bed(code); return t.call('REC', 'POST', `/admisiones/${admissionId}/cama`, { bedId: b.id, version: b.version }); };

  test('DAT-01: el diagnóstico principal se registra y desmarca el anterior (sin error 500)', async () => {
    const consultation = await t.consultation(await t.patient());
    const first = await t.call('MED', 'POST', `/consultas/${consultation.id}/diagnosticos`, { code: 'J06.9', principal: true });
    expect(first.status).toBe(201);
    expect(first.body.principal).toBe(true);
    const second = await t.call('MED', 'POST', `/consultas/${consultation.id}/diagnosticos`, { code: 'I10', principal: true });
    expect(second.status).toBe(201);
    const detail = await t.call('MED', 'GET', `/consultas/${consultation.id}/detalle`);
    expect(detail.body.diagnoses.filter((d: any) => d.principal).map((d: any) => d.code)).toEqual(['I10']);
  });

  test('DAT-02: asignar cama a un paciente con aislamiento bloquea las demás camas de la habitación', async () => {
    const id = await admission(await t.patient(), true);
    const assigned = await assign(id, 'HAB-206-A');
    expect(assigned.status).toBe(201);
    const sibling = await t.one<{ estado: string }>("SELECT estado FROM infra.v_estado_cama WHERE codigo='HAB-206-B'");
    expect(sibling.estado).toBe('bloqueada');
    const block = await t.one<{ origen: string }>("SELECT b.origen FROM infra.bloqueo_cama b JOIN infra.espacio e ON e.id=b.cama_id WHERE e.codigo='HAB-206-B'");
    expect(block.origen).toBe('aislamiento');
  });

  test('DAT-02: la salida física cierra el bloqueo por aislamiento', async () => {
    const id = await admission(await t.patient(), true);
    expect((await assign(id, 'HAB-205-A')).status).toBe(201);
    await t.pg.query("INSERT INTO hospitalizacion.alta(admision_id,tipo,firmada_por) VALUES($1,'medica',$2)", [id, await t.staffOf('MED')]);
    await t.pg.query("UPDATE hospitalizacion.admision SET estado='alta_firmada',version=version+1 WHERE id=$1", [id]);
    const version = (await t.one<{ version: number }>('SELECT version FROM hospitalizacion.admision WHERE id=$1', [id])).version;
    t.setNow(new Date(now.valueOf() + 5 * 60_000));
    try {
      const exit = await t.call('REC', 'POST', `/admisiones/${id}/salida`, { version, reason: 'Egreso por alta médica firmada' });
      expect(exit.status).toBe(201);
      const open = await t.one<{ n: number }>("SELECT count(*)::int AS n FROM infra.bloqueo_cama b JOIN infra.espacio e ON e.id=b.cama_id WHERE e.codigo='HAB-205-B' AND upper_inf(b.periodo)");
      expect(open.n).toBe(0);
    } finally { t.setNow(now); }
  });

  test('DAT-05: la sugerencia y la asignación respetan el sexo de quien ocupa la habitación semiprivada', async () => {
    const woman = await admission(await t.patient({ sex: 'femenino' }));
    expect((await assign(woman, 'HAB-201-A')).status).toBe(201);
    const man = await admission(await t.patient({ sex: 'masculino' }));
    const suggestions = await t.call('REC', 'GET', `/admisiones/${man}/sugerencias-cama`);
    expect(suggestions.status).toBe(200);
    expect(suggestions.body.map((b: any) => b.code)).not.toContain('HAB-201-B');
    const rejected = await assign(man, 'HAB-201-B');
    expect(rejected.status).toBe(409);
    const otherWoman = await admission(await t.patient({ sex: 'femenino' }));
    const forWoman = await t.call('REC', 'GET', `/admisiones/${otherWoman}/sugerencias-cama`);
    expect(forWoman.body.map((b: any) => b.code)).toContain('HAB-201-B');
  });
});
