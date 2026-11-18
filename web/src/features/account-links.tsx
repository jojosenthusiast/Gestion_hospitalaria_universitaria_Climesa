import { useState, type FormEvent } from 'react';
import { Field, Notice } from '../components/ui';
import { can, type AccessProfile, type Api, type PatientInput } from '../lib/api';
import './account-links.css';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, formatDate, formatDateTime, useAction, useData } from './common';
import { PatientForm, prefillFromQuery } from './patients';

/** Row of `GET /cuentas/vinculaciones` (spec 101, W27). */
export type LinkRequest = {
  id: string; createdAt: string; version: number;
  account: { email: string; name: string };
  declared: { dui: string; birth: string };
  /** Only the exact match (DUI and birth). G-2: `dui` is the record's own DUI. */
  candidate: { id: string; record: string; fullName: string; birth: string | null; dui?: string | null; exact?: boolean } | null;
  candidates: number;
  /** G-2: with no exact match, the closest record (same birth, DUI one digit away). Never approvable. */
  closest?: { id: string; record: string; fullName: string; birth: string | null; dui: string | null } | null;
};

/**
 * W27 · Vinculaciones por verificar (FR-101-08 a FR-101-11). New requests enter on their own: any realtime event raises
 * `version` and the list is fetched again. Approval links the account only when a record matches DUI and date of birth.
 */
export function AccountLinksPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<LinkRequest[]>(api, '/cuentas/vinculaciones', version);
  const [rejecting, setRejecting] = useState<LinkRequest | null>(null);
  // G2: the notice after approving, and the request whose record was just registered (its card says it is ready).
  const [done, setDone] = useState<string | null>(null), [registering, setRegistering] = useState<LinkRequest | null>(null), [ready, setReady] = useState<{ id: string; record?: string } | null>(null);
  const reload = () => { setRejecting(null); data.refresh(); };
  const allowed = can(profile, 'cuentas.verificar'), canRegister = can(profile, 'pacientes.registrar');
  return <>
    <CompactHeader breadcrumb="Pacientes / Cuentas" title="Vinculaciones por verificar"/>
    {done && <Notice kind="success">{done}</Notice>}
    <LinkingGuide />
    <section className="data-workbench" aria-label="Solicitudes de vinculación">
      <RemoteState state={data}>{rows => rows.length
        ? <><p className="link-summary" role="status"><strong>{rows.length}</strong> {rows.length === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu revisión · <span>{rows.filter(exactMatch).length} con expediente que coincide</span> · <span>{rows.filter(r => !exactMatch(r)).length} por revisar a mano</span></p><ul className="history-list">{rows.map(row => <LinkRequestCard key={row.id} api={api} row={row} allowed={allowed} canRegister={canRegister} ready={ready?.id === row.id ? ready.record ?? '' : null}
          onReject={() => setRejecting(row)} onRegister={() => setRegistering(row)}
          onApproved={record => { setReady(null); setDone(`${row.account.email} quedó vinculada con el expediente ${record}.`); reload(); }} />)}</ul></>
        : <Empty title="No hay vinculaciones pendientes" description="Estás al día. Cuando un paciente cree su cuenta en la app y pida unirla a su expediente, la solicitud aparecerá aquí sola, sin recargar." />}</RemoteState>
    </section>
    {rejecting && <RejectDialog api={api} row={rejecting} onClose={() => setRejecting(null)} onSaved={reload} />}
    {registering && <PatientForm api={api} patient={null} receipt={null} query={registering.declared.dui} initial={declaredPatient(registering)} initialSource="la solicitud"
      onClose={() => setRegistering(null)} onSaved={created => { setReady({ id: registering.id, record: created?.record }); setRegistering(null); data.refresh(); }} />}
  </>;
}

