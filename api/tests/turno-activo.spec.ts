import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(180000);
const MINUTE = 60_000, HOUR = 60 * MINUTE;
// Midday local (UTC-6) so the business day never changes inside the test.
const now = new Date('2026-12-02T18:00:00Z');
const message = 'No tienes un turno activo. Pide a Jefatura que publique tu turno.';

describe('Lote 5 S9 · comandos operativos solo con turno activo', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now, { shiftGate: true }); });
  afterAll(async () => { await t?.close(); });
  afterEach(async () => { t.setNow(now); await t.pg.query('DELETE FROM personal.turno'); });

  const issue = async (key?: string) => t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() }, key);

  test('REC sin turno: 403 sin_turno_activo con el mensaje, y no se escribe nada', async () => {
    const before = (await t.one<{ n: number }>('SELECT count(*)::int AS n FROM atencion.ticket_fila')).n;
    const refused = await issue();
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ codigo: 'sin_turno_activo', detail: message });
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM atencion.ticket_fila')).n).toBe(before);
    // Reads stay allowed.
    expect((await t.call('REC', 'GET', '/fila')).status).toBe(200);
  });

  test('con turno publicado que cubre la hora, el comando pasa; el margen de 30 min vale antes del inicio y después del fin', async () => {
    await t.shift('REC', new Date(now.valueOf() + 20 * MINUTE), new Date(now.valueOf() + 8 * HOUR));
    expect((await issue()).status).toBe(201); // 20 min before the start
    t.setNow(new Date(now.valueOf() + 8 * HOUR + 25 * MINUTE));
    expect((await issue()).status).toBe(201); // 25 min after the end
    t.setNow(new Date(now.valueOf() + 8 * HOUR + 31 * MINUTE));
    expect((await issue()).status).toBe(403);
    t.setNow(now);
    await t.pg.query('DELETE FROM personal.turno');
    await t.shift('REC', new Date(now.valueOf() + 31 * MINUTE), new Date(now.valueOf() + 8 * HOUR));
    expect((await issue()).body.codigo).toBe('sin_turno_activo'); // 31 min before the start
  });

  test('un turno en borrador, cancelado o ausente no cuenta', async () => {
    for (const state of ['borrador', 'cancelado', 'ausente']) {
      await t.shift('REC', new Date(now.valueOf() - HOUR), new Date(now.valueOf() + 4 * HOUR));
      await t.pg.query(`UPDATE personal.turno SET estado=$1,presente_desde=NULL,ausencia_tipo=CASE WHEN $1='ausente' THEN 'justificada' END,asistencia_motivo=CASE WHEN $1='ausente' THEN 'Incapacidad médica del día' END`, [state]);
      expect({ state, status: (await issue()).status }).toEqual({ state, status: 403 });
      await t.pg.query('DELETE FROM personal.turno');
    }
  });

  test('MED, ENF, AST y PAR también necesitan turno; ADM y JOP no', async () => {
    const patientId = await t.patient();
    const vitals = { heartRate: 80, note: 'Control' };
    for (const role of ['AST', 'ENF', 'MED', 'PAR']) {
      const r = await t.call(role, 'POST', `/pacientes/${patientId}/signos`, vitals);
      expect({ role, codigo: r.body?.codigo }).toEqual({ role, codigo: 'sin_turno_activo' });
    }
    const block = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: 1, inMaintenance: true, reason: 'Revisión sin turno de Jefatura' });
    expect(block.body?.codigo).not.toBe('sin_turno_activo');
    const notice = await t.call('ADM', 'POST', '/avisos', { titulo: 'Mantenimiento del sistema', cuerpo: 'El sistema se actualiza esta noche.', hasta: new Date(now.valueOf() + 24 * HOUR).toISOString(), publico: false, roles: ['JOP'], nivel: 'informativo' });
    expect(notice.status).toBe(201);
  });

  test('una cuenta con un rol exento ejecuta los comandos de ese rol aunque también tenga un rol por turnos', async () => {
    await t.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'REC')", [userId('JOP')]);
    try {
      // camas.asignar / admision.crear come from JOP too, so JOP+REC is not gated for them; fila.emitir is REC-only.
      const r = await t.call('JOP', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() });
      expect(r.body.codigo).toBe('sin_turno_activo');
      const own = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: 1, inMaintenance: true, reason: 'Revisión sin turno de Jefatura' });
      expect(own.body?.codigo).not.toBe('sin_turno_activo');
      const profile = await t.call('JOP', 'GET', '/me/turno-activo');
      expect(profile.body).toMatchObject({ required: true, active: false, message });
    } finally {
      await t.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='REC'", [userId('JOP')]);
    }
  });

  test('la repetición idempotente de un comando completado responde igual aunque el turno ya terminó', async () => {
    await t.shift('REC', new Date(now.valueOf() - HOUR), new Date(now.valueOf() + 4 * HOUR));
    const key = randomUUID(), body = { service: 'consulta_general', patientId: await t.patient() };
    const first = await t.call('REC', 'POST', '/fila', body, key);
    expect(first.status).toBe(201);
    t.setNow(new Date(now.valueOf() + 6 * HOUR));
    const replay = await t.call('REC', 'POST', '/fila', body, key);
    expect(replay).toEqual(first);
    expect((await issue()).body.codigo).toBe('sin_turno_activo');
  });

  test('GET /me/turno-activo: requerido, vigente y próximo turno', async () => {
    expect((await t.call('REC', 'GET', '/me/turno-activo')).body).toEqual({ required: true, active: false, graceMinutes: 30, shift: null, next: null, message });
    await t.shift('REC', new Date(now.valueOf() + 2 * HOUR), new Date(now.valueOf() + 8 * HOUR));
    const pending = (await t.call('REC', 'GET', '/me/turno-activo')).body;
    expect(pending).toMatchObject({ required: true, active: false, shift: null, next: { start: new Date(now.valueOf() + 2 * HOUR).toISOString(), state: 'publicado' } });
    t.setNow(new Date(now.valueOf() + 3 * HOUR));
    const working = (await t.call('REC', 'GET', '/me/turno-activo')).body;
    expect(working).toMatchObject({ required: true, active: true, message: null, shift: { end: new Date(now.valueOf() + 8 * HOUR).toISOString() } });
    for (const role of ['ADM', 'JOP', 'DPD', 'PAC']) expect({ role, ...(await t.call(role, 'GET', '/me/turno-activo')).body }).toMatchObject({ role, required: false, active: true, message: null });
  });

  test('el margen sale de margen_minutos de la política: con 0, 10 minutos después del fin se rechaza', async () => {
    const policy = 'turnos.exigir_turno_activo';
    await t.pg.query("UPDATE plataforma.politica SET valor = valor || '{\"margen_minutos\":0}'::jsonb WHERE clave=$1", [policy]);
    try {
      await t.shift('REC', new Date(now.valueOf() - 8 * HOUR), new Date(now.valueOf() - 10 * MINUTE));
      const refused = await issue();
      expect([refused.status, refused.body.codigo]).toEqual([403, 'sin_turno_activo']);
      expect((await t.call('REC', 'GET', '/me/turno-activo')).body).toMatchObject({ required: true, active: false, graceMinutes: 0 });
    } finally {
      await t.pg.query("UPDATE plataforma.politica SET valor = valor || '{\"margen_minutos\":30}'::jsonb WHERE clave=$1", [policy]);
    }
    // Same shift with the seeded 30 minutes: 10 minutes after the end still works.
    expect((await issue()).status).toBe(201);
  });

  test('sin la política turnos.exigir_turno_activo la regla no aplica', async () => {
    const saved = await t.one('SELECT valor,vigencia::text AS vigencia,fuente,aprobado_por FROM plataforma.politica WHERE clave=$1', ['turnos.exigir_turno_activo']);
    await t.pg.query('DELETE FROM plataforma.politica WHERE clave=$1', ['turnos.exigir_turno_activo']);
    try {
      expect((await issue()).status).toBe(201);
      expect((await t.call('REC', 'GET', '/me/turno-activo')).body).toMatchObject({ required: false, active: true });
    } finally {
      await t.pg.query('INSERT INTO plataforma.politica(clave,valor,vigencia,fuente,aprobado_por) VALUES($1,$2,$3::tstzrange,$4,$5)', ['turnos.exigir_turno_activo', saved.valor, saved.vigencia, saved.fuente, saved.aprobado_por]);
    }
  });
});
