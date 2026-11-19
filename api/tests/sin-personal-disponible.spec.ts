import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date('2026-11-16T15:00:00Z'); // 09:00 local
const MIN = 60_000;
const slotAt = (iso: string) => ({ start: iso, end: new Date(new Date(iso).valueOf() + 20 * MIN).toISOString() });
const message = 'No hay médicos de turno para ese día y servicio.';

// Lote 5, S6: a day with no doctor of the service on shift cannot be booked, and the request inbox says so.
describe('Lote 5 S6 · sin médicos de turno para ese día y servicio', () => {
  let t: TestApp;
  let doctorId: string;
  let otherDoctor: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    doctorId = await t.staffOf('MED');
    await t.pg.query("UPDATE personal.persona SET especialidad='Dermatología' WHERE id=$1", [doctorId]);
    // Only the fixture doctor is Dermatología; make sure no seed doctor shares it.
    await t.pg.query("UPDATE personal.persona SET especialidad='Medicina general' WHERE tipo='medico' AND especialidad='Dermatología' AND id<>$1", [doctorId]);
    otherDoctor = (await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,especialidad,area_id) SELECT 'Otra','Dermatóloga','medico','Dermatología',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`)).id;
    await t.pg.query(`INSERT INTO personal.inscripcion(persona_id,junta,numero,vigencia) VALUES($1,'JVPM','N-OTRA-DERM',daterange('2026-01-01','2027-12-31','[)'))`, [otherDoctor]);
    // Tomorrow 08:00-17:00 local the fixture doctor works; the day after only the other dermatologist works, 08:00-12:00.
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
  });
  afterEach(async () => {
    await t.pg.query("UPDATE atencion.solicitud_cita SET estado='cancelada',resuelta_en=now() WHERE estado='pendiente'");
    await t.pg.query("UPDATE atencion.cita SET estado='cancelada' WHERE estado IN ('solicitada','confirmada')");
  });
  afterAll(async () => { await t?.close(); });

  const patientRequest = async () => {
    const patientId = await t.patient({ linkPac: true });
    const res = await t.call('PAC', 'POST', '/citas/solicitudes-categoria', { categories: ['piel'], franja: 'manana', note: 'Mancha en el brazo' });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, patientId };
  };

  test('asignar en un día sin médicos del servicio responde 409 sin_personal_disponible; con otro del servicio de turno sigue siendo medico_sin_jornada', async () => {
    const request = await patientRequest();
    const empty = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${request.id}/asignar`, { version: 1, doctorId, ...slotAt('2026-11-19T15:00:00.000Z') });
    expect(empty.status).toBe(409);
    expect(empty.body).toMatchObject({ codigo: 'sin_personal_disponible', detail: message, campo: 'start' });
    expect((await t.one('SELECT estado FROM atencion.solicitud_cita WHERE id=$1', [request.id])).estado).toBe('pendiente');
    // The other dermatologist works on the 18th: the fixture doctor is just off that day.
    await t.pg.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange('2026-11-18T14:00:00Z','2026-11-18T18:00:00Z','[)'),'diurno','publicado' FROM infra.espacio WHERE codigo='P1-CON'`, [otherDoctor]);
    try {
      const off = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${request.id}/asignar`, { version: 1, doctorId, ...slotAt('2026-11-18T15:00:00.000Z') });
      expect(off.body.codigo).toBe('medico_sin_jornada');
      const ok = await t.call('REC', 'POST', `/citas/solicitudes-categoria/${request.id}/asignar`, { version: 1, doctorId, ...slotAt('2026-11-17T15:00:00.000Z') });
      expect(ok.status).toBe(201);
    } finally {
      await t.pg.query('DELETE FROM personal.turno WHERE persona_id=$1', [otherDoctor]);
    }
  });

  test('agendar una cita directa en un día sin médicos del servicio responde lo mismo', async () => {
    const patientId = await t.patient();
    const res = await t.call('REC', 'POST', '/citas', { patientId, doctorId, ...slotAt('2026-11-20T15:00:00.000Z') });
    expect([res.status, res.body.codigo, res.body.detail]).toEqual([409, 'sin_personal_disponible', message]);
  });

  test('la bandeja marca staffAvailable por solicitud', async () => {
    const request = await patientRequest();
    const row = async () => ((await t.call('REC', 'GET', '/citas/solicitudes-categoria')).body as any[]).find(r => r.id === request.id);
    expect((await row()).staffAvailable).toBe(true);
    const saved = (await t.pg.query('SELECT id,estado FROM personal.turno WHERE estado IN (\'publicado\',\'en_curso\')')).rows as { id: string; estado: string }[];
    const raw = (sql: string, params: unknown[] = []) => t.pg.transaction(async tx => { await tx.exec('SET LOCAL session_replication_role = replica'); await tx.query(sql, params); });
    await raw("UPDATE personal.turno SET estado='cancelado' WHERE estado IN ('publicado','en_curso')");
    try {
      expect((await row()).staffAvailable).toBe(false);
    } finally {
      for (const s of saved) await raw('UPDATE personal.turno SET estado=$2 WHERE id=$1', [s.id, s.estado]);
    }
  });
});
