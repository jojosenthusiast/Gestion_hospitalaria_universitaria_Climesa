import { useState } from 'react';
import './lab-follow-up.css';
import { Field, Notice } from '../../components/ui';
import { PriorityBadge, SectionState } from '../../components/system';
import { ApiError, type Api } from '../../lib/api';
import { RemoteState, WriteError, useAction, useData, type Remote } from '../common';
import { formatDate } from '../../lib/format';
import { newIntentKey, withIntentKey } from '../intent';

/**
 * Fase 2, flujo C (S10): «Citas de seguimiento por confirmar» (bandeja de pendientes de Recepción). Al completarse los
 * exámenes de una consulta, el sistema propone una cita con el médico que los pidió. Recepción la agenda con el comando
 * de siempre (POST /citas) y la enlaza a la propuesta, o la descarta con motivo. Nunca ve exámenes ni valores.
 */
export type LabProposal = { id: string; orderId: string; patientId: string; patientName?: string | null; patientRecord?: string | null; doctorId: string; doctorName?: string | null; priority: string; resultsAt: string; createdAt: string; version: number };
type Slot = { start: string; end: string };
type Availability = { slots?: Slot[] };

/** Local day `yyyy-MM-dd` in El Salvador, `days` after `from`. */
export function localDay(from: Date, days = 0) {
  const shifted = new Date(from.valueOf() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}
const slotLabel = (slot: Slot) => new Intl.DateTimeFormat('es-SV', { timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(new Date(slot.start));
export const FOLLOW_UP_REASON = 'Seguimiento de resultados de laboratorio';

/** `state` comes from Inicio, which already reads the list for its pending tray (`inTray`: a tray group, hidden when empty). */
export function LabFollowUpPanel({ api, version, state, inTray = false }: { api: Api; version: number; state?: Remote<LabProposal[]>; inTray?: boolean }) {
  const own = useData<LabProposal[]>(api, '/laboratorio/seguimientos', version, !state);
  const data = state ?? own;
  const rows = data.data ?? [];
  // Appointment already created for a proposal whose link failed. It lives here, not in the form, so "Volver" never loses it
  // and a retry links the same appointment instead of posting /citas again.
  const [scheduled, setScheduled] = useState<Record<string, string>>({});
  const remember = (proposalId: string, appointmentId: string) => setScheduled(current => ({ ...current, [proposalId]: appointmentId }));
  if (inTray && data.data && !data.error && rows.length === 0) return null;
  if (inTray) return <section className="tray-group" aria-label="Citas de seguimiento por confirmar">
    <header><h3>Citas de seguimiento por confirmar</h3>{rows.length > 0 && <span className="tray-count">{rows.length}</span>}</header>
    <SectionState state={data} compact>{() => <ul className="lab-follow-up-list">{rows.map(row => <ProposalRow key={row.id} api={api} proposal={row} scheduled={scheduled[row.id] ?? null} onScheduled={id => remember(row.id, id)} onDone={data.refresh} />)}</ul>}</SectionState>
  </section>;
  // R1: with nothing to confirm the section is one quiet line; the heading appears only with rows.
  return <section className="lab-follow-up" aria-label="Citas de seguimiento por confirmar">
    {rows.length > 0 && <header className="section-head"><h2 className="section-title">Citas de seguimiento por confirmar</h2><span className="section-count">{rows.length}</span></header>}
    <SectionState state={data} compact empty={list => list.length ? null : 'Al día: no hay citas de seguimiento por confirmar.'}>{() =>
      <ul className="lab-follow-up-list">{rows.map(row => <ProposalRow key={row.id} api={api} proposal={row} scheduled={scheduled[row.id] ?? null} onScheduled={id => remember(row.id, id)} onDone={data.refresh} />)}</ul>}</SectionState>
  </section>;
}

type Scheduled = { scheduled: string | null; onScheduled: (appointmentId: string) => void };

function ProposalRow({ api, proposal, scheduled, onScheduled, onDone }: { api: Api; proposal: LabProposal; onDone: () => void } & Scheduled) {
  const [mode, setMode] = useState<'idle' | 'schedule' | 'discard'>('idle');
  return <li className="lab-follow-up-row">
    <div className="lab-follow-up-who">
      <strong>{proposal.patientName ?? 'Paciente'}</strong>
      <small className="muted">{[proposal.patientRecord ? `Exp. ${proposal.patientRecord}` : null, proposal.doctorName ? `Con ${proposal.doctorName}` : null, `Resultados del ${formatDate(proposal.resultsAt)}`].filter(Boolean).join(' · ')}</small>
    </div>
    {proposal.priority === 'urgente' && <PriorityBadge value="urgente" />}
    {mode === 'idle' && <div className="lw-actions">
      <button type="button" className="row-action" onClick={() => setMode('schedule')}>Agendar cita</button>
      <button type="button" className="row-action" onClick={() => setMode('discard')}>Descartar</button>
    </div>}
    {mode === 'schedule' && <ScheduleForm api={api} proposal={proposal} scheduled={scheduled} onScheduled={onScheduled} onCancel={() => setMode('idle')} onDone={onDone} />}
    {mode === 'discard' && <DiscardForm api={api} proposal={proposal} onCancel={() => setMode('idle')} onDone={onDone} />}
  </li>;
}

/**
 * Two steps with the existing commands: schedule (POST /citas, a confirmed appointment) and link it to the proposal.
 * If the link fails after the appointment exists, the appointment is kept and the link can be retried with it.
 */
function ScheduleForm({ api, proposal, scheduled, onScheduled, onCancel, onDone }: { api: Api; proposal: LabProposal; onCancel: () => void; onDone: () => void } & Scheduled) {
  const [day, setDay] = useState(() => localDay(new Date(), 7)), [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null);
  const availability = useData<Availability>(api, `/citas/disponibilidad?doctorId=${proposal.doctorId}&date=${day}`, 0);
  const slots = availability.data?.slots ?? [];
  async function confirm() {
    if (!slot && !scheduled) return;
    setBusy(true); setError(null);
    try {
      const appointmentId = scheduled ?? (await withIntentKey(newIntentKey(), () => api.write<{ id: string }>('/citas', { patientId: proposal.patientId, doctorId: proposal.doctorId, start: slot!.start, end: slot!.end, reason: FOLLOW_UP_REASON }, 'POST'))).id;
      onScheduled(appointmentId);
      await withIntentKey(newIntentKey(), () => api.write(`/laboratorio/seguimientos/${proposal.id}/confirmar`, { version: proposal.version, appointmentId }, 'POST'));
      onDone();
    } catch (e) { setError(e instanceof ApiError ? e : new ApiError('No se pudo agendar la cita.')); }
    finally { setBusy(false); }
  }
  return <form className="lab-follow-up-form" onSubmit={event => { event.preventDefault(); void confirm(); }} aria-label={`Agendar seguimiento de ${proposal.patientName ?? 'paciente'}`}>
    {scheduled
      ? <Notice kind="info">La cita ya quedó agendada; falta enlazarla a la propuesta. Vuelve a intentar.</Notice>
      : <>
        <Field label="Día" type="date" value={day} min={localDay(new Date())} onChange={value => { setDay(value); setSlot(null); }} required />
        <RemoteState state={availability} skeletonRows={1}>{() => slots.length
          ? <div className="lab-slot-grid" role="radiogroup" aria-label="Horas libres">{slots.map(s => <label key={s.start} className={`lab-slot${slot?.start === s.start ? ' is-selected' : ''}`}><input type="radio" name={`slot-${proposal.id}`} checked={slot?.start === s.start} onChange={() => setSlot(s)} />{slotLabel(s)}</label>)}</div>
          : <p className="muted">El médico no tiene horas libres ese día. Prueba otro día.</p>}</RemoteState>
      </>}
    <WriteError error={error} />
    <div className="lw-actions">
      <button type="submit" className="primary-button" disabled={busy || (!slot && !scheduled)}>{busy ? 'Agendando…' : scheduled ? 'Enlazar la cita' : 'Confirmar cita'}</button>
      <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>Volver</button>
    </div>
  </form>;
}

function DiscardForm({ api, proposal, onCancel, onDone }: { api: Api; proposal: LabProposal; onCancel: () => void; onDone: () => void }) {
  const action = useAction(api), [reason, setReason] = useState('');
  async function save() { if (await action.run(`/laboratorio/seguimientos/${proposal.id}/descartar`, { version: proposal.version, reason: reason.trim() })) onDone(); }
  return <form className="lab-follow-up-form" onSubmit={event => { event.preventDefault(); void save(); }} aria-label={`Descartar seguimiento de ${proposal.patientName ?? 'paciente'}`}>
    <Field label="Motivo para no agendar" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus placeholder="Por ejemplo: el paciente ya tiene control agendado" />
    <WriteError error={action.error} onReload={onDone} />
    <div className="lw-actions">
      <button type="submit" className="primary-button" disabled={action.busy || reason.trim().length < 10}>{action.busy ? 'Guardando…' : 'Descartar propuesta'}</button>
      <button type="button" className="secondary-button" onClick={onCancel} disabled={action.busy}>Volver</button>
    </div>
  </form>;
}
