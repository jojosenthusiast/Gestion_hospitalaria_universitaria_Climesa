import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical } from '../src/platform/command.service';
import { AuditService } from '../src/platform/audit.service';
import { createDatabase, userId } from './support/database';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const MINUTE = 60_000;
const item = { medication: 'Acetaminofén 500 mg', dose: '1 tableta', route: 'oral', frequency: 'cada 8 horas', duration: '3 días' };

describe('Fase 0 · revisión de la remediación (confirmación, firmado, fila, traslados, auditoría)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const signed = async () => {
    const consultation = await t.consultation(await t.patient());
    const draft = await t.call('MED', 'PATCH', `/consultas/${consultation.id}`, { version: consultation.version, reason: 'Control de rutina', plan: 'Seguimiento en un mes' });
    expect(draft.status).toBe(200);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/receta`, { items: [item] })).status).toBe(201);
    expect((await t.call('MED', 'POST', `/consultas/${consultation.id}/firmar`, { version: draft.body.version })).status).toBe(201);
    return consultation.id;
  };
  const hospitalize = async (code: string, options: { sex?: string; isolation?: boolean } = {}) => {
    const created = await t.call('REC', 'POST', '/admisiones', { patientId: await t.patient({ sex: options.sex ?? 'femenino' }), origin: 'emergencia', originId: randomUUID(), requestedCategory: 'semiprivada', isolation: options.isolation ?? false, attendingDoctorId: await t.staffOf('MED') });
    expect(created.status).toBe(201);
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
    expect((await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);
    const row = (await t.call('REC', 'GET', '/admisiones')).body.find((admission: any) => admission.id === created.body.id);
    return { id: created.body.id as string, version: row.version as number, occupationId: row.occupationId as string, bedId: bed.id };
  };
  const bedId = async (code: string) => (await t.one<{ id: string }>('SELECT id FROM infra.espacio WHERE codigo=$1', [code])).id;

  test('API-07: una solicitud previa con inicio desalineado se confirma si la jornada la cubre', async () => {
    const shiftStart = new Date(now.valueOf() + 60 * MINUTE);
    await t.shift('MED', shiftStart, new Date(shiftStart.valueOf() + 8 * 60 * MINUTE));
    const legacy = await t.appointment(await t.patient(), new Date(shiftStart.valueOf() + 7 * MINUTE + 33_000), 'solicitada');
    const confirmed = await t.call('REC', 'POST', `/citas/solicitudes/${legacy}/confirmar`, { version: 1 });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.state).toBe('confirmada');
    const uncovered = await t.appointment(await t.patient(), new Date(shiftStart.valueOf() + 9 * 60 * MINUTE), 'solicitada');
    expect((await t.call('REC', 'POST', `/citas/solicitudes/${uncovered}/confirmar`, { version: 1 })).status).toBe(409);
  });

  test('RN-23: una consulta firmada que pasa a ingresada_por_error queda congelada', async () => {
    const id = await signed();
    await expect(t.pg.query("UPDATE atencion.consulta SET estado='ingresada_por_error',motivo='Texto cambiado' WHERE id=$1", [id])).rejects.toThrow(/consulta_firmada/);
    await t.pg.query("UPDATE atencion.consulta SET estado='ingresada_por_error',version=version+1 WHERE id=$1", [id]);
    await expect(t.pg.query("UPDATE atencion.consulta SET motivo='Texto cambiado' WHERE id=$1", [id])).rejects.toThrow(/consulta_firmada/);
    await expect(t.pg.query("UPDATE atencion.consulta SET estado='firmada' WHERE id=$1", [id])).rejects.toThrow(/consulta_firmada/);
    await expect(t.pg.query("UPDATE atencion.consulta SET estado='abierta' WHERE id=$1", [id])).rejects.toThrow(/consulta_firmada/);
    await t.pg.query('UPDATE atencion.consulta SET version=version+1 WHERE id=$1', [id]);
  });

  test('DAT-04: un renglón de receta firmada no se mueve a una receta abierta', async () => {
    const signedId = await signed();
    const open = await t.consultation(await t.patient());
    expect((await t.call('MED', 'POST', `/consultas/${open.id}/receta`, { items: [item] })).status).toBe(201);
    const signedItem = await t.one<{ id: string }>('SELECT i.id FROM atencion.receta_item i JOIN atencion.receta r ON r.id=i.receta_id WHERE r.consulta_id=$1', [signedId]);
    const openRecipe = await t.one<{ id: string }>('SELECT id FROM atencion.receta WHERE consulta_id=$1', [open.id]);
    await expect(t.pg.query('UPDATE atencion.receta_item SET receta_id=$2 WHERE id=$1', [signedItem.id, openRecipe.id])).rejects.toThrow(/consulta_firmada/);
  });

  test('W-07: si otro número activo entra entre la revisión y el INSERT, la API responde 409 ticket_activo_existente', async () => {
    const patientId = await t.patient();
    // Simulates the concurrent session: a duplicate active number appears right before the API's INSERT.
    await t.pg.exec(`CREATE FUNCTION atencion.prueba_carrera() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF pg_trigger_depth() = 1 THEN
          INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id) VALUES (new.servicio,new.fecha,new.numero+9000,new.paciente_id);
        END IF; RETURN new; END $$;
      CREATE TRIGGER prueba_carrera BEFORE INSERT ON atencion.ticket_fila FOR EACH ROW EXECUTE FUNCTION atencion.prueba_carrera();`);
    try {
      const response = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId });
      expect(response.status).toBe(409);
      expect(response.body.codigo).toBe('ticket_activo_existente');
    } finally {
      await t.pg.exec('DROP TRIGGER prueba_carrera ON atencion.ticket_fila; DROP FUNCTION atencion.prueba_carrera();');
    }
    expect((await t.one<{ n: number }>('SELECT count(*)::int AS n FROM atencion.ticket_fila WHERE paciente_id=$1', [patientId])).n).toBe(0);
  });

  test('F-02: REC y LAB (sin signos.registrar) reciben 403 al registrar signos', async () => {
    const consultation = await t.consultation(await t.patient());
    for (const role of ['REC', 'LAB']) {
      const saved = await t.call(role, 'POST', `/consultas/${consultation.id}/signos`, { heartRate: 75 });
      expect({ role, status: saved.status }).toEqual({ role, status: 403 });
    }
  });

  test('F-06: un PAC que cancela una cita inexistente recibe el mismo 403 que con una ajena', async () => {
    await t.patient({ linkPac: true });
    try {
      const foreign = await t.appointment(await t.patient(), new Date(now.valueOf() + 3 * 86_400_000));
      const body = { version: 1, reason: 'Ya no puedo asistir a la cita' };
      const other = await t.call('PAC', 'POST', `/citas/${foreign}/cancelar`, body);
      const missing = await t.call('PAC', 'POST', `/citas/${randomUUID()}/cancelar`, body);
      expect(missing.status).toBe(403);
      expect(missing.status).toBe(other.status);
      expect(missing.body.codigo).toBe(other.body.codigo);
    } finally {
      await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
    }
  });

  test('DAT-05: el traslado a una semiprivada ocupada por otro sexo se rechaza', async () => {
    await hospitalize('HAB-201-A', { sex: 'femenino' });
    const male = await hospitalize('HAB-202-A', { sex: 'masculino' });
    t.setNow(new Date(now.valueOf() + 5 * MINUTE));
    try {
      const moved = await t.call('REC', 'POST', `/ocupaciones/${male.occupationId}/traslado`, { bedId: await bedId('HAB-201-B'), reason: 'Cambio por mantenimiento de la habitación', version: male.version });
      expect(moved.status).toBe(409);
    } finally { t.setNow(now); }
  });

  test('DAT-02: el traslado con aislamiento libera la habitación de origen y bloquea la de destino', async () => {
    const isolated = await hospitalize('HAB-203-A', { isolation: true });
    const [originBlocked, targetBlocked] = [await bedId('HAB-203-B'), await bedId('HAB-204-B')];
    const blocks = async (bed: string) => (await t.pg.query<{ open: boolean }>("SELECT upper_inf(periodo) AS open FROM infra.bloqueo_cama WHERE cama_id=$1 AND origen='aislamiento'", [bed])).rows;
    expect(await blocks(originBlocked)).toEqual([{ open: true }]);
    t.setNow(new Date(now.valueOf() + 5 * MINUTE));
    try {
      const moved = await t.call('REC', 'POST', `/ocupaciones/${isolated.occupationId}/traslado`, { bedId: await bedId('HAB-204-A'), reason: 'Cambio por mantenimiento de la habitación', version: isolated.version });
      expect(moved.status).toBe(201);
    } finally { t.setNow(now); }
    expect(await blocks(originBlocked)).toEqual([{ open: false }]);
    expect(await blocks(targetBlocked)).toEqual([{ open: true }]);
  });

  test('SEG-02: la auditoría guarda el detalle una sola vez y la cadena sigue verificable', async () => {
    // Recepción ya no recibe pacientes del catálogo (los busca con /pacientes/selector): la lectura auditada es la del propio paciente.
    await t.patient({ linkPac: true });
    expect((await t.call('PAC', 'GET', '/citas/catalogos')).status).toBe(200);
    const row = (await t.pg.query<{ detalle: any }>("SELECT detalle FROM plataforma.auditoria WHERE accion='citas.catalogo_leer' ORDER BY seq DESC LIMIT 1")).rows[0];
    const event = JSON.parse(row.detalle.canonicalEvent);
    expect(event.detail).toBeUndefined();
    const { canonicalEvent: _signed, ...detail } = row.detalle;
    expect(event.detailHash).toBe(createHash('sha256').update(canonical(detail)).digest('hex'));
    expect(detail.patientCount).toBe(detail.patientIds.length);
    expect((await t.app.get(AuditService).verifyChain()).ok).toBe(true);
  });

  test('FR-100-07: las filas previas con el detalle dentro del evento siguen verificándose', async () => {
    const last = await t.one<{ hash: Uint8Array }>('SELECT hash FROM plataforma.auditoria ORDER BY seq DESC LIMIT 1');
    const previous = Buffer.from(last.hash);
    const event = { id: randomUUID(), at: now.toISOString(), actorId: null, actorRole: '', action: 'prueba.legada', entity: 'prueba', detail: { n: 1 }, result: 'exito' };
    const signedEvent = canonical(event);
    await t.pg.query(`INSERT INTO plataforma.auditoria(evento_id,registrado_en,accion,entidad,resultado,detalle,hash_previo,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [event.id, event.at, event.action, event.entity, event.result, { n: 1, canonicalEvent: signedEvent }, previous, createHash('sha256').update(previous).update(signedEvent).digest()]);
    const verify = () => t.app.get(AuditService).verifyChain();
    expect((await verify()).ok).toBe(true);
    await t.pg.query("UPDATE plataforma.auditoria SET detalle=jsonb_set(detalle,'{n}','2') WHERE evento_id=$1", [event.id]);
    expect((await verify()).ok).toBe(false);
    await t.pg.query("UPDATE plataforma.auditoria SET detalle=jsonb_set(detalle,'{n}','1') WHERE evento_id=$1", [event.id]);
  });
});

