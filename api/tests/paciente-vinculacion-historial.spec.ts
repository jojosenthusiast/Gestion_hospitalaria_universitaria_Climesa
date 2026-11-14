import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

/** Fictitious DUI with a valid check digit for the given 8-digit body. */
const dui = (body: string) => body + String((10 - [...body].reduce((sum, c, i) => sum + Number(c) * (9 - i), 0) % 10) % 10);

/** REQ-03, REQ-05: account linking (spec 101), own record and results (102, 107) and clinical history (106). */
describe('vinculación de cuenta e historial clínico (REQ-03, REQ-05)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });
  const unlink = () => t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
  const withDui = async (value: string) => {
    const id = await t.patient({ name: 'Vinculable' });
    await t.pg.query("INSERT INTO pacientes.identificador(paciente_id,tipo,emisor,valor_original,valor_normalizado,exclusivo) VALUES($1,'dui','RNPN',$2,$3,true)", [id, `${value.slice(0, 8)}-${value[8]}`, value]);
    return id;
  };

  describe('vinculación (FR-101-08 a FR-101-11, RN-39)', () => {
    test('sin vincular no ve nada propio; recepción aprueba y la cuenta queda enlazada en vivo', async () => {
      await unlink();
      expect((await t.call('PAC', 'GET', '/me/paciente')).body.codigo).toBe('sin_vinculacion');
      expect((await t.call('PAC', 'GET', '/me/laboratorio')).status).toBe(404);
      const document = dui('10000001');
      const patientId = await withDui(document);
      expect((await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: document.slice(0, 8) + ((Number(document[8]) + 1) % 10), birth: '1990-01-01' })).status).toBe(400);
      expect((await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: document, birth: '2999-01-01' })).status).toBe(400);
      const requested = await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: `${document.slice(0, 8)}-${document[8]}`, birth: '1990-01-01' });
      expect(requested.status).toBe(201);
      expect(requested.body).toEqual(expect.objectContaining({ state: 'pendiente', version: 1 }));
      expect(requested.body).not.toHaveProperty('candidate');
      expect((await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: document, birth: '1990-01-01' })).body.codigo).toBe('vinculacion_pendiente');
      const [channels] = await t.events('vinculacion.solicitada', requested.body.id);
      expect(channels).toEqual(expect.arrayContaining(['rol:REC', `usuario:${userId('PAC')}`]));
      expect(channels).not.toContain('rol:PAC');

      const queue = await t.call('REC', 'GET', '/cuentas/vinculaciones');
      expect(queue.status).toBe(200);
      const row = queue.body.find((r: any) => r.id === requested.body.id);
      expect(row).toEqual(expect.objectContaining({ declared: { dui: `${document.slice(0, 8)}-${document[8]}`, birth: '1990-01-01' }, candidates: 1 }));
      expect(row.candidate).toEqual(expect.objectContaining({ id: patientId, birth: '1990-01-01' }));
      expect((await t.call('PAC', 'GET', '/cuentas/vinculaciones')).status).toBe(403);
      expect((await t.call('PAC', 'POST', `/cuentas/vinculaciones/${row.id}/aprobar`, { version: 1 })).status).toBe(403);

      const stale = await t.call('REC', 'POST', `/cuentas/vinculaciones/${row.id}/aprobar`, { version: 7 });
      expect(stale.status).toBe(409);
      expect(stale.body.versionActual).toBe(1);
      const approved = await t.call('REC', 'POST', `/cuentas/vinculaciones/${row.id}/aprobar`, { version: 1 });
      expect(approved.status).toBe(201);
      expect(approved.body).toEqual(expect.objectContaining({ state: 'aprobada', version: 2 }));
      expect((await t.call('REC', 'POST', `/cuentas/vinculaciones/${row.id}/aprobar`, { version: 2 })).body.codigo).toBe('vinculacion_resuelta');
      const [resolved] = await t.events('vinculacion.resuelta', row.id);
      expect(resolved).toEqual(expect.arrayContaining(['rol:REC', `usuario:${userId('PAC')}`]));
      expect((await t.call('PAC', 'GET', '/auth/me')).body.patientId).toBe(patientId);
      const mine = await t.call('PAC', 'GET', '/me/paciente');
      expect(mine.status).toBe(200);
      expect(mine.body).toEqual(expect.objectContaining({ id: patientId, dui: `${document.slice(0, 8)}-${document[8]}` }));
      expect((await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: document, birth: '1990-01-01' })).body.codigo).toBe('cuenta_ya_vinculada');
      expect((await t.audits('vinculacion.aprobar')).map(a => a.paciente_id)).toContain(patientId);
      // The database keeps a resolved request closed even outside the API.
      await expect(t.pg.query("UPDATE acceso.vinculacion_paciente SET estado='pendiente' WHERE id=$1", [row.id])).rejects.toThrow(/vinculacion_resuelta/);
    });

    test('sin expediente no se aprueba; el rechazo exige motivo y lo conserva para el paciente', async () => {
      await unlink();
      const document = dui('20000002');
      const requested = await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: document, birth: '1985-05-05' });
      expect(requested.status).toBe(201);
      const queued = (await t.call('REC', 'GET', '/cuentas/vinculaciones')).body.find((r: any) => r.id === requested.body.id);
      expect(queued.candidate).toBeNull();
      expect((await t.call('REC', 'POST', `/cuentas/vinculaciones/${requested.body.id}/aprobar`, { version: 1 })).body.codigo).toBe('sin_expediente');
      expect((await t.call('REC', 'POST', `/cuentas/vinculaciones/${requested.body.id}/rechazar`, { version: 1, reason: 'corto' })).status).toBe(400);
      const rejected = await t.call('REC', 'POST', `/cuentas/vinculaciones/${requested.body.id}/rechazar`, { version: 1, reason: 'Los datos no coinciden con ningún expediente' });
      expect(rejected.status).toBe(201);
      expect(rejected.body).toEqual(expect.objectContaining({ state: 'rechazada', rejectionReason: 'Los datos no coinciden con ningún expediente' }));
      expect((await t.call('REC', 'GET', '/cuentas/vinculaciones')).body.map((r: any) => r.id)).not.toContain(requested.body.id);
      await expect(t.pg.query("UPDATE acceso.vinculacion_paciente SET estado='aprobada', paciente_candidato_id=gen_random_uuid(), verificado_por=$2, resuelto_en=now() WHERE id=$1", [requested.body.id, userId('REC')])).rejects.toThrow(/vinculacion_resuelta/);
      // After rejection the patient may ask again.
      expect((await t.call('PAC', 'POST', '/cuentas/vinculacion', { dui: document, birth: '1985-05-05' })).status).toBe(201);
    });
  });

  describe('historial clínico (FR-106-09, FR-106-10, FR-106-12) y mis exámenes (FR-107-10, FR-107-11)', () => {
    let own: string;
    let signed: string;
    let draft: string;
    let orderId: string;
    beforeAll(async () => {
      await unlink();
      await t.pg.query("UPDATE acceso.vinculacion_paciente SET estado='rechazada', motivo_rechazo='Cierre de prueba ficticia', verificado_por=$2, resuelto_en=now() WHERE usuario_id=$1 AND estado='pendiente'", [userId('PAC'), userId('REC')]);
      own = await t.patient({ linkPac: true, name: 'Historial' });
      const first = await t.consultation(own);
      expect((await t.call('MED', 'POST', `/consultas/${first.id}/diagnosticos`, { code: 'J06.9', principal: true })).status).toBe(201);
      expect((await t.call('MED', 'POST', `/consultas/${first.id}/receta`, { items: [{ medication: 'Paracetamol 500 mg', dose: '1 tableta', route: 'oral', frequency: 'cada 8 horas', duration: '3 días' }] })).status).toBe(201);
      const edited = await t.call('MED', 'PATCH', `/consultas/${first.id}`, { version: first.version, reason: 'Fiebre', physicalExam: 'Sin hallazgos', plan: 'Control' });
      const exam = await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='HB'");
      const order = await t.call('MED', 'POST', '/laboratorio/ordenes', { consultationId: first.id, exams: [exam.id] });
      expect(order.status).toBe(201);
      orderId = order.body.id;
      expect((await t.call('MED', 'POST', `/consultas/${first.id}/firmar`, { version: edited.body.version })).status).toBe(201);
      signed = first.id;
      draft = (await t.consultation(own)).id;
    });

    test('el paciente ve solo sus consultas firmadas y el estado de sus órdenes sin valores hasta la revisión', async () => {
      const history = await t.call('PAC', 'GET', `/pacientes/${own}/historial`);
      expect(history.status).toBe(200);
      expect(history.body.access).toBe('propio');
      expect(history.body.consultations.map((k: any) => k.id)).toEqual([signed]);
      expect(history.body.consultations[0]).toEqual(expect.objectContaining({ state: 'firmada', diagnoses: [expect.objectContaining({ code: 'J06.9', principal: true })] }));
      expect(history.body.consultations[0].prescriptions[0].items).toHaveLength(1);
      expect(history.body.admissions).toEqual([]);
      expect((await t.audits('expediente.leer')).some(a => a.paciente_id === own && a.detalle.access === 'propio')).toBe(true);

      const record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [own])).expediente;
      const created = await t.one<{ version: number }>('SELECT version FROM laboratorio.orden WHERE id=$1', [orderId]);
      const sample = await t.call('LAB', 'POST', `/laboratorio/ordenes/${orderId}/muestra`, { version: created.version, expediente: record, nombreCompleto: 'Historial Ficticio' });
      expect(sample.status).toBe(201);
      const item = await t.one<{ id: string }>('SELECT id FROM laboratorio.orden_item WHERE orden_id=$1', [orderId]);
      expect((await t.call('LAB', 'POST', `/laboratorio/ordenes/${orderId}/resultados`, { orderItemId: item.id, value: 13.1 })).status).toBe(201);
      const completed = await t.call('LAB', 'POST', `/laboratorio/ordenes/${orderId}/completar`, { version: sample.body.version + 1 /* API-10: the captured result moved it */ });
      expect(completed.status).toBe(201);

      const before = await t.call('PAC', 'GET', '/me/laboratorio');
      expect(before.status).toBe(200);
      expect(before.body.map((o: any) => o.id)).toEqual([orderId]);
      expect(before.body[0].state).toBe('completado');
      expect(before.body[0].items[0].result).toBeNull();
      expect((await t.call('PAC', 'GET', `/pacientes/${own}/historial`)).body.laboratory[0].items[0].result).toBeNull();
      expect((await t.call('MED', 'POST', `/laboratorio/ordenes/${orderId}/revisar`, { version: completed.body.version })).status).toBe(201);
      const after = await t.call('PAC', 'GET', '/me/laboratorio');
      expect(after.body[0].items[0].result).toEqual(expect.objectContaining({ mark: 'normal' }));
    });

    test('otro paciente, laboratorio y enfermería sin relación reciben 403 auditado; el médico ve también su borrador', async () => {
      const other = await t.patient();
      expect((await t.call('PAC', 'GET', `/pacientes/${other}/historial`)).status).toBe(403);
      expect((await t.call('LAB', 'GET', `/pacientes/${own}/historial`)).status).toBe(403);
      expect((await t.call('ENF', 'GET', `/pacientes/${own}/historial`)).status).toBe(403);
      expect((await t.audits('acceso.denegado')).filter(a => a.detalle.path?.endsWith('/historial')).length).toBeGreaterThanOrEqual(3);

      const doctor = await t.call('MED', 'GET', `/pacientes/${own}/historial`);
      expect(doctor.status).toBe(200);
      expect(doctor.body.access).toBe('relacion');
      expect(doctor.body.consultations.map((k: any) => k.id).sort()).toEqual([signed, draft].sort());
      expect(doctor.body.laboratory[0].items[0].result).toEqual(expect.objectContaining({ mark: 'normal' }));
      expect(doctor.body.consultations.find((k: any) => k.id === signed).doctor.name).toContain('MED');
    });

    test('un acceso excepcional aprobado y vigente abre el historial con motivo auditado y no ve borradores ajenos', async () => {
      await t.pg.query(`INSERT INTO acceso.acceso_excepcional(solicitante_id,paciente_id,motivo,horas,vigencia,estado,resuelto_por,resuelto_en)
        VALUES($1,$2,'Valoración de enfermería ficticia',2,tstzrange($3::timestamptz - interval '1 minute',$3::timestamptz + interval '1 hour'),'aprobado',$4,$3)`, [userId('ENF'), own, now, userId('DPD')]);
      const nurse = await t.call('ENF', 'GET', `/pacientes/${own}/historial`);
      expect(nurse.status).toBe(200);
      expect(nurse.body.access).toBe('acceso_excepcional');
      expect(nurse.body.consultations.map((k: any) => k.id)).toEqual([signed]);
      const audit = await t.one<{ motivo: string }>("SELECT motivo FROM plataforma.auditoria WHERE accion='expediente.leer' AND actor_id=$1 ORDER BY seq DESC LIMIT 1", [userId('ENF')]);
      expect(audit.motivo).toBe('acceso_excepcional');
    });
  });
});
