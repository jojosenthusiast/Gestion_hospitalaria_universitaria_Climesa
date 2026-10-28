import { poolConfig } from '../src/platform/database.service';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('poolConfig', () => {
  const url = 'postgresql://u:p@host:5432/postgres?sslmode=require';

  it('keeps the connection string untouched when no CA is given', () => {
    const cfg = poolConfig(url);
    expect(cfg.connectionString).toBe(url);
    expect(cfg.ssl).toBeUndefined();
  });

  it('verifies the server against the given CA and drops sslmode from the URL', () => {
    const cfg = poolConfig(url, PEM);
    expect(cfg.connectionString).toBe('postgresql://u:p@host:5432/postgres');
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('accepts a CA written with literal \\n sequences, as pasted in single-line env fields', () => {
    const cfg = poolConfig(url, PEM.replace(/\n/g, '\\n'));
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('keeps other query parameters', () => {
    const cfg = poolConfig('postgresql://u:p@host:5432/postgres?sslmode=require&application_name=sghu', PEM);
    expect(cfg.connectionString).toBe('postgresql://u:p@host:5432/postgres?application_name=sghu');
  });
});
