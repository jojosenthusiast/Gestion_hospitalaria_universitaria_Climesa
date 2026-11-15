import { createHmac, randomUUID } from 'node:crypto';
import { SupabaseService } from '../src/supabase/supabase.service';
import { createTestApp, type TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(120000);
const issuer = 'https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';
const now = new Date('2026-11-20T15:00:00Z');

/** Token for an account that is not one of the fixture roles (an invited person signing in for the first time). */
function tokenFor(sub: string) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b = Buffer.from(JSON.stringify({ sub, iss: issuer, aud: 'authenticated', exp: Math.floor(now.valueOf() / 1000) + 3600 })).toString('base64url');
  return `${h}.${b}.${createHmac('sha256', 'test-only-key').update(h + '.' + b).digest('base64url')}`;
}

describe('Fase 0/1 cuentas: invitaciones, jerarquía y trabajo abierto (MA-CTA-01 a 04)', () => {
  let t: TestApp, provider: jest.Mock;
  const account = async (id: string) => ((await t.call('ADM', 'GET', '/usuarios')).body as any[]).find(u => u.id === id);
  const version = async (id: string) => (await t.one<{ version: number }>('SELECT version FROM acceso.usuario WHERE id=$1', [id])).version;
  const invite = async (email: string, roles: string[], staffId?: string) => t.call('ADM', 'POST', '/usuarios/invitaciones', { email, displayName: 'Persona Ficticia', roles, ...(staffId ? { staffId } : {}) });

  beforeAll(async () => {
    t = await createTestApp(now);
    provider = t.app.get(SupabaseService).admin.auth.admin.inviteUserByEmail as jest.Mock;
    provider.mockImplementation(async () => ({ data: { user: { id: randomUUID() } }, error: null }));
  });
  afterAll(async () => { await t.close(); });

  describe('MA-CTA-02: la invitación es solo para personal', () => {
    test('sin roles responde 400 y nunca asume PAC', async () => {
      const response = await t.call('ADM', 'POST', '/usuarios/invitaciones', { email: 'sinrol@example.test', displayName: 'Persona Ficticia' });
      expect(response.status).toBe(400);
    });
    test('invitar PAC responde 400 rol_no_invitable: el paciente se registra en la app', async () => {
      const response = await invite('paciente.invitado@example.test', ['PAC']);
      expect(response.status).toBe(400);
      expect(response.body.codigo).toBe('rol_no_invitable');
      expect(provider).not.toHaveBeenCalledWith('paciente.invitado@example.test', expect.anything());
    });
  });

  describe('MA-CTA-01: estado, reenvío y cancelación de la invitación', () => {
    test('la cuenta invitada aparece como invitación enviada con reenviar y cancelar; al entrar queda aceptada', async () => {
      const sent = await invite('jefa.nueva@example.test', ['JOP']);
      expect(sent.status).toBe(201);
      const listed = await account(sent.body.userId);
      expect(listed.invitationState).toBe('enviada');
      expect(listed.allowedActions).toEqual(expect.arrayContaining(['reenviar_invitacion', 'cancelar_invitacion']));
      const me = await t.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${tokenFor(sent.body.userId)}` } });
      expect(me.statusCode).toBe(200);
      const accepted = await account(sent.body.userId);
      expect(accepted.invitationState).toBe('aceptada');
      expect(accepted.allowedActions).not.toContain('reenviar_invitacion');
      const resend = await t.call('ADM', 'POST', `/usuarios/${sent.body.userId}/invitacion/reenvio`, {});
      expect(resend.status).toBe(409);
      expect(resend.body.codigo).toBe('invitacion_no_pendiente');
    });

    test('reenviar llama de nuevo al proveedor y queda auditado', async () => {
      const sent = await invite('dpd.nuevo@example.test', ['DPD']);
      const before = provider.mock.calls.length;
      const resend = await t.call('ADM', 'POST', `/usuarios/${sent.body.userId}/invitacion/reenvio`, {});
      expect(resend.status).toBe(201);
      expect(provider.mock.calls.length - before).toBe(1);
      expect(provider.mock.calls.at(-1)?.[0]).toBe('dpd.nuevo@example.test');
      expect((await t.audits('usuarios.invitacion.reenviar')).length).toBeGreaterThanOrEqual(1);
    });

    test('cancelar desactiva la cuenta; invitar otra vez el mismo correo la reutiliza en lugar de "Esa cuenta ya existe"', async () => {
      const sent = await invite('cancelada@example.test', ['JOP']);
      const cancel = await t.call('ADM', 'POST', `/usuarios/${sent.body.userId}/invitacion/cancelacion`, { reason: 'Correo equivocado en la invitación' });
      expect(cancel.status).toBe(201);
      const cancelled = await account(sent.body.userId);
      expect(cancelled).toMatchObject({ state: 'desactivado', invitationState: 'cancelada' });
      expect(cancelled.allowedActions).not.toContain('reactivar');
      provider.mockImplementationOnce(async () => ({ data: { user: { id: sent.body.userId } }, error: null }));
      const again = await invite('cancelada@example.test', ['DPD']);
      expect(again.status).toBe(201);
      expect(again.body.userId).toBe(sent.body.userId);
      expect(await account(sent.body.userId)).toMatchObject({ state: 'activo', invitationState: 'enviada', roles: ['DPD'] });
    });

    test('una cuenta ya activada sigue respondiendo conflicto al invitarla', async () => {
      const response = await invite('jop@example.test', ['JOP']);
      expect(response.status).toBe(409);
    });
  });

  describe('MA-CTA-03: jerarquía de administración', () => {
    beforeAll(async () => {
      await t.pg.query('INSERT INTO acceso.administrador_principal(usuario_id) VALUES($1) ON CONFLICT (id) DO UPDATE SET usuario_id=excluded.usuario_id', [userId('ADM')]);
      await t.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'ADM') ON CONFLICT DO NOTHING", [userId('DPD')]);
    });
    afterAll(async () => { await t.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='ADM'", [userId('DPD')]); });

    test('un administrador no principal no cambia roles ni desactiva al principal', async () => {
      const roles = await t.call('DPD', 'PATCH', `/usuarios/${userId('ADM')}/roles`, { roles: ['DPD'], version: await version(userId('ADM')), reason: 'Intento de degradar al principal' });
      expect(roles.status).toBe(403);
      expect(roles.body.codigo).toBe('jerarquia_administrador');
      const state = await t.call('DPD', 'PATCH', `/usuarios/${userId('ADM')}/estado`, { state: 'desactivado', version: await version(userId('ADM')), reason: 'Intento de desactivar al principal' });
      expect(state.status).toBe(403);
      const seen = ((await t.call('DPD', 'GET', '/usuarios')).body as any[]).find(u => u.id === userId('ADM'));
      expect(seen.allowedActions).not.toContain('roles');
      expect(seen.allowedActions).not.toContain('desactivar');
    });

    test('un administrador no principal no reactiva por reinvitación una cuenta de administración cancelada', async () => {
      const sent = await invite('admin.cancelado@example.test', ['ADM']);
      expect(sent.status).toBe(201);
      expect((await t.call('ADM', 'POST', `/usuarios/${sent.body.userId}/invitacion/cancelacion`, { reason: 'Invitación de administración por error' })).status).toBe(201);
      provider.mockImplementationOnce(async () => ({ data: { user: { id: sent.body.userId } }, error: null }));
      const before = provider.mock.calls.length;
      const again = await t.call('DPD', 'POST', '/usuarios/invitaciones', { email: 'admin.cancelado@example.test', displayName: 'Persona Ficticia', roles: ['JOP'] });
      expect(again.status).toBe(403);
      expect(again.body.codigo).toBe('jerarquia_administrador');
      expect(provider.mock.calls.length).toBe(before);
      expect(await account(sent.body.userId)).toMatchObject({ state: 'desactivado', invitationState: 'cancelada', roles: ['ADM'] });
    });

    test('nadie se desactiva a sí mismo y la lista no lo ofrece', async () => {
      const state = await t.call('ADM', 'PATCH', `/usuarios/${userId('ADM')}/estado`, { state: 'desactivado', version: await version(userId('ADM')), reason: 'Intento de autodesactivación' });
      expect(state.status).toBe(403);
      const own = await account(userId('ADM'));
      expect(own.allowedActions).toEqual([]);
    });

    test('el principal sí gestiona a otro administrador', async () => {
      const own = await account(userId('DPD'));
      expect(own.allowedActions).toEqual(expect.arrayContaining(['roles', 'desactivar']));
    });
  });

  describe('MA-CTA-04: desactivar o quitar un rol revisa el trabajo abierto', () => {
    test('con un turno pendiente no se desactiva la cuenta ni se quita el rol de trabajo', async () => {
      const staff = await t.staffOf('ENF');
      await t.pg.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange($2::timestamptz,$3::timestamptz,'[)'),'diurno','publicado' FROM infra.espacio WHERE codigo='P1-CON'`, [staff, new Date(now.valueOf() + 86_400_000), new Date(now.valueOf() + 86_400_000 + 8 * 3_600_000)]);
      const state = await t.call('ADM', 'PATCH', `/usuarios/${userId('ENF')}/estado`, { state: 'desactivado', version: await version(userId('ENF')), reason: 'Baja con turno pendiente' });
      expect(state.status).toBe(409);
      expect(state.body.codigo).toBe('trabajo_abierto');
      const roles = await t.call('ADM', 'PATCH', `/usuarios/${userId('ENF')}/roles`, { roles: ['DPD'], version: await version(userId('ENF')), reason: 'Cambio con turno pendiente' });
      expect(roles.status).toBe(409);
      expect(roles.body.codigo).toBe('trabajo_abierto');
    });

    test('sin trabajo abierto la desactivación procede', async () => {
      const state = await t.call('ADM', 'PATCH', `/usuarios/${userId('AST')}/estado`, { state: 'desactivado', version: await version(userId('AST')), reason: 'Baja sin trabajo abierto' });
      expect(state.status).toBe(200);
    });
  });
});
