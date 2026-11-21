import { createTestApp, TestApp } from './support/app';
import { SYSTEM_ACTOR } from '../src/platform/actor';
import { CommandService } from '../src/platform/command.service';
import { DatabaseService } from '../src/platform/database.service';
import { validateDemographics } from '../src/patients/patient.rules';

jest.setTimeout(240000);

// Second code audit of 2026-11-20 (odd/tasks/parcial3-auditoria2.md, section API): A1, A2, A3, A5 and A6. Each rule has
// its test and, for each endpoint it touches, the previous behavior that still holds.

describe('Parcial 3 · segunda auditoría de código (API)', () => {
  const now = new Date('2026-11-18T16:00:00Z'); // 10:00 in El Salvador
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });
  afterEach(() => t.setNow(now));

  test('A1: «Quién vio mi expediente» cuenta las lecturas de listas que incluyen al paciente, no las del sistema', async () => {
    const patientId = await t.patient({ linkPac: true, name: 'Rosa' });
    expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId })).status).toBe(201);
    const count = async () => {
      const mine = await t.call('PAC', 'GET', '/me/accesos');
      expect(mine.status).toBe(200);
      return (mine.body as unknown[]).length;
    };
    const before = await count();
    // The queue read audits one row with paciente_id NULL and the listed patients in detalle.patientIds.
    expect((await t.call('REC', 'GET', '/fila?service=consulta_general')).status).toBe(200);
    expect(await count()).toBe(before + 1);
    const row = ((await t.call('PAC', 'GET', '/me/accesos')).body as any[])[0];
    expect(row).toMatchObject({ rol: 'Recepcionista', tipoDato: 'fila', motivo: 'atención', urgente: false });
    // Previous behavior: a list read without the patient does not count.
    expect((await t.call('REC', 'GET', '/fila?service=laboratorio')).status).toBe(200);
    expect(await count()).toBe(before + 1);
    // An automatic sweep (system actor) is not someone looking at the record.
    const commands = t.app.get(CommandService), db = t.app.get(DatabaseService);
    await db.transaction(c => commands.audit(c, SYSTEM_ACTOR, { action: 'citas.barrido_prueba', entity: 'cita', detail: { ids: [], patientIds: [patientId] } }));
    expect(await count()).toBe(before + 1);
  });

  test('A2: editar un aviso sin enviar la audiencia conserva sus roles; no lo vuelve público', async () => {
    const hasta = '2026-11-25T00:00:00Z';
    const created = await t.call('JOP', 'POST', '/avisos', { titulo: 'Aviso solo enfermería', cuerpo: 'Cambio de turno a las 7.', hasta, publico: false, roles: ['ENF'] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const edited = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 1, titulo: 'Aviso solo enfermería', cuerpo: 'Cambio de turno a las 8.', hasta });
    expect(edited.status).toBe(200);
    const listed = ((await t.call('JOP', 'GET', '/avisos')).body as any[]).find(a => a.id === id);
    expect(listed).toMatchObject({ publico: false, roles: ['ENF'], cuerpo: 'Cambio de turno a las 8.' });
    const publicTitles = (await t.app.inject({ method: 'GET', url: '/api/v1/publico/avisos' })).json().avisos.map((a: any) => a.titulo);
    expect(publicTitles).not.toContain('Aviso solo enfermería');
    // Previous behavior: an edit that sends the audience changes it.
    const reopened = await t.call('JOP', 'PUT', `/avisos/${id}`, { version: 2, titulo: 'Aviso solo enfermería', cuerpo: 'Cambio de turno a las 8.', hasta, publico: true, roles: [] });
    expect(reopened.status).toBe(200);
    expect(((await t.call('JOP', 'GET', '/avisos')).body as any[]).find(a => a.id === id)).toMatchObject({ publico: true, roles: [] });
  });

  test('A3: una segunda indicación de hospitalización del mismo paciente responde admision_activa', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    const body = { patientId, origin: 'consulta', originId: consultation.id, requestedCategory: 'semiprivada', isolation: false, motive: 'Neumonía que requiere observación' };
    expect((await t.call('MED', 'POST', '/admisiones/indicaciones', body)).status).toBe(201);
    const again = await t.call('MED', 'POST', '/admisiones/indicaciones', body);
    expect([again.status, again.body.codigo, again.body.detail]).toEqual([409, 'admision_activa', 'El paciente ya tiene una admisión activa.']);
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM hospitalizacion.admision WHERE paciente_id=$1', [patientId])).n).toBe(1);
  });

  test('A5: un número de un día anterior no admite comandos ni los ofrece; el de hoy sí', async () => {
    const issued = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: await t.patient() });
    expect(issued.status).toBe(201);
    const yesterday = '2026-11-18';
    t.setNow(new Date(now.getTime() + 24 * 3600_000));
    const refused = 'El número es de un día anterior; emite uno nuevo para hoy.';
    for (const [path, payload] of [['llamar', { version: issued.body.version }], ['atender', { version: issued.body.version }], ['deshacer-llamado', { version: issued.body.version }], ['prioridad', { version: issued.body.version, priority: 'urgente' }]] as const) {
      const r = await t.call('REC', 'POST', `/fila/${issued.body.id}/${path}`, payload);
      expect([r.status, r.body.codigo, r.body.detail]).toEqual([409, 'transicion_invalida', refused]);
    }
    const old = ((await t.call('REC', 'GET', `/fila?date=${yesterday}`)).body as any[]).find(r => r.id === issued.body.id);
    expect(old).toMatchObject({ allowedActions: [], undoActions: [] });
    // Previous behavior: today's number is called as before.
    const fresh = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: await t.patient() });
    const called = await t.call('REC', 'POST', `/fila/${fresh.body.id}/llamar`, { version: fresh.body.version });
    expect(called.status).toBe(201);
    expect(((await t.call('REC', 'GET', '/fila')).body as any[]).find(r => r.id === fresh.body.id).allowedActions).toContain('llamar');
  });
});

describe('A6: la fecha de nacimiento futura se mide en el día de El Salvador', () => {
  const base = { givenNames: 'Ana', surnames: 'Ficticia', sex: 'femenino' };
  // 19:30 of 19-Nov in El Salvador is already 20-Nov in UTC.
  const evening = new Date('2026-11-20T01:30:00Z');
  test('a las 19:30 del 19 de noviembre, el 20 de noviembre todavía es futuro', () => {
    expect(() => validateDemographics({ ...base, birth: '2026-11-20' }, evening)).toThrow('Revisa la fecha de nacimiento');
    expect(validateDemographics({ ...base, birth: '2026-11-19' }, evening).birth).toBe('2026-11-19');
  });
  test('el límite de 120 años también sale del día local', () => {
    expect(validateDemographics({ ...base, birth: '1906-11-19' }, evening).birth).toBe('1906-11-19');
    expect(() => validateDemographics({ ...base, birth: '1906-11-18' }, evening)).toThrow('Revisa la fecha de nacimiento');
  });
});
