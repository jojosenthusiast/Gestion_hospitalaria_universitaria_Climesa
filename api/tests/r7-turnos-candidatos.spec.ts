import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
/** Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. The gap is next Tuesday, 07:00-19:00. */
const NOW = new Date('2026-12-02T15:00:00Z');
const local = (day: string, time: string) => new Date(`${day}T${time}:00-06:00`).toISOString();

/** R7 U3, journey F2 «Cubrir hueco» (gap F-1): the valid people for one coverage gap, with the rules of a single shift. */
describe('R7 · turnos: candidatos válidos para un hueco', () => {
  let t: TestApp;
  let reception: string;
  let sequence = 0;
  const person = async (surname: string) => {
    const created = await t.call('ADM', 'POST', '/personal', { givenNames: 'Persona', surnames: `Hueco ${String.fromCharCode(97 + sequence++)} ${surname}`, type: 'recepcionista', areaId: reception });
    expect(created.status).toBe(201);
    return created.body.id as string;
  };
  const shift = (staffId: string, start: string, end: string, type = 'diurno') => t.call('JOP', 'POST', '/turnos', { staffId, areaId: reception, start, end, type });
  const gap = { start: local('2026-12-08', '07:00'), end: local('2026-12-08', '19:00') };
  const candidates = (role = 'REC') => t.call('JOP', 'GET', `/turnos/candidatos?${new URLSearchParams({ areaId: reception, role, type: 'diurno', ...gap })}`);

  beforeAll(async () => {
    t = await createTestApp(NOW);
    reception = (await t.one<{ id: string }>("SELECT id FROM infra.espacio WHERE codigo='P1-REC'")).id;
  });
  afterAll(async () => { await t?.close(); });

  test('lista solo a quien no rompe descanso ni traslape, explica a los demás y no guarda nada', async () => {
    const free = await person('Libre');
    const busy = await person('Ocupada');
    const tired = await person('Cansada');
    expect((await shift(busy, local('2026-12-08', '10:00'), local('2026-12-08', '16:00'))).status).toBe(201);
    expect((await shift(tired, local('2026-12-07', '19:00'), gap.start, 'nocturno')).status).toBe(201);
    const before = (await t.one<{ n: number }>('SELECT count(*)::int AS n FROM personal.turno')).n;
    const answer = await candidates();
    expect(answer.status).toBe(200);
    const valid = (answer.body.candidatos as any[]).map(c => c.staffId);
    expect(valid).toContain(free);
    expect(valid).not.toContain(busy);
    expect(valid).not.toContain(tired);
    const rejected = Object.fromEntries((answer.body.descartados as any[]).map(c => [c.staffId, c.codigo]));
    expect(rejected[busy]).toEqual(expect.stringMatching(/conflicto|personal_jornada_ocupada/));
    expect(rejected[tired]).toBe('personal_en_descanso');
    expect(answer.body.candidatos.find((c: any) => c.staffId === free)).toMatchObject({ person: expect.stringContaining('Libre'), sameArea: true, weekHours: 0, advertencias: [] });
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM personal.turno')).n).toBe(before);
  });

  test('pide permiso de planificar y un rango válido', async () => {
    expect((await t.call('REC', 'GET', `/turnos/candidatos?${new URLSearchParams({ areaId: reception, role: 'REC', type: 'diurno', ...gap })}`)).status).toBe(403);
    const backwards = await t.call('JOP', 'GET', `/turnos/candidatos?${new URLSearchParams({ areaId: reception, role: 'REC', type: 'diurno', start: gap.end, end: gap.start })}`);
    expect([backwards.status, backwards.body.campo]).toEqual([400, 'end']);
  });
});
