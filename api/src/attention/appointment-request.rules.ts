import { ActionSet, BlockedAction } from './attention.rules';

/**
 * Fase 2, flow A (S8): actions the reader may take on a category appointment request right now. The API returns them
 * as `allowedActions` so web, Android and iOS only offer what the server accepts; the commands re-check them.
 */
export const CATEGORY_REQUEST_ACTIONS = ['asignar', 'rechazar', 'cancelar'] as const;
export type CategoryRequestAction = typeof CATEGORY_REQUEST_ACTIONS[number];

export type CategoryRequestAbilities = {
  /** `citas.agendar`: reception assigns a doctor and time, or rejects. */
  manage: boolean;
  /** The reader is the request's patient (cancels their own pending request). */
  ownPatient: boolean;
};

export function categoryRequestActions(state: string, abilities: CategoryRequestAbilities): ActionSet<CategoryRequestAction> {
  const allowed: CategoryRequestAction[] = [];
  const blocked: BlockedAction<CategoryRequestAction>[] = [];
  if (state !== 'pendiente') return { allowedActions: allowed, blockedActions: blocked };
  if (abilities.manage) allowed.push('asignar', 'rechazar');
  if (abilities.ownPatient) allowed.push('cancelar');
  return { allowedActions: allowed, blockedActions: blocked };
}
