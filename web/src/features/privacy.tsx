import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { can, roleNames, type AccessProfile, type Api, type AuditRow, type ChainCheck, type ExceptionalAccess, type Patient } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';

const views: Record<ExceptionalAccess['vista'], string> = { pendiente: 'Por aprobar', por_revisar: 'Urgencia por revisar', vigente: 'Vigente', vencido: 'Vencido', negado: 'Negado' };
const viewTag: Record<ExceptionalAccess['vista'], string> = { pendiente: 'pendiente', por_revisar: 'en_proceso', vigente: 'activo', vencido: 'inactivo', negado: 'rechazada' };
const requesterLabel = (row: ExceptionalAccess) => `${row.solicitante}${row.solicitanteRoles ? ` (${row.solicitanteRoles.split(',').map(r => roleNames[r] ?? r).join(', ')})` : ''}`;
const open = (row: ExceptionalAccess) => row.vista === 'pendiente' || row.vista === 'por_revisar';

function Reason({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="field"><span>{label}</span><textarea value={value} onChange={event => onChange(event.target.value)} required minLength={10} maxLength={500} rows={3} /><small>Entre 10 y 500 caracteres.</small></label>;
}

/** W30 (delegate inbox) and W31 (request), in one module opened by either permission (rule 8). */
export function ExceptionalAccessPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const approver = can(profile, 'privacidad.aprobar_acceso'), requester = can(profile, 'privacidad.solicitar_acceso');
  const [filter, setFilter] = useState(approver ? 'pendiente' : ''), [asking, setAsking] = useState(false), [resolving, setResolving] = useState<{ row: ExceptionalAccess; action: 'aprobar' | 'negar' } | null>(null), [notice, setNotice] = useState('');
  const data = useData<ExceptionalAccess[]>(api, `/accesos-excepcionales${filter ? `?estado=${filter}` : ''}`, version);
  return <>
    <Heading eyebrow="Protección de datos / Accesos" title="Accesos excepcionales" description={approver ? 'Nunca apruebas tu propia solicitud (RN-38). Los accesos vencen solos, como máximo en 24 h.' : 'Pide ver datos clínicos con motivo y duración. El Delegado de protección de datos decide y el acceso vence solo.'}
      actions={requester && <button className="primary-button" onClick={() => setAsking(true)}><Icon name="plus" size={18} />Solicitar acceso</button>} />
    {notice && <Notice kind="success">{notice}</Notice>}
    <section className="data-workbench">
      {approver && <div className="form-grid"><Select label="Mostrar" value={filter} onChange={setFilter}><option value="pendiente">Por aprobar</option><option value="aprobado">Aprobados y urgencias</option><option value="negado">Negados</option><option value="">Todas</option></Select></div>}
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Solicitudes de acceso excepcional</caption><thead><tr><th>Solicitud</th><th>Paciente</th><th>Motivo</th><th>Duración</th><th>Estado</th>{approver && <th>Acciones</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.id}>
        <td data-label="Solicitud"><strong>{approver ? requesterLabel(row) : 'Tu solicitud'}</strong><small>Pedido {formatDateTime(row.creadoEn)}{row.urgencia ? ' · urgencia' : ''}</small></td>
        <td data-label="Paciente"><span className="mono-data">{row.expediente}</span></td>
        <td data-label="Motivo">{row.motivo}</td>
        <td data-label="Duración">{row.horas} h{row.hasta && <small>{row.vista === 'vigente' || row.vista === 'por_revisar' ? 'Vence' : 'Terminó'}: {formatDateTime(row.hasta)}</small>}</td>
        <td data-label="Estado"><Tag value={viewTag[row.vista]} label={views[row.vista]} /></td>
        {approver && <td data-label="Acciones">{open(row) && row.solicitanteId !== profile.id ? <div className="row-actions"><button className="secondary-button" onClick={() => setResolving({ row, action: 'negar' })}>{row.vista === 'por_revisar' ? 'Cerrar acceso' : 'Negar con motivo'}</button><button className="primary-button" onClick={() => setResolving({ row, action: 'aprobar' })}>{row.vista === 'por_revisar' ? 'Confirmar' : `Aprobar ${row.horas} h`}</button></div> : open(row) ? <small>Tu propia solicitud</small> : null}</td>}
      </tr>)}</tbody></table> : <Empty title={approver ? 'No hay solicitudes en esta vista' : 'Todavía no has pedido accesos'} description={approver ? 'Las nuevas solicitudes aparecen aquí en vivo.' : 'Cuando pidas un acceso, verás aquí si fue aprobado y cuándo vence.'} />}</RemoteState>
    </section>
    {asking && <RequestDialog api={api} profile={profile} onClose={() => setAsking(false)} onSaved={() => { setAsking(false); setNotice('Solicitud enviada. Te avisaremos cuando el delegado la resuelva.'); data.refresh(); }} />}
    {resolving && <ResolveDialog api={api} row={resolving.row} action={resolving.action} onClose={() => setResolving(null)} onSaved={() => { setResolving(null); setNotice(resolving.action === 'aprobar' ? 'Acceso aprobado.' : 'Acceso negado.'); data.refresh(); }} />}
  </>;
}

