import { poolConfig } from '../src/platform/database.service';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';

describe('poolConfig', () => {
  const url = 'postgresql://u:p@host:5432/postgres?sslmode=require';

  it('deja la cadena de conexión intacta si no hay CA', () => {
    const cfg = poolConfig(url);
    expect(cfg.connectionString).toBe(url);
    expect(cfg.ssl).toBeUndefined();
  });

  it('verifica el servidor con la CA indicada y quita sslmode de la URL', () => {
    const cfg = poolConfig(url, PEM);
    expect(cfg.connectionString).toBe('postgresql://u:p@host:5432/postgres');
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('acepta una CA con secuencias \\n literales, como al pegarla en un campo de una sola línea', () => {
    const cfg = poolConfig(url, PEM.replace(/\n/g, '\\n'));
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
  });

  it('conserva los demás parámetros de la URL', () => {
    const cfg = poolConfig('postgresql://u:p@host:5432/postgres?sslmode=require&application_name=sghu', PEM);
    expect(cfg.connectionString).toBe('postgresql://u:p@host:5432/postgres?application_name=sghu');
  });
});
