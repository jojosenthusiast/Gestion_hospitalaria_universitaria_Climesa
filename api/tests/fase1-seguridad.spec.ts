import { randomUUID } from 'node:crypto';
import { productionEnvironmentProblems } from '../src/config/environment';
import { rateLimitPerMinute, trustProxyHops } from '../src/config/security';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 10 * 60_000);
const MINUTE = 60_000;

describe('Fase 1 · seguridad (SEG-03, SEG-08, SEG-09, API-19)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const hospitalize = async (code: string) => {
    const created = await t.call('REC', 'POST', '/admisiones', await t.admissionBody(await t.patient(), { requestedCategory: 'semiprivada', isolation: false }));
    expect(created.status).toBe(201);
    const bed = await t.one<{ id: string; version: number }>('SELECT id,version FROM infra.espacio WHERE codigo=$1', [code]);
    const assigned = await t.call('REC', 'POST', `/admisiones/${created.body.id}/cama`, { bedId: bed.id, version: bed.version });
    expect(assigned.status).toBe(201);
    return { id: created.body.id as string, version: assigned.body.version as number };
  };
  const nurseShiftInWard = async () => {
    await t.pg.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange($2::timestamptz,$3::timestamptz,'[)'),'diurno','publicado' FROM infra.espacio WHERE codigo='P2-HOS'`, [await t.staffOf('ENF'), new Date(now.valueOf() - 60 * MINUTE), new Date(now.valueOf() + 7 * 60 * MINUTE)]);
  };
  const note = { text: 'Paciente estable, sin dolor, tolera la dieta.' };

  describe('SEG-08: cabeceras de seguridad en la API', () => {
    test('toda respuesta lleva nosniff, prohíbe marcos, no envía referer y declara CSP y HSTS', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/salud' });
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(String(response.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
      expect(String(response.headers['content-security-policy'])).toContain("default-src 'self'");
      expect(response.headers['strict-transport-security']).toMatch(/max-age=\d+/);
      expect(response.headers['cache-control']).toBe('no-store');
    });
    test('los errores de la API también llevan las cabeceras', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(response.statusCode).toBe(401);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('SEG-03: notas de enfermería y firma de alta con contexto y estado', () => {
    test('ENF sin turno en el área del paciente no registra notas ni ve la admisión', async () => {
      const admission = await hospitalize('HAB-205-A');
      const saved = await t.call('ENF', 'POST', `/admisiones/${admission.id}/notas-enfermeria`, note);
      expect(saved.status).toBe(403);
      expect(saved.body.codigo).toBe('sin_permiso');
      const list = await t.call('ENF', 'GET', '/admisiones');
      expect(list.status).toBe(200);
      expect(list.body.some((row: any) => row.id === admission.id)).toBe(false);
    });

    test('ENF con turno en el área registra la nota y ve la admisión; no escribe en un egresado', async () => {
      await nurseShiftInWard();
      const admission = await hospitalize('HAB-205-B');
      expect((await t.call('ENF', 'POST', `/admisiones/${admission.id}/notas-enfermeria`, note)).status).toBe(201);
      const list = await t.call('ENF', 'GET', '/admisiones');
      expect(list.body.some((row: any) => row.id === admission.id)).toBe(true);

      const alta = { type: 'medica', summary: 'Evolución favorable sin complicaciones', pending: [], version: admission.version };
      const signed = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, alta);
      expect(signed.status).toBe(201);
      // Discharge signed, patient still in the bed: the nurse can still write.
      expect((await t.call('ENF', 'POST', `/admisiones/${admission.id}/notas-enfermeria`, note)).status).toBe(201);
      t.setNow(new Date(now.valueOf() + 5 * MINUTE));
      try {
        const current = await t.one<{ version: number }>('SELECT version FROM hospitalizacion.admision WHERE id=$1', [admission.id]);
        expect((await t.call('REC', 'POST', `/admisiones/${admission.id}/salida`, { version: current.version, reason: 'Egreso por alta médica firmada' })).status).toBe(201);
        const late = await t.call('ENF', 'POST', `/admisiones/${admission.id}/notas-enfermeria`, note);
        // The bed is free after the exit, so the area context no longer applies either; never 201.
        expect([403, 409]).toContain(late.status);
      } finally { t.setNow(now); }
      const egresado = await t.one<{ n: number }>("SELECT count(*)::int AS n FROM hospitalizacion.nota_enfermeria WHERE admision_id=$1", [admission.id]);
      expect(egresado.n).toBe(2);
    });

    test('una admisión egresada rechaza notas aunque la enfermera tenga contexto x', async () => {
      const admission = await hospitalize('HAB-206-A');
      await t.pg.query("UPDATE hospitalizacion.admision SET estado='egresado' WHERE id=$1", [admission.id]);
      await t.pg.query("UPDATE acceso.rol_permiso SET contexto='x' WHERE rol_codigo='ENF' AND permiso_codigo='enfermeria.registrar'");
      try {
        const saved = await t.call('ENF', 'POST', `/admisiones/${admission.id}/notas-enfermeria`, note);
        expect(saved.status).toBe(409);
      } finally {
        await t.pg.query("UPDATE acceso.rol_permiso SET contexto='area' WHERE rol_codigo='ENF' AND permiso_codigo='enfermeria.registrar'");
      }
    });

    test('un MED que no es el tratante ni tiene relación vigente no firma el alta', async () => {
      const admission = await hospitalize('HAB-206-B');
      const other = await t.one<{ id: string }>("INSERT INTO personal.persona(nombres,apellidos,tipo,area_id) SELECT 'Otro','Médico Ficticio','medico',id FROM infra.espacio WHERE codigo='P1-CON' RETURNING id");
      await t.pg.query('UPDATE hospitalizacion.admision SET medico_tratante_id=$2 WHERE id=$1', [admission.id, other.id]);
      const alta = { type: 'medica', summary: 'Evolución favorable sin complicaciones', pending: [], version: admission.version };
      const denied = await t.call('MED', 'POST', `/admisiones/${admission.id}/alta`, alta);
      expect(denied.status).toBe(403);
      expect(denied.body.versionActual).toBeUndefined();
      const state = await t.one<{ estado: string }>('SELECT estado FROM hospitalizacion.admision WHERE id=$1', [admission.id]);
      expect(state.estado).toBe('hospitalizado');
    });
  });

  describe('SEG-09: la búsqueda de pacientes audita qué pacientes expuso', () => {
    test.each([['GET'], ['POST']])('%s guarda los ids devueltos en el detalle de la auditoría', async method => {
      const id = await t.patient();
      const { expediente } = await t.one<{ expediente: string }>('SELECT expediente FROM pacientes.paciente WHERE id=$1', [id]);
      const response = method === 'GET'
        ? await t.call('REC', 'GET', `/pacientes?query=${encodeURIComponent(expediente)}`)
        : await t.call('REC', 'POST', '/pacientes/busquedas', { query: expediente });
      expect(response.status).toBeLessThan(300);
      const rows = method === 'GET' ? response.body : response.body.candidates;
      expect(rows.map((p: any) => p.id)).toEqual([id]);
      const audits = await t.audits('pacientes.buscar');
      const last = audits[audits.length - 1];
      expect(last.detalle.patientIds).toEqual([id]);
      expect(last.detalle.count).toBe(1);
      expect(JSON.stringify(last.detalle)).not.toContain(expediente);
    });
  });
});

describe('Fase 1 · configuración (API-19, SEG-08)', () => {
  const complete = { NODE_ENV: 'production', SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', SUPABASE_SECRET_KEY: 'sb_secret_x', DATABASE_URL: 'postgresql://sghu_api@db.example.invalid/postgres' };
  test('producción completa no tiene problemas; fuera de producción no se exige nada', () => {
    expect(productionEnvironmentProblems(complete)).toEqual([]);
    expect(productionEnvironmentProblems({ NODE_ENV: 'development' })).toEqual([]);
  });
  test.each(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'DATABASE_URL'])('producción sin %s no arranca', name => {
    expect(productionEnvironmentProblems({ ...complete, [name]: '' })).toContain(`Falta la variable ${name}.`);
  });
  test('producción exige HTTPS y una clave privada', () => {
    expect(productionEnvironmentProblems({ ...complete, SUPABASE_URL: 'http://proyecto.supabase.co' })).toContain('Supabase requiere HTTPS en producción.');
    expect(productionEnvironmentProblems({ ...complete, SUPABASE_SECRET_KEY: '' }).join(' ')).toContain('SUPABASE_SECRET_KEY');
    expect(productionEnvironmentProblems({ ...complete, SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: 'llave' })).toEqual([]);
  });
  test('límite y saltos de proxy: valores inválidos vuelven al valor seguro', () => {
    expect(rateLimitPerMinute(undefined)).toBe(300);
    expect(rateLimitPerMinute('0')).toBe(300);
    expect(rateLimitPerMinute('abc')).toBe(300);
    expect(rateLimitPerMinute('50')).toBe(50);
    expect(trustProxyHops({})).toBe(0);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '1' })).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '-2' })).toBe(0);
  });
});
