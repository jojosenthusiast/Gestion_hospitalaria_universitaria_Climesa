import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, PoolConfig, QueryResultRow } from 'pg';

/**
 * With a CA the server is verified against it. `sslmode` is removed from the URL because pg
 * lets URL parameters override the `ssl` option and would drop the CA.
 */
export function poolConfig(connectionString: string, ca?: string): PoolConfig {
  const base = { max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 };
  if (!ca) return { connectionString, ...base };
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString().replace(/\?$/, ''), ssl: { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true }, ...base };
}
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (connectionString) this.pool = new Pool(poolConfig(connectionString, config.get<string>('DB_SSL_CA') || undefined));
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new ServiceUnavailableException('Configura DATABASE_URL para conectar la base de CLIMESA.');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE sghu_api');
      await client.query("SET LOCAL statement_timeout = '15s'");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
    return this.transaction(async client => (await client.query<T>(sql, values)).rows);
  }
  async onModuleDestroy() { await this.pool?.end(); }
}
