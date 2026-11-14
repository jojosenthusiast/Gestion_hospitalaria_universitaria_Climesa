import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { type Api, type AuditRow, type ChainCheck } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, formatDateTime, useAction, useData } from './common';

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
        <Field label="Acción" value={action} onChange={setAction} hint="Por ejemplo consulta. o paciente." />
        <Field label="Desde" type="date" value={from} onChange={setFrom} />
        <Field label="Hasta" type="date" value={to} onChange={setTo} />
      </div><div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => { setPerson(''); setPatient(''); setAction(''); setFrom(''); setTo(''); setQuery(''); }}>Limpiar</button><button className="primary-button" type="submit"><Icon name="search" size={18} />Buscar</button></div></form>
      <RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Operaciones auditadas</caption><thead><tr><th>Fecha</th><th>Persona</th><th>Operación</th><th>Paciente</th><th>Motivo</th><th>Resultado</th></tr></thead><tbody>{rows.map(r => <tr key={r.seq}><td data-label="Fecha">{formatDateTime(r.at)}</td><td data-label="Persona"><strong>{r.actor || 'Cuenta del sistema'}</strong><small>{r.role}</small></td><td data-label="Operación">{r.action}<small className="mono-data">{r.entity}</small></td><td data-label="Paciente"><span className="mono-data">{r.patientRecord ?? '—'}</span></td><td data-label="Motivo">{r.reason === 'acceso_excepcional' ? <Tag value="pendiente" label="Excepcional" /> : r.reason || <small>Relación de atención</small>}</td><td data-label="Resultado"><Tag value={r.result} /></td></tr>)}</tbody></table> : <Empty title="Todavía no hay actividad" description="Las operaciones aparecerán aquí después de registrarse." />}</RemoteState>
      <p className="table-footnote">Se muestran hasta 100 operaciones. La auditoría no incluye valores clínicos.</p>
    </section></>;
}
