/** Actions the web may offer on an account row (MA-CTA-01, MA-CTA-03). Pure rules; the service enforces the same checks. */
export const ACCOUNT_ACTIONS = ['roles', 'desactivar', 'reactivar', 'reenviar_invitacion', 'cancelar_invitacion'] as const;
export type AccountAction = typeof ACCOUNT_ACTIONS[number];
export type AccountActionInput = {
  /** The row is the actor's own account. */
  self: boolean;
  /** The account holds administrative authority and the actor is not the principal administrator. */
  protectedTarget: boolean;
  state: string;
  invitationState: string | null;
  can: { roles: boolean; state: boolean; invite: boolean };
};
export function accountActions(input: AccountActionInput): AccountAction[] {
  if (input.self || input.protectedTarget) return [];
  const actions: AccountAction[] = [];
  const pending = input.invitationState === 'enviada', cancelled = input.invitationState === 'cancelada';
  if (input.can.roles && !cancelled) actions.push('roles');
  if (input.can.state && input.state === 'activo') actions.push('desactivar');
  if (input.can.state && input.state === 'desactivado' && !cancelled) actions.push('reactivar');
  if (input.can.invite && pending) actions.push('reenviar_invitacion', 'cancelar_invitacion');
  return actions;
}
