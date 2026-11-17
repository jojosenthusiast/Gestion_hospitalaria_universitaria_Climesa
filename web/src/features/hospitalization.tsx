import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Icon } from '../components/ui';
import { can, type AccessProfile, type Api, type Bed } from '../lib/api';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, useAction, useData } from './common';
import { AdmissionStepper } from './hospitalization/admission-stepper';
import { ExitDialog, ReasonDialog, ReassignDoctorDialog, RequestDischargeDialog, categoryNames, relativeTime, type Admission } from './hospitalization/admission-actions';
import { spanishProblem } from './problems';
import { useQuickAction } from './personal/accion';
import './hospitalization/admission-actions.css';

type Suggestion = { id: string; version: number; code: string; room: string; category: string; reason: string };
/** Row actions the web offers, in display order; the first one present is the row's primary action. `firmar_alta` is MED-only in the apps (D-02). */
type RowAction = 'asignar_cama' | 'registrar_salida' | 'solicitar_alta' | 'trasladar' | 'autorizar' | 'reasignar_tratante' | 'revocar_alta' | 'cancelar' | 'anular';
const rowActions: { key: RowAction; label: string }[] = [
  { key: 'asignar_cama', label: 'Asignar cama' },
  { key: 'registrar_salida', label: 'Registrar salida' },
  { key: 'solicitar_alta', label: 'Solicitar alta al médico tratante' },
  { key: 'trasladar', label: 'Trasladar' },
  { key: 'autorizar', label: 'Autorizar excepción' },
  { key: 'reasignar_tratante', label: 'Reasignar médico tratante' },
  { key: 'revocar_alta', label: 'Revocar alta' },
  { key: 'cancelar', label: 'Cancelar admisión' },
  { key: 'anular', label: 'Anular ingreso por error' },
];

const originNames: Record<string, string> = { cita: 'Cita', consulta: 'Consulta', emergencia: 'Emergencia', ambulancia: 'Ambulancia', programada: 'Programada' };

/** Acciones de la fila según `allowedActions` de la API; el traslado además necesita la ocupación activa a la que se dirige. */
function availableActions(row: Admission) {
  const allowed = row.allowedActions ?? [];
  return rowActions.filter(a => allowed.includes(a.key) && (a.key !== 'trasladar' || !!row.occupationId));
}

/** D-02: la Web no firma el alta. Mientras el médico no la firma, la fila dice quién la firma y cuándo se pidió. */
function DischargeWait({ row }: { row: Admission }) {
  if (row.state !== 'hospitalizado' || row.allowedActions?.includes('firmar_alta')) return null;
  return <>
    <small className="admission-wait">{row.attendingDoctorHasAccount === false ? 'El médico tratante no tiene cuenta en la app; reasígnalo' : `Esperando alta médica: la firma ${row.attendingDoctorName || 'el médico tratante'} desde la app`}</small>
    {row.dischargeRequestedAt && <small>{`Alta solicitada ${relativeTime(row.dischargeRequestedAt)}`}</small>}
  </>;
}

