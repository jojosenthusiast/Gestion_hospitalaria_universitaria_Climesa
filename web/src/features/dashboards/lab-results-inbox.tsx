import { useState } from 'react';
import { Notice } from '../../components/ui';
import { SectionState, StatusBadge } from '../../components/system';
import { can, type AccessProfile, type Api } from '../../lib/api';
import { releaseLines, type ReleaseValue } from '../../lib/lab-sheet';
import { WriteError, useAction, useData, type Remote } from '../common';
import { ReleaseDialog, releasedMessage } from '../lab-release';
import { spanishProblem } from '../problems';
import { useFold } from '../../components/fold';
import './lab-follow-up.css';

/**
 * Fase 2, flujo C (S10) and R7 U3 C1: the doctor's «Resultados por revisar» (GET /laboratorio/pendientes). One row per
 * order, critical first, with the key values in line (C-4). The primary action is «Revisar y liberar», the same release
 * with summary as the order detail: one act closes the order and its pending item (C-2). Before the order is completed
 * (an observation while in process) only «Marcar como revisado» applies. The row opens the order.
 */
export type LabFollowUp = { id: string; orderId: string; patientId: string; patientName?: string | null; patientRecord?: string | null; reason: string; detail: string; createdAt: string; version: number;
  orderVersion?: number; orderActions?: string[]; values?: (ReleaseValue & { code: string })[] };

const isCritical = (item: LabFollowUp) => item.reason === 'critico';
export const sortFollowUps = (items: LabFollowUp[]) => [...items].sort((a, b) => isCritical(a) !== isCritical(b) ? (isCritical(a) ? -1 : 1) : a.createdAt.localeCompare(b.createdAt));

/** `state` comes from Inicio, which already reads the list for its pending tray (`inTray`: a tray group, hidden when empty). */
export function LabResultsInbox({ api, profile, version, state, inTray = false }: { api: Api; profile: AccessProfile; version: number; state?: Remote<LabFollowUp[]>; inTray?: boolean }) {
  const allowed = can(profile, 'laboratorio.revisar');
  const own = useData<LabFollowUp[]>(api, '/laboratorio/pendientes', version, allowed && !state);
  const data = state ?? own;
  const [released, setReleased] = useState<string | null>(null);
  const rows = data.data ? sortFollowUps(data.data) : null;
  // R3: sorted by urgency, the first rows show and the rest fold behind «Ver N más».
  const fold = useFold(rows ?? [], 3);
  if (!allowed) return null;
  const doneNotice = released && <Notice kind="success">{released}</Notice>;
  const list = () => <><ul className="lab-follow-up-list">{fold.shown.map(item => <FollowUpRow key={item.id} api={api} item={item} onDone={data.refresh} onReleased={setReleased} />)}</ul>{fold.more}</>;
  if (inTray && rows && !data.error && rows.length === 0 && !released) return null;
  if (inTray) return <section className="tray-group" aria-label="Resultados por revisar">
    <header><h3>Resultados por revisar</h3>{rows && rows.length > 0 && <span className="tray-count">{rows.length}</span>}</header>
    {doneNotice}
    <SectionState state={{ ...data, error: spanishProblem(data.error) }} compact>{list}</SectionState>
  </section>;
  // R1: with nothing pending the section is one quiet line; the heading and count appear only with rows.
  return <section className="lab-follow-up" aria-label="Resultados por revisar">
    {rows && rows.length > 0 && <header className="section-head"><h2 className="section-title">Resultados por revisar</h2><span className="section-count">{rows.length} {rows.length === 1 ? 'pendiente' : 'pendientes'}</span></header>}
    {doneNotice}
    <SectionState state={{ ...data, error: spanishProblem(data.error) }} compact empty={items => items.length ? null : 'Al día: no tienes resultados por revisar.'}>{list}</SectionState>
  </section>;
}

/** Each row has its own write, so only the row being acted on shows it is busy. */
function FollowUpRow({ api, item, onDone, onReleased }: { api: Api; item: LabFollowUp; onDone: () => void; onReleased: (message: string) => void }) {
  const action = useAction(api), [releasing, setReleasing] = useState(false);
  const releasable = (item.orderActions ?? []).includes('revisar') && typeof item.orderVersion === 'number';
  const lines = item.values?.length ? releaseLines(item.values) : null, shown = lines?.slice(0, 3) ?? [], more = (lines?.length ?? 0) - shown.length;
  const name = item.patientName ?? 'Paciente';
  async function review() {
    await action.run(`/laboratorio/pendientes/${item.id}/revisar`, { version: item.version });
    onDone();
  }
  return <li className="lab-follow-up-row">
    <a className="lab-follow-up-who" href={`#/laboratorio?orden=${item.orderId}`} aria-label={`Abrir la orden de ${name}`}>
      <strong>{name}</strong>
      {item.patientRecord && <small className="muted">Exp. {item.patientRecord}</small>}
      {lines ? <span className="lab-follow-up-values">{shown.map(line => <span key={line.text} className={line.critical ? 'is-critical' : undefined}>{line.text}</span>)}{more > 0 && <span className="muted">+{more}</span>}</span> : <span>{item.detail}</span>}
    </a>
    <StatusBadge value={isCritical(item) ? 'critico_alto' : 'en_proceso'} label={isCritical(item) ? 'Crítico' : 'Observación'} />
    <div className="lw-actions">
      {releasable
        ? <button type="button" className="primary-button" onClick={() => setReleasing(true)}>Revisar y liberar</button>
        : <button type="button" className="secondary-button" onClick={() => void review()} disabled={action.busy}>{action.busy ? 'Guardando…' : 'Marcar como revisado'}</button>}
    </div>
    {action.error && <div className="lab-follow-up-form"><WriteError error={spanishProblem(action.error)} /></div>}
    {releasing && <ReleaseDialog api={api} target={{ orderId: item.orderId, version: item.orderVersion!, patientName: name, values: item.values ?? [] }}
      onClose={() => { setReleasing(false); onDone(); }} onReleased={outcome => { setReleasing(false); onReleased(releasedMessage(name, outcome)); onDone(); }} />}
  </li>;
}
