import { randomUUID } from 'node:crypto';
import { businessDate } from '../src/platform/clock';
import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);
const now = new Date('2026-11-14T16:00:00Z');
const MINUTE = 60_000;

// Ronda 1, observaciones 1 y 8: recepción registra pacientes sin que la búsqueda previa deba coincidir con los datos,
// y los selectores de pacientes, médicos y franjas son escalables y explican lo que no está disponible.
describe('Recepción · registrar pacientes y agendar con selectores', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(now); await t.enroll('MED'); });
  afterAll(async () => { await t?.close(); });

  const search = async (query: string, role = 'REC') => (await t.call(role, 'POST', '/pacientes/busquedas', { query })).body.token as string;
  const data = (over: Record<string, unknown> = {}) => ({ givenNames: 'Mariana', surnames: 'Quintero Rivas', sex: 'femenino', birth: '1991-05-06', phone: '7000-4455', ...over });

  describe('Obs. 1 · registro humano con búsqueda previa', () => {
    test('registra aunque el texto buscado no se parezca a los datos del paciente nuevo', async () => {
      const token = await search('xyz sin coincidencias');
      const created = await t.call('REC', 'POST', '/pacientes', { ...data(), searchToken: token, searchQuery: 'xyz sin coincidencias' });
      expect(created.status).toBe(201);
    });

    test('un intento fallido no consume la constancia y se puede reintentar con ella', async () => {
      const first = await t.call('REC', 'POST', '/pacientes', { ...data({ givenNames: 'Lucrecia', surnames: 'Ayala Mena', birth: '1980-02-03', dui: '00000001-8' }), searchToken: await search('Lucrecia'), searchQuery: 'Lucrecia' });
      expect(first.status).toBe(201);
      const token = await search('otro texto');
      const clash = await t.call('REC', 'POST', '/pacientes', { ...data({ givenNames: 'Otra', surnames: 'Persona', dui: '00000001-8' }), searchToken: token, searchQuery: 'otro texto' });
      expect(clash.status).toBe(409);
      expect(clash.body.codigo).toBe('dui_duplicado');
      expect(clash.body.paciente.record).toBeDefined();
      expect(clash.body.paciente.fullName).toBe('Lucrecia Ayala Mena');
      const retry = await t.call('REC', 'POST', '/pacientes', { ...data({ givenNames: 'Otra', surnames: 'Persona' }), searchToken: token, searchQuery: 'otro texto' });
      expect(retry.status).toBe(201);
      const spent = await t.call('REC', 'POST', '/pacientes', { ...data({ givenNames: 'Otra', surnames: 'Persona 2' }), searchToken: token, searchQuery: 'otro texto' });
      expect(spent.status).toBe(400);
    });

    test('mismo nombre y misma fecha de nacimiento responde 409 posible_duplicado con candidatos, salvo confirmarNuevo', async () => {
      const body = data({ givenNames: 'Rosalía', surnames: 'Cañas Portillo', birth: '1975-12-01' });
      expect((await t.call('REC', 'POST', '/pacientes', { ...body, searchToken: await search('Rosalía'), searchQuery: 'Rosalía' })).status).toBe(201);
      const token = await search('rosalia canas');
      const again = { ...data({ givenNames: 'Rosalia', surnames: 'Canas Portillo', birth: '1975-12-01' }), searchToken: token, searchQuery: 'rosalia canas' };
      const blocked = await t.call('REC', 'POST', '/pacientes', again);
      expect(blocked.status).toBe(409);
      expect(blocked.body.codigo).toBe('posible_duplicado');
      expect(blocked.body.candidatos).toHaveLength(1);
      expect(blocked.body.candidatos[0].fullName).toBe('Rosalía Cañas Portillo');
      const confirmed = await t.call('REC', 'POST', '/pacientes', { ...again, confirmarNuevo: true });
      expect(confirmed.status).toBe(201);
    });

    test('sin constancia válida sigue rechazando con 400', async () => {
      const bad = await t.call('REC', 'POST', '/pacientes', { ...data({ givenNames: 'Sin', surnames: 'Busqueda' }), searchToken: randomUUID(), searchQuery: 'sin busqueda' });
      expect(bad.status).toBe(400);
    });
  });

  describe('Obs. 8 · selector de pacientes', () => {
    beforeAll(async () => {
      for (const [n, s] of [['María Alejandra', 'Pérez Lopez'], ['María Valeria', 'Pérez Soto'], ['Mario', 'Ramos Cruz'], ['José María', 'Gómez Díaz']]) {
        const token = await search(n);
        const r = await t.call('REC', 'POST', '/pacientes', { ...data({ givenNames: n, surnames: s, birth: '1990-01-0' + (1 + n.length % 8) }), searchToken: token, searchQuery: n });
        expect(r.status).toBe(201);
      }
    });

    test('"maria" encuentra con y sin tilde y devuelve solo id, expediente, nombre y edad', async () => {
      const r = await t.call('REC', 'GET', '/pacientes/selector?query=maria&limit=10');
      expect(r.status).toBe(200);
      const names = r.body.items.map((p: any) => p.fullName);
      expect(names).toEqual(expect.arrayContaining(['María Alejandra Pérez Lopez', 'María Valeria Pérez Soto', 'José María Gómez Díaz']));
      expect(names).not.toContain('Mario Ramos Cruz');
      expect(Object.keys(r.body.items[0]).sort()).toEqual(['age', 'fullName', 'id', 'record']);
      expect(typeof r.body.items[0].age).toBe('number');
    });

    test('pagina con offset y avisa si hay más', async () => {
      const a = await t.call('REC', 'GET', '/pacientes/selector?query=maria&limit=2&offset=0');
      const b = await t.call('REC', 'GET', '/pacientes/selector?query=maria&limit=2&offset=2');
      expect(a.body.items).toHaveLength(2);
      expect(a.body.hasMore).toBe(true);
      expect(b.body.items.length).toBeGreaterThanOrEqual(1);
      expect(a.body.items.map((p: any) => p.id)).not.toContain(b.body.items[0].id);
    });

    test('el límite del selector es corto y la búsqueda general también acepta offset', async () => {
      expect((await t.call('REC', 'GET', '/pacientes/selector?query=maria&limit=51')).status).toBe(400);
      const full = await t.call('REC', 'GET', '/pacientes?query=maria&limit=50');
      const page = await t.call('REC', 'GET', '/pacientes?query=maria&limit=1&offset=1');
      expect(page.status).toBe(200);
      expect(page.body[0].id).toBe(full.body[1].id);
    });

    test('el catálogo de citas ya no lista pacientes a recepción', async () => {
      const r = await t.call('REC', 'GET', '/citas/catalogos');
      expect(r.status).toBe(200);
      expect(r.body.patients).toEqual([]);
    });
  });

  describe('Obs. 8 · médicos con turno y franjas del día', () => {
    const day = businessDate(new Date(now.valueOf() + 86_400_000));
    const at = (h: number) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00-06:00`);
    let doctorId: string;
    beforeAll(async () => { doctorId = await t.staffOf('MED'); });

    test('los médicos indican si tienen turno ese día y el motivo cuando no', async () => {
      const without = await t.call('REC', 'GET', `/citas/catalogos?date=${day}`);
      const doc = without.body.doctors.find((d: any) => d.id === doctorId);
      expect(doc.tieneTurno).toBe(false);
      expect(doc.motivo).toBe('Sin turno ese día');
      await t.shift('MED', at(8), at(12));
      const withShift = await t.call('REC', 'GET', `/citas/catalogos?date=${day}`);
      const again = withShift.body.doctors.find((d: any) => d.id === doctorId);
      expect(again.tieneTurno).toBe(true);
      expect(again.motivo).toBeNull();
    });

    test('devuelve todas las franjas con estado libre u ocupado y motivo corto', async () => {
      const patientId = await t.patient();
      expect((await t.call('REC', 'POST', '/citas', { patientId, doctorId, start: at(8).toISOString(), end: new Date(at(8).valueOf() + 20 * MINUTE).toISOString() })).status).toBe(201);
      const r = await t.call('REC', 'GET', `/citas/disponibilidad?doctorId=${doctorId}&date=${day}`);
      expect(r.status).toBe(200);
      expect(r.body.franjas).toHaveLength(12);
      expect(r.body.franjas[0]).toMatchObject({ estado: 'ocupado', motivo: 'Ocupado' });
      expect(r.body.franjas[1]).toMatchObject({ estado: 'libre', motivo: null });
      expect(r.body.slots).toHaveLength(11);
    });

    test('un día sin turno marca la rejilla estándar como sin_turno', async () => {
      const other = businessDate(new Date(now.valueOf() + 3 * 86_400_000));
      const r = await t.call('REC', 'GET', `/citas/disponibilidad?doctorId=${doctorId}&date=${other}`);
      expect(r.body.franjas.length).toBeGreaterThan(0);
      expect(r.body.franjas.every((f: any) => f.estado === 'sin_turno' && f.motivo === 'Médico sin turno')).toBe(true);
      expect(r.body.slots).toEqual([]);
    });

    test('las franjas ya transcurridas salen como pasado', async () => {
      const today = businessDate(now);
      await t.shift('MED', new Date(`${today}T06:00:00-06:00`), new Date(`${today}T11:00:00-06:00`));
      const r = await t.call('REC', 'GET', `/citas/disponibilidad?doctorId=${doctorId}&date=${today}`);
      // now = 10:00 hora local: de 06:00 a 10:00 son 12 franjas pasadas.
      const past = r.body.franjas.filter((f: any) => f.estado === 'pasado');
      expect(past.length).toBe(12);
      expect(past[0].motivo).toBe('Ya pasó');
    });
  });
});
