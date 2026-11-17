/**
 * R4a (S8, W-REC-15, WC-27): one count of appointment requests for Inicio and Citas. A request is either an appointment
 * the patient asked for with a doctor and time («solicitada», Recepción confirms it) or a request by category without
 * doctor («pendiente», Recepción assigns doctor and time). Both wait on Recepción, so both count.
 */
export const isAskedAppointment = (a: { state: string }) => a.state === 'solicitada';
export const isPendingCategoryRequest = (r: { state: string }) => r.state === 'pendiente';
export const appointmentRequestCount = (appointments: { state: string }[], categoryRequests: { state: string }[]) =>
  appointments.filter(isAskedAppointment).length + categoryRequests.filter(isPendingCategoryRequest).length;
