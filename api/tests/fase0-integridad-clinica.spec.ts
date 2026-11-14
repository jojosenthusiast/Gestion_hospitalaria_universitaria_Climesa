import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('Fase 0 · integridad de citas y de lo firmado (DAT-03, DAT-04)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  /** Runs SQL with the API role, exactly as the API does. */
  const asApi = (sql: string, params: unknown[] = []) => t.pg.transaction(async tx => { await tx.exec('SET LOCAL ROLE sghu_api'); return tx.query(sql, params); });
  const signed = async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    const draft = await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Control de rutina', plan: 'Seguimiento en un mes' });
    expect(draft.status).toBe(200);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: draft.body.version })).status).toBe(201);
    return { ...consultation, patientId };
  };

  test('DAT-03: la base impide dos citas vigentes simultáneas del mismo paciente con médicos distintos', async () => {
    const patientId = await t.patient();
    const other = await t.one<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo) VALUES('Otra','Médica Ficticia','medico') RETURNING id");
    const start = new Date(now.valueOf() + 2 * 86_400_000);
    await t.appointment(patientId, start);
    await expect(asApi(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$3::timestamptz+interval '20 minutes','[)'),'solicitada','paciente')`, [patientId, other.id, start]))
      .rejects.toThrow(/cita_paciente_sin_traslape/);
  });

  test('DAT-04: sghu_api no puede borrar diagnósticos ni renglones de receta', async () => {
    const consultation = await t.consultation(await t.patient());
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/diagnosticos`, { code: 'J06.9' })).status).toBe(201);
    await expect(asApi('DELETE FROM atencion.diagnostico WHERE consulta_id=$1', [consultation.id])).rejects.toThrow(/permission denied/);
    await expect(asApi('DELETE FROM atencion.receta_item WHERE false')).rejects.toThrow(/permission denied/);
  });

  test('DAT-04: la base rechaza diagnósticos, recetas y signos sobre una consulta firmada', async () => {
    const consultation = await signed();
    await expect(asApi("INSERT INTO atencion.diagnostico(consulta_id,cie10) VALUES($1,'I10')", [consultation.id])).rejects.toThrow(/consulta_firmada/);
    await expect(asApi('INSERT INTO atencion.receta(consulta_id) VALUES($1)', [consultation.id])).rejects.toThrow(/consulta_firmada/);
    await expect(asApi('INSERT INTO atencion.signos_vitales(paciente_id,consulta_id,tomado_por,fc) VALUES($1,$2,$3,80)', [consultation.patientId, consultation.id, await t.staffOf('MED')])).rejects.toThrow(/consulta_firmada/);
    await expect(asApi('UPDATE atencion.consulta SET medico_id=$2 WHERE id=$1', [consultation.id, await t.staffOf('ENF')])).rejects.toThrow(/consulta_firmada/);
  });

  test('DAT-04/F-04: la API responde 409 consulta_firmada a signos posteriores a la firma', async () => {
    const consultation = await signed();
    const late = await t.call('MED', 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 90 });
    expect(late.status).toBe(409);
    expect(late.body.codigo).toBe('consulta_firmada');
  });
});
