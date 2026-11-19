import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Field, Icon } from '../components/ui';
import { can, type AccessProfile, type Api, type Bed } from '../lib/api';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, useAction, useData } from './common';
import { AdmissionStepper } from './hospitalization/admission-stepper';
import { ExitDialog, ReasonDialog, ReassignDoctorDialog, RequestDischargeDialog, categoryNames, relativeTime, type Admission } from './hospitalization/admission-actions';
import { spanishProblem } from './problems';
import { useQuickAction } from './personal/accion';
import { readHashParams, writeHashParams } from '../lib/hash-params';
import './hospitalization/admission-actions.css';
import { RowMenu } from '../components/row-menu';
import { CrudActions, CrudButton } from '../components/system';
import './hospitalization/admission-table.css';
import { useFold } from '../components/fold';

const ADMISSIONS_SHOWN = 20;
const urgency = (a: Admission) => a.state === 'pendiente_cama' ? 0 : a.unstable ? 1 : 2;
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

/** Destructive row actions: they close the admission, so they take the red CRUD «deactivate» button (S0). */
const DESTRUCTIVE: RowAction[] = ['cancelar', 'anular'];
const labelOf = (key: RowAction) => rowActions.find(a => a.key === key)!.label;
const lacksAccount = (row: Admission) => row.attendingDoctorHasAccount === false && (row.state === 'pendiente_cama' || row.state === 'hospitalizado');

/**
 * Owner obs. 21: one primary next step per row, the rest under «Más acciones». Changing the attending doctor is an edit
 * (blue pencil) and cancel/annul are destructive (red trash), so the cell never stacks long links. When the attending
 * doctor has no app account, reassigning is the next step, so it becomes the row's primary action.
 */
export function admissionRowPlan(row: Admission) {
  const available = availableActions(row).map(a => a.key);
  const destructive = available.filter(k => DESTRUCTIVE.includes(k));
  const reassign = available.includes('reasignar_tratante');
  const flow = available.filter(k => !DESTRUCTIVE.includes(k) && k !== 'reasignar_tratante');
  const primary: RowAction | null = reassign && (lacksAccount(row) || !flow.length) ? 'reasignar_tratante' : flow[0] ?? null;
  return { primary, more: flow.filter(k => k !== primary), edit: reassign && primary !== 'reasignar_tratante', destructive };
}

function AdmissionRowActions({ row, onPick }: { row: Admission; onPick: (kind: RowAction) => void }) {
  const plan = admissionRowPlan(row);
  const menu = [plan.primary, ...plan.more].filter((k): k is RowAction => !!k).map(key => ({ key, label: labelOf(key), onClick: () => onPick(key) }));
  if (!menu.length && !plan.edit && !plan.destructive.length) return null;
  return <div className="admission-row-actions">
    <RowMenu label={row.patientName} actions={menu} />
    {(plan.edit || plan.destructive.length > 0) && <CrudActions>
      {plan.edit && <CrudButton kind="edit" iconOnly label={labelOf('reasignar_tratante')} onClick={() => onPick('reasignar_tratante')} />}
      {plan.destructive.map(key => <CrudButton key={key} kind="deactivate" iconOnly label={labelOf(key)} onClick={() => onPick(key)} />)}
    </CrudActions>}
  </div>;
}

/**
 * D-02: la Web no firma el alta. Mientras el médico no la firma, la fila dice quién la firma y cuándo se pidió.
 * Obs. 21: a doctor without an app account can never sign, so the row shows it as a warning and says what to do.
 */
function DischargeWait({ row }: { row: Admission }) {
  if (lacksAccount(row)) return <span className="admission-no-account" role="note">
    <strong><Icon name="alert" size={16} />Médico tratante sin cuenta en la app</strong>
    <small>{`${row.attendingDoctorName ? `${row.attendingDoctorName} no` : 'No'} podrá firmar el alta. ${row.allowedActions?.includes('reasignar_tratante') ? 'Reasígnalo a un médico con cuenta.' : 'Pide a Jefatura de Operaciones que lo reasigne.'}`}</small>
  </span>;
  if (row.state !== 'hospitalizado' || row.allowedActions?.includes('firmar_alta')) return null;
  return <>
    <small className="admission-wait">{row.dischargeRequestedAt ? `Esperando alta médica: la firma ${row.attendingDoctorName || 'el médico tratante'} desde la app` : `El alta la firma ${row.attendingDoctorName || 'el médico tratante'} desde la app`}</small>
    {row.dischargeRequestedAt && <small>{`Alta solicitada ${relativeTime(row.dischargeRequestedAt)}`}</small>}
  </>;
}

