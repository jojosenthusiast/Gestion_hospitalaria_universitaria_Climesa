import { Dialog, Empty, RemoteState, Tag, formatDateTime, useData } from './common';
import type { Api } from '../lib/api';

type HistoryDiagnosis = { code: string; description: string; principal: boolean; note?: string | null };
type HistoryPrescription = { id: string; issuedAt: string; items: { medication: string; dose: string; route: string; frequency: string; duration: string; instructions?: string | null }[] };
type HistoryConsultation = { id: string; state: string; startedAt: string; signedAt?: string | null; reason?: string | null; physicalExam?: string | null; plan?: string | null; doctor: { id: string; name: string; specialty?: string | null }; diagnoses: HistoryDiagnosis[]; prescriptions: HistoryPrescription[] };
type HistoryOrder = { id: string; state: string; createdAt: string; reviewedAt?: string | null; items: { id: string; code: string; name: string; unit?: string | null; result?: { value?: number | null; text?: string | null; mark: string } | null }[] };
type HistoryAdmission = { id: string; state: string; origin: string; createdAt: string; doctor: { id: string; name: string } };
/** Response of `GET /pacientes/{id}/historial` (spec 106). */
export type ClinicalHistory = { patient: { id: string; record: string; fullName: string }; access: 'propio' | 'relacion'; consultations: HistoryConsultation[]; laboratory: HistoryOrder[]; admissions: HistoryAdmission[] };

const accessText: Record<ClinicalHistory['access'], string> = {
  propio: 'Ves tu propio historial revisado.',
  relacion: 'Acceso por relación de atención.',
};

/**
 * REQ-03 · historial clínico completo del paciente (FR-106-09): consultas de todos los médicos, resultados y admisiones,
 * filtrados por la API según relación de atención o titularidad. La lectura queda auditada.
 */
export function ClinicalHistoryDialog({ api, patientId, patientName, version, onClose }: { api: Api; patientId: string; patientName: string; version: number; onClose: () => void }) {
  const history = useData<ClinicalHistory>(api, `/pacientes/${patientId}/historial`, version);
  return <Dialog title={`Historial clínico · ${patientName}`} onClose={onClose}>
    <div className="module-form">
      <RemoteState state={history}>{h => <>
        <p className="form-intro">Expediente {h.patient.record}. {accessText[h.access]}</p>
        <section aria-labelledby="history-consultations">
          <h3 id="history-consultations">Consultas</h3>
          {h.consultations.length ? <ul className="history-list">{h.consultations.map(k => <li key={k.id}>
            <div className="history-item-head"><div><strong>{k.reason || 'Consulta sin motivo registrado'}</strong><small>{formatDateTime(k.signedAt ?? k.startedAt)} · {k.doctor.name}{k.doctor.specialty ? ` · ${k.doctor.specialty}` : ''}</small></div><Tag value={k.state} /></div>
            {k.plan && <p><span className="muted">Plan: </span>{k.plan}</p>}
            <dl className="detail-list">
              <div><dt>Diagnósticos</dt><dd>{k.diagnoses.length ? <ul>{k.diagnoses.map(d => <li key={d.code}><span className="mono-data">{d.code}</span> {d.description}{d.principal ? ' · Principal' : ''}{d.note ? ` · ${d.note}` : ''}</li>)}</ul> : 'Sin diagnósticos registrados'}</dd></div>
              <div><dt>Recetas</dt><dd>{k.prescriptions.length ? <ul>{k.prescriptions.flatMap(r => r.items.map((i, n) => <li key={`${r.id}-${n}`}>{i.medication} · {i.dose} · {i.route} · {i.frequency} · {i.duration}{i.instructions ? ` · ${i.instructions}` : ''}</li>))}</ul> : 'Sin recetas emitidas'}</dd></div>
            </dl>
          </li>)}</ul> : <Empty title="Sin consultas" description="Este paciente no tiene consultas que puedas ver." />}
        </section>
        <section aria-label="Resultados de laboratorio">
          <h3>Laboratorio</h3>
          {h.laboratory.length ? <ul className="history-list">{h.laboratory.map(o => <li key={o.id}>
            <div className="history-item-head"><div><small>Ordenada: {formatDateTime(o.createdAt)}{o.reviewedAt ? ` · Revisada: ${formatDateTime(o.reviewedAt)}` : ''}</small></div><Tag value={o.state} /></div>
            <ul>{o.items.map(i => <li key={i.id}><strong>{i.code} · {i.name}</strong>{i.result ? <> · {i.result.text ?? i.result.value}{i.unit ? ` ${i.unit}` : ''} <Tag value={i.result.mark} /></> : ' · Sin valor disponible'}</li>)}</ul>
          </li>)}</ul> : <Empty title="Sin órdenes de laboratorio" description="Las órdenes del paciente aparecerán aquí con su estado." />}
        </section>
        {h.access !== 'propio' && <section aria-label="Hospitalizaciones">
          <h3>Hospitalizaciones</h3>
          {h.admissions.length ? <ul className="history-list">{h.admissions.map(a => <li key={a.id}><div className="history-item-head"><div><strong>{formatDateTime(a.createdAt)}</strong><small>{a.doctor.name}</small></div><Tag value={a.state} /></div></li>)}</ul> : <Empty title="Sin hospitalizaciones" description="El paciente no tiene admisiones registradas." />}
        </section>}
      </>}</RemoteState>
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>
    </div>
  </Dialog>;
}
