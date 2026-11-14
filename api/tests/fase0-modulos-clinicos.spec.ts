import { randomUUID } from 'node:crypto';
import { businessDate } from '../src/platform/clock';
import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const MINUTE = 60_000;

/** API-01, REQ-08: happy paths and key rules of the clinical modules, against PGlite with the sghu_api role. */
describe('Fase 0 · módulos clínicos (API-01, REQ-08)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  test('fila (E2E-01): emitir, llamar, atender y completar con los permisos de fila', async () => {
    const patientId = await t.patient();
    const issued = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
    expect(issued.status).toBe(201);
    expect(issued.body.numero).toBeGreaterThan(0);
    const called = await t.call('AST', 'POST', `/fila/${issued.body.id}/llamar`, { version: issued.body.version });
    expect(called.status).toBe(201);
    const attending = await t.call('MED', 'POST', `/fila/${issued.body.id}/atender`, { version: called.body.version });
    expect(attending.status).toBe(201);
    const done = await t.call('REC', 'POST', `/fila/${issued.body.id}/completar`, { version: attending.body.version });
    expect(done.status).toBe(201);
    expect(done.body.state).toBe('atendido');
    expect((await t.call('AST', 'POST', `/fila/${issued.body.id}/llamar`, { version: done.body.version })).status).toBe(409);
  });

  test('citas: recepción agenda, el paciente solicita, recepción confirma o rechaza y el paciente cancela la suya', async () => {
    // RN-21: the patient cancels up to 2 h before, so the slots start later than that.
    const shiftStart = new Date(Math.ceil((now.valueOf() + 180 * MINUTE) / (20 * MINUTE)) * 20 * MINUTE);
    await t.shift('MED', shiftStart, new Date(shiftStart.valueOf() + 6 * 60 * MINUTE));
    const doctorId = await t.staffOf('MED');
    const slot = (n: number) => ({ start: new Date(shiftStart.valueOf() + n * 20 * MINUTE).toISOString(), end: new Date(shiftStart.valueOf() + (n + 1) * 20 * MINUTE).toISOString() });
    const patientId = await t.patient();
    const scheduled = await t.call('REC', 'POST', '/citas', { patientId, doctorId, ...slot(0), reason: 'Control' });
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.state).toBe('confirmada');
    expect((await t.call('REC', 'POST', '/citas', { patientId: await t.patient(), doctorId, ...slot(0) })).status).toBe(409);
    expect((await t.call('REC', 'POST', '/citas', { patientId, doctorId, start: slot(1).start, end: new Date(Date.parse(slot(1).start) + 30 * MINUTE).toISOString() })).status).toBe(400);

    const own = await t.patient({ linkPac: true });
    const requested = await t.call('PAC', 'POST', '/citas/solicitudes', { doctorId, ...slot(2) });
    expect(requested.status).toBe(201);
    expect(requested.body.state).toBe('solicitada');
    const confirmed = await t.call('REC', 'POST', `/citas/solicitudes/${requested.body.id}/confirmar`, { version: requested.body.version });
    expect(confirmed.status).toBe(201);
    const mine = await t.call('PAC', 'GET', '/citas');
    expect(mine.body.map((row: any) => row.patientId)).toEqual([own]);
    const cancelled = await t.call('PAC', 'POST', `/citas/${requested.body.id}/cancelar`, { version: confirmed.body.version, reason: 'Tengo un compromiso de trabajo' });
    expect(cancelled.status).toBe(201);
    const second = await t.call('PAC', 'POST', '/citas/solicitudes', { doctorId, ...slot(3) });
    expect((await t.call('REC', 'POST', `/citas/solicitudes/${second.body.id}/rechazar`, { version: second.body.version, rejectionReason: 'El médico no atiende esa franja' })).status).toBe(201);
    const availability = await t.call('PAC', 'GET', `/citas/disponibilidad?doctorId=${doctorId}&date=${businessDate(shiftStart)}`);
    expect(availability.body.slots.map((s: any) => s.start)).not.toContain(slot(0).start);
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
  });

  test('consulta: iniciar, signos, diagnóstico principal (DAT-01), receta, borrador y firma; luego todo queda cerrado', async () => {
    const patientId = await t.patient();
    const consultation = await t.consultation(patientId);
    expect((await t.call('MED', 'POST', '/consultas', { appointmentId: consultation.appointmentId })).status).toBe(409);
    expect((await t.call('ENF', 'POST', `/consultas/${consultation.id}/signos`, { systolic: 120, diastolic: 80, heartRate: 70, temperature: 36.5 })).status).toBe(201);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 300 })).status).toBe(400);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/diagnosticos`, { code: 'j06.9', principal: true })).status).toBe(201);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/diagnosticos`, { code: 'ZZZ.9' })).status).toBe(404);
    const prescription = await t.call('MED', 'POST', `/consultas/${consultation.id}/receta`, { items: [{ medication: 'Ibuprofeno 400 mg', dose: '1 tableta', route: 'oral', frequency: 'cada 8 horas', duration: '5 días' }] });
    expect(prescription.status).toBe(201);
    expect(prescription.body.items).toHaveLength(1);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: consultation.version })).status).toBe(409);
    const draft = await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Odinofagia', physicalExam: 'Faringe eritematosa', plan: 'Analgésico y control' });
    expect(draft.status).toBe(200);
    expect((await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Otro' })).status).toBe(409);
    const signed = await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: draft.body.version });
    expect(signed.status).toBe(201);
    const detail = await t.call('MED', 'GET', `/consultas/${consultation.id}/detalle`);
    expect(detail.body.consultation.state).toBe('firmada');
    expect(detail.body.vitalSigns).toHaveLength(1);
    expect(detail.body.diagnoses).toEqual([expect.objectContaining({ code: 'J06.9', principal: true })]);
    expect(detail.body.prescriptions[0].items).toHaveLength(1);
    expect((await t.one<{ estado: string }>('SELECT estado FROM atencion.cita WHERE id=$1', [consultation.appointmentId])).estado).toBe('atendida');
    for (const [path, body] of [['diagnosticos', { code: 'I10' }], ['receta', { items: [{ medication: 'X', dose: '1', route: 'oral', frequency: 'diaria', duration: '1 día' }] }], ['signos', { heartRate: 80 }]] as const) {
      const late = await t.call('MED', 'POST', `/consultas/${consultation.id}/${path}`, body);
      expect({ path, status: late.status, codigo: late.body.codigo }).toEqual({ path, status: 409, codigo: 'consulta_firmada' });
    }
    expect((await t.call('LAB', 'GET', `/consultas/${consultation.id}/detalle`)).status).toBe(403);
  });

  test('laboratorio: orden, doble identificación, resultado normal, completar y revisar', async () => {
    const patientId = await t.patient({ name: 'Laboratorio' });
    const consultation = await t.consultation(patientId);
    const exam = await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'");
    const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [exam.id] });
    expect(order.status).toBe(201);
    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
    expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente: record, nombreCompleto: 'Otra Persona' })).status).toBe(409);
    const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente: record, nombreCompleto: 'Laboratorio Ficticio' });
    expect(sample.status).toBe(201);
    const item = await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [order.body.id]);
    expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/completar`, { version: sample.body.version })).status).toBe(409);
    const result = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: item.id, value: 13.2 });
    expect(result.status).toBe(201);
    expect(result.body.marca).toBe('normal');
    // API-10: every captured result moves the order version.
    const completed = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/completar`, { version: result.body.orderVersion });
    expect(completed.status).toBe(201);
    expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${order.body.id}/revisar`, { version: completed.body.version })).status).toBe(201);
    const queue = await t.call('LAB', 'GET', '/laboratorio/ordenes');
    const row = queue.body.find((r: any) => r.id === order.body.id);
    expect(row.state).toBe('completado');
    // Ronda 2: la lista de trabajo trae expediente, médico y edad solo como rango (Laboratorio no ve la fecha exacta).
    expect(row).toMatchObject({ patientRecord: record, doctorName: 'MED Prueba', patientAge: null });
    expect(typeof row.patientSex).toBe('string');
  });

  describe('asignación de camas (REQ-08, RN-05)', () => {
    const admit = async (options: { sex?: string; isolation?: boolean; category?: string } = {}) => {
      const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(await t.patient({ sex: options.sex ?? 'femenino' }), { requestedCategory: options.category ?? 'semiprivada', isolation: options.isolation ?? false }));
      expect(created.status).toBe(201);
      return created.body.id as string;
    };
    const assign = async (admissionId: string, code: string) => { const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]); return t.call('REC', 'POST', `/admisiones/${admissionId}/cama`, { bedId: bed.id, version: bed.version }); };
    const suggest = async (admissionId: string) => (await t.call('REC', 'GET', `/admisiones/${admissionId}/sugerencias-cama`)).body as any[];

    test('solo sugiere camas libres de la categoría pedida y prefiere completar habitaciones compatibles', async () => {
      const vip = await suggest(await admit({ category: 'vip' }));
      expect(vip.length).toBeGreaterThan(0);
      expect(vip.every(bed => bed.category === 'vip' && bed.state === 'libre')).toBe(true);
      expect((await assign(await admit({ sex: 'masculino' }), 'HAB-203-A')).status).toBe(201);
      const next = await suggest(await admit({ sex: 'masculino' }));
      expect(next[0].code).toBe('HAB-203-B');
      expect(next.every(bed => bed.category === 'semiprivada')).toBe(true);
    });

    test('el aislamiento exige habitación vacía (DAT-02, RN-05.5) y bloquea a los demás', async () => {
      const isolated = await admit({ isolation: true });
      const options = await suggest(isolated);
      expect(options.map(bed => bed.code)).not.toContain('HAB-203-B');
      expect((await assign(isolated, 'HAB-203-B')).status).toBe(409);
      expect((await assign(isolated, 'HAB-204-A')).status).toBe(201);
      expect((await suggest(await admit())).map(bed => bed.code)).not.toContain('HAB-204-B');
    });

    test('dos asignaciones a la misma cama: la segunda recibe 409', async () => {
      const first = await admit();
      const second = await admit();
      expect((await assign(first, 'HAB-205-A')).status).toBe(201);
      expect((await assign(second, 'HAB-205-A')).status).toBe(409);
    });
  });
});
