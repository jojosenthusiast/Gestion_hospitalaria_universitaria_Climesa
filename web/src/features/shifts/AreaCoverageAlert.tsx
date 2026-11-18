import { Notice } from '../../components/ui';
import type { Api } from '../../lib/api';
import { useData } from '../common';
import { draftCountLabel, gapCountLabel, pendingGapBlocks } from './GapCover';
import { mondayOf, weekDays } from './week';

/** Hueco de cobertura de `GET /turnos/cobertura`: un área con menos personal de un rol que el mínimo vigente (RN-15). */
export type AreaGap = { areaId: string; area: string; role: string; start: string; end: string; required: number; actual: number; actualConBorradores?: number };
export type CoverageWeek = { from: string; to: string; gaps: AreaGap[] };

/** This week (Monday to Sunday) of `now`: the window the alert names «esta semana». */
export const thisWeek = (now: Date) => { const days = weekDays(mondayOf(now.valueOf())); return { from: days[0].date, to: days[6].date }; };

/**
 * MA-REQ-02 (RN-15): turnos por cubrir esta semana según la política `turnos.cobertura_minima`, con la regla única de
 * huecos (`pendingGapBlocks`) y el filtro de área de la pantalla. Es el cliente de `GET /turnos/cobertura` (la misma
 * dirección que la semana visible cuando es esta semana) y se actualiza en vivo con los eventos de turnos y personal.
 * Solo un resumen: los huecos y «Cubrir hueco» están en la lista de la semana (`onShow` lleva a ella).
 */
export function AreaCoverageAlert({ api, version, now, areaId, onShow }: { api: Api; version: number; now: Date; areaId?: string; onShow?: () => void }) {
  const { from, to } = thisWeek(now);
  const week = useData<CoverageWeek>(api, `/turnos/cobertura?from=${from}&to=${to}`, version);
  if (week.error?.status === 403) return null;
  const retry = <button type="button" className="secondary-button" onClick={week.refresh}>Volver a intentar</button>;
  if (week.error) return <Notice kind="error">No pudimos revisar la cobertura mínima de esta semana: {week.error.message} {retry}</Notice>;
  if (week.data === undefined || week.data === null) return null;
  const list = week.data.gaps;
  // A 200 without the gap list is a broken answer, not "no gaps": say so instead of hiding the alert.
  if (!Array.isArray(list)) return <Notice kind="error">No pudimos revisar la cobertura mínima de esta semana: la respuesta llegó incompleta. {retry}</Notice>;
  const { open, inDraft } = pendingGapBlocks(list.filter(g => !areaId || g.areaId === areaId), now);
  if (!open.length && !inDraft.length) return null;
  return <section className="crew-coverage" aria-label="Cobertura mínima por área">
    <Notice kind="info"><strong>{gapCountLabel(open.length, 'esta semana')}{inDraft.length ? ` · ${draftCountLabel(inDraft.length)}` : ''}.</strong> Cada área necesita el personal que fija la política de cobertura mínima (RN-15).{inDraft.length ? ' Los borradores cuentan al publicar la semana.' : ''}</Notice>
    {onShow && <button type="button" className="secondary-button" onClick={onShow}>Ver los huecos de esta semana</button>}
  </section>;
}
