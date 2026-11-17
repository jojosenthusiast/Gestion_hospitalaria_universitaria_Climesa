import { useState } from 'react';
import { Icon } from '../components/ui';
import type { Api } from '../lib/api';
import { releaseLines, type ReleaseValue } from '../lib/lab-sheet';
import { Dialog, WriteError, useAction } from './common';
import { spanishProblem } from './problems';

export type ReleaseTarget = { orderId: string; version: number; patientName: string; doctorName?: string | null; values: ReleaseValue[] };
export type ReleaseOutcome = { followUpProposalId?: string | null; followUpsClosed?: number; followUpSkipped?: string };

/**
 * R7 U3, journey C1 and sweep item #12: releasing results is clinical and irreversible, so it confirms with a summary of
 * exactly what the patient will see. D-4: the doctor decides here whether reception gets a follow-up appointment to
 * confirm. One send releases the order and closes its items in "Resultados por revisar" (C-2).
 */
export function ReleaseDialog({ api, target, onClose, onReleased }: { api: Api; target: ReleaseTarget; onClose: () => void; onReleased: (outcome: ReleaseOutcome & { followUp: boolean }) => void }) {
  const action = useAction(api), [followUp, setFollowUp] = useState(true), [note, setNote] = useState('');
  const lines = releaseLines(target.values), critical = lines.filter(line => line.critical).length;
  async function release() {
    const patientNote = note.trim();
    const done = await action.run<ReleaseOutcome>(`/laboratorio/ordenes/${target.orderId}/revisar`, { version: target.version, followUp, ...(patientNote ? { patientNote } : {}) });
    if (done) onReleased({ ...done, followUp });
  }
  return <Dialog title="Revisar y liberar al paciente" onClose={onClose} busy={action.busy}>
    <form className="module-form lab-release" onSubmit={event => { event.preventDefault(); void release(); }}>
      <p className="form-intro"><strong>{target.patientName}</strong> verá estos resultados en su app{critical ? `, ${critical === 1 ? 'incluido 1 valor crítico' : `incluidos ${critical} valores críticos`}` : ''}:</p>
      <ul className="lab-release-list">{lines.map(line => <li key={line.text} className={line.critical ? 'is-critical' : undefined}>{line.critical && <Icon name="alert" size={16} />}{line.text}</li>)}</ul>
      <label className="lab-relevant"><input type="checkbox" checked={followUp} onChange={event => setFollowUp(event.target.checked)} />Pedir a Recepción una cita de seguimiento{target.doctorName ? ` con ${target.doctorName}` : ''}</label>
      <label className="field"><span>Nota para el paciente (opcional)</span><textarea value={note} maxLength={500} rows={2} placeholder="Por ejemplo: repetir en ayunas el lunes." onChange={event => setNote(event.target.value)} /></label>
      <WriteError error={spanishProblem(action.error)} onReload={onClose} reloadLabel="Cerrar y recargar" />
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Volver</button>
        <button className="primary-button" type="submit" disabled={action.busy}>{action.busy ? 'Liberando…' : 'Liberar resultados'}</button></div>
    </form>
  </Dialog>;
}

/** The in-place confirmation after a release (pending, done or error stay where the action was taken). */
const SKIPPED: Record<string, string> = {
  hospitalizado: ' No se propuso cita de seguimiento porque el paciente está ingresado.',
  ya_propuesta: ' La cita de seguimiento ya estaba propuesta.',
  sin_consulta: ' No se propuso cita de seguimiento: la orden no viene de una consulta.',
};
/** A5: the follow-up sentence follows the API's real reason; without `followUpSkipped` it claims nothing it cannot know. */
export const releasedMessage = (patientName: string, outcome: { followUp: boolean; followUpProposalId?: string | null; followUpSkipped?: string }) =>
  `Resultados liberados: ${patientName} ya los ve.${!outcome.followUp ? '' : outcome.followUpProposalId ? ' Recepción agendará la cita de seguimiento.' : SKIPPED[outcome.followUpSkipped ?? ''] ?? ' No se propuso una cita de seguimiento nueva.'}`;
