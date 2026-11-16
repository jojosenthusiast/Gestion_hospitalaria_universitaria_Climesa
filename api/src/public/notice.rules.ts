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

/** Fase 2, S11: criticidad de un aviso para el personal. Solo `critico` se destaca en el inicio. */
export const NOTICE_LEVELS = ['informativo', 'importante', 'critico'] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];
const LEVEL_RANK: Record<string, number> = { critico: 0, importante: 1, informativo: 2 };
/** Prioridad visual (D-071) que corresponde a un nivel cuando quien publica no la indica. */
const PRIORITY_OF_LEVEL: Record<NoticeLevel, string> = { informativo: 'atencion', importante: 'urgente', critico: 'critico' };
export const priorityOfLevel = (level: NoticeLevel) => PRIORITY_OF_LEVEL[level];
/** Horas que tarda en volver un aviso crítico pospuesto sin "Enterado" si falta la política `avisos.recordatorio_horas`. */
export const DEFAULT_REMINDER_HOURS = 4;

export type InboxState = { nivel: string; dirigido: boolean; enteradoEn: Date | null; recordarEn: Date | null };
/**
 * Un aviso se destaca en el inicio cuando es crítico, está dirigido al rol o al área de la cuenta (no basta con ser
 * público), la cuenta no dio "Enterado" y no lo pospuso más allá de `now`.
 */
export const isHighlighted = (n: InboxState, now: Date) => n.nivel === 'critico' && n.dirigido && !n.enteradoEn && (!n.recordarEn || n.recordarEn <= now);
/** Orden de la bandeja: destacados, luego críticos pendientes, luego por nivel y lo más reciente primero. */
export function inboxOrder<T extends InboxState & { desde: Date }>(items: T[], now: Date): T[] {
  const key = (n: T) => [isHighlighted(n, now) ? 0 : 1, n.nivel === 'critico' && n.dirigido && !n.enteradoEn ? 0 : 1, LEVEL_RANK[n.nivel] ?? 3, -n.desde.valueOf()];
  return [...items].sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
}
