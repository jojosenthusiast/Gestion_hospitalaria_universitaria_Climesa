import { createTestApp, TestApp } from './support/app';
import { maskRecord } from '../src/ambulance/ambulance.rules';

jest.setTimeout(180000);
const at = (local: string) => new Date(`2026-11-15T${local}:00-06:00`);

// Ronda 3: permisos que exige el PDF del curso (paciente edita su contacto, médico ve la bitácora, ubicación pública).
describe('Permisos del PDF · edición propia del paciente, bitácora del médico y ubicación pública', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(at('08:00')); });
  afterAll(async () => { await t?.close(); });

  test('PATCH /me/paciente cambia solo el contacto propio, sube la versión, deja historial, auditoría y evento', async () => {
    const mine = await t.patient({ linkPac: true, name: 'Ana' });
    const other = await t.patient({ name: 'Otro' });
    const before = await t.one<any>('SELECT * FROM pacientes.paciente WHERE id=$1', [mine]);
    const otherBefore = await t.one<any>('SELECT * FROM pacientes.paciente WHERE id=$1', [other]);
    const ok = await t.call('PAC', 'PATCH', '/me/paciente', { version: before.version, phone: '7000-1234', email: 'ana@example.test', address: 'Calle ficticia 7' });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: mine, version: before.version + 1 });
    const after = await t.one<any>('SELECT * FROM pacientes.paciente WHERE id=$1', [mine]);
    expect(after).toMatchObject({ telefono: '70001234', correo: 'ana@example.test', direccion: 'Calle ficticia 7', nombres: before.nombres, primer_apellido: before.primer_apellido, sexo: before.sexo });
    expect(String(after.nacimiento)).toBe(String(before.nacimiento));
    expect(await t.one<any>('SELECT * FROM pacientes.paciente WHERE id=$1', [other])).toEqual(otherBefore);
    const history = await t.one<any>('SELECT motivo,cambios FROM pacientes.historial_demografico WHERE paciente_id=$1 ORDER BY version DESC LIMIT 1', [mine]);
    expect(Object.keys(history.cambios).sort()).toEqual(['correo', 'direccion', 'telefono']);
    expect((await t.one<any>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion='pacientes.editar_propios' AND paciente_id=$1", [mine])).n).toBe(1);
    expect((await t.one<any>("SELECT count(*)::int AS n FROM plataforma.outbox WHERE tipo='paciente.actualizado' AND entidad_id=$1", [mine])).n).toBeGreaterThan(0);
  });

  test('rechaza versión vieja, campos de identidad, datos inválidos y petición vacía', async () => {
    const mine = (await t.one<any>('SELECT paciente_id AS id FROM acceso.usuario WHERE id=$1', [(await t.one<any>("SELECT usuario_id AS id FROM acceso.asignacion_rol WHERE rol_codigo='PAC'")).id])).id;
    const current = (await t.one<any>('SELECT version FROM pacientes.paciente WHERE id=$1', [mine])).version;
    expect((await t.call('PAC', 'PATCH', '/me/paciente', { version: current - 1, phone: '7000-9999' })).status).toBe(409);
    expect((await t.call('PAC', 'PATCH', '/me/paciente', { version: current, givenNames: 'Hackeado' })).status).toBe(400);
    expect((await t.call('PAC', 'PATCH', '/me/paciente', { version: current, dui: '00000001-8' })).status).toBe(400);
    expect((await t.call('PAC', 'PATCH', '/me/paciente', { version: current, phone: '1234' })).status).toBe(400);
    expect((await t.call('PAC', 'PATCH', '/me/paciente', { version: current, email: 'no-es-correo' })).status).toBe(400);
    expect((await t.call('PAC', 'PATCH', '/me/paciente', { version: current })).status).toBe(400);
    expect((await t.one<any>('SELECT version FROM pacientes.paciente WHERE id=$1', [mine])).version).toBe(current);
  });

  test('sin vínculo da 404 y ningún otro rol puede usar la ruta', async () => {
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=(SELECT usuario_id FROM acceso.asignacion_rol WHERE rol_codigo=$1)', ['PAC']);
    const unlinked = await t.call('PAC', 'PATCH', '/me/paciente', { version: 1, phone: '7000-1111' });
    expect(unlinked.status).toBe(404);
    expect(unlinked.body.codigo).toBe('sin_vinculacion');
    for (const role of ['REC', 'MED', 'JOP', 'ADM', 'ENF']) expect((await t.call(role, 'PATCH', '/me/paciente', { version: 1, phone: '7000-1111' })).status).toBe(403);
  });

  test('MED consulta la bitácora de ambulancia con el expediente enmascarado y sin datos del paciente', async () => {
    const patientId = await t.patient({});
    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
    await t.shift('PAR', at('06:00'), at('14:00'));
    await t.driverShift(at('06:00'), at('14:00'));
    const unit = () => t.one<{ version: number }>('SELECT version FROM ambulancia.unidad');
    expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Revisión terminada en taller' })).status).toBe(201);
    const req = await t.call('REC', 'POST', '/ambulancia/solicitudes', { address: 'Colonia Ficticia, casa 9', municipality: 'Soyapango', reason: 'Caída de altura', contactPhone: '7000-3333', patientId });
    expect((await t.call('JOP', 'POST', '/ambulancia/servicios', { version: (await unit()).version, requestId: req.body.id, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia' })).status).toBe(201);
    const log = await t.call('MED', 'GET', '/ambulancia/bitacora?priority=roja');
    expect(log.status).toBe(200);
    expect(log.body).toHaveLength(1);
    expect(log.body[0].patientRef).toBe(maskRecord(record));
    expect(JSON.stringify(log.body)).not.toContain(record);
    expect(JSON.stringify(log.body)).not.toMatch(/patientName|patientId|NN-/);
    expect((await t.call('MED', 'GET', '/ambulancia')).status).toBe(200);
    expect((await t.call('ENF', 'GET', '/ambulancia/bitacora')).status).toBe(403);
  });

  test('GET /publico/hospital entrega dirección, teléfono y coordenadas sin sesión y solo esos campos', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/api/v1/publico/hospital' });
    expect(r.statusCode).toBe(200);
    expect(Object.keys(r.json()).sort()).toEqual(['departamento', 'direccion', 'latitud', 'longitud', 'municipio', 'nombre', 'telefono']);
    expect(r.json()).toMatchObject({ nombre: 'Hospital CLIMESA', municipio: 'San Salvador', latitud: expect.any(Number), longitud: expect.any(Number) });
  });
});
