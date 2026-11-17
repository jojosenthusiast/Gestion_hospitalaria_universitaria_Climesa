import { SectionState, StatusBadge } from '../../components/system';
import { can, type AccessProfile, type Api } from '../../lib/api';
import { WriteError, useAction, useData, type Remote } from '../common';
import { spanishProblem } from '../problems';
import './lab-follow-up.css';

/**
 * Fase 2, flujo C (S10): «Resultados por revisar» del médico (GET /laboratorio/pendientes). Valores críticos y
 * observaciones relevantes del laboratorio de las órdenes que pidió, hasta que los marca revisados. Mismas reglas que
 * iOS (`LabFollowUpRules`): críticos primero y luego los más antiguos; rojo solo para el valor crítico. Un evento de
 * laboratorio (`orden_laboratorio`) vuelve a pedir la lista, y también cada «Marcar como revisado».
 */
export type LabFollowUp = { id: string; orderId: string; patientId: string; patientName?: string | null; patientRecord?: string | null; reason: string; detail: string; createdAt: string; version: number };

const isCritical = (item: LabFollowUp) => item.reason === 'critico';
export const sortFollowUps = (items: LabFollowUp[]) => [...items].sort((a, b) => isCritical(a) !== isCritical(b) ? (isCritical(a) ? -1 : 1) : a.createdAt.localeCompare(b.createdAt));

/** `state` comes from Inicio, which already reads the list for its pending tray (`inTray`: a tray group, hidden when empty). */
export function LabResultsInbox({ api, profile, version, state, inTray = false }: { api: Api; profile: AccessProfile; version: number; state?: Remote<LabFollowUp[]>; inTray?: boolean }) {
  const allowed = can(profile, 'laboratorio.revisar');
  const own = useData<LabFollowUp[]>(api, '/laboratorio/pendientes', version, allowed && !state);
  const data = state ?? own;
  if (!allowed) return null;
  const rows = data.data ? sortFollowUps(data.data) : null;
  if (inTray && rows && !data.error && rows.length === 0) return null;
  if (inTray) return <section className="tray-group" aria-label="Resultados por revisar">
    <header><h3>Resultados por revisar</h3>{rows && rows.length > 0 && <span className="tray-count">{rows.length}</span>}</header>
    <SectionState state={{ ...data, error: spanishProblem(data.error) }} compact>{() => <ul className="lab-follow-up-list">{rows!.map(item => <FollowUpRow key={item.id} api={api} item={item} onDone={data.refresh} />)}</ul>}</SectionState>
  </section>;
  // R1: with nothing pending the section is one quiet line; the heading and count appear only with rows.
  return <section className="lab-follow-up" aria-label="Resultados por revisar">
    {rows && rows.length > 0 && <header className="section-head"><h2 className="section-title">Resultados por revisar</h2><span className="section-count">{rows.length} {rows.length === 1 ? 'pendiente' : 'pendientes'}</span></header>}
    <SectionState state={{ ...data, error: spanishProblem(data.error) }} compact empty={list => list.length ? null : 'Al día: no tienes resultados por revisar.'}>{() =>
      <ul className="lab-follow-up-list">{rows!.map(item => <FollowUpRow key={item.id} api={api} item={item} onDone={data.refresh} />)}</ul>}</SectionState>
  </section>;
}

/** Each row has its own write, so only the row being marked shows it is busy. */
function FollowUpRow({ api, item, onDone }: { api: Api; item: LabFollowUp; onDone: () => void }) {
  const action = useAction(api);
  async function review() {
    await action.run(`/laboratorio/pendientes/${item.id}/revisar`, { version: item.version });
    onDone();
  }
  return <li className="lab-follow-up-row">
    <div className="lab-follow-up-who">
      <strong>{item.patientName ?? 'Paciente'}</strong>
      {item.patientRecord && <small className="muted">Exp. {item.patientRecord}</small>}
      <span>{item.detail}</span>
    </div>
    <StatusBadge value={isCritical(item) ? 'critico_alto' : 'en_proceso'} label={isCritical(item) ? 'Crítico' : 'Observación'} />
    <div className="lw-actions">
      <button type="button" className="secondary-button" onClick={() => void review()} disabled={action.busy}>{action.busy ? 'Guardando…' : 'Marcar como revisado'}</button>
    </div>
    {action.error && <div className="lab-follow-up-form"><WriteError error={spanishProblem(action.error)} /></div>}
  </li>;
}
