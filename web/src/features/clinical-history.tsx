import { useState } from 'react';
import { Dialog, Empty, RemoteState, Tag, formatDateTime, useData } from './common';
import type { AccessProfile, Api } from '../lib/api';
import { CompactHeader } from '../components/system';
import { Notice } from '../components/ui';
import { PrescriptionPrintDialog, PrintPrescriptionButton, type PrintablePrescription } from './prescription-print';
import './clinical-history.css';

type HistoryDiagnosis = { code: string; description: string; principal: boolean; note?: string | null };
type HistoryPrescription = { id: string; issuedAt: string; items: { medication: string; dose: string; route: string; frequency: string; duration: string; instructions?: string | null }[] };
export type HistoryConsultation = { id: string; state: string; startedAt: string; signedAt?: string | null; reason?: string | null; physicalExam?: string | null; plan?: string | null; doctor: { id: string; name: string; specialty?: string | null }; diagnoses: HistoryDiagnosis[]; prescriptions: HistoryPrescription[] };
type HistoryOrder = { id: string; consultationId?: string | null; state: string; createdAt: string; reviewedAt?: string | null; items: { id: string; code: string; name: string; unit?: string | null; result?: { value?: number | null; text?: string | null; mark: string } | null }[] };
type HistoryAdmission = { id: string; state: string; origin: string; createdAt: string; doctor: { id: string; name: string } };
/** Response of `GET /pacientes/{id}/historial` (spec 106). */
export type ClinicalHistory = { patient: { id: string; record: string; fullName: string }; access: 'propio' | 'relacion'; consultations: HistoryConsultation[]; laboratory: HistoryOrder[]; admissions: HistoryAdmission[]; allowedActions?: string[] };

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

/** The printable prescription of one consultation: every item of its prescriptions, dated by the latest one. */
export function prescriptionOf(k: HistoryConsultation, patient: { name: string; record?: string | null }): PrintablePrescription | null {
  const items = k.prescriptions.flatMap(r => r.items);
  if (!items.length) return null;
  const issuedAt = k.prescriptions.map(r => r.issuedAt).sort().at(-1) ?? k.signedAt ?? k.startedAt;
  const principal = k.diagnoses.find(d => d.principal) ?? k.diagnoses[0];
  return { patient, doctor: { name: k.doctor.name, specialty: k.doctor.specialty }, issuedAt, diagnosis: principal ? `${principal.code} · ${principal.description}` : null, items };
}

const resultText = (i: HistoryOrder['items'][number]) => i.result ? `${i.result.text ?? i.result.value ?? ''}${i.unit && i.result.text == null ? ` ${i.unit}` : ''}`.trim() : null;

/**
 * S19 · «Mi historial» of the patient on the web, same content as Android and iOS: signed consultations with their
 * diagnoses and prescription (printable), and the laboratory with the values the doctor already released.
 * `GET /pacientes/{id}/historial` answers with `access: propio`: the API already hides drafts and unreviewed values.
 */
export function MyHistoryPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const patientId = profile.patientId;
  const history = useData<ClinicalHistory>(api, `/pacientes/${patientId}/historial`, version, !!patientId);
  const [printing, setPrinting] = useState<PrintablePrescription | null>(null);
  return <>
    <CompactHeader breadcrumb="Atención / Historial clínico" title="Mi historial" />
    {!patientId ? <Notice kind="info">Para ver tu historial, primero vincula tu cuenta con tu expediente.</Notice> : <RemoteState state={history}>{h => {
      const patient = { name: h.patient.fullName, record: h.patient.record };
      const consultations = h.consultations.filter(k => k.state === 'firmada');
      const ordersOf = (id: string) => h.laboratory.filter(o => o.consultationId === id);
      return <div className="my-history">
        <p className="my-history-intro">Expediente <span className="mono-data">{h.patient.record}</span>. Tus consultas firmadas, diagnósticos, recetas y exámenes. Los valores aparecen cuando el médico los revisa.</p>
        <section aria-labelledby="mh-consultas" className="my-history-section">
          <h2 id="mh-consultas">Consultas <span className="section-count">{consultations.length}</span></h2>
          {consultations.length ? <ol className="mh-list">{consultations.map(k => {
            const rx = prescriptionOf(k, patient), labs = ordersOf(k.id);
            return <li key={k.id} className="mh-item" aria-label={`Consulta del ${formatDateTime(k.signedAt ?? k.startedAt)}`}>
              <header className="mh-head"><div><strong>{k.reason || 'Consulta sin motivo registrado'}</strong><small>{formatDateTime(k.signedAt ?? k.startedAt)} · {k.doctor.name}{k.doctor.specialty ? ` · ${k.doctor.specialty}` : ''}</small></div>
                {rx && <PrintPrescriptionButton onClick={() => setPrinting(rx)} />}</header>
              {k.plan && <p className="mh-plan"><span>Indicaciones del médico</span>{k.plan}</p>}
              <div className="mh-grid">
                <section aria-label="Diagnósticos"><h3>Diagnósticos</h3>{k.diagnoses.length ? <ul>{k.diagnoses.map(d => <li key={d.code}><span className="mono-data">{d.code}</span> {d.description}{d.principal ? <em> · Principal</em> : null}</li>)}</ul> : <p className="muted">Sin diagnósticos registrados</p>}</section>
                <section aria-label="Receta"><h3>Receta</h3>{rx ? <ul>{rx.items.map((i, n) => <li key={n}><strong>{i.medication}</strong> {i.dose} · {i.route} · {i.frequency} · {i.duration}{i.instructions ? <small>{i.instructions}</small> : null}</li>)}</ul> : <p className="muted">Sin recetas emitidas</p>}</section>
              </div>
              {labs.length > 0 && <p className="mh-labs-link">{labs.length === 1 ? '1 orden de laboratorio' : `${labs.length} órdenes de laboratorio`} de esta consulta, abajo en Exámenes.</p>}
            </li>;
          })}</ol> : <Empty title="No hay consultas para mostrar." description="Tus consultas aparecen aquí cuando el médico las firma." />}
        </section>
        <section aria-labelledby="mh-laboratorio" className="my-history-section">
          <h2 id="mh-laboratorio">Exámenes de laboratorio <span className="section-count">{h.laboratory.length}</span></h2>
          {h.laboratory.length ? <ol className="mh-list">{h.laboratory.map(o => <li key={o.id} className="mh-item">
            <header className="mh-head"><div><strong>Orden del {formatDateTime(o.createdAt)}</strong><small>{o.reviewedAt ? `Revisada por tu médico el ${formatDateTime(o.reviewedAt)}` : 'Pendiente de revisión médica'}</small></div><Tag value={o.state} /></header>
            <table className="mh-results"><caption className="sr-only">Resultados de la orden</caption><thead><tr><th>Examen</th><th>Resultado</th></tr></thead><tbody>{o.items.map(i => { const value = resultText(i); return <tr key={i.id}><td>{i.name} <small className="mono-data">{i.code}</small></td><td>{value ? <span className="mh-value">{value} {i.result && i.result.mark !== 'normal' ? <Tag value={i.result.mark} /> : null}</span> : <span className="muted">Valor pendiente de revisión</span>}</td></tr>; })}</tbody></table>
          </li>)}</ol> : <Empty title="No hay órdenes de laboratorio." description="Las órdenes que pida tu médico aparecerán aquí con su estado." />}
        </section>
      </div>;
    }}</RemoteState>}
    {printing && <PrescriptionPrintDialog rx={printing} onClose={() => setPrinting(null)} />}
  </>;
}
