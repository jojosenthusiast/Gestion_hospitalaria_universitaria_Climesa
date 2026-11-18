import { DatabaseService } from '../src/platform/database.service';
import { createTestApp, TestApp } from './support/app';
import { recordSql } from './support/sql-recorder';

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

  test('CITA-07: una solicitud por categoría pendiente deja de contar a los 14 días, pero sigue en la bandeja', async () => {
    const old = (await request()).body.id;
    const recent = (await request()).body.id;
    expect((await request()).status).toBe(409);
    await t.pg.query(`UPDATE atencion.solicitud_cita SET creado_en = $2::timestamptz - interval '14 days 1 minute' WHERE id = $1`, [old, now]);
    await t.pg.query(`UPDATE atencion.solicitud_cita SET creado_en = $2::timestamptz - interval '13 days 23 hours' WHERE id = $1`, [recent, now]);
    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(409);
    expect((await inbox('REC')).find(r => r.id === old)).toMatchObject({ state: 'pendiente', allowedActions: ['asignar', 'rechazar'] });
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

  // Auditoría T15: contar y luego insertar sin bloqueo deja pasar dos solicitudes concurrentes sobre el límite.
  test('CITA-07: las dos clases de solicitud toman el mismo candado por paciente antes de contar', async () => {
    const db = t.app.get(DatabaseService);
    const lockThenCount = (sql: string[]) => {
      const lock = sql.findIndex(q => /pg_advisory_xact_lock\(hashtext\('citas\.solicitudes:' \|\| \$1::text\)\)/.test(q));
      const count = sql.findIndex(q => /count\(\*\) FROM atencion\.solicitud_cita/.test(q));
      return lock >= 0 && lock < count;
    };
    expect(lockThenCount(await recordSql(db, async () => expect((await request()).status).toBe(201)))).toBe(true);
    const slot = slotAt('2026-11-17T21:00:00.000Z');
    expect(lockThenCount(await recordSql(db, async () => expect((await t.call('PAC', 'POST', '/citas/solicitudes', { doctorId, ...slot, reason: 'Control' })).status).toBe(201)))).toBe(true);
  });

  // Auditoría T15: resolver una solicitud usa el reloj de la API, como el resto del servicio.
  test('asignar, rechazar y retirar guardan resuelta_en con el reloj de la API', async () => {
    const later = new Date('2026-11-16T16:30:00Z');
    t.setNow(later);
    const resolvedAt = async (id: string) => (await t.one<{ at: Date }>('SELECT resuelta_en AS at FROM atencion.solicitud_cita WHERE id=$1', [id])).at;
    const assigned = (await request()).body;
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${assigned.id}/asignar`, { version: 1, doctorId, ...slotAt('2026-11-17T21:20:00.000Z') })).status).toBe(201);
    expect(await resolvedAt(assigned.id)).toEqual(later);
    const rejected = (await request()).body;
    expect((await t.call('REC', 'POST', `/citas/solicitudes-categoria/${rejected.id}/rechazar`, { version: 1, rejectionReason: 'No hay especialista disponible este mes.' })).status).toBe(201);
    expect(await resolvedAt(rejected.id)).toEqual(later);
    await t.pg.query("UPDATE atencion.cita SET estado='cancelada' WHERE estado IN ('solicitada','confirmada')");
    const withdrawn = (await request()).body;
    expect((await t.call('PAC', 'POST', `/citas/solicitudes-categoria/${withdrawn.id}/cancelar`, { version: 1 })).status).toBe(201);
    expect(await resolvedAt(withdrawn.id)).toEqual(later);
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

  test('la cita creada desde la solicitud lleva sus categorías en citas, agenda del médico y fila; la agendada directo no', async () => {
    const created = (await request({ categories: ['corazon', 'digestivo'] })).body;
    const slot = slotAt('2026-11-17T19:00:00.000Z');
    const assigned = (await t.call('REC', 'POST', `/citas/solicitudes-categoria/${created.id}/asignar`, { version: 1, doctorId, ...slot })).body;
    const direct = await t.appointment(patientId, new Date('2026-11-17T20:00:00.000Z'));
    const expected = [{ code: 'corazon', name: expect.any(String), icon: 'corazon' }, { code: 'digestivo', name: expect.any(String), icon: 'digestivo' }];
    for (const role of ['REC', 'PAC', 'MED']) {
      const list = (await t.call(role, 'GET', '/citas?from=2026-11-17&to=2026-11-17')).body as any[];
      expect(list.find(c => c.id === assigned.appointmentId).categories).toEqual(expected);
      expect(list.find(c => c.id === direct).categories).toEqual([]);
    }
    const agenda = (await t.call('MED', 'GET', '/consultas/agenda')).body as any[];
    expect(agenda.find(a => a.appointmentId === assigned.appointmentId).categories).toEqual(expected);
    expect(agenda.find(a => a.appointmentId === direct).categories).toEqual([]);

    // A number issued for the appointment carries its categories; a walk-in number carries none.
    const linked = await t.one(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,cita_id) VALUES('consulta_general','2026-11-17',951,$1,$2) RETURNING id`, [patientId, assigned.appointmentId]);
    const walkIn = await t.one(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id) VALUES('emergencia','2026-11-17',952,$1) RETURNING id`, [patientId]);
    const queue = (await t.call('REC', 'GET', '/fila?date=2026-11-17')).body as any[];
    expect(queue.find(q => q.id === linked.id).categories).toEqual(expected);
    expect(queue.find(q => q.id === walkIn.id).categories).toEqual([]);

    // A rescheduled appointment keeps the categories of the one the request created.
    await t.pg.query("UPDATE atencion.cita SET estado='reprogramada' WHERE id=$1", [assigned.appointmentId]);
    const moved = await t.one(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen,reprogramada_de,reprogramaciones)
      VALUES($1,$2,tstzrange('2026-11-17T21:00:00Z','2026-11-17T21:20:00Z','[)'),'confirmada','paciente',$3,1) RETURNING id`, [patientId, doctorId, assigned.appointmentId]);
    const after = (await t.call('REC', 'GET', '/citas?from=2026-11-17&to=2026-11-17')).body as any[];
    expect(after.find(c => c.id === moved.id).categories).toEqual(expected);
  });
});
