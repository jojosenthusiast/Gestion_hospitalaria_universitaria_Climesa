import { useEffect, useState } from 'react';
import { Notice } from '../../components/ui';
import { ApiError, type Api } from '../../lib/api';
import { Dialog, RemoteState, useData } from '../common';
import type { AreaGap } from './AreaCoverageAlert';
import type { PreviewItem } from './plan';
import { timeRange } from './ShiftWeek';

const HOUR = 3_600_000, MAX_BLOCK = 12 * HOUR;
const ROLE_NAMES: Record<string, string> = { MED: 'Medicina', ENF: 'Enfermería', REC: 'Recepción', LAB: 'Laboratorio' };
const dayFmt = new Intl.DateTimeFormat('es-SV', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/El_Salvador' });
const hourOf = (iso: string) => Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(new Date(iso)));

/**
 * A coverage hole to fill: contiguous hourly gaps of one area and function joined, cut into shifts of at most 12 h.
 * `inDraft`: every hour of the piece already reaches the minimum counting drafts (`actualConBorradores`); it only needs publishing.
 */
export type GapBlock = { key: string; areaId: string; area: string; role: string; start: string; end: string; missing: number; inDraft?: boolean };
export type Candidate = { staffId: string; person: string; sameArea: boolean; weekHours: number; advertencias: { codigo: string; horasSemana: number; limite: number }[] };
export type Rejected = { staffId: string; person: string; codigo: string; mensaje: string };
type Candidates = { candidatos: Candidate[]; descartados: Rejected[] };

export function gapBlocks(gaps: AreaGap[]): GapBlock[] {
  const sorted = [...gaps].sort((a, b) => a.areaId.localeCompare(b.areaId) || a.role.localeCompare(b.role) || Date.parse(a.start) - Date.parse(b.start));
  const joined: { block: GapBlock; hours: AreaGap[] }[] = [];
  for (const g of sorted) {
    const last = joined.at(-1);
    if (last && last.block.areaId === g.areaId && last.block.role === g.role && last.block.end === g.start) { last.block.end = g.end; last.hours.push(g); continue; }
    joined.push({ block: { key: '', areaId: g.areaId, area: g.area, role: g.role, start: g.start, end: g.end, missing: 1 }, hours: [g] });
  }
  return joined.flatMap(({ block: b, hours }) => {
    const pieces: GapBlock[] = [];
    for (let from = Date.parse(b.start); from < Date.parse(b.end); from += MAX_BLOCK) {
      const to = Math.min(from + MAX_BLOCK, Date.parse(b.end));
      // Each piece reads only its own hours: how many people are missing and whether drafts already cover all of them.
      const own = hours.filter(g => Date.parse(g.start) < to && Date.parse(g.end) > from);
      const missing = Math.max(1, ...own.map(g => g.required - g.actual));
      const inDraft = own.every(g => (g.actualConBorradores ?? g.actual) >= g.required);
      pieces.push({ ...b, start: new Date(from).toISOString(), end: new Date(to).toISOString(), key: `${b.areaId}-${b.role}-${from}`, missing, inDraft });
    }
    return pieces;
  }).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.area.localeCompare(b.area, 'es'));
}

/** Shifts start a few minutes ahead (the API does not take a shift that already started): the next 5-minute mark. */
const STEP = 5 * 60_000;
const startFrom = (now: number) => Math.ceil(now / STEP) * STEP;

/**
 * THE gap rule of every screen (Inicio, Turnos, Métricas): the holes whose end is after now, their start clipped to now,
 * in the same 12 h blocks the gap filler proposes. `open` still has to be filled; `inDraft` is covered by drafts that
 * are not published yet (it stops counting as «por cubrir» but still has to be published).
 */
export function pendingGapBlocks(gaps: AreaGap[], now: Date | number): { open: GapBlock[]; inDraft: GapBlock[] } {
  const from = startFrom(now.valueOf());
  const ahead = gaps.filter(g => Date.parse(g.end) > from).map(g => Date.parse(g.start) < from ? { ...g, start: new Date(from).toISOString() } : g);
  const blocks = gapBlocks(ahead);
  return { open: blocks.filter(b => !b.inDraft), inDraft: blocks.filter(b => b.inDraft) };
}

