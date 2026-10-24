import { HealthController } from '../src/health/health.controller';

describe('HealthController', () => {
  it('returns a healthy API response', () => {
    const result = new HealthController({ isConfigured: () => false } as never, { query: jest.fn() } as never).getHealth();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('sghu-climesa-backend');
    expect(result.integrations.supabase).toBe('not_configured');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