/** W13 · admisiones activas; cada acción de la fila la habilita la API en `allowedActions`. */
export function HospitalizationPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Admission[]>(api, '/admisiones', version, can(profile, 'admision.ver'));
  const [dialog, setDialog] = useState<{ kind: RowAction; admission: Admission } | null>(null), [creating, setCreating] = useState(false);
  const [quick, consumeQuick] = useQuickAction();
  // `?accion=admision` (tableros): abre el ingreso guiado si el rol puede crearlo.
  useEffect(() => { if (quick === 'admision') { if (can(profile, 'admision.crear')) setCreating(true); consumeQuick(); } }, [quick]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => setDialog(null), saved = () => { setDialog(null); data.refresh(); };
  const props = dialog && { api, admission: dialog.admission, onClose: close, onSaved: saved };
  return <>
    <CompactHeader breadcrumb="Hospital / Admisiones" title="Hospitalización" actions={can(profile, 'admision.crear') && <button className="primary-button" onClick={() => setCreating(true)}><Icon name="plus" size={18}/>Ingresar paciente</button>}/>
    <section className="data-workbench"><RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Admisiones activas</caption><thead><tr><th>Paciente</th><th>Origen</th><th>Categoría</th><th>Estado</th><th>Cama</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>
      <td data-label="Paciente"><strong>{row.patientName}</strong><small>{[row.isolation ? 'Aislamiento' : 'Sin aislamiento', row.unstable ? 'Inestable' : null, row.postSurgical ? 'Posquirúrgico' : null].filter(Boolean).join(' · ')}</small>{row.motive && <small>{row.motive}</small>}</td>
      <td data-label="Origen">{originNames[row.origin] ?? row.origin}</td>
      <td data-label="Categoría">{categoryNames[row.requestedCategory] ?? row.requestedCategory}{row.authorized && <small>Excepción autorizada</small>}</td>
      <td data-label="Estado"><Tag value={row.state} /><DischargeWait row={row} /></td>
      <td data-label="Cama">{row.bed || 'Sin cama'}</td>
      <td data-label="Acción"><div className="row-actions">{availableActions(row).map((a, index) => <button key={a.key} className="row-action" onClick={() => setDialog({ kind: a.key, admission: row })}>{a.label}{index === 0 && <> <Icon name="arrow" size={16} /></>}</button>)}</div></td>
    </tr>)}</tbody></table> : <Empty title="No hay admisiones activas" description="Las nuevas admisiones aparecerán aquí cuando Recepción o Jefatura las registren." />}</RemoteState></section>
    {creating && <AdmissionStepper api={api} profile={profile} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); data.refresh(); }} />}
    {dialog?.kind === 'asignar_cama' && <BedSuggestionDialog api={api} admission={dialog.admission} version={version} onClose={close} onSaved={saved} />}
    {dialog?.kind === 'trasladar' && <TransferDialog api={api} admission={dialog.admission} version={version} onClose={close} onSaved={saved} />}
    {dialog?.kind === 'registrar_salida' && props && <ExitDialog {...props} />}
    {dialog?.kind === 'solicitar_alta' && props && <RequestDischargeDialog {...props} />}
    {dialog?.kind === 'reasignar_tratante' && props && <ReassignDoctorDialog {...props} />}
    {dialog?.kind === 'cancelar' && props && <ReasonDialog {...props} title="Cancelar admisión" path="cancelar" submitLabel="Cancelar admisión" explanation="La admisión pendiente de cama se cierra como cancelada y el paciente puede volver a ingresarse." />}
    {dialog?.kind === 'anular' && props && <ReasonDialog {...props} title="Anular ingreso por error" path="anular" submitLabel="Anular ingreso" explanation="Úsalo solo si el ingreso se registró por error: la admisión queda cancelada, se cierra la ocupación y la cama pasa a limpieza." />}
    {dialog?.kind === 'revocar_alta' && props && <ReasonDialog {...props} title="Revocar alta" path="revocar-alta" submitLabel="Revocar alta" explanation="El alta firmada se deja sin efecto y el paciente vuelve a estar hospitalizado. Solo es posible antes de la salida física." />}
    {dialog?.kind === 'autorizar' && props && <ReasonDialog {...props} title="Autorizar excepción" path="autorizar" submitLabel="Autorizar excepción" explanation={`Permite asignar una cama de otra categoría que la solicitada (${categoryNames[dialog.admission.requestedCategory] ?? dialog.admission.requestedCategory}).`} />}
  </>;
}

/** MA-HOS-06: con excepción autorizada (o si se pidió VIP) se puede buscar cama en la otra categoría; la API vuelve a validarlo. */
function categoryOptions(admission: Admission) {
  const other = admission.requestedCategory === 'vip' ? 'semiprivada' : 'vip';
  return admission.authorized || admission.requestedCategory === 'vip' ? [admission.requestedCategory, other] : [admission.requestedCategory];
}

/**
 * S13: the suggested beds show at once. With an authorized exception (or a VIP request) both categories are listed, the
 * requested one first, so nobody picks a category before seeing beds. The first suggestion comes chosen until the person picks.
 */
