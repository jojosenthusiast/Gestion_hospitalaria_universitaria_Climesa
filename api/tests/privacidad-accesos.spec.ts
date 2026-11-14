import { userId } from './support/database';
import { createTestApp, TestApp } from './support/app';
import { isRecordAccess } from '../src/privacy/privacy.rules';

jest.setTimeout(240000);
const start = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);

describe('110 · reglas puras de transparencia', () => {
  test('la transparencia deja fuera la gestión del acceso y los rechazos, incluidas las filas heredadas del módulo retirado', () => {
    expect(isRecordAccess('consulta.leer')).toBe(true);
    expect(isRecordAccess('acceso_excepcional.solicitar')).toBe(false);
    expect(isRecordAccess('acceso.denegado')).toBe(false);
  });
});

describe('110 · auditoría y quién vio mi expediente', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(start); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  test('FR-110-07: el delegado filtra la auditoría y detecta un registro alterado', async () => {
    expect((await t.call('DPD', 'GET', '/auditoria')).status).toBe(200);
    const byAction = await t.call('DPD', 'GET', '/auditoria?accion=auditoria.&limite=50');
    expect(byAction.status).toBe(200);
    expect(byAction.body.length).toBeGreaterThan(0);
    expect(byAction.body.every((row: any) => row.action.startsWith('auditoria.'))).toBe(true);
    const byPerson = await t.call('DPD', 'GET', `/auditoria?persona=${userId('DPD')}`);
    expect(byPerson.body.every((row: any) => row.actorId === userId('DPD'))).toBe(true);
    expect((await t.call('DPD', 'GET', '/auditoria?desde=no-es-fecha')).status).toBe(400);
    expect((await t.call('JOP', 'GET', '/auditoria')).status).toBe(403);

    const ok = await t.call('DPD', 'POST', '/auditoria/verificacion', {});
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ integra: true });
    expect(ok.body.revisados).toBeGreaterThan(0);
    // Tampering bypasses the API role on purpose: the chain must reveal it.
    const target = await t.one<{ seq: string }>("SELECT seq::text FROM plataforma.auditoria WHERE accion='auditoria.consultar' ORDER BY seq LIMIT 1");
    await t.pg.query("UPDATE plataforma.auditoria SET motivo='alterado' WHERE seq=$1", [target.seq]);
    const broken = await t.call('DPD', 'POST', '/auditoria/verificacion', {});
    expect(broken.body).toMatchObject({ integra: false, primeraFallida: Number(target.seq) });
  });

  test('espacio del auditor: filtros por rol, entidad y resultado, orden, páginas, detalle con hashes y exportación auditada', async () => {
    await t.call('JOP', 'GET', '/auditoria');                      // genera una fila denegada
    await t.call('DPD', 'GET', '/auditoria?accion=auditoria.');
    const denied = await t.call('DPD', 'GET', '/auditoria/registros?resultado=denegado,fallido&limite=10');
    expect(denied.status).toBe(200);
    expect(denied.body.total).toBeGreaterThan(0);
    expect(denied.body.filas.every((row: any) => row.result !== 'exito')).toBe(true);

    const byRole = await t.call('DPD', 'GET', '/auditoria/registros?rol=DPD&entidad=auditoria&limite=5&pagina=1&orden=accion&sentido=asc');
    expect(byRole.status).toBe(200);
    expect(byRole.body).toMatchObject({ pagina: 1, limite: 5 });
    expect(byRole.body.filas.length).toBeLessThanOrEqual(5);
    expect(byRole.body.filas.every((row: any) => row.role.split(',').includes('DPD') && row.entity === 'auditoria')).toBe(true);
    const actions = byRole.body.filas.map((row: any) => row.action);
    expect(actions).toEqual([...actions].sort());

    const second = await t.call('DPD', 'GET', '/auditoria/registros?limite=2&pagina=2');
    const first = await t.call('DPD', 'GET', '/auditoria/registros?limite=2&pagina=1');
    expect(second.body.filas.map((r: any) => r.seq)).not.toEqual(first.body.filas.map((r: any) => r.seq));
    expect(second.body.total).toBeGreaterThan(first.body.filas.length);   // cada consulta también se audita, por eso el total sube

    const many = await t.call('DPD', 'GET', '/auditoria/registros?accion=auditoria.consultar,acceso.&limite=50');
    expect(many.body.filas.every((r: any) => /^(auditoria\.consultar|acceso\.)/.test(r.action))).toBe(true);
    expect((await t.call('DPD', 'GET', '/auditoria/registros?orden=hash')).status).toBe(400);
    expect((await t.call('DPD', 'GET', '/auditoria/registros?resultado=bien')).status).toBe(400);
    expect((await t.call('JOP', 'GET', '/auditoria/registros')).status).toBe(403);

    const detail = await t.call('DPD', 'GET', `/auditoria/registros/${first.body.filas[0].seq}`);
    expect(detail.status).toBe(200);
    expect(detail.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.body.previousHash).toMatch(/^[0-9a-f]{64}$/);
    expect(detail.body.detail).not.toHaveProperty('canonicalEvent');
    expect((await t.call('DPD', 'GET', '/auditoria/registros/999999999')).status).toBe(404);
    expect((await t.call('DPD', 'GET', '/auditoria/registros/abc')).status).toBe(404);

    const options = await t.call('DPD', 'GET', '/auditoria/opciones');
    expect(options.body.acciones).toContain('auditoria.consultar');
    expect(options.body.roles).toContain('DPD');

    await t.call('DPD', 'GET', '/auditoria/registros?exportar=true&limite=5');
    const exported = await t.one<{ n: string }>("SELECT count(*)::text AS n FROM plataforma.auditoria WHERE accion='auditoria.exportar'");
    expect(Number(exported.n)).toBeGreaterThan(0);
  });

  test('escenario 4: Ana ve rol, fecha y motivo de quien vio su expediente, sin nombres', async () => {
    t.setNow(start);
    const patientId = await t.patient({ linkPac: true, name: 'Ana' });
    const consultation = await t.consultation(patientId);
    expect((await t.call('MED', 'GET', `/consultas/${consultation.id}/detalle`)).status).toBe(200);
    const mine = await t.call('PAC', 'GET', '/me/accesos');
    expect(mine.status).toBe(200);
    const read = mine.body.find((row: any) => row.tipoDato === 'consulta');
    expect(read).toMatchObject({ rol: 'Médico', motivo: 'atención' });
    expect(read).not.toHaveProperty('accesoExcepcional');
    expect(JSON.stringify(mine.body)).not.toContain('Cuenta ficticia');
    expect((await t.call('MED', 'GET', '/me/accesos')).status).toBe(403);
    await t.pg.query('UPDATE acceso.usuario SET paciente_id=NULL WHERE id=$1', [userId('PAC')]);
    expect((await t.call('PAC', 'GET', '/me/accesos')).body).toEqual([]);
  });

  test('un médico sin relación de atención recibe 403 aunque exista una fila heredada de acceso excepcional aprobada', async () => {
    t.setNow(start);
    const patientId = await t.patient({ linkPac: false, name: 'Ana' });
    const consultation = await t.consultation(patientId);
    const other = await t.one<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otro','Medico Ficticio','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id");
    await t.pg.query('UPDATE atencion.consulta SET medico_id=$2 WHERE id=$1', [consultation.id, other.id]);
    await t.pg.query("UPDATE atencion.relacion_atencion SET vigencia=tstzrange(lower(vigencia)-interval '2 days',lower(vigencia)-interval '1 day') WHERE paciente_id=$1", [patientId]);
    await t.pg.query(`INSERT INTO acceso.acceso_excepcional(solicitante_id,paciente_id,motivo,horas,vigencia,estado,resuelto_por,resuelto_en)
      VALUES($1,$2,'Fila heredada del módulo retirado',2,tstzrange($3::timestamptz - interval '1 minute',$3::timestamptz + interval '1 hour'),'aprobado',$4,$3)`, [userId('MED'), patientId, start, userId('DPD')]);
    expect((await t.call('MED', 'GET', `/consultas/${consultation.id}/detalle`)).status).toBe(403);
    expect((await t.call('MED', 'GET', `/pacientes/${patientId}/historial`)).status).toBe(403);
  });
});
