import type { Tone } from '../../components/charts';
import type { Remote } from '../common';
import { gapHref, pendingGapBlocks } from '../shifts/GapCover';
import { boardGaps } from '../tablero';
import type { DashboardData } from './data';
import { timeLabel, type TrayGroupSpec } from './parts';

const ROLE_NAMES: Record<string, string> = { MED: 'Medicina', ENF: 'Enfermería', REC: 'Recepción', LAB: 'Laboratorio' };

/**
 * Inicio · «Turnos por cubrir hoy»: today's holes with the one gap rule (end after now, 12 h blocks, drafts apart), the
 * same count as the Métricas card. Each row opens «Cubrir hueco» on that hole in Turnos, never a blank shift form.
 */
export function coverageTodayGroup(d: DashboardData, now: Date = new Date()): TrayGroupSpec {
  const open = d.board.data ? pendingGapBlocks(boardGaps(d.board.data.cobertura), now).open : [];
  return {
    id: 'huecos', title: 'Turnos por cubrir hoy', href: '#/turnos', masculine: true, state: d.board as Remote<unknown>,
    items: open.map(b => ({ id: b.key, title: `${b.area} · ${ROLE_NAMES[b.role] ?? b.role}`, detail: `${timeLabel(b.start)}–${timeLabel(b.end)} · ${b.missing === 1 ? 'falta 1 persona' : `faltan ${b.missing} personas`}`, tone: 'warn' as Tone, href: gapHref(b), action: 'Cubrir' })),
  };
}
