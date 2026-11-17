import { useEffect, useId, useState, type ReactNode } from 'react';
import './laboratory.css';
import { Field, Icon, Notice } from '../components/ui';
import { PriorityBadge, StatusBadge } from '../components/system';
import { ExportMenu } from '../components/export-menu';
import { ApiError, can, type AccessProfile, type Api } from '../lib/api';
import { downloadAttachment, uploadAttachment } from '../lib/lab-attachments';
import { ATTACHMENT_ACCEPT, EXTERNAL_INSTRUCTIONS_TEMPLATE, attachmentMimeType, attachmentProblem, externalResultBody, fingerprintFile, formatBytes, groupLabOrders, type LabGroupId } from '../lib/lab-flow';
import { Dialog, Empty, CompactHeader, RemoteState, SaveButton, Tag, WriteError, formatDateTime, useAction, useData } from './common';
import { newIntentKey, withIntentKey } from './intent';
import { spanishProblem } from './problems';
import { useQuickAction } from './personal/accion';
import { ActiveFilters, ChipGroup, LiveSearch, ListToolbar, matches } from './listas/chips';
import { STAGE_LABEL, elapsedMinutes, formatElapsed, isCritical, slaLevel, sortOrders, stageOf, type Stage, type WorkSort } from './listas/lab-worklist';
import './listas/lists.css';
import { markOf, parseValue, rangeText, type ReferenceRange, type SheetMark } from '../lib/lab-sheet';
import { ReleaseDialog, releasedMessage } from './lab-release';
import { writeHashParams } from '../lib/hash-params';

