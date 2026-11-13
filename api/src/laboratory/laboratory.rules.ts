import { LabMark } from './laboratory.dto';

export type ReferenceRange = {
  minimo: string | number | null;
  maximo: string | number | null;
  critico_bajo: string | number | null;
  critico_alto: string | number | null;
};

export function classifyLabValue(value: number | undefined, range?: ReferenceRange): LabMark {
  if (value === undefined || !range) return LabMark.NO_RANGE;
  if (range.critico_bajo !== null && value < Number(range.critico_bajo)) return LabMark.CRITICAL_LOW;
  if (range.critico_alto !== null && value > Number(range.critico_alto)) return LabMark.CRITICAL_HIGH;
  if (range.minimo !== null && value < Number(range.minimo)) return LabMark.LOW;
  if (range.maximo !== null && value > Number(range.maximo)) return LabMark.HIGH;
  return LabMark.NORMAL;
}

export function normalizePatientName(value: string) {
  return value.trim().toLocaleLowerCase('es-SV').replace(/\s+/g, ' ');
}

export function matchesDoubleIdentification(identity: { expediente: string; fullName: string }, expediente: string, nombreCompleto: string) {
  return expediente.trim() === identity.expediente && normalizePatientName(nombreCompleto) === normalizePatientName(identity.fullName);
}
