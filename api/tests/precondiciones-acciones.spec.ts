import { createTestApp, TestApp } from './support/app';

jest.setTimeout(300000);
/** Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. Nothing here depends on the real "now". */
const NOW = new Date('2026-12-02T15:00:00Z');
const at = (local: string) => new Date(`2026-12-02T${local}:00-06:00`);
const attachment = { fileName: 'informe-externo.pdf', mimeType: 'application/pdf', sizeBytes: 182000 };

/**
 * Preconditions sweep (S1-S5): every flag a client reads to offer or disable an action agrees with the command it
 * stands for. When the flag allows it the command passes; when it does not, the command is refused.
 */
describe('Precondiciones: lo que el cliente ofrece es lo que la API acepta', () => {
  let t: TestApp;
  let glu: string;
  const record = async (id: string) => (await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [id])).expediente;
  const pick = async (role: string, id: string) => {
    const page = await t.call(role, 'GET', `/pacientes/selector?query=${encodeURIComponent(await record(id))}&limit=10&offset=0`);
    expect(page.status).toBe(200);
    return page.body.items.find((p: any) => p.id === id);
  };

  beforeAll(async () => {
    t = await createTestApp(NOW);
    await t.enroll('MED');
    glu = (await t.one<{ id: string }>("SELECT id FROM laboratorio.examen WHERE codigo='GLU'")).id;
  });
  afterAll(async () => { await t?.close(); });

  describe('S1: GET /pacientes/selector', () => {
    test('active: an inactive patient is listed with active=false and the queue refuses it; an active one passes', async () => {
      const active = await t.patient({});
      const inactive = await t.patient({});
      await t.pg.query("UPDATE pacientes.paciente SET estado='inactivo' WHERE id=$1", [inactive]);
      expect((await pick('REC', active)).active).toBe(true);
      expect((await pick('REC', inactive)).active).toBe(false);
      expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: active })).status).toBe(201);
      const refused = await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: inactive });
      expect(refused.status).toBe(400);
    });

    test('activeAdmission: false lets the admission through; true after it, and a second admission is refused', async () => {
      const patientId = await t.patient({});
      expect((await pick('REC', patientId)).activeAdmission).toBe(false);
      const body = await t.admissionBody(patientId, { requestedCategory: 'semiprivada', isolation: false });
      const created = await t.call('REC', 'POST', '/admisiones', body);
      expect(created.status).toBe(201);
      expect((await pick('REC', patientId)).activeAdmission).toBe(true);
      const again = await t.call('REC', 'POST', '/admisiones', body);
      expect(again.status).toBe(409);
    });

    test('careContext: same rule as vital signs; false is refused (403), true reads the vitals', async () => {
      const stranger = await t.patient({});
      const today = await t.patient({});
      expect((await t.call('REC', 'POST', '/fila', { service: 'consulta_general', patientId: today })).status).toBe(201);
      expect((await pick('ENF', stranger)).careContext).toBe(false);
      expect((await t.call('ENF', 'GET', `/pacientes/${stranger}/signos`)).status).toBe(403);
      expect((await pick('ENF', today)).careContext).toBe(true);
      expect((await t.call('ENF', 'GET', `/pacientes/${today}/signos`)).status).toBe(200);
      // Callers without clinical context requirements still get the flag.
      expect(typeof (await pick('REC', today)).careContext).toBe('boolean');
    });
  });

  describe('S2: GET /pacientes?query= careRelation', () => {
    test('true opens the clinical history; false is refused', async () => {
      const related = await t.patient({ name: 'Relacionada' });
      await t.consultation(related);
      const other = await t.patient({ name: 'Ajena' });
      const find = async (id: string) => {
        const found = await t.call('MED', 'GET', `/pacientes?query=${encodeURIComponent(await record(id))}`);
        expect(found.status).toBe(200);
        return (found.body as any[]).find(p => p.id === id);
      };
      expect((await find(related)).careRelation).toBe(true);
      expect((await t.call('MED', 'GET', `/pacientes/${related}/historial`)).status).toBe(200);
      expect((await find(other)).careRelation).toBe(false);
      expect((await t.call('MED', 'GET', `/pacientes/${other}/historial`)).status).toBe(403);
    });
  });

  describe('S3: admission allowedActions nota_enfermeria', () => {
    const hospitalize = async (code: string) => {
      const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(await t.patient(), { requestedCategory: 'semiprivada', isolation: false }));
      expect(created.status).toBe(201);
      const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
      expect((await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version })).status).toBe(201);
      return created.body.id as string;
    };
    const note = { text: 'Paciente estable, sin dolor, tolera la dieta.' };

    test('offered with a shift in the bed area (the note passes); not offered without it (the note is refused)', async () => {
      const admissionId = await hospitalize('HAB-205-A');
      // ENF sees every admission here so the row without a shift is visible too.
      await t.pg.query("UPDATE acceso.rol_permiso SET contexto='x' WHERE rol_codigo='ENF' AND permiso_codigo='admision.ver'");
      try {
        const row = async () => ((await t.call('ENF', 'GET', '/admisiones')).body as any[]).find(a => a.id === admissionId);
        expect((await row()).allowedActions).not.toContain('nota_enfermeria');
        expect((await t.call('ENF', 'POST', `/admisiones/${admissionId}/notas-enfermeria`, note)).status).toBe(403);
        await t.shift('ENF', at('06:00'), at('14:00'), 'P2-HOS');
        expect((await row()).allowedActions).toContain('nota_enfermeria');
        expect((await t.call('ENF', 'POST', `/admisiones/${admissionId}/notas-enfermeria`, note)).status).toBe(201);
      } finally {
        await t.pg.query("UPDATE acceso.rol_permiso SET contexto='area' WHERE rol_codigo='ENF' AND permiso_codigo='admision.ver'");
      }
    });
  });

  describe('S4: GET /pacientes/{id}/historial allowedActions resultado_externo', () => {
    const external = (patientId: string) => t.call('MED', 'POST', `/laboratorio/pacientes/${patientId}/resultado-externo`, { place: 'Laboratorio Ejemplo', results: [{ examId: glu, value: 90 }], attachment });

    test('offered with a relation and an own consultation: the POST passes', async () => {
      const patientId = await t.patient({});
      await t.consultation(patientId);
      const history = await t.call('MED', 'GET', `/pacientes/${patientId}/historial`);
      expect(history.status).toBe(200);
      expect(history.body.allowedActions).toEqual(['resultado_externo']);
      expect((await external(patientId)).status).toBe(201);
    });

    test('not offered when the only consultation belongs to another doctor: the POST is refused', async () => {
      const patientId = await t.patient({});
      const consultation = await t.consultation(patientId);
      const other = (await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otra','Médica Prueba','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`)).id;
      await t.pg.query('UPDATE atencion.consulta SET medico_id=$2 WHERE id=$1', [consultation.id, other]);
      await t.pg.query(`INSERT INTO atencion.relacion_atencion(paciente_id,profesional_id,origen,origen_id,vigencia) VALUES($1,$2,'ambulancia',gen_random_uuid(),tstzrange($3::timestamptz - interval '1 day',$3::timestamptz + interval '30 days'))`, [patientId, await t.staffOf('MED'), NOW]);
      const history = await t.call('MED', 'GET', `/pacientes/${patientId}/historial`);
      expect(history.status).toBe(200);
      expect(history.body.allowedActions).toEqual([]);
      expect((await external(patientId)).status).toBe(409);
    });

    test('the patient reading the own history is never offered it', async () => {
      const patientId = await t.patient({ linkPac: true });
      await t.consultation(patientId);
      const own = await t.call('PAC', 'GET', `/pacientes/${patientId}/historial`);
      expect(own.status).toBe(200);
      expect(own.body.allowedActions).toEqual([]);
    });
  });

  describe('S5: ambulance activeService.allowedActions', () => {
    const unit = () => t.one<{ version: number }>('SELECT version FROM ambulancia.unidad');
    const activeService = async (role: string) => (await t.call(role, 'GET', '/ambulancia')).body.activeService;

    test('the crew gets hito, deshacer_hito and reportar, each accepted; others get none and are refused', async () => {
      await t.shift('PAR', at('06:00'), at('18:00'));
      const driver = await t.driverShift(at('06:00'), at('18:00'));
      expect((await t.call('JOP', 'POST', '/ambulancia/mantenimiento', { version: (await unit()).version, inMaintenance: false, reason: 'Inicio de turno con tripulación' })).status).toBe(201);
      const par = await t.staffOf('PAR');
      const service = (await t.call('REC', 'POST', '/ambulancia/servicios', { version: (await unit()).version, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia', crew: [par, driver], origin: 'Residencial Ficticia, casa 1' })).body;
      expect(service.id).toEqual(expect.any(String));

      // Fresh service: a milestone and a report, nothing to undo yet.
      let crewView = await activeService('PAR');
      expect(crewView.allowedActions).toEqual(expect.arrayContaining(['hito', 'reportar']));
      expect(crewView.allowedActions).not.toContain('deshacer_hito');
      expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos`, { type: 'salida' })).status).toBe(201);
      crewView = await activeService('PAR');
      expect(crewView.allowedActions).toContain('deshacer_hito');
      const version = (await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [service.id])).version;
      expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos/deshacer`, { version })).status).toBe(201);
      expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/prehospital`, { reason: 'Dolor torácico opresivo', priority: 'roja', capturedAt: NOW.toISOString() })).status).toBe(201);
      expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos`, { type: 'salida' })).status).toBe(201);

      // More than 15 minutes later the milestone can no longer be undone, and it is not offered.
      t.setNow(new Date(NOW.valueOf() + 16 * 60_000));
      try {
        crewView = await activeService('PAR');
        expect(crewView.allowedActions).not.toContain('deshacer_hito');
        const late = await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos/deshacer`, { version: (await t.one<{ version: number }>('SELECT version FROM ambulancia.servicio WHERE id=$1', [service.id])).version });
        expect(late.status).toBe(409);
      } finally {
        t.setNow(NOW);
      }

      // Dispatch and Jefatura see the service without crew actions.
      expect((await activeService('REC')).allowedActions).toEqual([]);
      expect((await activeService('JOP')).allowedActions).toEqual(['cerrar']);

      // A paramedic who is not on this crew sees it read-only and the API refuses the milestone.
      const other = (await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otro','Paramédico Prueba','paramedico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id`)).id;
      await t.pg.query('UPDATE ambulancia.tripulacion SET persona_id=$3 WHERE servicio_id=$1 AND persona_id=$2', [service.id, par, other]);
      expect((await activeService('PAR')).allowedActions).toEqual([]);
      expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/hitos`, { type: 'en_escena' })).status).toBe(403);
      expect((await t.call('PAR', 'POST', `/ambulancia/servicios/${service.id}/prehospital`, { reason: 'Dolor torácico', priority: 'roja', capturedAt: NOW.toISOString() })).status).toBe(403);
    });
  });
});
