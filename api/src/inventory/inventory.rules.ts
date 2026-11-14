/** Pure rules of spec 111 (RN-36, RN-37). */

export const MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste', 'traslado', 'consumo', 'merma'] as const;
export const ARTICLE_TYPES = ['insumo', 'reactivo', 'equipo_menor'] as const;
/** A lot that expires within this many days (and still has stock) is flagged "por vencer". */
export const EXPIRING_DAYS = 30;

/** Movements that take stock out of the origin warehouse; a negative adjustment also subtracts (API-15). */
export const subtracts = (type: string, quantity: number) => ['salida', 'consumo', 'traslado', 'merma'].includes(type) || (type === 'ajuste' && quantity < 0);

/** Movements that cannot use an expired lot: stock leaving to a patient or another place. A merma is how an expired lot is written off. */
export const blockedForExpired = (type: string) => ['salida', 'consumo', 'traslado'].includes(type);

/** RN-37: the alert fires when the available stock crosses below the minimum, not on every later movement. */
export const crossesBelowMinimum = (before: number, after: number, minimum: number) => minimum > 0 && before >= minimum && after < minimum;

/**
 * Contexts of `inventario.mover` that do not receive the alert (FR-111-06): Operations always (context `x`),
 * the laboratory only for reagents (context `reactivos`), nursing consumption never.
 */
export const alertExcludedContexts = (articleType: string) => articleType === 'reactivo' ? ['consumo'] : ['consumo', 'reactivos'];

/** What each context of `inventario.mover` may see and do: `x` everything, `reactivos` only reagents, `consumo` only consumption of non-reagents. */
export type InventoryScope = { articleTypes: string[] | null; movementTypes: string[] };
export function scopeOf(contexts: string[], canConfigure = false): InventoryScope {
  if (canConfigure || contexts.includes('x')) return { articleTypes: null, movementTypes: [...MOVEMENT_TYPES] };
  const types = new Set<string>(), movements = new Set<string>();
  if (contexts.includes('reactivos')) { types.add('reactivo'); MOVEMENT_TYPES.forEach(m => movements.add(m)); }
  if (contexts.includes('consumo')) { types.add('insumo'); types.add('equipo_menor'); movements.add('consumo'); }
  if (!contexts.length) return { articleTypes: null, movementTypes: [] };
  return { articleTypes: [...types], movementTypes: [...movements] };
}
export const canTouchArticle = (scope: InventoryScope, articleType: string) => scope.articleTypes === null || scope.articleTypes.includes(articleType);

/** Fields each movement type needs: the client shows only these and the API rejects the rest of the combinations. */
export const movementFields = (type: string) => ({
  origin: ['salida', 'consumo', 'merma', 'traslado', 'ajuste'].includes(type),
  destination: ['entrada', 'traslado'].includes(type),
  patient: type === 'consumo',
  newLot: type === 'entrada',
});

export type StockStatus = 'inactivo' | 'agotado' | 'bajo_minimo' | 'por_vencer' | 'ok';
export function stockStatus(a: { active: boolean; available: number; minimum: number; expiringSoon: number }): StockStatus {
  if (!a.active) return 'inactivo';
  if (a.available <= 0) return 'agotado';
  if (a.minimum > 0 && a.available < a.minimum) return 'bajo_minimo';
  if (a.expiringSoon > 0) return 'por_vencer';
  return 'ok';
}

/** First-expired-first-out: soonest expiry first, lots without expiry last, ties by lot number. */
export function fefo<T extends { expiresAt: string | null; number: string }>(lots: T[]): T[] {
  return [...lots].sort((a, b) => (a.expiresAt ?? '9999-12-31').localeCompare(b.expiresAt ?? '9999-12-31') || a.number.localeCompare(b.number));
}
