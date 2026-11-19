import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const MINUTE = 60_000;
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * MINUTE);

// Lote 5 (Android reception): additive read fields; nothing existing changes.
describe('Lote 5 · edad, sexo, aislamiento y consultorio en las lecturas', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const age = (birth: string) => {
    const today = new Date(now.valueOf() - 6 * 3600_000), b = new Date(birth);
    return today.getUTCFullYear() - b.getUTCFullYear() - ((today.getUTCMonth() < b.getUTCMonth() || (today.getUTCMonth() === b.getUTCMonth() && today.getUTCDate() < b.getUTCDate())) ? 1 : 0);
  };

  test('GET /fila trae patientAge y patientSex a quien puede verlos; PAC ve los suyos', async () => {
    const patientId = await t.patient({ sex: 'masculino', linkPac: true });
    const issued = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
    expect(issued.status).toBe(201);
    for (const role of ['REC', 'MED', 'PAC']) {
      const row = ((await t.call(role, 'GET', '/fila')).body as any[]).find(r => r.id === issued.body.id);
      expect({ role, age: row.patientAge, sex: row.patientSex }).toEqual({ role, age: age('1990-01-01'), sex: 'masculino' });
    }
    // JOP sees the queue and the file (ver_ficha) but not the birth date: no age.
    const jop = ((await t.call('JOP', 'GET', '/fila')).body as any[]).find(r => r.id === issued.body.id);
    expect({ age: jop.patientAge, sex: jop.patientSex }).toEqual({ age: null, sex: 'masculino' });
  });

  test('GET /citas/solicitudes-categoria trae patientAge y patientSex', async () => {
    await t.patient({ sex: 'femenino', linkPac: true });
    const created = await t.call('PAC', 'POST', '/citas/solicitudes-categoria', { categories: ['piel'], franja: 'manana', note: 'Mancha en el brazo' });
    expect(created.status).toBe(201);
    const row = ((await t.call('REC', 'GET', '/citas/solicitudes-categoria')).body as any[]).find(r => r.id === created.body.id);
    expect({ age: row.patientAge, sex: row.patientSex }).toEqual({ age: age('1990-01-01'), sex: 'femenino' });
  });

  test('POST /fila/llamar-siguiente devuelve officeId y officeCode', async () => {
    const office = await t.one<{ id: string; codigo: string }>("SELECT id,codigo FROM infra.espacio WHERE tipo='consultorio' ORDER BY codigo LIMIT 1");
    await t.call('REC', 'POST', '/fila', { service: 'emergencia', patientId: await t.patient() });
    const called = await t.call('REC', 'POST', '/fila/llamar-siguiente', { service: 'emergencia', officeId: office.id });
    expect(called.status).toBe(201);
    expect(called.body).toMatchObject({ officeId: office.id, officeCode: office.codigo });
    await t.call('REC', 'POST', '/fila', { service: 'emergencia', patientId: await t.patient() });
    const without = await t.call('REC', 'POST', '/fila/llamar-siguiente', { service: 'emergencia' });
    expect(without.body).toMatchObject({ officeId: null, officeCode: null });
  });

  test('GET /camas trae isolation de la cama y roomIsolation de la habitación', async () => {
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(await t.patient({ sex: 'femenino' }), { requestedCategory: 'semiprivada', isolation: true }));
    expect(created.status).toBe(201);
    const bed = await t.one<{ id: string; version: number }>("SELECT id,version FROM infra.espacio WHERE codigo='HAB-203-A'");
    expect((await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);
    const board = (await t.call('JOP', 'GET', '/camas')).body as any[];
    const by = (code: string) => board.find(b => b.code === code);
    expect({ isolation: by('HAB-203-A').isolation, room: by('HAB-203-A').roomIsolation }).toEqual({ isolation: true, room: true });
    expect({ isolation: by('HAB-203-B').isolation, room: by('HAB-203-B').roomIsolation }).toEqual({ isolation: false, room: true });
    expect({ isolation: by('HAB-201-A').isolation, room: by('HAB-201-A').roomIsolation }).toEqual({ isolation: false, room: false });
  });
});
