import { useEffect, useState, type FormEvent } from 'react';
import { Field, Icon } from '../components/ui';
import { can, type AccessProfile, type Api, type Bed } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, useAction, useData } from './common';
import { AdmissionStepper } from './hospitalization/admission-stepper';
import { useQuickAction } from './personal/accion';

type Admission = { id: string; patientId: string; patientName: string; origin: string; requestedCategory: string; state: string; isolation: boolean; bed: string; version: number; occupationId?: string | null; scheduledAt?: string | null; motive?: string | null; unstable?: boolean; postSurgical?: boolean; visitorsAllowed?: boolean; visitorsMax?: number };
type Suggestion = { id: string; version: number; code: string; room: string; category: string; reason: string };

const originNames: Record<string, string> = { cita: 'Cita', consulta: 'Consulta', emergencia: 'Emergencia', ambulancia: 'Ambulancia', programada: 'Programada' };
const categoryNames: Record<string, string> = { vip: 'VIP', semiprivada: 'Semiprivada' };

/** W13 · admisiones activas con las acciones que cada permiso habilita: nueva admisión, cama, traslado, alta y salida. */
export function HospitalizationPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Admission[]>(api, '/admisiones', version, can(profile, 'admision.ver'));
  const [dialog, setDialog] = useState<{ kind: 'bed' | 'transfer' | 'discharge' | 'exit'; admission: Admission } | null>(null), [creating, setCreating] = useState(false);
  const [quick, consumeQuick] = useQuickAction();
  // `?accion=admision` (tableros): abre el ingreso guiado si el rol puede crearlo.
  useEffect(() => { if (quick === 'admision') { if (can(profile, 'admision.crear')) setCreating(true); consumeQuick(); } }, [quick]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setDialog(null), saved = () => { setDialog(null); data.refresh(); };
  return <>
    <Heading eyebrow="Hospital / Admisiones" title="Hospitalización" description="Admisiones activas, cama asignada, aislamiento, alta y salida física." actions={can(profile, 'admision.crear') && <button className="primary-button" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Ingresar paciente</button>} />
    <section className="data-workbench"><RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Admisiones activas</caption><thead><tr><th>Paciente</th><th>Origen</th><th>Categoría</th><th>Estado</th><th>Cama</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td data-label="Paciente"><strong>{row.patientName}</strong><small>{[row.isolation ? 'Aislamiento' : 'Sin aislamiento', row.unstable ? 'Inestable' : null, row.postSurgical ? 'Posquirúrgico' : null].filter(Boolean).join(' · ')}</small>{row.motive && <small>{row.motive}</small>}</td>
      <td data-label="Origen">{originNames[row.origin] ?? row.origin}</td>
      <td data-label="Categoría">{categoryNames[row.requestedCategory] ?? row.requestedCategory}</td>
      <td data-label="Estado"><Tag value={row.state} /></td>
      <td data-label="Cama">{row.bed || 'Sin cama'}</td>
      <td data-label="Acción"><div className="row-actions">
        {row.state === 'pendiente_cama' && can(profile, 'camas.asignar') && <button className="row-action" onClick={() => setDialog({ kind: 'bed', admission: row })}>Asignar cama <Icon name="arrow" size={16} /></button>}
        {row.state === 'hospitalizado' && row.bed && row.occupationId && row.requestedCategory !== 'vip' && can(profile, 'camas.trasladar') && <button className="row-action" onClick={() => setDialog({ kind: 'transfer', admission: row })}>Trasladar</button>}
        {row.state === 'hospitalizado' && can(profile, 'alta.firmar') && <button className="row-action" onClick={() => setDialog({ kind: 'discharge', admission: row })}>Firmar alta</button>}
        {row.state === 'alta_firmada' && can(profile, 'admision.registrar_salida') && <button className="row-action" onClick={() => setDialog({ kind: 'exit', admission: row })}>Registrar salida</button>}
      </div></td>
    </tr>)}</tbody></table> : <Empty title="No hay admisiones activas" description="Las nuevas admisiones aparecerán aquí cuando Recepción o Jefatura las registren." />}</RemoteState></section>
    {creating && <AdmissionStepper api={api} profile={profile} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); data.refresh(); }} />}
    {dialog?.kind === 'bed' && <BedSuggestionDialog api={api} admission={dialog.admission} version={version} onClose={close} onSaved={saved} />}
    {dialog?.kind === 'transfer' && <TransferDialog api={api} admission={dialog.admission} version={version} onClose={close} onSaved={saved} />}
    {dialog?.kind === 'discharge' && <DischargeDialog api={api} admission={dialog.admission} onClose={close} onSaved={saved} />}
    {dialog?.kind === 'exit' && <ExitDialog api={api} admission={dialog.admission} onClose={close} onSaved={saved} />}
  </>;
}

