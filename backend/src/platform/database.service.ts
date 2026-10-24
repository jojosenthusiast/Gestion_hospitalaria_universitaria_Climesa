import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool?: Pool;
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (connectionString) this.pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
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
