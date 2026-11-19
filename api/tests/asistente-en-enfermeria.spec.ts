import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(180000);
const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/20261129004000_asistente_en_enfermeria.sql'), 'utf8');
/** Everything the Asistente had before Lote 5 (seed + attribute migrations), with its context. */
const AST_BEFORE: Record<string, string> = {
  'sesion.perfil': 'x', 'pacientes.buscar': 'x', 'pacientes.ver_ficha': 'area', 'pacientes.ver_nacimiento': 'x', 'turnos.ver': 'x',
  'espacios.ver': 'x', 'fila.ver': 'x', 'fila.llamar': 'x', 'fila.gestionar': 'x', 'citas.ver': 'x', 'signos.registrar': 'x',
};

// Lote 5 S10 (owner decision 2026-11-19, «Unir en Enfermería»): AST retires and its accounts become ENF.
describe('Lote 5 S10 · el Asistente se une a Enfermería', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(new Date('2026-12-02T18:00:00Z')); });
  afterAll(async () => { await t?.close(); });

  test('AST no tiene permisos y no es invitable; ENF tiene cada permiso que AST tenía', async () => {
    expect((await t.pg.query("SELECT 1 FROM acceso.rol_permiso WHERE rol_codigo='AST'")).rows).toEqual([]);
    expect(await t.one("SELECT invitable FROM acceso.rol WHERE codigo='AST'")).toEqual({ invitable: false });
    const enf = Object.fromEntries((await t.pg.query<{ p: string; c: string }>("SELECT permiso_codigo AS p,contexto AS c FROM acceso.rol_permiso WHERE rol_codigo='ENF'")).rows.map(r => [r.p, r.c]));
    for (const permission of Object.keys(AST_BEFORE)) expect({ permission, has: !!enf[permission] }).toEqual({ permission, has: true });
    for (const permission of ['fila.ver', 'fila.llamar', 'fila.gestionar', 'citas.ver']) expect({ permission, context: enf[permission] }).toEqual({ permission, context: 'x' });
  });

  test('la migración pasa cada cuenta AST a ENF sin duplicar y es idempotente', async () => {
    const astOnly = userId('AST');
    // Give the former assistant account its old role back (the fixture already moved it to ENF) and run the migration.
    await t.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1", [astOnly]);
    await t.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'AST')", [astOnly]);
    // An account that already had both roles keeps one ENF.
    await t.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'AST')", [userId('ENF')]);
    await t.pg.exec(migration);
    await t.pg.exec(migration);
    const roles = async (id: string) => (await t.pg.query<{ r: string }>('SELECT rol_codigo AS r FROM acceso.asignacion_rol WHERE usuario_id=$1 ORDER BY 1', [id])).rows.map(r => r.r);
    expect(await roles(astOnly)).toEqual(['ENF']);
    expect(await roles(userId('ENF'))).toEqual(['ENF']);
    expect((await t.pg.query("SELECT 1 FROM acceso.asignacion_rol WHERE rol_codigo='AST'")).rows).toEqual([]);
    // The former assistant now works the queue as ENF.
    const me = await t.call(astOnly, 'GET', '/auth/me');
    expect(me.body.roles).toEqual(['ENF']);
    expect((await t.call(astOnly, 'GET', '/fila')).status).toBe(200);
  });

  test('ENF llama y mueve la fila del consultorio como lo hacía AST', async () => {
    const issued = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: await t.patient() });
    const called = await t.call('ENF', 'POST', `/fila/${issued.body.id}/llamar`, { version: issued.body.version });
    expect(called.status).toBe(201);
    expect((await t.call('ENF', 'GET', '/citas')).status).toBe(200);
  });

  test('avisos dirigidos a AST pasan a ENF', async () => {
    const hasta = new Date('2026-12-03T18:00:00Z').toISOString();
    const created = await t.call('JOP', 'POST', '/avisos', { titulo: 'Aviso a asistentes', cuerpo: 'Revisar la fila del consultorio.', hasta, publico: false, roles: ['AST', 'MED'], nivel: 'informativo' });
    expect(created.status).toBe(201);
    await t.pg.exec(migration);
    expect((await t.one<{ roles: string[] }>('SELECT roles FROM publico.aviso WHERE id=$1', [created.body.id])).roles).toEqual(['ENF', 'MED']);
  });

  test('invitar con AST responde rol_no_invitable', async () => {
    const r = await t.call('ADM', 'POST', '/usuarios/invitaciones', { email: 'asistente.nueva@example.test', displayName: 'Asistente Nueva', roles: ['AST'], staffId: await t.staffOf('AST') });
    expect([r.status, r.body.codigo, r.body.detail ?? r.body.mensaje ?? r.body.message]).toEqual([400, 'rol_no_invitable', 'Ese rol ya no se asigna. Elige un rol vigente, por ejemplo Enfermería.']);
  });
});
