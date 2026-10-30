// Mismas reglas que valida la API (api/src/platform/identity.rules.ts y personnel.service.ts), para avisar en español antes de enviar.
// La garantía sigue siendo la de la API; esto es comodidad (regla 5 de AGENTS.md).
export function validDui(value: string): boolean {
  const n = value.replace(/-/g, '');
  return /^\d{9}$/.test(n) && /[1-9]/.test(n.slice(0, 8)) && (10 - ([...n.slice(0, 8)].reduce((sum, c, i) => sum + Number(c) * (9 - i), 0) % 10)) % 10 === Number(n[8]);
}
export const validPhone = (value: string) => /^[267]\d{3}-?\d{4}$/.test(value);
export const validPersonName = (value: string) => /^[\p{L}\p{M} .’'-]+$/u.test(value);
