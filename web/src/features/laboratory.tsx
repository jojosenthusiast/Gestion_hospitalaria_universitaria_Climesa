import { useEffect, useState } from 'react';
import './laboratory.css';
import { Field, Icon } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { useQuickAction } from './personal/accion';

type LabResult = { value?: number | null; text?: string | null; mark: string; version: number };
type LabItem = { id: string; code: string; name: string; result?: LabResult | null };
type LabOrder = { id: string; patientName: string; priority: string; state: string; version: number; createdAt: string; sampleTakenAt?: string | null; completedAt?: string | null; reviewedAt?: string | null; items: LabItem[] };

/** Pasos que recorre una orden, en orden. Cada uno se marca solo con lo que la orden ya registró. */
export const LAB_STEPS = ['Solicitada', 'Muestra tomada', 'En proceso', 'Completada', 'Revisada por médico', 'Visible al paciente'] as const;

/** Qué pasos ya ocurrieron y cuál es el actual (`current` = índice del primer paso pendiente; -1 si terminó o se canceló). */
export function labProgress(order: LabOrder) {
  const captured = order.items.filter(i => i.result).length, reviewed = !!order.reviewedAt;
  const done = [true, order.state !== 'pendiente', order.state === 'completado' || captured > 0, order.state === 'completado', reviewed, reviewed];
  return { done, current: order.state === 'cancelado' ? -1 : done.indexOf(false), captured, total: order.items.length };
}

/** Quién actúa ahora y qué debe hacer; el texto cambia según los permisos de quien mira. */
export function nextActor(order: LabOrder): { who: string; what: string } | null {
  const { captured, total } = labProgress(order);
  if (order.state === 'cancelado') return null;
  if (order.state === 'pendiente') return { who: 'Laboratorio', what: 'toma la muestra confirmando la identidad del paciente (expediente y nombre completo).' };
  if (order.state === 'en_proceso') return captured < total
    ? { who: 'Laboratorio', what: `captura el valor de cada examen: faltan ${total - captured} de ${total}.` }
    : { who: 'Laboratorio', what: 'ya están todos los valores; completa la orden.' };
  if (!order.reviewedAt) return { who: 'Medicina', what: 'revisa y libera los resultados; hasta entonces el paciente ve el estado pero no los valores.' };
  return null;
}

const stageLabel = (order: LabOrder, canReview: boolean) => {
  if (order.state === 'completado') return order.reviewedAt ? 'Revisada · visible al paciente' : canReview ? 'Pendiente de revisar' : 'Completada · falta revisión médica';
  if (order.state === 'pendiente') return 'Pendiente';
  return undefined;
};

export function LaboratoryPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<LabOrder[]>(api, '/laboratorio/ordenes', version, can(profile, 'laboratorio.ver_cola') || can(profile, 'resultados.ver'));
  const [sampleFor, setSampleFor] = useState<LabOrder | null>(null);
  const [quick, consumeQuick] = useQuickAction(), isLab = can(profile, 'laboratorio.procesar');
  const rows = data.data ?? [];
  // `?accion=muestra`: abre la toma de muestra de la primera orden pendiente (la más antigua de la cola).
  useEffect(() => {
    if (!quick || !data.data) return;
    if (quick === 'muestra' && isLab) { const first = [...data.data].reverse().find(o => o.state === 'pendiente'); if (first) setSampleFor(first); }
    consumeQuick();
  }, [quick, data.data, isLab, consumeQuick]);
  return <>
    <Heading eyebrow="Atención / Diagnóstico" title="Laboratorio" description="Cada orden avanza por pasos: Medicina la solicita, Laboratorio toma la muestra y captura los valores, Medicina revisa y libera, y recién entonces el paciente ve sus resultados." />
    <section className="data-workbench"><RemoteState state={data}>{() => rows.length
      ? <table className="record-table"><caption className="sr-only">Órdenes de laboratorio</caption><thead><tr><th>Paciente</th><th>Prioridad</th><th>Estado</th><th>Exámenes</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <LabOrderRow key={row.id} api={api} profile={profile} order={row} onChanged={data.refresh} onSample={() => setSampleFor(row)} />)}</tbody></table>
      : <Empty title="No hay órdenes de laboratorio" description="Las órdenes aparecerán cuando Medicina solicite estudios para una consulta." />}</RemoteState></section>
    {sampleFor && <SampleDialog api={api} order={sampleFor} onClose={() => setSampleFor(null)} onSaved={() => { setSampleFor(null); data.refresh(); }} />}
  </>;
}

