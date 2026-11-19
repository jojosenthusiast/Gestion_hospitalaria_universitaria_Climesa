import { joinParts } from '../../lib/format';

const SEX: Record<string, string> = { femenino: 'Femenino', masculino: 'Masculino', indeterminado: 'Indeterminado' };

/**
 * Lote 5 S6: age and sex of the patient on queue and request rows («34 años · Femenino»). The API sends them only to roles
 * that may see them (`pacientes.ver_nacimiento`, `pacientes.ver_ficha`), so a missing field just leaves the part out.
 */
export function patientFacts(row: { patientAge?: number | null; patientSex?: string | null }) {
  const age = typeof row.patientAge === 'number' ? (row.patientAge === 1 ? '1 año' : `${row.patientAge} años`) : null;
  const sex = row.patientSex && row.patientSex !== 'no_registrado' ? SEX[row.patientSex] ?? row.patientSex : null;
  return joinParts(age, sex);
}
