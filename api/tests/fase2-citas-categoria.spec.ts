import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date('2026-11-16T15:00:00Z'); // 09:00 en El Salvador
const MIN = 60_000;
const slotAt = (iso: string) => ({ start: iso, end: new Date(new Date(iso).valueOf() + 20 * MIN).toISOString() });

// Fase 2, flujo A (S8): el paciente pide cita por motivo, sin médico; recepción asigna médico y hora.
describe('Fase 2 · solicitud de cita por categoría', () => {
  let t: TestApp;
  let doctorId: string;
  let patientId: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    doctorId = await t.staffOf('MED');
    // Jornada del médico mañana de 08:00 a 17:00 hora local.
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
    patientId = await t.patient({ linkPac: true });
  });
  afterEach(async () => {
    t.setNow(now);
    // Cada prueba empieza sin solicitudes pendientes del paciente vinculado (CITA-07 limita cuántas puede tener).
    await t.pg.query("UPDATE atencion.solicitud_cita SET estado='cancelada',resuelta_en=now() WHERE estado='pendiente'");
    await t.pg.query("UPDATE atencion.cita SET estado='cancelada' WHERE estado IN ('solicitada','confirmada')");
  });
  afterAll(async () => { await t?.close(); });

  const request = (body: Record<string, unknown> = {}) => t.call('PAC', 'POST', '/citas/solicitudes-categoria', { categories: ['piel'], franja: 'manana', note: 'Mancha en el brazo desde hace un mes', ...body });
  const inbox = async (role: string) => (await t.call(role, 'GET', '/citas/solicitudes-categoria')).body as any[];

  test('el catálogo trae categorías con ícono, palabras de búsqueda y especialidades sugeridas', async () => {
    for (const role of ['PAC', 'REC']) {
      const res = await t.call(role, 'GET', '/citas/categorias');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(10);
      expect(res.body[0]).toEqual({ code: 'consulta_general', name: 'Consulta general', description: expect.any(String), icon: 'general', specialties: ['Medicina general', 'Medicina interna'], keywords: expect.stringContaining('fiebre') });
    }
    expect((await t.call('LAB', 'GET', '/citas/categorias')).status).toBe(403);
  });

  test('el paciente pide sin médico, con varias categorías, franja y nota; queda pendiente, auditada y avisada a recepción', async () => {
    const res = await request({ categories: ['piel', 'alergias'], franja: 'tarde' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), version: 1, state: 'pendiente' });
    const row = await t.one('SELECT paciente_id,categorias,franja,nota,medico_preferido_id FROM atencion.solicitud_cita WHERE id=$1', [res.body.id]);
    expect(row).toEqual({ paciente_id: patientId, categorias: ['piel', 'alergias'], franja: 'tarde', nota: 'Mancha en el brazo desde hace un mes', medico_preferido_id: null });
    expect((await t.audits('citas.solicitar_categoria')).some(a => a.paciente_id === patientId && a.detalle.requestId === res.body.id)).toBe(true);
    expect((await t.events('cita.actualizada', res.body.id)).flat()).toContain('rol:REC');
  });

  test('valida categorías, franja, nota y médico preferido', async () => {
    expect((await request({ categories: [] })).status).toBe(400);
    const unknown = await request({ categories: ['inventada'] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.detail).toMatch(/categoría/);
    expect((await request({ franja: 'noche' })).status).toBe(400);
    expect((await request({ note: 'x'.repeat(281) })).status).toBe(400);
    expect((await request({ preferredDoctorId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    const preferred = await request({ preferredDoctorId: doctorId });
    expect(preferred.status).toBe(201);
    expect((await inbox('REC')).find(r => r.id === preferred.body.id)).toMatchObject({ preferredDoctorId: doctorId, preferredDoctorName: expect.any(String) });
  });

  test('CITA-07 cuenta también las solicitudes por categoría pendientes', async () => {
    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(201);
    const third = await request();
    expect(third.status).toBe(409);
    expect(third.body.codigo).toBe('solicitudes_pendientes_max');
  });

  test('recepción ve la bandeja con nota y acciones; el paciente solo las suyas; el médico ninguna', async () => {
    const mine = (await request({ categories: ['ojos', 'cabeza_nervios'] })).body;
    const other = await t.patient();
    const foreign = await t.one(`INSERT INTO atencion.solicitud_cita(paciente_id,categorias,franja,nota) VALUES($1,'{corazon}','cualquiera','Presión alta') RETURNING id`, [other]);
    const rec = await inbox('REC');
    const item = rec.find(r => r.id === mine.id);
    expect(item).toMatchObject({ patientId, patientName: expect.any(String), record: expect.any(String), franja: 'manana', note: 'Mancha en el brazo desde hace un mes', state: 'pendiente', version: 1,
      categories: [{ code: 'ojos', name: 'Ojos y visión', icon: 'ojo' }, { code: 'cabeza_nervios', name: 'Cabeza y nervios', icon: 'neuro' }],
      specialties: ['Oftalmología', 'Neurología'], allowedActions: ['asignar', 'rechazar'], blockedActions: [], appointment: null });
    expect(rec.some(r => r.id === foreign.id)).toBe(true);
    const pac = await inbox('PAC');
    expect(pac.map(r => r.id)).toContain(mine.id);
    expect(pac.some(r => r.id === foreign.id)).toBe(false);
    expect(pac.find(r => r.id === mine.id).allowedActions).toEqual(['cancelar']);
    expect(await inbox('MED')).toEqual([]);
    expect((await t.audits('citas.solicitudes_leer')).some(a => a.detalle.patientIds?.includes(patientId))).toBe(true);
  });

  test('recepción asigna médico y hora: crea una cita confirmada con las reglas de siempre y queda auditada', async () => {
    const created = (await request({ categories: ['piel'] })).body;
    const slot = slotAt('2026-11-17T15:00:00.000Z');
    expect((await t.call('PAC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 1, doctorId, ...slot })).status).toBe(403);
    // Reglas de cita existentes: franja de 20 minutos alineada a la jornada, médico con jornada.
    const odd = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 1, doctorId, ...slotAt('2026-11-17T15:05:00.000Z') });
    expect(odd.body.codigo).toBe('franja_desalineada');
    const noShift = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 1, doctorId, ...slotAt('2026-11-18T15:00:00.000Z') });
    expect(noShift.body.codigo).toBe('medico_sin_jornada');
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 1, doctorId, start: slot.start, end: new Date(new Date(slot.start).valueOf() + 30 * MIN).toISOString() })).status).toBe(400);
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 9, doctorId, ...slot })).body.codigo).toBe('version_conflicto');

    const assigned = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 1, doctorId, ...slot });
    expect(assigned.status).toBe(201);
    expect(assigned.body).toEqual({ id: created.id, version: 2, state: 'asignada', appointmentId: expect.any(String) });
    const cita = await t.one('SELECT paciente_id,medico_id,estado,origen,motivo,lower(horario) AS start FROM atencion.cita WHERE id=$1', [assigned.body.appointmentId]);
    expect(cita).toEqual({ paciente_id: patientId, medico_id: doctorId, estado: 'confirmada', origen: 'paciente', motivo: 'Piel · Mancha en el brazo desde hace un mes', start: new Date(slot.start) });
    expect((await t.audits('citas.asignar')).some(a => a.paciente_id === patientId && a.detalle.requestId === created.id && a.detalle.appointmentId === assigned.body.appointmentId && a.detalle.doctorId === doctorId)).toBe(true);
    const seen = (await inbox('PAC')).find(r => r.id === created.id);
    expect(seen).toMatchObject({ state: 'asignada', allowedActions: [], appointment: { id: assigned.body.appointmentId, doctorName: expect.any(String), start: slot.start } });
    // La cita creada se gestiona como cualquier otra (CITA-04).
    expect((await t.call('PAC', 'GET', '/citas')).body.find((c: any) => c.id === assigned.body.appointmentId).allowedActions).toEqual(expect.arrayContaining(['cancelar', 'reprogramar']));

    const again = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 2, doctorId, ...slotAt('2026-11-17T16:00:00.000Z') });
    expect(again.status).toBe(409);
    expect(again.body.codigo).toBe('solicitud_cita_resuelta');
  });

  test('una franja ocupada o un paciente con otra cita a esa hora no se asignan', async () => {
    const first = (await request()).body;
    const second = (await request({ categories: ['ojos'] })).body;
    const slot = slotAt('2026-11-17T17:00:00.000Z');
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${first.id}/asignar`, { version: 1, doctorId, ...slot })).status).toBe(201);
    const clash = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${second.id}/asignar`, { version: 1, doctorId, ...slot });
    expect(clash.status).toBe(409);
    expect(['franja_ocupada', 'paciente_con_cita']).toContain(clash.body.codigo);
    expect((await t.one('SELECT estado FROM atencion.solicitud_cita WHERE id=$1', [second.id])).estado).toBe('pendiente');
  });

  test('recepción rechaza con motivo y el paciente lo ve; el paciente cancela la suya', async () => {
    const a = (await request()).body;
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${a.id}/rechazar`, { version: 1, rejectionReason: 'corto' })).status).toBe(400);
    const rejected = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${a.id}/rechazar`, { version: 1, rejectionReason: 'No hay dermatología este mes; llama a recepción' });
    expect(rejected.status).toBe(201);
    expect(rejected.body).toMatchObject({ state: 'rechazada', version: 2 });
    expect((await inbox('PAC')).find(r => r.id === a.id)).toMatchObject({ state: 'rechazada', rejectionReason: 'No hay dermatología este mes; llama a recepción', allowedActions: [] });
    expect((await t.audits('citas.solicitud_rechazar')).some(x => x.paciente_id === patientId)).toBe(true);

    const b = (await request()).body;
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${b.id}/cancelar`, { version: 1 })).status).toBe(403);
    const cancelled = await t.call('PAC', 'POST', `/citas/solicitudes-categoria/${b.id}/cancelar`, { version: 1 });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body).toMatchObject({ state: 'cancelada' });
    expect((await t.audits('citas.solicitud_cancelar')).some(x => x.paciente_id === patientId)).toBe(true);
  });

  test('el paciente no cancela solicitudes ajenas', async () => {
    const foreign = await t.one(`INSERT INTO atencion.solicitud_cita(paciente_id,categorias,franja) VALUES($1,'{piel}','manana') RETURNING id`, [await t.patient()]);
    expect((await t.call('PAC', 'POST', `/citas/solicitudes-categoria/${foreign.id}/cancelar`, { version: 1 })).status).toBe(403);
  });

  test('la base no reabre una solicitud resuelta', async () => {
    const a = (await request()).body;
    await t.call('PAC', 'POST', `/citas/solicitudes-categoria/${a.id}/cancelar`, { version: 1 });
    await expect(t.pg.query("UPDATE atencion.solicitud_cita SET estado='pendiente',resuelta_en=NULL WHERE id=$1", [a.id])).rejects.toThrow(/transicion_invalida/);
  });

  test('sigue funcionando la solicitud con médico y hora elegidos por el paciente', async () => {
    const slot = slotAt('2026-11-17T20:00:00.000Z');
    const created = await t.call('PAC', 'POST', '/citas/solicitudes', { doctorId, ...slot, reason: 'Control' });
    expect(created.status).toBe(201);
    expect(created.body.state).toBe('solicitada');
    const confirmed = await t.call('REC', 'POST', `/citas/solicitudes/${created.body.id}/confirmar`, { version: created.body.version });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.state).toBe('confirmada');
  });
});
