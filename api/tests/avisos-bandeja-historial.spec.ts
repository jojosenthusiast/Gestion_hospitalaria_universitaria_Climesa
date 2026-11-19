import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(start.valueOf() + ms);

/** The account inbox also lists scheduled notices and those expired in the last 30 days, like the appointments history. */
describe('Bandeja de avisos · vigentes, programados y vencidos', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });

  const insert = async (titulo: string, from: Date, to: Date, extra: { publico?: boolean; roles?: string[]; nivel?: string; retirado?: boolean } = {}) =>
    (await t.pg.query<{ id: string }>(
      `INSERT INTO publico.aviso(titulo,cuerpo,vigencia,publicado_por,prioridad,nivel,publico,roles,retirado_en,retirado_por,motivo_retiro)
       VALUES($1,'Texto del aviso para el personal.',tstzrange($2,$3),gen_random_uuid(),'atencion',$4,$5,$6,$7,CASE WHEN $7::timestamptz IS NULL THEN NULL ELSE gen_random_uuid() END,$8) RETURNING id`,
      [titulo, from, to, extra.nivel ?? 'informativo', extra.publico ?? false, extra.roles ?? ['ENF'], extra.retirado ? from : null, extra.retirado ? 'Retirado en prueba' : null])).rows[0].id;
  const inbox = async (role: string) => {
    const response = await t.call(role, 'GET', '/me/avisos/bandeja');
    expect(response.status).toBe(200);
    return response.body as { avisos: any[]; noLeidos: number; criticos: number; proximoCambio: string | null };
  };

  test('returns expired (30 days), scheduled and in-force notices with their estado, never withdrawn ones', async () => {
    const current = await insert('Vigente', at(-HOUR), at(DAY));
    const expired = await insert('Vencido reciente', at(-5 * DAY), at(-2 * DAY));
    const old = await insert('Vencido viejo', at(-40 * DAY), at(-31 * DAY));
    const scheduled = await insert('Programado', at(2 * DAY), at(3 * DAY));
    const withdrawnPast = await insert('Retirado vencido', at(-5 * DAY), at(-2 * DAY), { retirado: true });
    const withdrawnFuture = await insert('Retirado programado', at(2 * DAY), at(3 * DAY), { retirado: true });
    const body = await inbox('ENF');
    const byId = new Map(body.avisos.map(a => [a.id, a]));
    expect(byId.get(current)).toMatchObject({ estado: 'vigente' });
    expect(byId.get(expired)).toMatchObject({ estado: 'vencido', destacado: false, enteradoEn: null });
    expect(byId.get(scheduled)).toMatchObject({ estado: 'programado', destacado: false });
    expect(byId.has(old)).toBe(false);
    expect(byId.has(withdrawnPast)).toBe(false);
    expect(byId.has(withdrawnFuture)).toBe(false);
    // In-force notices come first, then scheduled, then expired.
    const states = body.avisos.map(a => a.estado);
    expect(states.lastIndexOf('vigente')).toBeLessThan(states.indexOf('programado'));
    expect(states.lastIndexOf('programado')).toBeLessThan(states.indexOf('vencido'));
  });

  test('the audience rule still applies to expired and scheduled notices', async () => {
    const expired = await insert('Vencido para recepción', at(-3 * DAY), at(-DAY), { roles: ['REC'] });
    const scheduled = await insert('Programado para recepción', at(DAY), at(2 * DAY), { roles: ['REC'] });
    const publicScheduled = await insert('Programado público', at(DAY), at(2 * DAY), { publico: true, roles: [] });
    const lab = (await inbox('LAB')).avisos.map(a => a.id);
    expect(lab).not.toContain(expired);
    expect(lab).not.toContain(scheduled);
    expect(lab).toContain(publicScheduled);
    const rec = (await inbox('REC')).avisos.map(a => a.id);
    expect(rec).toEqual(expect.arrayContaining([expired, scheduled, publicScheduled]));
  });

  test('unread and critical counts only count in-force notices; "Enterado" is refused on expired and scheduled ones', async () => {
    const before = await inbox('AST');
    const expired = await insert('Crítico vencido', at(-3 * DAY), at(-DAY), { roles: ['ENF'], nivel: 'critico' });
    const scheduled = await insert('Crítico programado', at(DAY), at(2 * DAY), { roles: ['ENF'], nivel: 'critico' });
    const after = await inbox('AST');
    expect(after.avisos.map(a => a.id)).toEqual(expect.arrayContaining([expired, scheduled]));
    expect(after.noLeidos).toBe(before.noLeidos);
    expect(after.criticos).toBe(before.criticos);
    expect(after.avisos.filter(a => a.destacado).map(a => a.id)).not.toContain(expired);
    expect((await t.call('AST', 'POST', `/me/avisos/${expired}/enterado`, {})).status).toBe(409);
    expect((await t.call('AST', 'POST', `/me/avisos/${scheduled}/enterado`, {})).status).toBe(404);
    const current = await insert('Crítico vigente', at(-HOUR), at(DAY), { roles: ['ENF'], nivel: 'critico' });
    const withCurrent = await inbox('AST');
    expect(withCurrent.avisos.find(a => a.id === current)).toMatchObject({ estado: 'vigente', destacado: true });
    expect(withCurrent.noLeidos).toBe(before.noLeidos + 1);
    expect(withCurrent.criticos).toBe(before.criticos + 1);
  });

  test('proximoCambio includes the moment an expired notice leaves the 30-day history', async () => {
    const leaves = at(-29 * DAY - HOUR + 30 * DAY); // expired 29 days and 1 hour ago: leaves in 23 hours
    await insert('Vencido casi fuera', at(-35 * DAY), at(-29 * DAY - HOUR), { roles: ['PAR'] });
    const body = await inbox('PAR');
    expect(Date.parse(body.proximoCambio!)).toBeLessThanOrEqual(leaves.valueOf());
  });
});
