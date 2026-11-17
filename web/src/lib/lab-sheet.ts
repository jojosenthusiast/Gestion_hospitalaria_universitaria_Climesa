/**
 * R7 U3, journey C1: pure rules of the lab result sheet and of the release summary. The server still computes the stored
 * mark (RN-24); this only flags a value in place, with the same comparisons as `classifyLabValue` in the API, so the
 * technician sees "Crítico" before saving.
 */
export type ReferenceRange = { min: number | null; max: number | null; criticalLow: number | null; criticalHigh: number | null };
export type SheetMark = 'critico' | 'fuera' | 'normal' | 'sin_rango';

export function markOf(value: number, range?: ReferenceRange | null): SheetMark {
  if (!range || !Number.isFinite(value)) return 'sin_rango';
  if (range.criticalLow !== null && value < range.criticalLow) return 'critico';
  if (range.criticalHigh !== null && value > range.criticalHigh) return 'critico';
  if (range.min !== null && value < range.min) return 'fuera';
  if (range.max !== null && value > range.max) return 'fuera';
  return 'normal';
}

const num = (value: number) => new Intl.NumberFormat('es-SV', { maximumFractionDigits: 3 }).format(value);

/** «12–15,5», «≤ 200», «≥ 70»; empty without limits. */
export function rangeText(range?: ReferenceRange | null) {
  if (!range) return '';
  if (range.min !== null && range.max !== null) return `${num(range.min)}–${num(range.max)}`;
  if (range.max !== null) return `≤ ${num(range.max)}`;
  if (range.min !== null) return `≥ ${num(range.min)}`;
  return '';
}

/** A typed number as the API wants it: «5,1» and «5.1» both mean 5.1; anything else is not a number. */
export function parseValue(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** Server marks in words for people (never the raw code). */
export const MARK_WORDS: Record<string, string> = { normal: 'normal', alto: 'alto', bajo: 'bajo', critico_alto: 'crítico alto', critico_bajo: 'crítico bajo', sin_rango: 'sin rango' };
export const isCriticalMark = (mark?: string | null) => !!mark && mark.startsWith('critico_');
const isAbnormalMark = (mark?: string | null) => mark === 'alto' || mark === 'bajo';

export type ReleaseValue = { name: string; value?: number | null; text?: string | null; unit?: string | null; mark?: string | null };

/** «Hemoglobina 5,1 g/dL (crítico bajo)»: what the patient will see, critical first, then out of range, then the rest. */
export function releaseLines(values: ReleaseValue[]) {
  const rank = (v: ReleaseValue) => isCriticalMark(v.mark) ? 0 : isAbnormalMark(v.mark) ? 1 : 2;
  return [...values].sort((a, b) => rank(a) - rank(b)).map(v => {
    const shown = v.text ?? (typeof v.value === 'number' ? `${num(v.value)}${v.unit ? ` ${v.unit}` : ''}` : 'sin valor');
    const flag = v.mark && v.mark !== 'normal' && v.mark !== 'sin_rango' ? ` (${MARK_WORDS[v.mark] ?? v.mark})` : '';
    return { text: `${v.name} ${shown}${flag}`, critical: isCriticalMark(v.mark) };
  });
}
