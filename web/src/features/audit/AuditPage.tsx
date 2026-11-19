import { useEffect, useMemo, useState } from 'react';
import { Field, Icon } from '../../components/ui';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { roleNames, type Api } from '../../lib/api';
import { Empty, CompactHeader, RemoteState, Select, Tag, formatDateTime, useData } from '../common';
import { ActiveFilters } from '../listas/chips';
import { AuditDrawer } from './AuditDrawer';
import { AuditExport } from './AuditExport';
import { ChainPanel } from './ChainPanel';
import { CrudButton } from '../../components/system';
import { useQuickAction } from '../personal/accion';
import { readHashParams, writeHashParams } from '../../lib/hash-params';
import {
  PAGE_SIZES, actionLabel, activeCount, chips, defaultSort, effectiveFilters, emptyFilters, pageQuery, removeChip, resultNames, roleText, viewOf, views,
  type AuditFilters, type AuditOptions, type AuditPageData, type AuditRowData, type AuditSort, type SortKey, type ViewId,
} from './query';
import { actionArea, actionSentence, entityName } from './labels';
import './audit.css';

/** Espera a que la persona deje de teclear antes de consultar (cada consulta a la auditoría queda auditada). */
function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setSettled(value), ms); return () => window.clearTimeout(timer); }, [value, ms]);
  return settled;
}

const columns: { key: SortKey; label: string }[] = [
  { key: 'fecha', label: 'Fecha' }, { key: 'persona', label: 'Persona' }, { key: 'rol', label: 'Rol' }, { key: 'accion', label: 'Qué hizo' },
  { key: 'entidad', label: 'Sobre qué' }, { key: 'resultado', label: 'Resultado' },
];

/** What a row refers to, in words: the kind of thing and, when known, which one (record number, account, bed). */
function Subject({ row }: { row: AuditRowData }) {
  const which = row.patientRecord ? `Expediente ${row.patientRecord}` : row.subject;
  return <>{entityName(row.entity)}{which && <small>{which}</small>}</>;
}