type LabResult = { value?: number | null; text?: string | null; mark: string; version: number; observation?: string | null; relevant?: boolean };
const sexShort: Record<string, string> = { femenino: 'F', masculino: 'M' };
type LabItem = { id: string; code: string; name: string; unit?: string | null; resultType?: string; result?: LabResult | null; referenceRange?: ReferenceRange | null };
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
  // `?orden=<id>` (from "Resultados por revisar" in Inicio): opens that order's detail directly.
  useEffect(() => {
    const wanted = new URLSearchParams(location.hash.split('?')[1] ?? '').get('orden');
    if (wanted && data.data?.some(order => order.id === wanted)) { setSelectedId(wanted); setStage('todas'); writeHashParams({ orden: null }); }
  }, [data.data]);
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
    columns: ['Prioridad', 'Paciente', 'Expediente', 'Edad', 'Sexo', 'Exámenes', 'Médico', 'Solicitada', 'Espera', 'Etapa', 'Valores críticos', 'Externa'],
    rows: rows.map(o => [o.priority === 'urgente' ? 'Urgente' : 'Rutina', o.patientName, o.patientRecord ?? '', o.patientAge ?? o.patientAgeRange ?? '', o.patientSex ? sexShort[o.patientSex] ?? '' : '', o.items.map(i => i.name).join('; '), o.doctorName ?? '', formatDateTime(o.createdAt), formatElapsed(elapsedMinutes(o, now)), STAGE_LABEL[stageOf(o)], isCritical(o) ? 'Sí' : 'No', o.external ? `Sí (${o.externalPlace ?? ''})` : 'No']),
  });
  return <>
    <CompactHeader breadcrumb="Atención / Diagnóstico" title="Laboratorio"/>
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
          {selected && <LabDetail key={selected.id} api={api} order={selected} canAttach={can(profile, 'laboratorio.procesar') || can(profile, 'laboratorio.revisar')} canComplete={can(profile, 'laboratorio.validar')} onChanged={data.refresh} onSample={() => setSampleFor(selected)} />}
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
function LabDetail({ api, order, canAttach, canComplete, onChanged, onSample }: { api: Api; order: LabOrder; canAttach: boolean; canComplete: boolean; onChanged: () => void; onSample: () => void }) {
  const action = useAction(api), [cancelOpen, setCancelOpen] = useState(false), [externalOpen, setExternalOpen] = useState(false), [loadOpen, setLoadOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false), [done, setDone] = useState<string | null>(null), [completeOpen, setCompleteOpen] = useState(false);
  const capturing = allows(order, 'capturar');
  const next = nextActor(order), stage = stageOf(order);
  const when = (value?: string | null) => value ? formatDateTime(value) : 'Pendiente';
  async function transition(path: string, body: unknown) { if (await action.run(path, body)) onChanged(); }
  return <aside className="cl-detail" aria-label={`Detalle de la orden de ${order.patientName}`}>
    <header><StageBadge stage={stage} /><h3>{order.patientName}</h3><p className="muted">{patientLine(order) || 'Sin datos del expediente'}</p><Tag value={order.state} label={stageLabel(order, allows(order, 'revisar'))} />
      {next && <small className="lab-next"><strong>Ahora: {next.who}</strong> {next.what}</small>}</header>
    {order.external && <ExternalNote order={order} />}
    {done && <Notice kind="success">{done}</Notice>}
    <WriteError error={spanishProblem(action.error)} onReload={onChanged} reloadLabel="Recargar la orden" />
    <div className="lw-actions">
      {allows(order, 'tomar_muestra') && <button className="primary-button" onClick={onSample}>Tomar muestra</button>}
      {allowsExternal(order, 'cargar_externo') && <button className="primary-button" onClick={() => setLoadOpen(true)}>Cargar resultado externo</button>}
      {/* While capturing, the sheet below has the one primary action («Guardar y completar»). */}
      {/* Sweep U6: completing hands the order to the doctor's review and cannot be undone here, so it asks first. */}
      {allows(order, 'completar') && !capturing && <button className="primary-button" disabled={action.busy} onClick={() => setCompleteOpen(true)}>Completar</button>}
      {allows(order, 'revisar') && <button className="primary-button" disabled={action.busy} onClick={() => { setDone(null); setReleaseOpen(true); }}>Revisar y liberar</button>}
      {allowsExternal(order, 'enviar_externo') && <button className="secondary-button" onClick={() => setExternalOpen(true)}>Se realiza en otro sitio</button>}
      {allows(order, 'cancelar') && <button className="secondary-button" onClick={() => setCancelOpen(true)}>Cancelar orden</button>}
    </div>
    {order.amendedAt && <p className="lab-requirement" role="note">Un resultado se corrigió el {formatDateTime(order.amendedAt)}; el valor anterior queda en el historial.{order.reviewedAt ? '' : ' Medicina debe revisarlo de nuevo antes de que el paciente lo vea.'}</p>}
    {capturing
      ? <ResultSheet api={api} order={order} canComplete={canComplete || allows(order, 'completar')} onSaved={message => { setDone(message); onChanged(); }} />
      : <div className="lab-order-detail">{order.items.map(item => <LabItemRow key={item.id} api={api} order={order} item={item} onChanged={onChanged} />)}</div>}
    {order.external && order.state === 'completado' && <ExternalReport api={api} order={order} canAttach={canAttach} />}
    <details className="lab-more">
      <summary>Datos de la orden</summary>
      <dl className="cl-facts"><div><dt>Prioridad</dt><dd>{order.priority === 'urgente' ? 'Urgente' : 'Rutina'}</dd></div><div><dt>Pidió</dt><dd>{order.doctorName ?? 'Sin dato'}</dd></div><div><dt>Solicitada</dt><dd>{formatDateTime(order.createdAt)}</dd></div><div><dt>{order.external ? 'Informe recibido' : 'Muestra'}</dt><dd>{when(order.sampleTakenAt)}</dd></div><div><dt>Completada</dt><dd>{when(order.completedAt)}</dd></div><div><dt>Revisada</dt><dd>{when(order.reviewedAt)}</dd></div></dl>
    </details>
    <LabStepper order={order} />
    {completeOpen && <Dialog title="Completar orden" onClose={() => setCompleteOpen(false)} busy={action.busy}><div className="module-form">
      <p>La orden de <strong>{order.patientName}</strong> pasa a revisión de {order.doctorName ?? 'el médico que la pidió'}. Ya no se pueden agregar resultados desde aquí.</p>
      <WriteError error={spanishProblem(action.error)} onReload={() => { setCompleteOpen(false); onChanged(); }} reloadLabel="Recargar la orden" />
      <div className="dialog-actions"><button type="button" className="secondary-button" disabled={action.busy} onClick={() => setCompleteOpen(false)}>Volver</button>
        <button type="button" className="primary-button" disabled={action.busy} onClick={async () => { if (await action.run(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version })) { setCompleteOpen(false); onChanged(); } }}>{action.busy ? 'Completando…' : 'Completar'}</button></div></div></Dialog>}
    {cancelOpen && <CancelDialog api={api} order={order} onClose={() => setCancelOpen(false)} onSaved={() => { setCancelOpen(false); onChanged(); }} />}
    {externalOpen && <SendExternalDialog api={api} order={order} onClose={() => setExternalOpen(false)} onSaved={() => { setExternalOpen(false); onChanged(); }} />}
    {releaseOpen && <ReleaseDialog api={api} target={{ orderId: order.id, version: order.version, patientName: order.patientName, doctorName: order.doctorName, values: order.items.map(item => ({ name: item.name, value: item.result?.value, text: item.result?.text, unit: item.unit, mark: item.result?.mark })) }}
      onClose={() => { setReleaseOpen(false); onChanged(); }} onReleased={outcome => { setReleaseOpen(false); setDone(releasedMessage(order.patientName, outcome)); onChanged(); }} />}
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

