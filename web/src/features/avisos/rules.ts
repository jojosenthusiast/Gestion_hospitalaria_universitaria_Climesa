import { roleNames } from '../../lib/api';
import { formatDate, formatTime, localDayKey } from '../../lib/format';

export type Priority = 'atencion' | 'urgente' | 'critico';
export const priorities: { id: Priority; label: string; hint: string }[] = [
  { id: 'atencion', label: 'Atención', hint: 'Información general que conviene leer.' },
  { id: 'urgente', label: 'Urgente', hint: 'Requiere leerse hoy; se destaca en amarillo.' },
  { id: 'critico', label: 'Crítico', hint: 'Afecta la operación o la seguridad; se destaca en rojo.' },
];
export const priorityLabel = (priority: string) => priorities.find(p => p.id === priority)?.label ?? priority;

/** Roles a los que se puede dirigir un aviso en su tablero de inicio (web y Android). */
export const audienceRoles = ['ADM', 'JOP', 'REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR', 'DPD'] as const;

/** Fase 2, S11: criticidad para el personal. Solo «Crítico» se destaca en el inicio de quien lo recibe. */
export type Level = 'informativo' | 'importante' | 'critico';
/** `status`: the same priority look as the level badge of a notice (`NoticeLevelBadge`). */
export const levels: { id: Level; label: string; hint: string; status?: string }[] = [
  { id: 'informativo', label: 'Informativo', hint: 'Queda en Avisos; no interrumpe a nadie.' },
  { id: 'importante', label: 'Importante', hint: 'Se marca en Avisos para leerlo hoy; no sale en el inicio.', status: 'urgente' },
  { id: 'critico', label: 'Crítico', hint: 'Sale en el inicio de su rol o área hasta que cada persona da «Enterado».', status: 'emergencia' },
];
export const levelLabel = (level: string | undefined) => levels.find(l => l.id === level)?.label ?? 'Informativo';
/** Prioridad visual (D-071) de la pantalla pública que corresponde a cada nivel; la API aplica la misma regla. */
export const priorityOfLevel: Record<Level, Priority> = { informativo: 'atencion', importante: 'urgente', critico: 'critico' };

export type NoticeAudience = { id: string; titulo: string; cuerpo: string; desde: string | null; hasta: string | null; prioridad: string; publico: boolean; roles: string[]; nivel?: Level; areas?: string[] };
/** Acciones que el servidor acepta sobre un aviso (MA-AVI-02); vacío si venció o fue retirado. */
export type NoticeAction = 'editar' | 'retirar';
export type NoticeListItem = NoticeAudience & {
  estado: 'vigente' | 'programado' | 'vencido' | 'retirado'; publicadoEn: string | null;
  version: number; allowedActions: NoticeAction[]; retiradoEn: string | null; motivoRetiro: string | null;
};
/** Motivo mínimo para retirar un aviso (D-13); la API lo vuelve a exigir. */
export const WITHDRAW_MIN = 10;
export type MyNotices = { actualizadoEn: string; avisos: NoticeAudience[]; proximoCambio: string | null };
/** `GET /me/avisos/bandeja` (S11). */
/** `vigente` is in force now; `programado` starts later; `vencido` ended in the last 30 days (history, like past appointments). */
export type InboxState = 'vigente' | 'programado' | 'vencido';
/** `estado` is absent in answers older than the history: those only carried notices in force. */
export type InboxNotice = NoticeAudience & { nivel: Level; areas: string[]; estado?: InboxState; publicadoEn: string | null; dirigido: boolean; enteradoEn: string | null; recordarEn: string | null; destacado: boolean };
export const inboxState = (n: Pick<InboxNotice, 'estado'>): InboxState => n.estado ?? 'vigente';
export type Inbox = { actualizadoEn: string; avisos: InboxNotice[]; noLeidos: number; criticos: number; recordatorioHoras: number; proximoCambio: string | null };
export type NoticeAck = { avisoId: string; enteradoEn: string | null; recordarEn: string | null };
/** `GET /avisos/estadisticas` (S11): solo conteos, nunca nombres. */
export type NoticeStats = { avisoId: string; enterados: number; destinatarios: number };
export type InboxFilter = 'todos' | 'sin-leer' | 'criticos';
/** `status`: the look of what each filter keeps («Sin leer» badge, «Crítico» level badge), so the button matches it. */
export const inboxFilters: { id: InboxFilter; label: string; status?: string }[] = [{ id: 'todos', label: 'Todos' }, { id: 'sin-leer', label: 'Sin leer', status: 'pendiente' }, { id: 'criticos', label: 'Críticos', status: 'emergencia' }];
/** «Sin leer» keeps only notices in force without «Enterado»: expired and scheduled ones cannot be acknowledged. */
export const filterInbox = (items: InboxNotice[], filter: InboxFilter) =>
  filter === 'sin-leer' ? items.filter(n => inboxState(n) === 'vigente' && !n.enteradoEn) : filter === 'criticos' ? items.filter(n => n.nivel === 'critico') : items;

/** Tag of a notice that is not in force, with the shared status families: scheduled waits, expired is closed. */
export const inboxStateTag: Record<Exclude<InboxState, 'vigente'>, { value: string; label: string }> = { programado: { value: 'pendiente', label: 'Programado' }, vencido: { value: 'inactivo', label: 'Vencido' } };
export type InboxDay = { day: string; items: InboxNotice[] };
/**
 * The inbox laid out like the appointments agenda: notices in force first, then scheduled ones by the day they start
 * (soonest first), and expired ones by the day they ended (latest first), which the page folds by default.
 */
export function groupInbox(items: InboxNotice[]) {
  const byDay = (list: InboxNotice[], at: (n: InboxNotice) => string, order: 1 | -1): InboxDay[] => {
    const sorted = [...list].sort((a, b) => order * (Date.parse(at(a)) - Date.parse(at(b))));
    const days: InboxDay[] = [];
    for (const n of sorted) { const day = localDayKey(at(n)); const last = days[days.length - 1]; if (last?.day === day) last.items.push(n); else days.push({ day, items: [n] }); }
    return days;
  };
  return {
    current: items.filter(n => inboxState(n) === 'vigente'),
    upcoming: byDay(items.filter(n => inboxState(n) === 'programado'), n => n.desde ?? '', 1),
    past: byDay(items.filter(n => inboxState(n) === 'vencido'), n => n.hasta ?? '', -1),
  };
}
/** «hoy, 09:33» or «16 nov, 09:33»: short and without the year, like the agenda. */
export const shortWhen = (iso: string, now = new Date()) => `${localDayKey(iso) === localDayKey(now) ? 'hoy' : formatDate(iso, { withYear: false })}, ${formatTime(iso)}`;

/** Dónde se ve un aviso, en palabras: «Pantalla pública y apps sin sesión» o «Medicina y Enfermería». */
export function audienceText(notice: Pick<NoticeAudience, 'publico' | 'roles' | 'areas'>) {
  const parts: string[] = [];
  if (notice.publico) parts.push('Pantalla pública y apps sin sesión');
  if (notice.roles.length) parts.push(notice.roles.map(r => roleNames[r] ?? r).join(', '));
  if (notice.areas?.length) parts.push(`Área ${notice.areas.join(', ')}`);
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
/** ISO del servidor → `yyyy-MM-ddTHH:mm` en hora de El Salvador (UTC-6), para precargar un `datetime-local` al editar. */
export const isoToLocalInput = (iso: string) => new Date(Date.parse(iso) - 6 * 3600_000).toISOString().slice(0, 16);
