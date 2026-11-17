import { useEffect, useRef, useState } from 'react';
import './lab-follow-up.css';
import { Field, Notice } from '../../components/ui';
import { PriorityBadge, SectionState } from '../../components/system';
import { ApiError, type Api } from '../../lib/api';
import { Select, WriteError, useAction, useData, type Remote } from '../common';
import { formatDate } from '../../lib/format';
import { newIntentKey, withIntentKey } from '../intent';
import { spanishProblem } from '../problems';

/**
 * Fase 2, flujo C (S10) and R7 U3 C1: «Citas de seguimiento por confirmar» (reception's pending tray). When the doctor
 * releases an order and asks for it (D-4), the system proposes an appointment with the doctor who ordered the exams.
 * Reception opens on the first day with a free slot, picks a day from chips, may switch to another doctor of the same
 * specialty, and confirms: POST /citas, then the link to the proposal. Reception never sees exams or values.
 */
export type LabProposal = { id: string; orderId: string; patientId: string; patientName?: string | null; patientRecord?: string | null; doctorId: string; doctorName?: string | null; priority: string; resultsAt: string; createdAt: string; version: number };
type Slot = { start: string; end: string };
type Availability = { slots?: Slot[] };
type CatalogDoctor = { id: string; givenNames: string; surnames: string; specialty?: string | null; active: boolean };

