/** S1 (preconditions): absent flags (an older API) keep every row available, as before. */
export type PickerPatientRow = { id: string; record: string; fullName: string; age?: number | null; active?: boolean; activeAdmission?: boolean; careContext?: boolean };
/** What the picker is for: `attend` (number, appointment, front desk) or `admit` (admission intake). */
export type PatientPickerGate = 'attend' | 'admit';
export const PATIENT_INACTIVE_REASON = 'Paciente inactivo: actívalo en Pacientes para atenderlo.';
export const PATIENT_ADMITTED_REASON = 'Ya tiene una admisión activa.';
/** Why a selector row cannot be chosen for `gate`, or undefined when it can (the same precondition the API checks). */
export function patientRowBlock(p: Pick<PickerPatientRow, 'active' | 'activeAdmission'>, gate: PatientPickerGate): string | undefined {
  if (p.active === false) return PATIENT_INACTIVE_REASON;
  if (gate === 'admit' && p.activeAdmission === true) return PATIENT_ADMITTED_REASON;
  return undefined;
}