/** One wording for one window: «3 turnos por cubrir hoy», «1 turno por cubrir esta semana». */
export const gapCountLabel = (count: number, when: string) => `${count} ${count === 1 ? 'turno' : 'turnos'} por cubrir ${when}`;
export const draftCountLabel = (count: number) => `${count} ${count === 1 ? 'cubierto' : 'cubiertos'} en borrador`;

/** `?hueco=<areaId>:<role>:<start>` of a link that opens «Cubrir hueco» on Turnos (from the Inicio tray). */
export const gapHref = (b: Pick<GapBlock, 'areaId' | 'role' | 'start'>) => `#/turnos?hueco=${encodeURIComponent(`${b.areaId}:${b.role}:${b.start}`)}`;
export function parseGapParam(value: string | null): { areaId: string; role: string; at: number } | null {
  if (!value) return null;
  const [areaId, role, ...rest] = value.split(':');
  const at = Date.parse(rest.join(':'));
  return areaId && role && Number.isFinite(at) ? { areaId, role, at } : null;
}
/** The block of a week that holds that hole: the first one of its area and function that ends after it. */
export const findGapBlock = (blocks: GapBlock[], wanted: { areaId: string; role: string; at: number }) =>
  blocks.find(b => b.areaId === wanted.areaId && b.role === wanted.role && Date.parse(b.end) > wanted.at);

/** Day shift when it starts between 06:00 and 17:59 local; night otherwise. */
export const shiftTypeFor = (block: GapBlock) => { const h = hourOf(block.start); return h >= 6 && h < 18 ? 'diurno' : 'nocturno'; };
export const blockLabel = (b: GapBlock) => `${b.area} · ${ROLE_NAMES[b.role] ?? b.role} · ${dayFmt.format(new Date(b.start))}, ${timeRange(b.start, b.end)}`;
const candidatesPath = (b: GapBlock) => `/turnos/candidatos?${new URLSearchParams({ areaId: b.areaId, role: b.role, start: b.start, end: b.end, type: shiftTypeFor(b) })}`;
const itemFor = (b: GapBlock, c: Candidate): PreviewItem => ({ key: `hueco-${b.key}-${c.staffId}`, staffId: c.staffId, person: c.person, areaId: b.areaId, start: b.start, end: b.end, type: shiftTypeFor(b), fill: true });

/**
 * R7 F2 «Cubrir hueco» (F-1): the people who can take this hole, from `GET /turnos/candidatos` (the same rules as a single
 * shift). Choosing one opens the batch summary, which validates again and creates the draft only on confirmation.
 */
