import { useEffect, useState } from 'react';
import './laboratory.css';
import { Field, Icon } from '../components/ui';
import { ExportMenu } from '../components/export-menu';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { useQuickAction } from './personal/accion';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { STAGE_LABEL, STAGE_TONE, elapsedMinutes, formatElapsed, isCritical, slaLevel, sortOrders, stageOf, type Stage, type WorkSort } from './listas/lab-worklist';
import './listas/lists.css';

type LabResult = { value?: number | null; text?: string | null; mark: string; version: number };
const sexShort: Record<string, string> = { femenino: 'F', masculino: 'M' };
type LabItem = { id: string; code: string; name: string; result?: LabResult | null };
type LabOrder = { id: string; patientName: string; patientRecord?: string | null; patientSex?: string | null; patientAge?: number | null; patientAgeRange?: string | null; doctorName?: string | null; priority: string; state: string; version: number; createdAt: string; sampleTakenAt?: string | null; completedAt?: string | null; reviewedAt?: string | null; items: LabItem[] };

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

/** «34 años · F», o el decenio si solo se ve el rango; nada si el rol no ve la edad. */
export function patientLine(order: Pick<LabOrder, 'patientRecord' | 'patientSex' | 'patientAge' | 'patientAgeRange'>) {
  const age = typeof order.patientAge === 'number' ? `${order.patientAge} años` : order.patientAgeRange ? `${order.patientAgeRange} años` : null;
  return [order.patientRecord ? `Exp. ${order.patientRecord}` : null, age, order.patientSex ? sexShort[order.patientSex] : null].filter(Boolean).join(' · ');
}

type StageFilter = 'todas' | Stage;
const STAGE_FILTERS: Stage[] = ['pendiente', 'en_proceso', 'por_revisar', 'liberada'];
const SORT_NAMES: Record<WorkSort, string> = { prioridad: 'Prioridad y antigüedad', antiguas: 'Más antiguas primero', paciente: 'Paciente (A-Z)' };

