/**
 * Lote 5 S16 («no esta categorizado por cosas fisicas, psicologicas, internas, de cabeza torso y demas, o seugn los sentidos»):
 * sections of «Pedir una cita», in display order, the same as Android `domain/CategoryGroups.kt`. They only group the catalog
 * of `GET /citas/categorias`; no code is invented, and a code the server adds later falls in General.
 */
export type CategoryGroupId = 'cuerpo' | 'interno' | 'mente' | 'sentidos' | 'general';
export const CATEGORY_GROUPS: { id: CategoryGroupId; title: string }[] = [
  { id: 'cuerpo', title: 'Cuerpo: cabeza, torso y extremidades' },
  { id: 'interno', title: 'Interno y digestivo' },
  { id: 'mente', title: 'Mente y emociones' },
  { id: 'sentidos', title: 'Sentidos: vista, oído, nariz y garganta' },
  { id: 'general', title: 'General' },
];
const BY_CODE: Record<string, CategoryGroupId> = {
  cabeza_nervios: 'cuerpo', corazon: 'cuerpo', huesos: 'cuerpo', piel: 'cuerpo',
  digestivo: 'interno', rinon_urinario: 'interno', alergias: 'interno',
  salud_mental: 'mente',
  ojos: 'sentidos', oido_garganta: 'sentidos',
  consulta_general: 'general', ninos: 'general', mujer_embarazo: 'general', cirugia: 'general',
};
export const groupOf = (code: string): CategoryGroupId => BY_CODE[code] ?? 'general';

/** Non-empty sections in display order; inside each, the server's order. */
export function categorySections<T extends { code: string }>(categories: readonly T[]) {
  return CATEGORY_GROUPS.map(g => ({ ...g, categories: categories.filter(c => groupOf(c.code) === g.id) })).filter(s => s.categories.length > 0);
}