function BedSuggestionDialog({ api, admission, version, onClose, onSaved }: { api: Api; admission: Admission; version: number; onClose: () => void; onSaved: () => void }) {
  const options = categoryOptions(admission), both = options.length > 1;
  const path = (category: string) => `/admisiones/${admission.id}/sugerencias-cama${both ? `?category=${encodeURIComponent(category)}` : ''}`;
  const requested = useData<Suggestion[]>(api, path(options[0]), version), other = useData<Suggestion[]>(api, path(options[1] ?? options[0]), version, both);
  const [bedId, setBedId] = useState(''), [reason, setReason] = useState(''), action = useAction(api);
  const all = [...(requested.data ?? []), ...(both ? other.data ?? [] : [])];
  const selected = all.find(x => x.id === bedId), reasonInvalid = reason.trim().length > 0 && reason.trim().length < 10;
  const first = requested.data?.[0]?.id ?? (both ? other.data?.[0]?.id : undefined);
  // The first suggestion is chosen once, on the first load. A bed that later leaves the list (real time) leaves the choice
  // empty and «Confirmar cama» disabled: another bed is never chosen silently.
  const prefilled = useRef(false);
  useEffect(() => { if (!prefilled.current && first) { prefilled.current = true; setBedId(first); } }, [first]);
  // WEB-08: el motivo lo escribe la persona; si queda vacío no se envía uno inventado.
  async function assign() { if (selected && await action.run(`/admisiones/${admission.id}/cama`, { bedId: selected.id, version: selected.version, ...(reason.trim() ? { reason: reason.trim() } : {}) })) onSaved(); }
  const group = (category: string, rows: Suggestion[]) => <fieldset className="choice-list" key={category}><legend>{both ? `Camas sugeridas · ${categoryNames[category] ?? category}${category !== admission.requestedCategory ? ' (excepción)' : ''}` : 'Camas sugeridas'}</legend>
    {rows.length ? rows.map(row => <label className="check-field" key={row.id}><input type="radio" name="bed" value={row.id} checked={bedId === row.id} onChange={() => setBedId(row.id)} /><span><strong>{row.code}</strong> <small>{row.room} · {categoryNames[row.category] ?? row.category} · {row.reason}</small></span></label>) : <p className="muted">Sin camas libres de esta categoría.</p>}</fieldset>;
  return <Dialog title="Asignar cama" onClose={onClose} busy={action.busy}>
    <p className="form-intro">Paciente: <strong>{admission.patientName}</strong> · categoría solicitada {categoryNames[admission.requestedCategory] ?? admission.requestedCategory} · médico tratante {admission.attendingDoctorName || 'sin asignar'}.</p>
    <RemoteState state={requested}>{rows => rows.length || (both && other.data?.length) ? <div className="module-form"><WriteError error={spanishProblem(action.error)} onReload={onSaved} /><p className="form-intro">Te proponemos la primera cama libre; cambia si prefieres otra. Se vuelve a comprobar al confirmar.</p>{group(options[0], rows)}{both && (other.data ? group(options[1], other.data) : other.error ? <p className="muted">No pudimos cargar las camas de la otra categoría.</p> : null)}<Field label="Motivo de la asignación (opcional)" value={reason} onChange={setReason} maxLength={500} hint="Si lo escribes, al menos 10 caracteres." aria-invalid={reasonInvalid || undefined} /><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="button" onClick={() => void assign()} disabled={action.busy || !selected || reasonInvalid}>Confirmar cama</button></div></div> : both && !other.data && !other.error ? <p className="muted" role="status">Buscando camas…</p> : <Empty title="Sin camas sugeridas" description={both ? 'No hay camas libres en ninguna de las dos categorías. Revisa el aislamiento y la disponibilidad del edificio.' : 'Revisa la categoría, aislamiento o disponibilidad del edificio. Jefatura puede autorizar una excepción de categoría.'} />}</RemoteState>
  </Dialog>;
}

/** W15 · traslado a otra cama libre de la misma categoría (MA-HOS-01). API-05: se dirige a la ocupación activa y compara la versión de la admisión. */
function TransferDialog({ api, admission, version, onClose, onSaved }: { api: Api; admission: Admission; version: number; onClose: () => void; onSaved: () => void }) {
  const beds = useData<Bed[]>(api, '/camas', version), [bedId, setBedId] = useState(''), [reason, setReason] = useState(''), action = useAction(api);
  const free = (beds.data ?? []).filter(b => b.state === 'libre' && b.code !== admission.bed && (!admission.bedCategory || b.category === admission.bedCategory)), selected = free.find(b => b.id === bedId);
  async function save(event: FormEvent) { event.preventDefault(); if (selected && admission.occupationId && await action.run(`/ocupaciones/${admission.occupationId}/traslado`, { bedId: selected.id, version: admission.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Trasladar a otra cama" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{admission.patientName}</strong> · cama actual {admission.bed} · médico tratante {admission.attendingDoctorName || 'sin asignar'}. {admission.bedCategory ? `Solo camas libres de categoría ${categoryNames[admission.bedCategory] ?? admission.bedCategory}. ` : ''}La cama de origen queda pendiente de limpieza.</p>
    <WriteError error={spanishProblem(action.error)} onReload={onSaved} />
    <RemoteState state={beds}>{() => free.length ? <fieldset className="choice-list"><legend>Camas libres</legend>{free.map(b => <label className="check-field" key={b.id}><input type="radio" name="transfer-bed" value={b.id} checked={bedId === b.id} onChange={() => setBedId(b.id)} /><span><strong>{b.code}</strong> <small>{b.room} · {categoryNames[b.category] ?? b.category}</small></span></label>)}</fieldset> : <Empty title="Sin camas libres" description="No hay camas de la misma categoría disponibles para el traslado en este momento." />}</RemoteState>
    <Field label="Motivo del traslado" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Al menos 10 caracteres." />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Confirmar traslado" disabled={!selected || reason.trim().length < 10} /></div>
  </form></Dialog>;
}