/** Explica el módulo para quien lo abre por primera vez: qué es, cómo se resuelve y qué significa cada estado. */
function LinkingGuide() {
  return <section className="link-guide" aria-label="Qué es una vinculación">
    <h2>¿Qué es una vinculación?</h2>
    <p>Un paciente crea su propia cuenta en la app y pide <strong>unirla a su expediente médico</strong> para ver sus citas, resultados e historial. Antes de darle acceso, Recepción confirma que de verdad es esa persona: compara el <strong>DUI y la fecha de nacimiento</strong> que declaró con los del expediente.</p>
    <ol className="link-steps">
      <li><strong>1. Llega la solicitud.</strong><span>Aparece abajo por sí sola.</span></li>
      <li><strong>2. Compara los datos.</strong><span>Nombre, DUI y nacimiento frente al expediente candidato.</span></li>
      <li><strong>3. Decide.</strong><span>Aprueba si coinciden; rechaza con un motivo si no.</span></li>
    </ol>
    <ul className="link-states" aria-label="Estados">
      <li><Tag value="coincide" /> El dato declarado es igual al del expediente.</li>
      <li><Tag value="revisar" /> No hay coincidencia: verifica con el paciente o busca el expediente.</li>
      <li><Tag value="aprobada" /> La cuenta ya ve su expediente.</li>
      <li><Tag value="rechazada" /> El paciente lee tu motivo y puede volver a pedirlo.</li>
    </ul>
  </section>;
}

/** The record can be approved only when DUI and birth match exactly: `candidate` carries only that match. */
const exactMatch = (row: LinkRequest) => !!row.candidate;
const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const plain = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('es');

/** G2: the declared data a new record starts from (the account's name split as a search would split it). */
function declaredPatient(row: LinkRequest): Partial<PatientInput> {
  return { ...(row.account.name ? prefillFromQuery(row.account.name) : {}), dui: row.declared.dui, birth: row.declared.birth ?? '', email: row.account.email };
}

type Compared = { id: string; record: string; fullName: string; birth: string | null; dui?: string | null };
/** Field-by-field comparison of the declared data with the record (✓/✗). The DUI is always the record's own DUI. */
function compare(row: LinkRequest, candidate: Compared | null) {
  const recordDui = candidate?.dui ?? null;
  return [
    { label: 'Nombre', declared: row.account.name || 'Sin nombre en la cuenta', record: candidate ? `${candidate.fullName} · ${candidate.record}` : '—', ok: !!candidate && !!row.account.name && plain(candidate.fullName) === plain(row.account.name) },
    { label: 'DUI', declared: <span className="mono-data">{row.declared.dui}</span>, record: recordDui ? <span className="mono-data">{recordDui}</span> : candidate ? 'Sin DUI en el expediente' : '—', ok: !!recordDui && digits(recordDui) === digits(row.declared.dui) },
    { label: 'Nacimiento', declared: formatDate(row.declared.birth, { withYear: true }), record: candidate ? formatDate(candidate.birth, { withYear: true }) : '—', ok: !!candidate && candidate.birth === row.declared.birth },
  ];
}

