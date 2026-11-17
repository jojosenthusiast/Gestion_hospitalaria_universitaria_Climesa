import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);
/** Fixed clock: Wednesday 2026-12-02 in El Salvador. Nothing here depends on the real "now". */
const at = (local: string) => new Date(`2026-12-02T${local}:00-06:00`);

/** R7 U3, journey G4 (audit `fase2-recorridos-auditoria.md`): undo the last milestone (G-4) and reception closes the service (D-7). */
describe('R7 · ambulancia: deshacer hito y cierre por recepción', () => {
  let t: TestApp;
  let crew: string[];
  const unit = () => t.one<{ id: string; estado: string; version: number }>('SELECT id,estado,version FROM ambulancia.unidad');
  const dispatch = async () => (await t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia', crew, origin: 'Residencial Ficticia, casa 1' })).body;
  const milestone = (id: string, type: string) => t.call('PAR', 'POST', `/ambulancia/servicios/${id}/hitos`, { type });
  const version = async (id: string) => (await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [id])).version;
  const undo = async (id: string, role = 'PAR') => t.call(role, 'POST', `/ambulancia/servicios/${id}/hitos/deshacer`, { version: await version(id) });

  beforeAll(async () => {
    t = await createTestApp(at('08:00'));
    await t.shift('PAR', at('06:00'), at('18:00'));
    const driver = await t.driverShift(at('06:00'), at('18:00'));
    await t.shift('ENF', at('06:00'), at('18:00'), 'P1-EMG');
    crew = [await t.staffOf('PAR'), driver];
    expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Inicio de turno con tripulación' })).status).toBe(201);
  });
  afterAll(async () => { await t?.close(); });

  test('G-4: la tripulación deshace su último hito; queda registrado quién lo deshizo y se puede volver a marcar', async () => {
    t.setNow(at('09:00'));
    const service = await dispatch();
    for (const type of ['salida', 'en_escena', 'trasladando']) expect((await milestone(service.id, type)).status).toBe(201);
    t.setNow(at('09:05'));
    expect((await undo(service.id, 'REC')).status).toBe(403);
    const stale = await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos/deshacer`, { version: 1 });
    expect([stale.status, stale.body.codigo]).toEqual([409, 'version_conflicto']);
    const undone = await undo(service.id);
    expect(undone.status).toBe(201);
    expect(undone.body).toMatchObject({ id: service.id, undoneType: 'trasladando', nextMilestones: expect.arrayContaining(['trasladando']) });
    expect((await t.one<{ tipo: string; anulado_por: string }>('SELECT tipo,anulado_por FROM ambulancia.hito_anulado WHERE servicio_id=$1', [service.id]))).toEqual({ tipo: 'trasladando', anulado_por: userId('PAR') });
    expect((await t.audits('ambulancia.hito_deshecho')).length).toBeGreaterThan(0);
    expect((await milestone(service.id, 'trasladando')).status).toBe(201);
    // More than 15 minutes later the milestone stays.
    t.setNow(at('09:30'));
    const late = await undo(service.id);
    expect([late.status, late.body.codigo]).toEqual([409, 'hito_no_deshacible']);
    expect(late.body.detail).toBe('Pasaron más de 15 minutos desde que se registró; ya no se puede deshacer.');
    expect((await milestone(service.id, 'en_hospital')).status).toBe(201);
    // D-7: reception closes the service and frees the unit; the arrival can no longer be undone.
    const received = await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect(received.status).toBe(201);
    expect(received.body).toMatchObject({ serviceId: service.id, serviceClosed: true, unitState: 'disponible' });
    expect(await t.one('SELECT estado_final,finalizado_en FROM ambulancia.servicio WHERE id=$1', [service.id])).toEqual({ estado_final: 'completado', finalizado_en: at('09:30') });
    expect((await unit()).estado).toBe('disponible');
    expect((await t.one<{ n: number }>("SELECT count(*)::int AS n FROM ambulancia.hito WHERE servicio_id=$1 AND tipo='finalizado'", [service.id])).n).toBe(1);
    const afterClose = await undo(service.id);
    expect([afterClose.status, afterClose.body.codigo]).toEqual([409, 'hito_no_deshacible']);
  });

  test('D-7: si la tripulación ya finalizó, la recepción solo registra la entrega (como antes)', async () => {
    t.setNow(at('10:00'));
    const service = await dispatch();
    for (const type of ['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado']) expect((await milestone(service.id, type)).status).toBe(201);
    const received = await t.call('ENF', 'POST', `/ambulancia/servicios/${service.id}/recepcion`, {});
    expect(received.status).toBe(201);
    expect(received.body.serviceClosed).toBe(false);
    expect(received.body.unitState).toBeUndefined();
  });

  test('A3: deshacer avisa también a quien recibe llegadas; A7: la base solo deja borrar el último hito de un servicio abierto', async () => {
    t.setNow(at('12:00'));
    const service = await dispatch();
    for (const type of ['salida', 'en_escena', 'trasladando']) expect((await milestone(service.id, type)).status).toBe(201);
    const events = () => t.events('ambulancia.hito', service.id);
    const moved = (await events()).at(-1)!.filter(ch => !ch.startsWith('usuario:'));
    expect(moved.length).toBeGreaterThan(1);
    expect((await undo(service.id)).status).toBe(201);
    expect((await events()).at(-1)).toEqual(expect.arrayContaining(moved));
    await expect(t.one("DELETE FROM ambulancia.hito WHERE servicio_id=$1 AND tipo='salida' RETURNING id", [service.id])).rejects.toThrow(/solo se deshace el último hito/);
    for (const type of ['trasladando', 'en_hospital', 'finalizado']) expect((await milestone(service.id, type)).status).toBe(201);
    await expect(t.one("DELETE FROM ambulancia.hito WHERE servicio_id=$1 AND tipo='finalizado' RETURNING id", [service.id])).rejects.toThrow(/el servicio ya terminó/);
  });

  test('G-4: un servicio sin hitos no tiene nada que deshacer', async () => {
    t.setNow(at('11:00'));
    const service = await dispatch();
    const none = await undo(service.id);
    expect([none.status, none.body.codigo, none.body.detail]).toEqual([409, 'hito_no_deshacible', 'El servicio no tiene hitos para deshacer.']);
    expect((await t.call('JOP', 'POST', `/ambulancia/servicios/${service.id}/cerrar`, { version: await version(service.id), reason: 'Cierre del servicio de prueba' })).status).toBe(201);
  });
});
