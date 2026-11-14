import { roleNames } from '../../lib/api';

export type Priority = 'atencion' | 'urgente' | 'critico';
export const priorities: { id: Priority; label: string; hint: string }[] = [
  { id: 'atencion', label: 'Atención', hint: 'Información general que conviene leer.' },
  { id: 'urgente', label: 'Urgente', hint: 'Requiere leerse hoy; se destaca en amarillo.' },
  { id: 'critico', label: 'Crítico', hint: 'Afecta la operación o la seguridad; se destaca en rojo.' },
];
export const priorityLabel = (priority: string) => priorities.find(p => p.id === priority)?.label ?? priority;

/** Roles a los que se puede dirigir un aviso en su tablero de inicio (web y Android). */
export const audienceRoles = ['ADM', 'JOP', 'REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR', 'DPD'] as const;

export type NoticeAudience = { id: string; titulo: string; cuerpo: string; desde: string | null; hasta: string | null; prioridad: string; publico: boolean; roles: string[] };
export type NoticeListItem = NoticeAudience & { estado: 'vigente' | 'programado' | 'vencido'; publicadoEn: string | null };
export type MyNotices = { actualizadoEn: string; avisos: NoticeAudience[]; proximoCambio: string | null };

/** Dónde se ve un aviso, en palabras: «Pantalla pública y apps sin sesión» o «Medicina y Enfermería». */
export function audienceText(notice: Pick<NoticeAudience, 'publico' | 'roles'>) {
  const parts: string[] = [];
  if (notice.publico) parts.push('Pantalla pública y apps sin sesión');
  if (notice.roles.length) parts.push(notice.roles.map(r => roleNames[r] ?? r).join(', '));
  return parts.join(' + ');
}

/** Espejo en el cliente de `api/src/public/notice.rules.ts`: avisa antes de enviar; la API vuelve a comprobarlo. */
const PATTERNS: [string, RegExp][] = [
  ['un DUI', /(?<![\dA-Za-z-])\d{8}-?\d(?![\dA-Za-z-])/],
  ['un número de expediente', /(?<![\dA-Za-z-])\d{7}-[\dXx](?![\dA-Za-z-])/],
  ['un teléfono', /(?<![\dA-Za-z-])(?:\+?503[ -]?)?[267]\d{3}[ -]?\d{4}(?![\dA-Za-z-])/],
];
export const personalDataIn = (...texts: string[]) => PATTERNS.filter(([, pattern]) => pattern.test(texts.join('\n'))).map(([kind]) => kind);

/** `datetime-local` se interpreta en la hora de El Salvador (UTC-6 todo el año, FR-100-16). */
export const localToIso = (value: string) => value ? new Date(`${value.length === 16 ? value + ':00' : value}-06:00`).toISOString() : '';
/** `yyyy-MM-ddTHH:mm` en hora de El Salvador, sumando horas a `now`. */
export const localInput = (hoursFromNow: number, now = new Date()) => new Date(now.getTime() - 6 * 3600_000 + hoursFromNow * 3600_000).toISOString().slice(0, 16);
export const durations: { hours: number; label: string }[] = [{ hours: 24, label: '24 horas' }, { hours: 72, label: '3 días' }, { hours: 168, label: '7 días' }, { hours: 720, label: '30 días' }];
