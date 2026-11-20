import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(240000);

// Production flow audit of 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T2): API defects D21, D25/D26, D46, D48, D74, D90,
// D102, D103, D111, D116, D120, D128, D129 and D135. D97 is not changed: BL-03 lets a doctor with a current care relationship sign. Each rule has its RED test and, for each endpoint it touches, the previous
// behavior that still holds.

describe('Auditoría 2026-11-20 · fila, laboratorio, hospitalización, inventario, citas y sesión (D46, D48, D74, D90, D102, D103, D111, D128, D129)', () => {
  const now = new Date('2026-11-18T16:00:00Z'); // 10:00 in El Salvador
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const hospitalize = async (code: string) => {
    const patientId = await t.patient();
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(patientId, { requestedCategory: 'semiprivada', isolation: false }));
    expect(created.status).toBe(201);
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
    const assigned = await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version });
    expect(assigned.status).toBe(201);
    return { id: created.body.id as string, version: assigned.body.version as number, patientId };
  };
  const admissionOf = async (role: string, id: string) => ((await t.call(role, 'GET', '/admisiones')).body as any[]).find(row => row.id === id);

  test('D46: Recepción no completa un número de consulta general que ningún médico atendió', async () => {
    const patientId = await t.patient();
    const issued = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
    const called = await t.call('REC', 'POST', `/fila/${issued.body.id}/llamar`, { version: issued.body.version });
    const attending = await t.call('REC', 'POST', `/fila/${issued.body.id}/atender`, { version: called.body.version });
    expect(attending.status).toBe(201);
    const row = ((await t.call('REC', 'GET', '/fila')).body as any[]).find(r => r.id === issued.body.id);
    expect(row.allowedActions).not.toContain('completar');
    expect(row.blockedActions).toContainEqual({ action: 'completar', reason: 'Este número se completa cuando el médico firma la consulta.' });
    const done = await t.call('REC', 'POST', `/fila/${issued.body.id}/completar`, { version: attending.body.version });
    expect([done.status, done.body.codigo]).toEqual([409, 'consulta_sin_firmar']);
    expect((await t.one('SELECT estado FROM atencion.ticket_fila WHERE id=$1', [issued.body.id])).estado).toBe('en_atencion');
  });

  test('D46 (comportamiento previo): un número de laboratorio se completa desde el mostrador', async () => {
    const issued = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: await t.patient() });
    const called = await t.call('REC', 'POST', `/fila/${issued.body.id}/llamar`, { version: issued.body.version });
    const attending = await t.call('REC', 'POST', `/fila/${issued.body.id}/atender`, { version: called.body.version });
    const row = ((await t.call('REC', 'GET', '/fila')).body as any[]).find(r => r.id === issued.body.id);
    expect(row.allowedActions).toContain('completar');
    const done = await t.call('REC', 'POST', `/fila/${issued.body.id}/completar`, { version: attending.body.version });
    expect([done.status, done.body.state]).toEqual([201, 'atendido']);
  });

  test('D74: la propuesta de quién pasa después dice cuántos esperan y por qué no propone a nadie', async () => {
    const empty = (await t.call('REC', 'GET', '/fila/siguiente?service=emergencia')).body;
    expect(empty).toMatchObject({ waiting: 0, noProposalReason: 'sin_espera', proposal: null });
    const issued = await t.call('REC', 'POST', '/fila', { service: 'emergencia', patientId: await t.patient() });
    const next = (await t.call('REC', 'GET', '/fila/siguiente?service=emergencia')).body;
    expect(next).toMatchObject({ waiting: 1, noProposalReason: null, proposal: { id: issued.body.id, reason: 'llegada' } });
  });

  test('D48: el número guarda la hora del primer llamado; otro llamado no la mueve y deshacer el único la limpia', async () => {
    const issued = await t.call('REC', 'POST', '/fila', { service: 'laboratorio', patientId: await t.patient() });
    const rowOf = async () => ((await t.call('REC', 'GET', '/fila')).body as any[]).find(r => r.id === issued.body.id);
    expect(await rowOf()).toMatchObject({ calledAt: null, state: 'en_espera' });
    const first = new Date(now.getTime() + 12 * 60_000);
    t.setNow(first);
    try {
      const called = await t.call('REC', 'POST', `/fila/${issued.body.id}/llamar`, { version: issued.body.version });
      t.setNow(new Date(now.getTime() + 15 * 60_000));
      const again = await t.call('REC', 'POST', `/fila/${issued.body.id}/llamar`, { version: called.body.version });
      const row = await rowOf();
      expect(new Date(row.calledAt).toISOString()).toBe(first.toISOString());
      // Previous behavior: the issue time is unchanged.
      expect(new Date(row.issuedAt).toISOString()).toBe(now.toISOString());
      const undone = await t.call('REC', 'POST', `/fila/${issued.body.id}/deshacer-llamado`, { version: again.body.version });
      expect(undone.status).toBe(201);
      expect(new Date((await rowOf()).calledAt).toISOString()).toBe(first.toISOString());
      expect((await t.call('REC', 'POST', `/fila/${issued.body.id}/deshacer-llamado`, { version: undone.body.version })).status).toBe(201);
      expect(await rowOf()).toMatchObject({ calledAt: null, state: 'en_espera' });
    } finally { t.setNow(now); }
  });

  test('D102 y D103: la doble identificación ignora tildes y mayúsculas; un valor negativo solo entra si el rango baja de cero', async () => {
    const patientId = await t.patient({ name: 'Lucía' });
    const consultation = await t.consultation(patientId);
    const exam = await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'");
    const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [exam.id] });
    const { expediente } = await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId]);
    // Previous behavior: another name is still refused.
    expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente, nombreCompleto: 'Lucía Ficticia' })).status).toBe(409);
    const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente, nombreCompleto: '  LUCIA   FICTICIO ' });
    expect(sample.status).toBe(201);
    const item = await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [order.body.id]);
    const capture = (value: number) => t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: item.id, value, version: sample.body.version });
    const negative = await capture(-1);
    expect([negative.status, negative.body.codigo, negative.body.campo]).toEqual([400, 'validacion', 'value']);
    expect(negative.body.detail).toContain('no admite valores negativos');
    await t.pg.query('UPDATE laboratorio.rango_referencia SET minimo=-2 WHERE examen_id=$1', [exam.id]);
    expect((await capture(-1)).status).toBe(201);
  });

  test('D90: Enfermería ve el detalle de los pendientes del alta; Recepción sigue viendo solo cuántos son', async () => {
    const admission = await hospitalize('HAB-205-A');
    const pending = [{ description: 'Control en consulta externa en 7 días', responsible: 'Consulta general' }];
    expect((await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { type: 'medica', summary: 'Evolución favorable sin complicaciones', pending, version: admission.version })).status).toBe(201);
    const nurse = await admissionOf('ENF', admission.id);
    expect(nurse.discharge).toMatchObject({ type: 'medica', pendingCount: 1, pending: [{ description: 'Control en consulta externa en 7 días', responsible: 'Consulta general' }] });
    const reception = await admissionOf('REC', admission.id);
    expect(reception.discharge).toMatchObject({ type: null, pending: null, pendingCount: 1 });
    expect(reception.allowedActions).toContain('registrar_salida');
  });

  test('D111: no entra un lote ya vencido y la existencia por bodega no suma lo vencido', async () => {
    const wh = (await t.one<{ id: string }>("SELECT id FROM infra.espacio WHERE codigo='BOD-CEN'")).id;
    const code = `AUD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const article = (await t.call('JOP', 'POST', '/inventario/articulos', { code, name: `Kit ficticio ${code}`, type: 'insumo', unit: 'kit', minimum: 0 })).body.id as string;
    const entry = (lotNumber: string, expiresAt: string) => t.call('JOP', 'POST', '/inventario/movimientos', { type: 'entrada', articleId: article, lotNumber, expiresAt, destinationWarehouseId: wh, quantity: 4, reason: 'Compra ficticia recibida' });
    const expired = await entry('VENC-2020', '2020-01-01');
    expect([expired.status, expired.body.codigo]).toEqual([409, 'lote_vencido']);
    expect(expired.body.detail).toContain('01/01/2020');
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM inventario.existencia e JOIN inventario.lote l ON l.id=e.lote_id WHERE l.articulo_id=$1', [article])).n).toBe(0);
    // Previous behavior: a lot that has not expired enters.
    expect((await entry('VIGENTE-1', '2027-12-31')).status).toBe(201);
    // Stock of an expired lot (it expired while stored) is reported apart, never as usable.
    const old = await t.one<{ id: string }>("INSERT INTO inventario.lote(articulo_id,numero,vence) VALUES($1,'VIEJO-1','2026-01-31') RETURNING id", [article]);
    await t.pg.query('INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,3)', [old.id, wh]);
    const detail = (await t.call('JOP', 'GET', `/inventario/articulos/${article}`)).body;
    expect(detail.warehouses).toEqual([expect.objectContaining({ warehouseCode: 'BOD-CEN', quantity: 4, expired: 3 })]);
    expect(detail).toMatchObject({ available: 4, expired: 3 });
  });

  test('D128: el paciente sabe antes de llenar el formulario si ya llegó al máximo de solicitudes', async () => {
    await t.patient({ linkPac: true });
    const limit = async () => (await t.call('PAC', 'GET', '/citas/solicitudes-categoria/limite')).body;
    expect(await limit()).toEqual({ pending: 0, max: 2, canRequest: true, code: null, reason: null });
    const request = () => t.call('PAC', 'POST', '/citas/solicitudes-categoria', { categories: ['piel'], franja: 'manana', note: 'Mancha en el brazo desde hace un mes' });
    expect((await request()).status).toBe(201);
    expect((await request()).status).toBe(201);
    expect(await limit()).toMatchObject({ pending: 2, max: 2, canRequest: false, code: 'solicitudes_pendientes_max', reason: expect.stringContaining('2 solicitudes pendientes') });
    // Previous behavior: the command still refuses with the same code.
    const third = await request();
    expect([third.status, third.body.codigo]).toEqual([409, 'solicitudes_pendientes_max']);
    expect((await t.call('REC', 'GET', '/citas/solicitudes-categoria/limite')).status).toBe(403);
  });

  test('D129: la cuenta del paciente muestra el nombre del expediente vinculado, no el de la cuenta', async () => {
    const patientId = await t.patient({ linkPac: true, name: 'Ana Cecilia' });
    const { expediente } = await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId]);
    const pac = (await t.call('PAC', 'GET', '/auth/me')).body;
    expect(pac).toMatchObject({ patientId, name: 'Ana Cecilia Ficticio', patientName: 'Ana Cecilia Ficticio', patientRecord: expediente });
    // Previous behavior: a staff account keeps its own display name and has no patient identity.
    const med = (await t.call('MED', 'GET', '/auth/me')).body;
    const account = await t.one<{ nombre_mostrar: string | null }>('SELECT nombre_mostrar FROM acceso.usuario WHERE id=$1', [userId('MED')]);
    expect(med).toMatchObject({ name: account.nombre_mostrar, patientName: null, patientRecord: null });
  });
});