/** W31: patient, reason and duration. Without patient search the account types the patient's id. */
function RequestDialog({ api, profile, onClose, onSaved }: { api: Api; profile: AccessProfile; onClose: () => void; onSaved: () => void }) {
  const search = can(profile, 'pacientes.buscar');
  const [query, setQuery] = useState(''), [submitted, setSubmitted] = useState(''), [patientId, setPatientId] = useState(''), [reason, setReason] = useState(''), [hours, setHours] = useState('2');
  const patients = useData<Patient[]>(api, `/pacientes?query=${encodeURIComponent(submitted)}&limit=20`, 0, search && submitted.length >= 2);
  const action = useAction(api);
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run('/accesos-excepcionales', { pacienteId: patientId.trim(), motivo: reason.trim(), horas: Number(hours) })) onSaved(); }
  return <Dialog title="Solicitar acceso excepcional" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><WriteError error={action.error} />
    <p className="form-intro">Lo aprueba o niega el Delegado de protección de datos. Todo queda auditado.</p>
    {search ? <><div className="form-grid"><Field label="Buscar paciente" value={query} onChange={setQuery} hint="Nombre, DUI o expediente" /><button className="secondary-button" type="button" disabled={query.trim().length < 2} onClick={() => setSubmitted(query.trim())}><Icon name="search" size={18} />Buscar</button></div>
      {submitted && <RemoteState state={patients}>{rows => rows.length ? <Select label="Paciente" value={patientId} onChange={setPatientId} required><option value="">Selecciona un paciente</option>{rows.map(p => <option key={p.id} value={p.id}>{p.record} · {p.fullName}</option>)}</Select> : <Empty title="Sin coincidencias" description="Ajusta la búsqueda." />}</RemoteState>}</>
      : <Field label="Identificador del paciente" value={patientId} onChange={setPatientId} required pattern="[0-9a-fA-F-]{36}" hint="El identificador interno que te compartió la persona que atiende el caso." />}
    <div className="form-grid"><Reason label="Motivo" value={reason} onChange={setReason} /><Field label="Duración en horas" type="number" min="1" max="24" step="1" value={hours} onChange={setHours} required /></div>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Enviar solicitud" disabled={!patientId.trim() || reason.trim().length < 10 || !hours} /></div>
  </form></Dialog>;
}

function ResolveDialog({ api, row, action: kind, onClose, onSaved }: { api: Api; row: ExceptionalAccess; action: 'aprobar' | 'negar'; onClose: () => void; onSaved: () => void }) {
  const [hours, setHours] = useState(String(row.horas)), [reason, setReason] = useState('');
  const action = useAction(api), approve = kind === 'aprobar', review = row.vista === 'por_revisar';
  async function save(event: FormEvent) {
    event.preventDefault();
    const body = approve ? { version: row.version, ...(review ? {} : { horas: Number(hours) }) } : { version: row.version, motivo: reason.trim() };
    if (await action.run(`/accesos-excepcionales/${row.id}/${kind}`, body)) onSaved();
  }
  return <Dialog title={approve ? (review ? 'Confirmar acceso de urgencia' : 'Aprobar acceso') : (review ? 'Cerrar acceso de urgencia' : 'Negar acceso')} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}><WriteError error={action.error} />
    <p className="form-intro">{requesterLabel(row)} · expediente <span className="mono-data">{row.expediente}</span>. Motivo: {row.motivo}</p>
    {approve && !review && <Field label="Horas que apruebas" type="number" min="1" max={String(row.horas)} step="1" value={hours} onChange={setHours} required hint={`Como máximo las ${row.horas} h pedidas.`} />}
    {!approve && <Reason label="Motivo de la decisión" value={reason} onChange={setReason} />}
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={approve ? (review ? 'Confirmar' : 'Aprobar') : 'Negar'} disabled={!approve && reason.trim().length < 10} /></div>
  </form></Dialog>;
}

