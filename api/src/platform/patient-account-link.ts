import { PoolClient } from 'pg';
import { Actor } from './actor';
import { channelsFor, patientAccount } from './channels';
import { CommandService } from './command.service';
import { ProblemException } from './problem';

/**
 * Owner observations 2026-11-18, batch 2: an app account joins its medical record on its own, by verified email only.
 * There is no DUI or birth-date self-linking and no approval queue. The rule, the same from both sides:
 * the account has no record yet; its email is verified by Supabase Auth; exactly one active record carries that email;
 * that record is not linked to another account. Anything else leaves the account unlinked.
 */

/** Records the front desk and the clinic still attend (`pacientes.paciente.estado`). */
const ACTIVE_SQL = "estado IN ('activo','provisional')";

/** Emails compare trimmed and case-insensitive. */
export const emailKey = (email: string | null | undefined) => (email ?? '').trim().toLowerCase();

/** Serializes every write that reads or sets this email, so two saves cannot both find it free. */
async function lockEmail(c: PoolClient, key: string) {
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('pacientes.correo:' || $1::text))`, [key]);
}

/** Active records with this email, at most two (two already means ambiguous). */
async function activeRecordsWith(c: PoolClient, key: string, exceptId?: string) {
  return (await c.query(`SELECT id,expediente FROM pacientes.paciente WHERE lower(correo)=$1 AND ${ACTIVE_SQL} AND ($2::uuid IS NULL OR id<>$2) ORDER BY id LIMIT 2`, [key, exceptId ?? null])).rows as Array<{ id: string; expediente: string }>;
}

/** Active patient accounts (they hold `cuenta.vincular`) whose verified email is this one. */
async function verifiedAccountsWith(c: PoolClient, key: string) {
  return (await c.query(`SELECT u.id,u.paciente_id FROM acceso.usuario u WHERE lower(u.correo_verificado)=$1 AND u.estado='activo'
    AND EXISTS (SELECT 1 FROM acceso.v_permisos_usuario v WHERE v.usuario_id=u.id AND v.permiso_codigo='cuenta.vincular') ORDER BY u.id LIMIT 2`, [key])).rows as Array<{ id: string; paciente_id: string | null }>;
}

export type AutoLinkSource = 'sesion' | 'expediente';

/**
 * The one auto-link rule. `accountId` must be an account whose `correo_verificado` was refreshed from Supabase Auth.
 * Returns the linked record id, or null when any condition fails. Writes the audit row and the realtime events.
 */
export async function linkByVerifiedEmail(c: PoolClient, commands: CommandService, actor: Pick<Actor, 'id' | 'roles'>, accountId: string, source: AutoLinkSource, permission: string): Promise<string | null> {
  const account = (await c.query(`SELECT u.paciente_id,u.correo_verificado,u.estado FROM acceso.usuario u WHERE u.id=$1`, [accountId])).rows[0];
  if (!account || account.estado !== 'activo' || account.paciente_id || !account.correo_verificado) return null;
  const key = emailKey(account.correo_verificado);
  if (!key) return null;
  await lockEmail(c, key);
  // Re-read under the email lock and the row lock: a concurrent save or link may have changed either.
  const locked = (await c.query('SELECT paciente_id,correo_verificado FROM acceso.usuario WHERE id=$1 FOR UPDATE', [accountId])).rows[0];
  if (!locked || locked.paciente_id || emailKey(locked.correo_verificado) !== key) return null;
  const records = await activeRecordsWith(c, key);
  if (records.length !== 1) return null;
  const patientId = records[0].id;
  if (await patientAccount(c, patientId)) return null;
  const updated = (await c.query('UPDATE acceso.usuario SET paciente_id=$2,version=version+1 WHERE id=$1 AND paciente_id IS NULL RETURNING version', [accountId, patientId])).rows[0];
  if (!updated) return null;
  // The email itself is personal data: the audit keeps only who, which record and from where.
  await commands.audit(c, actor, { action: 'vinculacion.automatica', entity: 'usuario', entityId: accountId, patientId, permission, detail: { accountId, source } });
  // The account refreshes its profile (`patientId`); open records refresh their «Cuenta de la app» line.
  await commands.event(c, 'vinculacion.resuelta', 'usuario', accountId, updated.version, [`usuario:${accountId}`]);
  const version = (await c.query('SELECT version FROM pacientes.paciente WHERE id=$1', [patientId])).rows[0].version as number;
  await commands.event(c, 'paciente.actualizado', 'paciente', patientId, version, await channelsFor(c, ['pacientes.buscar', 'pacientes.ver_ficha'], { excludeContexts: ['propio'], users: [accountId] }));
  return patientId;
}

/** Session side: store what Supabase Auth says about the account's email, then try the rule. */
export async function linkOnSession(c: PoolClient, commands: CommandService, actor: Pick<Actor, 'id' | 'roles'>, verifiedEmail: string | null): Promise<string | null> {
  const key = verifiedEmail ? emailKey(verifiedEmail) || null : null;
  await c.query('UPDATE acceso.usuario SET correo_verificado=$2 WHERE id=$1 AND correo_verificado IS DISTINCT FROM $2', [actor.id, key]);
  if (!key) return null;
  return linkByVerifiedEmail(c, commands, actor, actor.id, 'sesion', 'cuenta.vincular');
}

/**
 * Record side, before saving `email` on a record (create, edit, self-edit or reactivation). Refuses what would make the
 * rule ambiguous or wrong: another active record with the same email, or a verified account with that email already
 * linked to a different record. Takes the email lock, so call it inside the write transaction before the UPDATE/INSERT.
 */
export async function assertEmailAssignable(c: PoolClient, email: string | null | undefined, patientId?: string) {
  const key = emailKey(email);
  if (!key) return;
  await lockEmail(c, key);
  const other = (await activeRecordsWith(c, key, patientId))[0];
  if (other) throw new ProblemException('correo_en_uso', 409, `Ese correo ya está en el expediente activo ${other.expediente}. Cada correo puede estar en un solo expediente activo: revisa si es la misma persona o usa otro correo.`, 'email');
  for (const account of await verifiedAccountsWith(c, key)) {
    if (account.paciente_id && account.paciente_id !== patientId) {
      const record = (await c.query('SELECT expediente FROM pacientes.paciente WHERE id=$1', [account.paciente_id])).rows[0]?.expediente ?? '';
      throw new ProblemException('correo_de_otra_cuenta', 409, `Ese correo es de una cuenta de la app que ya está unida al expediente ${record}. Revisa si es la misma persona antes de usarlo aquí.`, 'email');
    }
  }
}

/** Record side, after saving: if exactly one verified, unlinked patient account has this email, link it now. */
export async function linkRecordByEmail(c: PoolClient, commands: CommandService, actor: Pick<Actor, 'id' | 'roles'>, email: string | null | undefined, permission: string): Promise<string | null> {
  const key = emailKey(email);
  if (!key) return null;
  const accounts = await verifiedAccountsWith(c, key);
  if (accounts.length !== 1 || accounts[0].paciente_id) return null;
  return (await linkByVerifiedEmail(c, commands, actor, accounts[0].id, 'expediente', permission)) ? accounts[0].id : null;
}

/** What the record shows about its app account: linked, none yet, or an email shared with another active record. */
export type AppAccountState = 'vinculada' | 'sin_cuenta' | 'correo_repetido';
export async function appAccountState(c: PoolClient, patientId: string, email: string | null | undefined): Promise<AppAccountState> {
  if (await patientAccount(c, patientId)) return 'vinculada';
  const key = emailKey(email);
  if (key && (await activeRecordsWith(c, key, patientId)).length) return 'correo_repetido';
  return 'sin_cuenta';
}
