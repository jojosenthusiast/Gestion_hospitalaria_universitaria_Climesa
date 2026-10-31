import { PoolClient } from 'pg';

type Options = {
  /** Contextos del catálogo que no cuentan como acceso general (por ejemplo `propio`). */
  excludeContexts?: string[];
  /** Cuentas individuales que también deben recibir el evento. */
  users?: Array<string | null | undefined>;
};

/**
 * Canales `rol:<código>` de los roles que tienen alguno de los permisos dados en el catálogo
 * (`acceso.rol_permiso`). Cualquier celda con contexto cuenta como concesión, salvo los
 * contextos excluidos. Se consulta dentro de la misma transacción del comando, así que no hay
 * caché que invalidar: un cambio de catálogo se ve en el siguiente evento.
 * Regla 8: los canales se derivan de permisos, no de listas de roles escritas en el código.
 */
export async function channelsFor(c: PoolClient, permissions: string[], options: Options = {}): Promise<string[]> {
  const rows = (await c.query(
    'SELECT DISTINCT rol_codigo FROM acceso.rol_permiso WHERE permiso_codigo = ANY($1::text[]) AND NOT (contexto = ANY($2::text[])) ORDER BY rol_codigo',
    [permissions, options.excludeContexts ?? []],
  )).rows as Array<{ rol_codigo: string }>;
  const users = (options.users ?? []).filter((id): id is string => !!id).map(id => `usuario:${id}`);
  return [...new Set([...rows.map(r => `rol:${r.rol_codigo}`), ...users])];
}

/** Cuenta vinculada a un paciente (`acceso.usuario.paciente_id`), si existe. */
export async function patientAccount(c: PoolClient, patientId: string): Promise<string | null> {
  const row = (await c.query('SELECT id FROM acceso.usuario WHERE paciente_id=$1 LIMIT 1', [patientId])).rows[0];
  return row?.id ?? null;
}
