/** Datos personales que un aviso público no debería llevar (FR-112-05, LPDP: minimización). */
export type PersonalDataKind = 'dui' | 'expediente' | 'telefono';

const PATTERNS: Array<[PersonalDataKind, RegExp]> = [
  ['dui', /(?<![\dA-Za-z-])\d{8}-?\d(?![\dA-Za-z-])/],
  ['expediente', /(?<![\dA-Za-z-])\d{7}-[\dXx](?![\dA-Za-z-])/],
  ['telefono', /(?<![\dA-Za-z-])(?:\+?503[ -]?)?[267]\d{3}[ -]?\d{4}(?![\dA-Za-z-])/],
];

/** Tipos de dato personal encontrados en el texto, sin repetir y en orden fijo. */
export function personalDataIn(...texts: string[]): PersonalDataKind[] {
  const text = texts.join('\n');
  return PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind);
}
