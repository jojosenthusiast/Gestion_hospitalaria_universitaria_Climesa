import { useState } from 'react';
import { can, type AccessProfile, type Api } from '../lib/api';
import type { Consultation } from './consultations';
import { Dialog, Empty, RemoteState, Tag, formatDateTime, useData } from './common';

type VitalSigns = { id: string; takenAt: string; systolic?: number | null; diastolic?: number | null; heartRate?: number | null; temperature?: number | null; oxygenSaturation?: number | null };
type Diagnosis = { id: string; code: string; principal: boolean; note?: string | null };
type Prescription = { id: string; issuedAt: string; items: { id: string; medication: string; dose: string; route: string; frequency: string; duration: string; instructions?: string | null }[] };
/** Respuesta de `GET /consultas/{id}/detalle`. */
type ConsultationDetail = { vitalSigns: VitalSigns[]; diagnoses: Diagnosis[]; prescriptions: Prescription[] };
type LabOrder = { id: string; patientId: string; createdAt: string; reviewedAt?: string | null; items: { id: string; code: string; name: string; result?: { value?: number | null; text?: string | null; mark: string } | null }[] };

/**
 * REQ-03 · historial clínico mínimo con los endpoints que existen hoy: consultas firmadas del paciente que
 * aparecen en la agenda del médico (`/consultas/agenda`), su detalle (`/consultas/{id}/detalle`) y los
 * resultados ya liberados (`/laboratorio/ordenes`, solo con `resultados.ver`). La API no tiene todavía un
 * `GET /pacientes/{id}/historial`, así que no se muestran consultas de otros médicos ni fuera de la agenda.
 */
export function ClinicalHistoryDialog({ api, profile, patientId, patientName, agenda, version, onClose }: { api: Api; profile: AccessProfile; patientId: string; patientName: string; agenda: Consultation[]; version: number; onClose: () => void }) {
  const signed = agenda.filter(row => row.patientId === patientId && row.consultationState === 'firmada' && row.consultationId);
  return <Dialog title={`Historial clínico · ${patientName}`} onClose={onClose}>
    <div className="module-form">
      <p className="form-intro">Consultas firmadas de tu agenda y resultados liberados. La consulta de este historial queda auditada.</p>
      <section aria-labelledby="history-consultations">
        <h3 id="history-consultations">Consultas firmadas</h3>
        {signed.length ? <ul className="history-list">{signed.map(row => <SignedConsultation key={row.consultationId} api={api} item={row} version={version} />)}</ul> : <Empty title="Sin consultas firmadas" description="Este paciente no tiene consultas firmadas en tu agenda." />}
      </section>
      {can(profile, 'resultados.ver') && <ReleasedResults api={api} patientId={patientId} version={version} />}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>
    </div>
  </Dialog>;
}

function SignedConsultation({ api, item, version }: { api: Api; item: Consultation; version: number }) {
  const [open, setOpen] = useState(false);
  const detailId = `history-detail-${item.consultationId}`;
  return <li>
    <div className="history-item-head">
      <div><strong>{item.consultationReason || item.reason || 'Consulta sin motivo registrado'}</strong><small>{formatDateTime(item.signedAt ?? item.start)}</small></div>
      <button type="button" className="row-action" aria-expanded={open} aria-controls={detailId} onClick={() => setOpen(value => !value)}>{open ? 'Ocultar detalle' : 'Ver detalle'}</button>
    </div>
    {item.plan && <p><span className="muted">Plan: </span>{item.plan}</p>}
    {open && <div id={detailId}><ConsultationDetailView api={api} consultationId={item.consultationId!} version={version} /></div>}
  </li>;
}

function ConsultationDetailView({ api, consultationId, version }: { api: Api; consultationId: string; version: number }) {
  const detail = useData<ConsultationDetail>(api, `/consultas/${consultationId}/detalle`, version);
  return <RemoteState state={detail}>{d => <dl className="detail-list">
    <div><dt>Diagnósticos</dt><dd>{d.diagnoses.length ? <ul>{d.diagnoses.map(x => <li key={x.id}><span className="mono-data">{x.code}</span>{x.principal ? ' · Principal' : ''}{x.note ? ` · ${x.note}` : ''}</li>)}</ul> : 'Sin diagnósticos registrados'}</dd></div>
    <div><dt>Recetas</dt><dd>{d.prescriptions.length ? <ul>{d.prescriptions.flatMap(r => r.items.map(i => <li key={i.id}>{i.medication} · {i.dose} · {i.route} · {i.frequency} · {i.duration}{i.instructions ? ` · ${i.instructions}` : ''}</li>))}</ul> : 'Sin recetas emitidas'}</dd></div>
    <div><dt>Signos vitales</dt><dd>{d.vitalSigns.length ? <ul>{d.vitalSigns.map(v => <li key={v.id}>{formatDateTime(v.takenAt)}: {[v.systolic != null && v.diastolic != null ? `PA ${v.systolic}/${v.diastolic}` : null, v.heartRate != null ? `FC ${v.heartRate}` : null, v.temperature != null ? `T ${v.temperature} °C` : null, v.oxygenSaturation != null ? `SatO₂ ${v.oxygenSaturation}%` : null].filter(Boolean).join(' · ')}</li>)}</ul> : 'Sin signos registrados'}</dd></div>
  </dl>}</RemoteState>;
}

function ReleasedResults({ api, patientId, version }: { api: Api; patientId: string; version: number }) {
  const orders = useData<LabOrder[]>(api, '/laboratorio/ordenes', version);
  return <section aria-label="Resultados de laboratorio liberados">
    <h3>Resultados de laboratorio liberados</h3>
    <RemoteState state={orders}>{rows => {
      const released = rows.filter(o => o.patientId === patientId && o.reviewedAt);
      return released.length ? <ul className="history-list">{released.map(o => <li key={o.id}><small>Liberado: {formatDateTime(o.reviewedAt!)}</small><ul>{o.items.map(i => <li key={i.id}><strong>{i.code} · {i.name}</strong>{i.result ? <> · {i.result.text ?? i.result.value} <Tag value={i.result.mark} /></> : ' · Sin resultado'}</li>)}</ul></li>)}</ul> : <Empty title="Sin resultados liberados" description="Los resultados aparecen aquí cuando Laboratorio los revisa y libera." />;
    }}</RemoteState>
  </section>;
}
