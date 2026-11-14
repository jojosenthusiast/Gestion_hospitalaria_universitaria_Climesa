import { useMemo, useState } from 'react';
import { ExportMenu } from '../../components/export-menu';
import { Icon } from '../../components/ui';
import type { AccessProfile, Api } from '../../lib/api';
import { Empty, Heading, RemoteState, useData } from '../common';
import { ArticleDetailPane } from './ArticleDetailPane';
import { ArticleDialog, LotDialog } from './ArticleForms';
import { MovementDialog } from './MovementDialog';
import { CategoryIcon, StatusChip, StockGauge } from './parts';
import { activeFilterCount, articleExport, canConfigure as hasConfigure, categories, emptyFilters, filterArticles, movementTypesFor, quantityText, sortArticles, sortLabels, statusLabels, statusOrder, type ArticleDetail, type ArticleSummary, type ArticleType, type Filters, type Lot, type SortKey, type StockStatus } from './model';
import './inventory.css';

type Dialog = { kind: 'move'; articleId?: string } | { kind: 'article'; article: ArticleDetail | null } | { kind: 'lot'; article: ArticleDetail; lot: Lot | null } | null;

/** Inventario como maestro-detalle: artículos a la izquierda, el artículo elegido (lotes, bodegas, historial) a la derecha. */
export function InventoryWorkspace({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [reload, setReload] = useState(0), list = useData<ArticleSummary[]>(api, '/inventario/articulos', version + reload);
  const [selected, setSelected] = useState<string | null>(null), [filters, setFilters] = useState<Filters>(emptyFilters), [panel, setPanel] = useState(false), [sort, setSort] = useState<SortKey>('estado'), [dialog, setDialog] = useState<Dialog>(null);
  const moveTypes = movementTypesFor(profile.permissions), configure = hasConfigure(profile.permissions);
  const refresh = () => setReload(v => v + 1);
  const scopeLabel = useMemo(() => profile.permissions.filter(p => p.code === 'inventario.mover').some(p => p.context === 'x') ? 'Todas las categorías' : moveTypes.length === 1 ? 'Consumo de insumos de tu área' : 'Reactivos del laboratorio', [profile.permissions, moveTypes.length]);
  return <div className="inv">
    <Heading eyebrow="Operaciones / Recursos" title="Inventario" description={`${scopeLabel}. Artículos, lotes con vencimiento y movimientos trazables, sin saldos negativos.`}
      actions={<>{moveTypes.length > 0 && <button className="primary-button" onClick={() => setDialog({ kind: 'move', articleId: selected ?? undefined })}><Icon name="plus" size={18} />Registrar movimiento</button>}{configure && <button className="secondary-button" onClick={() => setDialog({ kind: 'article', article: null })}>Nuevo artículo</button>}</>} />
    <RemoteState state={list}>{rows => <Master rows={rows} selected={selected} setSelected={setSelected} filters={filters} setFilters={setFilters} panel={panel} setPanel={setPanel} sort={sort} setSort={setSort}
      detail={selected ? <ArticleDetailPane api={api} id={selected} version={version + reload} canMove={moveTypes.length > 0} canConfigure={configure} onBack={() => setSelected(null)} onMove={id => setDialog({ kind: 'move', articleId: id })} onEdit={article => setDialog({ kind: 'article', article })} onLot={(article, lot) => setDialog({ kind: 'lot', article, lot })} onChanged={refresh} onGone={() => { setSelected(null); refresh(); }} /> : null} />}</RemoteState>
    {dialog?.kind === 'move' && list.data && <MovementDialog api={api} profile={profile} articles={list.data} allowedTypes={moveTypes} initialArticleId={dialog.articleId} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
    {dialog?.kind === 'article' && <ArticleDialog api={api} article={dialog.article} onClose={() => setDialog(null)} onSaved={id => { setDialog(null); if (id && !dialog.article) setSelected(id); refresh(); }} />}
    {dialog?.kind === 'lot' && <LotDialog api={api} article={dialog.article} lot={dialog.lot} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
  </div>;
}

function Master({ rows, selected, setSelected, filters, setFilters, panel, setPanel, sort, setSort, detail }: { rows: ArticleSummary[]; selected: string | null; setSelected: (id: string | null) => void; filters: Filters; setFilters: (f: Filters) => void; panel: boolean; setPanel: (open: boolean) => void; sort: SortKey; setSort: (s: SortKey) => void; detail: React.ReactNode }) {
  const counts = useMemo(() => Object.fromEntries(statusOrder.map(s => [s, rows.filter(r => r.status === s).length])) as Record<StockStatus, number>, [rows]);
  const shown = useMemo(() => sortArticles(filterArticles(rows, filters), sort), [rows, filters, sort]);
  const count = activeFilterCount(filters), toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter(x => x !== value) : [...list, value];
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...(filters.query.trim() ? [{ key: 'q', label: `Búsqueda: ${filters.query.trim()}`, remove: () => setFilters({ ...filters, query: '' }) }] : []),
    ...filters.types.map(t => ({ key: `t-${t}`, label: categories[t].plural, remove: () => setFilters({ ...filters, types: filters.types.filter(x => x !== t) }) })),
    ...filters.statuses.map(s => ({ key: `s-${s}`, label: statusLabels[s], remove: () => setFilters({ ...filters, statuses: filters.statuses.filter(x => x !== s) }) })),
  ];
  const suggestions = filters.query.trim().length >= 2 ? shown.slice(0, 5) : [];
  return <>
    <div className="inv-summary" role="group" aria-label="Resumen por estado">
      {(['agotado', 'bajo_minimo', 'por_vencer', 'ok'] as StockStatus[]).map(s => <button key={s} type="button" className={`tone-${s}`} aria-pressed={filters.statuses.includes(s)} onClick={() => setFilters({ ...filters, statuses: toggle(filters.statuses, s) })}><strong>{counts[s]}</strong><span>{statusLabels[s]}</span></button>)}
    </div>
    <div className="inv-layout" data-selected={selected ? 'true' : 'false'}>
      <section className="inv-pane inv-pane-list" aria-label="Artículos">
        <div className="inv-toolbar">
          <div className="inv-toolbar-row">
            <div className="field"><label htmlFor="inv-search">Buscar artículo</label><input id="inv-search" type="search" autoComplete="off" placeholder="Nombre, código o categoría" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></div>
            <button type="button" className="secondary-button" aria-expanded={panel} aria-controls="inv-filters" onClick={() => setPanel(!panel)}>Filtros{count - (filters.query.trim() ? 1 : 0) > 0 ? ` (${count - (filters.query.trim() ? 1 : 0)})` : ''}</button>
            <ExportMenu table={() => articleExport(shown, chips.map(c => c.label).join(' · '))} disabled={!shown.length} />
          </div>
          {suggestions.length > 0 && !selected && <p className="inv-muted" role="status">{shown.length} {shown.length === 1 ? 'resultado' : 'resultados'}: {suggestions.map(s => s.name).join(', ')}{shown.length > suggestions.length ? '…' : ''}</p>}
          {panel && <div className="inv-filter-panel" id="inv-filters">
            <fieldset><legend>Categoría</legend>{(Object.keys(categories) as ArticleType[]).map(t => <button key={t} type="button" className="inv-toggle" aria-pressed={filters.types.includes(t)} onClick={() => setFilters({ ...filters, types: toggle(filters.types, t) })}><Icon name={categories[t].icon} size={16} />{categories[t].plural}</button>)}</fieldset>
            <fieldset><legend>Estado</legend>{statusOrder.map(s => <button key={s} type="button" className="inv-toggle" aria-pressed={filters.statuses.includes(s)} onClick={() => setFilters({ ...filters, statuses: toggle(filters.statuses, s) })}>{statusLabels[s]}</button>)}</fieldset>
            <div className="field"><label htmlFor="inv-sort">Ordenar por</label><select id="inv-sort" value={sort} onChange={e => setSort(e.target.value as SortKey)}>{(Object.keys(sortLabels) as SortKey[]).map(k => <option key={k} value={k}>{sortLabels[k]}</option>)}</select></div>
          </div>}
          {(chips.length > 0) && <div className="inv-chips" aria-label="Filtros activos">{chips.map(c => <span className="inv-chip" key={c.key}>{c.label}<button type="button" aria-label={`Quitar ${c.label}`} onClick={c.remove}>×</button></span>)}<button type="button" className="secondary-button" onClick={() => setFilters(emptyFilters)}>Quitar filtros</button></div>}
        </div>
        {shown.length ? <ul className="inv-list">{shown.map(a => <li key={a.id}><button type="button" className={`inv-item inv-cat-${a.type}`} aria-current={selected === a.id} onClick={() => setSelected(a.id)}>
          <CategoryIcon type={a.type} />
          <span className="inv-item-title"><strong>{a.name}</strong><StatusChip status={a.status} /></span>
          <small>{a.code} · {quantityText(a.available, a.unit)} de mínimo {a.minimum}{a.nextExpiry ? ` · vence ${a.nextExpiry}` : ''}</small>
          <StockGauge article={a} />
        </button></li>)}</ul> : <div className="inv-empty">{rows.length ? <><strong>Ningún artículo coincide.</strong><p>Prueba con otra palabra o quita los filtros.</p></> : <Empty title="No hay artículos" description="Cuando se registren artículos y lotes aparecerán aquí." />}</div>}
      </section>
      <section className="inv-pane inv-pane-detail" aria-label="Detalle del artículo">{detail ?? <div className="inv-empty"><strong>Elige un artículo</strong><p>Verás sus lotes con vencimiento, la existencia por bodega y su historial.</p></div>}</section>
    </div>
  </>;
}
