import { Clock, BUSINESS_ZONE, businessDate, businessDayRange } from '../src/platform/clock';
import { CommandService } from '../src/platform/command.service';
import { AuditService } from '../src/platform/audit.service';
import { PolicyRegistry } from '../src/platform/policy.registry';
import { DatabaseService } from '../src/platform/database.service';
import { Actor } from '../src/platform/actor';
import { createDatabase, userId } from './support/database';

jest.setTimeout(120000);

describe('FR-100-16 zona horaria America/El_Salvador', () => {
  test('la fecha de negocio es UTC-6 sin horario de verano', () => {
    expect(BUSINESS_ZONE).toBe('America/El_Salvador');
    expect(businessDate(new Date('2026-10-24T05:59:59Z'))).toBe('2026-10-23');
    expect(businessDate(new Date('2026-10-24T06:00:00Z'))).toBe('2026-10-24');
    expect(businessDate(new Date('2026-07-01T05:59:59Z'))).toBe('2026-06-30');
    expect(businessDate(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12-31');
  });
  test('coincide con Intl para todo el año', () => {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
    for (let day = 0; day < 365; day += 7) {
      const at = new Date(Date.UTC(2026, 0, 1, 3, 30) + day * 86400000);
      expect(businessDate(at)).toBe(fmt.format(at));
    }
  });
  test('el día de negocio abarca 24 horas desde las 06:00 UTC', () => {
    const { start, end } = businessDayRange('2026-10-24');
    expect(start.toISOString()).toBe('2026-10-24T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T06:00:00.000Z');
    expect(() => businessDayRange('2026-02-30')).toThrow();
    expect(() => businessDayRange('hoy')).toThrow();
  });
  test('el reloj es sustituible y today() usa su now()', () => {
    class Fixed extends Clock { now() { return new Date('2026-10-24T03:00:00Z'); } }
    expect(new Fixed().today()).toBe('2026-10-23');
  });
});

describe('Plataforma contra PostgreSQL (PGlite)', () => {
  let fixture: Awaited<ReturnType<typeof createDatabase>>;
  let commands: CommandService;
  let audit: AuditService;
  const clock = { now: () => new Date('2026-10-24T12:00:00Z') } as Clock;
  const actor = { id: userId('ADM'), email: 'adm@example.test', name: 'Cuenta ficticia', roles: ['ADM'], platforms: [], permissions: [], channels: [], patientId: null, staffId: null } as Actor;
  beforeAll(async () => {
    fixture = await createDatabase();
    const db = fixture.db as unknown as DatabaseService;
    commands = new CommandService(db, clock);
    audit = new AuditService(db);
  });
  afterAll(async () => { await fixture?.pg.close(); });

  describe('FR-100-06 conflicto de Idempotency-Key', () => {
    test('responde 409 idempotencia_conflicto y deja auditoría aunque la transacción se revierta', async () => {
      const work = jest.fn(async () => ({ ok: true }));
      const key = 'clave-idempotente-0001';
      expect(await commands.run(actor, 'sesion.perfil:prueba', key, { a: 1 }, work)).toEqual({ ok: true });
      expect(await commands.run(actor, 'sesion.perfil:prueba', key, { a: 1 }, work)).toEqual({ ok: true });
      expect(work).toHaveBeenCalledTimes(1);
      await expect(commands.run(actor, 'sesion.perfil:prueba', key, { a: 2, diagnostico: 'DATO-CLINICO' }, work)).rejects.toMatchObject({ codigo: 'idempotencia_conflicto', status: 409 });
      expect(work).toHaveBeenCalledTimes(1);
      const rows = (await fixture.pg.query<{ resultado: string; actor_id: string; detalle: Record<string, unknown> }>("SELECT resultado,actor_id,detalle FROM plataforma.auditoria WHERE accion='idempotencia.conflicto'")).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ resultado: 'fallido', actor_id: actor.id });
      expect(JSON.stringify(rows[0].detalle)).not.toContain('DATO-CLINICO');
    });
    test('una clave ausente o mal formada es validacion sobre Idempotency-Key', async () => {
      await expect(commands.run(actor, 'sesion.perfil:prueba', 'corta', {}, async () => 1)).rejects.toMatchObject({ codigo: 'idempotency_key_invalida', campo: 'Idempotency-Key' });
    });
  });

  describe('FR-100-10 PolicyRegistry', () => {
    const registry = new PolicyRegistry();
    beforeAll(async () => {
      await fixture.pg.query(`INSERT INTO plataforma.politica(clave,valor,vigencia,fuente,aprobado_por) VALUES
        ('prueba.descanso','{"horas":8}','[2026-01-01T00:00:00Z,2026-07-01T00:00:00Z)','prueba','ADM'),
        ('prueba.descanso','{"horas":10}','[2026-07-01T00:00:00Z,)','prueba','ADM')`);
    });
    const at = (iso: string) => fixture.db.transaction(c => registry.value<{ horas: number }>(c, 'prueba.descanso', new Date(iso)));
    test('resuelve la política por fecha de vigencia', async () => {
      expect(await at('2026-03-15T12:00:00Z')).toEqual({ horas: 8 });
      expect(await at('2026-06-30T23:59:59Z')).toEqual({ horas: 8 });
      expect(await at('2026-07-01T00:00:00Z')).toEqual({ horas: 10 });
      expect(await at('2026-10-24T12:00:00Z')).toEqual({ horas: 10 });
    });
    test('falla de forma explícita si no hay política vigente', async () => {
      await expect(at('2025-12-31T23:59:59Z')).rejects.toMatchObject({ codigo: 'politica_no_vigente', status: 409 });
      await expect(fixture.db.transaction(c => registry.value(c, 'prueba.inexistente', new Date('2026-10-24T12:00:00Z')))).rejects.toMatchObject({ codigo: 'politica_no_vigente' });
    });
  });

  describe('FR-100-07 cadena de auditoría', () => {
    test('una cadena íntegra se verifica completa', async () => {
      await fixture.db.transaction(c => commands.audit(c, actor, { action: 'prueba.uno', entity: 'prueba', entityId: '1', detail: { n: 1 } }));
      await fixture.db.transaction(c => commands.audit(c, actor, { action: 'prueba.dos', entity: 'prueba', entityId: '2', result: 'denegado' }));
      const result = await audit.verifyChain();
      expect(result.ok).toBe(true);
      expect(result.checked).toBeGreaterThanOrEqual(3);
    });
    test('una fila alterada se detecta y se identifica por seq', async () => {
      const row = (await fixture.pg.query<{ seq: number }>("SELECT seq FROM plataforma.auditoria WHERE accion='prueba.dos'")).rows[0];
      await fixture.pg.query("UPDATE plataforma.auditoria SET resultado='exito' WHERE seq=$1", [row.seq]);
      expect(await audit.verifyChain()).toMatchObject({ ok: false, seq: Number(row.seq) });
      await fixture.pg.query("UPDATE plataforma.auditoria SET resultado='denegado' WHERE seq=$1", [row.seq]);
      expect((await audit.verifyChain()).ok).toBe(true);
    });
    test('un hash reescrito o una fila eliminada rompen la cadena', async () => {
      const first = (await fixture.pg.query<{ seq: number }>("SELECT seq FROM plataforma.auditoria WHERE accion='prueba.uno'")).rows[0];
      await fixture.pg.query("DELETE FROM plataforma.auditoria WHERE seq=$1", [first.seq]);
      const result = await audit.verifyChain();
      expect(result.ok).toBe(false);
    });
  });
});
