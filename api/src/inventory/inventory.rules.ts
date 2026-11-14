/** Pure rules of spec 111 (RN-36, RN-37). */

/** Movements that take stock out of the origin warehouse; a negative adjustment also subtracts (API-15). */
export const subtracts = (type: string, quantity: number) => ['salida', 'consumo', 'traslado'].includes(type) || (type === 'ajuste' && quantity < 0);

/** RN-37: the alert fires when the available stock crosses below the minimum, not on every later movement. */
export const crossesBelowMinimum = (before: number, after: number, minimum: number) => minimum > 0 && before >= minimum && after < minimum;

/**
 * Contexts of `inventario.mover` that do not receive the alert (FR-111-06): Operations always (context `x`),
 * the laboratory only for reagents (context `reactivos`), nursing consumption never.
 */
export const alertExcludedContexts = (articleType: string) => articleType === 'reactivo' ? ['consumo'] : ['consumo', 'reactivos'];
