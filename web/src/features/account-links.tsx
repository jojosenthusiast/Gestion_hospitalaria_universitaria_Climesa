import { useState, type FormEvent } from 'react';
import { Field, Notice } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import './account-links.css';
import { Dialog, Empty, Heading, RemoteState, SaveButton, WriteError, formatDate, formatDateTime, useAction, useData } from './common';

/** Row of `GET /cuentas/vinculaciones` (spec 101, W27). */
export type LinkRequest = {
  id: string; createdAt: string; version: number;
  account: { email: string; name: string };
  declared: { dui: string; birth: string };
  candidate: { id: string; record: string; fullName: string; birth: string | null } | null;
  candidates: number;
};

/**
 * W27 · Vinculaciones por verificar (FR-101-08 a FR-101-11). New requests enter on their own: any realtime event raises
 * `version` and the list is fetched again. Approval links the account only when a record matches DUI and date of birth.
 */
export function AccountLinksPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<LinkRequest[]>(api, '/cuentas/vinculaciones', version);
  const [rejecting, setRejecting] = useState<LinkRequest | null>(null);
  const reload = () => { setRejecting(null); data.refresh(); };
  const allowed = can(profile, 'cuentas.verificar');
  return <>
    <Heading eyebrow="Pacientes / Cuentas" title="Vinculaciones por verificar" description="Cuentas de pacientes que piden unirse a su expediente. Las nuevas aparecen solas." />
    <LinkingGuide />
    <section className="data-workbench" aria-label="Solicitudes de vinculación">
      <RemoteState state={data}>{rows => rows.length
        ? <><p className="link-summary" role="status"><strong>{rows.length}</strong> {rows.length === 1 ? 'solicitud espera' : 'solicitudes esperan'} tu revisión · <span>{rows.filter(r => r.candidate).length} con expediente que coincide</span> · <span>{rows.filter(r => !r.candidate).length} por revisar a mano</span></p><ul className="history-list">{rows.map(row => <LinkRequestCard key={row.id} api={api} row={row} allowed={allowed} onReject={() => setRejecting(row)} onSaved={reload} />)}</ul></>
        : <Empty title="No hay vinculaciones pendientes" description="Estás al día. Cuando un paciente cree su cuenta en la app y pida unirla a su expediente, la solicitud aparecerá aquí sola, sin recargar." />}</RemoteState>
    </section>
    {rejecting && <RejectDialog api={api} row={rejecting} onClose={() => setRejecting(null)} onSaved={reload} />}
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
      <li><span className="status-tag status-normal">Coincide</span> El dato declarado es igual al del expediente.</li>
      <li><span className="status-tag status-pendiente">Revisar</span> No hay coincidencia: verifica con el paciente o busca el expediente.</li>
      <li><span className="status-tag status-aprobada">Aprobada</span> La cuenta ya ve su expediente.</li>
      <li><span className="status-tag status-rechazada">Rechazada</span> El paciente lee tu motivo y puede volver a pedirlo.</li>
    </ul>
  </section>;
}

function LinkRequestCard({ api, row, allowed, onReject, onSaved }: { api: Api; row: LinkRequest; allowed: boolean; onReject: () => void; onSaved: () => void }) {
  const action = useAction(api);
  const candidate = row.candidate;
  async function approve() { if (await action.run(`/cuentas/vinculaciones/${row.id}/aprobar`, { version: row.version })) onSaved(); }
  const match = (ok: boolean) => <span className={`status-tag status-${ok ? 'normal' : 'pendiente'}`}>{ok ? 'Coincide' : 'Revisar'}</span>;
  return <li aria-label={`Solicitud de ${row.account.email}`}>
    <div className="history-item-head"><div><strong>{row.account.email}</strong><small>{formatDateTime(row.createdAt)}</small></div></div>
    <table className="record-table"><caption className="sr-only">Datos declarados frente al expediente candidato</caption>
      <thead><tr><th>Dato</th><th>Lo que dio el paciente</th><th>Expediente candidato</th><th>Resultado</th></tr></thead>
      <tbody>
        <tr><td data-label="Dato">Nombre</td><td data-label="Lo que dio el paciente">{row.account.name || 'Sin nombre en la cuenta'}</td><td data-label="Expediente candidato">{candidate ? `${candidate.fullName} · ${candidate.record}` : '—'}</td><td data-label="Resultado">{match(!!candidate && !!row.account.name && candidate.fullName.toLowerCase() === row.account.name.toLowerCase())}</td></tr>
        <tr><td data-label="Dato">DUI</td><td data-label="Lo que dio el paciente"><span className="mono-data">{row.declared.dui}</span></td><td data-label="Expediente candidato">{candidate ? <span className="mono-data">{row.declared.dui}</span> : '—'}</td><td data-label="Resultado">{match(!!candidate)}</td></tr>
        <tr><td data-label="Dato">Nacimiento</td><td data-label="Lo que dio el paciente">{formatDate(row.declared.birth)}</td><td data-label="Expediente candidato">{candidate ? formatDate(candidate.birth) : '—'}</td><td data-label="Resultado">{match(!!candidate && candidate.birth === row.declared.birth)}</td></tr>
      </tbody>
    </table>
    {candidate
      ? <Notice kind="success">DUI y fecha de nacimiento coinciden con el expediente {candidate.record}. Verifica la identidad antes de aprobar.</Notice>
      : <Notice kind="info">{row.candidates > 1 ? 'Más de un expediente coincide: resuelve el posible duplicado antes de aprobar.' : 'No hay expediente con ese DUI y esa fecha: búscalo en Pacientes y regístralo si no existe; después aprueba.'}</Notice>}
    <WriteError error={action.error} />
    {allowed && <div className="dialog-actions">
      <button type="button" className="secondary-button" onClick={onReject} disabled={action.busy}>Rechazar con motivo</button>
      {candidate ? <button type="button" className="primary-button" onClick={approve} disabled={action.busy}>{action.busy ? 'Aprobando…' : 'Aprobar'}</button>
        : <a className="row-action" href="#/pacientes">Buscar antes de crear</a>}
    </div>}
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
