import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';
import { bedVerdict, visitorError, visitorPolicy } from '../src/hospitalization/admission-intake.rules';

jest.setTimeout(180000);
// Database views compare against now(); the API clock stays slightly in the past so both agree.
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('Ingreso guiado · reglas puras', () => {
  const room = (state: string, sex: string | null = null, isolation = false) => ({ id: randomUUID(), roomId: 'r', state, roomSex: sex, roomIsolation: isolation });
  test('visitas: sin visitas son 0, con visitas al menos 1 y hasta el límite de la categoría', () => {
    expect(visitorError(visitorPolicy(false, undefined), 'vip')).toBeNull();
    expect(visitorError(visitorPolicy(false, 2), 'vip')).toMatch(/debe ser 0/);
    expect(visitorError(visitorPolicy(true, 0), 'vip')).toMatch(/al menos 1/);
    expect(visitorError(visitorPolicy(true, 2), 'semiprivada')).toMatch(/hasta 1 acompañante/);
    expect(visitorError(visitorPolicy(true, 3), 'vip')).toBeNull();
    expect(visitorPolicy(undefined, undefined)).toEqual({ allowed: true, max: 1 });
  });
  test('cama: libre, mismo sexo y aislamiento solo en habitación sin otros ocupantes', () => {
    const free = room('libre');
    expect(bedVerdict(free, [free], 'femenino', false).compatible).toBe(true);
    expect(bedVerdict(room('limpieza'), [], 'femenino', false).reason).toBe('En limpieza');
    expect(bedVerdict(free, [free, room('ocupada', 'masculino')], 'femenino', false).reason).toMatch(/otro sexo/);
    expect(bedVerdict(free, [free, room('ocupada', 'femenino')], 'femenino', false).compatible).toBe(true);
    expect(bedVerdict(free, [free, room('ocupada', 'femenino')], 'femenino', true).reason).toMatch(/aislamiento/);
    expect(bedVerdict(free, [free, room('ocupada', 'femenino', true)], 'femenino', false).reason).toMatch(/aislamiento/);
  });
});

