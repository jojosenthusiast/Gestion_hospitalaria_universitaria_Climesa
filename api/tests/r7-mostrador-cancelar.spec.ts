import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
// Fixed clock: Monday 16 Nov 2026, 09:00 in El Salvador; the appointments are on Tuesday 17.
const now = new Date('2026-11-16T15:00:00Z');

/** R7 U1 (odd/tasks/fase2-recorridos-auditoria.md, A4): the patient cancels with quick reasons, reception writes (A-2, D-8). */
describe('R7 U1 · cancelar cita con motivo rápido', () => {
  let t: TestApp;
  let patientId: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
    patientId = await t.patient({ linkPac: true, name: 'Lucía' });
  });
  afterAll(async () => { await t?.close(); });

  describe('A4 · cancelar con opciones rápidas (A-2, D-8)', () => {
    const tomorrowAt = (hour: number) => new Date(Date.UTC(2026, 10, 17, hour + 6));
    const appointmentFor = (patient: string, hour: number) => t.appointment(patient, tomorrowAt(hour));

    test('the patient cancels with "No puedo a esa hora" and no text; reception sees the code', async () => {
      const id = await appointmentFor(patientId, 10);
      const r = await t.call('PAC', 'POST', `/citas/${id}/cancelar`, { version: 1, reasonCode: 'no_puedo_a_esa_hora' });
      expect(r.status).toBe(201);
      expect(r.body.state).toBe('cancelada');
      const row = (await t.call('REC', 'GET', `/citas?patientId=${patientId}`)).body.find((a: any) => a.id === id);
      expect(row).toMatchObject({ state: 'cancelada', cancelReasonCode: 'no_puedo_a_esa_hora', cancelReason: null });
    });

    test('"Otro" asks for a short text; without a code the 10-character rule stays (older clients)', async () => {
      const a = await appointmentFor(patientId, 11);
      expect((await t.call('PAC', 'POST', `/citas/${a}/cancelar`, { version: 1, reasonCode: 'otro' })).status).toBe(400);
      expect((await t.call('PAC', 'POST', `/citas/${a}/cancelar`, { version: 1, reason: 'corto' })).status).toBe(400);
      expect((await t.call('PAC', 'POST', `/citas/${a}/cancelar`, { version: 1, reasonCode: 'otro', reason: 'Viaje' })).status).toBe(201);
      const b = await appointmentFor(patientId, 12);
      expect((await t.call('PAC', 'POST', `/citas/${b}/cancelar`, { version: 1, reason: 'Tengo un compromiso de trabajo' })).status).toBe(201);
    });

    test('reception keeps the free text: a code alone is refused, and the text is stored', async () => {
      const other = await t.patient();
      const id = await appointmentFor(other, 13);
      expect((await t.call('REC', 'POST', `/citas/${id}/cancelar`, { version: 1, reasonCode: 'ya_no_lo_necesito' })).status).toBe(400);
      expect((await t.call('REC', 'POST', `/citas/${id}/cancelar`, { version: 1, reason: 'Paciente llamó para cancelar' })).status).toBe(201);
      const row = (await t.call('REC', 'GET', `/citas?patientId=${other}`)).body.find((a: any) => a.id === id);
      expect(row).toMatchObject({ cancelReasonCode: null, cancelReason: 'Paciente llamó para cancelar' });
    });
  });
});
