import { useEffect, useId, useState, type ReactNode } from 'react';
import './laboratory.css';
import { Field, Icon, Notice } from '../components/ui';
import { PriorityBadge, StatusBadge } from '../components/system';
import { ExportMenu } from '../components/export-menu';
import { ApiError, can, type AccessProfile, type Api } from '../lib/api';
import { EXTERNAL_INSTRUCTIONS_TEMPLATE, attachmentProblem, externalResultBody, fingerprintFile, formatBytes, groupLabOrders, type LabGroupId } from '../lib/lab-flow';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { newIntentKey, withIntentKey } from './intent';
import { useQuickAction } from './personal/accion';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { STAGE_LABEL, elapsedMinutes, formatElapsed, isCritical, slaLevel, sortOrders, stageOf, type Stage, type WorkSort } from './listas/lab-worklist';
import './listas/lists.css';

type LabResult = { value?: number | null; text?: string | null; mark: string; version: number; observation?: string | null; relevant?: boolean };
const sexShort: Record<string, string> = { femenino: 'F', masculino: 'M' };
type LabItem = { id: string; code: string; name: string; unit?: string | null; resultType?: string; result?: LabResult | null };
/** `allowedActions` of the API (MA-LAB-01..05): every button below comes from this list, never from role or state guesses. */
type LabAction = 'tomar_muestra' | 'capturar' | 'completar' | 'revisar' | 'cancelar' | 'enmendar';
/** S10: the external path has its own list (`externalActions`) so older clients keep decoding `allowedActions`. */
type ExternalAction = 'enviar_externo' | 'cargar_externo';
type LabOrder = {
  id: string; patientName: string; patientRecord?: string | null; patientSex?: string | null; patientAge?: number | null; patientAgeRange?: string | null; doctorName?: string | null;
  priority: string; state: string; version: number; createdAt: string; sampleTakenAt?: string | null; completedAt?: string | null; reviewedAt?: string | null; amendedAt?: string | null;
  items: LabItem[]; allowedActions?: LabAction[];
  external?: boolean; externalPlace?: string | null; externalInstructions?: string | null; externalActions?: ExternalAction[];
};
type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number; stored: boolean; note?: string | null; uploadedAt: string; uploadedByName?: string | null };
const allows = (order: LabOrder, action: LabAction) => (order.allowedActions ?? []).includes(action);
const allowsExternal = (order: LabOrder, action: ExternalAction) => (order.externalActions ?? []).includes(action);
const isNumeric = (item: LabItem) => item.resultType ? item.resultType === 'numerico' : !!item.unit;

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
  if (order.state === 'pendiente' && order.external) return { who: 'Paciente', what: `se hace el examen en ${order.externalPlace ?? 'el lugar indicado'}; después Laboratorio o el médico cargan el informe con sus valores.` };
  if (order.state === 'pendiente') return { who: 'Laboratorio', what: 'toma la muestra confirmando la identidad del paciente (expediente y nombre completo).' };
  if (order.state === 'en_proceso') return captured < total
    ? { who: 'Laboratorio', what: `captura el valor de cada examen: faltan ${total - captured} de ${total}.` }
    : { who: 'Laboratorio', what: 'ya están todos los valores; completa la orden.' };
  if (!order.reviewedAt) return { who: 'Medicina', what: 'revisa y libera los resultados; hasta entonces el paciente ve el estado pero no los valores.' };
  return null;
}

