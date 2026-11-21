import { validDui } from '../../lib/identity';
import { localDayKey } from '../../lib/format';

/** Reglas de captura de la ficha del paciente (ronda 2, obs. 6). Reflejan las de la API (`validateDemographics`); la API sigue siendo quien decide. */
export type PatientDraft = { givenNames: string; surnames: string; dui?: string | null; birth?: string | null; phone?: string | null; email?: string | null; address?: string | null };
export type PatientErrors = Partial<Record<keyof PatientDraft, string>>;

const NAME = /^[\p{L}\p{M} .’'-]+$/u;

/** Una cadena vacía por campo opcional es válida; los mensajes dicen qué corregir. */
export function validatePatientDraft(draft: PatientDraft, today = new Date()): PatientErrors {
  const errors: PatientErrors = {};
  const names = draft.givenNames.trim(), surnames = draft.surnames.trim();
  if (names.length < 2) errors.givenNames = 'Escribe al menos 2 letras en los nombres.'; else if (!NAME.test(names)) errors.givenNames = 'Los nombres solo llevan letras, sin números.';
  if (surnames.length < 2) errors.surnames = 'Escribe al menos 2 letras en los apellidos.'; else if (!NAME.test(surnames)) errors.surnames = 'Los apellidos solo llevan letras, sin números.';
  const dui = draft.dui?.trim();
  if (dui && (!/^\d{8}-?\d$/.test(dui) || !validDui(dui))) errors.dui = 'El DUI no es válido: son 9 dígitos y el último es verificador (00000000-0).';
  const phone = draft.phone?.trim();
  if (phone && !/^[267]\d{3}-?\d{4}$/.test(phone)) errors.phone = 'El teléfono lleva ocho dígitos y empieza con 2, 6 o 7 (7000-0000).';
  const email = draft.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Revisa el correo: falta el @ o el dominio.';
  const birth = draft.birth?.trim();
  if (birth) {
    // P3 W16: "today" is the El Salvador civil day (like the API), not the UTC day that is already tomorrow after 18:00.
    const parsed = new Date(`${birth}T12:00:00Z`), todayKey = localDayKey(today), limitKey = `${Number(todayKey.slice(0, 4)) - 120}${todayKey.slice(4)}`;
    if (Number.isNaN(parsed.valueOf())) errors.birth = 'La fecha de nacimiento no es válida.';
    else if (birth > todayKey) errors.birth = 'La fecha de nacimiento no puede ser futura.';
    else if (birth < limitKey) errors.birth = 'La fecha de nacimiento tiene más de 120 años: revísala.';
  }
  return errors;
}

/** Datos que la ficha todavía no tiene. Solo cuenta lo que el rol puede ver (la clave ausente no es un dato faltante). */
export function profileGaps(patient: { birth?: string | null; dui?: string | null; phone?: string | null; email?: string | null; address?: string | null }): string[] {
  const gaps: string[] = [];
  const check = (key: keyof typeof patient, label: string) => { if (key in patient && !patient[key]) gaps.push(label); };
  check('birth', 'fecha de nacimiento'); check('dui', 'DUI'); check('phone', 'teléfono'); check('email', 'correo'); check('address', 'dirección');
  return gaps;
}

/** Años cumplidos a `today` (aaaa-mm-dd) en hora local; null si no hay fecha. */
export function ageFrom(birth: string | null | undefined, today = new Date()): number | null {
  if (!birth) return null;
  const [y, m, d] = birth.slice(0, 10).split('-').map(Number);
  const age = today.getFullYear() - y - (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d) ? 1 : 0);
  return age < 0 ? null : age;
}
