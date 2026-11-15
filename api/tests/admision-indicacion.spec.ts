import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

/** Indicación de hospitalización desde una consulta (MED, móvil y web): el contrato mínimo del brief de Fase 0. */
describe('POST /admisiones/indicaciones desde una consulta', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const minimal = (patientId: string, consultationId: string, extra: Record<string, unknown> = {}) =>
    ({ patientId, origin: 'consulta', originId: consultationId, requestedCategory: 'semiprivada', isolation: false, motive: 'Neumonía que requiere observación', ...extra });

  test('el médico indica sin enviar attendingDoctorId: queda como médico tratante', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    const r = await t.call('MED', 'POST', '/admisiones/indicaciones', minimal(patientId, consultation.id));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ state: 'pendiente_cama', version: expect.any(Number) });
    const row = await t.one<{ medico: string; origen: string; motivo: string }>('SELECT medico_tratante_id AS medico,origen,motivo FROM hospitalizacion.admision WHERE id=$1', [r.body.id]);
    expect(row).toEqual({ medico: await t.staffOf('MED'), origen: 'consulta', motivo: 'Neumonía que requiere observación' });
  });

  test('con su propio attendingDoctorId también se acepta; con el de otro médico no', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    const other = await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otra','Médica Prueba','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`);
    expect((await t.call('MED', 'POST', '/admisiones/indicaciones', minimal(patientId, consultation.id, { attendingDoctorId: other.id }))).status).toBe(403);
    expect((await t.call('MED', 'POST', '/admisiones/indicaciones', minimal(patientId, consultation.id, { attendingDoctorId: await t.staffOf('MED') }))).status).toBe(201);
  });

  test('la consulta debe ser del paciente y del médico que indica', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    const stranger = await t.patient();
    const foreign = await t.call('MED', 'POST', '/admisiones/indicaciones', minimal(stranger, consultation.id));
    expect(foreign.status).toBe(400);
    expect(foreign.body).toMatchObject({ codigo: 'validacion', campo: 'originId' });
    const other = await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otro','Médico Prueba','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`);
    await t.pg.query('UPDATE atencion.consulta SET medico_id=$2 WHERE id=$1', [consultation.id, other.id]);
    const notMine = await t.call('MED', 'POST', '/admisiones/indicaciones', minimal(patientId, consultation.id));
    expect(notMine.status).toBe(403);
    expect(notMine.body.detail).toBe('La consulta no es tuya: solo su médico puede indicar la hospitalización.');
  });

  test('sin motive responde 400 con el error en español del campo (MOV-03)', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    const { motive: _motive, ...body } = minimal(patientId, consultation.id);
    const r = await t.call('MED', 'POST', '/admisiones/indicaciones', { ...body, origin: 'cita' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ codigo: 'validacion', campo: 'motive', errors: [{ field: 'motive', message: 'Es obligatorio.' }] });
    const wrongOrigin = await t.call('MED', 'POST', '/admisiones/indicaciones', minimal(patientId, consultation.id, { origin: 'cita' }));
    expect(wrongOrigin.status).toBe(400);
    expect(wrongOrigin.body).toMatchObject({ codigo: 'validacion', campo: 'origin', detail: 'La indicación debe enlazarse a una consulta.' });
  });
});