/**
 * Informe externo de una orden completada (T07b). Con archivo guardado: «Descargar», que pide un enlace firmado de
 * 5 minutos a la API (queda auditado). Solo con la referencia: se dice, y quien carga resultados puede subir el archivo.
 */
function ExternalReport({ api, order, canAttach }: { api: Api; order: LabOrder; canAttach: boolean }) {
  const detail = useData<{ attachments?: Attachment[] }>(api, `/laboratorio/ordenes/${order.id}`, order.version);
  const attachments = detail.data?.attachments ?? [];
  return <section className="lab-report" aria-label="Informe externo">
    <h4>Informe externo</h4>
    <RemoteState state={detail} skeletonRows={1}>{() => attachments.length ? <ul>{attachments.map(file => <AttachmentRow key={file.id} api={api} file={file} canAttach={canAttach} onStored={detail.refresh} />)}</ul> : <p className="muted">Sin adjuntos visibles.</p>}</RemoteState>
  </section>;
}

function AttachmentRow({ api, file, canAttach, onStored }: { api: Api; file: Attachment; canAttach: boolean; onStored: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<ApiError | null>(null);
  async function attempt(work: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setError(null);
    try { await work(); after?.(); } catch (e) { setError(spanishProblem(e instanceof ApiError ? e : new ApiError('No se pudo completar la operación.'))); } finally { setBusy(false); }
  }
  // R7 C2: a retry first shows which file was chosen and uploads only after «Confirmar y subir».
  const [chosen, setChosen] = useState<File | null>(null);
  function pick(picked: File | null) {
    const problem = attachmentProblem(picked);
    setChosen(null);
    if (problem || !picked) { setError(new ApiError(problem ?? 'Elige un archivo.')); return; }
    setError(null); setChosen(picked);
  }
  function upload() {
    const picked = chosen;
    if (!picked) return;
    void attempt(() => uploadAttachment(api, file.id, picked), () => { setChosen(null); onStored(); });
  }
  return <li>
    <Icon name="download" size={16} /><span><strong>{file.fileName}</strong> <span className="muted">{file.mimeType === 'application/pdf' ? 'PDF' : 'Foto'} · {formatBytes(file.sizeBytes)} · {formatDateTime(file.uploadedAt)}{file.uploadedByName ? ` · ${file.uploadedByName}` : ''}</span>
      {file.note && <small>{file.note}</small>}
      {file.stored
        ? <button type="button" className="secondary-button" disabled={busy} aria-label={`Descargar ${file.fileName}`} onClick={() => void attempt(() => downloadAttachment(api, file.id))}>{busy ? 'Preparando…' : 'Descargar'}</button>
        : <>
          <small className="muted">Solo se guardó la referencia del archivo (nombre, tipo, tamaño y huella) y los valores; el archivo no está en el sistema.</small>
          {canAttach && <span className="lab-attachment-retry"><Tag value="pendiente" label="Archivo pendiente" />
            <label className="secondary-button">{busy ? 'Subiendo el archivo…' : 'Reintentar'}<input type="file" className="sr-only" aria-label={`Subir archivo de ${file.fileName}`} accept={ATTACHMENT_ACCEPT} disabled={busy} onChange={event => { pick(event.target.files?.[0] ?? null); event.target.value = ''; }} /></label></span>}
          {canAttach && chosen && !busy && <span className="lab-attachment-confirm" role="group" aria-label="Confirmar archivo">
            <small>¿Subir «{chosen.name}» ({attachmentMimeType(chosen) === 'application/pdf' ? 'PDF' : 'Foto'} · {formatBytes(chosen.size)}) como el archivo de «{file.fileName}»?</small>
            <button type="button" className="primary-button" onClick={upload}>Confirmar y subir</button>
            <button type="button" className="secondary-button" onClick={() => setChosen(null)}>Elegir otro</button></span>}
        </>}
      {error && <Notice kind="error">{error.message}</Notice>}</span>
  </li>;
}

function SendExternalDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const action = useAction(api), [place, setPlace] = useState(''), [instructions, setInstructions] = useState(EXTERNAL_INSTRUCTIONS_TEMPLATE);
  const ready = place.trim().length >= 3 && instructions.trim().length >= 10;
  // R7 C-6: the API says whether the patient got the notice in the app; without the app, the instructions go on paper.
  const [sent, setSent] = useState<boolean | null>(null);
  async function save() {
    const done = await action.run<{ patientNotified?: boolean }>(`/laboratorio/ordenes/${order.id}/externa`, { version: order.version, place: place.trim(), instructions: instructions.trim() });
    if (!done) return;
    if (typeof done.patientNotified === 'boolean') setSent(done.patientNotified); else onSaved();
  }
  if (sent !== null) return <Dialog title="Examen en otro sitio" onClose={onSaved}><div className="module-form">
    <Notice kind={sent ? 'success' : 'info'}>{sent ? `${order.patientName} recibió el aviso en su app con el lugar y las instrucciones.` : `${order.patientName} no tiene la app: entrégale las instrucciones impresas.`}</Notice>
    <div className="lab-external lab-external-print" role="note"><strong>Se realiza en otro sitio: {place.trim()}</strong><p>{instructions.trim()}</p></div>
    <div className="dialog-actions">{!sent && <button className="secondary-button" type="button" onClick={() => window.print()}>Imprimir instrucciones</button>}<button className="primary-button" type="button" onClick={onSaved}>Listo</button></div>
  </div></Dialog>;
  return <Dialog title="Examen en otro sitio" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">La orden de {order.patientName} queda como externa: ya no se toma muestra aquí. El paciente ve el lugar y estas instrucciones en sus exámenes.</p>
    <WriteError error={action.error} onReload={onSaved} reloadLabel="Recargar la orden" />
    <Field label="Dónde se realiza" value={place} onChange={setPlace} required minLength={3} maxLength={200} autoFocus placeholder="Por ejemplo: Clínica de imágenes, ventanilla 2" />
    <FieldShell label="Instrucciones para el paciente">{id => <textarea id={id} value={instructions} onChange={event => setInstructions(event.target.value)} required minLength={10} maxLength={1000} rows={4} />}</FieldShell>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} disabled={!ready} label="Enviar a externo" /></div>
  </form></Dialog>;
}

