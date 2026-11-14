import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';
import { personalDataIn } from '../src/public/notice.rules';
import { PUBLIC_LIMIT_PER_MINUTE } from '../src/public/rate-limit.guard';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const hour = 3600_000;

/** Claves que la respuesta pública o del tablero nunca debe traer (privacidad.md, columna "Público"). */
const FORBIDDEN_KEYS = ['expediente', 'record', 'dui', 'telefono', 'phone', 'correo', 'email', 'direccion', 'address', 'sexo', 'sex', 'nacimiento', 'birth',
  'paciente', 'pacienteId', 'patientId', 'patientName', 'nombres', 'apellidos', 'primerApellido', 'cama', 'camaId', 'bedId', 'codigo', 'personaId', 'staffId',
  'admisionId', 'ocupante', 'occupant', 'publicadoPor'];
const keysOf = (value: unknown): string[] => Array.isArray(value) ? value.flatMap(keysOf)
  : value && typeof value === 'object' ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]) : [];
const expectNoPersonalData = (body: unknown, secrets: string[]) => {
  const keys = keysOf(body);
  for (const key of FORBIDDEN_KEYS) expect(keys).not.toContain(key);
  const text = JSON.stringify(body);
  for (const secret of secrets) expect(text).not.toContain(secret);
};