describe('Migración 20261114000200: guarda previa de traslapes por paciente', () => {
  test('se detiene con un mensaje claro si hay traslapes y se aplica cuando se resuelven', async () => {
    const { pg } = await createDatabase();
    try {
      const migration = readFileSync(resolve(__dirname, '../../supabase/migrations/20261114000200_integridad_citas_consulta.sql'), 'utf8');
      await pg.exec('ALTER TABLE atencion.cita DROP CONSTRAINT cita_paciente_sin_traslape');
      const patient = (await pg.query<{ id: string }>("INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento) VALUES('T-MIG-1','Migración','Ficticio','femenino','exacta','1990-01-01') RETURNING id")).rows[0].id;
      const doctors = (await pg.query<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo) VALUES('Uno','Médico Ficticio','medico'),('Dos','Médico Ficticio','medico') RETURNING id")).rows.map(row => row.id);
      const start = new Date(now.valueOf() + 86_400_000);
      for (const doctor of doctors) await pg.query(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$3::timestamptz+interval '20 minutes','[)'),'solicitada','paciente')`, [patient, doctor, start]);
      await expect(pg.exec(migration)).rejects.toThrow(/Hay 1 par\(es\) de citas/);
      expect((await pg.query("SELECT 1 FROM pg_constraint WHERE conname='cita_paciente_sin_traslape'")).rows).toHaveLength(0);
      await pg.query("UPDATE atencion.cita SET estado='cancelada' WHERE medico_id=$1", [doctors[1]]);
      await pg.exec(migration);
      expect((await pg.query("SELECT 1 FROM pg_constraint WHERE conname='cita_paciente_sin_traslape'")).rows).toHaveLength(1);
    } finally { await pg.close(); }
  });
});
