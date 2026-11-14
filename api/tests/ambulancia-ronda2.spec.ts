import { createTestApp, TestApp } from './support/app';
import { dispatchBlock, fold, maskRecord } from '../src/ambulance/ambulance.rules';

jest.setTimeout(180000);
const at = (local: string) => new Date(`2026-11-15T${local}:00-06:00`);

describe('Ambulancia · reglas de bloqueo y bitácora (ronda 2)', () => {
  test('dispatchBlock explica por qué no se despacha y qué hacer', () => {
    expect(dispatchBlock('disponible', true, true)).toBeNull();
    expect(dispatchBlock('en_servicio', true, true)).toMatchObject({ code: 'en_servicio' });
    expect(dispatchBlock('en_mantenimiento', true, true)).toMatchObject({ code: 'en_mantenimiento', action: expect.stringContaining('Saca la unidad') });
    expect(dispatchBlock('en_mantenimiento', false, true)?.action).toMatch(/turno de paramédico/);
    expect(dispatchBlock('disponible', false, true)).toMatchObject({ code: 'sin_paramedico_de_turno' });
  });
  test('dispatchBlock exige también motorista de turno y nombra a quien falta (RN-30)', () => {
    expect(dispatchBlock('disponible', true, false)).toEqual({ code: 'sin_motorista_de_turno', message: 'No hay motorista con turno en curso.', action: expect.stringMatching(/turno de motorista/) });
    const both = dispatchBlock('disponible', false, false);
    expect(both).toMatchObject({ code: 'sin_tripulacion_de_turno' });
    expect(both?.message).toMatch(/paramédico ni motorista/);
    expect(both?.action).toMatch(/paramédico y otro de motorista/);
    expect(dispatchBlock('en_mantenimiento', true, false)).toMatchObject({ code: 'en_mantenimiento', message: expect.stringMatching(/no hay motorista/), action: expect.stringMatching(/turno de motorista/) });
    expect(dispatchBlock('en_mantenimiento', false, false)?.message).toMatch(/paramédico ni motorista/);
    expect(dispatchBlock('en_servicio', false, false)).toMatchObject({ code: 'en_servicio' });
  });
  test('maskRecord deja solo los últimos 3 caracteres y fold ignora acentos', () => {
    expect(maskRecord('EXP-2026-0042')).toBe('**********042');
    expect(maskRecord('AB')).toBe('AB');
    expect(maskRecord(null)).toBeNull();
    expect(fold('Soyapango ÁÉÍ')).toBe('soyapango aei');
  });
});

