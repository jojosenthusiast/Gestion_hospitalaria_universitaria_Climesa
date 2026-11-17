import { Icon, Notice } from '../../components/ui';
import { Skeleton, StatusBadge } from '../../components/system';
import { can, type AccessProfile, type Api } from '../../lib/api';
import { WriteError, useAction, useData } from '../common';
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

export function LabResultsInbox({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const allowed = can(profile, 'laboratorio.revisar');
  const data = useData<LabFollowUp[]>(api, '/laboratorio/pendientes', version, allowed);
  if (!allowed) return null;
  const rows = data.data ? sortFollowUps(data.data) : null;
  const error = spanishProblem(data.error);
  return <section className="work-inbox lab-follow-up" aria-labelledby="lab-results-inbox-title">
    <div>
      <h2 id="lab-results-inbox-title">Resultados por revisar</h2>
      <p className="muted">{rows ? `${rows.length} ${rows.length === 1 ? 'pendiente' : 'pendientes'}` : 'Valores críticos y observaciones del laboratorio en las órdenes que pediste.'}</p>
    </div>
    {data.loading && !rows
      ? <Skeleton rows={2} />
      : error && !rows
        ? <div className="module-state module-state-error"><Notice kind="error">{error.status === 403 ? 'Tu cuenta no tiene permiso para ver estos resultados.' : error.message}</Notice><button type="button" className="secondary-button" onClick={data.refresh}><Icon name="retry" size={18} />Reintentar</button></div>
        : rows && (rows.length
          ? <ul className="lab-follow-up-list">{rows.map(item => <FollowUpRow key={item.id} api={api} item={item} onDone={data.refresh} />)}</ul>
          : <p className="muted lab-follow-up-empty"><Icon name="check" size={18} />Al día: no tienes resultados por revisar.</p>)}
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
