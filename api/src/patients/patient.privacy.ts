/** Política de campos de la ficha del paciente según docs/arquitectura/privacidad.md §2 (FR-102-10). Reglas puras, sin acceso a datos. */
import { Actor, contextsOf, hasPermission } from '../platform/actor';
export type FichaFields = { birth: boolean; ageRange: boolean; contact: boolean };

/**
 * Qué grupos de campos recibe quien consulta la ficha. Número de expediente, nombre y sexo los reciben todos los roles con acceso.
 * - birth: fecha de nacimiento exacta (permiso `pacientes.ver_nacimiento`, contexto x; el dueño siempre).
 * - ageRange: rango de edad en lugar de la fecha exacta (`pacientes.ver_nacimiento`, contexto rango).
 * - contact: DUI, teléfono, correo y dirección (`pacientes.ver_contacto`, contexto x; el dueño siempre).
 * Quien solo tiene lo básico (la asignación de cama usa nombre y sexo) no recibe ninguno. Con varios roles se suma lo que da cada uno.
 * Los permisos son los de privacidad.md §2 en permisos.csv; esta función ya no compara códigos de rol (regla 8).
 */
export function fichaFields(actor: Pick<Actor, 'permissions'>, owner: boolean): FichaFields {
  const birthContexts = contextsOf(actor, 'pacientes.ver_nacimiento');
  const contact = owner || contextsOf(actor, 'pacientes.ver_contacto').includes('x');
  const birth = contact || birthContexts.includes('x');
  return { birth, ageRange: !birth && birthContexts.includes('rango'), contact };
}

/** La búsqueda de pacientes da la edad (en el selector) a quien ve el nacimiento, exacto o por rango, en la ficha. */
export function searchShowsBirth(actor: Actor): boolean {
  return hasPermission(actor, 'pacientes.ver_nacimiento');
}

/**
 * MA-SEG-06 (H-03): la búsqueda sigue la misma política que la ficha. Con contexto x recibe la fecha exacta; con `rango`
 * (Laboratorio) recibe solo el decenio de edad; sin el permiso, ninguno de los dos.
 */
export function searchBirthFields<T extends { birth?: string | null }>(actor: Actor, row: T, today: string): Omit<T, 'birth'> & { birth?: string | null; ageRange?: string | null } {
  const { birth, ...rest } = row;
  const fields = fichaFields(actor, false);
  if (fields.birth) return { ...rest, birth };
  if (fields.ageRange) return { ...rest, ageRange: birth ? ageRange(ageOn(birth, today)) : null };
  return rest;
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