export function GapCoverDialog({ api, block, onClose, onPick }: { api: Api; block: GapBlock; onClose: () => void; onPick: (item: PreviewItem) => void }) {
  const data = useData<Candidates>(api, candidatesPath(block), 0);
  const [chosen, setChosen] = useState('');
  return <Dialog title="Cubrir hueco" onClose={onClose}><div className="module-form">
    <p className="form-intro">{blockLabel(block)}. Solo aparecen las personas que pueden tomarlo sin romper descanso, tope semanal, días seguidos ni traslapes.</p>
    <RemoteState state={data}>{({ candidatos, descartados }) => <>
      {candidatos.length ? <fieldset className="gap-candidates"><legend>Personas disponibles</legend>
        {candidatos.map(c => <label key={c.staffId} className="gap-candidate"><input type="radio" name="gap-candidate" value={c.staffId} checked={chosen === c.staffId} onChange={() => setChosen(c.staffId)} />
          <span><strong>{c.person}</strong><small>{c.sameArea ? 'De esta área' : 'De otra área'} · {c.weekHours} h en los últimos 7 días{c.advertencias.length ? ' · cerca del tope semanal' : ''}</small></span></label>)}
      </fieldset> : <Notice kind="info">Nadie puede cubrir este hueco sin romper una regla.</Notice>}
      {descartados.length > 0 && <details className="gap-rejected"><summary>No disponibles ({descartados.length})</summary><ul>{descartados.map(r => <li key={r.staffId}><strong>{r.person}</strong>: {r.mensaje}</li>)}</ul></details>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Volver</button>
        <button type="button" className="primary-button" disabled={!chosen} onClick={() => { const c = candidatos.find(x => x.staffId === chosen); if (c) onPick(itemFor(block, c)); }}>Revisar y asignar</button></div>
    </>}</RemoteState>
  </div></Dialog>;
}

/**
 * R7 F2 «Llenar todos los huecos»: for each hole, the first valid person (same area, fewest hours) who is not already
 * placed in an overlapping hole. Shows the summary first; nothing is created until the batch summary is confirmed.
 */
export function FillGapsDialog({ api, blocks: given, onClose, onPreview }: { api: Api; blocks: GapBlock[]; onClose: () => void; onPreview: (items: PreviewItem[]) => void }) {
  // The holes as they were when the dialog opened: a parent re-render must not start the search again.
  const [blocks] = useState(given);
  const [plan, setPlan] = useState<{ items: PreviewItem[]; uncovered: { block: GapBlock; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const items: PreviewItem[] = [], uncovered: { block: GapBlock; reason: string }[] = [];
      // The candidate reads are independent: fetch them six at a time (a week of holes took ~20 s one by one).
      // Choosing people stays sequential below, so a person placed in one hole is not proposed for a nearby one.
      const answers: Candidates[] = new Array(blocks.length);
      let next = 0;
      const worker = async () => { while (next < blocks.length) { const i = next++; answers[i] = await api.request<Candidates>(candidatesPath(blocks[i])); } };
      await Promise.all(Array.from({ length: Math.min(6, blocks.length) }, worker));
      for (const [index, block] of blocks.entries()) {
        const answer = answers[index];
        const busy = (c: Candidate) => items.some(i => i.staffId === c.staffId && Date.parse(i.start) < Date.parse(block.end) + 8 * HOUR && Date.parse(i.end) + 8 * HOUR > Date.parse(block.start));
        const free = answer.candidatos.filter(c => !busy(c)).slice(0, block.missing);
        free.forEach(c => items.push(itemFor(block, c)));
        if (free.length < block.missing) uncovered.push({ block, reason: answer.candidatos.length ? 'Las personas disponibles ya cubren otro hueco cercano.' : answer.descartados[0]?.mensaje ?? 'No hay personal de esta función.' });
      }
      if (alive) setPlan({ items, uncovered });
    })().catch(e => { if (alive) setError(e instanceof ApiError ? e.message : 'No pudimos buscar candidatos.'); });
    return () => { alive = false; };
  }, [api, blocks]);
  const people = plan ? new Set(plan.items.map(i => i.staffId)).size : 0;
  return <Dialog title="Llenar los huecos de esta semana" onClose={onClose}><div className="module-form">
    {error ? <Notice kind="error">{error}</Notice> : !plan ? <p className="muted" role="status">Buscando quién puede cubrir {blocks.length === 1 ? '1 hueco' : `${blocks.length} huecos`}…</p> : <>
      <p className="form-intro" role="status">{plan.items.length ? `Se propondrán ${plan.items.length === 1 ? '1 turno' : `${plan.items.length} turnos`} con ${people === 1 ? '1 persona' : `${people} personas`} para ${blocks.length - plan.uncovered.length} de ${blocks.length} huecos.` : 'Ningún hueco se puede cubrir sin romper una regla.'} Nada se guarda hasta que confirmes en el resumen.</p>
      {plan.items.length > 0 && <ul className="gap-fill-list">{plan.items.map(i => <li key={i.key}><strong>{i.person}</strong> · {blockLabel(blocks.find(b => i.key.startsWith(`hueco-${b.key}-`))!)}</li>)}</ul>}
      {plan.uncovered.length > 0 && <><h4>Sin cubrir ({plan.uncovered.length})</h4><ul className="gap-fill-list">{plan.uncovered.map(u => <li key={u.block.key}>{blockLabel(u.block)}: {u.reason}</li>)}</ul></>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Volver</button>
        <button type="button" className="primary-button" disabled={!plan.items.length} onClick={() => onPreview(plan.items)}>Revisar {plan.items.length === 1 ? '1 turno' : `${plan.items.length} turnos`}</button></div>
    </>}
  </div></Dialog>;
}