const stageLabel = (order: LabOrder, canReview: boolean) => {
  if (order.state === 'completado' && order.amendedAt && !order.reviewedAt) return 'Resultado corregido · falta revisión médica';
  if (order.state === 'completado') return order.reviewedAt ? 'Revisada · visible al paciente' : canReview ? 'Pendiente de revisar' : 'Completada · falta revisión médica';
  if (order.state === 'pendiente') return order.external ? 'Externa · espera el informe' : 'Pendiente';
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
/** S7: la etapa usa las familias de estado comunes (ícono + patrón + etiqueta); rojo solo para lo crítico. */
const STAGE_STATUS: Record<Stage, string> = { pendiente: 'pendiente', en_proceso: 'en_proceso', por_revisar: 'en_espera', liberada: 'completado', cancelada: 'cancelado' };
const StageBadge = ({ stage }: { stage: Stage }) => <StatusBadge value={STAGE_STATUS[stage]} label={STAGE_LABEL[stage]} />;

type BatchOutcome = { done: number; failed: { name: string; message: string }[] };

export function LaboratoryPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<LabOrder[]>(api, '/laboratorio/ordenes', version, can(profile, 'laboratorio.ver_cola') || can(profile, 'resultados.ver'));
  const [sampleFor, setSampleFor] = useState<LabOrder | null>(null), [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [stage, setStage] = useState<StageFilter>('todas'), [urgentOnly, setUrgentOnly] = useState(false), [criticalOnly, setCriticalOnly] = useState(false), [sort, setSort] = useState<WorkSort>('prioridad');
  const [opened, setOpened] = useState<Set<LabGroupId>>(new Set()), [batch, setBatch] = useState<Set<string>>(new Set()), [batchBusy, setBatchBusy] = useState(false), [outcome, setOutcome] = useState<BatchOutcome | null>(null);
  const [quick, consumeQuick] = useQuickAction(), isLab = can(profile, 'laboratorio.procesar');
  const all = data.data ?? [];
  // El reloj se lee al pintar: cada evento en vivo vuelve a pintar la lista, así no hace falta ningún temporizador.
  const now = Date.now();
  const stageCount = (value: Stage) => all.filter(order => stageOf(order) === value).length;
  const rows = sortOrders(all.filter(order => (stage === 'todas' || stageOf(order) === stage) && (!urgentOnly || order.priority === 'urgente') && (!criticalOnly || isCritical(order))
    && matches(query, order.patientName, order.patientRecord, order.doctorName, ...order.items.flatMap(item => [item.code, item.name]))), sort);
  // S10: lista agrupada por lo que toca hacer. Lo cerrado empieza plegado salvo que se busque o se filtre por esa etapa.
  const groups = groupLabOrders(rows);
  // Sin trabajo abierto (solo liberadas o canceladas) no hay nada que plegar.
  const foldable = stage === 'todas' && !query.trim() && groups.some(group => !group.folded);
  const isOpen = (id: LabGroupId, folded: boolean) => !folded || !foldable || opened.has(id);
  const visible = groups.flatMap(group => isOpen(group.id, group.folded) ? group.orders : []);
  const selected = rows.find(order => order.id === selectedId) ?? visible[0] ?? null;
  const completable = all.filter(order => allows(order, 'completar'));
  const chosen = completable.filter(order => batch.has(order.id));
  const filters = [
    ...(stage !== 'todas' ? [{ key: 'etapa', label: STAGE_LABEL[stage], remove: () => setStage('todas') }] : []),
    ...(urgentOnly ? [{ key: 'urgentes', label: 'Solo urgentes', remove: () => setUrgentOnly(false) }] : []),
    ...(criticalOnly ? [{ key: 'criticos', label: 'Con valores críticos', remove: () => setCriticalOnly(false) }] : []),
    ...(query.trim() ? [{ key: 'texto', label: `«${query.trim()}»`, remove: () => setQuery('') }] : []),
  ];
  const clear = () => { setStage('todas'); setUrgentOnly(false); setCriticalOnly(false); setQuery(''); };
  const toggle = <T,>(set: Set<T>, value: T) => { const next = new Set(set); if (next.has(value)) next.delete(value); else next.add(value); return next; };
  // `?accion=muestra`: abre la toma de muestra de la primera orden pendiente (la más antigua de la cola).
  useEffect(() => {
    if (!quick || !data.data) return;
    if (quick === 'muestra' && isLab) { const first = [...data.data].reverse().find(o => allows(o, 'tomar_muestra')); if (first) { setSelectedId(first.id); setSampleFor(first); } }
    consumeQuick();
  }, [quick, data.data, isLab, consumeQuick]);
  /** Acción por lote: cada orden se completa con su propia versión; las que fallan se informan sin detener las demás. */
  async function completeBatch() {
    setBatchBusy(true); setOutcome(null);
    const result: BatchOutcome = { done: 0, failed: [] };
    for (const order of chosen) {
      try { await withIntentKey(newIntentKey(), () => api.write(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version }, 'POST')); result.done++; }
      catch (error) { result.failed.push({ name: order.patientName, message: error instanceof ApiError ? error.message : 'No se pudo completar.' }); }
    }
    setBatchBusy(false); setOutcome(result); setBatch(new Set()); data.refresh();
  }
  const exportTable = () => ({
    filename: 'laboratorio-ordenes', title: 'Órdenes de laboratorio', subtitle: `${rows.length} órdenes`,
    columns: ['Prioridad', 'Paciente', 'Expediente', 'Edad', 'Sexo', 'Exámenes', 'Médico', 'Solicitada', 'Espera', 'Etapa', 'Externa', 'Valores críticos'],
    rows: rows.map(o => [o.priority === 'urgente' ? 'Urgente' : 'Rutina', o.patientName, o.patientRecord ?? '', o.patientAge ?? o.patientAgeRange ?? '', o.patientSex ? sexShort[o.patientSex] ?? '' : '', o.items.map(i => i.name).join('; '), o.doctorName ?? '', formatDateTime(o.createdAt), formatElapsed(elapsedMinutes(o, now)), STAGE_LABEL[stageOf(o)], o.external ? `Sí (${o.externalPlace ?? ''})` : 'No', isCritical(o) ? 'Sí' : 'No']),
  });
  return <>
    <CompactHeader breadcrumb="Atención / Diagnóstico" title="Laboratorio"/>
    <section className="data-workbench lab-workbench" aria-label="Lista de trabajo de laboratorio"><RemoteState state={data}>{() => <>
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
      {completable.length > 0 && <div className="lab-batch" role="group" aria-label="Completar por lote">
        <span><strong className="lab-num">{chosen.length}</strong> de <span className="lab-num">{completable.length}</span> órdenes con todos sus valores seleccionadas</span>
        <button type="button" className="secondary-button" disabled={batchBusy} onClick={() => setBatch(new Set(chosen.length === completable.length ? [] : completable.map(o => o.id)))}>{chosen.length === completable.length ? 'Quitar selección' : 'Seleccionar todas'}</button>
        <button type="button" className="primary-button" disabled={!chosen.length || batchBusy} onClick={() => void completeBatch()}>{batchBusy ? 'Completando…' : chosen.length ? `Completar ${chosen.length} seleccionadas` : 'Completar seleccionadas'}</button>
      </div>}
      {outcome && <div className="lab-batch-result">{outcome.done > 0 && <Notice kind="success">{outcome.done === 1 ? 'Se completó 1 orden.' : `Se completaron ${outcome.done} órdenes.`}</Notice>}
        {outcome.failed.length > 0 && <Notice kind="error">No se completaron {outcome.failed.length}: {outcome.failed.map(f => `${f.name} (${f.message})`).join('; ')}</Notice>}</div>}
      {rows.length ? <>
        <p className="cl-count" aria-live="polite">{rows.length} de {all.length} órdenes · agrupadas por lo que toca hacer; dentro de cada grupo, las urgentes y las que más esperan primero.</p>
        <div className="cl-master-detail">
          <ul className="cl-master lab-groups" aria-label="Órdenes de laboratorio">{groups.flatMap(group => {
            const open = isOpen(group.id, group.folded);
            return [
              <li key={`h-${group.id}`} className="lab-group-head">
                <h3>{group.label}</h3><span className="lab-num lab-group-count">{group.orders.length}</span>
                {group.folded && foldable && <button type="button" className="lab-fold" aria-expanded={open} onClick={() => setOpened(current => toggle(current, group.id))}>{open ? `Ocultar ${group.label.toLowerCase()}` : `Mostrar ${group.label.toLowerCase()}`}</button>}
              </li>,
              ...(open ? group.orders.map(order => <LabWorkRow key={order.id} order={order} now={now} current={order.id === selected?.id} onSelect={() => setSelectedId(order.id)}
                batchable={allows(order, 'completar')} inBatch={batch.has(order.id)} onBatch={() => setBatch(current => toggle(current, order.id))} />) : []),
            ];
          })}</ul>
          {selected && <LabDetail key={selected.id} api={api} order={selected} onChanged={data.refresh} onSample={() => setSampleFor(selected)} />}
        </div></>
        : all.length ? <Empty title="Ninguna orden coincide con los filtros" description="Quita algún filtro o cambia lo que buscas." />
          : <Empty title="No hay órdenes de laboratorio" description="Las órdenes aparecerán cuando Medicina solicite estudios para una consulta." />}
    </>}</RemoteState></section>
    {sampleFor && <SampleDialog api={api} order={sampleFor} onClose={() => setSampleFor(null)} onSaved={() => { setSampleFor(null); data.refresh(); }} />}
  </>;
}

