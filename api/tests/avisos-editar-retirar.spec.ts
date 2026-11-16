import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const HOUR = 3600_000;
const at = (hours: number) => new Date(start.valueOf() + hours * HOUR).toISOString();

/** MA-AVI-02: un aviso se edita (incluido adelantar su fin) y se retira con motivo, con auditoría y sin dejar acciones imposibles. */
describe('MA-AVI-02 · editar y retirar avisos', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); });
  afterAll(async () => { await t?.close(); });

  const publish = async (extra: Record<string, unknown> = {}) => {
    const created = await t.call('JOP', 'POST', '/avisos', { titulo: 'Corte de energía', cuerpo: 'Planta 2 sin energía de 2 a 3 p. m.', hasta: at(6), ...extra });
    expect(created.status).toBe(201);
    return created.body as { id: string };
  };
  const listed = async (id: string) => ((await t.call('JOP', 'GET', '/avisos')).body as any[]).find(a => a.id === id);
  const publicTitles = async () => (await t.app.inject({ method: 'GET', url: '/api/v1/publico/avisos' })).json().avisos.map((a: any) => a.titulo);

  test('la lista de quien redacta trae versión y las acciones que el servidor acepta', async () => {
    const { id } = await publish();
    expect(await listed(id)).toMatchObject({ version: 1, estado: 'vigente', allowedActions: ['editar', 'retirar'], retiradoEn: null, motivoRetiro: null });
  });

  test('editar cambia texto, audiencia y fin; audita antes y después y avisa en vivo a la audiencia vieja y nueva', async () => {
    const { id } = await publish({ titulo: 'Simulacro', publico: false, roles: ['ENF'] });
    const edited = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 1, titulo: 'Simulacro reprogramado', cuerpo: 'Se mueve a las 4 p. m.', hasta: at(2), prioridad: 'urgente', publico: false, roles: ['MED'] });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id, version: 2, titulo: 'Simulacro reprogramado', prioridad: 'urgente', roles: ['MED'], hasta: at(2), estado: 'vigente' });
    const med = await t.call('MED', 'GET', '/me/avisos');
    expect(med.body.avisos.map((a: any) => a.titulo)).toContain('Simulacro reprogramado');
    const enf = await t.call('ENF', 'GET', '/me/avisos');
    expect(enf.body.avisos.map((a: any) => a.titulo)).not.toContain('Simulacro reprogramado');
    const audit = (await t.audits('avisos.editar')).at(-1)!;
    expect(audit.detalle).toMatchObject({ antes: { titulo: 'Simulacro', roles: ['ENF'] }, despues: { titulo: 'Simulacro reprogramado', roles: ['MED'] } });
    const channels = (await t.events('aviso.actualizado', id)).at(-1)!;
    expect(channels).toEqual(expect.arrayContaining(['rol:ENF', 'rol:MED']));
  });

  test('editar uno programado con desde = ahora lo adelanta; sin desde conserva su inicio programado', async () => {
    const { id } = await publish({ titulo: 'Simulacro programado', desde: at(2), hasta: at(6) });
    expect((await listed(id)).estado).toBe('programado');
    const kept = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 1, titulo: 'Simulacro programado', cuerpo: 'Texto.', hasta: at(6) });
    expect(kept.status).toBe(200);
    expect((await listed(id)).estado).toBe('programado');
    const now = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 2, titulo: 'Simulacro programado', cuerpo: 'Texto.', desde: at(0), hasta: at(6) });
    expect(now.status).toBe(200);
    expect((await listed(id)).estado).toBe('vigente');
    expect(await publicTitles()).toContain('Simulacro programado');
  });

  test('una versión vieja choca con version_conflicto y no pisa la edición de otra persona', async () => {
    const { id } = await publish();
    expect((await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 1, titulo: 'Primera edición', cuerpo: 'Texto uno.', hasta: at(6) })).status).toBe(200);
    const stale = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 1, titulo: 'Edición vieja', cuerpo: 'Texto dos.', hasta: at(6) });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ codigo: 'version_conflicto', versionActual: 2 });
    expect((await listed(id)).titulo).toBe('Primera edición');
  });

  test('la edición repite las reglas de publicar: fin futuro, audiencia y datos personales', async () => {
    const { id } = await publish();
    const base = { version: 1, titulo: 'Aviso', cuerpo: 'Texto del aviso.', hasta: at(6) };
    expect((await t.call('JOP', 'PUT', `/avisos/${id}`, { ...base, hasta: at(-1) })).status).toBe(400);
    expect((await t.call('JOP', 'PUT', `/avisos/${id}`, { ...base, publico: false, roles: [] })).status).toBe(400);
    const personal = await t.call('JOP', 'PUT', `/avisos/${id}`, { ...base, cuerpo: 'Llamar al 2222-3333.' });
    expect(personal.body).toMatchObject({ codigo: 'aviso_con_datos_personales' });
    expect((await t.call('REC', 'PUT', `/avisos/${id}`, base)).status).toBe(403);
  });

  test('retirar exige motivo, saca el aviso de todas partes y ya no admite editar ni retirar', async () => {
    const { id } = await publish({ titulo: 'Aviso a retirar' });
    expect(await publicTitles()).toContain('Aviso a retirar');
    expect((await t.call('JOP', 'POST', `/avisos/${id}/retirar`, { version: 1, motivo: 'corto' })).status).toBe(400);
    const withdrawn = await t.call('JOP', 'POST', `/avisos/${id}/retirar`, { version: 1, motivo: 'Se publicó con la planta equivocada.' });
    expect(withdrawn.status).toBe(201);
    expect(withdrawn.body).toMatchObject({ id, version: 2, estado: 'retirado', motivoRetiro: 'Se publicó con la planta equivocada.', allowedActions: [] });
    expect(await publicTitles()).not.toContain('Aviso a retirar');
    expect((await t.call('REC', 'GET', '/me/avisos')).body.avisos.map((a: any) => a.titulo)).not.toContain('Aviso a retirar');
    expect(await listed(id)).toMatchObject({ estado: 'retirado', allowedActions: [] });
    const again = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 2, titulo: 'Otra vez', cuerpo: 'Texto.', hasta: at(6) });
    expect(again.status).toBe(409);
    expect(again.body.codigo).toBe('aviso_retirado');
    expect((await t.call('JOP', 'POST', `/avisos/${id}/retirar`, { version: 2, motivo: 'Segundo retiro de prueba.' })).body.codigo).toBe('aviso_retirado');
    expect((await t.audits('avisos.retirar')).at(-1)!.detalle).toMatchObject({ motivo: 'Se publicó con la planta equivocada.' });
    expect((await t.events('aviso.actualizado', id)).at(-1)).toContain('publico');
  });

  test('un aviso vencido no ofrece acciones y el servidor las rechaza', async () => {
    const { id } = await publish({ titulo: 'Aviso que vence' });
    t.setNow(new Date(start.valueOf() + 7 * HOUR));
    try {
      expect(await listed(id)).toMatchObject({ estado: 'vencido', allowedActions: [] });
      const edit = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 1, titulo: 'Tarde', cuerpo: 'Texto.', hasta: at(9) });
      expect(edit.status).toBe(409);
      expect(edit.body.codigo).toBe('aviso_vencido');
    } finally { t.setNow(start); }
  });

  test('no queda una vista de avisos vigentes sin los filtros de audiencia y retiro', async () => {
    const view = await t.one("SELECT to_regclass('publico.v_avisos_vigentes') AS name");
    expect(view.name).toBeNull();
  });

  test('la base rechaza cambiar un aviso retirado y un retiro sin motivo suficiente', async () => {
    const { id } = await publish();
    await expect(t.pg.query("UPDATE publico.aviso SET retirado_en=now(),retirado_por=gen_random_uuid(),motivo_retiro='corto' WHERE id=$1", [id])).rejects.toThrow(/aviso_retiro_completo/);
    await t.pg.query("UPDATE publico.aviso SET retirado_en=now(),retirado_por=gen_random_uuid(),motivo_retiro='Motivo suficiente de prueba' WHERE id=$1", [id]);
    await expect(t.pg.query("UPDATE publico.aviso SET titulo='x' WHERE id=$1", [id])).rejects.toThrow(/aviso_retirado/);
  });
});
