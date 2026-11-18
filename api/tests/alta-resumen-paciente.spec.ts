import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const DAY = 24 * 60 * 60_000;

/** D7: after the discharge is signed, the patient reads its summary (type, diagnoses, indications, pending, follow-up) from GET /admisiones. */
describe('D7 · resumen del alta para el paciente', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const hospitalize = async (patientId: string, code: string) => {
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(patientId, { requestedCategory: 'semiprivada', isolation: false }));
    expect(created.status).toBe(201);
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
    const assigned = await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version });
    expect(assigned.status).toBe(201);
    return { id: created.body.id as string, version: assigned.body.version as number };
  };
  /** Signed consultation of the stay with one principal diagnosis (inserted open, diagnosed, then signed). */
  const signedDiagnosis = async (patientId: string) => {
    const cie = await t.one<{ codigo: string; descripcion: string }>('SELECT codigo,descripcion FROM atencion.cie10 ORDER BY codigo LIMIT 1');
    const appointmentId = await t.appointment(patientId, new Date(now.valueOf() - 3 * 60 * 60_000 - 7 * 60_000), 'atendida');
    const consultation = await t.one<{ id: string }>(`INSERT INTO atencion.consulta(paciente_id,medico_id,cita_id) VALUES($1,$2,$3) RETURNING id`, [patientId, await t.staffOf('MED'), appointmentId]);
    await t.pg.query('INSERT INTO atencion.diagnostico(consulta_id,cie10,principal) VALUES($1,$2,true)', [consultation.id, cie.codigo]);
    await t.pg.query(`UPDATE atencion.consulta SET estado='firmada',firmada_en=now() WHERE id=$1`, [consultation.id]);
    return cie;
  };
  const own = async (id: string) => (await t.call('PAC', 'GET', '/admisiones')).body.find((a: { id: string }) => a.id === id);

  test('el paciente ve el resumen de su alta firmada y lo sigue viendo 30 días después de la salida; Recepción solo la parte operativa', async () => {
    const patientId = await t.patient({ linkPac: true });
    const admission = await hospitalize(patientId, 'HAB-203-A');
    const cie = await signedDiagnosis(patientId);
    const followUpAt = new Date(now.valueOf() + 3 * DAY + 13 * 60_000);
    await t.appointment(patientId, followUpAt, 'confirmada');
    const signed = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, {
      type: 'medica', version: admission.version, summary: 'Reposo relativo, dieta blanda y control de temperatura cada 8 horas.',
      pending: [{ description: 'Retirar puntos de sutura', responsible: 'Consulta externa' }],
    });
    expect(signed.status).toBe(201);

    const row = await own(admission.id);
    expect(row.state).toBe('alta_firmada');
    expect(row.discharge).toMatchObject({
      type: 'medica', summary: 'Reposo relativo, dieta blanda y control de temperatura cada 8 horas.',
      pending: [{ description: 'Retirar puntos de sutura', responsible: 'Consulta externa' }], pendingCount: 1,
      diagnoses: [{ code: cie.codigo, description: cie.descripcion, principal: true }],
      followUp: { at: followUpAt.toISOString(), state: 'confirmada' },
    });
    expect(row.discharge.followUp.doctorName).toEqual(expect.any(String));
    expect(row.discharge.signedByName).toEqual(expect.any(String));

    // D-031: without a care relationship the summary stays clinical.
    const rec = (await t.call('REC', 'GET', '/admisiones')).body.find((a: { id: string }) => a.id === admission.id);
    expect(rec.discharge).toMatchObject({ type: null, pending: null, summary: null, diagnoses: null, followUp: null, pendingCount: 1 });

    const exit = await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { version: signed.body.version, reason: 'Salida física del paciente' });
    expect(exit.status).toBe(201);
    const closed = await own(admission.id);
    expect(closed).toMatchObject({ state: 'egresado', allowedActions: [] });
    expect(closed.discharge.summary).toContain('Reposo relativo');
    // Staff lists keep showing active admissions only.
    expect((await t.call('REC', 'GET', '/admisiones')).body.find((a: { id: string }) => a.id === admission.id)).toBeUndefined();

    t.setNow(new Date(now.valueOf() + 31 * DAY));
    try { expect(await own(admission.id)).toBeUndefined(); } finally { t.setNow(now); }
  });

  test('otro paciente no ve el resumen del alta ajena', async () => {
    const other = await t.patient();
    const admission = await hospitalize(other, 'HAB-204-A');
    const signed = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { type: 'medica', version: admission.version, summary: 'Indicaciones de otro paciente para su casa.' });
    expect(signed.status).toBe(201);
    expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { version: signed.body.version, reason: 'Salida física del paciente' })).status).toBe(201);
    await t.patient({ linkPac: true });
    const list = (await t.call('PAC', 'GET', '/admisiones')).body as Array<{ id: string; patientId: string }>;
    expect(list.find(a => a.id === admission.id)).toBeUndefined();
    expect(list.every(a => a.patientId !== other)).toBe(true);
  });
});