/**
 * Resultado externo: adjunto (foto o PDF) + valor clave de cada examen (S10). Primero se guardan los valores con la
 * referencia del archivo; enseguida el archivo sube a la API, que lo guarda en el almacenamiento clínico privado (T07b).
 * Si el archivo no sube, los valores ya quedaron y se dice; se puede subir después desde la orden.
 */
function ExternalResultDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const action = useAction(api), [file, setFile] = useState<File | null>(null), [values, setValues] = useState<Record<string, string>>({}), [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState<ApiError | null>(null);
  const problem = attachmentProblem(file), missing = order.items.filter(item => !(values[item.id] ?? '').trim()).length;
  async function save() {
    if (!file || problem || missing) return;
    const sha256 = await fingerprintFile(file);
    const attachment = { fileName: file.name, mimeType: attachmentMimeType(file) ?? file.type, sizeBytes: file.size, ...(sha256 ? { sha256 } : {}) };
    const body = externalResultBody(order.version, attachment, order.items.map(item => ({ id: item.id, numeric: isNumeric(item) })), values, note);
    const saved = await action.run<{ attachmentId?: string }>(`/laboratorio/ordenes/${order.id}/resultado-externo`, body);
    if (!saved) return;
    if (saved.attachmentId) { setAttachmentId(saved.attachmentId); if (!await sendFile(saved.attachmentId, file)) return; }
    onSaved();
  }
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  async function sendFile(id: string, picked: File) {
    setUploading(true); setUploadError(null);
    try { await uploadAttachment(api, id, picked); return true; } catch (e) {
      setUploadError(spanishProblem(e instanceof ApiError ? e : new ApiError('No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.')));
      return false;
    } finally { setUploading(false); }
  }
  if (uploadError && file) return <Dialog title="Cargar resultado externo" onClose={onSaved} busy={uploading}><div className="module-form">
    <Notice kind="error">Los valores se guardaron, pero el archivo no se subió: {uploadError.message}</Notice>
    <p className="form-intro">Archivo pendiente: «{file.name}» ({formatBytes(file.size)}). Reintenta con este mismo archivo o súbelo después desde la orden, en «Informe externo».</p>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onSaved} disabled={uploading}>Más tarde</button>
      {attachmentId && <button className="primary-button" type="button" disabled={uploading} onClick={() => void sendFile(attachmentId, file).then(ok => { if (ok) onSaved(); })}>{uploading ? 'Subiendo archivo…' : `Reintentar con «${file.name}»`}</button>}</div>
  </div></Dialog>;
  const busy = action.busy || uploading;
  return <Dialog title="Cargar resultado externo" onClose={onClose} busy={busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">Adjunta el informe que trajo el paciente y escribe el valor clave de cada examen. La marca (normal, alta, crítica) la calcula el sistema. Al guardar, la orden queda completada y espera la revisión médica.</p>
    <WriteError error={action.error} onReload={onSaved} reloadLabel="Recargar la orden" />
    <FieldShell label="Informe (PDF o foto, hasta 10 MB)">{id => <input id={id} type="file" accept={ATTACHMENT_ACCEPT} onChange={event => setFile(event.target.files?.[0] ?? null)} aria-required="true" />}</FieldShell>
    {file && (problem ? <Notice kind="error">{problem}</Notice> : <p className="muted">{file.name} · {formatBytes(file.size)}</p>)}
    <fieldset className="lab-external-values"><legend>Valores clave</legend>
      {order.items.map(item => <Field key={item.id} label={`${item.name}${isNumeric(item) && item.unit ? ` (${item.unit})` : ''}`} type={isNumeric(item) ? 'number' : 'text'} step="any" value={values[item.id] ?? ''} onChange={value => setValues(current => ({ ...current, [item.id]: value }))} required />)}
    </fieldset>
    <Field label="Nota sobre el informe (opcional)" value={note} onChange={setNote} maxLength={1000} />
    <p className="muted lab-storage-note">El archivo se guarda en el expediente, en un almacenamiento privado: solo el personal que ve los valores puede descargarlo, nunca el paciente.</p>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Volver</button><SaveButton busy={busy} disabled={!!problem || missing > 0} label={uploading ? 'Subiendo archivo…' : 'Guardar resultado'} /></div>
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
  // R7 C1: each datum is compared in place with the order (same normalization as the API); the API still decides.
  const recordOk = identityCheck(expediente, order.patientRecord, value => value.trim()), nameOk = identityCheck(nombreCompleto, order.patientName, normalizeName);
  const mismatch = recordOk === false || nameOk === false;
  return <Dialog title="Confirmar identidad para toma de muestra" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">Pide al paciente su expediente y su nombre completo antes de tomar la muestra.</p>
    <WriteError error={spanishProblem(action.error)} onReload={onSaved} />
    <Field label="Número de expediente" value={expediente} onChange={setExpediente} required autoFocus />
    <IdentityHint ok={recordOk} />
    <Field label="Nombre completo" value={nombreCompleto} onChange={setNombreCompleto} required />
    <IdentityHint ok={nameOk} />
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><button className="primary-button" type="submit" disabled={action.busy || !expediente.trim() || !nombreCompleto.trim() || mismatch}>{action.busy ? 'Confirmando…' : 'Confirmar identidad'}</button></div></form></Dialog>;
}

