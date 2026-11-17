import { createTestApp, TestApp } from './support/app';

jest.setTimeout(240000);
// Fixed clock: Monday 16 Nov 2026, 09:00 in El Salvador; the appointments are on Tuesday 17.
const now = new Date('2026-11-16T15:00:00Z');

/** The 400 body that clients without `reasonCode` received before R7 (captured from the base branch). iOS reads `errors`. */
const invalid = (rule: 'required' | 'min10') => ({
  type: 'urn:sghu:error:validacion', title: 'Datos no válidos', status: 400, codigo: 'validacion', campo: 'reason',
  detail: rule === 'required' ? 'Revisa el campo reason: es obligatorio.' : 'Revisa el campo reason: debe tener al menos 10 caracteres.',
  errors: [{ field: 'reason', message: rule === 'required' ? 'Es obligatorio.' : 'Debe tener al menos 10 caracteres.' }],
});

/** R7 U1 (A4): `POST /citas/{id}/cancelar` without `reasonCode` keeps the exact pre-R7 contract for released apps. */
describe('R7 U1 · cancelar sin reasonCode conserva el contrato anterior', () => {
  let t: TestApp;
  let patientId: string;
  let slot = 0;
  beforeAll(async () => {
    t = await createTestApp(now);
    await t.enroll('MED');
    await t.shift('MED', new Date(Date.UTC(2026, 10, 17, 14)), new Date(Date.UTC(2026, 10, 17, 23)));
    patientId = await t.patient({ linkPac: true, name: 'Lucía' });
  });
  afterAll(async () => { await t?.close(); });

  const cases: Array<[string, Record<string, unknown>, 201 | 'required' | 'min10']> = [
    ['no reason', { version: 1 }, 'required'],
    ['null reason', { version: 1, reason: null }, 'required'],
    ['short reason', { version: 1, reason: 'corto' }, 'min10'],
    ['three spaces', { version: 1, reason: '   ' }, 'min10'],
    ['empty reason', { version: 1, reason: '' }, 'min10'],
    ['ten spaces', { version: 1, reason: '          ' }, 201],
    ['padded short text', { version: 1, reason: '   abc     ' }, 201],
  ];
  for (const role of ['PAC', 'REC'] as const) for (const [name, body, expected] of cases) {
    test(`${role} · ${name} answers as before R7`, async () => {
      const id = await t.appointment(patientId, new Date(Date.UTC(2026, 10, 17, 14, slot++ * 30)));
      const r = await t.call(role, 'POST', `/citas/${id}/cancelar`, body);
      if (expected === 201) { expect(r.status).toBe(201); expect(r.body.state).toBe('cancelada'); return; }
      expect(r.status).toBe(400);
      const { requestId, ...rest } = r.body;
      expect(requestId).toEqual(expect.any(String));
      expect(rest).toEqual(invalid(expected));
    });
  }
});