describe('Spec 112 · información pública sin sesión y sin datos personales', () => {
  let t: TestApp;
  const anonymous = async (path: string) => {
    const response = await t.app.inject({ method: 'GET', url: '/api/v1' + path });
    return { status: response.statusCode, body: response.json() };
  };
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  test('escenario 1: al asignar una cama solo cambia el conteo de la planta, sin camas ni pacientes', async () => {
    const before = await anonymous('/publico/ocupacion');
    expect(before.status).toBe(200);
    const patientId = await t.patient({ name: 'Zorobabelina' });
    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
    const admission = await t.call('REC', 'POST', '/admisiones', { patientId, origin: 'emergencia', originId: randomUUID(), requestedCategory: 'semiprivada', isolation: false, attendingDoctorId: await t.staffOf('MED') });
    expect(admission.status).toBe(201);
    const bed = await t.one<{ id: string; version: number; codigo: string; nivel: number }>("SELECT e.id,e.version,b.codigo,b.nivel FROM infra.v_estado_cama b JOIN infra.espacio e ON e.id=b.cama_id WHERE b.estado='libre' AND b.categoria='semiprivada' ORDER BY b.codigo LIMIT 1");
    expect((await t.call('REC', 'POST', `/admisiones/${admission.body.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);

    const after = await anonymous('/publico/ocupacion');
    expect(after.status).toBe(200);
    const row = (body: any) => body.ocupacion.find((r: any) => r.planta === bed.nivel && r.categoria === 'semiprivada');
    expect(row(after.body).libres).toBe(row(before.body).libres - 1);
    expect(row(after.body).ocupadas).toBe(row(before.body).ocupadas + 1);
    expect(row(after.body).camas).toBe(row(before.body).camas);
    expectNoPersonalData(after.body, ['Zorobabelina', record, bed.codigo, bed.id, patientId]);

    // El evento público es agregado: no lleva el id de la cama.
    const published = await t.pg.query<{ entidad: string; entidad_id: string; canales: string[] }>("SELECT entidad,entidad_id,canales FROM plataforma.outbox WHERE tipo='cama.estado_cambiado' AND 'publico'=ANY(canales)");
    expect(published.rows.length).toBeGreaterThan(0);
    for (const event of published.rows) { expect(event.canales).toEqual(['publico']); expect(event.entidad_id).toBe('ocupacion'); }
    const metrics = await t.pg.query<{ canales: string[] }>("SELECT canales FROM plataforma.outbox WHERE tipo='metricas.recalculadas' ORDER BY seq DESC LIMIT 1");
    expect(metrics.rows[0].canales).toEqual(expect.arrayContaining(['rol:ADM', 'rol:JOP']));
    expect(metrics.rows[0].canales).not.toContain('rol:PAC');
  });

  test('FR-112-02: médicos de turno con nombre, especialidad y área; sin teléfono, DUI ni ids', async () => {
    const staff = await t.staffOf('MED');
    await t.pg.query("UPDATE personal.persona SET telefono='7123-4567',dui='04512345-6',especialidad='Pediatría' WHERE id=$1", [staff]);
    await t.shift('MED', new Date(now.valueOf() - hour), new Date(now.valueOf() + 4 * hour));
    const response = await anonymous('/publico/medicos-de-turno');
    expect(response.status).toBe(200);
    expect(response.body.medicos).toEqual(expect.arrayContaining([expect.objectContaining({ nombre: 'MED Prueba', especialidad: 'Pediatría', area: expect.any(String) })]));
    for (const doctor of response.body.medicos) expect(Object.keys(doctor).sort()).toEqual(['area', 'especialidad', 'hasta', 'nombre']);
    expect(response.body.proximoCambio).toBe(new Date(now.valueOf() + 4 * hour).toISOString());
    expectNoPersonalData(response.body, ['7123-4567', '04512345-6', staff]);
  });

  test('FR-112-06: números llamados con su consultorio, sin nombres', async () => {
    const patientId = await t.patient({ name: 'Eustaquiana' });
    const ticket = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
    expect(ticket.status).toBe(201);
    const office = await t.one<{ id: string; nombre: string }>("SELECT id,nombre FROM infra.espacio WHERE tipo='consultorio' ORDER BY codigo LIMIT 1");
    const called = await t.call('MED', 'POST', `/fila/${ticket.body.id}/llamar`, { version: ticket.body.version, officeId: office.id });
    expect(called.status).toBe(201);
    const response = await anonymous('/publico/fila/consulta_general');
    expect(response.status).toBe(200);
    expect(response.body.llamados).toEqual([expect.objectContaining({ numero: ticket.body.numero ?? expect.any(Number), consultorio: office.nombre })]);
    expectNoPersonalData(response.body, ['Eustaquiana', patientId, ticket.body.id]);
    const event = await t.one<{ tipo: string; entidad_id: string }>("SELECT tipo,entidad_id FROM plataforma.outbox WHERE 'publico'=ANY(canales) AND entidad='publico' AND entidad_id LIKE 'fila:%' ORDER BY seq DESC LIMIT 1");
    expect(event).toEqual({ tipo: 'fila.llamado', entidad_id: 'fila:consulta_general' });
    expect((await anonymous('/publico/fila/no-valido!')).status).toBe(400);
  });

  test('escenario 2: el aviso publicado aparece sin sesión, emite aviso.publicado y desaparece al vencer', async () => {
    const hasta = new Date(now.valueOf() + hour).toISOString();
    const denied = await t.call('REC', 'POST', '/avisos', { titulo: 'Laboratorio cerrado', cuerpo: 'Laboratorio cerrado el domingo.', hasta });
    expect(denied.status).toBe(403);
    const published = await t.call('JOP', 'POST', '/avisos', { titulo: 'Laboratorio cerrado', cuerpo: 'Laboratorio cerrado el domingo.', hasta });
    expect(published.status).toBe(201);
    expect(published.body).toEqual(expect.objectContaining({ titulo: 'Laboratorio cerrado', hasta }));
    const list = await anonymous('/publico/avisos');
    expect(list.status).toBe(200);
    expect(list.body.avisos.map((a: any) => a.id)).toContain(published.body.id);
    expect(list.body.proximoCambio).toBe(hasta);
    expectNoPersonalData(list.body, [userIdOf('JOP')]);
    expect(await t.events('aviso.publicado', published.body.id)).toEqual([['publico']]);
    // Vencido: el reloj de la API pasa el fin de la vigencia.
    t.setNow(new Date(now.valueOf() + 4 * hour));
    try {
      const later = await anonymous('/publico/avisos');
      expect(later.body.avisos.map((a: any) => a.id)).not.toContain(published.body.id);
    } finally { t.setNow(now); }
  });

  test('FR-112-03: la vigencia debe terminar después de empezar y en el futuro', async () => {
    const past = await t.call('JOP', 'POST', '/avisos', { titulo: 'Aviso viejo', cuerpo: 'Ya pasó.', hasta: new Date(now.valueOf() - hour).toISOString() });
    expect(past.status).toBe(400);
    const inverted = await t.call('JOP', 'POST', '/avisos', { titulo: 'Aviso al revés', cuerpo: 'Fechas invertidas.', desde: new Date(now.valueOf() + 2 * hour).toISOString(), hasta: new Date(now.valueOf() + hour).toISOString() });
    expect(inverted.status).toBe(400);
    await expect(t.pg.query("INSERT INTO publico.aviso(titulo,cuerpo,vigencia,publicado_por) VALUES('x','y',tstzrange(now(),NULL),$1)", [randomUUID()])).rejects.toThrow();
  });

  test('FR-112-05: un aviso con DUI, expediente o teléfono advierte antes de publicarse', async () => {
    const body = { titulo: 'Objeto perdido', cuerpo: 'Se encontró un DUI 04512345-6; llamar al 7123-4567.', hasta: new Date(now.valueOf() + hour).toISOString() };
    const warned = await t.call('JOP', 'POST', '/avisos', body);
    expect(warned.status).toBe(422);
    expect(warned.body).toEqual(expect.objectContaining({ codigo: 'aviso_con_datos_personales', datosPersonales: ['dui', 'telefono'] }));
    const confirmed = await t.call('JOP', 'POST', '/avisos', { ...body, confirmarDatosPersonales: true });
    expect(confirmed.status).toBe(201);
    expect(personalDataIn('Expediente 0000123-4')).toEqual(['expediente']);
    expect(personalDataIn('Laboratorio cerrado el domingo 15 de noviembre de 2026.')).toEqual([]);
  });

  test('el límite por IP responde 429 con codigo estable', async () => {
    let last = 0;
    for (let i = 0; i <= PUBLIC_LIMIT_PER_MINUTE; i++) last = (await t.app.inject({ method: 'GET', url: '/api/v1/publico/ocupacion', remoteAddress: '10.9.9.9' })).statusCode;
    expect(last).toBe(429);
    const other = await t.app.inject({ method: 'GET', url: '/api/v1/publico/ocupacion', remoteAddress: '10.9.9.8' });
    expect(other.statusCode).toBe(200);
  });
});

const userIdOf = (role: string) => `00000000-0000-4000-8000-${String(['ADM', 'JOP', 'REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR', 'DPD', 'PAC'].indexOf(role) + 1).padStart(12, '0')}`;

describe('Spec 113 · tablero y métricas agregadas', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); });
  afterAll(async () => { await t?.close(); });

  test('FR-113-01 y escenario 2: el tablero trae todas las tarjetas, solo con agregados', async () => {
    const patientId = await t.patient({ name: 'Filomenaria' });
    expect((await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId })).status).toBe(201);
    const response = await t.call('JOP', 'GET', '/metricas/tablero');
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['actualizadoEn', 'ambulancia', 'camas', 'cobertura', 'fecha', 'fila', 'laboratorio', 'ocupacionPorPlanta', 'pacientesActivos', 'turnosEnCurso']);
    expect(response.body.camas.total).toBeGreaterThan(0);
    expect(response.body.ocupacionPorPlanta.length).toBeGreaterThan(0);
    expect(response.body.fila.enEspera).toBeGreaterThanOrEqual(1);
    expect(response.body.laboratorio).toEqual({ pendiente: expect.any(Number), enProceso: expect.any(Number), completadoHoy: expect.any(Number), canceladoHoy: expect.any(Number) });
    expect(typeof response.body.cobertura.huecos).toBe('number');
    expectNoPersonalData(response.body, ['Filomenaria', patientId]);
  });

  test('la caché se invalida con cada evento: tras bloquear una cama el tablero ya la cuenta', async () => {
    const first = (await t.call('ADM', 'GET', '/metricas/tablero')).body;
    const bed = await t.one<{ id: string; version: number }>("SELECT e.id,e.version FROM infra.v_estado_cama b JOIN infra.espacio e ON e.id=b.cama_id WHERE b.estado='libre' ORDER BY b.codigo LIMIT 1");
    expect((await t.call('JOP', 'POST', `/camas/${bed.id}/bloquear`, { version: bed.version, motivo: 'Mantenimiento preventivo' })).status).toBe(201);
    const second = (await t.call('ADM', 'GET', '/metricas/tablero')).body;
    expect(second.camas.bloqueadas).toBe(first.camas.bloqueadas + 1);
    expect(second.camas.libres).toBe(first.camas.libres - 1);
  });

  test('metricas.ver: REC no ve el tablero ni los indicadores', async () => {
    expect((await t.call('REC', 'GET', '/metricas/tablero')).status).toBe(403);
    expect((await t.call('REC', 'GET', '/metricas/ocupacion_diaria')).status).toBe(403);
    expect((await t.call('DPD', 'GET', '/metricas/tablero')).status).toBe(200);
  });

  test('FR-113-05: tiempo de laboratorio por día con el valor esperado', async () => {
    const patientId = await t.patient();
    const doctor = await t.staffOf('REC');
    const day = new Date(now.valueOf() - 2 * 86400_000);
    const created = new Date(day.valueOf()), completed = new Date(day.valueOf() + 90 * 60_000);
    await t.pg.query("INSERT INTO laboratorio.orden(admision_id,paciente_id,medico_id,estado,creada_en,completada_en) VALUES($1,$2,$3,'en_proceso',$4,NULL)", [randomUUID(), patientId, doctor, created]);
    const order = await t.one<{ id: string }>('SELECT id FROM laboratorio.orden WHERE paciente_id=$1', [patientId]);
    await t.pg.query("UPDATE laboratorio.orden SET estado='completado',completada_en=$2 WHERE id=$1", [order.id, completed]);
    const fecha = new Date(created.valueOf() - 6 * hour).toISOString().slice(0, 10);
    const response = await t.call('ADM', 'GET', `/metricas/tiempo_laboratorio?desde=${fecha}&hasta=${fecha}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ indicador: 'tiempo_laboratorio', unidad: 'minutos', desde: fecha, hasta: fecha }));
    expect(response.body.serie).toEqual([{ fecha, valor: 90, muestras: 1 }]);
  });

  test('FR-113-05: los cinco indicadores responden una serie diaria; rango y nombre se validan', async () => {
    const to = new Date(now.valueOf() - 6 * hour).toISOString().slice(0, 10);
    const from = new Date(now.valueOf() - 6 * hour - 2 * 86400_000).toISOString().slice(0, 10);
    for (const indicator of ['ocupacion_diaria', 'estancia_promedio', 'tiempo_laboratorio', 'tiempo_ambulancia', 'cobertura_turnos']) {
      const response = await t.call('JOP', 'GET', `/metricas/${indicator}?desde=${from}&hasta=${to}`);
      expect(response.status).toBe(200);
      expect(response.body.serie.map((p: any) => p.fecha)).toHaveLength(3);
      expectNoPersonalData(response.body, []);
    }
    expect((await t.call('JOP', 'GET', '/metricas/no_existe')).body.codigo).toBe('indicador_desconocido');
    expect((await t.call('JOP', 'GET', `/metricas/ocupacion_diaria?desde=${to}&hasta=${from}`)).status).toBe(400);
  });
});
