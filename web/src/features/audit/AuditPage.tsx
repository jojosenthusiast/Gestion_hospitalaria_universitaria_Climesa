import { useEffect, useMemo, useState } from 'react';
import { Field, Icon } from '../../components/ui';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { roleNames, type Api } from '../../lib/api';
import { Empty, Heading, RemoteState, Select, Tag, formatDateTime, useData } from '../common';
import { AuditDrawer } from './AuditDrawer';
import { AuditExport } from './AuditExport';
import { ChainPanel } from './ChainPanel';
import {
  PAGE_SIZES, activeCount, chips, defaultSort, describeAction, emptyFilters, pageQuery, presetLabel, presets, removeChip, resultNames,
  type AuditFilters, type AuditOptions, type AuditPageData, type AuditSort, type SortKey,
} from './query';
import './audit.css';

/** Espera a que la persona deje de teclear antes de consultar (cada consulta a la auditoría queda auditada). */
function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setSettled(value), ms); return () => window.clearTimeout(timer); }, [value, ms]);
  return settled;
}

const columns: { key: SortKey; label: string }[] = [
  { key: 'fecha', label: 'Fecha' }, { key: 'persona', label: 'Persona' }, { key: 'rol', label: 'Rol' }, { key: 'accion', label: 'Acción' },
  { key: 'entidad', label: 'Entidad' }, { key: 'paciente', label: 'Expediente' }, { key: 'resultado', label: 'Resultado' },
];

