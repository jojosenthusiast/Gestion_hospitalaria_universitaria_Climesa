import { DatabaseService } from '../../src/platform/database.service';

/**
 * Records every SQL statement the API sends through `db` while `work` runs. PGlite has a single connection, so a lock
 * cannot be observed from a second session; the tests assert on the statements instead.
 */
export async function recordSql(db: DatabaseService, work: () => Promise<unknown>): Promise<string[]> {
  const sql: string[] = [];
  const target = db as unknown as { transaction: (fn: (c: any) => Promise<unknown>) => Promise<unknown> };
  const original = target.transaction;
  target.transaction = (fn) => original.call(db, (c: any) => fn({ ...c, query: (text: string, params?: unknown[]) => { sql.push(text); return c.query(text, params); } }));
  try { await work(); } finally { target.transaction = original; }
  return sql;
}
