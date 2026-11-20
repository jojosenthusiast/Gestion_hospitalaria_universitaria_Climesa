import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);

// Production flow audit of 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T2): API defects D21, D25/D26, D46, D48, D74, D90,
// D102, D103, D111, D116, D120, D128, D129 and D135. D97 is not changed: BL-03 lets a doctor with a current care relationship sign. Each rule has its RED test and, for each endpoint it touches, the previous
// behavior that still holds.

describe('Auditoría 2026-11-20 · ambulancia (D21, D25/D26, D116, D120, D135)', () => {
  const at = (local: string) => new Date(`2026-11-18T${local}:00-06:00`);
  let t: TestApp;
  let crew: string[];
  const unit = () => t.one<{ id: string; estado: string; version: number }>('SELECT id,estado,version FROM ambulancia.unidad');
  const dispatch = async () => t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA', crew, origin: 'Colonia Ficticia, casa 7' });
  const advance = async (id: string, ...types: string[]) => { for (const type of types) expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${id}/hitos`, { type })).status).toBe(201); };
  const provisional = async (description: string) => {
    const query = 'Persona sin documento en la vía';
    const search = await t.call('PAR', 'POST', '/pacientes/busquedas', { query });
    return t.call('PAR', 'POST', '/pacientes/provisionales', { givenNames: '', surnames: '', sex: 'masculino', estimatedAge: 40, description, searchToken: search.body.token, searchQuery: query });
  };
  const paramedicAttendance = (state: 'ausente' | 'publicado') => t.pg.transaction(async tx => {
    await tx.exec('SET LOCAL session_replication_role = replica');
    await tx.query(state === 'ausente'
      ? "UPDATE personal.turno SET estado='ausente',ausencia_tipo='justificada',asistencia_motivo='Incapacidad médica de prueba' WHERE persona_id=$1"
      : 'UPDATE personal.turno SET estado=\'publicado\',ausencia_tipo=NULL,asistencia_motivo=NULL WHERE persona_id=$1', [crew[0]]);
  });

  beforeAll(async () => {
    t = await createTestApp(at('08:00'));
    await t.shift('PAR', at('06:00'), at('18:00'));
    const driver = await t.driverShift(at('06:00'), at('18:00'));
    crew = [await t.staffOf('PAR'), driver];
    // Hospitalización receives too (owner decision 2): the nurse's only shift is in P2-HOS.
    await t.shift('ENF', at('06:00'), at('18:00'), 'P2-HOS');
    expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Inicio de turno con tripulación' })).status).toBe(201);
  });
  afterAll(async () => { await t?.close(); });

  test('D135: con el turno del paramédico marcado ausente, el bloqueo dice la ausencia y no pide publicar el turno', async () => {
    t.setNow(at('08:30'));
    await paramedicAttendance('ausente');
    try {
      const block = (await t.call('PAR', 'GET', '/ambulancia')).body.dispatchBlock;
      expect(block).toMatchObject({ code: 'sin_paramedico_de_turno', cause: 'ausencia_registrada' });
      expect(block.message).toContain('ausencia registrada');
      expect(block.action).not.toMatch(/[Pp]ublica/);
    } finally { await paramedicAttendance('publicado'); }
    expect((await t.call('PAR', 'GET', '/ambulancia')).body.dispatchBlock).toBeNull();
  });

  test('D135 (comportamiento previo): sin ningún turno de paramédico el bloqueo sigue pidiendo publicarlo, sin causa', async () => {
    t.setNow(at('19:00'));
    try {
      const block = (await t.call('JOP', 'GET', '/ambulancia')).body.dispatchBlock;
      expect(block.code).toBe('sin_tripulacion_de_turno');
      expect(block.cause).toBeUndefined();
      expect(block.action).toMatch(/Publica/);
    } finally { t.setNow(at('08:30')); }
  });

  test('D21: el expediente provisional que crea la tripulación queda vinculado a su servicio activo sin paciente', async () => {
    t.setNow(at('09:00'));
    const service = (await dispatch()).body;
    // D116 / S4: the dispatch reaches the crew account and those who receive at the hospital, not only the board.
    const [dispatched] = (await t.events('ambulancia.estado_cambiado', (await unit()).id)).slice(-1);
    expect(dispatched).toEqual(expect.arrayContaining(['ambulancia', 'rol:ENF', 'rol:REC', `usuario:${userId('PAR')}`]));
    // D25/D26: the arrival list shows the service from dispatch on, with its priority, report flag and last milestone.
    const arrivalOf = async () => ((await t.call('REC', 'GET', '/ambulancia/llegada')).body.services as any[]).find(s => s.serviceId === service.id);
    expect(await arrivalOf()).toMatchObject({ active: true, arrived: false, urgent: true, priority: 'roja', hasPrehospital: false, state: 'despachado' });
    await advance(service.id, 'salida', 'en_escena');
    // The report was sent before the record existed: the API used to leave the record orphaned.
    expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/prehospital`, { reason: 'Inconsciente en la vía pública', priority: 'roja', capturedAt: at('09:00').toISOString() })).status).toBe(201);
    expect(await arrivalOf()).toMatchObject({ arrived: false, hasPrehospital: true, state: 'en_escena' });
    const created = await provisional('Camisa roja, tatuaje en el brazo derecho');
    expect(created.status).toBe(201);
    expect(created.body.linkedServiceId).toBe(service.id);
    expect((await t.one('SELECT paciente_id FROM ambulancia.servicio WHERE id=$1', [service.id])).paciente_id).toBe(created.body.id);
    expect((await t.call('PAR', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).status).toBe(403);
    expect((await t.call('ENF', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body.patientLinked).toBe(true);
    expect((await t.audits('ambulancia.servicio.vincular_paciente')).at(-1)).toMatchObject({ paciente_id: created.body.id });
    expect((await t.events('ambulancia.prehospital', service.id)).at(-1)).toEqual(expect.arrayContaining(['ambulancia', 'rol:ENF']));

    // Previous behavior: a service that already has its patient keeps it; a second record is not linked.
    const second = await provisional('Segunda persona, pantalón azul');
    expect(second.status).toBe(201);
    expect(second.body).not.toHaveProperty('linkedServiceId');
    expect((await t.one('SELECT paciente_id FROM ambulancia.servicio WHERE id=$1', [service.id])).paciente_id).toBe(created.body.id);

    // D120 / S8: after the arrival, Recepción and the Hospitalización nurse may receive; a doctor without context may not.
    await advance(service.id, 'trasladando', 'en_hospital');
    expect(await arrivalOf()).toMatchObject({ arrived: true, state: 'en_hospital' });
    // Owner decision on D120: while the reception is open Recepción reads this report as a scoped, urgent access.
    const rec = (await t.call('REC', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(rec).toMatchObject({ urgent: true, urgentAccess: true, clinical: true, allowedActions: ['recibir'], blockedActions: [] });
    expect(rec.reports[0].reason).toBe('Inconsciente en la vía pública');
    const urgentRead = await t.one<{ motivo: string; detalle: any; actor_rol: string }>("SELECT motivo,detalle,actor_rol FROM plataforma.auditoria WHERE accion='ambulancia.prehospital.ver' AND actor_id=$1 ORDER BY seq DESC LIMIT 1", [userId('REC')]);
    expect(urgentRead).toMatchObject({ motivo: 'Recepción de ambulancia (urgente)', actor_rol: 'REC', detalle: { urgent: true, actorRoles: ['REC'], actorName: expect.any(String) } });
    // The access is scoped: the clinical record of the same patient stays closed to Recepción.
    expect((await t.call('REC', 'GET', `/pacientes/${created.body.id}/historial`)).status).toBe(403);
    const hos = (await t.call('ENF', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(hos).toMatchObject({ clinical: true, allowedActions: ['recibir'] });
    expect(hos.reports[0].reason).toBe('Inconsciente en la vía pública');
    const med = (await t.call('MED', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(med).toMatchObject({ clinical: false, allowedActions: [], blockedActions: [{ action: 'recibir', code: 'sin_contexto_recepcion', reason: expect.any(String) }] });
    expect((await t.call('MED', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {})).status).toBe(403);
    const received = await t.call('REC', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect(received.status).toBe(201);
    expect(received.body).toMatchObject({ serviceId: service.id, urgent: true, serviceClosed: true, unitState: 'disponible' });
    const urgentReception = await t.one<{ motivo: string; detalle: any; paciente_id: string }>("SELECT motivo,detalle,paciente_id FROM plataforma.auditoria WHERE accion='ambulancia.recepcion' ORDER BY seq DESC LIMIT 1");
    expect(urgentReception).toMatchObject({ motivo: 'Recepción de ambulancia (urgente)', paciente_id: created.body.id, detalle: { urgent: true } });
    // After the reception Recepción no longer reads the clinical content.
    expect((await t.call('REC', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body).toMatchObject({ urgentAccess: false, clinical: false });
    expect((await t.call('ENF', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body).toMatchObject({ allowedActions: [], blockedActions: [{ action: 'recibir', code: 'entrega_registrada' }] });
    const again = await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect([again.status, again.body.codigo]).toEqual([409, 'entrega_registrada']);
  });

  test('D120 (comportamiento previo): antes de la llegada nadie recibe y el motivo es sin_llegada_hospital', async () => {
    t.setNow(at('10:00'));
    const service = (await dispatch()).body;
    await advance(service.id, 'salida');
    // Before the arrival the reception is not open: Recepción sees no clinical content and it is no urgent access.
    expect((await t.call('REC', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body).toMatchObject({ arrived: false, urgentAccess: false, clinical: false, allowedActions: [], blockedActions: [{ action: 'recibir', code: 'sin_llegada_hospital' }] });
    const early = await t.call('REC', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect([early.status, early.body.codigo]).toEqual([409, 'sin_llegada_hospital']);
    const { version } = await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [service.id]);
    expect((await t.call('JOP', 'POST', `/ambulancia/servicios/${service.id}/cerrar`, { version, reason: 'Cierre del servicio de prueba' })).status).toBe(201);
  });
});