/** Una fila de la lista: prioridad, paciente, exámenes, tiempo con su color de meta y etapa. Lo demás va al detalle. */
function LabWorkRow({ order, now, current, onSelect, batchable, inBatch, onBatch }: { order: LabOrder; now: number; current: boolean; onSelect: () => void; batchable: boolean; inBatch: boolean; onBatch: () => void }) {
  const stage = stageOf(order), urgent = order.priority === 'urgente', level = slaLevel(order, now), minutes = elapsedMinutes(order, now), critical = isCritical(order);
  const externalPending = !!order.external && order.state === 'pendiente';
  const shown = order.items.slice(0, 2), more = order.items.length - shown.length;
  return <li className={`lab-row-item${batchable ? ' has-batch' : ''}`}>
    {batchable && <input type="checkbox" className="lab-batch-check" checked={inBatch} onChange={onBatch} aria-label={`Incluir la orden de ${order.patientName} en el lote para completar`} />}
    <button type="button" className="lw-row lab-row" aria-current={current} aria-label={`Orden de ${order.patientName}, ${urgent ? 'urgente' : 'rutina'}, ${externalPending ? 'externa' : STAGE_LABEL[stage]}`} onClick={onSelect}>
      <PriorityBadge value={urgent ? 'urgente' : 'rutina'} />
      <span className="lw-patient"><strong>{order.patientName}</strong><small>{patientLine(order) || 'Sin datos del expediente'}</small></span>
      <span className="lw-exams">{shown.map(item => <span className="lw-exam" key={item.id} title={item.name}>{item.code}</span>)}{more > 0 && <span className="lw-exam">+{more}</span>}<small>{order.doctorName ? `Pidió: ${order.doctorName}` : ''}</small></span>
      <span className="lw-end">
        {externalPending ? <span className="lab-external-chip"><Icon name="building" size={14} />Externa</span> : <StageBadge stage={stage} />}
        {level !== 'none' && !externalPending && <span className={`lw-elapsed sla-${level}`} title={level === 'late' ? 'Pasó la meta de tiempo' : level === 'warn' ? 'Cerca de la meta de tiempo' : 'Tiempo desde que se pidió'}><Icon name="clock" size={14} />{formatElapsed(minutes)}</span>}
        {critical && <StatusBadge value="critico_alto" label="Crítico" />}</span>
    </button>
  </li>;
}