/** Avance de una orden: seis pasos con el actual resaltado (diseño: pasos tipo píldora hecho/ahora). */
function LabStepper({ order }: { order: LabOrder }) {
  const { done, current } = labProgress(order);
  if (order.state === 'cancelado') return <p className="lab-cancelled">Orden cancelada: no continúa el flujo.</p>;
  return <ol className="lab-steps" aria-label={`Avance de la orden de ${order.patientName}`}>{LAB_STEPS.map((label, i) => <li key={label} className={done[i] ? 'is-done' : i === current ? 'is-now' : ''} aria-current={i === current ? 'step' : undefined}>{done[i] ? <Icon name="check" size={14} /> : <span className="lab-step-n" aria-hidden="true">{i + 1}</span>}<span>{label}{done[i] ? '' : i === current ? ' · ahora' : ''}</span></li>)}</ol>;
}

function LabOrderRow({ api, profile, order, onChanged, onSample }: { api: Api; profile: AccessProfile; order: LabOrder; onChanged: () => void; onSample: () => void }) {
  const action = useAction(api);
  const [open, setOpen] = useState(false), [cancelOpen, setCancelOpen] = useState(false);
  const isLab = can(profile, 'laboratorio.procesar'), canComplete = can(profile, 'laboratorio.validar') || isLab, canReview = can(profile, 'laboratorio.revisar');
  const { captured, total } = labProgress(order), ready = total > 0 && captured === total, next = nextActor(order);
  async function transition(path: string, body: unknown) { if (await action.run(path, body)) onChanged(); }
  return <>
    <tr><td data-label="Paciente"><strong>{order.patientName}</strong><small>Solicitada {formatDateTime(order.createdAt)}</small></td><td data-label="Prioridad">{order.priority === 'urgente' ? 'Urgente' : 'Rutina'}</td><td data-label="Estado"><Tag value={order.state} label={stageLabel(order, canReview)} />{next && <small className="lab-next"><strong>Ahora: {next.who}</strong> {next.what}</small>}</td><td data-label="Exámenes">{order.items.map(item => <span className="table-chip" key={item.id}>{item.code} · {item.name}</span>)}</td><td data-label="Acción"><div className="row-actions">
      <button className="row-action" onClick={() => setOpen(value => !value)}>{open ? 'Ocultar' : 'Gestionar'}</button>
      {isLab && order.state === 'pendiente' && <button className="row-action" onClick={onSample}>Tomar muestra</button>}
      {canComplete && order.state === 'en_proceso' && <button className="row-action" disabled={!ready} title={ready ? undefined : `Faltan ${total - captured} valores para completar`} onClick={() => void transition(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version })}>Completar</button>}
      {canReview && order.state === 'completado' && !order.reviewedAt && <button className="row-action" onClick={() => void transition(`/laboratorio/ordenes/${order.id}/revisar`, { version: order.version })}>Revisar y liberar</button>}
      {can(profile, 'laboratorio.cancelar') && (order.state === 'pendiente' || order.state === 'en_proceso') && <button className="row-action" onClick={() => setCancelOpen(true)}>Cancelar orden</button>}
    </div></td></tr>
    <tr className="lab-steps-row"><td colSpan={5}><LabStepper order={order} /></td></tr>
    {open && <tr><td colSpan={5}><WriteError error={action.error} onReload={onChanged} reloadLabel="Recargar la orden" />
      {order.state === 'en_proceso' && isLab && <p className={`lab-requirement ${ready ? 'is-ready' : ''}`} role="status">Para completar la orden hace falta el valor de todos los exámenes: {captured} de {total} capturados{ready ? ' · lista para completar' : ''}.</p>}
      <div className="lab-order-detail">{order.items.map(item => <LabItemRow key={item.id} api={api} profile={profile} order={order} item={item} onChanged={onChanged} />)}</div></td></tr>}
    {cancelOpen && <CancelDialog api={api} order={order} onClose={() => setCancelOpen(false)} onSaved={() => { setCancelOpen(false); onChanged(); }} />}
  </>;
}

function CancelDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), action = useAction(api);
  async function save() { if (await action.run(`/laboratorio/ordenes/${order.id}/cancelar`, { version: order.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Cancelar orden de laboratorio" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">Solo se cancela una orden pendiente o en proceso. La orden de {order.patientName} se conserva con tu motivo y deja de aparecer en la cola.</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Motivo de la cancelación" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus />
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={reason.trim().length < 10} label="Cancelar orden" /></div>
  </form></Dialog>;
}

function SampleDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const [expediente, setExpediente] = useState(''), [nombreCompleto, setNombreCompleto] = useState('');
  const action = useAction(api);
  async function save() { if (await action.run(`/laboratorio/ordenes/${order.id}/muestra`, { version: order.version, expediente: expediente.trim(), nombreCompleto: nombreCompleto.trim() })) onSaved(); }
  return <Dialog title="Confirmar identidad para toma de muestra" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}><p className="form-intro">Confirma dos datos independientes antes de tomar la muestra: expediente y nombre completo.</p><WriteError error={action.error} onReload={onSaved} /><Field label="Número de expediente" value={expediente} onChange={setExpediente} required autoFocus /><Field label="Nombre completo" value={nombreCompleto} onChange={setNombreCompleto} required /><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={action.busy || !expediente.trim() || !nombreCompleto.trim()}>Confirmar identidad</button></div></form></Dialog>;
}

function LabItemRow({ api, profile, order, item, onChanged }: { api: Api; profile: AccessProfile; order: LabOrder; item: LabItem; onChanged: () => void }) {
  const action = useAction(api);
  const [value, setValue] = useState(item.result?.value?.toString() ?? ''), [text, setText] = useState(item.result?.text ?? ''), [reason, setReason] = useState('');
  if (!can(profile, 'laboratorio.procesar')) return <div className="lab-result-row"><strong>{item.code} · {item.name}</strong>{item.result ? <span><Tag value={item.result.mark} /> {item.result.text ?? item.result.value}</span> : <span>Resultado pendiente</span>}</div>;
  async function save() { const body = { orderItemId: item.id, ...(value.trim() ? { value: Number(value) } : { text: text.trim() }), ...(item.result ? { reason: reason.trim() } : {}) }; if (await action.run(`/laboratorio/ordenes/${order.id}/resultados`, body)) onChanged(); }
  return <div className="lab-result-row"><strong>{item.code} · {item.name}</strong> {item.result ? <Tag value="completado" label="Valor capturado" /> : <Tag value="pendiente" label="Falta el valor" />}<p>La marca se calcula con el rango vigente; no se selecciona manualmente.</p><div className="form-grid"><Field label="Valor" type="number" value={value} onChange={setValue} /><Field label="Texto" value={text} onChange={setText} />{item.result && <Field label="Motivo de corrección" value={reason} onChange={setReason} />}</div><button className="secondary-button" type="button" onClick={() => void save()} disabled={action.busy || (!value.trim() && !text.trim()) || (!!item.result && !reason.trim())}>Guardar resultado</button><WriteError error={action.error} onReload={onChanged} reloadLabel="Recargar la orden" /></div>;
}
