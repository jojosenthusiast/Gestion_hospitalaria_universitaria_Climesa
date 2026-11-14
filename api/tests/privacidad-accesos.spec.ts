import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';
import { accessView, grantedHours, isRecordAccess } from '../src/privacy/privacy.rules';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const hours = (n: number) => n * 3600_000;

describe('110 · reglas puras de acceso excepcional', () => {
  const now = new Date('2026-11-14T16:00:00Z');
  test('una urgencia sin revisar se muestra por revisar; un acceso aprobado vence solo (RN-40)', () => {
    const base = { estado: 'aprobado' as const, urgencia: true, resueltoPor: null, desde: '2026-11-14T15:00:00Z', hasta: '2026-11-14T17:00:00Z' };
    expect(accessView(base, now)).toBe('por_revisar');
    expect(accessView({ ...base, resueltoPor: 'dpd' }, now)).toBe('vigente');
    expect(accessView({ ...base, resueltoPor: 'dpd' }, new Date('2026-11-14T17:00:00Z'))).toBe('vencido');
    expect(accessView({ ...base, estado: 'pendiente', desde: null, hasta: null }, now)).toBe('pendiente');
  });
  test('las horas concedidas nunca superan lo pedido ni la política', () => {
    expect(grantedHours(8, 2, 24)).toBe(2);
    expect(grantedHours(8, 12, 24)).toBe(8);
    expect(grantedHours(30, undefined, 24)).toBe(24);
  });
  test('la transparencia deja fuera la gestión del acceso y los rechazos', () => {
    expect(isRecordAccess('consulta.leer')).toBe(true);
    expect(isRecordAccess('acceso_excepcional.solicitar')).toBe(false);
    expect(isRecordAccess('acceso.denegado')).toBe(false);
  });
});