/** Avance de una orden: seis pasos con el actual resaltado (diseño: pasos tipo píldora hecho/ahora). */
function LabStepper({ order }: { order: LabOrder }) {
  const { done, current } = labProgress(order);
  if (order.state === 'cancelado') return <p className="lab-cancelled">Orden cancelada: no continúa el flujo.</p>;
  return <ol className="lab-steps" aria-label={`Avance de la orden de ${order.patientName}`}>{LAB_STEPS.map((label, i) => <li key={label} className={done[i] ? 'is-done' : i === current ? 'is-now' : ''} aria-current={i === current ? 'step' : undefined}>{done[i] ? <Icon name="check" size={14} /> : <span className="lab-step-n" aria-hidden="true">{i + 1}</span>}<span>{label}{done[i] ? '' : i === current ? ' · ahora' : ''}</span></li>)}</ol>;
}

/**
 * Panel de detalle con detalle progresivo: arriba quién actúa y la acción principal, luego los valores; las fechas quedan
 * plegadas en «Datos de la orden» y el avance va al final.
 */
function LabDetail({ api, order, onChanged, onSample }: { api: Api; order: LabOrder; onChanged: () => void; onSample: () => void }) {
  const action = useAction(api), [cancelOpen, setCancelOpen] = useState(false), [externalOpen, setExternalOpen] = useState(false), [loadOpen, setLoadOpen] = useState(false);
  const { captured, total } = labProgress(order), ready = total > 0 && captured === total, next = nextActor(order), stage = stageOf(order);
  const when = (value?: string | null) => value ? formatDateTime(value) : 'Pendiente';
  async function transition(path: string, body: unknown) { if (await action.run(path, body)) onChanged(); }
  return <aside className="cl-detail lab-detail" aria-label={`Detalle de la orden de ${order.patientName}`}>
    <header><StageBadge stage={stage} /><h3>{order.patientName}</h3><p className="muted">{patientLine(order) || 'Sin datos del expediente'}</p><Tag value={order.state} label={stageLabel(order, allows(order, 'revisar'))} />
      {next && <small className="lab-next"><strong>Ahora: {next.who}</strong> {next.what}</small>}</header>
    {order.external && <ExternalNote order={order} />}
    <WriteError error={action.error} onReload={onChanged} reloadLabel="Recargar la orden" />
    <div className="lw-actions">
      {allows(order, 'tomar_muestra') && <button className="primary-button" onClick={onSample}>Tomar muestra</button>}
      {allowsExternal(order, 'cargar_externo') && <button className="primary-button" onClick={() => setLoadOpen(true)}>Cargar resultado externo</button>}
      {(allows(order, 'completar') || allows(order, 'capturar')) && <button className="primary-button" disabled={!allows(order, 'completar') || action.busy} title={allows(order, 'completar') ? undefined : `Faltan ${total - captured} valores para completar`} onClick={() => void transition(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version })}>Completar</button>}
      {allows(order, 'revisar') && <button className="primary-button" disabled={action.busy} onClick={() => void transition(`/laboratorio/ordenes/${order.id}/revisar`, { version: order.version })}>Revisar y liberar</button>}
      {allowsExternal(order, 'enviar_externo') && <button className="secondary-button" onClick={() => setExternalOpen(true)}>Se realiza en otro sitio</button>}
      {allows(order, 'cancelar') && <button className="secondary-button" onClick={() => setCancelOpen(true)}>Cancelar orden</button>}
    </div>
    {order.amendedAt && <p className="lab-requirement" role="note">Un resultado se corrigió el {formatDateTime(order.amendedAt)}; el valor anterior queda en el historial.{order.reviewedAt ? '' : ' Medicina debe revisarlo de nuevo antes de que el paciente lo vea.'}</p>}
    {allows(order, 'capturar') && <p className={`lab-requirement ${ready ? 'is-ready' : ''}`} role="status">Para completar la orden hace falta el valor de todos los exámenes: {captured} de {total} capturados{ready ? ' · lista para completar' : ''}.</p>}
    <div className="lab-order-detail">{order.items.map(item => <LabItemRow key={item.id} api={api} order={order} item={item} onChanged={onChanged} />)}</div>
    {order.external && order.state === 'completado' && <ExternalReport api={api} order={order} />}
    <details className="lab-more">
      <summary>Datos de la orden</summary>
      <dl className="cl-facts"><div><dt>Prioridad</dt><dd>{order.priority === 'urgente' ? 'Urgente' : 'Rutina'}</dd></div><div><dt>Pidió</dt><dd>{order.doctorName ?? 'Sin dato'}</dd></div><div><dt>Solicitada</dt><dd>{formatDateTime(order.createdAt)}</dd></div><div><dt>{order.external ? 'Informe recibido' : 'Muestra'}</dt><dd>{when(order.sampleTakenAt)}</dd></div><div><dt>Completada</dt><dd>{when(order.completedAt)}</dd></div><div><dt>Revisada</dt><dd>{when(order.reviewedAt)}</dd></div></dl>
    </details>
    <LabStepper order={order} />
    {cancelOpen && <CancelDialog api={api} order={order} onClose={() => setCancelOpen(false)} onSaved={() => { setCancelOpen(false); onChanged(); }} />}
    {externalOpen && <SendExternalDialog api={api} order={order} onClose={() => setExternalOpen(false)} onSaved={() => { setExternalOpen(false); onChanged(); }} />}
    {loadOpen && <ExternalResultDialog api={api} order={order} onClose={() => setLoadOpen(false)} onSaved={() => { setLoadOpen(false); onChanged(); }} />}
  </aside>;
}