/** W32: filters by person, patient, action and date; chain verification (FR-110-07). Metadata only. */
export function AuditPage({ api, version }: { api: Api; version: number }) {
  const [person, setPerson] = useState(''), [patient, setPatient] = useState(''), [action, setAction] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [query, setQuery] = useState('');
  const data = useData<AuditRow[]>(api, `/auditoria${query}`, version);
  const verify = useAction(api), [check, setCheck] = useState<ChainCheck | null>(null);
  function search(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (person.trim()) params.set('persona', person.trim());
    if (patient.trim()) params.set('paciente', patient.trim());
    if (action.trim()) params.set('accion', action.trim());
    if (from) params.set('desde', new Date(`${from}T00:00:00-06:00`).toISOString());
    if (to) params.set('hasta', new Date(new Date(`${to}T00:00:00-06:00`).getTime() + 86400_000).toISOString());
    const text = params.toString();
    setQuery(text ? `?${text}` : '');
  }
  async function runCheck() { setCheck(null); const result = await verify.run<ChainCheck>('/auditoria/verificacion', {}); if (result) setCheck(result); }
  return <><Heading eyebrow="Protección de datos / Trazabilidad" title="Auditoría" description="Registro de solo inserción encadenado por hash (D-009). Quién realizó cada operación, cuándo y con qué resultado."
      actions={<button className="primary-button" onClick={runCheck} disabled={verify.busy}><Icon name="shield" size={18} />{verify.busy ? 'Verificando…' : 'Verificar integridad'}</button>} />
    <WriteError error={verify.error} />
    {check && (check.integra ? <Notice kind="success">Cadena íntegra: se revisaron {check.revisados} registros.</Notice> : <Notice kind="error">La cadena está alterada en el registro {check.primeraFallida}: {check.motivo}. Se revisaron {check.revisados} registros íntegros antes de él.</Notice>)}
    <section className="data-workbench">
      <form className="module-form" onSubmit={search} aria-label="Filtros de auditoría"><div className="form-grid">
        <Field label="Persona" value={person} onChange={setPerson} hint="Nombre, correo o identificador" />
        <Field label="Paciente" value={patient} onChange={setPatient} hint="Expediente o identificador" />
        <Field label="Acción" value={action} onChange={setAction} hint="Por ejemplo consulta. o acceso_excepcional." />
        <Field label="Desde" type="date" value={from} onChange={setFrom} />
        <Field label="Hasta" type="date" value={to} onChange={setTo} />
      </div><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => { setPerson(''); setPatient(''); setAction(''); setFrom(''); setTo(''); setQuery(''); }}>Limpiar</button><button className="primary-button" type="submit"><Icon name="search" size={18} />Buscar</button></div></form>
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Operaciones auditadas</caption><thead><tr><th>Fecha</th><th>Persona</th><th>Operación</th><th>Paciente</th><th>Motivo</th><th>Resultado</th></tr></thead><tbody>{rows.map(r => <tr key={r.seq}><td data-label="Fecha">{formatDateTime(r.at)}</td><td data-label="Persona"><strong>{r.actor || 'Cuenta del sistema'}</strong><small>{r.role}</small></td><td data-label="Operación">{r.action}<small className="mono-data">{r.entity}</small></td><td data-label="Paciente"><span className="mono-data">{r.patientRecord ?? '—'}</span></td><td data-label="Motivo">{r.reason === 'acceso_excepcional' ? <Tag value="pendiente" label="Excepcional" /> : r.reason || <small>Relación de atención</small>}</td><td data-label="Resultado"><Tag value={r.result} /></td></tr>)}</tbody></table> : <Empty title="Todavía no hay actividad" description="Las operaciones aparecerán aquí después de registrarse." />}</RemoteState>
      <p className="table-footnote">Se muestran hasta 100 operaciones. La auditoría no incluye valores clínicos.</p>
    </section></>;
}
