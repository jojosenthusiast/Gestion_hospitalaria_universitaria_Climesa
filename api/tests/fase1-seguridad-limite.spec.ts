import { createTestApp, TestApp } from './support/app';

jest.setTimeout(180000);

/** SEG-08: global per-IP limit. The suites run without it unless RATE_LIMIT_MAX is set, so this file sets a small one. */
describe('Fase 1 · límite de solicitudes por IP (SEG-08)', () => {
  let t: TestApp;
  const previous = process.env.RATE_LIMIT_MAX;
  beforeAll(async () => { process.env.RATE_LIMIT_MAX = '5'; t = await createTestApp(new Date()); });
  afterAll(async () => {
    await t?.close();
    if (previous === undefined) delete process.env.RATE_LIMIT_MAX; else process.env.RATE_LIMIT_MAX = previous;
  });

  test('la solicitud 6 en un minuto recibe 429 en problem+json con codigo estable; /salud nunca se limita', async () => {
    const hit = () => t.app.inject({ method: 'GET', url: '/api/v1/auth/me', remoteAddress: '203.0.113.7' });
    for (let i = 0; i < 5; i++) expect((await hit()).statusCode).toBe(401);
    const limited = await hit();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    const body = limited.json();
    expect(body).toMatchObject({ status: 429, codigo: 'demasiadas_solicitudes' });
    expect(body.reintentarEn).toBeGreaterThan(0);
    expect(limited.headers['content-type']).toContain('application/problem+json');
    expect(body.detail).toMatch(/Intenta de nuevo/);
    // Another address keeps its own bucket.
    expect((await t.app.inject({ method: 'GET', url: '/api/v1/auth/me', remoteAddress: '203.0.113.8' })).statusCode).toBe(401);
    for (let i = 0; i < 8; i++) expect((await t.app.inject({ method: 'GET', url: '/salud', remoteAddress: '203.0.113.7' })).statusCode).toBe(200);
  });
});
