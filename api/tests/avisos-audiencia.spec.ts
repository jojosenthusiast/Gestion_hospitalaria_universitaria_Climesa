import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const HOUR = 3600_000;
const until = (hours: number) => new Date(start.valueOf() + hours * HOUR).toISOString();

describe('Ronda 2 · avisos con audiencia y prioridad', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  test('un aviso solo para roles no sale en la pantalla pública y sí en el tablero de esos roles', async () => {
    const created = await t.call('JOP', 'POST', '/avisos', { titulo: 'Simulacro interno', cuerpo: 'Mañana a las 10:00 en el ala norte.', hasta: until(5), prioridad: 'urgente', publico: false, roles: ['MED', 'ENF'] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ prioridad: 'urgente', publico: false, roles: ['ENF', 'MED'] });

    const anonymous = await t.app.inject({ method: 'GET', url: '/api/v1/publico/avisos' });
    expect(anonymous.json().avisos.map((a: any) => a.titulo)).not.toContain('Simulacro interno');

    const med = await t.call('MED', 'GET', '/me/avisos');
    expect(med.status).toBe(200);
    expect(med.body.avisos.map((a: any) => a.titulo)).toContain('Simulacro interno');
    const rec = await t.call('REC', 'GET', '/me/avisos');
    expect(rec.body.avisos.map((a: any) => a.titulo)).not.toContain('Simulacro interno');
  });

  test('un aviso público llega a toda cuenta con sesión y a la pantalla pública, ordenado por prioridad', async () => {
    await t.call('JOP', 'POST', '/avisos', { titulo: 'Horario de visita', cuerpo: 'Visitas de 2 a 5 p. m.', hasta: until(5) });
    await t.call('JOP', 'POST', '/avisos', { titulo: 'Corte de agua', cuerpo: 'Sin agua en la planta 2 por una hora.', hasta: until(5), prioridad: 'critico' });
    const anonymous = (await t.app.inject({ method: 'GET', url: '/api/v1/publico/avisos' })).json();
    expect(anonymous.avisos[0]).toMatchObject({ titulo: 'Corte de agua', prioridad: 'critico' });
    expect(anonymous.avisos.find((a: any) => a.titulo === 'Horario de visita')).toMatchObject({ prioridad: 'atencion' });
    expect(JSON.stringify(anonymous)).not.toContain('roles');
    const rec = await t.call('REC', 'GET', '/me/avisos');
    expect(rec.body.avisos.map((a: any) => a.titulo)).toEqual(expect.arrayContaining(['Corte de agua', 'Horario de visita']));
  });

  test('validaciones: sin audiencia, rol inexistente y prioridad inválida se rechazan', async () => {
    const base = { titulo: 'Aviso de prueba', cuerpo: 'Texto del aviso.', hasta: until(5) };
    expect((await t.call('JOP', 'POST', '/avisos', { ...base, publico: false, roles: [] })).status).toBe(400);
    expect((await t.call('JOP', 'POST', '/avisos', { ...base, roles: ['XXX'] })).status).toBe(400);
    expect((await t.call('JOP', 'POST', '/avisos', { ...base, prioridad: 'enorme' })).status).toBe(400);
    expect((await t.call('REC', 'POST', '/avisos', base)).status).toBe(403);
  });

  test('quien redacta ve todos los avisos con su estado; los demás roles no', async () => {
    const list = await t.call('JOP', 'GET', '/avisos');
    expect(list.status).toBe(200);
    expect(list.body[0]).toHaveProperty('estado');
    expect(list.body.some((a: any) => a.titulo === 'Simulacro interno' && a.estado === 'vigente')).toBe(true);
    expect((await t.call('MED', 'GET', '/avisos')).status).toBe(403);
  });

  test('la base rechaza un aviso sin audiencia o con un rol inexistente', async () => {
    const insert = (publico: boolean, roles: string[], prioridad = 'atencion') => t.pg.query(
      "INSERT INTO publico.aviso(titulo,cuerpo,vigencia,publicado_por,publico,roles,prioridad) VALUES('x','y',tstzrange(now(),now()+interval '1 day'),gen_random_uuid(),$1,$2,$3)", [publico, roles, prioridad]);
    await expect(insert(false, [])).rejects.toThrow(/aviso_audiencia_valida/);
    await expect(insert(true, ['ZZZ'])).rejects.toThrow(/aviso_audiencia_valida/);
    await expect(insert(true, [], 'grave')).rejects.toThrow(/aviso_audiencia_valida/);
  });
});