describe('Ingreso guiado · motivo, origen, turno y cama (observación 11)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const post = (body: unknown) => t.call('REC', 'POST', '/admisiones', body);
  const valid = async (extra: Record<string, unknown> = {}, sex = 'femenino') => t.admissionBody(await t.patient({ sex }), { requestedCategory: 'semiprivada', isolation: false, ...extra });

  test('el motivo es obligatorio y de al menos 10 caracteres', async () => {
    const body: any = await valid();
    delete body.motive;
    expect((await post(body)).status).toBe(400);
    expect((await post({ ...body, motive: 'corto' })).status).toBe(400);
    expect((await post({ ...body, motive: 'Dolor abdominal con fiebre' })).status).toBe(201);
  });

  test('el origen debe existir y pertenecer al paciente; `programada` ya no se acepta', async () => {
    const body: any = await valid();
    expect((await post({ ...body, originId: randomUUID() })).status).toBe(400);
    const other = await t.admissionBody(await t.patient());
    expect((await post({ ...body, originId: other.originId })).status).toBe(400);
    expect((await post({ ...body, origin: 'cita' })).status).toBe(400);
    expect((await post({ ...body, origin: 'programada', scheduledAt: new Date(now.valueOf() + 86_400_000).toISOString() })).status).toBe(400);
    const { originId, ...withoutOrigin } = body;
    expect(originId).toBeTruthy();
    expect((await post(withoutOrigin)).status).toBe(400);
  });

  test('un ingreso desde una cita del mismo paciente se acepta', async () => {
    const patientId = await t.patient();
    const appointmentId = await t.appointment(patientId, new Date(now.valueOf() + 3_600_000));
    const body = await t.admissionBody(patientId, { requestedCategory: 'semiprivada', isolation: false, origin: 'cita', originId: appointmentId });
    const created = await post(body);
    expect(created.status).toBe(201);
    const row = (await t.call('REC', 'GET', '/admisiones')).body.find((a: any) => a.id === created.body.id);
    expect(row).toMatchObject({ origin: 'cita', originId: appointmentId, motive: 'Ingreso de prueba por emergencia', visitorsAllowed: true, visitorsMax: 1, unstable: false, postSurgical: false, isolationType: null });
  });

  test('el médico necesita turno en el horario del ingreso', async () => {
    const body = await valid({ scheduledAt: new Date(now.valueOf() + 5 * 86_400_000).toISOString() });
    const refused = await post(body);
    expect(refused.status).toBe(409);
  });

  test('requisitos clínicos y visitas se guardan; el tipo de aislamiento exige aislamiento; la categoría limita acompañantes', async () => {
    const body = await valid({ isolation: true, isolationType: 'gotitas', unstable: true, postSurgical: true, visitorsAllowed: false });
    const created = await post(body);
    expect(created.status).toBe(201);
    const row = (await t.call('REC', 'GET', '/admisiones')).body.find((a: any) => a.id === created.body.id);
    expect(row).toMatchObject({ isolation: true, isolationType: 'gotitas', unstable: true, postSurgical: true, visitorsAllowed: false, visitorsMax: 0 });
    expect((await post(await valid({ isolation: false, isolationType: 'contacto' }))).status).toBe(400);
    expect((await post(await valid({ visitorsAllowed: true, visitorsMax: 2 }))).status).toBe(400);
    expect((await post(await valid({ visitorsAllowed: false, visitorsMax: 1 }))).status).toBe(400);
    expect((await post(await valid({ requestedCategory: 'vip', visitorsAllowed: true, visitorsMax: 3 }))).status).toBe(201);
  });

  test('lista los orígenes recientes del paciente y audita la lectura', async () => {
    const patientId = await t.patient();
    const ticket = (await t.admissionBody(patientId)).originId;
    const appointmentId = await t.appointment(patientId, new Date(now.valueOf() + 5 * 3_600_000));
    const all = await t.call('REC', 'GET', `/admisiones/origenes?patientId=${patientId}`);
    expect(all.status).toBe(200);
    expect(all.body.map((o: any) => `${o.origin}:${o.id}`).sort()).toEqual([`cita:${appointmentId}`, `emergencia:${ticket}`].sort());
    expect(all.body[0].label).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    const onlyAppointments = await t.call('REC', 'GET', `/admisiones/origenes?patientId=${patientId}&origin=cita`);
    expect(onlyAppointments.body).toHaveLength(1);
    expect((await t.audits('admision.origenes')).some(a => a.paciente_id === patientId)).toBe(true);
    expect((await t.call('MED', 'GET', `/admisiones/origenes?patientId=${patientId}`)).status).toBe(403);
  });

  test('médicos disponibles: con turno disponibles; sin turno apagados con su motivo', async () => {
    const doctorId = await t.staffOf('MED');
    await t.admissionBody(await t.patient(), { attendingDoctorId: doctorId });
    const during = await t.call('REC', 'GET', `/admisiones/medicos-disponibles?at=${now.toISOString()}`);
    expect(during.body.find((d: any) => d.id === doctorId)).toMatchObject({ available: true, reason: null });
    const later = await t.call('REC', 'GET', `/admisiones/medicos-disponibles?at=${new Date(now.valueOf() + 20 * 86_400_000).toISOString()}`);
    expect(later.body.find((d: any) => d.id === doctorId)).toMatchObject({ available: false, reason: 'Sin turno en ese horario' });
  });

  test('mapa de camas: conteo por categoría, compatibilidad por sexo y una sugerencia', async () => {
    const man = await t.patient({ sex: 'masculino' }), woman = await t.patient({ sex: 'femenino' });
    const first = await t.admissionBody(woman, { requestedCategory: 'semiprivada', isolation: false });
    const created = await post(first);
    const bed = (await t.call('REC', 'GET', `/admisiones/mapa-camas?patientId=${woman}&category=semiprivada`)).body.beds.find((b: any) => b.suggested);
    expect(bed).toBeTruthy();
    expect((await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);
    const forMan = (await t.call('REC', 'GET', `/admisiones/mapa-camas?patientId=${man}&category=semiprivada`)).body;
    const same = forMan.beds.filter((b: any) => b.roomId === bed.roomId && b.state === 'libre');
    if (same.length) expect(same.every((b: any) => !b.compatible && /otro sexo/.test(b.reason))).toBe(true);
    expect(forMan.beds.filter((b: any) => b.suggested)).toHaveLength(1);
    expect(forMan.beds.find((b: any) => b.id === bed.id)).toMatchObject({ state: 'ocupada', compatible: false, reason: 'Ocupada' });
    expect(forMan.categories.map((c: any) => c.category).sort()).toEqual(['semiprivada', 'vip']);
    const forWoman = (await t.call('REC', 'GET', `/admisiones/mapa-camas?patientId=${woman}&isolation=true`)).body;
    expect(forWoman.beds.find((b: any) => b.roomId === bed.roomId && b.state === 'libre' && b.id !== bed.id)?.compatible ?? false).toBe(false);
  });

  test('ingreso inmediato: crea y asigna la cama en un solo comando; un conflicto no deja admisión a medias', async () => {
    const woman = await t.patient({ sex: 'femenino' });
    const map = (await t.call('REC', 'GET', `/admisiones/mapa-camas?patientId=${woman}&category=semiprivada`)).body;
    const bed = map.beds.find((b: any) => b.suggested);
    const body = await t.admissionBody(woman, { requestedCategory: 'semiprivada', isolation: false, bedId: bed.id, bedVersion: bed.version });
    const created = await post(body);
    expect(created.status).toBe(201);
    expect(created.body.state).toBe('hospitalizado');
    expect((await t.one<{ estado: string }>('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1', [bed.id])).estado).toBe('ocupada');

    const second = await t.patient({ sex: 'femenino' });
    const before = (await t.one<{ n: number }>('SELECT count(*)::int AS n FROM hospitalizacion.admision')).n;
    const taken = await post(await t.admissionBody(second, { requestedCategory: 'semiprivada', isolation: false, bedId: bed.id, bedVersion: bed.version }));
    expect(taken.status).toBe(409);
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM hospitalizacion.admision')).n).toBe(before);
    // Sin permiso de cama el médico no puede usar el atajo; para fecha futura la cama no se elige.
    const future = await t.admissionBody(await t.patient(), { requestedCategory: 'semiprivada', isolation: false, bedId: bed.id, bedVersion: bed.version, scheduledAt: new Date(now.valueOf() + 7_200_000).toISOString() });
    expect((await post(future)).status).toBe(400);
  });

  test('factibilidad: lista cada condición y avisa lo que fallaría', async () => {
    const woman = await t.patient({ sex: 'femenino' });
    const base = await t.admissionBody(woman);
    const query = (extra: Record<string, unknown> = {}) => new URLSearchParams({ patientId: woman, origin: 'emergencia', originId: base.originId as string, doctorId: base.attendingDoctorId as string, category: 'semiprivada', ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])) }).toString();
    const ok = await t.call('REC', 'GET', `/admisiones/factibilidad?${query()}`);
    expect(ok.status).toBe(200);
    expect(ok.body.feasible).toBe(true);
    const late = await t.call('REC', 'GET', `/admisiones/factibilidad?${query({ at: new Date(now.valueOf() + 30 * 86_400_000).toISOString() })}`);
    expect(late.body.feasible).toBe(false);
    expect(late.body.checks.find((c: any) => c.code === 'medico_en_turno').ok).toBe(false);
    const visits = await t.call('REC', 'GET', `/admisiones/factibilidad?${query({ visitorsAllowed: true, visitorsMax: 3 })}`);
    expect(visits.body.checks.find((c: any) => c.code === 'visitas').ok).toBe(false);
    const wrongOrigin = await t.call('REC', 'GET', `/admisiones/factibilidad?${query({ originId: randomUUID() })}`);
    expect(wrongOrigin.body.checks.find((c: any) => c.code === 'origen_vinculado').ok).toBe(false);
  });

  test('la base impone motivo y origen en filas nuevas; las filas legado se conservan', async () => {
    const patientId = await t.patient();
    const doctorId = await t.staffOf('MED');
    await expect(t.pg.query("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id) VALUES($1,'consulta',$2,'vip','femenino',$3)", [patientId, randomUUID(), doctorId])).rejects.toThrow(/admision_motivo_obligatorio/);
    await expect(t.pg.query("INSERT INTO hospitalizacion.admision(paciente_id,origen,fecha_programada,categoria_pedida,sexo_paciente,medico_tratante_id,motivo) VALUES($1,'programada',now(),'vip','femenino',$2,'Motivo suficientemente largo')", [patientId, doctorId])).rejects.toThrow(/admision_origen_vinculado/);
    await expect(t.pg.query("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,motivo,visitas_permitidas,visitantes_max) VALUES($1,'consulta',$2,'vip','femenino',$3,'Motivo suficientemente largo',false,2)", [patientId, randomUUID(), doctorId])).rejects.toThrow(/admision_visitas_coherentes/);
    await t.pg.query("INSERT INTO hospitalizacion.admision(paciente_id,origen,fecha_programada,categoria_pedida,sexo_paciente,medico_tratante_id,legado) VALUES($1,'programada',now(),'vip','femenino',$2,true)", [patientId, doctorId]);
  });
});
