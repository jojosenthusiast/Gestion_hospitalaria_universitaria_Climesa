import { proposeNext } from '../src/attention/attention.rules';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date('2026-11-17T16:00:00Z'); // 10:00 in El Salvador
const MIN = 60_000;
const at = (offsetMinutes: number) => new Date(now.valueOf() + offsetMinutes * MIN);

// Fase 2, flujo B (S9): per-area number, priority, cited vs walk-in, the "who goes next" rule, undo and the doctor handoff.
describe('Fase 2 · fila del día y tablero (S9)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
  });
  afterEach(() => t.setNow(now));
  afterAll(async () => { await t?.close(); });

  const issue = async (service: string, extra: Record<string, unknown> = {}) => {
    const r = await t.call('REC', 'POST', '/fila', { service, patientId: await t.patient(), ...extra });
    expect(r.status).toBe(201);
    return r.body;
  };
  const ticketOf = async (role: string, id: string) => (await t.call(role, 'GET', '/fila')).body.find((x: any) => x.id === id);

  test('the number counts per area from 1 and the list carries the area code', async () => {
    const lab1 = await issue('laboratorio');
    const lab2 = await issue('laboratorio');
    const emg1 = await issue('emergencia');
    expect([lab1.numero, lab2.numero, emg1.numero]).toEqual([1, 2, 1]);
    expect((await ticketOf('REC', lab2.id)).area).toBe('LAB');
    expect((await ticketOf('REC', emg1.id)).area).toBe('EMG');
  });

  test('priority defaults to rutina, is set at issue, and reception can change it; JOP cannot', async () => {
    const routine = await issue('admisiones');
    expect((await ticketOf('REC', routine.id)).priority).toBe('rutina');
    const urgent = await issue('admisiones', { priority: 'urgente' });
    expect((await ticketOf('REC', urgent.id)).priority).toBe('urgente');
    const changed = await t.call('REC', 'POST', `/fila/${routine.id}/prioridad`, { version: routine.version, priority: 'emergencia', reason: 'Dolor torácico' });
    expect(changed.status).toBe(201);
    expect(changed.body).toMatchObject({ id: routine.id, priority: 'emergencia' });
    expect((await ticketOf('REC', routine.id)).priority).toBe('emergencia');
    expect((await t.call('JOP', 'POST', `/fila/${routine.id}/prioridad`, { version: changed.body.version, priority: 'rutina' })).status).toBe(403);
    expect((await t.call('REC', 'POST', '/fila', { service: 'admisiones', patientId: await t.patient(), priority: 'maxima' })).status).toBe(400);
  });

  test('a patient with an appointment today shows its time; a walk-in shows none', async () => {
    const cited = await t.patient();
    await t.appointment(cited, at(30));
    const withAppointment = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: cited })).body;
    const walkIn = await issue('consulta_general');
    const a = await ticketOf('REC', withAppointment.id);
    expect(a.appointmentAt).toBe(at(30).toISOString());
    expect(a.walkIn).toBe(false);
    const b = await ticketOf('REC', walkIn.id);
    expect(b.appointmentAt).toBeNull();
    expect(b.walkIn).toBe(true);
  });

  describe('who goes next', () => {
    test('rule: emergencies, then urgent, then appointments inside their window, then arrival order', () => {
      const base = { appointmentAt: null as Date | null };
      const rows = [
        { id: 'walk-1', numero: 1, priority: 'rutina' as const, ...base },
        { id: 'late-cita', numero: 2, priority: 'rutina' as const, appointmentAt: at(-40) },
        { id: 'cita-in', numero: 3, priority: 'rutina' as const, appointmentAt: at(10) },
        { id: 'urg', numero: 4, priority: 'urgente' as const, ...base },
        { id: 'emg', numero: 5, priority: 'emergencia' as const, ...base },
      ];
      const order: string[] = [];
      let left = rows;
      for (;;) {
        const next = proposeNext(left, now);
        if (!next) break;
        order.push(`${next.ticket.id}:${next.reason}`);
        left = left.filter(r => r.id !== next.ticket.id);
      }
      expect(order).toEqual(['emg:emergencia', 'urg:urgente', 'cita-in:cita', 'walk-1:llegada', 'late-cita:llegada']);
      expect(proposeNext([], now)).toBeNull();
    });

    test('GET /fila/siguiente proposes by the rule and llamar-siguiente calls exactly that number', async () => {
      // A fresh area for this test: no other test issues EMG numbers after this point.
      const walk = await issue('emergencia');
      const urgent = await issue('emergencia', { priority: 'urgente' });
      const proposal = await t.call('REC', 'GET', '/fila/siguiente?service=emergencia');
      expect(proposal.status).toBe(200);
      expect(proposal.body.proposal).toMatchObject({ reason: 'urgente' });
      expect(proposal.body.rule).toMatch(/emergencias primero/i);
      // The first EMG number of the per-area test is still waiting and older than both.
      const called = await t.call('REC', 'POST', '/fila/llamar-siguiente', { service: 'emergencia' });
      expect(called.status).toBe(201);
      expect(called.body.id).toBe(urgent.id);
      expect(called.body.reason).toBe('urgente');
      const after = (await t.call('MED', 'GET', '/fila/siguiente?service=emergencia')).body.proposal;
      expect(after.reason).toBe('llegada');
      expect(after.numero).toBeLessThan(walk.numero + 1);
    });

    test('a patient account without the whole queue cannot read the proposal', async () => {
      expect((await t.call('PAC', 'GET', '/fila/siguiente?service=consulta_general')).status).toBe(403);
      expect((await t.call('REC', 'GET', '/fila/siguiente?service=otro')).status).toBe(400);
    });
  });

  describe('undo a call', () => {
    test('a called number goes back to waiting with one call less; attending it again needs a new call', async () => {
      const issued = await issue('laboratorio');
      const called = (await t.call('REC', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version })).body;
      expect((await ticketOf('REC', issued.id)).undoActions).toEqual(['deshacer_llamado']);
      const undone = await t.call('REC', 'POST', `/fila/${issued.id}/deshacer-llamado`, { version: called.version });
      expect(undone.status).toBe(201);
      expect(undone.body).toMatchObject({ id: issued.id, state: 'en_espera', llamados: 0 });
      const row = await ticketOf('REC', issued.id);
      expect(row.allowedActions).toEqual(['llamar']);
      expect(row.undoActions).toEqual([]);
      // The existing rule still holds: a waiting number is never attended without a call.
      const attend = await t.call('REC', 'POST', `/fila/${issued.id}/atender`, { version: undone.body.version });
      expect(attend.status).toBe(409);
      expect(attend.body.codigo).toBe('transicion_invalida');
      const again = await t.call('REC', 'POST', `/fila/${issued.id}/deshacer-llamado`, { version: undone.body.version });
      expect(again.status).toBe(409);
      expect(again.body.codigo).toBe('transicion_invalida');
      expect((await t.call('JOP', 'POST', `/fila/${issued.id}/deshacer-llamado`, { version: undone.body.version })).status).toBe(403);
    });

    test('the call → attend rule still holds after the change', async () => {
      const issued = await issue('admisiones');
      const called = (await t.call('REC', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version })).body;
      const attended = await t.call('REC', 'POST', `/fila/${issued.id}/atender`, { version: called.version });
      expect(attended.status).toBe(201);
      expect(attended.body.state).toBe('en_atencion');
      expect((await ticketOf('REC', issued.id)).undoActions).toEqual([]);
    });
  });

  // T10f (S13): the list tells the reader's own call from a colleague's, without exposing who the colleague is.
  describe('who called the number', () => {
    test('call-next by doctor A marks it as A\'s call only for A; a recall by B makes it B\'s', async () => {
      await issue('consulta_general');
      const next = await t.call('MED', 'POST', '/fila/llamar-siguiente', { service: 'consulta_general' });
      expect(next.status).toBe(201);
      const forA = await ticketOf('MED', next.body.id);
      const forB = await ticketOf('AST', next.body.id);
      expect([forA.state, forA.calledByMe]).toEqual(['llamado', true]);
      expect(forB.calledByMe).toBe(false);
      expect(forB).not.toHaveProperty('llamadoPor');
      expect(forB).not.toHaveProperty('calledBy');
      expect((await t.one<{ llamado_por: string }>('SELECT llamado_por FROM atencion.ticket_fila WHERE id=$1', [next.body.id])).llamado_por).toBe(await t.staffOf('MED'));

      const recalled = await t.call('AST', 'POST', `/fila/${next.body.id}/llamar`, { version: next.body.version });
      expect(recalled.status).toBe(201);
      expect((await ticketOf('AST', next.body.id)).calledByMe).toBe(true);
      expect((await ticketOf('MED', next.body.id)).calledByMe).toBe(false);
      expect((await ticketOf('REC', next.body.id)).calledByMe).toBe(false);
    });

    test('undoing the call clears who called it', async () => {
      const issued = await issue('laboratorio');
      const called = await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version });
      expect(called.status).toBe(201);
      expect((await ticketOf('MED', issued.id)).calledByMe).toBe(true);
      const undone = await t.call('MED', 'POST', `/fila/${issued.id}/deshacer-llamado`, { version: called.body.version });
      expect(undone.status).toBe(201);
      expect(undone.body.state).toBe('en_espera');
      expect((await ticketOf('MED', issued.id)).calledByMe).toBe(false);
      expect((await t.one<{ llamado_por: string | null }>('SELECT llamado_por FROM atencion.ticket_fila WHERE id=$1', [issued.id])).llamado_por).toBeNull();
    });
  });

  test('closing the consultation returns the next proposal of its area to the doctor', async () => {
    const issued = await issue('consulta_general');
    await t.call('MED', 'POST', `/fila/${issued.id}/llamar`, { version: issued.version });
    const waiting = await issue('consulta_general', { priority: 'emergencia' });
    const consultation = (await t.call('MED', 'POST', '/consultas', { ticketId: issued.id })).body;
    const saved = (await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Control', plan: 'Seguimiento' })).body;
    const signed = await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: saved.version });
    expect(signed.status).toBe(201);
    expect(signed.body.nextProposal).toMatchObject({ service: 'consulta_general', proposal: { id: waiting.id, reason: 'emergencia', area: 'CON' } });
  });

  test('call-next serializes per service: no SKIP LOCKED, an advisory lock first, and two concurrent calls get two numbers', async () => {
    // PGlite runs one connection, so a true two-session race cannot run here (it was reproduced on Postgres by the
    // verifier). This pins the lock shape that prevents it and the observable outcome of two overlapping requests.
    const service = 'emergencia';
    for (let i = 0; i < 3; i++) await issue(service);
    const sql: string[] = [];
    const original = t.pg.transaction.bind(t.pg);
    const spy = jest.spyOn(t.pg, 'transaction').mockImplementation(((work: any) => original(async (tx: any) => {
      const query = tx.query.bind(tx);
      tx.query = (text: string, params?: unknown[]) => { sql.push(text); return query(text, params); };
      return work(tx);
    })) as any);
    try {
      const [a, b] = await Promise.all([
        t.call('REC', 'POST', '/fila/llamar-siguiente', { service }),
        t.call('REC', 'POST', '/fila/llamar-siguiente', { service }),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.id).not.toBe(b.body.id);
    } finally { spy.mockRestore(); }
    expect(sql.some(text => /SKIP LOCKED/i.test(text))).toBe(false);
    const lock = sql.findIndex(text => /pg_advisory_xact_lock/.test(text));
    const read = sql.findIndex(text => /t\.estado='en_espera'/.test(text) && /FOR UPDATE/.test(text));
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThan(lock);
  });

  test('an appointment already attended does not mark a later number as cited (it is a walk-in)', async () => {
    const seen = await t.patient();
    await t.appointment(seen, at(-120), 'atendida');
    const back = (await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: seen })).body;
    const row = await ticketOf('REC', back.id);
    expect(row.walkIn).toBe(true);
    expect(row.appointmentAt).toBeNull();
  });
});
