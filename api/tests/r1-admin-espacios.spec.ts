import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

/** Ronda 1 · ADMIN-ESPACIOS: catálogo de especialidades (obs. 9), filtros de turnos (obs. 6) y flujo de laboratorio (obs. 13). */
describe('Ronda 1 · administración y espacios', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  describe('catálogo de especialidades (obs. 9)', () => {
    const staff = (over: Record<string, unknown>) => ({ givenNames: 'Persona', surnames: 'Ficticia', type: 'medico', ...over });

    test('lista el catálogo por categoría, con Medicina general entre las médicas', async () => {
      const med = await t.call('ADM', 'GET', '/personal/especialidades?categoria=medico');
      expect(med.status).toBe(200);
      expect(med.body.map((s: any) => s.name)).toContain('Medicina general');
      expect(med.body.every((s: any) => s.category === 'medico')).toBe(true);
      const nurse = await t.call('ADM', 'GET', '/personal/especialidades?categoria=enfermero');
      expect(nurse.body.length).toBeGreaterThan(3);
      expect(nurse.body.every((s: any) => s.category === 'enfermero')).toBe(true);
      expect((await t.call('ADM', 'GET', '/personal/especialidades')).body.length).toBe(med.body.length + nurse.body.length);
      expect((await t.call('REC', 'GET', '/personal/especialidades')).status).toBe(403);
    });

    test('un médico sin especialidad queda en Medicina general; el catálogo valida el resto', async () => {
      const def = await t.call('ADM', 'POST', '/personal', staff({}));
      expect(def.status).toBe(201);
      const listed = (await t.call('ADM', 'GET', '/personal')).body.find((p: any) => p.id === def.body.id);
      expect(listed.specialty).toBe('Medicina general');
      const ok = await t.call('ADM', 'POST', '/personal', staff({ specialty: 'pediatría' }));
      expect(ok.status).toBe(201);
      expect((await t.call('ADM', 'GET', '/personal')).body.find((p: any) => p.id === ok.body.id).specialty).toBe('Pediatría');
      const free = await t.call('ADM', 'POST', '/personal', staff({ specialty: 'Curandería' }));
      expect(free.status).toBe(400);
      expect(free.body.message ?? free.body.detail).toMatch(/catálogo/);
    });

    test('enfermería usa sus áreas; los demás tipos no llevan especialidad', async () => {
      expect((await t.call('ADM', 'POST', '/personal', staff({ type: 'enfermero', specialty: 'Cuidados intensivos' }))).status).toBe(201);
      expect((await t.call('ADM', 'POST', '/personal', staff({ type: 'enfermero', specialty: 'Cardiología' }))).status).toBe(400);
      expect((await t.call('ADM', 'POST', '/personal', staff({ type: 'recepcionista', specialty: 'Pediatría' }))).status).toBe(400);
      expect((await t.call('ADM', 'POST', '/personal', staff({ type: 'recepcionista' }))).status).toBe(201);
    });

    test('un valor histórico sin cambios se conserva al editar', async () => {
      const created = await t.call('ADM', 'POST', '/personal', staff({ specialty: 'Pediatría' }));
      await t.pg.query("UPDATE personal.persona SET especialidad='Alergología clásica' WHERE id=$1", [created.body.id]);
      const edited = await t.call('ADM', 'PATCH', `/personal/${created.body.id}`, staff({ specialty: 'Alergología clásica', version: created.body.version, reason: 'Corrección de datos de prueba' }));
      expect(edited.status).toBe(200);
      expect((await t.call('ADM', 'GET', '/personal')).body.find((p: any) => p.id === created.body.id).specialty).toBe('Alergología clásica');
    });
  });

  test('turnos: cada fila trae el tipo de personal y el nombre del área (obs. 6)', async () => {
    const start = new Date(now.valueOf() + 60 * 60_000);
    await t.shift('MED', start, new Date(start.valueOf() + 6 * 3600_000));
    for (const role of ['LAB', 'REC']) {
      const rows = (await t.call(role, 'GET', '/turnos')).body;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r: any) => typeof r.staffType === 'string' && r.area)).toBe(true);
    }
    expect((await t.call('LAB', 'GET', '/turnos')).body.some((r: any) => r.staffType === 'medico')).toBe(true);
  });

  test('laboratorio: hemograma pedido por MED llega a LAB, se completa, MED revisa y PAC lo ve (obs. 13)', async () => {
    const own = await t.patient({ linkPac: true, name: 'Hemograma' });
    const consultation = await t.consultation(own);
    const hemograma = await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HEMO'");
    const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hemograma.id] });
    expect(order.status).toBe(201);

    const queue = (await t.call('LAB', 'GET', '/laboratorio/ordenes')).body.find((o: any) => o.id === order.body.id);
    expect(queue.state).toBe('pendiente');
    expect(queue.items.length).toBeGreaterThan(1);

    const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [own])).expediente;
    const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/muestra`, { version: order.body.version, expediente: record, nombreCompleto: 'Hemograma Ficticio' });
    expect(sample.status).toBe(201);

    const items = (await t.pg.query<{ id: string; codigo: string }>('SELECT oi.id,e.codigo FROM laboratorio.orden_item oi JOIN laboratorio.examen e ON e.id=oi.examen_id WHERE oi.orden_id=$1', [order.body.id])).rows;
    const normal: Record<string, number> = { HB: 14, HTO: 42, LEU: 7, PLQ: 250 };
    // Completar exige todos los valores (el mensaje lo muestra la web antes de intentarlo).
    const partial = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: items[0].id, value: normal[items[0].codigo] ?? 10 });
    expect(partial.status).toBe(201);
    expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/completar`, { version: partial.body.orderVersion })).status).toBe(409);
    let version = partial.body.orderVersion as number;
    for (const item of items.slice(1)) {
      const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/resultados`, { orderItemId: item.id, value: normal[item.codigo] ?? 10 });
      expect(saved.status).toBe(201);
      version = saved.body.orderVersion;
    }
    const completed = await t.call('LAB', 'POST', `/laboratorio/ordenes/${order.body.id}/completar`, { version });
    expect(completed.status).toBe(201);

    // Completada pero sin revisar: el paciente ve el estado, no los valores.
    const before = (await t.call('PAC', 'GET', '/me/laboratorio')).body.find((o: any) => o.id === order.body.id);
    expect(before.state).toBe('completado');
    expect(before.reviewedAt).toBeNull();
    expect(before.items.every((i: any) => i.result === null)).toBe(true);
    // MED ve la orden como pendiente de revisar.
    const medView = (await t.call('MED', 'GET', '/laboratorio/ordenes')).body.find((o: any) => o.id === order.body.id);
    expect(medView.state).toBe('completado');
    expect(medView.reviewedAt).toBeNull();

    expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${order.body.id}/revisar`, { version: completed.body.version })).status).toBe(201);
    const after = (await t.call('PAC', 'GET', '/me/laboratorio')).body.find((o: any) => o.id === order.body.id);
    expect(after.reviewedAt).not.toBeNull();
    expect(after.items.every((i: any) => i.result && i.result.mark)).toBe(true);
  });
});
