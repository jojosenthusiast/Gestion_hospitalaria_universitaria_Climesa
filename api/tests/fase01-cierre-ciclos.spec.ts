import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';
import { dispatchBlock } from '../src/ambulance/ambulance.rules';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const MINUTE = 60_000;

/** Auditoría final, Fase 0: BL-03 (ciclo de alta), BL-04 (cancelar o anular) y MA-HOS-02 (revocar alta). */
describe('Fase 0 · cierre del ciclo de la admisión', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const admit = async (extra: Record<string, unknown> = {}) => {
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(await t.patient(), { requestedCategory: 'semiprivada', isolation: false, ...extra }));
    expect(created.status).toBe(201);
    return created.body as { id: string; version: number };
  };
  const hospitalize = async (code: string) => {
    const created = await admit();
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
    const assigned = await t.call('REC', 'POST', `/admisiones/${created.id}/cama`, { bedId: bed.id, version: bed.version });
    expect(assigned.status).toBe(201);
    return { id: created.id, version: assigned.body.version as number, bedId: bed.id };
  };
  const row = async (role: string, id: string) => (await t.call(role, 'GET', '/admisiones')).body.find((a: { id: string }) => a.id === id);

  test('BL-04: Recepción cancela una admisión pendiente con motivo y el paciente puede volver a ingresar', async () => {
    const admission = await admit();
    expect((await row('REC', admission.id)).allowedActions).toEqual(expect.arrayContaining(['asignar_cama', 'cancelar']));
    expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/cancelar`, { version: admission.version, reason: 'corto' })).status).toBe(400);
    const stale = await t.call('REC', 'POST', `/admisiones/${admission.id}/cancelar`, { version: admission.version + 5, reason: 'Admisión duplicada por error de registro' });
    expect(stale.body.codigo).toBe('version_conflicto');
    const cancelled = await t.call('REC', 'POST', `/admisiones/${admission.id}/cancelar`, { version: admission.version, reason: 'Admisión duplicada por error de registro' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body).toMatchObject({ state: 'cancelada' });
    const stored = await t.one('SELECT estado,motivo_cierre,cerrada_por FROM hospitalizacion.admision WHERE id=$1', [admission.id]);
    expect(stored).toEqual({ estado: 'cancelada', motivo_cierre: 'Admisión duplicada por error de registro', cerrada_por: userId('REC') });
    expect(await row('REC', admission.id)).toBeUndefined();
    expect((await t.audits('admision.cancelar')).length).toBe(1);
    expect((await t.events('admision.actualizada', admission.id)).length).toBeGreaterThanOrEqual(1);
    // RN-10: the unique active admission no longer blocks the patient.
    const old = await t.one<{ paciente_id: string; origen_id: string }>('SELECT paciente_id,origen_id FROM hospitalizacion.admision WHERE id=$1', [admission.id]);
    for (const state of ['llamado', 'en_atencion', 'atendido']) await t.pg.query('UPDATE atencion.ticket_fila SET estado=$2 WHERE id=$1', [old.origen_id, state]);
    expect((await t.call('REC', 'POST', '/admisiones', await t.admissionBody(old.paciente_id, { requestedCategory: 'semiprivada', isolation: false }))).status).toBe(201);
  });

  test('BL-04: una admisión hospitalizada no se cancela; Jefatura la anula y la cama va a limpieza', async () => {
    const admission = await hospitalize('HAB-201-A');
    const cancel = await t.call('REC', 'POST', `/admisiones/${admission.id}/cancelar`, { version: admission.version, reason: 'Ingreso del paciente equivocado' });
    expect(cancel.status).toBe(409);
    expect(cancel.body.codigo).toBe('transicion_invalida');
    expect((await row('REC', admission.id)).allowedActions).not.toContain('anular');
    expect((await row('JOP', admission.id)).allowedActions).toEqual(expect.arrayContaining(['anular', 'reasignar_tratante']));
    expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/anular`, { version: admission.version, reason: 'Ingreso del paciente equivocado' })).status).toBe(403);
    t.setNow(new Date(now.valueOf() + MINUTE));
    try {
      const annulled = await t.call('JOP', 'POST', `/admisiones/${admission.id}/anular`, { version: admission.version, reason: 'Ingreso del paciente equivocado' });
      expect(annulled.status).toBe(201);
      expect(annulled.body.state).toBe('cancelada');
      expect(await t.one('SELECT motivo_fin FROM hospitalizacion.ocupacion_cama WHERE admision_id=$1', [admission.id])).toEqual({ motivo_fin: 'ingresado_por_error' });
      expect((await t.one('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1', [admission.bedId])).estado).toBe('limpieza');
      // D-03 (MA-HOS-04): Jefatura registra la limpieza desde la Web; otra persona (Enfermería) la verifica.
      const version = async () => (await t.one<{ version: number }>('SELECT version FROM infra.espacio WHERE id=$1', [admission.bedId])).version;
      expect((await t.call('JOP', 'POST', `/camas/${admission.bedId}/limpieza/completar`, { version: await version(), reason: 'Limpieza terminal de la cama' })).status).toBe(201);
      expect((await t.call('JOP', 'POST', `/camas/${admission.bedId}/limpieza/verificar`, { version: await version(), reason: 'Verificación de la limpieza' })).status).toBe(409);
      expect((await t.call('ENF', 'POST', `/camas/${admission.bedId}/limpieza/verificar`, { version: await version(), reason: 'Verificación de la limpieza' })).status).toBe(201);
      expect((await t.one('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1', [admission.bedId])).estado).toBe('libre');
    } finally { t.setNow(now); }
  });

  test('BL-03: Recepción ve "esperando alta", la pide al tratante (aviso a su cuenta) y el MED la firma; Recepción registra la salida', async () => {
    const admission = await hospitalize('HAB-202-A');
    const rec = await row('REC', admission.id);
    expect(rec).toMatchObject({ attendingDoctorId: await t.staffOf('MED'), attendingDoctorHasAccount: true, dischargeRequestedAt: null, discharge: null });
    expect(rec.attendingDoctorName).toEqual(expect.any(String));
    expect(rec.allowedActions).toContain('solicitar_alta');
    expect(rec.allowedActions).not.toContain('firmar_alta');
    const requested = await t.call('REC', 'POST', `/admisiones/${admission.id}/solicitar-alta`, { version: rec.version });
    expect(requested.status).toBe(201);
    const channels = (await t.events('admision.actualizada', admission.id)).at(-1);
    expect(channels).toContain(`usuario:${userId('MED')}`);
    const med = await row('MED', admission.id);
    expect(med.dischargeRequestedAt).not.toBeNull();
    expect(med.allowedActions).toContain('firmar_alta');
    const signed = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { type: 'medica', version: med.version, pending: [{ description: 'Control en siete días', responsible: 'Consulta externa' }] });
    expect(signed.status).toBe(201);
    const after = await row('REC', admission.id);
    // D-031: Recepción no tiene relación de atención; solo ve los datos operativos del alta.
    expect(after).toMatchObject({ state: 'alta_firmada', dischargeRequestedAt: null, discharge: { type: null, pending: null, pendingCount: 1, specialHandling: false, signedAt: expect.any(String), signedByName: expect.any(String) } });
    expect((await row('MED', admission.id)).discharge).toMatchObject({ type: 'medica', pendingCount: 1, specialHandling: false, pending: [{ description: 'Control en siete días', responsible: 'Consulta externa' }] });
    expect(after.allowedActions).toEqual(expect.arrayContaining(['registrar_salida']));
    t.setNow(new Date(now.valueOf() + 2 * MINUTE));
    try {
      expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { version: after.version, reason: 'Egreso por alta médica firmada' })).status).toBe(201);
      expect((await t.one('SELECT estado FROM infra.v_estado_cama WHERE cama_id=$1', [admission.bedId])).estado).toBe('limpieza');
    } finally { t.setNow(now); }
  });

  test('BL-03: el MED con relación de atención vigente (no tratante) ve la hospitalización y puede firmar el alta', async () => {
    const other = await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Tratante','Sin Cuenta','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`);
    const created = await admit({ attendingDoctorId: other.id });
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', ['HAB-205-A']);
    expect((await t.call('REC', 'POST', `/admisiones/${created.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);
    expect(await row('MED', created.id)).toBeUndefined();
    const rec = await row('REC', created.id);
    expect(rec.attendingDoctorHasAccount).toBe(false);
    expect(rec.allowedActions).not.toContain('solicitar_alta');
    const patientId = (await t.one<{ paciente_id: string }>('SELECT paciente_id FROM hospitalizacion.admision WHERE id=$1', [created.id])).paciente_id;
    await t.pg.query(`INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia) VALUES($1,$2,'admision',$3,tstzrange($4::timestamptz - interval '1 hour',$4::timestamptz + interval '1 day','[)'))`, [patientId, await t.staffOf('MED'), created.id, now]);
    const med = await row('MED', created.id);
    expect(med.allowedActions).toContain('firmar_alta');
    expect((await t.call('MED', 'POST', `/admisiones/${created.id}/alta`, { type: 'medica', version: med.version })).status).toBe(201);
  });

  test('BL-03: Jefatura reasigna el tratante a un médico con cuenta; sin cuenta se rechaza', async () => {
    const noAccount = await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otro','Sin Cuenta','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`);
    const created = await admit({ attendingDoctorId: noAccount.id });
    const rec = await row('REC', created.id);
    expect(rec.allowedActions).not.toContain('reasignar_tratante');
    const doctors = (await t.call('JOP', 'GET', '/admisiones/medicos-disponibles')).body as Array<{ id: string; hasAccount: boolean }>;
    expect(doctors.find(d => d.id === noAccount.id)?.hasAccount).toBe(false);
    expect((await t.call('REC', 'POST', `/admisiones/${created.id}/tratante`, { attendingDoctorId: await t.staffOf('MED'), version: rec.version, reason: 'El tratante no tiene cuenta en la app' })).status).toBe(403);
    const other = await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Tercer','Sin Cuenta','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`);
    const rejected = await t.call('JOP', 'POST', `/admisiones/${created.id}/tratante`, { attendingDoctorId: other.id, version: rec.version, reason: 'El tratante no tiene cuenta en la app' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.campo).toBe('attendingDoctorId');
    const changed = await t.call('JOP', 'POST', `/admisiones/${created.id}/tratante`, { attendingDoctorId: await t.staffOf('MED'), version: rec.version, reason: 'El tratante no tiene cuenta en la app' });
    expect(changed.status).toBe(201);
    expect(await t.one('SELECT anterior_id,nuevo_id FROM hospitalizacion.cambio_tratante WHERE admision_id=$1', [created.id])).toEqual({ anterior_id: noAccount.id, nuevo_id: await t.staffOf('MED') });
    expect((await t.events('admision.actualizada', created.id)).at(-1)).toContain(`usuario:${userId('MED')}`);
    expect(await row('MED', created.id)).toBeDefined();
  });

  test('MA-HOS-02: el firmante revoca el alta antes de la salida, se conserva y puede volver a firmarse', async () => {
    const admission = await hospitalize('HAB-203-A');
    const signed = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { type: 'medica', version: admission.version });
    expect(signed.status).toBe(201);
    expect((await row('MED', admission.id)).allowedActions).toContain('revocar_alta');
    expect((await row('REC', admission.id)).allowedActions).not.toContain('revocar_alta');
    expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/revocar-alta`, { version: signed.body.version, reason: 'Fiebre nueva antes de la salida' })).status).toBe(403);
    const revoked = await t.call('MED', 'POST', `/admisiones/${admission.id}/revocar-alta`, { version: signed.body.version, reason: 'Fiebre nueva antes de la salida' });
    expect(revoked.status).toBe(201);
    expect(revoked.body.state).toBe('hospitalizado');
    expect((await row('REC', admission.id)).discharge).toBeNull();
    const again = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { type: 'medica', version: revoked.body.version });
    expect(again.status).toBe(201);
    expect((await t.pg.query<{ revocada: boolean }>('SELECT revocada_en IS NOT NULL AS revocada FROM hospitalizacion.alta WHERE admision_id=$1 ORDER BY firmada_en', [admission.id])).rows.map(r => r.revocada).sort()).toEqual([false, true]);
    const byJop = await t.call('JOP', 'POST', `/admisiones/${admission.id}/revocar-alta`, { version: again.body.version, reason: 'Jefatura revoca por error de tipo' });
    expect(byJop.status).toBe(201);
  });

  test('D-031: Jefatura y Recepción no ven el tipo ni los pendientes de un alta por defunción; el tratante sí', async () => {
    const admission = await hospitalize('HAB-206-A');
    const signed = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, { type: 'defuncion', version: admission.version, pending: [{ description: 'Entrega del cuerpo a la familia', responsible: 'Trabajo social' }] });
    expect(signed.status).toBe(201);
    for (const role of ['JOP', 'REC']) {
      const operational = (await row(role, admission.id)).discharge;
      expect(operational).toEqual({ type: null, pending: null, pendingCount: 1, specialHandling: true, signedAt: expect.any(String), signedByName: expect.any(String) });
      expect(JSON.stringify(operational)).not.toMatch(/defuncion|cuerpo/);
    }
    expect((await row('MED', admission.id)).discharge).toMatchObject({ type: 'defuncion', specialHandling: true, pending: [{ description: 'Entrega del cuerpo a la familia', responsible: 'Trabajo social' }] });
  });

  test('los motivos se validan sin espacios al borde: relleno con espacios es 400 validacion en reason', async () => {
    const admission = await admit();
    const padded = { version: admission.version, reason: '   corto      ' };
    for (const [role, path, extra] of [['REC', 'cancelar', {}], ['JOP', 'anular', {}], ['JOP', 'tratante', { attendingDoctorId: await t.staffOf('MED') }], ['MED', 'revocar-alta', {}]] as const) {
      const res = await t.call(role, 'POST', `/admisiones/${admission.id}/${path}`, { ...padded, ...extra });
      expect([path, res.status, res.body.codigo, res.body.campo]).toEqual([path, 400, 'validacion', 'reason']);
    }
    const cancelled = await t.call('REC', 'POST', `/admisiones/${admission.id}/cancelar`, { version: admission.version, reason: '  Admisión registrada dos veces  ' });
    expect(cancelled.status).toBe(201);
    expect((await t.one('SELECT motivo_cierre FROM hospitalizacion.admision WHERE id=$1', [admission.id])).motivo_cierre).toBe('Admisión registrada dos veces');
  });

  test('MA-HOS-05: Enfermería lee las notas de una admisión de su área; sin turno en el área no', async () => {
    const admission = await hospitalize('HAB-204-A');
    expect((await t.call('ENF', 'GET', `/admisiones/${admission.id}/notas-enfermeria`)).status).toBe(403);
    const area = await t.one<{ id: string }>(`SELECT h.padre_id AS id FROM infra.espacio c JOIN infra.espacio h ON h.id=c.padre_id WHERE c.codigo='HAB-204-A'`);
    await t.pg.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) VALUES($1,$2,tstzrange($3::timestamptz - interval '1 hour',$3::timestamptz + interval '6 hours','[)'),'diurno','publicado')`, [await t.staffOf('ENF'), area.id, now]);
    expect((await t.call('ENF', 'POST', `/admisiones/${admission.id}/notas-enfermeria`, { text: 'Paciente estable, tolera dieta.' })).status).toBe(201);
    const notes = await t.call('ENF', 'GET', `/admisiones/${admission.id}/notas-enfermeria`);
    expect(notes.status).toBe(200);
    expect(notes.body).toEqual([expect.objectContaining({ text: 'Paciente estable, tolera dieta.', createdAt: expect.any(String) })]);
    expect((await row('ENF', admission.id)).allowedActions).toContain('nota_enfermeria');
  });
});

