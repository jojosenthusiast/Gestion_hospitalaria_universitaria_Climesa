import { createHash } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(300000);
const MINUTE = 60_000;
const now = new Date(Math.floor(Date.now() / (20 * MINUTE)) * 20 * MINUTE);

/**
 * Auditoría final, laboratorio (MA-LAB-01 a MA-LAB-06): cola sin perder pendientes y captura con versión obligatoria,
 * enmienda de resultados completados, revisión por tratante o médico de turno, aviso de valor crítico al médico,
 * acciones por orden (`allowedActions`), detalle de orden y edición del catálogo.
 */
describe('Laboratorio · auditoría final (MA-LAB-01..06)', () => {
  let t: TestApp;
  let hb: string;

  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    hb = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'")).id;
  });
  afterAll(async () => { await t?.close(); });

  /** An order of one hemoglobin, taken to the requested state through the API. */
  async function order(state: 'pendiente' | 'en_proceso' | 'completado' | 'revisada', value = 13.2) {
    const name = `Lab${Math.random().toString(36).slice(2, 8)}`;
    const patientId = await t.patient({ name, linkPac: true });
    const consultation = await t.consultation(patientId);
    const created = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hb] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const item = (await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [id])).id;
    let version = created.body.version as number;
    if (state !== 'pendiente') {
      const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
      version = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/muestra`, { version, expediente: record, nombreCompleto: `${name} Ficticio` })).body.version;
    }
    if (state === 'completado' || state === 'revisada') {
      version = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/resultados`, { orderItemId: item, value, version })).body.orderVersion;
      version = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/completar`, { version })).body.version;
    }
    if (state === 'revisada') version = (await t.call('MED', 'POST', `/laboratorio/ordenes/${id}/revisar`, { version })).body.version;
    return { id, item, patientId, version };
  }
  const listed = async (role: string, id: string) => ((await t.call(role, 'GET', '/laboratorio/ordenes')).body as any[]).find(o => o.id === id);
  /** Shift of `staffId` covering the test clock in the area `code`, inserted without triggers. */
  const shiftIn = (staffId: string, code: string) => t.pg.transaction(async tx => {
    await tx.exec('SET LOCAL session_replication_role = replica');
    await tx.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange($2::timestamptz,$3::timestamptz,'[)'),'diurno','en_curso' FROM infra.espacio WHERE codigo=$4`, [staffId, new Date(now.valueOf() - 60 * MINUTE), new Date(now.valueOf() + 5 * 60 * MINUTE), code]);
  });
  const clearShifts = async (role: string) => t.pg.query('DELETE FROM personal.turno WHERE persona_id=$1 AND periodo @> $2::timestamptz', [await t.staffOf(role), now]);

  describe('MA-LAB-01 cola y captura', () => {
    test('una pendiente antigua sigue en la cola aunque haya más de 300 órdenes cerradas más recientes', async () => {
      const old = await order('pendiente');
      await t.pg.query("UPDATE laboratorio.orden SET creada_en=$2 WHERE id=$1", [old.id, new Date(now.valueOf() - 90 * 24 * 60 * MINUTE)]);
      await t.pg.query(`INSERT INTO laboratorio.orden(consulta_id,paciente_id,medico_id,estado,completada_en,revisada_en,creada_en)
        SELECT gen_random_uuid(),$1,$2,'completado',$3::timestamptz,$3::timestamptz,$3::timestamptz - (g * interval '1 minute') FROM generate_series(1,305) g`, [old.patientId, await t.staffOf('MED'), now]);
      const queue = (await t.call('LAB', 'GET', '/laboratorio/ordenes')).body as any[];
      expect(queue.some(o => o.id === old.id)).toBe(true);
      expect(queue.filter(o => o.state === 'completado' && o.reviewedAt).length).toBeLessThanOrEqual(300);
      await t.pg.query("DELETE FROM laboratorio.orden WHERE paciente_id=$1 AND estado='completado' AND NOT EXISTS (SELECT 1 FROM laboratorio.orden_item i WHERE i.orden_id=laboratorio.orden.id)", [old.patientId]);
    });

    test('la cola del laboratorio no carga las completadas por revisar más allá del tope; el médico sí las ve', async () => {
      const waiting = await order('completado');
      await t.pg.query('UPDATE laboratorio.orden SET creada_en=$2 WHERE id=$1', [waiting.id, new Date(now.valueOf() - 90 * 24 * 60 * MINUTE)]);
      await t.pg.query(`INSERT INTO laboratorio.orden(consulta_id,paciente_id,medico_id,estado,completada_en,revisada_en,creada_en)
        SELECT gen_random_uuid(),$1,$2,'completado',$3::timestamptz,$3::timestamptz,$3::timestamptz - (g * interval '1 minute') FROM generate_series(1,305) g`, [waiting.patientId, await t.staffOf('MED'), now]);
      const pending = await order('pendiente');
      const queue = (await t.call('LAB', 'GET', '/laboratorio/ordenes')).body as any[];
      expect(queue.some(o => o.id === pending.id)).toBe(true);
      expect(queue.some(o => o.id === waiting.id)).toBe(false);
      expect(queue.filter(o => o.state === 'completado').length).toBeLessThanOrEqual(300);
      expect((await listed('MED', waiting.id))?.allowedActions).toEqual(['revisar']);
      const reads = await t.one<{ n: number }>("SELECT count(*)::int AS n FROM plataforma.auditoria WHERE accion='laboratorio.leer' AND entidad_id=$1", [pending.id]);
      expect(reads.n).toBeGreaterThan(0);
      await t.pg.query("DELETE FROM laboratorio.orden WHERE paciente_id=$1 AND estado='completado' AND NOT EXISTS (SELECT 1 FROM laboratorio.orden_item i WHERE i.orden_id=laboratorio.orden.id)", [waiting.patientId]);
    });

    test('la lectura en lote deja la cadena de auditoría íntegra', async () => {
      await order('pendiente');
      await order('pendiente');
      await t.call('LAB', 'GET', '/laboratorio/ordenes');
      const rows = (await t.pg.query<{ ok: boolean }>(`SELECT hash_previo = lag(hash) OVER (ORDER BY seq) AS ok FROM plataforma.auditoria ORDER BY seq`)).rows.slice(1);
      expect(rows.every(r => r.ok)).toBe(true);
      const reads = (await t.pg.query<{ hash_previo: Buffer; hash: Buffer; detalle: any }>("SELECT hash_previo,hash,detalle FROM plataforma.auditoria WHERE accion='laboratorio.leer' ORDER BY seq DESC LIMIT 2")).rows;
      expect(reads).toHaveLength(2);
      for (const r of reads) expect(createHash('sha256').update(r.hash_previo).update(r.detalle.canonicalEvent).digest().equals(r.hash)).toBe(true);
    });

    test('capturar sin versión se rechaza', async () => {
      const o = await order('en_proceso');
      const missing = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13 });
      expect([missing.status, missing.body.codigo]).toEqual([400, 'validacion']);
    });

    test('allowedActions guía cada paso según quién lee', async () => {
      const o = await order('pendiente');
      expect((await listed('LAB', o.id)).allowedActions).toEqual(['tomar_muestra', 'cancelar']);
      expect((await listed('MED', o.id)).allowedActions).toEqual(['cancelar']);
      const done = await order('completado');
      expect((await listed('LAB', done.id)).allowedActions).toEqual(['enmendar']);
      expect((await listed('MED', done.id)).allowedActions).toEqual(['revisar']);
    });

    test('MA-LAB-05: el médico cancela su propia orden con motivo', async () => {
      const o = await order('pendiente');
      const cancelled = await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/cancelar`, { version: o.version, reason: 'Orden duplicada por error' });
      expect([cancelled.status, cancelled.body.state]).toEqual([201, 'cancelado']);
      const detail = await t.call('MED', 'GET', `/laboratorio/ordenes/${o.id}`);
      expect([detail.status, detail.body.cancellationReason, detail.body.allowedActions]).toEqual([200, 'Orden duplicada por error', []]);
    });
  });

  describe('MA-LAB-02 enmienda', () => {
    test('enmendar un resultado liberado conserva el anterior, vuelve a revisión y avisa al paciente', async () => {
      const o = await order('revisada');
      const short = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/enmendar`, { orderItemId: o.item, version: o.version, value: 12.1, reason: 'Error' });
      expect(short.status).toBe(400);
      const stale = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/enmendar`, { orderItemId: o.item, version: o.version - 1, value: 12.1, reason: 'Error de digitación en la hemoglobina' });
      expect([stale.status, stale.body.codigo]).toEqual([409, 'version_conflicto']);
      const amended = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/enmendar`, { orderItemId: o.item, version: o.version, value: 12.1, reason: 'Error de digitación en la hemoglobina' });
      expect([amended.status, amended.body.version, amended.body.orderVersion]).toEqual([201, 2, o.version + 1]);
      const row = await t.one('SELECT estado,revisada_en,enmendada_en FROM laboratorio.orden WHERE id=$1', [o.id]);
      expect([row.estado, row.revisada_en, !!row.enmendada_en]).toEqual(['completado', null, true]);
      const history = await t.one('SELECT valor::float8 AS valor,motivo FROM laboratorio.resultado_historial WHERE orden_item_id=$1', [o.item]);
      expect(history).toEqual({ valor: 13.2, motivo: 'Error de digitación en la hemoglobina' });
      const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(x => x.id === o.id);
      expect([mine.reviewedAt, mine.items[0].result, !!mine.amendedAt]).toEqual([null, null, true]);
      const channels = (await t.events('laboratorio.actualizado', o.id)).at(-1);
      expect(channels).toEqual(expect.arrayContaining([`usuario:${userId('PAC')}`, `usuario:${userId('MED')}`]));
      const detail = await t.call('MED', 'GET', `/laboratorio/ordenes/${o.id}`);
      expect([detail.body.history.length, detail.body.history[0].value, detail.body.allowedActions]).toEqual([1, 13.2, ['revisar']]);
      expect((await t.call('PAC', 'GET', `/laboratorio/ordenes/${o.id}`)).body.history).toEqual([]);
      expect((await t.audits('laboratorio.resultado_enmendado')).at(-1)?.detalle).toMatchObject({ wasReleased: true });
      expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/revisar`, { version: amended.body.orderVersion })).status).toBe(201);
    });

    test('una enmienda crítica de un resultado liberado no lleva el aviso crítico al paciente', async () => {
      const o = await order('revisada');
      const amended = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/enmendar`, { orderItemId: o.item, version: o.version, value: 5.1, reason: 'Repetición confirma valor crítico' });
      expect([amended.status, amended.body.marca]).toEqual([201, 'critico_bajo']);
      const critical = (await t.events('laboratorio.critico', o.id)).at(-1);
      expect(critical).toEqual(expect.arrayContaining([`usuario:${userId('MED')}`, 'rol:LAB']));
      expect(critical).not.toContain(`usuario:${userId('PAC')}`);
      expect(critical).not.toContain('rol:PAC');
      expect((await t.events('laboratorio.actualizado', o.id)).at(-1)).toContain(`usuario:${userId('PAC')}`);
    });

    test('una orden en proceso no se enmienda: se corrige en la captura', async () => {
      const o = await order('en_proceso');
      const res = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/enmendar`, { orderItemId: o.item, version: o.version, value: 12, reason: 'Corrección de un valor capturado' });
      expect(res.status).toBe(409);
    });
  });

  describe('MA-LAB-03 quién revisa', () => {
    async function absentDoctor(o: { id: string; patientId: string }) {
      const other = (await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Solicitante','Ausente','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`)).id;
      await t.pg.query('UPDATE laboratorio.orden SET medico_id=$2 WHERE id=$1', [o.id, other]);
      await t.pg.query('DELETE FROM atencion.relacion_atencion WHERE paciente_id=$1', [o.patientId]);
      return other;
    }

    test('un médico de turno de otra área no ve ni revisa; uno del área, solo pasado el plazo sin revisión', async () => {
      const o = await order('completado');
      await absentDoctor(o);
      await t.pg.query(`UPDATE atencion.consulta SET consultorio_id=(SELECT id FROM infra.espacio WHERE codigo='C-101') WHERE id=(SELECT consulta_id FROM laboratorio.orden WHERE id=$1)`, [o.id]);
      await clearShifts('MED');
      const version = (await t.one<{ version: number }>('SELECT version FROM laboratorio.orden WHERE id=$1', [o.id])).version;
      const review = () => t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/revisar`, { version });
      // On duty, but in another area: neither the order nor its values, even after the grace period.
      await t.pg.query("UPDATE laboratorio.orden SET completada_en=$2 WHERE id=$1", [o.id, new Date(now.valueOf() - 3 * 60 * MINUTE)]);
      await shiftIn(await t.staffOf('MED'), 'P1-EMG');
      expect(await listed('MED', o.id)).toBeUndefined();
      expect((await review()).status).toBe(403);
      // On duty in the order's area, before the grace period (2 hours by policy).
      await clearShifts('MED');
      await shiftIn(await t.staffOf('MED'), 'P1-CON');
      await t.pg.query("UPDATE laboratorio.orden SET completada_en=$2 WHERE id=$1", [o.id, new Date(now.valueOf() - 60 * MINUTE)]);
      expect(await listed('MED', o.id)).toBeUndefined();
      expect((await review()).status).toBe(403);
      // Past the grace period.
      await t.pg.query("UPDATE laboratorio.orden SET completada_en=$2 WHERE id=$1", [o.id, new Date(now.valueOf() - 3 * 60 * MINUTE)]);
      const seen = await listed('MED', o.id);
      expect([seen?.allowedActions, seen?.items[0].result?.value]).toEqual([['revisar'], 13.2]);
      const reviewed = await review();
      expect(reviewed.status).toBe(201);
      expect((await t.audits('laboratorio.revisar')).at(-1)?.detalle).toMatchObject({ substitute: true });
      await clearShifts('MED');
    });

    test('enfermería con relación de atención no ve valores sin liberar ni revisa', async () => {
      const o = await order('completado');
      const nurse = await t.staffOf('ENF');
      await t.pg.query(`INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia) VALUES($1,$2,'consulta',gen_random_uuid(),tstzrange($3::timestamptz - interval '1 day',$3::timestamptz + interval '1 day'))`, [o.patientId, nurse, now]);
      expect(await listed('ENF', o.id)).toBeUndefined();
      expect((await t.one<{ ok: boolean }>('SELECT laboratorio.puede_revisar($1,$2,$3) AS ok', [o.id, nurse, now])).ok).toBe(false);
    });

    test('el tratante de la admisión activa revisa aunque no haya pedido la orden', async () => {
      const o = await order('completado');
      await absentDoctor(o);
      await t.pg.query("DELETE FROM personal.turno WHERE persona_id=$1 AND periodo @> $2::timestamptz", [await t.staffOf('MED'), now]);
      const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(o.patientId, { requestedCategory: 'semiprivada', isolation: false }));
      expect(created.status).toBe(201);
      await t.pg.query('DELETE FROM atencion.relacion_atencion WHERE paciente_id=$1', [o.patientId]);
      await t.pg.query("DELETE FROM personal.turno WHERE persona_id=$1 AND periodo @> $2::timestamptz", [await t.staffOf('MED'), now]);
      const version = (await t.one<{ version: number }>('SELECT version FROM laboratorio.orden WHERE id=$1', [o.id])).version;
      expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/revisar`, { version })).status).toBe(201);
    });
  });

  test('MA-LAB-04: un valor crítico llega solo al canal propio del médico que pidió la orden y al laboratorio', async () => {
    const o = await order('en_proceso');
    const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 5.1, version: o.version });
    expect([saved.status, saved.body.marca]).toEqual([201, 'critico_bajo']);
    const critical = (await t.events('laboratorio.critico', o.id)).at(-1);
    expect(critical).toEqual(expect.arrayContaining([`usuario:${userId('MED')}`, 'rol:LAB']));
    for (const channel of ['rol:MED', 'rol:ENF', `usuario:${userId('PAC')}`]) expect(critical).not.toContain(channel);
    expect((await t.events('laboratorio.actualizado', o.id)).at(-1)).toEqual(expect.arrayContaining(['rol:MED', 'rol:LAB']));
  });

  describe('MA-LAB-06 catálogo', () => {
    test('ADM ve el catálogo completo y edita los rangos por vigencia', async () => {
      const exams = (await t.call('ADM', 'GET', '/catalogo/examenes')).body as any[];
      const glu = exams.find(e => e.code === 'GLU');
      expect([glu.active, glu.ranges.length, glu.ranges[0].min]).toEqual([true, 1, 70]);
      expect((await t.call('MED', 'GET', '/catalogo/examenes')).status).toBe(403);
      const path = `/catalogo/examenes/${glu.id}`;
      const range = { sex: 'cualquiera', ageFrom: 18, ageTo: 120, min: 70, max: 99, criticalLow: 40, criticalHigh: 400, source: 'Guía interna ficticia' };
      expect((await t.call('ADM', 'PUT', path, { version: glu.version + 1, ranges: [range] })).body.codigo).toBe('version_conflicto');
      expect((await t.call('ADM', 'PUT', path, { version: glu.version, ranges: [range, { ...range, ageFrom: 60 }] })).status).toBe(400);
      const saved = await t.call('ADM', 'PUT', path, { version: glu.version, name: 'Glucosa en ayunas', ranges: [range] });
      expect([saved.status, saved.body.name, saved.body.version, saved.body.ranges.map((r: any) => r.max)]).toEqual([200, 'Glucosa en ayunas', glu.version + 1, [99]]);
      const all = await t.one('SELECT count(*)::int AS n, count(*) FILTER (WHERE upper(vigencia) IS NOT NULL)::int AS cerrados FROM laboratorio.rango_referencia WHERE examen_id=$1 AND NOT isempty(vigencia)', [glu.id]);
      expect(all).toEqual({ n: 2, cerrados: 1 });
    });

    test('la unidad no cambia si el examen ya tiene resultados', async () => {
      await order('completado');
      const exam = ((await t.call('ADM', 'GET', '/catalogo/examenes')).body as any[]).find(e => e.code === 'HB');
      expect(exam.hasResults).toBe(true);
      const res = await t.call('ADM', 'PUT', `/catalogo/examenes/${exam.id}`, { version: exam.version, unit: 'g/L' });
      expect([res.status, res.body.codigo]).toEqual([409, 'examen_con_resultados']);
      const off = await t.call('ADM', 'PUT', `/catalogo/examenes/${exam.id}`, { version: exam.version, active: false });
      expect([off.status, off.body.active]).toEqual([200, false]);
      await t.call('ADM', 'PUT', `/catalogo/examenes/${exam.id}`, { version: off.body.version, active: true });
    });
  });
});
