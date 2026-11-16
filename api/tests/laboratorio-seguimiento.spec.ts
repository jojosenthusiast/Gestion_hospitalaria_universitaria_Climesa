import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';

jest.setTimeout(300000);
const MINUTE = 60_000;
const now = new Date(Math.floor(Date.now() / (20 * MINUTE)) * 20 * MINUTE);

const ATTACHMENT = { fileName: 'radiografia-torax.pdf', mimeType: 'application/pdf', sizeBytes: 182_000, sha256: 'a'.repeat(64) };

/**
 * Fase 2, flujo C (S10): resultado crítico u observación relevante -> pendiente del médico ("Resultados por revisar"),
 * orden externa con instrucciones y resultado con adjunto + valores clave, y propuesta de cita de seguimiento que
 * recepción confirma.
 */
describe('Laboratorio · seguimiento, orden externa y cita propuesta (S10)', () => {
  let t: TestApp;
  let hb: string;

  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    hb = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'")).id;
  });
  afterAll(async () => { await t?.close(); });

  async function order(state: 'pendiente' | 'en_proceso') {
    const name = `Seg${Math.random().toString(36).slice(2, 8)}`;
    const patientId = await t.patient({ name, linkPac: true });
    const consultation = await t.consultation(patientId);
    const created = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hb] });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    const item = (await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [id])).id;
    let version = created.body.version as number;
    if (state === 'en_proceso') {
      const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
      version = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/muestra`, { version, expediente: record, nombreCompleto: `${name} Ficticio` })).body.version;
    }
    return { id, item, patientId, version };
  }
  const inbox = async (role = 'MED') => (await t.call(role, 'GET', '/laboratorio/pendientes')).body as any[];
  const proposals = async () => (await t.call('REC', 'GET', '/laboratorio/seguimientos')).body as any[];
  const listed = async (role: string, id: string) => ((await t.call(role, 'GET', '/laboratorio/ordenes')).body as any[]).find(o => o.id === id);

  test('las tablas nuevas tienen RLS con la política api_sghu, como sus hermanas', async () => {
    const tables = ['adjunto', 'pendiente_medico', 'propuesta_cita'];
    const rls = await t.pg.query<{ relname: string; relrowsecurity: boolean }>(
      "SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='laboratorio' AND c.relname = ANY($1) ORDER BY c.relname", [tables]);
    expect(rls.rows).toEqual(tables.map(relname => ({ relname, relrowsecurity: true })));
    const policies = await t.pg.query<{ tablename: string }>("SELECT tablename FROM pg_policies WHERE schemaname='laboratorio' AND policyname='api_sghu' AND tablename = ANY($1) ORDER BY tablename", [tables]);
    expect(policies.rows.map(r => r.tablename)).toEqual(tables);
    for (const table of tables) {
      await expect(t.pg.transaction(async tx => { await tx.exec('SET LOCAL ROLE authenticated'); await tx.query(`SELECT * FROM laboratorio.${table}`); })).rejects.toThrow();
    }
  });

  describe('pendiente del médico', () => {
    test('un valor crítico sigue avisando solo al médico que pidió y al laboratorio (comportamiento existente)', async () => {
      const o = await order('en_proceso');
      const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 5.1, version: o.version });
      expect([saved.status, saved.body.marca]).toEqual([201, 'critico_bajo']);
      const critical = (await t.events('laboratorio.critico', o.id)).at(-1);
      expect(critical).toEqual(expect.arrayContaining([`usuario:${userId('MED')}`, 'rol:LAB']));
      for (const channel of ['rol:MED', 'rol:ENF', 'rol:REC', `usuario:${userId('PAC')}`]) expect(critical).not.toContain(channel);
    });

    test('un valor crítico crea un pendiente en "Resultados por revisar" del médico que pidió la orden', async () => {
      const o = await order('en_proceso');
      await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 5.1, version: o.version });
      const item = (await inbox()).find(p => p.orderId === o.id);
      expect(item).toMatchObject({ reason: 'critico', state: 'pendiente', patientId: o.patientId, orderState: 'en_proceso' });
      expect(item.detail).toContain('Hemoglobina');
      expect(item.detail).toContain('Crítico bajo');
    });

    test('una observación relevante sin valor crítico crea el pendiente y avisa al médico sin aviso crítico', async () => {
      const o = await order('en_proceso');
      const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13.4, version: o.version, observation: 'Muestra levemente hemolizada; repetir si hay duda clínica.', relevant: true });
      expect([saved.status, saved.body.marca]).toEqual([201, 'normal']);
      const item = (await inbox()).find(p => p.orderId === o.id);
      expect(item).toMatchObject({ reason: 'observacion', state: 'pendiente' });
      expect(item.detail).toContain('hemolizada');
      expect(await t.events('laboratorio.critico', o.id)).toEqual([]);
      expect((await t.events('laboratorio.actualizado', o.id)).at(-1)).toEqual(expect.arrayContaining([`usuario:${userId('MED')}`]));
      const listedResult = (await listed('MED', o.id)).items[0].result;
      expect([listedResult.observation, listedResult.relevant]).toEqual(['Muestra levemente hemolizada; repetir si hay duda clínica.', true]);
    });

    test('el paciente no recibe la observación del laboratorio ni la marca de relevante, tampoco con la orden revisada', async () => {
      const o = await order('en_proceso');
      const saved = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13.4, version: o.version, observation: 'Nota interna para el médico tratante.', relevant: true });
      const done = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/completar`, { version: saved.body.orderVersion });
      expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/revisar`, { version: done.body.version })).status).toBe(201);
      const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(x => x.id === o.id);
      expect(mine.items[0].result).toMatchObject({ value: 13.4, mark: 'normal' });
      expect(Object.keys(mine.items[0].result)).not.toEqual(expect.arrayContaining(['observation']));
      expect(Object.keys(mine.items[0].result)).not.toEqual(expect.arrayContaining(['relevant']));
      const detail = await t.call('PAC', 'GET', `/laboratorio/ordenes/${o.id}`);
      expect(detail.body.items[0].result).toMatchObject({ value: 13.4 });
      expect(detail.body.items[0].result).not.toHaveProperty('observation');
      expect(detail.body.items[0].result).not.toHaveProperty('relevant');
      expect(JSON.stringify(detail.body)).not.toContain('Nota interna');
      // The doctor still reads it.
      expect((await listed('MED', o.id)).items[0].result.observation).toBe('Nota interna para el médico tratante.');
    });

    test('un valor normal sin observación relevante no crea pendiente', async () => {
      const o = await order('en_proceso');
      await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13.4, version: o.version, observation: 'Sin novedad', relevant: false });
      expect((await inbox()).some(p => p.orderId === o.id)).toBe(false);
    });

    test('una observación relevante vacía se rechaza', async () => {
      const o = await order('en_proceso');
      const bad = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13.4, version: o.version, relevant: true });
      expect([bad.status, bad.body.codigo]).toEqual([400, 'validacion']);
    });

    test('el médico marca el pendiente revisado con su versión; sale de la bandeja y queda auditado', async () => {
      const o = await order('en_proceso');
      await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 5.1, version: o.version });
      const item = (await inbox()).find(p => p.orderId === o.id);
      const stale = await t.call('MED', 'POST', `/laboratorio/pendientes/${item.id}/revisar`, { version: item.version + 1 });
      expect([stale.status, stale.body.codigo]).toEqual([409, 'version_conflicto']);
      const done = await t.call('MED', 'POST', `/laboratorio/pendientes/${item.id}/revisar`, { version: item.version });
      expect([done.status, done.body.state]).toEqual([201, 'revisado']);
      expect((await inbox()).some(p => p.orderId === o.id)).toBe(false);
      expect((await t.audits('laboratorio.pendiente_revisado')).at(-1)?.paciente_id).toBe(o.patientId);
      const again = await t.call('MED', 'POST', `/laboratorio/pendientes/${item.id}/revisar`, { version: done.body.version });
      expect(again.status).toBe(409);
    });

    test('un segundo hallazgo de la misma orden actualiza el pendiente abierto en vez de duplicarlo', async () => {
      const o = await order('en_proceso');
      const first = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13.4, version: o.version, observation: 'Lipemia moderada en la muestra.', relevant: true });
      await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 5.1, version: first.body.orderVersion, reason: 'Recalibración del equipo' });
      const items = (await inbox()).filter(p => p.orderId === o.id);
      expect(items).toHaveLength(1);
      expect(items[0].reason).toBe('critico');
    });

    test('solo un médico revisor abre la bandeja; el laboratorio no', async () => {
      expect((await t.call('LAB', 'GET', '/laboratorio/pendientes')).status).toBe(403);
      expect((await t.call('REC', 'GET', '/laboratorio/pendientes')).status).toBe(403);
    });
  });

  describe('orden externa', () => {
    test('el laboratorio envía una orden pendiente a externo; el paciente ve dónde y qué hacer', async () => {
      const o = await order('pendiente');
      expect((await listed('LAB', o.id)).externalActions).toEqual(['enviar_externo']);
      const short = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Hospital Ficticio', instructions: 'Ir' });
      expect(short.status).toBe(400);
      const sent = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Clínica Radiológica Ficticia', instructions: 'Presente esta orden en ventanilla. Sin ayuno. Traiga su DUI.' });
      expect([sent.status, sent.body.external]).toEqual([201, true]);
      const lab = await listed('LAB', o.id);
      expect([lab.external, lab.allowedActions, lab.externalActions]).toEqual([true, ['cancelar'], ['cargar_externo']]);
      const mine = ((await t.call('PAC', 'GET', '/me/laboratorio')).body as any[]).find(x => x.id === o.id);
      expect([mine.external, mine.externalPlace, mine.externalInstructions]).toEqual([true, 'Clínica Radiológica Ficticia', 'Presente esta orden en ventanilla. Sin ayuno. Traiga su DUI.']);
      expect((await t.events('laboratorio.actualizado', o.id)).at(-1)).toEqual(expect.arrayContaining([`usuario:${userId('PAC')}`]));
      const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/muestra`, { version: sent.body.version, expediente: 'x', nombreCompleto: 'y' });
      expect(sample.status).toBe(409);
    });

    test('el médico que pidió la orden también puede enviarla a externo; otro rol no', async () => {
      const o = await order('pendiente');
      expect((await listed('MED', o.id)).externalActions).toEqual(['enviar_externo']);
      expect((await t.call('REC', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Clínica Ficticia', instructions: 'Instrucciones de prueba suficientes.' })).status).toBe(403);
      const sent = await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Clínica Ficticia', instructions: 'Instrucciones de prueba suficientes.' });
      expect(sent.status).toBe(201);
    });

    test('la orden puede nacer externa desde la consulta', async () => {
      const patientId = await t.patient({ linkPac: false });
      const consultation = await t.consultation(patientId);
      const created = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hb], external: { place: 'Laboratorio Ficticio Externo', instructions: 'Acuda en ayunas de 8 horas por la mañana.' } });
      expect(created.status).toBe(201);
      const row = await t.one('SELECT externa,lugar_externo FROM laboratorio.orden WHERE id=$1', [created.body.id]);
      expect(row).toEqual({ externa: true, lugar_externo: 'Laboratorio Ficticio Externo' });
    });

    test('el resultado externo entra con adjunto y valores clave, completa la orden y queda en el expediente', async () => {
      const o = await order('pendiente');
      const sent = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Clínica Ficticia', instructions: 'Instrucciones de prueba suficientes.' });
      const badType = await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/resultado-externo`, { version: sent.body.version, attachment: { ...ATTACHMENT, mimeType: 'application/zip' }, results: [{ orderItemId: o.item, value: 12.9 }] });
      expect(badType.status).toBe(400);
      const missing = await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/resultado-externo`, { version: sent.body.version, attachment: ATTACHMENT, results: [] });
      expect(missing.status).toBe(400);
      const loaded = await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/resultado-externo`, { version: sent.body.version, attachment: ATTACHMENT, results: [{ orderItemId: o.item, value: 12.9 }], note: 'Informe firmado por el laboratorio externo.' });
      expect([loaded.status, loaded.body.state]).toEqual([201, 'completado']);
      const detail = await t.call('MED', 'GET', `/laboratorio/ordenes/${o.id}`);
      expect(detail.body.items[0].result).toMatchObject({ value: 12.9, mark: 'normal' });
      expect(detail.body.attachments).toEqual([expect.objectContaining({ fileName: 'radiografia-torax.pdf', mimeType: 'application/pdf', sizeBytes: 182000, stored: false, note: 'Informe firmado por el laboratorio externo.' })]);
      expect(detail.body.allowedActions).toEqual(['revisar']);
      // Values (and the attachment) stay hidden from the patient until the doctor reviews.
      expect((await t.call('PAC', 'GET', `/laboratorio/ordenes/${o.id}`)).body.attachments).toEqual([]);
      const history = await t.call('MED', 'GET', `/pacientes/${o.patientId}/historial`);
      expect(history.status).toBe(200);
      expect(JSON.stringify(history.body)).toContain(o.id);
    });

    test('el paciente nunca ve el adjunto del resultado externo, tampoco después de la revisión', async () => {
      const o = await order('pendiente');
      const sent = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Clínica Ficticia', instructions: 'Instrucciones de prueba suficientes.' });
      const loaded = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultado-externo`, { version: sent.body.version, attachment: ATTACHMENT, results: [{ orderItemId: o.item, value: 12.9 }], note: 'Nota interna del laboratorio.' });
      expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${o.id}/revisar`, { version: loaded.body.version })).status).toBe(201);
      const mine = await t.call('PAC', 'GET', `/laboratorio/ordenes/${o.id}`);
      expect(mine.status).toBe(200);
      expect(mine.body.reviewedAt).not.toBeNull();
      expect(mine.body.items[0].result).toMatchObject({ value: 12.9 });
      expect(mine.body.attachments).toEqual([]);
      expect(JSON.stringify(mine.body)).not.toMatch(/radiografia-torax|Nota interna|aaaaaaaa/);
    });

    test('cargar resultado externo en una orden que no es externa se rechaza con su código', async () => {
      const o = await order('pendiente');
      const res = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultado-externo`, { version: o.version, attachment: ATTACHMENT, results: [{ orderItemId: o.item, value: 12.9 }] });
      expect([res.status, res.body.codigo]).toEqual([409, 'orden_no_externa']);
    });

    test('un resultado externo crítico abre el pendiente del médico', async () => {
      const o = await order('pendiente');
      const sent = await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/externa`, { version: o.version, place: 'Clínica Ficticia', instructions: 'Instrucciones de prueba suficientes.' });
      await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultado-externo`, { version: sent.body.version, attachment: ATTACHMENT, results: [{ orderItemId: o.item, value: 5.0 }] });
      expect((await inbox()).find(p => p.orderId === o.id)?.reason).toBe('critico');
      expect((await t.events('laboratorio.critico', o.id)).length).toBe(1);
    });
  });

  describe('propuesta de cita de seguimiento', () => {
    async function completed() {
      const o = await order('en_proceso');
      const v = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/resultados`, { orderItemId: o.item, value: 13.1, version: o.version })).body.orderVersion;
      expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${o.id}/completar`, { version: v })).status).toBe(201);
      return o;
    }

    test('al completarse la orden se propone una cita con el médico; recepción la ve sin valores ni exámenes', async () => {
      const o = await completed();
      const found = (await proposals()).filter(p => p.orderId === o.id);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ state: 'propuesta', patientId: o.patientId, doctorId: await t.staffOf('MED') });
      expect(JSON.stringify(found[0])).not.toMatch(/Hemoglobina|13\.1/);
      expect((await t.call('LAB', 'GET', '/laboratorio/seguimientos')).status).toBe(403);
    });

    test('recepción confirma con la cita que agenda; una cita de otro paciente no sirve', async () => {
      const o = await completed();
      const proposal = (await proposals()).find(p => p.orderId === o.id);
      const other = await t.appointment(await t.patient(), new Date(now.valueOf() + 3 * 24 * 60 * MINUTE));
      const wrong = await t.call('REC', 'POST', `/laboratorio/seguimientos/${proposal.id}/confirmar`, { version: proposal.version, appointmentId: other });
      expect([wrong.status, wrong.body.codigo]).toEqual([409, 'cita_no_coincide']);
      const cita = await t.appointment(o.patientId, new Date(now.valueOf() + 4 * 24 * 60 * MINUTE));
      const ok = await t.call('REC', 'POST', `/laboratorio/seguimientos/${proposal.id}/confirmar`, { version: proposal.version, appointmentId: cita });
      expect([ok.status, ok.body.state, ok.body.appointmentId]).toEqual([201, 'confirmada', cita]);
      expect((await proposals()).some(p => p.id === proposal.id)).toBe(false);
      const twice = await t.call('REC', 'POST', `/laboratorio/seguimientos/${proposal.id}/descartar`, { version: ok.body.version, reason: 'Ya no hace falta la cita.' });
      expect([twice.status, twice.body.codigo]).toEqual([409, 'propuesta_resuelta']);
    });

    test('una cita ya enlazada a otra propuesta no se puede enlazar otra vez', async () => {
      const name = `Dup${Math.random().toString(36).slice(2, 8)}`;
      const patientId = await t.patient({ name, linkPac: true });
      const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [patientId])).expediente;
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const consultation = await t.consultation(patientId);
        const created = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: consultation.id, exams: [hb] });
        const id = created.body.id as string;
        const item = (await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [id])).id;
        const v1 = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/muestra`, { version: created.body.version, expediente: record, nombreCompleto: `${name} Ficticio` })).body.version;
        const v2 = (await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/resultados`, { orderItemId: item, value: 13.1, version: v1 })).body.orderVersion;
        expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${id}/completar`, { version: v2 })).status).toBe(201);
        ids.push(id);
      }
      const [first, second] = await Promise.all(ids.map(async id => (await proposals()).find(p => p.orderId === id)));
      const cita = await t.appointment(patientId, new Date(now.valueOf() + 5 * 24 * 60 * MINUTE));
      expect((await t.call('REC', 'POST', `/laboratorio/seguimientos/${first.id}/confirmar`, { version: first.version, appointmentId: cita })).status).toBe(201);
      const again = await t.call('REC', 'POST', `/laboratorio/seguimientos/${second.id}/confirmar`, { version: second.version, appointmentId: cita });
      expect([again.status, again.body.codigo]).toEqual([409, 'cita_no_coincide']);
      expect((await proposals()).find(p => p.id === second.id)?.state).toBe('propuesta');
    });

    test('recepción descarta la propuesta con motivo', async () => {
      const o = await completed();
      const proposal = (await proposals()).find(p => p.orderId === o.id);
      expect((await t.call('REC', 'POST', `/laboratorio/seguimientos/${proposal.id}/descartar`, { version: proposal.version, reason: 'corto' })).status).toBe(400);
      const ok = await t.call('REC', 'POST', `/laboratorio/seguimientos/${proposal.id}/descartar`, { version: proposal.version, reason: 'El paciente ya tiene control agendado.' });
      expect([ok.status, ok.body.state]).toEqual([201, 'descartada']);
    });
  });
});
