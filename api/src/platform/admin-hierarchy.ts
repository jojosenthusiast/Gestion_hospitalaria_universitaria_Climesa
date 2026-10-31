/**
 * Jerarquía de administración (migración 20261024000100): solo el administrador principal asigna cuentas con autoridad de administrar roles.
 * Qué rol es "de administración" no se nombra aquí: lo es todo rol del catálogo que lleve el permiso `usuarios.asignar_roles` (regla 8 de AGENTS.md).
 * Hoy solo ADM lo lleva, así que el comportamiento no cambia.
 */
export const ADMIN_AUTHORITY_PERMISSION = 'usuarios.asignar_roles';

/** Cuentas activas con algún rol que lleva la autoridad, la más antigua primero (máximo 2). $1 = ADMIN_AUTHORITY_PERMISSION. */
export const ACTIVE_AUTHORITY_HOLDERS_SQL = `SELECT a.usuario_id FROM acceso.asignacion_rol a JOIN acceso.usuario u ON u.id=a.usuario_id AND u.estado='activo'
  WHERE EXISTS(SELECT 1 FROM acceso.rol_permiso rp WHERE rp.rol_codigo=a.rol_codigo AND rp.permiso_codigo=$1)
  GROUP BY a.usuario_id ORDER BY min(a.asignado_en) LIMIT 2`;

/** Si alguno de estos roles lleva la autoridad. $1 = roles, $2 = ADMIN_AUTHORITY_PERMISSION. */
export const ROLES_GRANT_AUTHORITY_SQL = 'SELECT 1 FROM acceso.rol_permiso WHERE rol_codigo=ANY($1::text[]) AND permiso_codigo=$2 LIMIT 1';

/** Si la cuenta ya tiene algún rol que lleva la autoridad. $1 = cuenta, $2 = ADMIN_AUTHORITY_PERMISSION. */
export const USER_HOLDS_AUTHORITY_SQL = 'SELECT 1 FROM acceso.asignacion_rol a JOIN acceso.rol_permiso rp ON rp.rol_codigo=a.rol_codigo WHERE a.usuario_id=$1 AND rp.permiso_codigo=$2 LIMIT 1';