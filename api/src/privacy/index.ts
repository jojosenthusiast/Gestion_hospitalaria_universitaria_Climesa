import { PoolClient } from 'pg';
export { EXCEPTIONAL_REASON } from './privacy.rules';

/**
 * FR-110-01 / FR-110-06: id of the approved exceptional access of `userId` to `patientId` that is in force at `at`,
 * or null. Expiry needs no job: an access outside its range simply stops matching.
 */
export async function activeExceptionalAccess(c: PoolClient, userId: string, patientId: string, at: Date): Promise<string | null> {
  const row = (await c.query("SELECT id FROM acceso.acceso_excepcional WHERE solicitante_id=$1 AND paciente_id=$2 AND estado='aprobado' AND vigencia @> $3::timestamptz LIMIT 1", [userId, patientId, at])).rows[0];
  return row?.id ?? null;
}