/** Local day `yyyy-MM-dd` in El Salvador, `days` after `from`. */
export function localDay(from: Date, days = 0) {
  const shifted = new Date(from.valueOf() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}
const slotLabel = (slot: Slot) => new Intl.DateTimeFormat('es-SV', { timeStyle: 'short', hourCycle: 'h23', timeZone: 'America/El_Salvador' }).format(new Date(slot.start));
const dayLabel = (day: string) => new Intl.DateTimeFormat('es-SV', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
export const FOLLOW_UP_REASON = 'Seguimiento de resultados de laboratorio';
/** How far ahead reception looks for the first free slot. */
export const SEARCH_DAYS = 14;

/** `state` comes from Inicio, which already reads the list for its pending tray (`inTray`: a tray group, hidden when empty). */
export function LabFollowUpPanel({ api, version, state, inTray = false }: { api: Api; version: number; state?: Remote<LabProposal[]>; inTray?: boolean }) {
  const own = useData<LabProposal[]>(api, '/laboratorio/seguimientos', version, !state);
  const data = state ?? own;
  const rows = data.data ?? [];
  // Appointment already created for a proposal whose link failed. It lives here, not in the form, so "Volver" never loses it
  // and a retry links the same appointment instead of posting /citas again.
  const [scheduled, setScheduled] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const remember = (proposalId: string, appointmentId: string) => setScheduled(current => ({ ...current, [proposalId]: appointmentId }));
  const finish = (message: string) => { setDone(message); data.refresh(); };
  const list = () => <ul className="lab-follow-up-list">{rows.map(row => <ProposalRow key={row.id} api={api} proposal={row} scheduled={scheduled[row.id] ?? null} onScheduled={id => remember(row.id, id)} onDone={finish} />)}</ul>;
  const notice = done && <Notice kind="success">{done}</Notice>;
  if (inTray && data.data && !data.error && rows.length === 0 && !done) return null;
  if (inTray) return <section className="tray-group" aria-label="Citas de seguimiento por confirmar">
    <header><h3>Citas de seguimiento por confirmar</h3>{rows.length > 0 && <span className="tray-count">{rows.length}</span>}</header>
    {notice}
    <SectionState state={data} compact>{list}</SectionState>
  </section>;
  // R1: with nothing to confirm the section is one quiet line; the heading appears only with rows.
  return <section className="lab-follow-up" aria-label="Citas de seguimiento por confirmar">
    {rows.length > 0 && <header className="section-head"><h2 className="section-title">Citas de seguimiento por confirmar</h2><span className="section-count">{rows.length}</span></header>}
    {notice}
    <SectionState state={data} compact empty={items => items.length ? null : 'Al día: no hay citas de seguimiento por confirmar.'}>{list}</SectionState>
  </section>;
}

type Scheduled = { scheduled: string | null; onScheduled: (appointmentId: string) => void };

function ProposalRow({ api, proposal, scheduled, onScheduled, onDone }: { api: Api; proposal: LabProposal; onDone: (message: string) => void } & Scheduled) {
  const [mode, setMode] = useState<'idle' | 'schedule' | 'discard'>('idle');
  return <li className="lab-follow-up-row">
    <div className="lab-follow-up-who">
      <strong>{proposal.patientName ?? 'Paciente'}</strong>
      <small className="muted">{[proposal.patientRecord ? `Exp. ${proposal.patientRecord}` : null, proposal.doctorName ? `Con ${proposal.doctorName}` : null, `Resultados del ${formatDate(proposal.resultsAt)}`].filter(Boolean).join(' · ')}</small>
    </div>
    {proposal.priority === 'urgente' && <PriorityBadge value="urgente" />}
    {mode === 'idle' && <div className="lw-actions">
      <button type="button" className="primary-button" onClick={() => setMode('schedule')}>Agendar cita</button>
      <button type="button" className="row-action" onClick={() => setMode('discard')}>Descartar</button>
    </div>}
    {mode === 'schedule' && <ScheduleForm api={api} proposal={proposal} scheduled={scheduled} onScheduled={onScheduled} onCancel={() => setMode('idle')} onDone={onDone} />}
    {mode === 'discard' && <DiscardForm api={api} proposal={proposal} onCancel={() => setMode('idle')} onDone={() => onDone(`Propuesta de ${proposal.patientName ?? 'el paciente'} descartada.`)} />}
  </li>;
}

type DayFree = { day: string; slots: Slot[] };

/** Free slots of one doctor for the next `SEARCH_DAYS` days (one read per day, in parallel; no polling). */
function useFreeDays(api: Api, doctorId: string) {
  const [days, setDays] = useState<DayFree[] | null>(null), [error, setError] = useState<ApiError | null>(null);
  useEffect(() => {
    let alive = true;
    setDays(null); setError(null);
    const list = Array.from({ length: SEARCH_DAYS }, (_, i) => localDay(new Date(), i));
    Promise.all(list.map(day => api.request<Availability>(`/citas/disponibilidad?doctorId=${doctorId}&date=${day}`).then(a => ({ day, slots: (a.slots ?? []).filter(s => new Date(s.start).valueOf() > Date.now()) }))))
      .then(found => { if (alive) setDays(found); })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e : new ApiError('No se pudo consultar la agenda.')); });
    return () => { alive = false; };
  }, [api, doctorId]);
  return { days, error };
}

const doctorName = (d: CatalogDoctor) => `${d.givenNames} ${d.surnames}`.trim();

/**
 * Two steps with the existing commands: schedule (POST /citas, a confirmed appointment) and link it to the proposal.
 * If the link fails after the appointment exists, the appointment is kept and the link can be retried with it.
 */
