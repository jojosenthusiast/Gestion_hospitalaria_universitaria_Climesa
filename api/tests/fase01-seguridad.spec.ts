import { AuditService } from '../src/platform/audit.service';
import { businessDate } from '../src/platform/clock';
import { createTestApp, type TestApp } from './support/app';

jest.setTimeout(120000);
const now = new Date('2026-11-20T15:00:00Z');

describe('Fase 0/1 seguridad y privacidad', () => {
  let t: TestApp, record = '';
  beforeAll(async () => {
    t = await createTestApp(now);
    // Direct insert has no search text: the patient is found by its record number.
    record = (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [await t.patient({ name: 'Rangoedad' })])).expediente;
  });
  afterAll(async () => { await t.close(); });

  describe('MA-SEG-06: Laboratorio busca pacientes con rango de edad, nunca con la fecha exacta', () => {
    test('LAB recibe ageRange sin birth; REC recibe la fecha exacta', async () => {
      const lab = await t.call('LAB', 'GET', `/pacientes?query=${record}`);
      expect(lab.status).toBe(200);
      expect(lab.body[0]).not.toHaveProperty('birth');
      expect(lab.body[0].ageRange).toBe('30-39');
      const rec = await t.call('REC', 'GET', `/pacientes?query=${record}`);
      expect(rec.body[0].birth).toBe('1990-01-01');
      expect(rec.body[0]).not.toHaveProperty('ageRange');
    });

    test('la constancia de búsqueda tampoco entrega la fecha exacta a LAB', async () => {
      const lab = await t.call('LAB', 'POST', '/pacientes/busquedas', { query: record });
      expect(lab.status).toBe(201);
      expect(lab.body.candidates[0]).not.toHaveProperty('birth');
      expect(lab.body.candidates[0].ageRange).toBe('30-39');
    });
  });

  describe('MA-SEG-08: la verificación de la cadena compara actor_rol y registrado_en', () => {
    const verify = () => t.app.get(AuditService).verifyChain();
    test('alterar el rol del actor o la hora de una fila rompe la cadena en esa fila', async () => {
      await t.call('REC', 'GET', `/pacientes?query=${record}`);
      expect((await verify()).ok).toBe(true);
      const row = await t.one<{ seq: string; actor_rol: string; registrado_en: Date }>("SELECT seq,actor_rol,registrado_en FROM plataforma.auditoria WHERE actor_rol='REC' ORDER BY seq DESC LIMIT 1");
      await t.pg.query("UPDATE plataforma.auditoria SET actor_rol='ADM' WHERE seq=$1", [row.seq]);
      expect(await verify()).toMatchObject({ ok: false, seq: Number(row.seq), reason: expect.stringContaining('actorRole') });
      await t.pg.query('UPDATE plataforma.auditoria SET actor_rol=$2 WHERE seq=$1', [row.seq, row.actor_rol]);
      await t.pg.query("UPDATE plataforma.auditoria SET registrado_en=registrado_en - interval '1 day' WHERE seq=$1", [row.seq]);
      expect(await verify()).toMatchObject({ ok: false, seq: Number(row.seq), reason: expect.stringContaining('at') });
      await t.pg.query('UPDATE plataforma.auditoria SET registrado_en=$2 WHERE seq=$1', [row.seq, row.registrado_en]);
      expect((await verify()).ok).toBe(true);
    });
  });
  describe('MA-SEG-05: cada exportación de una lista queda auditada', () => {
    test('POST /exportaciones registra quién exportó qué lista, cuántas filas y en qué formato', async () => {
      const response = await t.call('REC', 'POST', '/exportaciones', { resource: 'pacientes', rows: 12, format: 'csv' });
      expect(response.status).toBe(201);
      const audit = await t.one<{ entidad: string; detalle: Record<string, unknown> }>("SELECT entidad,detalle FROM plataforma.auditoria WHERE accion='datos.exportar' ORDER BY seq DESC LIMIT 1");
      expect(audit.entidad).toBe('pacientes');
      expect(audit.detalle).toMatchObject({ filas: 12, formato: 'csv' });
    });
    test('formato o lista inválidos responden 400 y no auditan', async () => {
      const before = (await t.audits('datos.exportar')).length;
      expect((await t.call('REC', 'POST', '/exportaciones', { resource: 'pacientes', rows: 1, format: 'docx' })).status).toBe(400);
      expect((await t.call('REC', 'POST', '/exportaciones', { resource: '../x', rows: 1, format: 'csv' })).status).toBe(400);
      expect((await t.audits('datos.exportar')).length).toBe(before);
    });
  });
  describe('MA-SEG-07: el historial de signos exige un contexto de atención', () => {
    const DAY = 86_400_000;
    const oldVitals = async (patientId: string) => t.pg.query('INSERT INTO atencion.signos_vitales(paciente_id,tomado_por,tomado_en,fc) VALUES($1,$2,$3,70)', [patientId, await t.staffOf('ENF'), new Date(now.valueOf() - 3 * DAY)]);
    test('sin relación, ingreso, ambulancia ni actividad del día responde 403', async () => {
      const patientId = await t.patient();
      await oldVitals(patientId);
      for (const role of ['AST', 'ENF', 'MED', 'PAR']) expect({ role, status: (await t.call(role, 'GET', `/pacientes/${patientId}/signos`)).status }).toEqual({ role, status: 403 });
    });
    test('con un número de fila de hoy o un ingreso vigente sí se lee', async () => {
      const queued = await t.patient();
      await oldVitals(queued);
      await t.pg.query("INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id,estado) VALUES('consulta_general',$2::date,987,$1,'en_espera')", [queued, businessDate(now)]);
      expect((await t.call('AST', 'GET', `/pacientes/${queued}/signos`)).status).toBe(200);
      const admitted = await t.patient();
      expect((await t.call('REC', 'POST', '/admisiones', await t.admissionBody(admitted, { requestedCategory: 'semiprivada', isolation: false }))).status).toBe(201);
      expect((await t.call('ENF', 'GET', `/pacientes/${admitted}/signos`)).status).toBe(200);
    });
  });
});
