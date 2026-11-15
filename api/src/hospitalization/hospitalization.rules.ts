import { Actor, contextsOf, hasPermission } from '../platform/actor';

/** What `admissionActions` needs to know about one row of `GET /admisiones`. */
export type AdmissionActionInput = {
  state: string;
  attendingDoctorId: string;
  attendingDoctorHasAccount: boolean;
  occupationId: string | null;
  bedCategory: string | null;
  authorized: boolean;
  /** The actor has a current care relationship with the patient. */
  related: boolean;
  /** The actor has a current professional registration today (needed to sign, D-012). */
  enrolled: boolean;
  /** User id that signed the current discharge, if any. */
  dischargeSignedBy: string | null;
};

/**
 * Actions the actor can take now on an admission, from its state and the actor's permissions. The server repeats every
 * check when the command arrives; this list only keeps the clients from offering an action that would be rejected.
 */
export function admissionActions(actor: Actor, row: AdmissionActionInput): string[] {
  const can = (permission: string) => hasPermission(actor, permission);
  const actions: string[] = [];
  const signContexts = contextsOf(actor, 'alta.firmar');
  const canSign = row.enrolled && (signContexts.includes('x') || (signContexts.includes('relacion') && !!actor.staffId && (row.attendingDoctorId === actor.staffId || row.related)));
  const notes = can('enfermeria.registrar');
  if (row.state === 'pendiente_cama') {
    if (can('camas.asignar')) actions.push('asignar_cama');
    if (can('admision.autorizar') && !row.authorized) actions.push('autorizar');
    if (can('admision.crear')) actions.push('cancelar');
    if (can('admision.autorizar')) actions.push('reasignar_tratante');
  } else if (row.state === 'hospitalizado') {
    if (can('camas.trasladar') && row.occupationId && row.bedCategory !== 'vip') actions.push('trasladar');
    if (canSign) actions.push('firmar_alta');
    if (can('admision.crear') && row.attendingDoctorHasAccount) actions.push('solicitar_alta');
    if (can('admision.autorizar')) actions.push('reasignar_tratante', 'anular');
    if (notes) actions.push('nota_enfermeria');
  } else if (row.state === 'alta_firmada') {
    if (can('admision.registrar_salida')) actions.push('registrar_salida');
    if ((can('alta.firmar') && row.dischargeSignedBy === actor.id) || can('admision.autorizar')) actions.push('revocar_alta');
    if (notes) actions.push('nota_enfermeria');
  }
  return actions;
}

/** D-031: discharge types whose physical exit needs special handling; readers without a care relationship get only this flag. */
export const SPECIAL_EXIT: readonly string[] = ['defuncion', 'traslado'];
