import { AttentionSweepService } from '../src/attention/attention-sweep.service';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date('2026-11-16T15:00:00Z'); // 09:00 en El Salvador
const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (offsetMinutes: number) => new Date(now.valueOf() + offsetMinutes * MIN);
const slot = (start: Date) => ({ start: start.toISOString(), end: new Date(start.valueOf() + 20 * MIN).toISOString() });

// Auditoría final 2026-11-14, anexos 10, 12 y 14: fila del día (FILA-01 a 03, m-23) y citas (CITA-01 a 07, MA-CIT-02, MA-CIT-03, m-22).
describe('Fase 0/1 · fila y citas guiadas por el servidor', () => {
  let t: TestApp;
  let doctorId: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    doctorId = await t.staffOf('MED');
    // Jornadas del médico: hoy, mañana y pasado mañana de 08:00 a 17:00 hora local.
    for (const day of [0, 1, 2]) await t.shift('MED', new Date(Date.UTC(2026, 10, 16 + day, 14)), new Date(Date.UTC(2026, 10, 16 + day, 23)));
  });
  afterEach(() => t.setNow(now));
  afterAll(async () => { await t?.close(); });

  const ticketOf = async (role: string, id: string) => (await t.call(role, 'GET', '/fila')).body.find((x: any) => x.id === id);
  const appointmentOf = async (role: string, id: string) => (await t.call(role, 'GET', '/citas')).body.find((x: any) => x.id === id);

  describe('FILA-01 · "No se presentó" solo después de N llamados', () => {
    test('en espera nadie lo marca; tras cada llamado la fila dice cuántos faltan y el servidor coincide', async () => {
      const patientId = await t.patient();
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId })).body;
      const waiting = await ticketOf('REC', issued.id);
      expect(waiting.allowedActions).toEqual([]);
      expect(waiting.callsForAbsence).toBe(3);
      expect(waiting.maxCalls).toBe(3);
      const early = await t.call('REC', 'POST', `/fila/${issued.id}/no-se-presento`, { version: issued.version });
      expect(early.status).toBe(409);
      expect(early.body.detail).toMatch(/Llama el número/);

      let version = issued.version;
      const call = async () => { const r = await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version }); version = r.body.version; return r; };
      expect((await call()).status).toBe(201);
      const once = await ticketOf('REC', issued.id);
      expect(once.allowedActions).toEqual(['atender']);
      expect(once.blockedActions).toEqual([{ action: 'no_se_presento', reason: 'Disponible después de 3 llamados (van 1).' }]);
      const tooSoon = await t.call('REC', 'POST', `/fila/${issued.id}/no-se-presento`, { version });
      expect(tooSoon.status).toBe(409);
      expect(tooSoon.body.codigo).toBe('fila_llamados_insuficientes');

      await call(); await call();
      const thrice = await ticketOf('REC', issued.id);
      expect(thrice.allowedActions).toEqual(['atender', 'no_se_presento']);
      const doctorView = await ticketOf('MED', issued.id);
      expect(doctorView.blockedActions).toContainEqual({ action: 'llamar', reason: 'Ya se llamó 3 veces.' });
      const fourth = await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version });
      expect(fourth.status).toBe(409);
      expect(fourth.body.codigo).toBe('fila_max_llamados');
      expect((await t.call('REC', 'POST', `/fila/${issued.id}/no-se-presento`, { version, reason: 'No respondió a tres llamados' })).status).toBe(201);
    });

    test('la base rechaza "no se presentó" sin los llamados aunque la API no lo revise', async () => {
      const patientId = await t.patient();
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId })).body;
      await expect(t.pg.query("UPDATE atencion.ticket_fila SET estado='no_se_presento' WHERE id=$1", [issued.id])).rejects.toThrow(/transicion_invalida/);
      await t.pg.query("UPDATE atencion.ticket_fila SET estado='llamado',llamados=1 WHERE id=$1", [issued.id]);
      await expect(t.pg.query("UPDATE atencion.ticket_fila SET estado='no_se_presento' WHERE id=$1", [issued.id])).rejects.toThrow(/fila_llamados_insuficientes/);
      await expect(t.pg.query('UPDATE atencion.ticket_fila SET llamados=4 WHERE id=$1', [issued.id])).rejects.toThrow(/fila_max_llamados/);
    });
  });

  describe('FILA-02 · llamar siguiente', () => {
    test('llama el primer número en espera del servicio y avisa cuando no hay', async () => {
      const first = (await t.call('REC', 'POST', '/fila', { service: 'admisiones', patientId: await t.patient() })).body;
      await t.call('REC', 'POST', '/fila', { service: 'admisiones', patientId: await t.patient() });
      const next = await t.call('MED', 'POST', '/fila/llamar-siguiente', { service: 'admisiones' });
      expect(next.status).toBe(201);
      expect(next.body).toMatchObject({ id: first.id, numero: first.numero, state: 'llamado', llamados: 1 });
      expect((await t.call('MED', 'POST', '/fila/llamar-siguiente', { service: 'admisiones' })).status).toBe(201);
      const empty = await t.call('MED', 'POST', '/fila/llamar-siguiente', { service: 'admisiones' });
      expect(empty.status).toBe(409);
      expect(empty.body.codigo).toBe('fila_sin_espera');
      expect((await t.call('REC', 'POST', '/fila/llamar-siguiente', { service: 'admisiones' })).status).toBe(403);
    });
  });

  describe('FILA-03 · cierre del día', () => {
    test('los números abiertos de días anteriores se cierran al leer la fila, con auditoría', async () => {
      const waiting = await t.one(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id) VALUES('emergencia','2026-11-15',901,$1) RETURNING id`, [await t.patient()]);
      const called = await t.one(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,estado,llamados) VALUES('emergencia','2026-11-15',902,$1,'llamado',3) RETURNING id`, [await t.patient()]);
      expect((await t.call('REC', 'GET', '/fila')).status).toBe(200);
      expect((await t.one('SELECT estado FROM atencion.ticket_fila WHERE id=$1', [waiting.id])).estado).toBe('cerrado');
      expect((await t.one('SELECT estado FROM atencion.ticket_fila WHERE id=$1', [called.id])).estado).toBe('no_se_presento');
      expect((await t.audits('fila.cierre_del_dia')).some(a => a.detalle.ids.includes(waiting.id))).toBe(true);
    });
  });

  describe('m-23 · firmar cierra el número de fila', () => {
    test('la consulta iniciada desde la fila deja el número atendido al firmarse', async () => {
      const patientId = await t.patient();
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId })).body;
      await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version });
      const consultation = (await t.call('MED', 'POST', '/consultas', { ticketId: issued.id })).body;
      const saved = (await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Dolor de garganta', plan: 'Reposo y líquidos' })).body;
      const unsigned = await t.call('MED', 'GET', '/consultas/sin-firmar');
      expect(unsigned.status).toBe(200);
      expect(unsigned.body.map((x: any) => x.id)).toContain(consultation.id);
      expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: saved.version })).status).toBe(201);
      expect((await t.one('SELECT estado FROM atencion.ticket_fila WHERE id=$1', [issued.id])).estado).toBe('atendido');
      expect((await t.call('MED', 'GET', '/consultas/sin-firmar')).body.map((x: any) => x.id)).not.toContain(consultation.id);
    });
  });

  describe('CITA-01 y CITA-04 · acciones según estado, hora y rol', () => {
    test('el paciente ve hasta cuándo puede cancelar; dentro de las 2 h la acción viene bloqueada con motivo', async () => {
      const patientId = await t.patient({ linkPac: true });
      const soon = await t.appointment(patientId, at(60));
      const later = await t.appointment(patientId, at(300));
      const near = await appointmentOf('PAC', soon);
      expect(near.cancelableUntil).toBe(at(-60).toISOString());
      expect(near.allowedActions).toEqual([]);
      expect(near.blockedActions).toContainEqual({ action: 'cancelar', reason: 'Solo hasta 2 h antes (08:00); comunícate con recepción.' });
      const far = await appointmentOf('PAC', later);
      expect(far.allowedActions).toEqual(['cancelar', 'reprogramar']);
      expect(far.cancelableUntil).toBe(at(180).toISOString());
      const rec = await appointmentOf('REC', soon);
      expect(rec.allowedActions).toEqual(['cancelar', 'reprogramar']);
      expect(rec.blockedActions).toEqual([{ action: 'no_asistio', reason: 'Disponible cuando llegue la hora de la cita.' }]);
      const late = await t.call('PAC', 'POST', `/citas/${soon}/cancelar`, { version: 1, reason: 'No puedo asistir hoy' });
      expect(late.body.codigo).toBe('cancelacion_fuera_de_plazo');
    });

    test('CITA-05 · una solicitud no gestionada antes de su hora queda vencida y sin acciones', async () => {
      const patientId = await t.patient();
      const id = await t.appointment(patientId, at(-40), 'solicitada');
      const row = await appointmentOf('REC', id);
      expect(row.state).toBe('vencida');
      expect(row.allowedActions).toEqual([]);
    });

    test('CITA-06 · recepción rechaza una solicitud vigente; no la cancela', async () => {
      const id = await t.appointment(await t.patient(), new Date('2026-11-17T15:00:00Z'), 'solicitada');
      const row = await appointmentOf('REC', id);
      expect(row.allowedActions).toEqual(['confirmar', 'rechazar', 'reprogramar']);
    });
  });

  describe('CITA-02 · reprogramación', () => {
    test('el paciente solicita, la original sigue vigente y el médico acepta', async () => {
      const patientId = await t.patient({ linkPac: true });
      const id = await t.appointment(patientId, new Date('2026-11-17T16:00:00Z'));
      const asked = await t.call('PAC', 'POST', `/citas/${id}/reprogramar`, { version: 1, ...slot(new Date('2026-11-17T17:00:00Z')), reason: 'Tengo clases a esa hora' });
      expect(asked.status).toBe(201);
      expect(asked.body).toMatchObject({ id, state: 'confirmada', rescheduleState: 'pendiente' });
      const pending = await appointmentOf('PAC', id);
      expect(pending.state).toBe('confirmada');
      expect(pending.reschedule).toMatchObject({ state: 'pendiente', start: '2026-11-17T17:00:00.000Z', origin: 'paciente' });
      expect(pending.blockedActions).toContainEqual({ action: 'reprogramar', reason: 'Ya hay una solicitud de reprogramación pendiente.' });
      expect((await appointmentOf('REC', id)).allowedActions).toEqual(expect.arrayContaining(['aceptar_reprogramacion', 'rechazar_reprogramacion']));
      const rejectWithoutReason = await t.call('MED', 'POST', `/citas/reprogramaciones/${asked.body.rescheduleId}/rechazar`, { version: 1 });
      expect(rejectWithoutReason.status).toBe(400);
      const accepted = await t.call('MED', 'POST', `/citas/reprogramaciones/${asked.body.rescheduleId}/aceptar`, { version: 1 });
      expect(accepted.status).toBe(201);
      expect(accepted.body.rescheduleState).toBe('aceptada');
      const original = await t.one('SELECT estado FROM atencion.cita WHERE id=$1', [id]);
      expect(original.estado).toBe('reprogramada');
      const moved = await appointmentOf('PAC', accepted.body.id);
      expect(moved).toMatchObject({ state: 'confirmada', rescheduledFromId: id, start: '2026-11-17T17:00:00.000Z' });
      expect((await appointmentOf('PAC', id)).rescheduledToId).toBe(accepted.body.id);
    });

    test('recepción reprograma directo y el límite de reprogramaciones se respeta', async () => {
      const patientId = await t.patient();
      let id = await t.appointment(patientId, new Date('2026-11-18T16:00:00Z'));
      let version = 1;
      for (const hour of [17, 18]) {
        const moved = await t.call('REC', 'POST', `/citas/${id}/reprogramar`, { version, ...slot(new Date(`2026-11-18T${hour}:00:00Z`)) });
        expect(moved.status).toBe(201);
        expect(moved.body.rescheduleState).toBe('aceptada');
        id = moved.body.id; version = moved.body.version;
      }
      const row = await appointmentOf('REC', id);
      expect(row.blockedActions).toContainEqual({ action: 'reprogramar', reason: 'La cita ya se reprogramó 2 veces; cancélala y pide otra.' });
      const third = await t.call('REC', 'POST', `/citas/${id}/reprogramar`, { version, ...slot(new Date('2026-11-18T19:00:00Z')) });
      expect(third.status).toBe(409);
    });

    test('una solicitud pendiente vence sola cuando llega su hora', async () => {
      const patientId = await t.patient({ linkPac: true });
      const id = await t.appointment(patientId, new Date('2026-11-16T21:00:00Z'));
      const asked = await t.call('PAC', 'POST', `/citas/${id}/reprogramar`, { version: 1, ...slot(new Date('2026-11-16T19:00:00Z')) });
      expect(asked.status).toBe(201);
      t.setNow(new Date('2026-11-16T19:05:00Z'));
      const row = await appointmentOf('REC', id);
      expect(row.state).toBe('confirmada');
      expect(row.reschedule.state).toBe('vencida');
    });

    test('la franja del médico ocupada se rechaza', async () => {
      const a = await t.appointment(await t.patient(), new Date('2026-11-17T20:00:00Z'));
      await t.appointment(await t.patient(), new Date('2026-11-17T20:20:00Z'));
      const busy = await t.call('REC', 'POST', `/citas/${a}/reprogramar`, { version: 1, ...slot(new Date('2026-11-17T20:20:00Z')) });
      expect(busy.status).toBe(409);
      expect(busy.body.codigo).toBe('franja_ocupada');
    });
  });

  describe('CITA-07 · solicitudes pendientes por paciente', () => {
    test('la tercera solicitud simultánea se rechaza con un mensaje que propone reprogramar', async () => {
      await t.patient({ linkPac: true });
      const ask = (iso: string) => t.call('PAC', 'POST', '/citas/solicitudes', { doctorId, ...slot(new Date(iso)) });
      expect((await ask('2026-11-18T21:00:00Z')).status).toBe(201);
      expect((await ask('2026-11-18T21:20:00Z')).status).toBe(201);
      const third = await ask('2026-11-18T21:40:00Z');
      expect(third.status).toBe(409);
      expect(third.body.codigo).toBe('solicitudes_pendientes_max');
    });
  });

  describe('MA-CIT-02 y MA-CIT-03 · no asistió y consulta solo el día de la cita', () => {
    test('"No asistió" solo cuando llegó la hora; las de días anteriores se cierran solas', async () => {
      const id = await t.appointment(await t.patient(), new Date('2026-11-16T20:20:00Z'));
      expect((await t.call('REC', 'POST', `/citas/${id}/no-asistio`, { version: 1 })).status).toBe(409);
      t.setNow(new Date('2026-11-16T20:30:00Z'));
      const marked = await t.call('REC', 'POST', `/citas/${id}/no-asistio`, { version: 1, reason: 'No llegó' });
      expect(marked.status).toBe(201);
      expect(marked.body.state).toBe('no_asistio');
      const old = await t.one(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange('2026-11-14T15:00:00Z','2026-11-14T15:20:00Z','[)'),'confirmada','recepcion') RETURNING id`, [await t.patient(), doctorId]);
      await t.call('REC', 'GET', '/citas');
      expect((await t.one('SELECT estado FROM atencion.cita WHERE id=$1', [old.id])).estado).toBe('no_asistio');
    });

    test('no se inicia la consulta antes del día de la cita y una cita con consulta no se cancela', async () => {
      const patientId = await t.patient();
      const tomorrow = await t.appointment(patientId, new Date('2026-11-17T22:00:00Z'));
      const early = await t.call('MED', 'POST', '/consultas', { appointmentId: tomorrow });
      expect(early.status).toBe(409);
      expect(early.body.codigo).toBe('cita_fuera_de_dia');
      const agenda = (await t.call('MED', 'GET', '/consultas/agenda')).body.find((x: any) => x.appointmentId === tomorrow);
      expect(agenda.allowedActions).toEqual([]);
      expect(agenda.blockedActions).toEqual([{ action: 'iniciar_consulta', reason: 'La consulta se inicia el día de la cita.' }]);
      const today = await t.appointment(patientId, new Date('2026-11-16T22:00:00Z'));
      expect((await t.call('MED', 'POST', '/consultas', { appointmentId: today })).status).toBe(201);
      const cancel = await t.call('REC', 'POST', `/citas/${today}/cancelar`, { version: 1, reason: 'Prueba de cancelación' });
      expect(cancel.status).toBe(409);
      expect(cancel.body.codigo).toBe('cita_con_consulta');
      await expect(t.pg.query("UPDATE atencion.cita SET estado='cancelada' WHERE id=$1", [today])).rejects.toThrow(/cita_con_consulta/);
    });
  });
  // Revisión independiente del PR #115.
  describe('revisión PR #115 · bordes del barrido y de los comandos', () => {
    test('una cita cuyo paciente se atendió desde la fila ese día cuenta como atendida', async () => {
      const patientId = await t.patient();
      const id = await t.appointment(patientId, new Date('2026-11-16T17:30:00Z'));
      const issued = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId })).body;
      await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version });
      expect((await t.call('MED', 'POST', '/consultas', { ticketId: issued.id })).status).toBe(201);
      const row = await appointmentOf('REC', id);
      expect(row.allowedActions).not.toContain('cancelar');
      expect(row.blockedActions).toContainEqual({ action: 'cancelar', reason: 'La consulta ya empezó.' });
      const cancel = await t.call('REC', 'POST', `/citas/${id}/cancelar`, { version: 1, reason: 'Prueba de cancelación' });
      expect(cancel.body.codigo).toBe('cita_con_consulta');
      await expect(t.pg.query("UPDATE atencion.cita SET estado='no_asistio' WHERE id=$1", [id])).rejects.toThrow(/cita_con_consulta/);
      // Al día siguiente el barrido no la marca "no asistió" ni cierra el número con la consulta abierta.
      t.setNow(new Date('2026-11-17T15:00:00Z'));
      await t.call('REC', 'GET', '/citas');
      await t.call('REC', 'GET', '/fila');
      expect((await t.one('SELECT estado FROM atencion.cita WHERE id=$1', [id])).estado).toBe('confirmada');
      expect((await t.one('SELECT estado FROM atencion.ticket_fila WHERE id=$1', [issued.id])).estado).toBe('en_atencion');
    });

    test('no se inicia una consulta con un número de un día anterior', async () => {
      const old = await t.one(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,estado,llamados) VALUES('consulta_general','2026-11-15',950,$1,'llamado',1) RETURNING id`, [await t.patient()]);
      const started = await t.call('MED', 'POST', '/consultas', { ticketId: old.id });
      expect(started.status).toBe(409);
      expect(started.body.codigo).toBe('transicion_invalida');
    });

    test('una solicitud cuya hora ya llegó no se confirma ni se rechaza', async () => {
      const id = await t.appointment(await t.patient(), at(-10), 'solicitada');
      const confirm = await t.call('REC', 'POST', `/citas/solicitudes/${id}/confirmar`, { version: 1 });
      expect(confirm.status).toBe(409);
      const reject = await t.call('REC', 'POST', `/citas/solicitudes/${id}/rechazar`, { version: 1, rejectionReason: 'Sin cupo para esa hora' });
      expect(reject.status).toBe(409);
    });

    test('CITA-06 · recepción no cancela una solicitud; la rechaza', async () => {
      const id = await t.appointment(await t.patient(), new Date('2026-11-19T15:00:00Z'), 'solicitada');
      const cancel = await t.call('REC', 'POST', `/citas/${id}/cancelar`, { version: 1, reason: 'Prueba de cancelación' });
      expect(cancel.status).toBe(409);
      expect(cancel.body.codigo).toBe('transicion_invalida');
    });

    test('cancelar vence la solicitud de reprogramación pendiente', async () => {
      const patientId = await t.patient({ linkPac: true });
      const id = await t.appointment(patientId, new Date('2026-11-18T14:20:00Z'));
      const asked = (await t.call('PAC', 'POST', `/citas/${id}/reprogramar`, { version: 1, ...slot(new Date('2026-11-18T14:40:00Z')) })).body;
      expect((await t.call('PAC', 'POST', `/citas/${id}/cancelar`, { version: asked.version, reason: 'Ya no necesito la cita' })).status).toBe(201);
      expect((await t.one('SELECT estado FROM atencion.reprogramacion WHERE id=$1', [asked.rescheduleId])).estado).toBe('vencida');
    });

    test('si el barrido falla, la fila y las citas se leen igual', async () => {
      const sweeper = t.app.get(AttentionSweepService);
      const spy = jest.spyOn(sweeper, 'sweep').mockRejectedValue(new Error('canceling statement due to lock timeout'));
      try {
        expect((await t.call('REC', 'GET', '/fila')).status).toBe(200);
        expect((await t.call('REC', 'GET', '/citas')).status).toBe(200);
      } finally { spy.mockRestore(); }
    });
  });
});
