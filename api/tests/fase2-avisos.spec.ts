import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const HOUR = 3600_000;
const at = (hours: number) => new Date(start.valueOf() + hours * HOUR).toISOString();

/** Fase 2, S11: avisos en su propia área, nivel de criticidad, audiencia por rol o área, "Enterado" y recordatorios. */
describe('Fase 2 · avisos con nivel, enterado y recordatorio', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });

  const publish = async (body: Record<string, unknown>) => {
    const created = await t.call('JOP', 'POST', '/avisos', { cuerpo: 'Texto del aviso para el personal.', hasta: at(30), ...body });
    expect(created.status).toBe(201);
    return created.body as { id: string; nivel: string; areas: string[]; prioridad: string };
  };
  const inbox = async (role: string) => {
    const response = await t.call(role, 'GET', '/me/avisos/bandeja');
    expect(response.status).toBe(200);
    return response.body as { avisos: any[]; noLeidos: number; criticos: number; recordatorioHoras: number; proximoCambio: string | null };
  };
  const item = async (role: string, id: string) => (await inbox(role)).avisos.find(a => a.id === id);

  test('un aviso existente o publicado sin nivel queda informativo, sin áreas y con la prioridad de antes', async () => {
    const row = (await t.pg.query<{ id: string }>(
      "INSERT INTO publico.aviso(titulo,cuerpo,vigencia,publicado_por,prioridad,publico,roles) VALUES('Aviso anterior','Publicado antes de Fase 2',tstzrange(now()-interval '1 hour',now()+interval '1 day'),gen_random_uuid(),'critico',true,'{}') RETURNING id")).rows[0];
    expect((await t.pg.query<{ nivel: string; areas: string[] }>('SELECT nivel,areas FROM publico.aviso WHERE id=$1', [row.id])).rows[0]).toEqual({ nivel: 'informativo', areas: [] });
    const created = await publish({ titulo: 'Sin nivel' });
    expect(created).toMatchObject({ nivel: 'informativo', areas: [], prioridad: 'atencion' });
    const listed = ((await t.call('JOP', 'GET', '/avisos')).body as any[]).find(a => a.id === created.id);
    expect(listed).toMatchObject({ nivel: 'informativo', areas: [], prioridad: 'atencion' });
  });

  test('la audiencia por rol y por área decide quién lo recibe; un área inexistente se rechaza', async () => {
    const byRole = await publish({ titulo: 'Solo recepción', publico: false, roles: ['REC'], nivel: 'importante' });
    const byArea = await publish({ titulo: 'Solo emergencia', publico: false, areas: ['P1-EMG'], nivel: 'importante' });
    expect(byArea).toMatchObject({ areas: ['P1-EMG'], roles: [], publico: false, prioridad: 'urgente' });
    expect(await item('REC', byRole.id)).toBeDefined();
    expect(await item('LAB', byRole.id)).toBeUndefined();
    // The MED account belongs to P1-CON; a shift in progress in P1-EMG adds that area.
    expect(await item('MED', byArea.id)).toBeUndefined();
    expect((await t.call('MED', 'GET', '/me/avisos')).body.avisos.map((a: any) => a.id)).not.toContain(byArea.id);
    await t.shift('MED', new Date(start.valueOf() - HOUR), new Date(start.valueOf() + 6 * HOUR), 'P1-EMG');
    expect(await item('MED', byArea.id)).toMatchObject({ titulo: 'Solo emergencia', nivel: 'importante', areas: ['P1-EMG'] });
    expect((await t.call('MED', 'GET', '/me/avisos')).body.avisos.map((a: any) => a.id)).toContain(byArea.id);
    const unknown = await t.call('JOP', 'POST', '/avisos', { titulo: 'Área falsa', cuerpo: 'No existe esa área.', hasta: at(5), publico: false, areas: ['P9-XXX'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toMatchObject({ codigo: 'validacion' });
  });

  test('solo un aviso crítico dirigido al rol o al área se destaca en el inicio', async () => {
    const critical = await publish({ titulo: 'Falla de oxígeno', publico: false, roles: ['ENF'], nivel: 'critico' });
    const important = await publish({ titulo: 'Cambio de horario', publico: false, roles: ['ENF'], nivel: 'importante' });
    const publicCritical = await publish({ titulo: 'Corte general', nivel: 'critico' });
    expect(critical.prioridad).toBe('critico');
    const enf = await inbox('ENF');
    expect(enf.avisos.find(a => a.id === critical.id)).toMatchObject({ destacado: true, enteradoEn: null });
    expect(enf.avisos.find(a => a.id === important.id)).toMatchObject({ destacado: false });
    expect(enf.avisos.find(a => a.id === publicCritical.id)).toMatchObject({ destacado: false });
    expect(enf.criticos).toBe(1);
    expect(enf.avisos[0].id).toBe(critical.id);
    expect((await item('REC', critical.id))).toBeUndefined();
  });

  test('"Enterado" se guarda una sola vez, es idempotente, se audita y quita el destacado', async () => {
    const notice = await publish({ titulo: 'Evacuación ala norte', publico: false, roles: ['AST'], nivel: 'critico' });
    const before = await inbox('AST');
    const first = await t.call('AST', 'POST', `/me/avisos/${notice.id}/enterado`, {});
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ avisoId: notice.id, enteradoEn: start.toISOString() });
    t.setNow(new Date(start.valueOf() + 60_000));
    const second = await t.call('AST', 'POST', `/me/avisos/${notice.id}/enterado`, {});
    t.setNow(start);
    expect(second.status).toBe(201);
    expect(second.body.enteradoEn).toBe(first.body.enteradoEn);
    expect((await t.pg.query('SELECT 1 FROM publico.aviso_enterado WHERE aviso_id=$1 AND usuario_id=$2', [notice.id, userId('AST')])).rows).toHaveLength(1);
    expect((await t.audits('avisos.enterado')).filter(a => a.detalle.avisoId === notice.id)).toHaveLength(1);
    const after = await inbox('AST');
    expect(after.avisos.find(a => a.id === notice.id)).toMatchObject({ destacado: false, enteradoEn: first.body.enteradoEn });
    expect(after.noLeidos).toBe(before.noLeidos - 1);
    expect(after.criticos).toBe(before.criticos - 1);
    expect((await t.call('LAB', 'POST', `/me/avisos/${notice.id}/enterado`, {})).status).toBe(404);
  });

  test('pospuesto, un crítico sin "Enterado" vuelve a destacarse al cumplirse el intervalo', async () => {
    const notice = await publish({ titulo: 'Red caída', publico: false, roles: ['LAB'], nivel: 'critico' });
    const snoozed = await t.call('LAB', 'POST', `/me/avisos/${notice.id}/posponer`, {});
    expect(snoozed.status).toBe(201);
    const remindAt = new Date(start.valueOf() + 4 * HOUR).toISOString();
    expect(snoozed.body).toMatchObject({ avisoId: notice.id, recordarEn: remindAt, enteradoEn: null });
    const now = await inbox('LAB');
    expect(now.recordatorioHoras).toBe(4);
    expect(now.avisos.find(a => a.id === notice.id)).toMatchObject({ destacado: false, recordarEn: remindAt });
    expect(Date.parse(now.proximoCambio!)).toBeLessThanOrEqual(Date.parse(remindAt));
    t.setNow(new Date(start.valueOf() + 4 * HOUR + 60_000));
    expect(await item('LAB', notice.id)).toMatchObject({ destacado: true });
    t.setNow(start);
  });

  test('quien publica ve cuántas cuentas dieron "Enterado" y a cuántas va dirigido, sin nombres', async () => {
    const notice = await publish({ titulo: 'Simulacro de sismo', publico: false, roles: ['PAR', 'DPD'], nivel: 'critico' });
    await t.call('PAR', 'POST', `/me/avisos/${notice.id}/enterado`, {});
    const stats = await t.call('JOP', 'GET', '/avisos/estadisticas');
    expect(stats.status).toBe(200);
    const row = (stats.body as any[]).find(s => s.avisoId === notice.id);
    expect(row).toEqual({ avisoId: notice.id, enterados: 1, destinatarios: 2 });
    expect((await t.call('MED', 'GET', '/avisos/estadisticas')).status).toBe(403);
  });

  test('editar sin nivel ni áreas conserva los del aviso; retirarlo lo saca de la bandeja', async () => {
    const notice = await publish({ titulo: 'Mantenimiento', publico: false, areas: ['P1-LAB'], roles: ['LAB'], nivel: 'critico' });
    const edited = await t.call('JOP', 'PUT', `/avisos/${notice.id}`, { version: 1, titulo: 'Mantenimiento movido', cuerpo: 'Se mueve a mañana.', hasta: at(20), prioridad: 'urgente', publico: false, roles: ['LAB'] });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ nivel: 'critico', areas: ['P1-LAB'], prioridad: 'urgente', version: 2 });
    expect(await item('LAB', notice.id)).toMatchObject({ titulo: 'Mantenimiento movido' });
    const withdrawn = await t.call('JOP', 'POST', `/avisos/${notice.id}/retirar`, { version: 2, motivo: 'Se canceló el mantenimiento.' });
    expect(withdrawn.status).toBe(201);
    expect(await item('LAB', notice.id)).toBeUndefined();
    expect((await t.call('LAB', 'POST', `/me/avisos/${notice.id}/enterado`, {})).status).toBe(409);
  });

  test('los avisos públicos siguen llegando a la pantalla pública y a /me/avisos como antes', async () => {
    const notice = await publish({ titulo: 'Horario de visitas', nivel: 'importante' });
    const anonymous = (await t.app.inject({ method: 'GET', url: '/api/v1/publico/avisos' })).json();
    const shown = anonymous.avisos.find((a: any) => a.id === notice.id);
    expect(Object.keys(shown).sort()).toEqual(['cuerpo', 'desde', 'hasta', 'id', 'prioridad', 'titulo']);
    const mine = (await t.call('REC', 'GET', '/me/avisos')).body;
    expect(mine.avisos.find((a: any) => a.id === notice.id)).toMatchObject({ titulo: 'Horario de visitas', publico: true, roles: [], prioridad: 'urgente' });
    expect(await item('REC', notice.id)).toMatchObject({ destacado: false });
  });
});
