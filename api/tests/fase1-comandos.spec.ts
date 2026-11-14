import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const MINUTE = 60_000;
const now = new Date(Math.floor(Date.now() / (20 * MINUTE)) * 20 * MINUTE);

/**
 * Fase 1 · contrato de comandos: idempotencia por intención con id de entidad (CON-07, API-11), códigos estables de
 * conflicto (CON-02), máquina de estados de la cita (API-09), versión obligatoria (API-10) y consulta desde la fila (API-08).
 */
describe('Fase 1 · comandos (CON-02, CON-07, API-08..11)', () => {
  let t: TestApp;
  let doctorId: string;
  let slotIndex = 0;
  const shiftStart = new Date(now.valueOf() + 4 * 60 * MINUTE);
  const slot = () => { const start = new Date(shiftStart.valueOf() + 20 * MINUTE * slotIndex++); return { start, end: new Date(start.valueOf() + 20 * MINUTE) }; };
  const requested = async (state = 'solicitada', at = slot()) => (await t.one<{ id: string }>(
    `INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$4::timestamptz,'[)'),$5,'paciente') RETURNING id`,
    [await t.patient(), doctorId, at.start, at.end, state])).id;

  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    doctorId = await t.staffOf('MED');
    await t.shift('MED', shiftStart, new Date(shiftStart.valueOf() + 8 * 60 * MINUTE));
  });
  afterAll(async () => { await t?.close(); });

  describe('idempotencia (CON-07, API-11)', () => {
    test('la misma clave y el mismo cuerpo sobre otra cita no devuelven la respuesta guardada de la primera', async () => {
      const [first, second] = [await requested(), await requested()];
      const key = `intencion-${randomUUID()}`;
      const a = await t.call('REC', 'POST', `/citas/solicitudes/${first}/confirmar`, { version: 1 }, key);
      const b = await t.call('REC', 'POST', `/citas/solicitudes/${second}/confirmar`, { version: 1 }, key);
      expect([a.status, a.body.id]).toEqual([201, first]);
      expect([b.status, b.body.id]).toEqual([201, second]);
      expect((await t.one<{ estado: string }>('SELECT estado FROM atencion.cita WHERE id=$1', [second])).estado).toBe('confirmada');
    });

    test('reintentar la misma intención devuelve la misma respuesta; la misma clave con otro cuerpo es 409', async () => {
      const id = await requested();
      const key = `intencion-${randomUUID()}`;
      const first = await t.call('REC', 'POST', `/citas/solicitudes/${id}/confirmar`, { version: 1 }, key);
      const retry = await t.call('REC', 'POST', `/citas/solicitudes/${id}/confirmar`, { version: 1 }, key);
      expect(retry).toEqual(first);
      const other = await t.call('REC', 'POST', `/citas/solicitudes/${id}/confirmar`, { version: 2 }, key);
      expect([other.status, other.body.codigo]).toEqual([409, 'idempotencia_conflicto']);
    });
  });

  describe('citas: estados y códigos (API-09, API-10, CON-02)', () => {
    test('confirmar y rechazar exigen versión y solo aplican a una solicitud', async () => {
      const id = await requested('confirmada');
      expect((await t.call('REC', 'POST', `/citas/solicitudes/${id}/confirmar`, {})).status).toBe(400);
      for (const action of ['confirmar', 'rechazar']) {
        const response = await t.call('REC', 'POST', `/citas/solicitudes/${id}/${action}`, { version: 1, rejectionReason: 'El médico no atiende esa franja' });
        expect([action, response.status, response.body.codigo]).toEqual([action, 409, 'transicion_invalida']);
      }
    });

    test('la base rechaza transiciones fuera de la máquina de estados', async () => {
      const id = await requested('cancelada');
      await expect(t.pg.query("UPDATE atencion.cita SET estado='confirmada' WHERE id=$1", [id])).rejects.toThrow(/transicion_invalida/);
      const attended = await requested('confirmada');
      await t.pg.query("UPDATE atencion.cita SET estado='atendida' WHERE id=$1", [attended]);
      await expect(t.pg.query("UPDATE atencion.cita SET estado='cancelada' WHERE id=$1", [attended])).rejects.toThrow(/transicion_invalida/);
    });

    test('no se cancela una cita que ya empezó; el paciente cancela hasta 2 h antes (RN-21)', async () => {
      const past = await requested('confirmada', { start: new Date(now.valueOf() - 60 * MINUTE), end: new Date(now.valueOf() - 40 * MINUTE) });
      const late = await t.call('REC', 'POST', `/citas/${past}/cancelar`, { version: 1, reason: 'El paciente avisó tarde' });
      expect([late.status, late.body.codigo]).toEqual([409, 'transicion_invalida']);
      const patientId = await t.patient({ linkPac: true });
      const soon = (await t.one<{ id: string }>(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$3::timestamptz+interval '20 minutes','[)'),'confirmada','paciente') RETURNING id`, [patientId, doctorId, new Date(now.valueOf() + 60 * MINUTE)])).id;
      const own = await t.call('PAC', 'POST', `/citas/${soon}/cancelar`, { version: 1, reason: 'Tengo un compromiso de trabajo' });
      expect([own.status, own.body.codigo]).toEqual([409, 'cancelacion_fuera_de_plazo']);
      expect((await t.call('REC', 'POST', `/citas/${soon}/cancelar`, { version: 1, reason: 'Recepción reprograma por llamada' })).status).toBe(201);
      await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [(await t.one<{ id: string }>("SELECT id FROM acceso.usuario WHERE paciente_id=$1", [patientId])).id]);
    });

    test('los conflictos de agenda tienen código propio', async () => {
      const at = slot();
      const body = (patientId: string) => ({ patientId, doctorId, start: at.start.toISOString(), end: at.end.toISOString() });
      const patientId = await t.patient();
      expect((await t.call('REC', 'POST', '/citas', body(patientId))).status).toBe(201);
      const taken = await t.call('REC', 'POST', '/citas', body(await t.patient()));
      expect([taken.status, taken.body.codigo]).toEqual([409, 'franja_ocupada']);
      const outside = new Date(shiftStart.valueOf() + 10 * 60 * MINUTE);
      const noShift = await t.call('REC', 'POST', '/citas', { patientId, doctorId, start: outside.toISOString(), end: new Date(outside.valueOf() + 20 * MINUTE).toISOString() });
      expect([noShift.status, noShift.body.codigo]).toEqual([409, 'medico_sin_jornada']);
    });
  });

  describe('consulta desde la fila (API-08, RN-22)', () => {
    const ticket = async () => {
      const issued = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() });
      expect(issued.status).toBe(201);
      return issued.body as { id: string; version: number };
    };

    test('un número llamado inicia la consulta, pasa a atención y no se inicia dos veces', async () => {
      const issued = await ticket();
      const waiting = await t.call('MED', 'POST', '/consultas', { ticketId: issued.id });
      expect([waiting.status, waiting.body.codigo]).toEqual([409, 'transicion_invalida']);
      const called = await t.call('AST', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version });
      const started = await t.call('MED', 'POST', '/consultas', { ticketId: issued.id });
      expect(started.status).toBe(201);
      expect(started.body).toEqual(expect.objectContaining({ ticketId: issued.id, appointmentId: null, state: 'abierta' }));
      expect((await t.one<{ estado: string; version: number }>('SELECT estado,version FROM atencion.ticket_fila WHERE id=$1', [issued.id]))).toEqual({ estado: 'en_atencion', version: called.body.version + 1 });
      expect((await t.one<{ n: number }>("SELECT count(*)::int AS n FROM atencion.relacion_atencion WHERE origen='consulta' AND origen_id=$1", [started.body.id])).n).toBe(1);
      const again = await t.call('MED', 'POST', '/consultas', { ticketId: issued.id });
      expect([again.status, again.body.codigo]).toEqual([409, 'consulta_ya_iniciada']);
    });

    test('exige exactamente un origen: cita o número de fila', async () => {
      expect((await t.call('MED', 'POST', '/consultas', {})).status).toBe(400);
      expect((await t.call('MED', 'POST', '/consultas', { ticketId: randomUUID(), appointmentId: randomUUID() })).status).toBe(400);
    });
  });

  describe('versión en laboratorio y hospitalización (API-10)', () => {
    test('el resultado compara y sube la versión de la orden', async () => {
      const patientId = await t.patient({ name: 'Version' });
      const consultation = await t.consultation(patientId);
      const exam = await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'");
      const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [exam.id] });
      const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
      const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente: record, nombreCompleto: 'Version Ficticio' });
      const item = await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [order.body.id]);
      const stale = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: item.id, value: 13.2, version: order.body.version });
      expect([stale.status, stale.body.codigo, stale.body.versionActual]).toEqual([409, 'version_conflicto', sample.body.version]);
      const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: item.id, value: 13.2, version: sample.body.version });
      expect([saved.status, saved.body.orderVersion]).toEqual([201, sample.body.version + 1]);
      expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/completar`, { version: saved.body.orderVersion })).status).toBe(201);
    });

    test('autorizar una admisión exige y compara la versión', async () => {
      const created = await t.call('REC', 'POST', '/admisiones', { patientId: await t.patient(), origin: 'emergencia', originId: randomUUID(), requestedCategory: 'semiprivada', isolation: false, attendingDoctorId: doctorId });
      const path = `/admisiones/${created.body.id}/autorizar`;
      const reason = 'Autorización de ingreso por emergencia';
      expect((await t.call('JOP', 'POST', path, { reason })).status).toBe(400);
      const stale = await t.call('JOP', 'POST', path, { reason, version: created.body.version + 1 });
      expect([stale.status, stale.body.codigo]).toEqual([409, 'version_conflicto']);
      expect((await t.call('JOP', 'POST', path, { reason, version: created.body.version })).status).toBe(201);
    });
  });
});
