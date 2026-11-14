/** Reglas puras de la lista de trabajo de laboratorio (ronda 2, obs. 4). Sin red ni reloj: `now` llega como parámetro. */

export type WorkOrder = {
  id: string; priority: string; state: string; createdAt: string; sampleTakenAt?: string | null; completedAt?: string | null; reviewedAt?: string | null; patientName: string;
  items: { id: string; code: string; name: string; result?: { mark: string } | null }[];
};

export type Stage = 'pendiente' | 'en_proceso' | 'por_revisar' | 'liberada' | 'cancelada';
export const STAGE_LABEL: Record<Stage, string> = { pendiente: 'Pendiente', en_proceso: 'En proceso', por_revisar: 'Por revisar', liberada: 'Liberada', cancelada: 'Cancelada' };
/** Un solo tono por etapa; la misma paleta se usa en chips, borde de la fila y filtros. */
export const STAGE_TONE: Record<Stage, string> = { pendiente: 'warning', en_proceso: 'info', por_revisar: 'review', liberada: 'success', cancelada: 'muted' };

export function stageOf(order: Pick<WorkOrder, 'state' | 'reviewedAt'>): Stage {
  if (order.state === 'cancelado') return 'cancelada';
  if (order.state === 'pendiente') return 'pendiente';
  if (order.state === 'en_proceso') return 'en_proceso';
  return order.reviewedAt ? 'liberada' : 'por_revisar';
}

/** Metas de tiempo desde que se pidió el estudio (minutos). Son una guía visual de la lista, no una regla de negocio. */
export const SLA_MINUTES = { urgente: { warn: 30, late: 60 }, rutina: { warn: 120, late: 240 } } as const;
export type SlaLevel = 'ok' | 'warn' | 'late' | 'none';

export const elapsedMinutes = (order: Pick<WorkOrder, 'createdAt'>, now: number) => Math.max(0, Math.floor((now - Date.parse(order.createdAt)) / 60_000));

/** Solo corre el reloj mientras la orden espera a Laboratorio; después ya no hay nada que vigilar. */
export function slaLevel(order: Pick<WorkOrder, 'priority' | 'state' | 'createdAt'>, now: number): SlaLevel {
  if (order.state !== 'pendiente' && order.state !== 'en_proceso') return 'none';
  const goal = SLA_MINUTES[order.priority === 'urgente' ? 'urgente' : 'rutina'], minutes = elapsedMinutes(order, now);
  return minutes >= goal.late ? 'late' : minutes >= goal.warn ? 'warn' : 'ok';
}

export function formatElapsed(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${hours} h`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export const isCritical = (order: Pick<WorkOrder, 'items'>) => order.items.some(item => item.result?.mark === 'critico_alto' || item.result?.mark === 'critico_bajo');

export type WorkSort = 'prioridad' | 'antiguas' | 'paciente';
/** Por defecto: urgentes primero y, dentro de cada prioridad, la que más lleva esperando. */
export function sortOrders<T extends WorkOrder>(orders: T[], sort: WorkSort): T[] {
  const byAge = (a: T, b: T) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
  const open = (o: T) => (o.state === 'completado' || o.state === 'cancelado' ? 1 : 0);
  const copy = [...orders];
  if (sort === 'paciente') return copy.sort((a, b) => a.patientName.localeCompare(b.patientName, 'es'));
  if (sort === 'antiguas') return copy.sort(byAge);
  return copy.sort((a, b) => open(a) - open(b) || Number(b.priority === 'urgente') - Number(a.priority === 'urgente') || byAge(a, b));
}
