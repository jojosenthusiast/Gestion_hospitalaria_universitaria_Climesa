import { randomUUID } from 'node:crypto';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const HOUR = 3600_000;
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000);
const ENF_HOSPITAL = ['admision.ver', 'pacientes.ver_ficha', 'camas.ver_ocupante', 'enfermeria.registrar'];

// Lote 5 S10, «Todo el hospital» (20261129005000): nursing works every floor, not only the area of its shift.
describe('Lote 5 S10 · Enfermería trabaja en todo el hospital', () => {
  let t: TestApp;
  let patientId: string;
  let admissionId: string;
  beforeAll(async () => {
    t = await createTestApp(now);
    // Shift on floor 2 (P2-HOS); the patient lies in a VIP bed on floor 3 (P3-VIP).
    await t.shift('ENF', new Date(now.valueOf() - 2 * HOUR), new Date(now.valueOf() + 6 * HOUR), 'P2-HOS');
    patientId = await t.patient();
    const bed = await t.one<{ id: string; padre_id: string }>("SELECT id,padre_id FROM infra.espacio WHERE codigo='VIP-301-A'");
    admissionId = (await t.one<{ id: string }>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado,motivo) VALUES($1,'consulta',$2,'vip','femenino',$3,'hospitalizado','Ingreso de prueba') RETURNING id", [patientId, randomUUID(), await t.staffOf('MED')])).id;
    await t.pg.query("INSERT INTO hospitalizacion.ocupacion_cama(admision_id,cama_id,habitacion_id,categoria,periodo) VALUES($1,$2,$3,'vip',tstzrange($4::timestamptz,NULL,'[)'))", [admissionId, bed.id, bed.padre_id, new Date(now.valueOf() - HOUR)]);
  });
  afterAll(async () => { await t?.close(); });

  test('the four nursing permissions have the whole-hospital context; the rest keep theirs', async () => {
    const rows = (await t.pg.query<{ permiso_codigo: string; contexto: string }>("SELECT permiso_codigo,contexto FROM acceso.rol_permiso WHERE rol_codigo='ENF' AND permiso_codigo = ANY($1::text[]) ORDER BY permiso_codigo", [[...ENF_HOSPITAL, 'expediente.ver', 'resultados.ver', 'inventario.mover']])).rows;
    expect(Object.fromEntries(rows.map(r => [r.permiso_codigo, r.contexto]))).toEqual({
      'admision.ver': 'x', 'pacientes.ver_ficha': 'x', 'camas.ver_ocupante': 'x', 'enfermeria.registrar': 'x',
      'expediente.ver': 'relacion', 'resultados.ver': 'relacion', 'inventario.mover': 'consumo',
    });
  });

  test('ENF on shift on floor 2 reads /admisiones and the file of a patient in a floor-3 bed', async () => {
    const list = await t.call('ENF', 'GET', '/admisiones');
    expect(list.status).toBe(200);
    expect((list.body as any[]).some(a => a.id === admissionId)).toBe(true);
    const file = await t.call('ENF', 'GET', `/pacientes/${patientId}`);
    expect([file.status, file.body.id]).toEqual([200, patientId]);
  });

  test('with the previous area context the same reads are refused (what the migration changes)', async () => {
    await t.pg.query("UPDATE acceso.rol_permiso SET contexto='area' WHERE rol_codigo='ENF' AND permiso_codigo = ANY($1::text[])", [ENF_HOSPITAL]);
    try {
      expect((await t.call('ENF', 'GET', `/pacientes/${patientId}`)).status).toBe(403);
      const list = await t.call('ENF', 'GET', '/admisiones');
      expect(list.status === 403 || !(list.body as any[]).some(a => a.id === admissionId)).toBe(true);
    } finally {
      await t.pg.query("UPDATE acceso.rol_permiso SET contexto='x' WHERE rol_codigo='ENF' AND permiso_codigo = ANY($1::text[])", [ENF_HOSPITAL]);
    }
  });
});