/** Same structure as `Field` (label above, control in `input-wrap`) for controls `Field` does not cover. */
function FieldShell({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label><span className="input-wrap">{children(id)}</span></div>;
}

/** Dónde se hace y qué se le dijo al paciente; el paciente ve exactamente este texto en «Mis exámenes». */
function ExternalNote({ order }: { order: LabOrder }) {
  return <div className="lab-external" role="note">
    <strong><Icon name="building" size={16} />Se realiza en otro sitio: {order.externalPlace ?? 'sin lugar registrado'}</strong>
    {order.externalInstructions && <p><span className="muted">Instrucciones para el paciente: </span>{order.externalInstructions}</p>}
  </div>;
}

/** Informe externo de una orden completada: referencia del adjunto con su nota. Se lee del detalle de la orden. */
function ExternalReport({ api, order }: { api: Api; order: LabOrder }) {
  const detail = useData<{ attachments?: Attachment[] }>(api, `/laboratorio/ordenes/${order.id}`, order.version);
  const attachments = detail.data?.attachments ?? [];
  return <section className="lab-report" aria-label="Informe externo">
    <h4>Informe externo</h4>
    <RemoteState state={detail} skeletonRows={1}>{() => attachments.length ? <ul>{attachments.map(file => <li key={file.id}>
      <Icon name="download" size={16} /><span><strong>{file.fileName}</strong> <span className="muted">{file.mimeType === 'application/pdf' ? 'PDF' : 'Foto'} · {formatBytes(file.sizeBytes)} · {formatDateTime(file.uploadedAt)}{file.uploadedByName ? ` · ${file.uploadedByName}` : ''}</span>
        {file.note && <small>{file.note}</small>}
        {!file.stored && <small className="muted">Se guardó la referencia del archivo (nombre, tipo, tamaño y huella) y los valores; el original queda con quien lo cargó.</small>}</span>
    </li>)}</ul> : <p className="muted">Sin adjuntos visibles.</p>}</RemoteState>
  </section>;
}

function SendExternalDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const action = useAction(api), [place, setPlace] = useState(''), [instructions, setInstructions] = useState(EXTERNAL_INSTRUCTIONS_TEMPLATE);
  const ready = place.trim().length >= 3 && instructions.trim().length >= 10;
  async function save() { if (await action.run(`/laboratorio/ordenes/${order.id}/externa`, { version: order.version, place: place.trim(), instructions: instructions.trim() })) onSaved(); }
  return <Dialog title="Examen en otro sitio" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">La orden de {order.patientName} queda como externa: ya no se toma muestra aquí. El paciente ve el lugar y estas instrucciones en sus exámenes.</p>
    <WriteError error={action.error} onReload={onSaved} reloadLabel="Recargar la orden" />
    <Field label="Dónde se realiza" value={place} onChange={setPlace} required minLength={3} maxLength={200} autoFocus placeholder="Por ejemplo: Clínica de imágenes, ventanilla 2" />
    <FieldShell label="Instrucciones para el paciente">{id => <textarea id={id} value={instructions} onChange={event => setInstructions(event.target.value)} required minLength={10} maxLength={1000} rows={4} />}</FieldShell>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!ready} label="Enviar a externo" /></div>
  </form></Dialog>;
}