export function LaboratoryPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<LabOrder[]>(api, '/laboratorio/ordenes', version, can(profile, 'laboratorio.ver_cola') || can(profile, 'resultados.ver'));
  const [sampleFor, setSampleFor] = useState<LabOrder | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [stage, setStage] = useState<StageFilter>('todas'), [urgentOnly, setUrgentOnly] = useState(false), [criticalOnly, setCriticalOnly] = useState(false), [sort, setSort] = useState<WorkSort>('prioridad');
  const [quick, consumeQuick] = useQuickAction(), isLab = can(profile, 'laboratorio.procesar'), canReview = can(profile, 'laboratorio.revisar');
  const all = data.data ?? [];
  // El reloj se lee al pintar: cada evento en vivo vuelve a pintar la lista, así no hace falta ningún temporizador.
  const now = Date.now();
  const stageCount = (value: Stage) => all.filter(order => stageOf(order) === value).length;
  const rows = sortOrders(all.filter(order => (stage === 'todas' || stageOf(order) === stage) && (!urgentOnly || order.priority === 'urgente') && (!criticalOnly || isCritical(order))
    && matches(query, order.patientName, order.patientRecord, order.doctorName, ...order.items.flatMap(item => [item.code, item.name]))), sort);
  const selected = rows.find(order => order.id === selectedId) ?? rows[0] ?? null;
  const filters = [
    ...(stage !== 'todas' ? [{ key: 'etapa', label: STAGE_LABEL[stage], remove: () => setStage('todas') }] : []),
    ...(urgentOnly ? [{ key: 'urgentes', label: 'Solo urgentes', remove: () => setUrgentOnly(false) }] : []),
    ...(criticalOnly ? [{ key: 'criticos', label: 'Con valores críticos', remove: () => setCriticalOnly(false) }] : []),
    ...(query.trim() ? [{ key: 'texto', label: `«${query.trim()}»`, remove: () => setQuery('') }] : []),
  ];
  const clear = () => { setStage('todas'); setUrgentOnly(false); setCriticalOnly(false); setQuery(''); };
  // `?accion=muestra`: abre la toma de muestra de la primera orden pendiente (la más antigua de la cola).
  useEffect(() => {
    if (!quick || !data.data) return;
    if (quick === 'muestra' && isLab) { const first = [...data.data].reverse().find(o => o.state === 'pendiente'); if (first) { setSelectedId(first.id); setSampleFor(first); } }
    consumeQuick();
  }, [quick, data.data, isLab, consumeQuick]);
  const exportTable = () => ({
    filename: 'laboratorio-ordenes', title: 'Órdenes de laboratorio', subtitle: `${rows.length} órdenes`,
    columns: ['Prioridad', 'Paciente', 'Expediente', 'Edad', 'Sexo', 'Exámenes', 'Médico', 'Solicitada', 'Espera', 'Etapa', 'Valores críticos'],
    rows: rows.map(o => [o.priority === 'urgente' ? 'Urgente' : 'Rutina', o.patientName, o.patientRecord ?? '', o.patientAge ?? o.patientAgeRange ?? '', o.patientSex ? sexShort[o.patientSex] ?? '' : '', o.items.map(i => i.name).join('; '), o.doctorName ?? '', formatDateTime(o.createdAt), formatElapsed(elapsedMinutes(o, now)), STAGE_LABEL[stageOf(o)], isCritical(o) ? 'Sí' : 'No']),
  });
  return <>
    <Heading eyebrow="Atención / Diagnóstico" title="Laboratorio" description="Cada orden avanza por pasos: Medicina la solicita, Laboratorio toma la muestra y captura los valores, Medicina revisa y libera, y recién entonces el paciente ve sus resultados." />
    <section className="data-workbench" aria-label="Lista de trabajo de laboratorio"><RemoteState state={data}>{() => <>
      <ListToolbar trailing={<><label className="cl-sort">Ordenar<select value={sort} onChange={event => setSort(event.target.value as WorkSort)}>{(Object.keys(SORT_NAMES) as WorkSort[]).map(key => <option key={key} value={key}>{SORT_NAMES[key]}</option>)}</select></label><ExportMenu table={exportTable} disabled={!rows.length} /></>}>
        <LiveSearch label="Buscar órdenes" placeholder="Paciente, expediente, examen o médico" value={query} onChange={setQuery} />
      </ListToolbar>
      <div className="cl-filter-row"><span className="cl-filter-label">Etapa</span>
        <ChipGroup label="Etapa de la orden" value={stage} onChange={setStage} options={[{ value: 'todas', label: 'Todas', count: all.length }, ...STAGE_FILTERS.map(value => ({ value, label: STAGE_LABEL[value], count: stageCount(value) }))]} />
        <span className="cl-filter-label">Prioridad</span>
        <ChipGroup label="Prioridad" value={urgentOnly ? 'urgente' : 'todas'} onChange={value => setUrgentOnly(value === 'urgente')} options={[{ value: 'todas', label: 'Todas' }, { value: 'urgente', label: 'Urgentes', count: all.filter(o => o.priority === 'urgente').length }]} />
        <ChipGroup label="Valores críticos" value={criticalOnly ? 'si' : 'no'} onChange={value => setCriticalOnly(value === 'si')} options={[{ value: 'no', label: 'Todos los valores' }, { value: 'si', label: 'Con valores críticos', count: all.filter(isCritical).length }]} />
      </div>
      <ActiveFilters filters={filters} onClear={clear} />
      {rows.length ? <>
        <p className="cl-count" aria-live="polite">{rows.length} de {all.length} órdenes · las urgentes y las que más esperan aparecen primero.</p>
        <div className="cl-master-detail">
          <ul className="cl-master" aria-label="Órdenes de laboratorio">{rows.map(order => <LabWorkRow key={order.id} order={order} now={now} current={order.id === selected?.id} onSelect={() => setSelectedId(order.id)} />)}</ul>
          {selected && <LabDetail key={selected.id} api={api} profile={profile} order={selected} canReview={canReview} onChanged={data.refresh} onSample={() => setSampleFor(selected)} />}
        </div></>
        : all.length ? <Empty title="Ninguna orden coincide con los filtros" description="Quita algún filtro o cambia lo que buscas." />
          : <Empty title="No hay órdenes de laboratorio" description="Las órdenes aparecerán cuando Medicina solicite estudios para una consulta." />}
    </>}</RemoteState></section>
    {sampleFor && <SampleDialog api={api} order={sampleFor} onClose={() => setSampleFor(null)} onSaved={() => { setSampleFor(null); data.refresh(); }} />}
  </>;
}

function StageChip({ stage }: { stage: Stage }) { return <span className={`cl-stage tone-${STAGE_TONE[stage]}`}>{STAGE_LABEL[stage]}</span>; }

/** Una fila de la lista: prioridad, paciente, exámenes, tiempo con su color de meta y etapa. */
function LabWorkRow({ order, now, current, onSelect }: { order: LabOrder; now: number; current: boolean; onSelect: () => void }) {
  const stage = stageOf(order), urgent = order.priority === 'urgente', level = slaLevel(order, now), minutes = elapsedMinutes(order, now), critical = isCritical(order);
  const shown = order.items.slice(0, 2), more = order.items.length - shown.length;
  return <li><button type="button" className={`lw-row tone-${STAGE_TONE[stage]}`} aria-current={current} aria-label={`Orden de ${order.patientName}, ${urgent ? 'urgente' : 'rutina'}, ${STAGE_LABEL[stage]}`} onClick={onSelect}>
    <span className={`lw-priority${urgent ? ' is-urgent' : ''}`}><Icon name={urgent ? 'alert' : 'clock'} size={18} />{urgent ? 'Urgente' : 'Rutina'}</span>
    <span className="lw-patient"><strong>{order.patientName}</strong><small>{patientLine(order) || 'Sin datos del expediente'}</small></span>
    <span className="lw-exams">{shown.map(item => <span className="lw-exam" key={item.id} title={item.name}>{item.code}</span>)}{more > 0 && <span className="lw-exam">+{more}</span>}<small>{order.doctorName ? `Pidió: ${order.doctorName}` : ''}</small></span>
    <span className="lw-end"><StageChip stage={stage} />
      <span className={`lw-elapsed sla-${level}`} title={level === 'late' ? 'Pasó la meta de tiempo' : level === 'warn' ? 'Cerca de la meta de tiempo' : 'Tiempo desde que se pidió'}><Icon name="clock" size={14} />{formatElapsed(minutes)}</span>
      {critical && <span className="lw-critical"><Icon name="alert" size={12} />Crítico</span>}</span>
  </button></li>;
}