function LinkRequestCard({ api, row, allowed, canRegister, ready, onReject, onRegister, onApproved }: { api: Api; row: LinkRequest; allowed: boolean; canRegister: boolean; ready: string | null; onReject: () => void; onRegister: () => void; onApproved: (record: string) => void }) {
  const action = useAction(api);
  const exact = exactMatch(row), candidate = row.candidate ?? row.closest ?? null;
  const [confirming, setConfirming] = useState(false);
  const fields = compare(row, candidate), off = fields.filter(f => !f.ok).map(f => f.label.toLocaleLowerCase('es'));
  async function approve() { if (candidate && await action.run(`/cuentas/vinculaciones/${row.id}/aprobar`, { version: row.version })) { setConfirming(false); onApproved(candidate.record); } }
  const match = (ok: boolean) => <span className={`link-match ${ok ? 'is-ok' : 'is-off'}`}><span aria-hidden="true">{ok ? '✓' : '✗'}</span><Tag value={ok ? 'coincide' : 'revisar'} /></span>;
  return <li aria-label={`Solicitud de ${row.account.email}`}>
    <div className="history-item-head"><div><strong>{row.account.email}</strong><small>{formatDateTime(row.createdAt)}</small></div></div>
    {ready !== null && exact && <Notice kind="success">Expediente {ready || candidate?.record} registrado con los datos de la solicitud. Revisa la comparación y aprueba.</Notice>}
    <table className="record-table"><caption className="sr-only">Datos declarados frente al expediente candidato</caption>
      <thead><tr><th>Dato</th><th>Lo que dio el paciente</th><th>Expediente candidato</th><th>Resultado</th></tr></thead>
      <tbody>{fields.map(f => <tr key={f.label}><td data-label="Dato">{f.label}</td><td data-label="Lo que dio el paciente">{f.declared}</td><td data-label="Expediente candidato">{f.record}</td><td data-label="Resultado">{match(f.ok)}</td></tr>)}</tbody>
    </table>
    {candidate && exact
      ? <Notice kind="success">DUI y fecha de nacimiento coinciden con el expediente {candidate.record}. Verifica la identidad antes de aprobar.</Notice>
      : candidate
      ? <Notice kind="info">Ningún expediente coincide con exactitud. El más parecido es {candidate.record}: misma fecha de nacimiento y el DUI cambia en un dígito. Confirma el DUI con el paciente; si se equivocó al escribirlo, rechaza con ese motivo para que lo pida otra vez.</Notice>
      : row.candidates > 1
      // The record pair cannot be merged from Recepción: the card says what this person can do now.
      ? <Notice kind="info">Más de un expediente tiene el DUI <span className="mono-data">{row.declared.dui}</span> y esa fecha de nacimiento, así que no se puede aprobar todavía. Recepción no fusiona expedientes: <a className="cl-link-button" href="#/pacientes">búscalos en Pacientes</a> por ese DUI, confirma con el paciente cuál es el suyo y avisa a Administración del posible duplicado. Si el paciente no puede esperar, rechaza con ese motivo.</Notice>
      : <Notice kind="info">No hay expediente con ese DUI y esa fecha: búscalo en Pacientes y regístralo si no existe; después aprueba.</Notice>}
    {!confirming && <WriteError error={action.error} />}
    {allowed && <div className="dialog-actions">
      <button type="button" className="secondary-button" onClick={onReject} disabled={action.busy}>Rechazar con motivo</button>
      {exact ? <button type="button" className="primary-button" onClick={() => setConfirming(true)} disabled={action.busy}>Aprobar</button>
        : !candidate && row.candidates <= 1 && canRegister && <button type="button" className="secondary-button" onClick={onRegister} disabled={action.busy}>Registrar paciente</button>}
    </div>}
    {confirming && exact && candidate && <Dialog title="Aprobar vinculación" onClose={() => setConfirming(false)} busy={action.busy}><div className="module-form">
      <p><strong>Vincular {row.account.email} con expediente {candidate.record}</strong></p>
      <p>La cuenta verá el expediente {candidate.record} · {candidate.fullName}: citas, resultados e historial.</p>
      {off.length > 0 && <Notice kind="error">No coincide: {off.join(', ')}. Confirma la identidad con un documento antes de aprobar.</Notice>}
      <p>Apruébala solo si verificaste la identidad de la persona.</p>
      <WriteError error={action.error} />
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setConfirming(false)} disabled={action.busy}>Volver</button>
        <button type="button" className="primary-button" onClick={() => void approve()} disabled={action.busy}>{action.busy ? 'Aprobando…' : 'Aprobar vinculación'}</button></div></div></Dialog>}
  </li>;
}

function RejectDialog({ api, row, onClose, onSaved }: { api: Api; row: LinkRequest; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState('');
  const [tooShort, setTooShort] = useState(false);
  const action = useAction(api);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) { setTooShort(true); return; }
    setTooShort(false);
    if (await action.run(`/cuentas/vinculaciones/${row.id}/rechazar`, { version: row.version, reason: reason.trim() })) onSaved();
  }
  return <Dialog title="Rechazar vinculación" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p>Cuenta: <strong>{row.account.email}</strong>. El paciente verá este motivo.</p>
    <WriteError error={action.error} />
    <Field label="Motivo del rechazo" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus />
    {tooShort && <Notice kind="error">El motivo debe tener al menos 10 caracteres.</Notice>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Rechazar solicitud" /></div>
  </form></Dialog>;
}