const normalizeName = (value: string) => value.trim().toLocaleLowerCase('es-SV').replace(/\s+/g, ' ');
/** null while empty or when the order does not carry the datum; true/false once typed. */
export function identityCheck(typed: string, expected: string | null | undefined, normalize: (value: string) => string): boolean | null {
  if (!typed.trim() || !expected) return null;
  return normalize(typed) === normalize(expected);
}
function IdentityHint({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return <small className={`lab-identity ${ok ? 'is-ok' : 'is-bad'}`} role="status"><Icon name={ok ? 'check' : 'close'} size={14} />{ok ? 'Coincide con la orden' : 'No coincide con la orden'}</small>;
}

const resultText = (item: LabItem) => item.result ? `${item.result.text ?? item.result.value}${item.unit && item.result.text == null ? ` ${item.unit}` : ''}` : '';

/** S10: observación del laboratorio; si es relevante, se dice que el médico ya la tiene en su bandeja. */
function ObservationLine({ result }: { result: LabResult }) {
  if (!result.observation) return null;
  return <small className={`lab-observation${result.relevant ? ' is-relevant' : ''}`}>{result.relevant ? <><Icon name="info" size={14} />Observación relevante (enviada al médico): </> : 'Observación: '}{result.observation}</small>;
}

/** Read-only value of a completed or pending exam; amend once completed (`enmendar`). Capture happens in `ResultSheet`. */
function LabItemRow({ api, order, item, onChanged }: { api: Api; order: LabOrder; item: LabItem; onChanged: () => void }) {
  const [amending, setAmending] = useState(false);
  const title = <strong>{item.code} · {item.name}{item.unit ? <small className="muted"> ({item.unit})</small> : null}</strong>;
  return <div className="lab-result-row">{title}{item.result ? <span><Tag value={item.result.mark} /> {resultText(item)}</span> : <span>Resultado pendiente</span>}
    {item.result && <ObservationLine result={item.result} />}
    {allows(order, 'enmendar') && item.result && <button className="secondary-button" type="button" onClick={() => setAmending(true)}>Corregir resultado</button>}
    {amending && <AmendDialog api={api} order={order} item={item} onClose={() => setAmending(false)} onSaved={() => { setAmending(false); onChanged(); }} />}</div>;
}

type SheetRow = { raw: string; note: string; relevant: boolean; noteOpen: boolean; left: boolean };
const SHEET_MARK: Record<SheetMark, { label: string; status: string } | null> = { critico: { label: 'Crítico', status: 'critico_alto' }, fuera: { label: 'Fuera de rango', status: 'en_espera' }, normal: { label: 'Normal', status: 'completado' }, sin_rango: null };

/**
 * R7 U3, journey C1 (C-1): one sheet per order. Every exam in a table with its range beside it; Tab goes to the next
 * value; leaving a field flags it in place («Crítico», «Fuera de rango»). One primary action saves the whole sheet and,
 * with laboratorio.validar and every value present, completes the order. Critical values confirm first, naming the
 * doctor who will be notified. The stored mark is still the server's.
 */
function ResultSheet({ api, order, canComplete, onSaved }: { api: Api; order: LabOrder; canComplete: boolean; onSaved: (message: string) => void }) {
  const action = useAction(api);
  const [rows, setRows] = useState<Record<string, SheetRow>>(() => Object.fromEntries(order.items.map(item => [item.id, {
    raw: item.result ? String(item.result.text ?? item.result.value ?? '') : '', note: item.result?.observation ?? '', relevant: !!item.result?.relevant, noteOpen: !!item.result?.observation, left: !!item.result,
  }])));
  const [reason, setReason] = useState(''), [confirming, setConfirming] = useState(false);
  const patch = (id: string, change: Partial<SheetRow>) => setRows(current => ({ ...current, [id]: { ...current[id], ...change } }));
  const numericValue = (item: LabItem) => parseValue(rows[item.id].raw);
  const valid = (item: LabItem) => { const raw = rows[item.id].raw.trim(); return isNumeric(item) ? numericValue(item) !== null : raw.length > 0; };
  const mark = (item: LabItem): SheetMark => isNumeric(item) && numericValue(item) !== null ? markOf(numericValue(item)!, item.referenceRange) : 'sin_rango';
  const savedText = (item: LabItem) => item.result ? String(item.result.text ?? item.result.value ?? '') : '';
  const changed = order.items.filter(item => {
    const row = rows[item.id];
    return valid(item) && (row.raw.trim() !== savedText(item) || row.note.trim() !== (item.result?.observation ?? '') || row.relevant !== !!item.result?.relevant);
  });
  const corrections = changed.filter(item => !!item.result);
  const invalid = order.items.filter(item => rows[item.id].raw.trim() && !valid(item));
  const allFilled = order.items.every(valid);
  const completes = canComplete && allFilled;
  const critical = changed.filter(item => mark(item) === 'critico');
  const needsReason = corrections.length > 0 && !reason.trim();
  const count = completes ? order.items.length : changed.length;
  const label = completes ? `Guardar y completar (${count})` : `Guardar resultados (${count})`;
  const blocked = action.busy || invalid.length > 0 || needsReason || (!changed.length && !completes);
  async function save() {
    setConfirming(false);
    const items = changed.map(item => {
      const row = rows[item.id], note = row.note.trim();
      return { orderItemId: item.id, ...(isNumeric(item) ? { value: numericValue(item)! } : { text: row.raw.trim() }), ...(item.result ? { reason: reason.trim() } : {}), ...(note ? { observation: note, relevant: row.relevant } : {}) };
    });
    const result = items.length
      ? await action.run<{ state: string; criticalCount: number }>(`/laboratorio/ordenes/${order.id}/resultados/lote`, { version: order.version, items, ...(completes ? { complete: true } : {}) })
      : await action.run<{ state: string }>(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version }).then(r => r ? { ...r, criticalCount: 0 } : r);
    if (!result) return;
    const saved = items.length === 1 ? 'Se guardó 1 resultado' : `Se guardaron ${items.length} resultados`;
    const tail = result.state === 'completado' ? ' y la orden quedó completada; espera la revisión médica.' : '.';
    const warn = result.criticalCount ? ` ${result.criticalCount === 1 ? '1 valor crítico avisó' : `${result.criticalCount} valores críticos avisaron`} a ${order.doctorName ?? 'el médico que pidió la orden'}.` : '';
    onSaved(items.length ? `${saved}${tail}${warn}` : 'La orden quedó completada; espera la revisión médica.');
  }
  const submit = () => { if (blocked) return; if (critical.length) setConfirming(true); else void save(); };
  return <form className="lab-sheet" aria-label={`Resultados de ${order.patientName}`} onSubmit={event => { event.preventDefault(); submit(); }}>
    <table className="lab-sheet-table">
      <thead><tr><th scope="col">Examen</th><th scope="col">Valor</th><th scope="col">Referencia</th><th scope="col"><span className="sr-only">Marca</span></th></tr></thead>
      <tbody>{order.items.map(item => {
        const row = rows[item.id], shown = row.left && valid(item) ? SHEET_MARK[mark(item)] : null, bad = row.left && row.raw.trim() && !valid(item);
        return <tr key={item.id} className={shown?.label === 'Crítico' ? 'is-critical' : undefined}>
          <th scope="row"><span className="lab-sheet-name">{item.name}</span><small className="muted">{item.code}</small></th>
          <td><span className="lab-sheet-value">
            <input aria-label={`${item.name}${item.unit ? ` (${item.unit})` : ''}`} inputMode={isNumeric(item) ? 'decimal' : 'text'} value={row.raw} disabled={action.busy}
              aria-invalid={bad ? true : undefined} onChange={event => patch(item.id, { raw: event.target.value, left: false })} onBlur={() => patch(item.id, { left: true })} />
            {item.unit && <span className="muted">{item.unit}</span>}</span>
            {bad && <small className="field-error">Escribe un número, por ejemplo 5.1.</small>}
            {row.noteOpen
              ? <span className="lab-sheet-note"><input aria-label={`Observación de ${item.name}`} value={row.note} maxLength={1000} disabled={action.busy} placeholder="Observación" onChange={event => patch(item.id, { note: event.target.value, relevant: event.target.value.trim() ? row.relevant : false })} />
                <label className="lab-relevant"><input type="checkbox" checked={row.relevant} disabled={!row.note.trim() || action.busy} onChange={event => patch(item.id, { relevant: event.target.checked })} />Avisar al médico</label></span>
              : <button type="button" className="lab-sheet-add" onClick={() => patch(item.id, { noteOpen: true })}>Agregar observación</button>}
          </td>
          <td className="lab-num">{rangeText(item.referenceRange) || <span className="muted">Sin rango</span>}</td>
          <td aria-live="polite">{shown && <StatusBadge value={shown.status} label={shown.label} />}</td>
        </tr>;
      })}</tbody>
    </table>
    {corrections.length > 0 && <Field label={corrections.length === 1 ? 'Motivo de la corrección' : `Motivo de las ${corrections.length} correcciones`} value={reason} onChange={setReason} required maxLength={500} />}
    <WriteError error={spanishProblem(action.error)} onReload={() => onSaved('')} reloadLabel="Recargar la orden" />
    <div className="lab-sheet-actions">
      <span className="muted lab-num" role="status">{order.items.filter(valid).length} de {order.items.length} con valor{canComplete && !allFilled ? ' · completa cuando estén todos' : ''}</span>
      <button className="primary-button" type="submit" disabled={blocked}>{action.busy ? 'Guardando…' : label}</button>
    </div>
    {confirming && <Dialog title={critical.length === 1 ? '1 valor crítico' : `${critical.length} valores críticos`} onClose={() => setConfirming(false)}>
      <div className="module-form">
        <p className="form-intro">Se avisará a <strong>{order.doctorName ?? 'el médico que pidió la orden'}</strong> en cuanto guardes:</p>
        <ul className="lab-release-list">{critical.map(item => <li key={item.id} className="is-critical"><Icon name="alert" size={16} />{item.name} {rows[item.id].raw.trim()}{item.unit ? ` ${item.unit}` : ''} · referencia {rangeText(item.referenceRange)}</li>)}</ul>
        <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setConfirming(false)}>Revisar valores</button>
          <button className="primary-button" type="button" onClick={() => void save()}>{completes ? 'Guardar, completar y avisar' : 'Guardar y avisar'}</button></div>
      </div>
    </Dialog>}
  </form>;
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