/** W32 · Espacio del auditor (DPD): búsqueda, filtros con chips, vistas rápidas, tabla ordenable y paginada, detalle, cadena y exportación. */
export function AuditPage({ api, version }: { api: Api; version: number }) {
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [sort, setSort] = useState<AuditSort>(defaultSort);
  const [page, setPage] = useState(1), [size, setSize] = useState(PAGE_SIZES[0]);
  const [panel, setPanel] = useState(false), [detail, setDetail] = useState<string | null>(null);
  const applied = useDebounced(filters, 350);
  const query = pageQuery(applied, sort, page, size);
  const data = useData<AuditPageData>(api, `/auditoria/registros${query}`, version);
  const options = useData<AuditOptions>(api, '/auditoria/opciones', version);

  const change = (patch: Partial<AuditFilters>) => { setFilters(current => ({ ...current, ...patch })); setPage(1); };
  const clear = () => { setFilters(emptyFilters); setPage(1); };
  const toggleResult = (result: string) => change({ results: filters.results.includes(result) ? filters.results.filter(r => r !== result) : [...filters.results, result] });
  const sortBy = (key: SortKey) => { setSort(current => ({ key, dir: current.key === key && current.dir === 'desc' ? 'asc' : 'desc' })); setPage(1); };
  const applyPreset = (id: string) => { const preset = presets.find(p => p.id === id); if (preset) { setFilters({ ...emptyFilters, ...preset.filters() }); setPage(1); } };
  const activePreset = presets.find(p => JSON.stringify(filters) === JSON.stringify({ ...emptyFilters, ...p.filters() }))?.id;

  const actionItems = useMemo<PickerItem[]>(() => {
    const codes = options.data?.acciones ?? [];
    const groups = [...new Set(codes.map(code => code.split('.')[0]))].map(noun => ({ id: `${noun}.`, label: `${noun}.`, detail: 'Todas las acciones de este grupo' }));
    return [...groups, ...codes.map(code => ({ id: code, label: code, detail: describeAction(code) }))];
  }, [options.data]);
  const entityItems = useMemo<PickerItem[]>(() => (options.data?.entidades ?? []).map(entity => ({ id: entity, label: entity })), [options.data]);
  const total = data.data?.total ?? 0, pages = Math.max(1, Math.ceil(total / size));
  const filterChips = chips(filters);
  const subtitle = filterChips.length ? `Filtros: ${filterChips.map(c => c.label).join('; ')}` : 'Sin filtros';

  return <>
    <Heading eyebrow="Protección de datos / Trazabilidad" title="Auditoría" description="Registro de solo inserción encadenado por hash (D-009). Quién hizo cada operación, cuándo y con qué resultado. No incluye valores clínicos."
      actions={<AuditExport api={api} total={total} subtitle={subtitle} queryFor={(p, s) => pageQuery(applied, sort, p, s, { exportar: 'true' })} />} />
    <ChainPanel api={api} onOpen={setDetail} />
    <section className="data-workbench audit-workbench">
      <div className="audit-presets segmented-control" role="group" aria-label="Vistas rápidas">
        {presets.map(p => <button key={p.id} type="button" title={p.hint} aria-pressed={activePreset === p.id} onClick={() => applyPreset(p.id)}>{p.label}</button>)}
      </div>
      <div className="table-toolbar audit-toolbar">
        <Field label="Buscar persona" value={filters.person} onChange={person => change({ person, personId: '' })} placeholder="Nombre o correo de la cuenta" hint="Se aplica al dejar de escribir." />
        <button type="button" className="secondary-button" aria-expanded={panel} aria-controls="audit-filters" onClick={() => setPanel(v => !v)}><Icon name="search" size={18} />Filtros{activeCount(filters) ? ` (${activeCount(filters)})` : ''}</button>
        <Select label="Filas por página" value={String(size)} onChange={v => { setSize(Number(v)); setPage(1); }}>{PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}</Select>
      </div>
      {panel && <div id="audit-filters" className="audit-filters" role="group" aria-label="Filtros de auditoría">
        <Field label="Expediente del paciente" value={filters.patient} onChange={patient => change({ patient })} placeholder="Número de expediente" hint="Mínimo 2 caracteres." />
        <Select label="Rol de quien actuó" value={filters.role} onChange={role => change({ role })}><option value="">Todos los roles</option>{(options.data?.roles ?? Object.keys(roleNames)).map(r => <option key={r} value={r}>{roleNames[r] ?? r} ({r})</option>)}</Select>
        <SearchPicker label="Acción" value={filters.action ? { id: filters.action, label: presetLabel(filters.action) ?? filters.action } : null} onChange={item => change({ action: item?.id ?? '' })} items={actionItems} minChars={0} placeholder="Escribe: consulta, laboratorio, usuarios…" />
        <SearchPicker label="Entidad" value={filters.entity ? { id: filters.entity, label: filters.entity } : null} onChange={item => change({ entity: item?.id ?? '' })} items={entityItems} minChars={0} placeholder="Paciente, consulta, cama…" />
        <fieldset className="audit-results"><legend>Resultado</legend>
          {Object.entries(resultNames).map(([value, label]) => <label key={value}><input type="checkbox" checked={filters.results.includes(value)} onChange={() => toggleResult(value)} />{label}</label>)}
        </fieldset>
        <Field label="Desde" type="date" value={filters.from} onChange={from => change({ from })} />
        <Field label="Hasta" type="date" value={filters.to} onChange={to => change({ to })} />
      </div>}
      {filterChips.length > 0 && <div className="audit-chips" aria-label="Filtros activos">
        {filterChips.map(chip => <span className="audit-chip" key={chip.key}>{chip.label}<button type="button" aria-label={`Quitar filtro ${chip.label}`} onClick={() => { setFilters(removeChip(filters, chip.key)); setPage(1); }}><Icon name="close" size={14} /></button></span>)}
        <button type="button" className="row-action" onClick={clear}>Quitar filtros</button>
      </div>}
      <RemoteState state={data}>{result => result.filas.length
        ? <>
          <table className="record-table audit-table"><caption className="sr-only">Operaciones auditadas, ordenadas por {sort.key} {sort.dir === 'asc' ? 'de menor a mayor' : 'de mayor a menor'}</caption>
            <thead><tr>{columns.map(col => <th key={col.key} aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className="audit-sort" onClick={() => sortBy(col.key)}>{col.label}<span aria-hidden="true">{sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}</span></button></th>)}<th>Detalle</th></tr></thead>
            <tbody>{result.filas.map(r => <tr key={r.seq}>
              <td data-label="Fecha">{formatDateTime(r.at)}<small className="mono">N.º {r.seq}</small></td>
              <td data-label="Persona"><strong>{r.actor ?? 'Sistema'}</strong></td>
              <td data-label="Rol">{r.role ?? '—'}</td>
              <td data-label="Acción">{describeAction(r.action)}<small className="mono">{r.action}</small></td>
              <td data-label="Entidad">{r.entity}</td>
              <td data-label="Expediente">{r.patientRecord ?? '—'}</td>
              <td data-label="Resultado"><Tag value={r.result} label={resultNames[r.result]} />{r.reason === 'acceso_excepcional' && <small>Acceso excepcional (módulo retirado)</small>}</td>
              <td data-label="Detalle"><button type="button" className="row-action" aria-label={`Ver detalle del registro ${r.seq}`} onClick={() => setDetail(r.seq)}>Ver <Icon name="arrow" size={16} /></button></td>
            </tr>)}</tbody></table>
          <nav className="audit-pager" aria-label="Paginación">
            <span>{(result.pagina - 1) * result.limite + 1}–{(result.pagina - 1) * result.limite + result.filas.length} de {result.total} registros</span>
            <div><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => setPage(page - 1)}><Icon name="back" size={16} />Anterior</button>
              <span>Página {page} de {pages}</span>
              <button type="button" className="secondary-button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente<Icon name="arrow" size={16} /></button></div>
          </nav>
        </>
        : <Empty title={filterChips.length ? 'Ningún registro coincide' : 'Todavía no hay actividad'} description={filterChips.length ? 'Quita algún filtro o amplía el rango de fechas para ver más operaciones.' : 'Todavía no hay operaciones auditadas.'} />}</RemoteState>
      <p className="table-footnote">La auditoría no incluye valores clínicos. Consultar, abrir un detalle y exportar quedan registrados en la misma auditoría.</p>
    </section>
    {detail && <AuditDrawer api={api} seq={detail} version={version} onClose={() => setDetail(null)} onOpen={setDetail} />}
  </>;
}