function BedSuggestionDialog({ api, admission, version, onClose, onSaved }: { api: Api; admission: Admission; version: number; onClose: () => void; onSaved: () => void }) {
  const data = useData<Suggestion[]>(api, `/admisiones/${admission.id}/sugerencias-cama`, version), [bedId, setBedId] = useState(''), [reason, setReason] = useState(''), action = useAction(api);
  const selected = data.data?.find(x => x.id === bedId), reasonInvalid = reason.trim().length > 0 && reason.trim().length < 10;
  // WEB-08: el motivo lo escribe la persona; si queda vacío no se envía uno inventado.
  async function assign() { if (selected && await action.run(`/admisiones/${admission.id}/cama`, { bedId: selected.id, version: selected.version, ...(reason.trim() ? { reason: reason.trim() } : {}) })) onSaved(); }
  return <Dialog title="Asignar cama" onClose={onClose} busy={action.busy}><RemoteState state={data}>{rows => rows.length ? <div className="module-form"><WriteError error={action.error} onReload={onSaved} /><p className="form-intro">Selecciona una cama libre. La API vuelve a comprobar el conflicto al confirmar.</p><fieldset className="choice-list"><legend>Camas sugeridas</legend>{rows.map(row => <label className="check-field" key={row.id}><input type="radio" name="bed" value={row.id} checked={bedId === row.id} onChange={() => setBedId(row.id)} /><span><strong>{row.code}</strong> <small>{row.room} · {categoryNames[row.category] ?? row.category} · {row.reason}</small></span></label>)}</fieldset><Field label="Motivo de la asignación (opcional)" value={reason} onChange={setReason} maxLength={500} hint="Si lo escribes, al menos 10 caracteres." aria-invalid={reasonInvalid || undefined} /><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="button" onClick={() => void assign()} disabled={action.busy || !selected || reasonInvalid}>Confirmar cama</button></div></div> : <Empty title="Sin camas sugeridas" description="Revisa la categoría, aislamiento o disponibilidad del edificio." />}</RemoteState></Dialog>;
}

/** W15 · traslado a otra cama libre (VIP no se traslada, D-037). API-05: se dirige a la ocupación activa y compara la versión de la admisión. */
function TransferDialog({ api, admission, version, onClose, onSaved }: { api: Api; admission: Admission; version: number; onClose: () => void; onSaved: () => void }) {
  const beds = useData<Bed[]>(api, '/camas', version), [bedId, setBedId] = useState(''), [reason, setReason] = useState(''), action = useAction(api);
  const free = (beds.data ?? []).filter(b => b.state === 'libre'), selected = free.find(b => b.id === bedId);
  async function save(event: FormEvent) { event.preventDefault(); if (selected && admission.occupationId && await action.run(`/ocupaciones/${admission.occupationId}/traslado`, { bedId: selected.id, version: admission.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Trasladar a otra cama" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{admission.patientName}</strong> · cama actual {admission.bed}. La cama de origen queda pendiente de limpieza.</p>
    <WriteError error={action.error} onReload={onSaved} />
    <RemoteState state={beds}>{() => free.length ? <fieldset className="choice-list"><legend>Camas libres</legend>{free.map(b => <label className="check-field" key={b.id}><input type="radio" name="transfer-bed" value={b.id} checked={bedId === b.id} onChange={() => setBedId(b.id)} /><span><strong>{b.code}</strong> <small>{b.room} · {categoryNames[b.category] ?? b.category}</small></span></label>)}</fieldset> : <Empty title="Sin camas libres" description="No hay camas disponibles para el traslado en este momento." />}</RemoteState>
    <Field label="Motivo del traslado" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Al menos 10 caracteres." />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Confirmar traslado" disabled={!selected || reason.trim().length < 10} /></div>
  </form></Dialog>;
}

function DischargeDialog({ api, admission, onClose, onSaved }: { api: Api; admission: Admission; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('medica'), [summary, setSummary] = useState(''), [consent, setConsent] = useState(false), action = useAction(api);
  const summaryInvalid = summary.trim().length > 0 && summary.trim().length < 10, voluntary = type === 'voluntaria';
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(`/admisiones/${admission.id}/alta`, { type, version: admission.version, ...(summary.trim() ? { summary: summary.trim() } : {}), ...(voluntary ? { voluntaryConsent: consent } : {}) })) onSaved(); }
  return <Dialog title="Firmar alta" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{admission.patientName}</strong>. Después del alta, Recepción o Enfermería registra la salida física.</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Select label="Tipo de alta" value={type} onChange={setType} required><option value="medica">Médica</option><option value="voluntaria">Voluntaria</option><option value="traslado">Traslado a otro centro</option><option value="defuncion">Defunción</option></Select>
    <label className="field"><span>Resumen de egreso</span><textarea value={summary} onChange={event => setSummary(event.target.value)} rows={4} maxLength={2000} aria-invalid={summaryInvalid || undefined} aria-describedby={`discharge-hint-${admission.id}`} /><small id={`discharge-hint-${admission.id}`}>Opcional; si lo escribes, al menos 10 caracteres.</small></label>
    {voluntary && <label className="check-field"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /> Se registró la constancia de alta voluntaria firmada por el paciente</label>}
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Firmar alta" disabled={summaryInvalid || (voluntary && !consent)} /></div>
  </form></Dialog>;
}

function ExitDialog({ api, admission, onClose, onSaved }: { api: Api; admission: Admission; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), action = useAction(api);
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(`/admisiones/${admission.id}/salida`, { version: admission.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Registrar salida física" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{admission.patientName}</strong> · cama {admission.bed || 'sin cama'}. La cama queda pendiente de limpieza.</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Motivo o detalle de la salida" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Al menos 10 caracteres." autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Registrar salida" disabled={reason.trim().length < 10} /></div>
  </form></Dialog>;
}
