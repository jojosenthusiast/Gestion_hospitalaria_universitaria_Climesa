// R7 U1 (journey B1): the front desk hands what it searched to the patient register in memory.
// Names and DUIs never go into the address: they would stay in the history of a shared computer.
let pending: string | null = null;

/** The front desk calls this right before following «Registrar paciente nuevo». */
export function handOffPatientSearch(text: string) { pending = text.trim(); }

/** The register reads the handed text once; `null` means the register was not opened from the front desk. */
export function takePatientSearch(): string | null {
  const text = pending;
  pending = null;
  return text;
}