function ScheduleForm({ api, proposal, scheduled, onScheduled, onCancel, onDone }: { api: Api; proposal: LabProposal; onCancel: () => void; onDone: (message: string) => void } & Scheduled) {
  const [doctorId, setDoctorId] = useState(proposal.doctorId);
  const catalog = useData<{ doctors?: CatalogDoctor[] }>(api, '/citas/catalogos', 0);
  const doctors = catalog.data?.doctors ?? [];
  const specialty = doctors.find(d => d.id === proposal.doctorId)?.specialty ?? null;
  const peers = doctors.filter(d => d.active && d.id !== proposal.doctorId && !!specialty && d.specialty?.toLowerCase() === specialty.toLowerCase());
  const { days, error: daysError } = useFreeDays(api, doctorId);
  const [day, setDay] = useState<string | null>(null), [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null);
  // Sweep U6: a retry of the same body replays the same Idempotency-Key, so a lost response never books twice;
  // a different body (another doctor or slot) gets its own key.
  const keys = useRef(new Map<string, string>());
  const intentKey = (path: string, body: unknown) => {
    const signature = `${path} ${JSON.stringify(body)}`;
    const known = keys.current.get(signature);
    if (known) return known;
    const key = newIntentKey();
    keys.current.set(signature, key);
    return key;
  };
  // Opens on the first day with a free slot (A-1 for the follow-up journey), and again after switching doctor.
  useEffect(() => { setSlot(null); setDay(days?.find(d => d.slots.length)?.day ?? null); }, [days]);
  const current = days?.find(d => d.day === day) ?? null;
  const chosenName = doctorId === proposal.doctorId ? proposal.doctorName ?? 'el médico' : doctorName(doctors.find(d => d.id === doctorId)!);
  async function confirm() {
    if (!slot && !scheduled) return;
    setBusy(true); setError(null);
    try {
      const booking = { patientId: proposal.patientId, doctorId, start: slot?.start, end: slot?.end, reason: FOLLOW_UP_REASON };
      const appointmentId = scheduled ?? (await withIntentKey(intentKey('/citas', booking), () => api.write<{ id: string }>('/citas', booking, 'POST'))).id;
      onScheduled(appointmentId);
      const link = { version: proposal.version, appointmentId };
      await withIntentKey(intentKey('confirmar', link), () => api.write(`/laboratorio/seguimientos/${proposal.id}/confirmar`, link, 'POST'));
      onDone(slot ? `Cita de seguimiento confirmada: ${proposal.patientName ?? 'el paciente'}, ${dayLabel(day!)} a las ${slotLabel(slot)} con ${chosenName}.` : 'Cita de seguimiento confirmada.');
    } catch (e) { setError(spanishProblem(e instanceof ApiError ? e : new ApiError('No se pudo agendar la cita.'))); }
    finally { setBusy(false); }
  }
  return <form className="lab-follow-up-form" onSubmit={event => { event.preventDefault(); void confirm(); }} aria-label={`Agendar seguimiento de ${proposal.patientName ?? 'paciente'}`}>
    {scheduled
      ? <Notice kind="info">La cita ya quedó agendada; falta enlazarla a la propuesta. Vuelve a intentar.</Notice>
      : <>
        {peers.length > 0 && <Select label="Médico" value={doctorId} onChange={value => setDoctorId(value)} disabled={busy}>
          <option value={proposal.doctorId}>{proposal.doctorName ?? 'Médico que pidió los exámenes'} (pidió los exámenes)</option>
          {peers.map(d => <option key={d.id} value={d.id}>{doctorName(d)}</option>)}
        </Select>}
        {daysError ? <WriteError error={spanishProblem(daysError)} /> : !days ? <p className="muted" role="status">Buscando el primer día libre…</p>
          : !days.some(d => d.slots.length) ? <p className="muted" role="status">{chosenName} no tiene horas libres en los próximos {SEARCH_DAYS} días.{peers.length ? ' Elige otro médico de la misma especialidad.' : ''}</p>
          : <>
            <div className="lab-day-chips" role="group" aria-label="Días con horas libres">{days.map(d => <button key={d.day} type="button" className="lab-day-chip" aria-pressed={d.day === day} disabled={!d.slots.length || busy} onClick={() => { setDay(d.day); setSlot(null); }}>
              {dayLabel(d.day)} <small>{d.slots.length ? `· ${d.slots.length}` : '· sin horas'}</small></button>)}</div>
            {current && <div className="lab-slot-grid" role="radiogroup" aria-label={`Horas libres del ${dayLabel(current.day)}`}>{current.slots.map(s => <label key={s.start} className={`lab-slot${slot?.start === s.start ? ' is-selected' : ''}`}><input type="radio" name={`slot-${proposal.id}`} checked={slot?.start === s.start} onChange={() => setSlot(s)} />{slotLabel(s)}</label>)}</div>}
          </>}
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