/** W13 · admisiones activas; cada acción de la fila la habilita la API en `allowedActions`. */
export function HospitalizationPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Admission[]>(api, '/admisiones', version, can(profile, 'admision.ver'));
  const [dialog, setDialog] = useState<{ kind: RowAction; admission: Admission } | null>(null), [creating, setCreating] = useState(false);
  const [quick, consumeQuick] = useQuickAction();
  // `?accion=admision` (tableros): abre el ingreso guiado si el rol puede crearlo.
  // R7 U1: from the patient record, `&paciente=<id>` opens it with that patient chosen.
  const [prefill, setPrefill] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    if (quick !== 'admision') return;
    const id = readHashParams().get('paciente'); writeHashParams({ paciente: null });
    if (can(profile, 'admision.crear')) {
      if (id) void api.request<{ id: string; fullName: string }>(`/pacientes/${id}`).then(p => setPrefill({ id: p.id, label: p.fullName })).catch(() => undefined).finally(() => setCreating(true));
      else setCreating(true);
    }
    consumeQuick();
  }, [quick]); // eslint-disable-line react-hooks/exhaustive-deps
  // R7 G3: `?ingresar=<id>` (Inicio, «Ingresos indicados») opens the bed choice for that admission directly.
  const [target] = useState(() => readHashParams().get('ingresar'));
  useEffect(() => {
    if (!target || !data.data) return;
    const row = data.data.find(a => a.id === target && a.allowedActions?.includes('asignar_cama'));
    if (row) setDialog({ kind: 'asignar_cama', admission: row });
    writeHashParams({ ingresar: null });
  }, [target, data.data]);
  const [done, setDone] = useState('');
  const close = () => setDialog(null), saved = (message = '') => { setDialog(null); setDone(message); data.refresh(); };
  const indicatedRows = (data.data ?? []).filter(a => a.state === 'pendiente_cama' && a.origin === 'consulta' && a.allowedActions?.includes('asignar_cama'));
  const props = dialog && { api, admission: dialog.admission, onClose: close, onSaved: saved };
  // What needs a hand first: waiting for a bed, then unstable patients; the rest keeps the API order and folds.
  const ordered = (data.data ?? []).map((row, index) => ({ row, index })).sort((a, b) => urgency(a.row) - urgency(b.row) || a.index - b.index).map(x => x.row);
  const fold = useFold(ordered, ADMISSIONS_SHOWN);
  return <>
    <CompactHeader breadcrumb="Hospital / Admisiones" title="Hospitalización" actions={can(profile, 'admision.crear') && <button className="primary-button" onClick={() => setCreating(true)}><Icon name="plus" size={18}/>Ingresar paciente</button>}/>
    {done && <p className="admission-done" role="status"><Icon name="check" size={18} />{done}</p>}
    {indicatedRows.length > 0 && <section className="admission-indicated" aria-label="Ingresos indicados">
      <h2>Ingresos indicados <span className="count-chip">{indicatedRows.length}</span></h2>
      <ul>{indicatedRows.map(row => <li key={row.id}>
        <div><strong>{row.patientName}</strong><small>{[row.attendingDoctorName ? `Indicado por ${row.attendingDoctorName}` : null, categoryNames[row.requestedCategory] ?? row.requestedCategory, row.isolation ? 'Aislamiento' : null, row.unstable ? 'Inestable' : null].filter(Boolean).join(' · ')}</small>{row.motive && <small>{row.motive}</small>}</div>
        <button type="button" className="secondary-button" onClick={() => setDialog({ kind: 'asignar_cama', admission: row })}>Ingresar</button>
      </li>)}</ul>
    </section>}
    <section className="data-workbench admission-workbench"><RemoteState state={data}>{rows => rows.length ? <><table className="record-table admission-table"><caption className="sr-only">Admisiones activas</caption><thead><tr><th>Paciente</th><th>Origen</th><th>Categoría</th><th>Estado</th><th>Cama</th><th>Acción</th></tr></thead><tbody>{fold.shown.map(row => <tr key={row.id}>
      <td data-label="Paciente" className="cell-person"><strong>{row.patientName}</strong><small>{[row.isolation ? 'Aislamiento' : null, row.unstable ? 'Inestable' : null, row.postSurgical ? 'Posquirúrgico' : null].filter(Boolean).join(' · ')}</small>{row.motive && <small>{row.motive}</small>}</td>
      <td data-label="Origen">{originNames[row.origin] ?? row.origin}</td>
      <td data-label="Categoría">{categoryNames[row.requestedCategory] ?? row.requestedCategory}{row.authorized && <small>Excepción autorizada</small>}</td>
      <td data-label="Estado"><Tag value={row.state} /><DischargeWait row={row} /></td>
      <td data-label="Cama">{row.bed ? <span className="nowrap-code">{row.bed}</span> : 'Sin cama'}</td>
      <td data-label="Acción" className="cell-actions"><AdmissionRowActions row={row} onPick={kind => setDialog({ kind, admission: row })} /></td>
    </tr>)}</tbody></table>{fold.more}</> : <Empty title="No hay admisiones activas" description="Las nuevas admisiones aparecerán aquí cuando Recepción o Jefatura las registren." />}</RemoteState></section>
    {creating && <AdmissionStepper api={api} profile={profile} patient={prefill} onClose={() => { setCreating(false); setPrefill(null); }} onSaved={() => { setCreating(false); setPrefill(null); setDone('Ingreso registrado; aparece en la lista.'); data.refresh(); }} />}
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