/**
 * Resultado externo: adjunto (foto o PDF) + valor clave de cada examen. El almacenamiento clínico de archivos todavía no
 * existe: se envía la referencia del archivo y sus valores, y se dice con claridad.
 */
function ExternalResultDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const action = useAction(api), [file, setFile] = useState<File | null>(null), [values, setValues] = useState<Record<string, string>>({}), [note, setNote] = useState('');
  const problem = attachmentProblem(file), missing = order.items.filter(item => !(values[item.id] ?? '').trim()).length;
  async function save() {
    if (!file || problem || missing) return;
    const sha256 = await fingerprintFile(file);
    const attachment = { fileName: file.name, mimeType: file.type, sizeBytes: file.size, ...(sha256 ? { sha256 } : {}) };
    const body = externalResultBody(order.version, attachment, order.items.map(item => ({ id: item.id, numeric: isNumeric(item) })), values, note);
    if (await action.run(`/laboratorio/ordenes/${order.id}/resultado-externo`, body)) onSaved();
  }
  return <Dialog title="Cargar resultado externo" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">Adjunta el informe que trajo el paciente y escribe el valor clave de cada examen. La marca (normal, alta, crítica) la calcula el sistema. Al guardar, la orden queda completada y espera la revisión médica.</p>
    <WriteError error={action.error} onReload={onSaved} reloadLabel="Recargar la orden" />
    <FieldShell label="Informe (PDF o foto, hasta 10 MB)">{id => <input id={id} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp" onChange={event => setFile(event.target.files?.[0] ?? null)} aria-required="true" />}</FieldShell>
    {file && (problem ? <Notice kind="error">{problem}</Notice> : <p className="muted">{file.name} · {formatBytes(file.size)}</p>)}
    <fieldset className="lab-external-values"><legend>Valores clave</legend>
      {order.items.map(item => <Field key={item.id} label={`${item.name}${isNumeric(item) && item.unit ? ` (${item.unit})` : ''}`} type={isNumeric(item) ? 'number' : 'text'} step="any" value={values[item.id] ?? ''} onChange={value => setValues(current => ({ ...current, [item.id]: value }))} required />)}
    </fieldset>
    <Field label="Nota sobre el informe (opcional)" value={note} onChange={setNote} maxLength={1000} />
    <p className="muted lab-storage-note">Se guarda la referencia del archivo (nombre, tipo, tamaño y huella) y los valores. El archivo original queda con quien lo cargó mientras se habilita el almacenamiento clínico.</p>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!!problem || missing > 0} label="Guardar resultado" /></div>
  </form></Dialog>;
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

