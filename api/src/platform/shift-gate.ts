import { PoolClient } from 'pg';

/**
 * Lote 5, S9: shift-based staff only run operational commands while they have a shift. The roles below work by
 * published shifts; ADM, DPD (no shifts) and JOP (it publishes the shifts, so gating it would lock the planner out)
 * are exempt, and PAC is not staff. A command is gated only when every role that grants the actor its permission is
 * a shift role: a MED who is also ADM still runs ADM commands off shift.
 */
export const SHIFT_ROLES = ['REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR'] as const;
/** Minutes before the start and after the end of a shift in which the person can still work (handover, late close). */
export const SHIFT_GRACE_MINUTES = 30;
/** Policy that turns the gate on; deleting its row (or closing its `vigencia`) turns the gate off without a deploy. */
export const SHIFT_GATE_POLICY = 'turnos.exigir_turno_activo';
/** Self-service permissions that never need a shift (own session, preferences, devices). */
export const SHIFT_EXEMPT_PERMISSIONS: readonly string[] = ['sesion.perfil'];
export const NO_ACTIVE_SHIFT_CODE = 'sin_turno_activo';
export const NO_ACTIVE_SHIFT_MESSAGE = 'No tienes un turno activo. Pide a Jefatura que publique tu turno.';

export type ShiftWindow = { id: string; start: Date; end: Date; area: string | null; state: string };

/** Shift states that count as worked time: published or running by the clock, or just completed (grace after the end). */
const WORKING_STATES = ['publicado', 'en_curso', 'completado'];

export async function shiftGateEnabled(c: PoolClient, at: Date): Promise<boolean> {
  return !!(await c.query('SELECT 1 FROM plataforma.politica WHERE clave=$1 AND vigencia @> $2::timestamptz', [SHIFT_GATE_POLICY, at])).rowCount;
}

/** True when the permission reaches the actor only through shift roles (so the command needs a shift). */
export async function permissionNeedsShift(c: PoolClient, userId: string, permission: string): Promise<boolean> {
  if (SHIFT_EXEMPT_PERMISSIONS.includes(permission)) return false;
  const roles = (await c.query<{ rol: string }>('SELECT DISTINCT rol_codigo AS rol FROM acceso.v_permisos_usuario WHERE usuario_id=$1 AND permiso_codigo=$2', [userId, permission])).rows.map(r => r.rol);
  return roles.length > 0 && roles.every(r => (SHIFT_ROLES as readonly string[]).includes(r));
}

/** The actor's shift that covers `at` with the grace window, or null. */
export async function activeShift(c: PoolClient, userId: string, at: Date): Promise<ShiftWindow | null> {
  const row = (await c.query(`SELECT t.id,lower(t.periodo) AS start,upper(t.periodo) AS "end",e.nombre AS area,t.estado AS state
      FROM acceso.usuario u JOIN personal.turno t ON t.persona_id=u.persona_personal_id LEFT JOIN infra.espacio e ON e.id=t.area_id
     WHERE u.id=$1 AND t.estado=ANY($4::text[])
       AND lower(t.periodo)-make_interval(mins=>$3::int)<=$2::timestamptz AND upper(t.periodo)+make_interval(mins=>$3::int)>$2::timestamptz
     ORDER BY lower(t.periodo) LIMIT 1`, [userId, at, SHIFT_GRACE_MINUTES, WORKING_STATES])).rows[0];
  return row ?? null;
}

/** The actor's next published shift after `at`, or null. */
export async function nextShift(c: PoolClient, userId: string, at: Date): Promise<ShiftWindow | null> {
  const row = (await c.query(`SELECT t.id,lower(t.periodo) AS start,upper(t.periodo) AS "end",e.nombre AS area,t.estado AS state
      FROM acceso.usuario u JOIN personal.turno t ON t.persona_id=u.persona_personal_id LEFT JOIN infra.espacio e ON e.id=t.area_id
     WHERE u.id=$1 AND t.estado='publicado' AND lower(t.periodo)>$2::timestamptz ORDER BY lower(t.periodo) LIMIT 1`, [userId, at])).rows[0];
  return row ?? null;
}
