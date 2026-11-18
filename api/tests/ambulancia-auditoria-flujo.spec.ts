import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const at = (local: string) => new Date(`2026-11-16T${local}:00-06:00`);

// Auditoría del flujo de ambulancia: el paciente ve por qué se descartó su solicitud, la bitácora encuentra los servicios
// sin cierre y el cierre administrativo avisa también a quien espera la llegada.
describe('Ambulancia · auditoría del flujo (motivo de descarte, servicios en curso, cierre administrativo)', () => {
  let t: TestApp;
  let crew: string[];
  const unit = () => t.one<{ id: string; estado: string; version: number }>('SELECT id,estado,version FROM ambulancia.unidad');
  const request = (role: string, body: Record<string, unknown> = {}) => t.call(role, 'POST', '/ambulancia/solicitudes', { address: 'Colonia Ficticia, pasaje 9, casa 4', reason: 'Dolor de pecho desde la mañana', contactPhone: '7000-0002', ...body });
  const dispatch = async () => t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia', crew, origin: 'Residencial Ficticia, casa 1' });
  const milestone = (id: string, type: string) => t.call('PAR', 'POST', `/ambulancia/servicios/${id}/hitos`, { type });
  const close = async (id: string) => {
    const { version } = await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [id]);
    return t.call('JOP', 'POST', `/ambulancia/servicios/${id}/cerrar`, { version, reason: 'Cierre administrativo de prueba' });
  };

  beforeAll(async () => {
    t = await createTestApp(at('08:00'));
    await t.shift('PAR', at('06:00'), at('18:00'));
    const driverId = await t.driverShift(at('06:00'), at('18:00'));
    await t.shift('ENF', at('06:00'), at('18:00'), 'P1-EMG');
    crew = [await t.staffOf('PAR'), driverId];
    const current = await unit();
    expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: current.version, inMaintenance: false, reason: 'Inicio de turno con tripulación' })).status).toBe(201);
  });
  afterAll(async () => { await t?.close(); });

  test('el paciente ve el motivo con el que despacho descartó su solicitud; las demás no traen motivo', async () => {
    t.setNow(at('09:00'));
    await t.patient({ linkPac: true });
    const discarded = await request('PAC');
    expect(discarded.status).toBe(201);
    expect((await t.call('JOP', 'POST', `/ambulancia/solicitudes/${discarded.body.id}/descartar`, { version: discarded.body.version, reason: 'Se resolvió por teléfono' })).status).toBe(201);
    t.setNow(at('09:05'));
    const pending = await request('PAC');
    const mine = (await t.call('PAC', 'GET', '/ambulancia/solicitudes/mias')).body as Array<{ id: string; state: string; discardReason: string | null }>;
    expect(mine.find(r => r.id === discarded.body.id)).toMatchObject({ state: 'descartada', discardReason: 'Se resolvió por teléfono' });
    expect(mine.find(r => r.id === pending.body.id)).toMatchObject({ state: 'por_confirmar', discardReason: null });
  });

  test('la bitácora filtra con finalState=en_curso los servicios que siguen sin cierre', async () => {
    t.setNow(at('10:00'));
    const finished = (await dispatch()).body;
    for (const type of ['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado']) expect((await milestone(finished.id, type)).status).toBe(201);
    t.setNow(at('10:30'));
    const open = (await dispatch()).body;
    const running = (await t.call('JOP', 'GET', '/ambulancia/bitacora?finalState=en_curso')).body as Array<{ id: string; finalState: string | null }>;
    expect(running.map(s => s.id)).toEqual([open.id]);
    expect(running[0].finalState).toBeNull();
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?finalState=completado')).body.map((s: { id: string }) => s.id)).toEqual([finished.id]);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?finalState=abierto')).status).toBe(400);
    expect((await close(open.id)).status).toBe(201);
    expect((await t.call('JOP', 'GET', '/ambulancia/bitacora?finalState=en_curso')).body).toEqual([]);
  });

  test('el cierre administrativo avisa a los mismos canales de quien recibe que el traslado', async () => {
    t.setNow(at('11:00'));
    const service = (await dispatch()).body;
    for (const type of ['salida', 'en_escena', 'trasladando']) expect((await milestone(service.id, type)).status).toBe(201);
    const events = () => t.events('ambulancia.hito', service.id);
    const moved = (await events()).at(-1)!.filter(ch => !ch.startsWith('usuario:'));
    expect(moved.length).toBeGreaterThan(1);
    expect((await close(service.id)).status).toBe(201);
    expect((await events()).at(-1)).toEqual(expect.arrayContaining(moved));
  });
});