/** BL-05: cierre administrativo del servicio y paramédico con cuenta para despachar. */
describe('Fase 0 · cierre administrativo de la ambulancia', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.shift('PAR', new Date(now.valueOf() - 60 * MINUTE), new Date(now.valueOf() + 6 * 60 * MINUTE));
    await t.driverShift(new Date(now.valueOf() - 60 * MINUTE), new Date(now.valueOf() + 6 * 60 * MINUTE));
    const current = await t.one<{ version: number; estado: string }>('SELECT version,estado FROM ambulancia.unidad');
    if (current.estado === 'en_mantenimiento') expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: current.version, inMaintenance: false, reason: 'Unidad lista para la prueba' })).status).toBe(201);
  });
  afterAll(async () => { await t?.close(); });
  const unit = () => t.one<{ version: number; estado: string }>('SELECT version,estado FROM ambulancia.unidad');
  const dispatch = async () => t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Escalón, calle 5', destination: 'Hospital CLIMESA' });

  test('dispatchBlock nombra al paramédico con cuenta cuando solo hay paramédicos sin cuenta', () => {
    expect(dispatchBlock('disponible', true, true, false)).toMatchObject({ code: 'sin_paramedico_de_turno', message: expect.stringMatching(/con cuenta/) });
    expect(dispatchBlock('disponible', true, true, true)).toBeNull();
  });

  test('Jefatura cierra un servicio activo con motivo; la unidad vuelve a Disponible y la bitácora lo marca', async () => {
    const service = await dispatch();
    expect(service.status).toBe(201);
    const board = (await t.call('JOP', 'GET', '/ambulancia')).body;
    expect(board.activeService.allowedActions).toEqual(['cerrar']);
    expect(board.activeService.crew.some((m: { role: string; hasAccount: boolean }) => m.role === 'paramedico' && m.hasAccount)).toBe(true);
    expect((await t.call('REC', 'GET', '/ambulancia')).body.activeService.allowedActions).toEqual([]);
    expect((await t.call('REC', 'POST', `/ambulancia/servicios/${service.body.id}/cerrar`, { version: service.body.version, reason: 'Tripulación sin teléfono para cerrar' })).status).toBe(403);
    expect((await t.call('JOP', 'POST', `/ambulancia/servicios/${service.body.id}/cerrar`, { version: service.body.version, reason: 'corto' })).status).toBe(400);
    const padded = await t.call('JOP', 'POST', `/ambulancia/servicios/${service.body.id}/cerrar`, { version: service.body.version, reason: '   corto      ' });
    expect([padded.status, padded.body.codigo, padded.body.campo]).toEqual([400, 'validacion', 'reason']);
    const closed = await t.call('JOP', 'POST', `/ambulancia/servicios/${service.body.id}/cerrar`, { version: service.body.version, reason: 'Tripulación sin teléfono para cerrar' });
    expect(closed.status).toBe(201);
    expect(closed.body).toMatchObject({ finalState: 'cancelado', unitState: 'disponible' });
    expect((await unit()).estado).toBe('disponible');
    const again = await t.call('JOP', 'POST', `/ambulancia/servicios/${service.body.id}/cerrar`, { version: closed.body.version, reason: 'Tripulación sin teléfono para cerrar' });
    expect(again.body.codigo).toBe('servicio_finalizado');
    const log = (await t.call('JOP', 'GET', '/ambulancia/bitacora')).body as Array<{ id: string; finalState: string; administrativeClose: boolean }>;
    expect(log.find(e => e.id === service.body.id)).toMatchObject({ finalState: 'cancelado', administrativeClose: true });
    expect((await t.audits('ambulancia.cerrar')).length).toBe(1);
  });

  test('sin un paramédico con cuenta activa no se despacha (la base también lo impide)', async () => {
    await t.pg.query(`UPDATE acceso.usuario SET estado='desactivado' WHERE id=$1`, [userId('PAR')]);
    try {
      const board = (await t.call('REC', 'GET', '/ambulancia')).body;
      expect(board).toMatchObject({ paramedicOnDuty: true, paramedicWithAccountOnDuty: false, dispatchBlock: { code: 'sin_paramedico_de_turno' } });
      const blocked = await dispatch();
      expect(blocked.status).toBe(409);
      expect(blocked.body.codigo).toBe('sin_paramedico_de_turno');
    } finally { await t.pg.query(`UPDATE acceso.usuario SET estado='activo' WHERE id=$1`, [userId('PAR')]); }
  });
});
