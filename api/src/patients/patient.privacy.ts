/** Política de campos de la ficha del paciente según docs/arquitectura/privacidad.md §2 (FR-102-10). Reglas puras, sin acceso a datos. */
export type FichaFields = { birth: boolean; ageRange: boolean; contact: boolean };

/** Roles cuyo permiso `pacientes.ver_ficha` tiene contexto `x` pero privacidad.md §2 limita a un área, consultorio u orden. */
export const SCOPED_ROLES = ['AST', 'ENF', 'LAB'] as const;

/**
 * Qué grupos de campos recibe quien consulta la ficha. Número de expediente, nombre y sexo los reciben todos los roles con acceso.
 * - birth: fecha de nacimiento exacta (PAC dueño, REC, AST, ENF, MED, PAR).
 * - ageRange: rango de edad en lugar de la fecha exacta (LAB).
 * - contact: DUI, teléfono, correo y dirección (PAC dueño, REC, MED).
 * JOP solo recibe lo básico (la asignación de cama usa nombre y sexo). Con varios roles se suma lo que da cada uno.
 */
export function fichaFields(roles: string[], owner: boolean): FichaFields {
  const has = (...codes: string[]) => roles.some(r => codes.includes(r));
  const contact = owner || has('REC', 'MED');
  const birth = contact || has('AST', 'ENF', 'PAR');
  return { birth, ageRange: !birth && has('LAB'), contact };
}

/** Años cumplidos de `birth` (yyyy-MM-dd) al día `today` (yyyy-MM-dd). */
export function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** Decenios sin fecha exacta: «0-9», «30-39», «90+». La edad negativa o desconocida no tiene rango. */
export function ageRange(age: number | null): string | null {
  if (age === null || !Number.isFinite(age) || age < 0) return null;
  if (age >= 90) return '90+';
  const low = Math.floor(age / 10) * 10;
  return `${low}-${low + 9}`;
}
