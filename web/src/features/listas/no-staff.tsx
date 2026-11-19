import { Notice } from '../../components/ui';
import type { ApiError } from '../../lib/api';

/**
 * Lote 5 S6: 409 `sin_personal_disponible`, «No hay médicos de turno para ese día y servicio.». It belongs to the day and
 * time the person chose, so it shows on that field or on the card, not at the top of the form where it reads as a failure.
 */
export const NO_STAFF = 'sin_personal_disponible';
export const NO_STAFF_TEXT = 'No hay médicos de turno para ese día y servicio.';
/** A request row the API marks `staffAvailable: false` (same text as Android): no doctor can take it soon, so it is rejected. */
export const NO_STAFF_REQUEST_TEXT = 'No hay médicos con turno que puedan atender este motivo en los próximos días. Rechaza la solicitud indicando ese motivo.';

export const isNoStaff = (error: ApiError | null | undefined) => error?.code === NO_STAFF;
/** The same error for the general place of the form, or null when it is shown at its field. */
export const besidesNoStaff = (error: ApiError | null) => (isNoStaff(error) ? null : error);

export function NoStaffNotice({ error }: { error: ApiError | null | undefined }) {
  if (!isNoStaff(error)) return null;
  return <Notice kind="warning">{error!.message || NO_STAFF_TEXT}</Notice>;
}
