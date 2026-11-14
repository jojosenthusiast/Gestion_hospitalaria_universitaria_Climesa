import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(180000);
const at = (local: string) => new Date(`2026-11-15T${local}:00-06:00`);

// Spec 109 T03, T04, T07, T09: solicitud, despacho atómico, hitos, finalización, prehospital y bitácora.
describe('Ambulancia · solicitud, despacho único y servicio hasta finalizar (HU-109)', () => {
  let t: TestApp;
  let unitVersion: number;
  let pacRequestId: string;
  let pacPatientId: string;
  const unit = () => t.one<{ id: string; estado: string; version: number }>('SELECT id,estado,version FROM ambulancia.unidad');
  const request = (role: string, body: Record<string, unknown> = {}, key?: string) => t.call(role, 'POST', '/ambulancia/solicitudes', { address: 'Colonia Ficticia, pasaje 3, casa 12', municipality: 'San Salvador', reason: 'Caída en casa con dolor de cadera', contactPhone: '7000-0001', ...body }, key);
  const dispatch = (body: Record<string, unknown>, role = 'REC', key?: string) => t.call(role, 'POST', '/ambulancia/servicios', { type: 'emergencia_domicilio', priority: 'naranja', destination: 'Hospital CLIMESA, emergencia', ...body }, key);
  const milestone = (id: string, body: Record<string, unknown>, role = 'PAR', key?: string) => t.call(role, 'POST', `/ambulancia/servicios/${id}/hitos`, body, key);

  beforeAll(async () => {
    t = await createTestApp(at('08:00'));
    await t.shift('PAR', at('06:00'), at('14:00'));
    const current = await unit();
    const ready = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: current.version, inMaintenance: false, reason: 'Inicio de turno con paramédico' });
    expect(ready.status).toBe(201);
    unitVersion = ready.body.version;
  });
  afterAll(async () => { await t?.close(); });

  test('la base garantiza una sola unidad (RN-28, DAT-08)', async () => {
    await expect(t.pg.query("INSERT INTO ambulancia.unidad(placa) VALUES('P-000-002')")).rejects.toThrow();
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM ambulancia.unidad')).n).toBe(1);
  });

  test('el paciente sin cuenta verificada no puede pedir; verificado queda por confirmar con el aviso del 911 (FR-109-02)', async () => {
    const denied = await request('PAC');
    expect(denied.status).toBe(403);
    expect(denied.body.codigo).toBe('cuenta_no_verificada');
    const patientId = await t.patient({ linkPac: true });
    pacPatientId = patientId;
    const created = await request('PAC');
    pacRequestId = created.body.id;
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ state: 'por_confirmar', channel: 'app_paciente', version: 1, notice: 'Si hay riesgo de vida, llama al 911.' });
    const row = await t.one('SELECT paciente_id,solicitante_usuario_id,estado FROM ambulancia.solicitud WHERE id=$1', [created.body.id]);
    expect(row).toEqual({ paciente_id: patientId, solicitante_usuario_id: userId('PAC'), estado: 'por_confirmar' });
    const [channels] = await t.events('ambulancia.solicitud_creada', created.body.id);
    expect(channels).toEqual(expect.arrayContaining(['ambulancia', 'rol:JOP', 'rol:REC', `usuario:${userId('PAC')}`]));
    expect(channels).not.toContain('rol:PAC');
    // El paciente no puede pedir a nombre de otro, ni ver el tablero de despacho.
    expect((await request('PAC', { patientId: randomUUID() })).status).toBe(403);
    expect((await t.call('PAC', 'GET', '/ambulancia')).status).toBe(403);
    expect((await request('ADM')).status).toBe(403);
  });

  test('recepción registra una llamada y la ve por confirmar; descartar exige motivo y versión vigente (FR-109-03)', async () => {
    const phone = await request('REC', { address: 'Barrio Ficticio, calle 2', contactPhone: '2200-0000' });
    expect(phone.status).toBe(201);
    expect(phone.body.channel).toBe('telefono');
    const board = await t.call('REC', 'GET', '/ambulancia');
    expect(board.body.pendingRequests.map((r: any) => r.id)).toContain(phone.body.id);
    expect(board.body.pendingRequests.find((r: any) => r.id === phone.body.id)).toMatchObject({ channel: 'telefono', contactPhone: '2200-0000', registeredPatient: false });
    expect((await t.call('MED', 'GET', '/ambulancia')).body.pendingRequests).toBeUndefined();
    const stale = await t.call('JOP', 'POST', `/ambulancia/solicitudes/${phone.body.id}/descartar`, { version: 9, reason: 'Llamada duplicada' });
    expect(stale.status).toBe(409);
    expect(stale.body.codigo).toBe('version_conflicto');
    expect((await t.call('PAR', 'POST', `/ambulancia/solicitudes/${phone.body.id}/descartar`, { version: 1, reason: 'Llamada duplicada' })).status).toBe(403);
    const discarded = await t.call('JOP', 'POST', `/ambulancia/solicitudes/${phone.body.id}/descartar`, { version: 1, reason: 'Llamada duplicada' });
    expect(discarded.status).toBe(201);
    expect(discarded.body).toMatchObject({ state: 'descartada', version: 2 });
    const again = await t.call('JOP', 'POST', `/ambulancia/solicitudes/${phone.body.id}/descartar`, { version: 2, reason: 'Llamada duplicada' });
    expect(again.body.codigo).toBe('solicitud_resuelta');
  });

  // Escenario 1 (FR-109-05): dos despachos simultáneos de la única unidad; uno gana.
  test('dos despachos a la vez: uno queda En Servicio y el otro recibe "la ambulancia ya fue despachada"', async () => {
    const first = await request('REC', { address: 'Residencial Ficticia 1' });
    const second = await request('REC', { address: 'Residencial Ficticia 2' });
    const results = await Promise.all([dispatch({ version: unitVersion, requestId: first.body.id }), dispatch({ version: unitVersion, requestId: second.body.id }, 'JOP')]);
    const won = results.filter(r => r.status === 201), lost = results.filter(r => r.status !== 201);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0].status).toBe(409);
    expect(lost[0].body.codigo).toBe('ambulancia_ya_despachada');
    expect(lost[0].body.detail).toBe('La ambulancia ya fue despachada.');
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM ambulancia.servicio WHERE finalizado_en IS NULL')).n).toBe(1);
    expect((await unit()).estado).toBe('en_servicio');
    expect(won[0].body.crew).toEqual([{ staffId: await t.staffOf('PAR'), role: 'paramedico' }]);
    // La solicitud perdedora sigue por confirmar; la ganadora queda confirmada.
    const states = (await t.pg.query<{ estado: string }>('SELECT estado FROM ambulancia.solicitud WHERE id = ANY($1::uuid[]) ORDER BY estado', [[first.body.id, second.body.id]])).rows.map(r => r.estado);
    expect(states).toEqual(['confirmada', 'por_confirmar']);
  });

  test('la base rechaza un segundo servicio activo y cambios de estado incoherentes aunque no pasen por la API', async () => {
    const u = await unit();
    await expect(t.pg.query("INSERT INTO ambulancia.servicio(unidad_id,tipo,prioridad,origen,destino,despachado_por) VALUES($1,'emergencia_domicilio','roja','Calle ficticia','Hospital CLIMESA',$2)", [u.id, userId('REC')])).rejects.toThrow(/servicio_activo_unico|duplicate key/);
    await expect(t.pg.query("UPDATE ambulancia.unidad SET estado='disponible'")).rejects.toThrow(/unidad_con_servicio_activo/);
    const maintenance = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: u.version, inMaintenance: true, reason: 'Revisión urgente de frenos' });
    expect(maintenance.body.codigo).toBe('unidad_en_servicio');
  });

  test('los hitos van en orden, solo la tripulación los registra y finalizar devuelve la unidad a Disponible (FR-109-07, FR-109-08)', async () => {
    const status = await t.call('PAR', 'GET', '/ambulancia');
    const service = status.body.activeService;
    expect(service.nextMilestones).toEqual(['salida']);
    expect(JSON.stringify(status.body)).not.toContain('Paciente');
    expect((await milestone(service.id, { type: 'salida' }, 'MED')).status).toBe(403);
    const early = await milestone(service.id, { type: 'en_escena' });
    expect(early.status).toBe(409);
    expect(early.body.codigo).toBe('hito_fuera_de_orden');
    t.setNow(at('08:05'));
    const key = randomUUID();
    const out = await milestone(service.id, { type: 'salida' }, 'PAR', key);
    expect(out.status).toBe(201);
    expect((await milestone(service.id, { type: 'salida' }, 'PAR', key)).body).toEqual(out.body);
    expect((await t.one<{ n: number }>("SELECT count(*)::int AS n FROM ambulancia.hito WHERE servicio_id=$1 AND tipo='salida'", [service.id])).n).toBe(1);
    t.setNow(at('08:20'));
    expect((await milestone(service.id, { type: 'en_escena' })).status).toBe(201);
    expect((await milestone(service.id, { type: 'trasladando' })).status).toBe(201);
    t.setNow(at('08:40'));
    expect((await milestone(service.id, { type: 'en_hospital' })).status).toBe(201);
    const wrong = await milestone(service.id, { type: 'finalizado', finalState: 'sin_traslado', reason: 'Paciente estable' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.codigo).toBe('estado_final_invalido');
    const finished = await milestone(service.id, { type: 'finalizado' });
    expect(finished.status).toBe(201);
    expect(finished.body).toMatchObject({ finalState: 'completado', unitState: 'disponible', nextMilestones: [] });
    expect(await unit()).toMatchObject({ estado: 'disponible', version: finished.body.unitVersion });
    expect((await milestone(service.id, { type: 'finalizado' })).body.codigo).toBe('servicio_finalizado');
    const events = await t.events('ambulancia.hito', service.id);
    expect(events).toHaveLength(5);
    // Solicitud telefónica sin paciente registrado: nadie más sigue el servicio.
    expect(events[0]).toEqual(['ambulancia']);
    unitVersion = finished.body.unitVersion;
  });

  test('finalizar sin traslado exige motivo; la tripulación vincula un paciente sin identidad en el prehospital (FR-109-12)', async () => {
    const call = await request('REC', { address: 'Kilómetro ficticio 10' });
    const service = await dispatch({ version: unitVersion, requestId: call.body.id, priority: 'roja' });
    expect(service.status).toBe(201);
    await milestone(service.body.id, { type: 'salida' });
    await milestone(service.body.id, { type: 'en_escena' });
    const query = 'Persona sin documento en carretera';
    const search = await t.call('PAR', 'POST', '/pacientes/busquedas', { query });
    const nn = await t.call('PAR', 'POST', '/pacientes/provisionales', { givenNames: '', surnames: '', sex: 'masculino', estimatedAge: 40, description: 'Camisa azul, cicatriz en mano izquierda', searchToken: search.body.token, searchQuery: query });
    expect(nn.status).toBe(201);
    const report = await t.call('PAR', 'POST', `/ambulancia/servicios/${service.body.id}/prehospital`, { reason: 'Politraumatismo leve', priority: 'roja', capturedAt: at('08:00').toISOString(), patientId: nn.body.id, vitalSigns: { heartRate: 110, systolic: 100, diastolic: 60, oxygenSaturation: 95, glasgow: 14 } });
    expect(report.status).toBe(201);
    expect(report.body.patientLinked).toBe(true);
    expect((await t.one('SELECT paciente_id FROM ambulancia.servicio WHERE id=$1', [service.body.id])).paciente_id).toBe(nn.body.id);
    const other = await t.call('PAR', 'POST', `/ambulancia/servicios/${service.body.id}/prehospital`, { reason: 'Otro paciente', priority: 'verde', capturedAt: at('08:00').toISOString(), patientId: await t.patient() });
    expect(other.body.codigo).toBe('paciente_ya_vinculado');
    const noReason = await milestone(service.body.id, { type: 'finalizado', finalState: 'rechaza_traslado' });
    expect(noReason.body.codigo).toBe('estado_final_invalido');
    const done = await milestone(service.body.id, { type: 'finalizado', finalState: 'rechaza_traslado', reason: 'El paciente firma rechazo del traslado' });
    expect(done.status).toBe(201);
    unitVersion = done.body.unitVersion;
  });

  // Escenario 3 (RN-34): el reenvío del prehospital con la misma clave no duplica.
  test('el prehospital reenviado con la misma clave se guarda una vez; emergencia lo recibe y solo con relación ve lo clínico (FR-109-10, FR-109-11)', async () => {
    const service = await dispatch({ version: unitVersion, requestId: pacRequestId, priority: 'amarilla' });
    expect(service.status).toBe(201);
    // El paciente que pidió desde la app sigue el despacho y los hitos por su canal propio (FR-109-16).
    const unitEvents = await t.events('ambulancia.estado_cambiado', (await unit()).id);
    expect(unitEvents.at(-1)).toEqual(['ambulancia', `usuario:${userId('PAC')}`]);
    const key = randomUUID();
    const body = { reason: 'Dolor torácico', priority: 'amarilla', capturedAt: at('08:40').toISOString(), estimatedArrival: at('09:10').toISOString(), vitalSigns: { heartRate: 96, temperature: 37.2 } };
    const sent = await t.call('PAR', 'POST', `/ambulancia/servicios/${service.body.id}/prehospital`, body, key);
    const resent = await t.call('PAR', 'POST', `/ambulancia/servicios/${service.body.id}/prehospital`, body, key);
    expect(sent.status).toBe(201);
    expect(resent.body).toEqual(sent.body);
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM ambulancia.reporte_prehospital WHERE servicio_id=$1', [service.body.id])).n).toBe(1);
    const [channels] = await t.events('ambulancia.prehospital', service.body.id);
    expect(channels).toEqual(expect.arrayContaining(['ambulancia', 'rol:ENF', 'rol:MED']));
    const nurse = await t.call('ENF', 'GET', `/ambulancia/servicios/${service.body.id}/prehospital`);
    expect(nurse.status).toBe(200);
    expect(nurse.body).toMatchObject({ clinical: true, active: true, priority: 'amarilla' });
    expect(nurse.body.reports[0]).toMatchObject({ reason: 'Dolor torácico', vitalSigns: { heartRate: 96, temperature: 37.2 } });
    const desk = await t.call('REC', 'GET', `/ambulancia/servicios/${service.body.id}/prehospital`);
    expect(desk.body.clinical).toBe(false);
    expect(desk.body.reports[0].reason).toBeUndefined();
    expect(desk.body.reports[0].estimatedArrival).toBeDefined();
    expect((await t.call('PAR', 'GET', `/ambulancia/servicios/${service.body.id}/prehospital`)).status).toBe(403);
    const reads = await t.audits('ambulancia.prehospital.ver');
    expect(reads.map(r => r.paciente_id)).toEqual([pacPatientId, pacPatientId]);
    // Ubicación (extra): solo con servicio activo.
    const located = await t.call('PAR', 'POST', '/ambulancia/ubicacion', { latitude: 13.7, longitude: -89.2, capturedAt: at('08:41').toISOString() });
    expect(located.status).toBe(201);
    expect((await t.call('REC', 'GET', '/ambulancia')).body.activeService.lastLocation).toMatchObject({ latitude: 13.7, longitude: -89.2 });
    expect((await milestone(service.body.id, { type: 'salida' })).status).toBe(201);
    expect((await t.events('ambulancia.hito', service.body.id))[0]).toEqual(['ambulancia', `usuario:${userId('PAC')}`]);
    const cancelled = await milestone(service.body.id, { type: 'finalizado', finalState: 'cancelado', reason: 'Traslado cancelado por el hospital de origen' });
    unitVersion = cancelled.body.unitVersion;
    expect((await t.call('PAR', 'POST', '/ambulancia/ubicacion', { latitude: 13.7, longitude: -89.2, capturedAt: at('08:45').toISOString() })).body.codigo).toBe('sin_servicio_activo');
  });

  test('sin paramédico con turno en curso no se despacha (RN-30)', async () => {
    t.setNow(at('15:00'));
    const refused = await dispatch({ version: unitVersion, origin: 'Calle ficticia 5' });
    expect(refused.status).toBe(409);
    expect(refused.body.codigo).toBe('sin_paramedico_de_turno');
    t.setNow(at('09:00'));
  });

  // Escenario 5 (FR-109-14, FR-109-15): bitácora filtrable sin datos del paciente.
  test('la bitácora filtra por estado, prioridad, tipo y tiempo de respuesta sin mostrar al paciente', async () => {
    const all = await t.call('JOP', 'GET', '/ambulancia/bitacora');
    expect(all.status).toBe(200);
    expect(all.body).toHaveLength(3);
    expect(JSON.stringify(all.body)).not.toMatch(/paciente|patient|NN-/i);
    const completed = await t.call('JOP', 'GET', '/ambulancia/bitacora?finalState=completado');
    expect(completed.body).toHaveLength(1);
    expect(completed.body[0]).toMatchObject({ priority: 'naranja', destination: 'Hospital CLIMESA, emergencia', responseMinutes: 20 });
    expect(completed.body[0].crew[0]).toMatchObject({ role: 'paramedico' });
    expect((await t.call('DPD', 'GET', '/ambulancia/bitacora?priority=roja')).body).toHaveLength(1);
    expect((await t.call('REC', 'GET', '/ambulancia/bitacora?type=traslado_interhospitalario')).body).toHaveLength(0);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?minResponseMinutes=10')).body).toHaveLength(1);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?from=2026-11-16')).body).toHaveLength(0);
    expect((await t.call('JOP', 'GET', `/ambulancia/bitacora?crewId=${await t.staffOf('PAR')}`)).body).toHaveLength(3);
    expect((await t.call('PAR', 'GET', '/ambulancia/bitacora')).body).toHaveLength(3);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?from=15-11-2026')).status).toBe(400);
    expect((await t.call('ENF', 'GET', '/ambulancia/bitacora')).status).toBe(403);
  });
});
