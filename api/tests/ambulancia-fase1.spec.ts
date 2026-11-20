import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(180000);
const at = (local: string) => new Date(`2026-11-16T${local}:00-06:00`);

// Auditoría final, fase 1 de ambulancia: MA-AMB-02 (el despachador elige la tripulación), MA-AMB-03 (estados finales sin llegada falsa), MA-AMB-04 (entrega al hospital) y MA-AMB-05 (el paciente sigue y cancela su solicitud).
describe('Ambulancia · fase 1 (MA-AMB-02 a MA-AMB-05)', () => {
  let t: TestApp;
  let driverId: string;
  let crew: string[];
  const unit = () => t.one<{ id: string; estado: string; version: number }>('SELECT id,estado,version FROM ambulancia.unidad');
  const request = (role: string, body: Record<string, unknown> = {}) => t.call(role, 'POST', '/ambulancia/solicitudes', { address: 'Colonia Ficticia, pasaje 9, casa 4', reason: 'Dolor de pecho desde la mañana', contactPhone: '7000-0002', ...body });
  const dispatch = async (requestId?: string, chosen = crew) => t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia', crew: chosen, ...(requestId ? { requestId } : { origin: 'Residencial Ficticia, casa 1' }) });
  const milestone = (id: string, body: Record<string, unknown>) => t.call('PAR', 'POST', `/ambulancia/servicios/${id}/hitos`, body);
  const advance = async (id: string, ...types: string[]) => { for (const type of types) expect((await milestone(id, { type })).status).toBe(201); };

  beforeAll(async () => {
    t = await createTestApp(at('08:00'));
    await t.shift('PAR', at('06:00'), at('18:00'));
    driverId = await t.driverShift(at('06:00'), at('18:00'));
    // Enfermería recibe con turno en Emergencia; Medicina no tiene turno ni relación con los pacientes de este archivo.
    await t.shift('ENF', at('06:00'), at('18:00'), 'P1-EMG');
    crew = [await t.staffOf('PAR'), driverId];
    const current = await unit();
    expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: current.version, inMaintenance: false, reason: 'Inicio de turno con tripulación' })).status).toBe(201);
  });
  afterAll(async () => { await t?.close(); });

  test('MA-AMB-02: el despachador elige la tripulación entre quienes tienen turno; solo esa tripulación gana acceso clínico', async () => {
    // Un segundo paramédico con turno y cuenta: es candidato, pero no va en el servicio si no se elige.
    const other = (await t.one<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Paramédico','Disponible','paramedico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id")).id;
    await t.pg.transaction(async tx => {
      await tx.exec('SET LOCAL session_replication_role = replica');
      await tx.query("INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange($2::timestamptz,$3::timestamptz,'[)'),'diurno','publicado' FROM infra.espacio WHERE codigo='P1-CON'", [other, at('06:00'), at('18:00')]);
    });
    const offDuty = (await t.one<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Motorista','Sin Turno','motorista',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id")).id;
    const board = (await t.call('REC', 'GET', '/ambulancia')).body;
    expect(board.availableCrew.map((m: { staffId: string }) => m.staffId).sort()).toEqual([...crew, other].sort());
    expect(board.availableCrew.find((m: { staffId: string }) => m.staffId === crew[0])).toMatchObject({ role: 'paramedico', hasAccount: true, name: 'PAR Prueba' });
    expect((await t.call('PAR', 'GET', '/ambulancia')).body.availableCrew).toBeUndefined();
    // Con alguien sin turno o sin paramédico con cuenta, no se despacha.
    const notOnDuty = await dispatch(undefined, [crew[0], offDuty]);
    expect(notOnDuty.status).toBe(409);
    expect(notOnDuty.body.codigo).toBe('tripulante_sin_turno');
    const noParamedicAccount = await dispatch(undefined, [other, driverId]);
    expect(noParamedicAccount.body.codigo).toBe('sin_paramedico_de_turno');
    const noDriver = await dispatch(undefined, [crew[0], other]);
    expect(noDriver.body.codigo).toBe('sin_motorista_de_turno');
    const service = await dispatch();
    expect(service.status).toBe(201);
    expect(service.body.crew.map((m: { staffId: string }) => m.staffId).sort()).toEqual([...crew].sort());
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM ambulancia.tripulacion WHERE persona_id=$1', [other])).n).toBe(0);
    expect((await t.call('JOP', 'POST', `/ambulancia/servicios/${service.body.id}/cerrar`, { version: service.body.version, reason: 'Servicio de prueba de tripulación' })).status).toBe(201);
  });

  test('MA-AMB-03: desde trasladando se finaliza con fallecimiento o desvío y motivo, sin registrar una llegada falsa', async () => {
    const service = (await dispatch()).body;
    t.setNow(at('09:00'));
    await advance(service.id, 'salida', 'en_escena');
    let board = (await t.call('PAR', 'GET', '/ambulancia')).body.activeService;
    expect(board.finalStates).toEqual(['sin_traslado', 'rechaza_traslado', 'fallecido', 'cancelado']);
    const tooEarly = await milestone(service.id, { type: 'finalizado', finalState: 'desviado', reason: 'Desvío por saturación' });
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.codigo).toBe('estado_final_invalido');
    await advance(service.id, 'trasladando');
    board = (await t.call('PAR', 'GET', '/ambulancia')).body.activeService;
    expect(board.nextMilestones).toEqual(['en_hospital', 'finalizado']);
    expect(board.finalStates).toEqual(['fallecido', 'desviado', 'cancelado']);
    const noTransfer = await milestone(service.id, { type: 'finalizado', finalState: 'sin_traslado', reason: 'Ya va en traslado' });
    expect(noTransfer.body.codigo).toBe('estado_final_invalido');
    expect((await milestone(service.id, { type: 'finalizado', finalState: 'desviado', reason: 'x' })).body.codigo).toBe('estado_final_invalido');
    const diverted = await milestone(service.id, { type: 'finalizado', finalState: 'desviado', reason: 'Desviado al Hospital Rosales (ficticio) por saturación' });
    expect(diverted.status).toBe(201);
    expect(diverted.body).toMatchObject({ finalState: 'desviado', unitState: 'disponible' });
    const row = await t.one('SELECT estado_final,motivo_final FROM ambulancia.servicio WHERE id=$1', [service.id]);
    expect(row).toEqual({ estado_final: 'desviado', motivo_final: 'Desviado al Hospital Rosales (ficticio) por saturación' });
    expect((await t.one<{ n: number }>("SELECT count(*)::int AS n FROM ambulancia.hito WHERE servicio_id=$1 AND tipo='en_hospital'", [service.id])).n).toBe(0);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?finalState=desviado')).body.map((s: { id: string }) => s.id)).toEqual([service.id]);
  });

  test('MA-AMB-03: la base rechaza un estado final que no corresponde a los hitos aunque no pase por la API', async () => {
    const service = (await dispatch()).body;
    await advance(service.id, 'salida', 'en_escena', 'trasladando');
    await t.pg.transaction(async tx => {
      await tx.query("INSERT INTO ambulancia.hito(servicio_id,tipo,ocurrido_en,registrado_por,clave_idempotencia) VALUES($1,'finalizado',now(),$2,'prueba-final-directa')", [service.id, userId('PAR')]);
      await expect(tx.query("UPDATE ambulancia.servicio SET finalizado_en=now(),estado_final='completado' WHERE id=$1", [service.id])).rejects.toThrow(/estado_final_invalido/);
      await tx.rollback();
    });
    expect((await milestone(service.id, { type: 'finalizado', finalState: 'fallecido', reason: 'Paro cardiorrespiratorio sin respuesta a la reanimación' })).status).toBe(201);
  });

  test('MA-AMB-04: el personal clínico marca recibido al paciente solo después de la llegada y una sola vez', async () => {
    const service = (await dispatch()).body;
    t.setNow(at('10:00'));
    await advance(service.id, 'salida', 'en_escena', 'trasladando');
    expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/prehospital`, { reason: 'Dolor torácico opresivo', priority: 'roja', capturedAt: at('10:00').toISOString() })).status).toBe(201);
    let view = (await t.call('MED', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(view).toMatchObject({ arrived: false, handover: null, allowedActions: [] });
    const early = await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect(early.status).toBe(409);
    expect(early.body.codigo).toBe('sin_llegada_hospital');
    await advance(service.id, 'en_hospital');
    // La llegada avisa también a quien recibe (Enfermería no lee el tablero de la unidad).
    const [arrivalChannels] = (await t.events('ambulancia.hito', service.id)).slice(-1);
    expect(arrivalChannels).toEqual(expect.arrayContaining(['rol:ENF', 'rol:MED']));
    // Otro hito cambió la versión del servicio: la entrega no la exige.
    expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/prehospital`, { reason: 'Dolor torácico, llegada', priority: 'roja', capturedAt: at('10:00').toISOString() })).status).toBe(201);
    view = (await t.call('ENF', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(view).toMatchObject({ arrived: true, handover: null, allowedActions: ['recibir'] });
    // Auditoría 2026-11-20 (D120, decisión del dueño): con la recepción abierta Recepción lee el reporte como acceso urgente y recibe.
    const recView = (await t.call('REC', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(recView).toMatchObject({ clinical: true, urgentAccess: true, allowedActions: ['recibir'], blockedActions: [] });
    expect(recView.reports.map((report: { reason?: string }) => report.reason)).toContain('Dolor torácico, llegada');
    const received = await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect(received.status).toBe(201);
    expect(received.body).toMatchObject({ serviceId: service.id, receivedAt: at('10:00').toISOString(), receivedByName: 'ENF Prueba' });
    const stored = await t.one('SELECT recibido_por,recibido_en FROM ambulancia.servicio WHERE id=$1', [service.id]);
    expect(stored.recibido_por).toBe(userId('ENF'));
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM ambulancia.reporte_prehospital WHERE servicio_id=$1 AND recibido_por=$2', [service.id, userId('ENF')])).n).toBe(2);
    view = (await t.call('MED', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body;
    expect(view).toMatchObject({ handover: { receivedAt: at('10:00').toISOString(), receivedByName: 'ENF Prueba' }, allowedActions: [] });
    const again = await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect(again.body.codigo).toBe('entrega_registrada');
    expect(await t.events('ambulancia.prehospital', service.id)).toHaveLength(3);
    await expect(t.pg.query('UPDATE ambulancia.servicio SET recibido_por=$2,recibido_en=now() WHERE id=$1', [service.id, userId('MED')])).rejects.toThrow(/entrega_registrada/);
    // R7 D-7 (owner): the reception already closed the service, so the crew's late «Finalizar» is the existing 409.
    expect(received.body).toMatchObject({ serviceClosed: true, unitState: 'disponible' });
    const late = await milestone(service.id, { type: 'finalizado' });
    expect([late.status, late.body.codigo]).toEqual([409, 'servicio_finalizado']);
  });

  test('MA-AMB-04: Enfermería encuentra la llegada sin reporte prehospital y la recibe después de que la tripulación finalizó', async () => {
    expect((await t.call('ENF', 'GET', '/ambulancia/llegada')).body).toEqual({ serviceId: null, services: [] });
    const service = (await dispatch()).body;
    t.setNow(at('11:00'));
    expect((await t.call('ENF', 'GET', '/ambulancia/llegada')).body).toMatchObject({ serviceId: service.id, services: [{ serviceId: service.id, active: true, arrived: false }] });
    await advance(service.id, 'salida', 'en_escena', 'trasladando', 'en_hospital');
    expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos`, { type: 'finalizado' })).status).toBe(201);
    // Finalizado sin entrega: la llegada sigue visible para recibir al paciente.
    expect((await t.call('ENF', 'GET', '/ambulancia/llegada')).body).toMatchObject({ serviceId: service.id, services: [{ serviceId: service.id, active: false, arrived: true }] });
    expect((await t.call('ENF', 'GET', `/ambulancia/servicios/${service.id}/prehospital`)).body).toMatchObject({ reports: [], arrived: true, allowedActions: ['recibir'] });
    expect((await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {})).status).toBe(201);
    expect((await t.call('ENF', 'GET', '/ambulancia/llegada')).body).toEqual({ serviceId: null, services: [] });
    expect((await t.call('PAC', 'GET', '/ambulancia/llegada')).status).toBe(403);
  });

  test('re-revisión #117: un servicio finalizado sin recibir sigue en la llegada aunque la unidad salga a otro', async () => {
    t.setNow(at('11:05'));
    const first = (await dispatch()).body;
    await advance(first.id, 'salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado');
    const second = (await dispatch()).body;
    let arrival = (await t.call('ENF', 'GET', '/ambulancia/llegada')).body;
    expect(arrival.serviceId).toBe(first.id);
    expect(arrival.services).toMatchObject([{ serviceId: first.id, active: false, arrived: true }, { serviceId: second.id, active: true, arrived: false }]);
    expect(JSON.stringify(arrival)).not.toMatch(/reason|vitalSigns|patient|paciente/);
    expect((await t.call('ENF', 'POST', `/ambulancia/servicios/${first.id}/recepcion`, {})).status).toBe(201);
    arrival = (await t.call('ENF', 'GET', '/ambulancia/llegada')).body;
    expect(arrival.services.map((s: { serviceId: string }) => s.serviceId)).toEqual([second.id]);
    const { version } = await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [second.id]);
    expect((await t.call('JOP', 'POST', `/ambulancia/servicios/${second.id}/cerrar`, { version, reason: 'Cierre del servicio de prueba' })).status).toBe(201);
  });

  test('re-revisión #117: el contenido clínico y la entrega son de quien tiene turno en Emergencia o relación con el paciente', async () => {
    t.setNow(at('11:10'));
    const stranger = await t.patient();
    const phone = await t.one<{ id: string }>("INSERT INTO ambulancia.solicitud(canal,paciente_id,direccion,motivo,telefono_contacto,solicitante_nombre,creada_en) VALUES('telefono',$1,'Colonia Ficticia 5','Caída de su altura','7000-0005','Vecina',$2) RETURNING id", [stranger, at('11:10')]);
    const service = (await dispatch(phone.id)).body;
    await advance(service.id, 'salida', 'en_escena', 'trasladando');
    expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/prehospital`, { reason: 'Fractura de cadera probable', priority: 'amarilla', capturedAt: at('11:10').toISOString() })).status).toBe(201);
    await advance(service.id, 'en_hospital');
    const read = (role: string) => t.call(role, 'GET', `/ambulancia/servicios/${service.id}/prehospital`).then(r => r.body);
    // Medicina sin turno en Emergencia ni relación con el paciente: vista operativa, sin entrega.
    let view = await read('MED');
    expect(view).toMatchObject({ clinical: false, arrived: true, allowedActions: [] });
    expect(view.reports[0].reason).toBeUndefined();
    expect((await t.call('MED', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {})).status).toBe(403);
    // Un turno en otra área tampoco basta.
    await t.shift('MED', at('06:00'), at('18:00'));
    expect((await read('MED')).clinical).toBe(false);
    // Enfermería ausente en su turno de Emergencia no ve lo clínico; de vuelta a publicado, sí.
    const nurse = await t.staffOf('ENF');
    const attendance = (sql: string) => t.pg.transaction(async tx => { await tx.exec('SET LOCAL session_replication_role = replica'); await tx.query(sql, [nurse]); });
    await attendance("UPDATE personal.turno SET estado='ausente',ausencia_tipo='injustificada',asistencia_motivo='No se presentó al turno de prueba' WHERE persona_id=$1");
    expect(await read('ENF')).toMatchObject({ clinical: false, allowedActions: [] });
    expect((await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {})).status).toBe(403);
    await attendance("UPDATE personal.turno SET estado='publicado',ausencia_tipo=NULL,asistencia_motivo=NULL WHERE persona_id=$1");
    expect((await read('ENF')).reports[0].reason).toBe('Fractura de cadera probable');
    // Auditoría D120 (decisión del dueño): quien recibe sin expediente.ver (Recepción, Jefatura) lee el reporte de la
    // recepción abierta como acceso urgente y auditado; fuera de la recepción conserva la vista operativa.
    expect(await read('JOP')).toMatchObject({ clinical: true, urgentAccess: true, priority: 'roja' });
    // Con relación de atención con el paciente, Medicina ve lo clínico y recibe.
    await t.pg.query("INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia) VALUES($1,$2,'consulta',gen_random_uuid(),tstzrange($3::timestamptz,NULL))", [stranger, await t.staffOf('MED'), at('08:00')]);
    view = await read('MED');
    expect(view).toMatchObject({ clinical: true, allowedActions: ['recibir'] });
    expect(view.reports[0].reason).toBe('Fractura de cadera probable');
    expect((await t.call('MED', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {})).status).toBe(201);
    // R7 D-7: the reception closed the service; the unit is free for the next test.
    expect((await unit()).estado).toBe('disponible');
  });

  test('re-revisión #117: sin `crew` (clientes anteriores) se despacha con la tripulación propuesta y la auditoría lo marca; los hitos no retroceden', async () => {
    t.setNow(at('11:20'));
    const legacy = await t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', origin: 'Residencial Ficticia, casa 1', destination: 'Hospital CLIMESA' });
    expect(legacy.status).toBe(201);
    expect(legacy.body.crew.map((m: { staffId: string }) => m.staffId).sort()).toEqual([...crew].sort());
    const dispatches = await t.audits('ambulancia.despachar');
    expect(dispatches.at(-1)!.detalle).toMatchObject({ crewFallback: true, crew: expect.arrayContaining(crew) });
    expect(dispatches.at(-2)!.detalle).toMatchObject({ crewFallback: false });
    t.setNow(at('11:25'));
    expect((await milestone(legacy.body.id, { type: 'salida', occurredAt: at('11:22').toISOString() })).status).toBe(201);
    const backwards = await milestone(legacy.body.id, { type: 'en_escena', occurredAt: at('11:21').toISOString() });
    expect(backwards.status).toBe(409);
    expect(backwards.body).toMatchObject({ codigo: 'hito_hora_invalida', detail: 'La hora del hito es anterior al último hito registrado del servicio.' });
    const stale = await milestone(legacy.body.id, { type: 'en_escena', occurredAt: new Date(at('11:25').getTime() - 25 * 3600_000).toISOString() });
    expect(stale.body).toMatchObject({ codigo: 'hito_hora_invalida', detail: 'La hora del hito tiene más de 24 horas; ya no se registra.' });
    expect((await milestone(legacy.body.id, { type: 'en_escena', occurredAt: at('11:22').toISOString() })).status).toBe(201);
    const { version } = await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [legacy.body.id]);
    expect((await t.call('JOP', 'POST', `/ambulancia/servicios/${legacy.body.id}/cerrar`, { version, reason: 'Cierre del servicio de prueba' })).status).toBe(201);
  });

  test('MA-AMB-05: el paciente consulta su solicitud en el servidor, la cancela mientras está por confirmar y sigue el servicio', async () => {
    await t.patient({ linkPac: true });
    expect((await t.call('PAC', 'GET', '/ambulancia/solicitudes/mias')).body).toEqual([]);
    const created = (await request('PAC')).body;
    let mine = (await t.call('PAC', 'GET', '/ambulancia/solicitudes/mias')).body;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: created.id, state: 'por_confirmar', version: 1, service: null, allowedActions: ['cancelar'], notice: 'Si hay riesgo de vida, llama al 911.' });
    expect((await t.call('REC', 'POST', `/ambulancia/solicitudes/${created.id}/cancelar`, { version: 1 })).status).toBe(403);
    expect((await t.call('PAC', 'POST', `/ambulancia/solicitudes/${created.id}/cancelar`, { version: 7 })).body.codigo).toBe('version_conflicto');
    const cancelled = await t.call('PAC', 'POST', `/ambulancia/solicitudes/${created.id}/cancelar`, { version: 1, reason: 'Un familiar me llevó al hospital' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body).toMatchObject({ id: created.id, state: 'cancelada', version: 2 });
    expect(await t.one('SELECT estado,motivo_cancelacion,resuelta_por FROM ambulancia.solicitud WHERE id=$1', [created.id])).toEqual({ estado: 'cancelada', motivo_cancelacion: 'Un familiar me llevó al hospital', resuelta_por: userId('PAC') });
    expect((await t.call('PAC', 'POST', `/ambulancia/solicitudes/${created.id}/cancelar`, { version: 2 })).body.codigo).toBe('solicitud_resuelta');
    expect((await t.call('REC', 'GET', '/ambulancia')).body.pendingRequests.map((r: { id: string }) => r.id)).not.toContain(created.id);
    const [channels] = await t.events('ambulancia.estado_cambiado', created.id);
    expect(channels).toEqual(expect.arrayContaining(['ambulancia', `usuario:${userId('PAC')}`]));
    // Una solicitud confirmada muestra el avance del servicio y ya no se cancela desde la app.
    t.setNow(at('11:30'));
    const second = (await request('PAC')).body;
    const service = (await dispatch(second.id)).body;
    await advance(service.id, 'salida');
    mine = (await t.call('PAC', 'GET', '/ambulancia/solicitudes/mias')).body;
    expect(mine.map((r: { id: string }) => r.id)).toEqual([second.id, created.id]);
    expect(mine[0]).toMatchObject({ state: 'confirmada', allowedActions: [], service: { finalState: null, milestones: [{ type: 'salida' }] } });
    expect(JSON.stringify(mine[0].service)).not.toMatch(/crew|tripulacion|staffId/);
    expect((await t.call('PAC', 'POST', `/ambulancia/solicitudes/${second.id}/cancelar`, { version: mine[0].version })).body.codigo).toBe('solicitud_resuelta');
    expect((await t.audits('ambulancia.solicitud.ver_propia')).length).toBeGreaterThan(0);
  });

  test('MA-AMB-05: el paciente no ve ni cancela solicitudes ajenas; la telefónica a su nombre la ve sin poder cancelarla', async () => {
    t.setNow(at('12:00'));
    const own = await t.one<{ id: string }>('SELECT paciente_id AS id FROM acceso.usuario WHERE id=$1', [userId('PAC')]);
    const stranger = await t.patient();
    const foreign = await t.one<{ id: string }>("INSERT INTO ambulancia.solicitud(canal,solicitante_usuario_id,paciente_id,direccion,motivo,telefono_contacto,creada_en) VALUES('app_paciente',$1,$2,'Colonia Ajena 1','Caída en casa','7000-0003',$3) RETURNING id", [userId("MED"), stranger, at("12:00")]);
    const phone = await t.one<{ id: string }>("INSERT INTO ambulancia.solicitud(canal,paciente_id,direccion,motivo,telefono_contacto,solicitante_nombre,creada_en) VALUES('telefono',$1,'Colonia Ficticia 3','Llamada de un vecino','7000-0004','Vecino',$2) RETURNING id", [own.id, at('12:01')]);
    const mine = (await t.call('PAC', 'GET', '/ambulancia/solicitudes/mias')).body as Array<{ id: string; allowedActions: string[] }>;
    expect(mine.map(r => r.id)).not.toContain(foreign.id);
    expect(mine.find(r => r.id === phone.id)).toMatchObject({ allowedActions: [] });
    expect((await t.call('PAC', 'POST', `/ambulancia/solicitudes/${foreign.id}/cancelar`, { version: 1 })).status).toBe(403);
    expect((await t.call('PAC', 'POST', `/ambulancia/solicitudes/${phone.id}/cancelar`, { version: 1 })).status).toBe(403);
    expect(await t.one('SELECT estado FROM ambulancia.solicitud WHERE id=$1', [foreign.id])).toEqual({ estado: 'por_confirmar' });
  });
});