/** Avance de una orden: seis pasos con el actual resaltado (diseño: pasos tipo píldora hecho/ahora). */
function LabStepper({ order }: { order: LabOrder }) {
  const { done, current } = labProgress(order);
  if (order.state === 'cancelado') return <p className="lab-cancelled">Orden cancelada: no continúa el flujo.</p>;
  return <ol className="lab-steps" aria-label={`Avance de la orden de ${order.patientName}`}>{LAB_STEPS.map((label, i) => <li key={label} className={done[i] ? 'is-done' : i === current ? 'is-now' : ''} aria-current={i === current ? 'step' : undefined}>{done[i] ? <Icon name="check" size={14} /> : <span className="lab-step-n" aria-hidden="true">{i + 1}</span>}<span>{label}{done[i] ? '' : i === current ? ' · ahora' : ''}</span></li>)}</ol>;
}

/** Panel de detalle: datos de la orden, avance por pasos, acciones y valores de cada examen. */
function LabDetail({ api, profile, order, canReview, onChanged, onSample }: { api: Api; profile: AccessProfile; order: LabOrder; canReview: boolean; onChanged: () => void; onSample: () => void }) {
  const action = useAction(api), [cancelOpen, setCancelOpen] = useState(false);
  const isLab = can(profile, 'laboratorio.procesar'), canComplete = can(profile, 'laboratorio.validar') || isLab;
  const { captured, total } = labProgress(order), ready = total > 0 && captured === total, next = nextActor(order), stage = stageOf(order);
  const when = (value?: string | null) => value ? formatDateTime(value) : 'Pendiente';
  async function transition(path: string, body: unknown) { if (await action.run(path, body)) onChanged(); }
  return <aside className="cl-detail" aria-label={`Detalle de la orden de ${order.patientName}`}>
    <header><StageChip stage={stage} /><h3>{order.patientName}</h3><p className="muted">{patientLine(order) || 'Sin datos del expediente'}</p><Tag value={order.state} label={stageLabel(order, canReview)} />
      {next && <small className="lab-next"><strong>Ahora: {next.who}</strong> {next.what}</small>}</header>
    <dl className="cl-facts"><div><dt>Prioridad</dt><dd>{order.priority === 'urgente' ? 'Urgente' : 'Rutina'}</dd></div><div><dt>Pidió</dt><dd>{order.doctorName ?? 'Sin dato'}</dd></div><div><dt>Solicitada</dt><dd>{formatDateTime(order.createdAt)}</dd></div><div><dt>Muestra</dt><dd>{when(order.sampleTakenAt)}</dd></div><div><dt>Completada</dt><dd>{when(order.completedAt)}</dd></div><div><dt>Revisada</dt><dd>{when(order.reviewedAt)}</dd></div></dl>
    <LabStepper order={order} />
    <WriteError error={action.error} onReload={onChanged} reloadLabel="Recargar la orden" />
    <div className="lw-actions">
      {isLab && order.state === 'pendiente' && <button className="primary-button" onClick={onSample}>Tomar muestra</button>}
      {canComplete && order.state === 'en_proceso' && <button className="primary-button" disabled={!ready || action.busy} title={ready ? undefined : `Faltan ${total - captured} valores para completar`} onClick={() => void transition(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version })}>Completar</button>}
      {canReview && order.state === 'completado' && !order.reviewedAt && <button className="primary-button" disabled={action.busy} onClick={() => void transition(`/laboratorio/ordenes/${order.id}/revisar`, { version: order.version })}>Revisar y liberar</button>}
      {can(profile, 'laboratorio.cancelar') && (order.state === 'pendiente' || order.state === 'en_proceso') && <button className="secondary-button" onClick={() => setCancelOpen(true)}>Cancelar orden</button>}
    </div>
    {order.state === 'en_proceso' && isLab && <p className={`lab-requirement ${ready ? 'is-ready' : ''}`} role="status">Para completar la orden hace falta el valor de todos los exámenes: {captured} de {total} capturados{ready ? ' · lista para completar' : ''}.</p>}
    <div className="lab-order-detail">{order.items.map(item => <LabItemRow key={item.id} api={api} profile={profile} order={order} item={item} onChanged={onChanged} />)}</div>
    {cancelOpen && <CancelDialog api={api} order={order} onClose={() => setCancelOpen(false)} onSaved={() => { setCancelOpen(false); onChanged(); }} />}
  </aside>;
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
