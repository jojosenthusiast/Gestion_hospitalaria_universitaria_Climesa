import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const HOUR = 3600_000;
const now = new Date('2026-12-02T16:30:00Z'); // 10:30 local; the coverage starts at the current hour (16:00Z)
const hourStart = new Date('2026-12-02T16:00:00Z');

// Lote 5, S8: the crew puts its unit in maintenance, and dashboards see the hours of the week without a full crew.
describe('Lote 5 S8 · mantenimiento por la tripulación y cobertura de ambulancia', () => {
  let t: TestApp;
  const unit = () => t.one<{ version: number; estado: string }>('SELECT version,estado FROM ambulancia.unidad');
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.pg.query("DELETE FROM personal.turno t USING personal.persona p WHERE p.id=t.persona_id AND p.tipo IN ('paramedico','motorista')");
  });
  afterAll(async () => { await t?.close(); });

  test('PAR pone y quita mantenimiento con motivo (ambulancia.mantenimiento); REC y MED no pueden', async () => {
    const before = await unit();
    expect((await t.call('REC', 'POST', '/ambulancia/mantenimiento', { version: before.version, inMaintenance: before.estado !== 'en_mantenimiento', reason: 'Recepción no decide esto' })).status).toBe(403);
    expect((await t.call('MED', 'POST', '/ambulancia/mantenimiento', { version: before.version, inMaintenance: before.estado !== 'en_mantenimiento', reason: 'Medicina no decide esto' })).status).toBe(403);
    // Crew on duty so the unit can leave maintenance (RN-30).
    await t.shift('PAR', new Date(now.valueOf() - HOUR), new Date(now.valueOf() + 7 * HOUR));
    await t.driverShift(new Date(now.valueOf() - HOUR), new Date(now.valueOf() + 7 * HOUR));
    if (before.estado === 'en_mantenimiento') {
      const out = await t.call('PAR', 'POST', '/ambulancia/mantenimiento', { version: before.version, inMaintenance: false, reason: 'Unidad revisada al iniciar turno' });
      expect(out.status).toBe(201);
    }
    const current = await unit();
    const entered = await t.call('PAR', 'POST', '/ambulancia/mantenimiento', { version: current.version, inMaintenance: true, reason: 'Falla en la sirena' });
    expect(entered.status).toBe(201);
    expect(entered.body).toMatchObject({ state: 'en_mantenimiento' });
    expect(await unit()).toMatchObject({ estado: 'en_mantenimiento' });
    const audit = (await t.pg.query<{ permiso: string; motivo: string }>("SELECT permiso,motivo FROM plataforma.auditoria WHERE accion='ambulancia.mantenimiento' ORDER BY seq DESC LIMIT 1")).rows[0];
    expect(audit).toEqual({ permiso: 'ambulancia.mantenimiento', motivo: 'Falla en la sirena' });
    const left = await t.call('PAR', 'POST', '/ambulancia/mantenimiento', { version: entered.body.version, inMaintenance: false, reason: 'Sirena reparada' });
    expect([left.status, left.body.state]).toEqual([201, 'disponible']);
    // JOP still can.
    expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: left.body.version, inMaintenance: true, reason: 'Revisión programada' })).status).toBe(201);
  });

  test('PAR no cierra administrativamente un servicio: sigue siendo de Jefatura', async () => {
    const r = await t.call('PAR', 'POST', '/ambulancia/servicios/00000000-0000-4000-8000-000000000999/cerrar', { version: 1, reason: 'Cierre que no le corresponde' });
    expect(r.status).toBe(403);
  });

  test('GET /ambulancia dice quién puede poner mantenimiento', async () => {
    for (const [role, expected] of [['PAR', true], ['JOP', true], ['REC', false], ['MED', false]] as const) {
      const board = await t.call(role, 'GET', '/ambulancia');
      expect({ role, can: board.body.canSetMaintenance }).toEqual({ role, can: expected });
    }
  });

  test('GET /ambulancia/cobertura: horas sin paramédico y motorista, por día local y agrupadas por quién falta', async () => {
    await t.pg.query("DELETE FROM personal.turno t USING personal.persona p WHERE p.id=t.persona_id AND p.tipo IN ('paramedico','motorista')");
    const iso = (offsetHours: number) => new Date(hourStart.valueOf() + offsetHours * HOUR).toISOString();
    // From 10:00 local on Dec 2: 14 h that day, Dec 3..8 whole, 10 h of Dec 9. Local midnight is 06:00Z.
    const dates = ['2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-08', '2026-12-09'];
    const bounds = [0, 14, 38, 62, 86, 110, 134, 158, 168];
    const empty = (await t.call('JOP', 'GET', '/ambulancia/cobertura')).body;
    expect(empty).toEqual({ from: iso(0), to: iso(168), hoursWithoutCrew: 168, covered: false,
      days: dates.map((date, i) => ({ date, hoursWithoutCrew: bounds[i + 1] - bounds[i] })),
      gaps: dates.map((date, i) => ({ date, start: iso(bounds[i]), end: iso(bounds[i + 1]), hours: bounds[i + 1] - bounds[i], missing: 'tripulacion' })) });
    // Paramedic 10:00-18:00 local and driver 12:00-18:00 local: 10-12 missing the driver, 12-18 covered, the rest missing both.
    await t.shift('PAR', hourStart, new Date(hourStart.valueOf() + 8 * HOUR));
    await t.driverShift(new Date(hourStart.valueOf() + 2 * HOUR), new Date(hourStart.valueOf() + 8 * HOUR));
    const partial = (await t.call('REC', 'GET', '/ambulancia/cobertura?dias=2')).body;
    expect(partial).toMatchObject({ from: iso(0), to: iso(48), hoursWithoutCrew: 42, covered: false,
      days: [{ date: '2026-12-02', hoursWithoutCrew: 8 }, { date: '2026-12-03', hoursWithoutCrew: 24 }, { date: '2026-12-04', hoursWithoutCrew: 10 }] });
    expect(partial.gaps).toEqual([
      { date: '2026-12-02', start: iso(0), end: iso(2), hours: 2, missing: 'motorista' },
      { date: '2026-12-02', start: iso(8), end: iso(14), hours: 6, missing: 'tripulacion' },
      { date: '2026-12-03', start: iso(14), end: iso(38), hours: 24, missing: 'tripulacion' },
      { date: '2026-12-04', start: iso(38), end: iso(48), hours: 10, missing: 'tripulacion' },
    ]);
    for (const bad of ['0', '15', 'x']) expect({ bad, status: (await t.call('JOP', 'GET', `/ambulancia/cobertura?dias=${bad}`)).status }).toEqual({ bad, status: 400 });
    // A draft, cancelled or absent shift does not count.
    await t.pg.query("UPDATE personal.turno t SET estado='borrador' FROM personal.persona p WHERE p.id=t.persona_id AND p.tipo='motorista'");
    expect((await t.call('JOP', 'GET', '/ambulancia/cobertura')).body.hoursWithoutCrew).toBe(168);
    expect((await t.call('LAB', 'GET', '/ambulancia/cobertura')).status).toBe(403);
  });
});
