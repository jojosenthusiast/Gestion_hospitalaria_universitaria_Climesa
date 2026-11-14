/** Reglas puras del tablero de la fila del día (ronda 2, obs. 13). */
export type BoardTicket = { id: string; service: string; numero: number; patientName?: string | null; state: string; llamados: number; issuedAt: string };

export type Column = 'espera' | 'llamado' | 'atencion' | 'cerrado';
export const COLUMN_LABEL: Record<Column, string> = { espera: 'En espera', llamado: 'Llamados', atencion: 'En atención', cerrado: 'Terminados' };
export const COLUMN_TONE: Record<Column, string> = { espera: 'warning', llamado: 'review', atencion: 'info', cerrado: 'success' };
export const COLUMNS: Column[] = ['espera', 'llamado', 'atencion', 'cerrado'];

export const columnOf = (ticket: Pick<BoardTicket, 'state'>): Column =>
  ticket.state === 'en_espera' ? 'espera' : ticket.state === 'llamado' ? 'llamado' : ticket.state === 'en_atencion' ? 'atencion' : 'cerrado';

export const serviceNames: Record<string, string> = { consulta_general: 'Consulta general', emergencia: 'Emergencia', laboratorio: 'Laboratorio', admisiones: 'Admisiones' };

export const waitMinutes = (ticket: Pick<BoardTicket, 'issuedAt'>, now: number) => Math.max(0, Math.floor((now - Date.parse(ticket.issuedAt)) / 60_000));

/** Meta visual de espera (minutos): guía de la pantalla, no una regla de negocio. */
export const WAIT_GOAL = { warn: 20, late: 45 } as const;
export function waitLevel(ticket: Pick<BoardTicket, 'state' | 'issuedAt'>, now: number): 'ok' | 'warn' | 'late' | 'none' {
  if (ticket.state !== 'en_espera' && ticket.state !== 'llamado') return 'none';
  const minutes = waitMinutes(ticket, now);
  return minutes >= WAIT_GOAL.late ? 'late' : minutes >= WAIT_GOAL.warn ? 'warn' : 'ok';
}

export function boardSummary(tickets: BoardTicket[], now: number) {
  const counts: Record<Column, number> = { espera: 0, llamado: 0, atencion: 0, cerrado: 0 };
  for (const ticket of tickets) counts[columnOf(ticket)]++;
  const waiting = tickets.filter(t => t.state === 'en_espera' || t.state === 'llamado').map(t => waitMinutes(t, now));
  return { counts, averageWait: waiting.length ? Math.round(waiting.reduce((a, b) => a + b, 0) / waiting.length) : 0, longestWait: waiting.length ? Math.max(...waiting) : 0 };
}

/** Los que esperan, por número (el más bajo se llama primero); los terminados, los más recientes arriba. */
export const sortColumn = <T extends BoardTicket>(tickets: T[], column: Column) =>
  [...tickets].sort((a, b) => column === 'cerrado' ? b.numero - a.numero : a.numero - b.numero);