const resultText = (item: LabItem) => item.result ? `${item.result.text ?? item.result.value}${item.unit && item.result.text == null ? ` ${item.unit}` : ''}` : '';

/** S10: observación del laboratorio; si es relevante, se dice que el médico ya la tiene en su bandeja. */
function ObservationLine({ result }: { result: LabResult }) {
  if (!result.observation) return null;
  return <small className={`lab-observation${result.relevant ? ' is-relevant' : ''}`}>{result.relevant ? <><Icon name="info" size={14} />Observación relevante (enviada al médico): </> : 'Observación: '}{result.observation}</small>;
}

/** Capture while the order is in process (`capturar`, with the order version), amend once completed (`enmendar`), read-only otherwise. */
function LabItemRow({ api, order, item, onChanged }: { api: Api; order: LabOrder; item: LabItem; onChanged: () => void }) {
  const action = useAction(api), [amending, setAmending] = useState(false);
  const [value, setValue] = useState(item.result?.value?.toString() ?? ''), [text, setText] = useState(item.result?.text ?? ''), [reason, setReason] = useState('');
  const [observation, setObservation] = useState(item.result?.observation ?? ''), [relevant, setRelevant] = useState(!!item.result?.relevant);
  const title = <strong>{item.code} · {item.name}{item.unit ? <small className="muted"> ({item.unit})</small> : null}</strong>;
  if (!allows(order, 'capturar')) return <div className="lab-result-row">{title}{item.result ? <span><Tag value={item.result.mark} /> {resultText(item)}</span> : <span>Resultado pendiente</span>}
    {item.result && <ObservationLine result={item.result} />}
    {allows(order, 'enmendar') && item.result && <button className="secondary-button" type="button" onClick={() => setAmending(true)}>Corregir resultado</button>}
    {amending && <AmendDialog api={api} order={order} item={item} onClose={() => setAmending(false)} onSaved={() => { setAmending(false); onChanged(); }} />}</div>;
  async function save() {
    const note = observation.trim();
    const body = { orderItemId: item.id, version: order.version, ...(value.trim() ? { value: Number(value) } : { text: text.trim() }), ...(item.result ? { reason: reason.trim() } : {}), ...(note ? { observation: note, relevant } : {}) };
    if (await action.run(`/laboratorio/ordenes/${order.id}/resultados`, body)) onChanged();
  }
  return <div className="lab-result-row">{title} {item.result ? <Tag value="completado" label="Valor capturado" /> : <Tag value="pendiente" label="Falta el valor" />}
    <p>La marca se calcula con el rango vigente; no se selecciona manualmente. Un valor crítico avisa solo al médico que pidió la orden.</p>
    <div className="form-grid"><Field label="Valor" type="number" value={value} onChange={setValue} /><Field label="Texto" value={text} onChange={setText} />{item.result && <Field label="Motivo de corrección" value={reason} onChange={setReason} />}</div>
    <Field label="Observación (opcional)" value={observation} onChange={next => { setObservation(next); if (!next.trim()) setRelevant(false); }} maxLength={1000} />
    <label className="lab-relevant"><input type="checkbox" checked={relevant} disabled={!observation.trim()} onChange={event => setRelevant(event.target.checked)} />Es relevante: crea un pendiente en «Resultados por revisar» del médico</label>
    <button className="secondary-button" type="button" onClick={() => void save()} disabled={action.busy || (!value.trim() && !text.trim()) || (!!item.result && !reason.trim())}>Guardar resultado</button><WriteError error={action.error} onReload={onChanged} reloadLabel="Recargar la orden" /></div>;
}