describe('110 · accesos excepcionales, auditoría y quién vio mi expediente', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  /** Consultation owned by another doctor, with MED's care relationship already over (MED is "no tratante"). */
  async function foreignConsultation(linkPac = false) {
    const patientId = await t.patient({ linkPac, name: 'Ana' });
    const consultation = await t.consultation(patientId);
    const other = await t.one<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otro','Medico Ficticio','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id");
    await t.pg.query('UPDATE atencion.consulta SET medico_id=$2 WHERE id=$1', [consultation.id, other.id]);
    await t.pg.query("UPDATE atencion.relacion_atencion SET vigencia=tstzrange(lower(vigencia)-interval '2 days',lower(vigencia)-interval '1 day') WHERE paciente_id=$1", [patientId]);
    return { patientId, consultationId: consultation.id };
  }

  test('escenario 1 y 2: el médico no tratante recibe 403; con acceso aprobado por 2 h ve el detalle y luego no', async () => {
    t.setNow(start);
    const { patientId, consultationId } = await foreignConsultation();
    expect((await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`)).status).toBe(403);

    const request = await t.call('MED', 'POST', '/accesos-excepcionales', { pacienteId: patientId, motivo: 'Revisión de una queja del paciente', horas: 8 });
    expect(request.status).toBe(201);
    expect(request.body).toMatchObject({ estado: 'pendiente', vista: 'pendiente', horas: 8, version: 1 });
    const [requested] = await t.events('acceso.solicitado', request.body.id);
    expect(requested).toEqual(expect.arrayContaining(['rol:DPD', `usuario:${userId('MED')}`]));
    expect(requested).not.toContain('rol:PAC');
    expect((await t.call('MED', 'POST', '/accesos-excepcionales', { pacienteId: patientId, motivo: 'Segunda solicitud repetida', horas: 2 })).body.codigo).toBe('acceso_pendiente_existente');
    expect((await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`)).status).toBe(403);

    const conflict = await t.call('DPD', 'POST', `/accesos-excepcionales/${request.body.id}/aprobar`, { version: 9, horas: 2 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.versionActual).toBe(1);
    const approved = await t.call('DPD', 'POST', `/accesos-excepcionales/${request.body.id}/aprobar`, { version: 1, horas: 2 });
    expect(approved.status).toBe(201);
    expect(approved.body).toMatchObject({ estado: 'aprobado', vista: 'vigente', version: 2 });
    expect(new Date(approved.body.hasta).getTime() - new Date(approved.body.desde).getTime()).toBe(hours(2));
    expect((await t.events('acceso.resuelto', request.body.id))[0]).toEqual(expect.arrayContaining(['rol:DPD', `usuario:${userId('MED')}`]));

    const detail = await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`);
    expect(detail.status).toBe(200);
    expect(detail.body.consultation).not.toHaveProperty('exceptionalAccessId');
    const audit = await t.one<{ motivo: string; detalle: any }>("SELECT motivo,detalle FROM plataforma.auditoria WHERE accion='consulta.leer' AND entidad_id=$1 ORDER BY seq DESC LIMIT 1", [consultationId]);
    expect(audit.motivo).toBe('acceso_excepcional');
    expect(audit.detalle.exceptionalAccessId).toBe(request.body.id);
    expect((await t.call('DPD', 'POST', `/accesos-excepcionales/${request.body.id}/negar`, { version: 2, motivo: 'Ya no corresponde resolverla' })).body.codigo).toBe('acceso_ya_resuelto');

    t.setNow(new Date(start.getTime() + hours(2) + 60_000));
    expect((await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`)).status).toBe(403);
    const list = await t.call('DPD', 'GET', '/accesos-excepcionales');
    expect(list.body.find((row: any) => row.id === request.body.id).vista).toBe('vencido');
    t.setNow(start);
  });

  test('RN-38: nadie resuelve su propia solicitud; la base también lo impide', async () => {
    const patientId = await t.patient();
    const own = await t.call('JOP', 'POST', '/accesos-excepcionales', { pacienteId: patientId, motivo: 'Revisión administrativa ficticia', horas: 1 });
    expect(own.status).toBe(201);
    await t.pg.query("INSERT INTO acceso.asignacion_rol(usuario_id,rol_codigo) VALUES($1,'DPD')", [userId('JOP')]);
    try {
      const self = await t.call('JOP', 'POST', `/accesos-excepcionales/${own.body.id}/aprobar`, { version: 1 });
      expect(self.status).toBe(403);
      expect(self.body.codigo).toBe('aprobacion_propia');
    } finally { await t.pg.query("DELETE FROM acceso.asignacion_rol WHERE usuario_id=$1 AND rol_codigo='DPD'", [userId('JOP')]); }
    await expect(t.pg.query("UPDATE acceso.acceso_excepcional SET estado='negado',resuelto_por=solicitante_id,resuelto_en=now() WHERE id=$1", [own.body.id])).rejects.toThrow();
    await expect(t.pg.query("UPDATE acceso.acceso_excepcional SET estado='negado' WHERE id=$1", [own.body.id])).rejects.toThrow(/acceso_excepcional_resolucion_con_autor/);
    await expect(t.pg.query("UPDATE acceso.acceso_excepcional SET estado='aprobado',resuelto_por=$2,resuelto_en=now(),vigencia=tstzrange(now(),now()+interval '3 hours') WHERE id=$1", [own.body.id, userId('DPD')])).rejects.toThrow(/acceso_excepcional_vigencia_horas/);
  });

  test('el solicitante ve solo sus solicitudes; quien no pide ni aprueba recibe 403', async () => {
    const mine = await t.call('JOP', 'GET', '/accesos-excepcionales');
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect(mine.body.every((row: any) => row.solicitanteId === userId('JOP'))).toBe(true);
    const all = await t.call('DPD', 'GET', '/accesos-excepcionales?estado=pendiente');
    expect(all.body.some((row: any) => row.solicitanteId === userId('JOP'))).toBe(true);
    expect((await t.call('REC', 'GET', '/accesos-excepcionales')).status).toBe(403);
    expect((await t.call('REC', 'POST', '/accesos-excepcionales', { pacienteId: await t.patient(), motivo: 'Sin permiso para pedir', horas: 1 })).status).toBe(403);
  });

  test('FR-110-09: el médico rompe el vidrio y ve al instante; queda por revisar y el delegado puede cerrarlo', async () => {
    t.setNow(start);
    const { patientId, consultationId } = await foreignConsultation();
    expect((await t.call('JOP', 'POST', '/accesos-excepcionales', { pacienteId: patientId, motivo: 'Urgencia sin ser médico', horas: 1, urgencia: true })).body.codigo).toBe('urgencia_no_permitida');
    const urgent = await t.call('MED', 'POST', '/accesos-excepcionales', { pacienteId: patientId, motivo: 'Paciente inconsciente en emergencia', horas: 4, urgencia: true });
    expect(urgent.status).toBe(201);
    expect(urgent.body).toMatchObject({ estado: 'aprobado', vista: 'por_revisar', urgencia: true, resueltoPor: null });
    expect((await t.events('acceso.solicitado', urgent.body.id))[0]).toContain('rol:DPD');
    expect((await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`)).status).toBe(200);
    const closed = await t.call('DPD', 'POST', `/accesos-excepcionales/${urgent.body.id}/negar`, { version: 1, motivo: 'La urgencia no estaba justificada' });
    expect(closed.status).toBe(201);
    expect(closed.body.vista).toBe('negado');
    expect((await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`)).status).toBe(403);
  });

  test('FR-110-07: el delegado filtra la auditoría y detecta un registro alterado', async () => {
    const byAction = await t.call('DPD', 'GET', '/auditoria?accion=acceso_excepcional.&limite=50');
    expect(byAction.status).toBe(200);
    expect(byAction.body.length).toBeGreaterThan(0);
    expect(byAction.body.every((row: any) => row.action.startsWith('acceso_excepcional.'))).toBe(true);
    const byPerson = await t.call('DPD', 'GET', `/auditoria?persona=${userId('JOP')}`);
    expect(byPerson.body.every((row: any) => row.actorId === userId('JOP'))).toBe(true);
    expect((await t.call('DPD', 'GET', '/auditoria?desde=no-es-fecha')).status).toBe(400);
    expect((await t.call('JOP', 'GET', '/auditoria')).status).toBe(403);

    const ok = await t.call('DPD', 'POST', '/auditoria/verificacion', {});
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ integra: true });
    expect(ok.body.revisados).toBeGreaterThan(0);
    // Tampering bypasses the API role on purpose: the chain must reveal it.
    const target = await t.one<{ seq: string }>("SELECT seq::text FROM plataforma.auditoria WHERE accion='acceso_excepcional.solicitar' ORDER BY seq LIMIT 1");
    await t.pg.query("UPDATE plataforma.auditoria SET motivo='alterado' WHERE seq=$1", [target.seq]);
    const broken = await t.call('DPD', 'POST', '/auditoria/verificacion', {});
    expect(broken.body).toMatchObject({ integra: false, primeraFallida: Number(target.seq) });
  });

  test('escenario 4: Ana ve rol, fecha y motivo de quien vio su expediente, sin nombres', async () => {
    t.setNow(start);
    const { patientId, consultationId } = await foreignConsultation(true);
    const request = await t.call('MED', 'POST', '/accesos-excepcionales', { pacienteId: patientId, motivo: 'Segunda opinión solicitada por la paciente', horas: 1 });
    await t.call('DPD', 'POST', `/accesos-excepcionales/${request.body.id}/aprobar`, { version: 1 });
    expect((await t.call('MED', 'GET', `/consultas/${consultationId}/detalle`)).status).toBe(200);
    const mine = await t.call('PAC', 'GET', '/me/accesos');
    expect(mine.status).toBe(200);
    const read = mine.body.find((row: any) => row.tipoDato === 'consulta' && row.accesoExcepcional);
    expect(read).toMatchObject({ rol: 'Médico', motivo: 'acceso excepcional' });
    expect(JSON.stringify(mine.body)).not.toContain('Cuenta ficticia');
    expect(mine.body.some((row: any) => row.tipoDato === 'acceso excepcional')).toBe(false);
    expect((await t.call('MED', 'GET', '/me/accesos')).status).toBe(403);
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
    expect((await t.call('PAC', 'GET', '/me/accesos')).body).toEqual([]);
  });
});
