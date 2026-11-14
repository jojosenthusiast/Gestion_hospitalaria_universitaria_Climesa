import { PoolClient } from 'pg';
import { ProblemException } from './problem';

/**
 * D-012, RN-11, RN-23: signing a note, prescribing and signing a discharge need a current professional
 * registration on the local business date of the act.
 */
export async function requireCurrentEnrollment(c: PoolClient, staffId: string | null, today: string) {
  const current = staffId ? (await c.query('SELECT personal.inscrito($1::uuid,$2::date) AS ok', [staffId, today])).rows[0]?.ok : false;
  if (!current) throw new ProblemException('inscripcion_no_vigente', 409, 'Tu inscripción profesional no está vigente; no puedes realizar este acto clínico.');
}
