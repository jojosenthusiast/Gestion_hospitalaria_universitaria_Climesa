import { createDatabase } from './support/database';

jest.setTimeout(240000);

const SCHEMAS = ['acceso', 'ambulancia', 'atencion', 'hospitalizacion', 'infra', 'inventario', 'laboratorio', 'metricas', 'pacientes', 'personal', 'plataforma', 'publico', 'public'];

/**
 * Supabase Security Advisor «function_search_path_mutable»: every function of the business schemas fixes its
 * `search_path`, so a caller's path can never redirect the tables or functions it uses.
 */
test('every business function fixes its search_path', async () => {
  const { pg } = await createDatabase();
  try {
    const rows = (await pg.query<{ name: string }>(`SELECT n.nspname||'.'||p.proname AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname = ANY($1) AND p.prokind='f'
        AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}'::text[])) x WHERE x LIKE 'search_path=%')
      ORDER BY 1`, [SCHEMAS])).rows;
    expect(rows.map(r => r.name)).toEqual([]);
  } finally {
    await pg.close();
  }
});