/** W32 · Espacio del auditor (DPD): búsqueda, filtros con chips, vistas rápidas, tabla ordenable y paginada, detalle, cadena y exportación. */
export function AuditPage({ api, version }: { api: Api; version: number }) {
  // `#/auditoria?resultado=denegado,fallido` (Inicio, «Eventos denegados o fallidos») opens the list already filtered.
  const [initial] = useState(() => (readHashParams().get('resultado') ?? '').split(',').filter(r => r in resultNames));
  const linkedFailures = initial.length === 2 && initial.includes('denegado') && initial.includes('fallido');
  const [view, setView] = useState<ViewId>(linkedFailures ? 'fallos' : 'todo');
  const [filters, setFilters] = useState<AuditFilters>(() => (initial.length && !linkedFailures ? { ...emptyFilters, results: initial } : emptyFilters));
  useEffect(() => { if (readHashParams().get('resultado')) writeHashParams({ resultado: null }); }, []);
  // `?accion=verificar` (Inicio, «Verificar la cadena») runs the chain check once.
  const [quick, consumeQuick] = useQuickAction();
  const [verifyNow, setVerifyNow] = useState(false);
  useEffect(() => { if (!quick) return; if (quick === 'verificar') setVerifyNow(true); consumeQuick(); }, [quick, consumeQuick]);
  const [sort, setSort] = useState<AuditSort>(defaultSort);
  const [page, setPage] = useState(1), [size, setSize] = useState(PAGE_SIZES[0]);
  const [panel, setPanel] = useState(false), [detail, setDetail] = useState<string | null>(null);
  const settled = useDebounced(filters, 350);
  const applied = effectiveFilters(settled, view);
  const query = pageQuery(applied, sort, page, size);
  const data = useData<AuditPageData>(api, `/auditoria/registros${query}`, version);
  const options = useData<AuditOptions>(api, '/auditoria/opciones', version);

  const change = (patch: Partial<AuditFilters>) => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const clear = () => { setFilters(emptyFilters); setPage(1); };
  const toggleResult = (result: string) => change({ results: filters.results.includes(result) ? filters.results.filter(r => r !== result) : [...filters.results, result] });
  const sortBy = (key: SortKey) => { setSort(current => ({ key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' })); setPage(1); };
  // A view replaces only what it is about; the person, dates and other narrowing filters stay.
  const chooseView = (id: ViewId) => { setView(id); setFilters(current => ({ ...current, action: '', results: [] })); setPage(1); };
  const current = viewOf(view);

  // Grouped by area, each group first with «Todo en …», then its actions in words (codes only in the detail).
  const actionItems = useMemo<PickerItem[]>(() => {
    const codes = options.data?.acciones ?? [];
    const areas = [...new Set(codes.map(code => code.split('.')[0]))].sort((a, b) => actionArea(`${a}.`).localeCompare(actionArea(`${b}.`), 'es'));
    return areas.flatMap(prefix => [
      { id: `${prefix}.`, label: `Todo en ${actionArea(`${prefix}.`)}`, detail: 'Todas las acciones de esta área' },
      ...codes.filter(code => code.split('.')[0] === prefix).map(code => ({ id: code, label: actionSentence(code), detail: actionArea(code) })),
    ]);
  }, [options.data]);
  const entityItems = useMemo<PickerItem[]>(() => (options.data?.entidades ?? []).map(entity => ({ id: entity, label: entityName(entity) })).sort((a, b) => a.label.localeCompare(b.label, 'es')), [options.data]);
  const total = data.data?.total ?? 0, pages = Math.max(1, Math.ceil(total / size));
  const filterChips = chips(filters);
  const subtitle = [current.label, ...filterChips.map(c => c.label)].join('; ');

  return <>
    <CompactHeader breadcrumb="Protección de datos / Trazabilidad" title="Auditoría" actions={<AuditExport api={api} total={total} subtitle={subtitle} queryFor={(p, s) => pageQuery(applied, sort, p, s, { exportar: 'true' })}/>}/>
    <ChainPanel api={api} onOpen={setDetail} autoRun={verifyNow} />
    <section className="data-workbench">
      <div className="audit-presets segmented-control" role="group" aria-label="Qué actividad ver">
        {views.map(v => <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => chooseView(v.id)}>{v.label}</button>)}
      </div>
      <p className="audit-view-hint">{current.hint}</p>
      <div className="table-toolbar audit-toolbar">
        <Field label="Buscar persona" value={filters.person} onChange={person => change({ person, personId: '' })} placeholder="Nombre o correo de la cuenta" hint="Se aplica al dejar de escribir." />
        <label className="audit-mine"><input type="checkbox" checked={filters.includeMine} onChange={() => change({ includeMine: !filters.includeMine })} />Incluir mis consultas a la auditoría</label>
        <button type="button" className="secondary-button" aria-expanded={panel} aria-controls="audit-filters" onClick={() => setPanel(v => !v)}><Icon name="search" size={18} />Filtros{activeCount(filters) ? ` (${activeCount(filters)})` : ''}</button>
        <Select label="Filas por página" value={String(size)} onChange={v => { setSize(Number(v)); setPage(1); }}>{PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}</Select>
      </div>
      {panel && <div id="audit-filters" className="audit-filters" role="group" aria-label="Filtros de auditoría">
        <Field label="Expediente del paciente" value={filters.patient} onChange={patient => change({ patient })} placeholder="Número de expediente" hint="Mínimo 2 caracteres." />
        <Select label="Rol de quien actuó" value={filters.role} onChange={role => change({ role })}><option value="">Todos los roles</option>{(options.data?.roles ?? Object.keys(roleNames)).map(r => <option key={r} value={r}>{roleNames[r] ?? r}</option>)}</Select>
        <SearchPicker label="Qué hizo" value={filters.action ? { id: filters.action, label: actionLabel(filters.action) } : null} onChange={item => change({ action: item?.id ?? '' })} items={actionItems} minChars={0} placeholder="Escribe: consultó, roles, laboratorio…" hint={current.action ? `Busca dentro de «${current.label}».` : undefined} />
        <SearchPicker label="Sobre qué" value={filters.entity ? { id: filters.entity, label: entityName(filters.entity) } : null} onChange={item => change({ entity: item?.id ?? '' })} items={entityItems} minChars={0} placeholder="Cuenta, paciente, cama…" />
        {!current.results && <fieldset className="audit-results"><legend>Resultado</legend>
          {Object.entries(resultNames).map(([value, label]) => <label key={value}><input type="checkbox" checked={filters.results.includes(value)} onChange={() => toggleResult(value)} />{label}</label>)}
        </fieldset>}
        <Field label="Desde" type="date" value={filters.from} onChange={from => change({ from })} />
        <Field label="Hasta" type="date" value={filters.to} onChange={to => change({ to })} />
      </div>}
      <div className="audit-active-filters"><ActiveFilters filters={filterChips.map(chip => ({ key: chip.key, label: chip.label, remove: () => { setFilters(removeChip(filters, chip.key)); setPage(1); } }))} onClear={clear} /></div>
      <RemoteState state={data}>{result => result.filas.length
        ? <>
          <table className="record-table audit-table"><caption className="sr-only">Operaciones auditadas, ordenadas por {sort.key} {sort.dir === 'asc' ? 'de menor a mayor' : 'de mayor a menor'}</caption>
            <thead><tr>{columns.map(col => <th key={col.key} aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className="audit-sort" onClick={() => sortBy(col.key)}>{col.label}<span aria-hidden="true">{sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button></th>)}<th><span className="sr-only">Detalle</span></th></tr></thead>
            <tbody>{result.filas.map(r => <tr key={r.seq}>
              <td data-label="Fecha">{formatDateTime(r.at, { withYear: true })}</td>
              <td data-label="Persona"><strong>{r.actor ?? 'Sistema'}</strong></td>
              <td data-label="Rol">{roleText(r.role) || '—'}</td>
              <td data-label="Qué hizo">{actionSentence(r.action)}{r.reason === 'acceso_excepcional' && <small>Acceso excepcional (módulo retirado)</small>}</td>
              <td data-label="Sobre qué"><Subject row={r} /></td>
              <td data-label="Resultado"><Tag value={r.result} label={resultNames[r.result]} /></td>
              <td data-label="Detalle"><CrudButton kind="view" iconOnly label={`Ver detalle: ${actionSentence(r.action)}`} onClick={() => setDetail(r.seq)} /></td>
            </tr>)}</tbody></table>
          <nav className="audit-pager" aria-label="Paginación">
            <span>{(result.pagina - 1) * result.limite + 1}–{(result.pagina - 1) * result.limite + result.filas.length} de {result.total} registros</span>
            <div><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="back" size={16} />Anterior</button>
              <span>Página {page} de {pages}</span>
              <button type="button" className="secondary-button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente<Icon name="arrow" size={16} /></button></div>
          </nav>
        </>
        : <Empty title={filterChips.length || view !== 'todo' ? 'Ningún registro coincide' : 'Todavía no hay actividad'} description={filterChips.length || view !== 'todo' ? 'Quita algún filtro o amplía el rango de fechas para ver más operaciones.' : 'Todavía no hay operaciones auditadas.'} />}</RemoteState>
      <p className="table-footnote">La auditoría no incluye valores clínicos. Consultar, abrir un detalle y exportar quedan registrados en la misma auditoría; tus propias consultas se ocultan de esta lista salvo que marques «Incluir mis consultas a la auditoría».</p>
    </section>
    {detail && <AuditDrawer api={api} seq={detail} version={version} onClose={() => setDetail(null)} onOpen={setDetail} />}
  </>;
}