/** R3: a bed list shows the first BED_FOLD choices in the order they come (best first) and folds the rest behind «Ver N más». */
const BED_FOLD = 3;
function BedRadios<T extends { id: string; code: string }>({ rows, name, bedId, onPick, detail }: { rows: readonly T[]; name: string; bedId: string; onPick: (id: string) => void; detail: (row: T) => string }) {
  const { shown, more } = useFold(rows, BED_FOLD);
  return <>{shown.map(row => <label className="check-field" key={row.id}><input type="radio" name={name} value={row.id} checked={bedId === row.id} onChange={() => onPick(row.id)} /><span><strong>{row.code}</strong> <small>{detail(row)}</small></span></label>)}{more}</>;
}

/**
 * S13: the suggested beds show at once. With an authorized exception (or a VIP request) both categories are listed, the
 * requested one first, so nobody picks a category before seeing beds. The first suggestion comes chosen until the person picks.
 */
function BedSuggestionDialog({ api, admission, version, onClose, onSaved }: { api: Api; admission: Admission; version: number; onClose: () => void; onSaved: (message?: string) => void }) {
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
  async function assign() { if (selected && await action.run(`/admisiones/${admission.id}/cama`, { bedId: selected.id, version: selected.version, ...(reason.trim() ? { reason: reason.trim() } : {}) })) onSaved(`${admission.patientName}: ingresada · Cama ${selected.code}.`); }
  const group = (category: string, rows: Suggestion[]) => <fieldset className="choice-list" key={category}><legend>{both ? `Camas sugeridas · ${categoryNames[category] ?? category}${category !== admission.requestedCategory ? ' (excepción)' : ''}` : 'Camas sugeridas'}</legend>
    {rows.length ? <BedRadios rows={rows} name="bed" bedId={bedId} onPick={setBedId} detail={row => `${row.room} · ${categoryNames[row.category] ?? row.category} · ${row.reason}`} /> : <p className="muted">Sin camas libres de esta categoría.</p>}</fieldset>;
  const summary = [['Paciente', admission.patientName], ['Origen', originNames[admission.origin] ?? admission.origin], ['Médico tratante', admission.attendingDoctorName || 'Sin asignar'], ['Categoría', categoryNames[admission.requestedCategory] ?? admission.requestedCategory], ['Aislamiento', admission.isolation ? 'Sí' : 'No'], ...(admission.motive ? [['Motivo', admission.motive]] : [])];
  return <Dialog title={admission.origin === 'consulta' ? 'Ingresar paciente indicado' : 'Asignar cama'} onClose={onClose} busy={action.busy}>
    <dl className="detail-grid admission-summary">{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <RemoteState state={requested}>{rows => rows.length || (both && other.data?.length) ? <div className="module-form"><WriteError error={spanishProblem(action.error)} onReload={onSaved} /><p className="form-intro">Te proponemos la primera cama libre; cambia si prefieres otra. Se vuelve a comprobar al confirmar.</p>{group(options[0], rows)}{both && (other.data ? group(options[1], other.data) : other.error ? <p className="muted">No pudimos cargar las camas de la otra categoría.</p> : null)}<Field label="Motivo de la asignación (opcional)" value={reason} onChange={setReason} maxLength={500} hint="Si lo escribes, al menos 10 caracteres." aria-invalid={reasonInvalid || undefined} /><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><button className="primary-button" type="button" onClick={() => void assign()} disabled={action.busy || !selected || reasonInvalid}>Confirmar cama</button></div></div> : both && !other.data && !other.error ? <p className="muted" role="status">Buscando camas…</p> : <div className="admission-no-beds"><Empty title="No hay camas compatibles" description={both ? 'No hay camas libres en ninguna de las dos categorías. Revisa el aislamiento y la disponibilidad del edificio.' : `Ninguna cama libre cumple ${admission.isolation ? 'aislamiento y ' : ''}la categoría ${categoryNames[admission.requestedCategory] ?? admission.requestedCategory}. Jefatura puede autorizar una excepción de categoría.`} /><div className="dialog-actions"><a className="secondary-button" href="#/camas">Ver tablero</a><button type="button" className="primary-button" onClick={() => onSaved(admission.origin === 'consulta' ? `${admission.patientName} queda pendiente de cama en «Ingresos indicados»; asígnale una desde ahí cuando se libere.` : `${admission.patientName} queda ingresada sin cama; aparece en «Admisiones sin cama» de Inicio.`)}>Ingresar sin cama</button></div></div>}</RemoteState>
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
    <RemoteState state={beds}>{() => free.length ? <fieldset className="choice-list"><legend>Camas libres</legend><BedRadios rows={free} name="transfer-bed" bedId={bedId} onPick={setBedId} detail={b => `${b.room} · ${categoryNames[b.category] ?? b.category}`} /></fieldset> : <Empty title="Sin camas libres" description="No hay camas de la misma categoría disponibles para el traslado en este momento." />}</RemoteState>
    <Field label="Motivo del traslado" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Al menos 10 caracteres." />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Confirmar traslado" disabled={!selected || reason.trim().length < 10} /></div>
  </form></Dialog>;
}
