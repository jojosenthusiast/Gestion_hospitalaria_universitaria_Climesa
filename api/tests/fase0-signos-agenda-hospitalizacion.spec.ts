import { randomUUID } from 'node:crypto';
import { businessDate } from '../src/platform/clock';
import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const MINUTE = 60_000;

describe('Fase 0 · signos, franjas, salida, traslado, eventos y cancelación (F-02, API-03..07, F-06)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const hospitalize = async (code: string, sex = 'femenino') => {
    const created = await t.call('REC', 'POST', '/admisiones', { patientId: await t.patient({ sex }), origin: 'emergencia', originId: randomUUID(), requestedCategory: 'semiprivada', isolation: false, attendingDoctorId: await t.staffOf('MED') });
    expect(created.status).toBe(201);
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
    const assigned = await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version });
    expect(assigned.status).toBe(201);
    return { id: created.body.id as string, version: assigned.body.version as number, bedId: bed.id };
  };

  test('F-02/API-06: AST y ENF registran signos (signos.registrar con contexto x) sin relación de atención', async () => {
    const consultation = await t.consultation(await t.patient());
    for (const role of ['AST', 'ENF']) {
      const saved = await t.call(role, 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 75, temperature: 36.8 });
      expect({ role, status: saved.status }).toEqual({ role, status: 201 });
    }
  });

  test('API-06: los signos rechazan una admisión de otro paciente', async () => {
    const consultation = await t.consultation(await t.patient());
    const foreign = await hospitalize('HAB-203-A');
    const saved = await t.call('ENF', 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 75, admissionId: foreign.id });
    expect(saved.status).toBe(400);
  });

  test('API-07: con la jornada ya iniciada, las franjas se alinean desde el inicio de la jornada y se exige inicio alineado', async () => {
    // Fixed business time (tomorrow 10:00 local) so the test never runs out of slots near midnight.
    const day = businessDate(new Date(now.valueOf() + 86_400_000));
    const at10 = new Date(`${day}T10:00:00-06:00`);
    const shiftStart = new Date(at10.valueOf() - 37 * MINUTE);
    await t.shift('MED', shiftStart, new Date(shiftStart.valueOf() + 8 * 60 * MINUTE));
    const doctorId = await t.staffOf('MED');
    t.setNow(at10);
    try {
      const availability = await t.call('REC', 'GET', `/citas/disponibilidad?doctorId=${doctorId}&date=${day}`);
      expect(availability.status).toBe(200);
      expect(availability.body.slots.length).toBeGreaterThan(0);
      for (const slot of availability.body.slots) {
        const offset = Date.parse(slot.start) - shiftStart.valueOf();
        expect(offset % (20 * MINUTE)).toBe(0);
        expect(Date.parse(slot.start)).toBeGreaterThanOrEqual(at10.valueOf());
      }
      const patientId = await t.patient();
      const at = (minutes: number) => ({ patientId, doctorId, start: new Date(shiftStart.valueOf() + minutes * MINUTE).toISOString(), end: new Date(shiftStart.valueOf() + (minutes + 20) * MINUTE).toISOString() });
      const misaligned = await t.call('REC', 'POST', '/citas', at(70));
      expect(misaligned.status).toBe(400);
      expect(misaligned.body.codigo).toBe('franja_desalineada');
      expect((await t.call('REC', 'POST', '/citas', at(80))).status).toBe(201);
    } finally { t.setNow(now); }
  });

  test('API-04: el alta y la salida física validan su cuerpo y la versión', async () => {
    const admission = await hospitalize('HAB-204-A');
    const alta = { type: 'medica', summary: 'Evolución favorable sin complicaciones', pending: [{ description: 'Control en consulta externa en 7 días', responsible: 'Médico tratante' }] };
    expect((await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, alta)).status).toBe(400);
    const staleAlta = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { ...alta, version: 1 });
    expect(staleAlta.status).toBe(409);
    expect(staleAlta.body.versionActual).toBe(admission.version);
    expect((await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { ...alta, pending: ['texto suelto'], version: admission.version })).status).toBe(400);
    expect((await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { ...alta, version: admission.version })).status).toBe(201);
    const stored = await t.one<{ pendientes: any }>('SELECT pendientes FROM hospitalizacion.alta WHERE admision_id=$1', [admission.id]);
    expect(stored.pendientes).toEqual([{ descripcion: 'Control en consulta externa en 7 días', responsable: 'Médico tratante' }]);
    expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { reason: 'Egreso por alta médica firmada' })).status).toBe(400);
    const stale = await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { version: 1, reason: 'Egreso por alta médica firmada' });
    expect(stale.status).toBe(409);
    expect(stale.body.codigo).toBe('version_conflicto');
    const current = stale.body.versionActual;
    t.setNow(new Date(now.valueOf() + 5 * MINUTE));
    try {
      expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { version: current, reason: 'Egreso por alta médica firmada' })).status).toBe(201);
    } finally { t.setNow(now); }
    // API-03: discharge and exit are published to admissions and the bed board.
    expect((await t.events('admision.actualizada', admission.id)).length).toBeGreaterThanOrEqual(2);
    expect((await t.events('cama.estado_cambiado', admission.bedId)).length).toBeGreaterThanOrEqual(2);
  });

  test('API-05: el traslado usa el id de la ocupación, compara la versión y publica ambos cambios de cama', async () => {
    const admission = await hospitalize('HAB-202-A');
    const list = await t.call('REC', 'GET', '/admisiones');
    const row = list.body.find((item: any) => item.id === admission.id);
    expect(row.occupationId).toBeTruthy();
    const target = await t.one<{ id: string }>("SELECT id FROM infra.espacio WHERE codigo='HAB-206-A'");
    const body = { bedId: target.id, reason: 'Cambio por mantenimiento de la habitación', version: row.version };
    expect((await t.call('REC', 'POST', `/ocupaciones/${admission.id}/traslado`, body)).status).toBe(404);
    const stale = await t.call('REC', 'POST', `/ocupaciones/${row.occupationId}/traslado`, { ...body, version: row.version + 5 });
    expect(stale.status).toBe(409);
    t.setNow(new Date(now.valueOf() + 5 * MINUTE));
    try {
      const moved = await t.call('REC', 'POST', `/ocupaciones/${row.occupationId}/traslado`, body);
      expect(moved.status).toBe(201);
      expect(moved.body.version).toBe(row.version + 1);
    } finally { t.setNow(now); }
    expect(await t.events('cama.estado_cambiado', target.id)).not.toHaveLength(0);
    expect(await t.events('admision.actualizada', admission.id)).not.toHaveLength(0);
  });

  test('F-06/H-09: un PAC que cancela una cita ajena con versión errónea recibe 403, no 409 con versionActual', async () => {
    await t.patient({ linkPac: true });
    const foreign = await t.appointment(await t.patient(), new Date(now.valueOf() + 3 * 86_400_000));
    const response = await t.call('PAC', 'POST', `/citas/${foreign}/cancelar`, { version: 99, reason: 'Ya no puedo asistir a la cita' });
    expect(response.status).toBe(403);
    expect(response.body.versionActual).toBeUndefined();
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
  });
});
