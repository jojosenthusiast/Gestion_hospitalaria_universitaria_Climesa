import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);
// Fixed clock: Monday 16 Nov 2026, 09:00 in El Salvador. The doctor works only on Tuesday 17, 08:00-17:00 local.
const now = new Date('2026-11-16T15:00:00Z');
const MIN = 60_000;

/**
 * R7 U1 (odd/tasks/fase2-recorridos-auditoria.md): first free day for a request (A-1), quick cancel reasons of the
 * patient (tests in r7-mostrador-cancelar.spec.ts), today's appointment and number per patient search result (B-2).
 * The account link state (G-1, G-2) moved to vinculacion-por-correo.spec.ts: linking is automatic by verified email.
 */
describe('R7 U1 · mostrador: citas, búsqueda y vinculación', () => {
  let t: TestApp;
  let patientId: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
    patientId = await t.patient({ linkPac: true, name: 'Lucía' });
  });
  afterEach(async () => {
    t.setNow(now);
    await t.pg.query("UPDATE atencion.solicitud_cita SET estado='cancelada',resuelta_en=now() WHERE estado='pendiente'");
  });
  afterAll(async () => { await t?.close(); });

  describe('A2 · sugerencia del primer día con hueco (A-1)', () => {
    const ask = async (franja: string) => (await t.call('PAC', 'POST', '/citas/solicitudes-categoria', { categories: ['consulta_general'], franja })).body.id as string;

    test('an afternoon request opens on the first afternoon slot of the first day with a gap (tomorrow, not today)', async () => {
      const id = await ask('tarde');
      const r = await t.call('REC', 'GET', `/citas/solicitudes-categoria/${id}/sugerencia`);
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ found: true, doctorId: await t.staffOf('MED'), doctorName: 'MED Prueba', date: '2026-11-17', start: '2026-11-17T18:00:00.000Z', end: '2026-11-17T18:20:00.000Z' });
    });

    test('a morning request skips the slots already taken', async () => {
      const id = await ask('manana');
      await t.pg.query(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange('2026-11-17T14:00:00Z','2026-11-17T14:20:00Z','[)'),'confirmada','recepcion')`, [await t.patient(), await t.staffOf('MED')]);
      const r = await t.call('REC', 'GET', `/citas/solicitudes-categoria/${id}/sugerencia`);
      expect(r.body).toMatchObject({ found: true, start: '2026-11-17T14:20:00.000Z' });
      await t.pg.query(`DELETE FROM atencion.cita WHERE horario @> '2026-11-17T14:10:00Z'::timestamptz`);
    });

    test('without any shift in 14 days it says so; the patient cannot read it', async () => {
      const id = await ask('cualquiera');
      t.setNow(new Date('2026-11-18T15:00:00Z'));
      expect((await t.call('REC', 'GET', `/citas/solicitudes-categoria/${id}/sugerencia`)).body).toMatchObject({ found: false, doctorId: null, start: null });
      expect((await t.call('PAC', 'GET', `/citas/solicitudes-categoria/${id}/sugerencia`)).status).toBe(403);
    });
  });

  describe('B1 · búsqueda del mostrador (B-2)', () => {
    test('each selector result says whether the patient has an appointment today and a live number', async () => {
      t.setNow(new Date('2026-11-17T15:00:00Z')); // Tuesday 09:00, inside the shift
      const cited = await t.patient({ name: 'Mostradora' });
      const appointment = await t.appointment(cited, new Date('2026-11-17T16:00:00Z'));
      const walk = await t.patient({ name: 'Mostradorb' });
      const ticket = (await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: walk })).body;
      const find = async (id: string) => {
        const record = (await t.one('SELECT expediente FROM pacientes.paciente WHERE id=$1', [id])).expediente;
        return (await t.call('REC', 'GET', `/pacientes/selector?query=${encodeURIComponent(record)}&limit=10&offset=0`)).body.items.find((p: any) => p.id === id);
      };
      const a = await find(cited), b = await find(walk);
      expect(a.appointmentToday).toEqual({ id: appointment, start: '2026-11-17T16:00:00.000Z', doctorId: await t.staffOf('MED'), doctorName: 'MED Prueba' });
      expect(a.ticketToday).toBeNull();
      expect(b.appointmentToday).toBeNull();
      expect(b.ticketToday).toEqual({ id: ticket.id, service: 'laboratorio', numero: ticket.numero, state: 'en_espera', appointmentId: null });
    });

    test('each field needs its own global permission: LAB gets neither, MED (own agenda only) gets just the number', async () => {
      t.setNow(new Date('2026-11-17T15:00:00Z'));
      const lab = await t.call('LAB', 'GET', '/pacientes/selector?query=T-&limit=10&offset=0');
      expect(lab.status).toBe(200);
      expect(lab.body.items.length).toBeGreaterThan(0);
      for (const item of lab.body.items) { expect(item).not.toHaveProperty('appointmentToday'); expect(item).not.toHaveProperty('ticketToday'); }
      const med = await t.call('MED', 'GET', '/pacientes/selector?query=T-&limit=10&offset=0');
      for (const item of med.body.items) { expect(item).not.toHaveProperty('appointmentToday'); expect(item).toHaveProperty('ticketToday'); }
    });
  });
});
