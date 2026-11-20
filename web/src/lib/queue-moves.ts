/**
 * Fase 2, flujo B (S9): moving a queue card between board columns. A move is only a request for one server action;
 * the server stays the authority (`allowedActions` / `undoActions` of `GET /fila`). Dragging, the keyboard and the
 * card menu all go through `moveFor`, so the three paths can never offer a move the server would reject.
 */
export type BoardColumn = 'espera' | 'llamado' | 'atencion' | 'cerrado';
export type QueueMoveAction = 'llamar' | 'atender' | 'completar' | 'no_se_presento' | 'deshacer_llamado';
export type MovableTicket = { state: string; llamados?: number; allowedActions?: string[]; undoActions?: string[]; blockedActions?: { action: string; reason: string }[] };

export const columnOfState = (state: string): BoardColumn =>
  state === 'en_espera' ? 'espera' : state === 'llamado' ? 'llamado' : state === 'en_atencion' ? 'atencion' : 'cerrado';

/** Which server action a move from one column to another means; null when no action moves a card that way. */
const MOVES: Partial<Record<BoardColumn, Partial<Record<BoardColumn, QueueMoveAction>>>> = {
  espera: { llamado: 'llamar' },
  llamado: { espera: 'deshacer_llamado', atencion: 'atender', cerrado: 'no_se_presento' },
  atencion: { cerrado: 'completar' },
};

export const MOVE_PATH: Record<QueueMoveAction, string> = { llamar: 'llamar', atender: 'atender', completar: 'completar', no_se_presento: 'no-se-presento', deshacer_llamado: 'deshacer-llamado' };
export const MOVE_LABEL: Record<QueueMoveAction, string> = { llamar: 'Llamar', atender: 'Iniciar atención', completar: 'Completar', no_se_presento: 'No se presentó', deshacer_llamado: 'Devolver a espera' };

export type MoveCheck = { action: QueueMoveAction; allowed: true } | { action: QueueMoveAction | null; allowed: false; reason: string };

/** Decides a move with what the server said about the ticket. */
export function moveFor(ticket: MovableTicket, to: BoardColumn): MoveCheck {
  const from = columnOfState(ticket.state);
  if (from === to) return { action: null, allowed: false, reason: 'Ya está en esa columna.' };
  const action = MOVES[from]?.[to] ?? null;
  if (!action) return { action: null, allowed: false, reason: 'Ese cambio no existe en la fila: sigue el orden espera, llamado, atención, terminado.' };
  // Undo removes one call; only the last one sends the number back to waiting. With more calls the card would drop
  // into "En espera" and jump back to "Llamados", so it is not a column move (the card offers "Deshacer llamado").
  if (action === 'deshacer_llamado' && (ticket.llamados ?? 1) > 1)
    return { action: null, allowed: false, reason: `Tiene ${ticket.llamados} llamados: usa «Deshacer llamado» en la tarjeta; vuelve a la espera al deshacer el último.` };
  const server = action === 'deshacer_llamado' ? ticket.undoActions ?? [] : ticket.allowedActions ?? [];
  if (server.includes(action)) return { action, allowed: true };
  const blocked = ticket.blockedActions?.find(item => item.action === action);
  return { action, allowed: false, reason: blocked?.reason ?? 'Tu cuenta no puede hacer ese cambio ahora.' };
}

/** Audit D42: "Deshacer llamado" removes the last call of a called number whenever the server allows it. */
export const canUndoCall = (ticket: MovableTicket) =>
  ticket.state === 'llamado' && (ticket.undoActions ?? []).includes('deshacer_llamado');

/** Columns the card may move to now, for the keyboard / mobile menu and to highlight drop targets. */
export function destinations(ticket: MovableTicket): { to: BoardColumn; action: QueueMoveAction }[] {
  return (['espera', 'llamado', 'atencion', 'cerrado'] as BoardColumn[])
    .map(to => ({ to, check: moveFor(ticket, to) }))
    .filter((item): item is { to: BoardColumn; check: { action: QueueMoveAction; allowed: true } } => item.check.allowed)
    .map(item => ({ to: item.to, action: item.check.action }));
}

/** Area code of a queue service, the same table the API uses (`area` in `GET /fila`). */
export const SERVICE_AREA: Record<string, string> = { consulta_general: 'CON', emergencia: 'EMG', laboratorio: 'LAB', admisiones: 'REC' };

/** "10:30" in El Salvador time for an appointment instant. */
export const localTime = (iso: string) => new Date(Date.parse(iso) - 6 * 3_600_000).toISOString().slice(11, 16);