/** MA-LAB-02 (D-13): amend a completed result with a reason of 10+ characters; the order goes back to the doctor's review. */
function AmendDialog({ api, order, item, onClose, onSaved }: { api: Api; order: LabOrder; item: LabItem; onClose: () => void; onSaved: () => void }) {
  const action = useAction(api), numeric = item.result?.text == null;
  const [value, setValue] = useState(numeric ? item.result?.value?.toString() ?? '' : item.result?.text ?? ''), [reason, setReason] = useState('');
  const ready = value.trim() !== '' && reason.trim().length >= 10;
  async function save() { if (await action.run(`/laboratorio/ordenes/${order.id}/enmendar`, { orderItemId: item.id, version: order.version, ...(numeric ? { value: Number(value) } : { text: value.trim() }), reason: reason.trim() })) onSaved(); }
  return <Dialog title={`Corregir ${item.name}`} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">El valor actual ({resultText(item)}) queda en el historial con tu motivo.{order.reviewedAt ? ' El paciente deja de ver los valores hasta que Medicina los revise de nuevo.' : ' Medicina revisa la orden con el valor corregido.'}</p>
    <WriteError error={action.error} onReload={onSaved} reloadLabel="Recargar la orden" />
    <Field label={numeric ? `Valor corregido${item.unit ? ` (${item.unit})` : ''}` : 'Resultado corregido'} type={numeric ? 'number' : 'text'} value={value} onChange={setValue} required autoFocus />
    <Field label="Motivo de la corrección" value={reason} onChange={setReason} required minLength={10} maxLength={500} />
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!ready} label="Guardar corrección" /></div>
  </form></Dialog>;
}
