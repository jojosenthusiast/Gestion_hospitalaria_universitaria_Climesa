import { PoolClient } from 'pg';

/**
 * Lote 5, S9: shift-based staff only run operational commands while they have a shift. Which roles work by shifts is
 * data, not code (rule 8: no decisions by role code): the `roles` of the policy below (REC, AST, ENF, MED, LAB, PAR in
 * 20261129001000). ADM, DPD (no shifts) and JOP (it publishes the shifts) are left out, and PAC is not staff. A command
 * is gated only when every role that grants the actor its permission is a shift role: a MED who is also ADM still runs
 * ADM commands off shift.
 */
/**
 * Minutes before the start and after the end of a shift in which the person can still work (handover, late close).
 * The policy's `margen_minutos` decides it; this is the fallback when the policy has none (or an invalid one).
 */
export const SHIFT_GRACE_MINUTES = 30;
/** Policy that turns the gate on and lists the shift roles; closing its `vigencia` turns the gate off without a deploy. */
export const SHIFT_GATE_POLICY = 'turnos.exigir_turno_activo';
/** Self-service permissions that never need a shift (own session, preferences, devices). */
export const SHIFT_EXEMPT_PERMISSIONS: readonly string[] = ['sesion.perfil'];
export const NO_ACTIVE_SHIFT_CODE = 'sin_turno_activo';
export const NO_ACTIVE_SHIFT_MESSAGE = 'No tienes un turno activo. Pide a Jefatura que publique tu turno.';

export type ShiftWindow = { id: string; start: Date; end: Date; area: string | null; state: string };

/** Shift states that count as worked time: published or running by the clock, or just completed (grace after the end). */
const WORKING_STATES = ['publicado', 'en_curso', 'completado'];

export type ShiftGatePolicy = { roles: string[]; graceMinutes: number };

/** The policy in force at `at`: its shift roles (empty when the gate is off) and its grace minutes (`margen_minutos`). */
export async function shiftGatePolicy(c: PoolClient, at: Date): Promise<ShiftGatePolicy> {
  const row = (await c.query<{ valor: { roles?: unknown; margen_minutos?: unknown } }>('SELECT valor FROM plataforma.politica WHERE clave=$1 AND vigencia @> $2::timestamptz', [SHIFT_GATE_POLICY, at])).rows[0];
  const roles = Array.isArray(row?.valor?.roles) ? (row!.valor.roles as unknown[]).filter((r): r is string => typeof r === 'string') : [];
  const grace = row?.valor?.margen_minutos;
  return { roles, graceMinutes: typeof grace === 'number' && Number.isInteger(grace) && grace >= 0 ? grace : SHIFT_GRACE_MINUTES };
}

/** True when the permission reaches the actor only through shift roles (so the command needs a shift). */
export async function permissionNeedsShift(c: PoolClient, userId: string, permission: string, roles: string[]): Promise<boolean> {
  if (!roles.length || SHIFT_EXEMPT_PERMISSIONS.includes(permission)) return false;
  const granting = (await c.query<{ rol: string }>('SELECT DISTINCT rol_codigo AS rol FROM acceso.v_permisos_usuario WHERE usuario_id=$1 AND permiso_codigo=$2', [userId, permission])).rows.map(r => r.rol);
  return granting.length > 0 && granting.every(r => roles.includes(r));
}

/** The actor's shift that covers `at` with the grace window (in minutes, from the policy), or null. */
export async function activeShift(c: PoolClient, userId: string, at: Date, graceMinutes: number): Promise<ShiftWindow | null> {
  const row = (await c.query(`SELECT t.id,lower(t.periodo) AS start,upper(t.periodo) AS "end",e.nombre AS area,t.estado AS state
      FROM acceso.usuario u JOIN personal.turno t ON t.persona_id=u.persona_personal_id LEFT JOIN infra.espacio e ON e.id=t.area_id
     WHERE u.id=$1 AND t.estado=ANY($4::text[])
       AND lower(t.periodo)-make_interval(mins=>$3::int)<=$2::timestamptz AND upper(t.periodo)+make_interval(mins=>$3::int)>$2::timestamptz
     ORDER BY lower(t.periodo) LIMIT 1`, [userId, at, graceMinutes, WORKING_STATES])).rows[0];
  return row ?? null;
}

/** The actor's next published shift after `at`, or null. */
export async function nextShift(c: PoolClient, userId: string, at: Date): Promise<ShiftWindow | null> {
  const row = (await c.query(`SELECT t.id,lower(t.periodo) AS start,upper(t.periodo) AS "end",e.nombre AS area,t.estado AS state
      FROM acceso.usuario u JOIN personal.turno t ON t.persona_id=u.persona_personal_id LEFT JOIN infra.espacio e ON e.id=t.area_id
     WHERE u.id=$1 AND t.estado='publicado' AND lower(t.periodo)>$2::timestamptz ORDER BY lower(t.periodo) LIMIT 1`, [userId, at])).rows[0];
  return row ?? null;
}
