import { proposeNextFor } from '../src/attention/attention.rules';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
// Fixed clock: 10:00 in El Salvador on a Tuesday, far from midnight in both time zones.
const now = new Date('2026-11-17T16:00:00Z');
const MIN = 60_000;
const at = (offsetMinutes: number) => new Date(now.valueOf() + offsetMinutes * MIN);

/**
 * R7 U1 (odd/tasks/fase2-recorridos-auditoria.md, B1-B3): arrival from the appointment (D-1, B-1), the doctor of the
 * appointment in the queue and in "call next" (B-4, D-2), voiding a fresh number (B-3) and the caller's post (B-5).
 */
describe('R7 U1 · mostrador: llegada con cita y fila', () => {
  let t: TestApp;
  let otherDoctor: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
    otherDoctor = (await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otra','Médica Prueba','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`)).id;
  });
  afterEach(() => t.setNow(now));
  afterAll(async () => { await t?.close(); });

  const ticketOf = async (role: string, id: string) => (await t.call(role, 'GET', '/fila')).body.find((x: any) => x.id === id);
  const appointmentWith = async (doctorId: string, patientId: string, start: Date) => (await t.one<{ id: string }>(
    `INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$3::timestamptz+interval '20 minutes','[)'),'confirmada','recepcion') RETURNING id`,
    [patientId, doctorId, start])).id;
  const closeWaiting = async (service: string) => t.pg.query(`UPDATE atencion.ticket_fila SET estado='cerrado' WHERE servicio=$1 AND estado='en_espera'`, [service]);

  describe('B1 · registrar llegada desde la cita (D-1, B-1)', () => {
    test('REC registers the arrival with one call: the number is linked, shows the appointment and doctor, and says how many wait before it', async () => {
      await closeWaiting('consulta_general');
      const walkIn = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() });
      const patient = await t.patient({ name: 'Ana' });
      const appointment = await t.appointment(patient, at(120));
      const r = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ patientId: patient, appointmentId: appointment, area: 'CON', ahead: 1, patientName: 'Ana Ficticio' });
      expect(r.body.numero).toBe(walkIn.body.numero + 1);
      const row = await ticketOf('REC', r.body.id);
      expect(row).toMatchObject({ appointmentId: appointment, appointmentAt: at(120).toISOString(), appointmentDoctorName: 'MED Prueba', arrivalFromAppointment: true, walkIn: false });
      expect(row.appointmentDoctorId).toBe(await t.staffOf('MED'));
      // The queue row carries the same count, so the patient's "Mi turno" reads it from the server.
      expect(row.ahead).toBe(1);
      expect((await ticketOf('REC', walkIn.body.id)).ahead).toBe(0);
      await t.pg.query(`UPDATE atencion.ticket_fila SET estado='cerrado' WHERE id=$1`, [walkIn.body.id]);
      expect((await ticketOf('REC', r.body.id)).ahead).toBe(0);
      expect((await ticketOf('REC', walkIn.body.id)).ahead).toBeNull();
    });

    test('a second arrival for the same appointment is refused with the number already given', async () => {
      const patient = await t.patient();
      const appointment = await t.appointment(patient, at(140));
      const first = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment });
      const again = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment });
      expect(again.status).toBe(409);
      expect(again.body.codigo).toBe('ticket_activo_existente');
      expect(again.body.detail).toContain(String(first.body.numero));
    });

    test('an appointment of another day, of another patient or not confirmed is refused', async () => {
      const patient = await t.patient();
      const tomorrow = await t.appointment(patient, at(24 * 60));
      expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: tomorrow })).body.codigo).toBe('cita_fuera_de_dia');
      const today = await t.appointment(await t.patient(), at(160));
      const mismatch = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: today, patientId: patient });
      expect(mismatch.status).toBe(400);
      const requested = await t.appointment(await t.patient(), at(180), 'solicitada');
      expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: requested })).body.codigo).toBe('transicion_invalida');
      expect((await t.call('REC', 'POST', '/fila', { service: 'laboratorio', appointmentId: today })).status).toBe(400);
    });

    test('a number issued without appointmentId keeps working exactly as before (mobile clients)', async () => {
      const r = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: await t.patient() });
      expect(r.status).toBe(201);
      expect(r.body.appointmentId).toBeNull();
      expect((await ticketOf('REC', r.body.id)).arrivalFromAppointment).toBe(false);
    });
  });

  describe('B4 · firmar cierra la cita y el número (B-1)', () => {
    const sign = async (id: string) => {
      const detail = (await t.call('MED', 'PATCH', `/consultas/${id}`, { version: 1, reason: 'Control de rutina', plan: 'Seguimiento en un mes' })).body;
      return t.call('MED', 'POST', `/consultas/${id}/firmar`, { version: detail.version });
    };

    test('MED starts from the agenda: the arrival number moves into attention and signing closes it as attended', async () => {
      const patient = await t.patient();
      const appointment = await t.appointment(patient, at(-45));
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment })).body;
      const started = await t.call('MED', 'POST', '/consultas', { appointmentId: appointment });
      expect(started.status).toBe(201);
      expect(started.body).toMatchObject({ appointmentId: appointment, ticketId: issued.id });
      expect((await ticketOf('REC', issued.id)).state).toBe('en_atencion');
      expect((await sign(started.body.id)).status).toBe(201);
      expect((await ticketOf('REC', issued.id)).state).toBe('atendido');
      expect((await t.one('SELECT estado FROM atencion.cita WHERE id=$1', [appointment])).estado).toBe('atendida');
    });

    test('MED starts from the called number: the appointment is attended on signing (not "no asistió")', async () => {
      const patient = await t.patient();
      const appointment = await t.appointment(patient, at(-65));
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment })).body;
      const called = await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version });
      const started = await t.call('MED', 'POST', '/consultas', { ticketId: issued.id });
      expect(called.status).toBe(201);
      expect(started.body).toMatchObject({ appointmentId: appointment, ticketId: issued.id });
      expect((await sign(started.body.id)).status).toBe(201);
      expect((await t.one('SELECT estado FROM atencion.cita WHERE id=$1', [appointment])).estado).toBe('atendida');
      expect((await ticketOf('REC', issued.id)).state).toBe('atendido');
    });
  });

  describe('B2 · llamar siguiente: primero las citas propias (D-2, B-4)', () => {
    test('rule: own appointment in its window first; another doctor\'s appointment in its window waits for that doctor', () => {
      const rows = [
        { id: 'walk', numero: 1, priority: 'rutina', appointmentAt: null, appointmentDoctorId: null },
        { id: 'other', numero: 2, priority: 'rutina', appointmentAt: at(5), appointmentDoctorId: 'B' },
        { id: 'mine', numero: 3, priority: 'rutina', appointmentAt: at(10), appointmentDoctorId: 'A' },
      ];
      expect(proposeNextFor(rows, now, 'A')).toMatchObject({ ticket: { id: 'mine' }, reason: 'cita', own: true });
      expect(proposeNextFor(rows.filter(r => r.id !== 'mine'), now, 'A')).toMatchObject({ ticket: { id: 'walk' }, own: false });
      expect(proposeNextFor([rows[1]], now, 'A')).toBeNull();
      expect(proposeNextFor(rows, now, null)).toMatchObject({ ticket: { id: 'other' }, reason: 'cita', own: false });
      // Outside its window the other doctor's patient is just arrival order again.
      expect(proposeNextFor([rows[1]], at(60), 'A')).toMatchObject({ ticket: { id: 'other' }, reason: 'llegada' });
    });

    test('MED gets their own cited patient; P cited with another doctor does not come out for MED while the window is open', async () => {
      await closeWaiting('consulta_general');
      const p = await t.patient({ name: 'Pe' });
      const theirs = await appointmentWith(otherDoctor, p, at(5));
      const pTicket = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: theirs })).body;
      expect((await ticketOf('REC', pTicket.id)).appointmentDoctorName).toBe('Otra Médica Prueba');
      const none = await t.call('MED', 'POST', '/fila/llamar-siguiente', { service: 'consulta_general' });
      expect(none.status).toBe(409);
      expect(none.body.detail).toBe('Quienes esperan tienen cita con otro médico en este momento.');
      const proposal = await t.call('MED', 'GET', '/fila/siguiente?service=consulta_general');
      expect(proposal.body.proposal).toBeNull();
      expect(proposal.body.rule).toContain('Primero tus citas');

      const mine = await t.patient({ name: 'Mia' });
      const ownAppointment = await t.appointment(mine, at(10));
      await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() });
      const ownTicket = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: ownAppointment })).body;
      const called = await t.call('MED', 'POST', '/fila/llamar-siguiente', { service: 'consulta_general' });
      expect(called.status).toBe(201);
      expect(called.body).toMatchObject({ id: ownTicket.id, reason: 'cita', ownAppointment: true });
      expect(called.body.reasonText).toMatch(/^Tu cita de las/);

      // Reception keeps the general rule: P (cited, inside the window) goes before the walk-in.
      const rec = await t.call('REC', 'POST', '/fila/llamar-siguiente', { service: 'consulta_general' });
      expect(rec.body).toMatchObject({ id: pTicket.id, reason: 'cita', ownAppointment: false });
    });
  });

  describe('B1 · anular un número recién emitido (B-3)', () => {
    test('the issuer voids a waiting number within 10 minutes; nobody else, not later and not once called', async () => {
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'admisiones', patientId: await t.patient() })).body;
      expect(issued.voidableUntil).toBe(new Date(new Date((await ticketOf('REC', issued.id)).issuedAt).valueOf() + 10 * MIN).toISOString());
      expect((await ticketOf('REC', issued.id)).voidableUntil).toBe(issued.voidableUntil);
      expect((await ticketOf('JOP', issued.id)).voidableUntil).toBeNull();
      expect((await t.call('MED', 'POST', `/fila/${issued.id}/anular`, { version: issued.version })).status).toBe(403);
      const voided = await t.call('REC', 'POST', `/fila/${issued.id}/anular`, { version: issued.version });
      expect(voided.status).toBe(201);
      expect(voided.body.state).toBe('cerrado');
      expect((await t.audits('fila.anular')).at(-1)).toMatchObject({ resultado: 'exito' });

      const late = (await t.call('REC', 'POST', '/fila', { service: 'admisiones', patientId: await t.patient() })).body;
      t.setNow(new Date(Date.parse(late.voidableUntil) + MIN));
      expect((await t.call('REC', 'POST', `/fila/${late.id}/anular`, { version: late.version })).body.codigo).toBe('transicion_invalida');
      t.setNow(now);
      const called = (await t.call('REC', 'POST', `/fila/${late.id}/llamar`, { version: late.version })).body;
      expect((await t.call('REC', 'POST', `/fila/${late.id}/anular`, { version: called.version })).body.codigo).toBe('transicion_invalida');
    });

    test('voiding an arrival frees the appointment for a new arrival', async () => {
      const appointment = await t.appointment(await t.patient(), at(200));
      const first = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment })).body;
      expect((await t.call('REC', 'POST', `/fila/${first.id}/anular`, { version: first.version })).status).toBe(201);
      expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', appointmentId: appointment })).status).toBe(201);
    });
  });

  test('B3 · mi puesto: the doctor\'s shift area gives the service of "Llamar siguiente" (B-5)', async () => {
    const post = await t.call('MED', 'GET', '/fila/mi-puesto');
    expect(post.status).toBe(200);
    expect(post.body).toMatchObject({ service: 'consulta_general', area: 'CON', areaName: expect.any(String) });
    const rec = await t.call('REC', 'GET', '/fila/mi-puesto');
    expect(rec.body).toMatchObject({ service: null, officeId: null });
    expect((await t.call('PAC', 'GET', '/fila/mi-puesto')).status).toBe(403);
  });
});