describe('Ambulancia · mantenimiento, solicitante y bitácora narrativa (ronda 2)', () => {
  let t: TestApp;
  const unit = () => t.one<{ version: number; estado: string }>('SELECT version,estado FROM ambulancia.unidad');
  beforeAll(async () => { t = await createTestApp(at('08:00')); });
  afterAll(async () => { await t?.close(); });

  test('sin paramédico ni motorista de turno la unidad en mantenimiento no sale y el tablero dice por qué', async () => {
    const board = await t.call('JOP', 'GET', '/ambulancia');
    expect(board.body.unit.state).toBe('en_mantenimiento');
    expect(board.body).toMatchObject({ paramedicOnDuty: false, driverOnDuty: false });
    expect(board.body.dispatchBlock).toMatchObject({ code: 'en_mantenimiento', action: expect.stringMatching(/turno de paramédico y otro de motorista/) });
    const denied = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Revisión terminada en taller' });
    expect(denied.status).toBe(409);
    expect(denied.body.codigo).toBe('sin_tripulacion_de_turno');
    expect((await t.call('REC', 'POST', '/ambulancia/mantenimiento', { version: 1, inMaintenance: false, reason: 'Revisión terminada en taller' })).status).toBe(403);
  });

  test('con turno de paramédico sale de mantenimiento, vuelve a entrar con motivo y el estado conserva el motivo', async () => {
    await t.shift('PAR', at('06:00'), at('14:00'));
    // Con paramédico pero sin motorista la unidad tampoco sale (RN-30).
    const noDriver = await t.call('JOP', 'GET', '/ambulancia');
    expect(noDriver.body).toMatchObject({ paramedicOnDuty: true, driverOnDuty: false });
    expect(noDriver.body.dispatchBlock).toMatchObject({ code: 'en_mantenimiento', message: expect.stringMatching(/no hay motorista/) });
    const refused = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Revisión terminada en taller' });
    expect(refused.status).toBe(409);
    expect(refused.body.codigo).toBe('sin_motorista_de_turno');
    await t.driverShift(at('06:00'), at('14:00'));
    const out = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Revisión terminada en taller' });
    expect(out.status).toBe(201);
    const ready = await t.call('JOP', 'GET', '/ambulancia');
    expect(ready.body.dispatchBlock).toBeNull();
    expect(ready.body.unit).toMatchObject({ state: 'disponible', stateReason: 'Revisión terminada en taller' });
    const back = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: true, reason: 'Cambio de llantas programado' });
    expect(back.status).toBe(201);
    const board = await t.call('JOP', 'GET', '/ambulancia');
    expect(board.body.unit).toMatchObject({ state: 'en_mantenimiento', stateReason: 'Cambio de llantas programado' });
    expect(board.body.dispatchBlock.code).toBe('en_mantenimiento');
    const exit = await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Llantas cambiadas y revisadas' });
    expect(exit.status).toBe(201);
  });

  test('las solicitudes pendientes traen quién pidió: paciente con expediente o nombre de quien llamó', async () => {
    const patientId = await t.patient({});
    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
    const known = await t.call('REC', 'POST', '/ambulancia/solicitudes', { address: 'Colonia Ficticia, casa 4', reason: 'Dolor en el pecho', contactPhone: '7000-1111', patientId });
    const anon = await t.call('REC', 'POST', '/ambulancia/solicitudes', { address: 'Calle sin nombre, Apopa', reason: 'Persona caída en la vía', contactPhone: '7000-2222', callerName: 'Marta Quintanilla' });
    expect(known.status).toBe(201);
    expect(anon.status).toBe(201);
    const rows = (await t.call('JOP', 'GET', '/ambulancia')).body.pendingRequests as any[];
    expect(rows.find(r => r.id === known.body.id)).toMatchObject({ registeredPatient: true, patientRecord: record, callerName: null });
    expect(rows.find(r => r.id === known.body.id).requesterName).toEqual(expect.any(String));
    expect(rows.find(r => r.id === anon.body.id)).toMatchObject({ registeredPatient: false, patientRecord: null, requesterName: 'Marta Quintanilla', callerName: 'Marta Quintanilla' });
    // El nombre de quien llama no puede ser una sola letra.
    expect((await t.call('REC', 'POST', '/ambulancia/solicitudes', { address: 'Calle 1, Apopa', reason: 'Motivo', contactPhone: '7000-2222', callerName: 'X' })).status).toBe(400);
  });

  test('la bitácora cuenta la historia: hitos, expediente enmascarado y búsqueda sin acentos', async () => {
    const patientId = await t.patient({});
    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
    const req = await t.call('REC', 'POST', '/ambulancia/solicitudes', { address: 'Colonia Ficticia, casa 9', municipality: 'Soyapango', reason: 'Caída de altura', contactPhone: '7000-3333', patientId });
    const dispatched = await t.call('JOP', 'POST', '/ambulancia/servicios', { version: (await unit()).version, requestId: req.body.id, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia' });
    expect(dispatched.status).toBe(201);
    t.setNow(at('08:10'));
    expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${dispatched.body.id}/hitos`, { type: 'salida' })).status).toBe(201);
    const log = await t.call('DPD', 'GET', '/ambulancia/bitacora?q=SOYAPANGO');
    expect(log.status).toBe(200);
    expect(log.body).toHaveLength(1);
    expect(log.body[0].milestones).toEqual([expect.objectContaining({ type: 'salida' })]);
    expect(log.body[0].patientRef).toBe(maskRecord(record));
    expect(log.body[0].patientRef).not.toBe(record);
    expect(JSON.stringify(log.body)).not.toContain(record);
    expect(JSON.stringify(log.body)).not.toMatch(/patientName|patientId|NN-/);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?q=ciudad-inexistente')).body).toHaveLength(0);
  });
});
