import { useMemo, useState } from 'react';
import { ExportMenu } from '../../components/export-menu';
import { Icon } from '../../components/ui';
import { CrudActions, CrudButton } from '../../components/system';
import type { Api } from '../../lib/api';
import { Dialog, Empty, RemoteState, Select, Tag, WriteError, formatDate, formatDateTime, useAction, useData } from '../common';
import { CategoryIcon, StatusChip, StockGauge } from './parts';
import { categories, expiryText, movementLabels, movementsExport, quantityText, signedQuantity, todayIso, unitPlural, warehouseNames, type ArticleDetail, type ArticleMovement, type Lot, type MovementType, type Warehouse } from './model';

type Props = { api: Api; id: string; version: number; canMove: boolean; canConfigure: boolean; onBack: () => void; onMove: (articleId: string) => void; onEdit: (a: ArticleDetail) => void; onLot: (a: ArticleDetail, lot: Lot | null) => void; onChanged: () => void; onGone: () => void };

export function ArticleDetailPane(props: Props) {
  const state = useData<ArticleDetail>(props.api, `/inventario/articulos/${props.id}`, props.version);
  return <RemoteState state={state}>{article => <Body {...props} article={article} />}</RemoteState>;
}

/** A warehouse by its name, with the short code as quiet secondary text; unknown codes stay as they are. */
function Place({ code, names }: { code: string | null; names: Map<string, string> }) {
  if (!code) return <>—</>;
  const name = names.get(code);
  return name ? <span className="inv-place" title={code}>{name} <small className="inv-muted">{code}</small></span> : <>{code}</>;
}

function Body({ api, article, canMove, canConfigure, onBack, onMove, onEdit, onLot, onGone }: Props & { article: ArticleDetail }) {
  const today = todayIso(), action = useAction(api), [confirming, setConfirming] = useState(false), [typeFilter, setTypeFilter] = useState<MovementType | 'todos'>('todos');
  const [opened, setOpened] = useState<ArticleMovement | null>(null);
  const catalog = useData<Warehouse[]>(api, '/inventario/bodegas');
  const names = useMemo(() => warehouseNames(article, Array.isArray(catalog.data) ? catalog.data : []), [article, catalog.data]);
  const lotsInUse = article.lotList.filter(l => l.active), retired = article.lotList.filter(l => !l.active);
  const movements = article.movements.filter(m => typeFilter === 'todos' || m.type === typeFilter);
  const removable = article.lotList.length === 0;
  async function remove() { if (await action.run(`/inventario/articulos/${article.id}`, {}, 'DELETE')) onGone(); }
  return <div className="inv-detail">
    <button type="button" className="secondary-button inv-back" onClick={onBack}><Icon name="back" size={18} />Volver a la lista</button>
    <header className="inv-detail-head">
      <div className="inv-detail-title"><CategoryIcon type={article.type} size={26} /><div><h2>{article.name}</h2><span className="inv-muted">{article.code} · {categories[article.type].label} · {article.unit}</span></div></div>
      <div className="inv-detail-actions">
        {canMove && article.active && <button type="button" className="secondary-button" onClick={() => onMove(article.id)}><Icon name="plus" size={18} />Registrar movimiento</button>}
        {canConfigure && <CrudButton kind="edit" label="Editar artículo" onClick={() => onEdit(article)} />}
        {canConfigure && <CrudButton kind="create" label="Nuevo lote" onClick={() => onLot(article, null)} />}
        {canConfigure && (removable ? <CrudButton kind="deactivate" label="Eliminar" onClick={() => setConfirming(true)} /> : article.active && <CrudButton kind="deactivate" label="Desactivar" onClick={() => onEdit(article)} title="Con lotes o historial no se elimina; se desactiva al editarlo" />)}
      </div>
    </header>
    {confirming && <div className="conflict-notice" role="alertdialog" aria-label="Confirmar eliminación"><p>¿Eliminar «{article.name}»? Solo se puede porque no tiene lotes ni historial. No se puede deshacer.</p><div className="inv-detail-actions"><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Conservar</button><CrudButton kind="deactivate" label="Sí, eliminar" disabled={action.busy} onClick={() => void remove()} /></div></div>}
    <WriteError error={action.error} />
    <div className="inv-stats">
      <div><span className="inv-muted">Existencia usable</span><strong>{quantityText(article.available, article.unit)}</strong><StockGauge article={article} /></div>
      <div><span className="inv-muted">Mínimo</span><strong>{quantityText(article.minimum, article.unit)}</strong><StatusChip status={article.status} /></div>
      <div><span className="inv-muted">Por vencer (30 días)</span><strong className={article.expiringSoon > 0 ? 'inv-soon' : undefined}>{quantityText(article.expiringSoon, article.unit)}</strong></div>
      <div><span className="inv-muted">Vencida</span><strong className={article.expired > 0 ? 'inv-expired' : undefined}>{quantityText(article.expired, article.unit)}</strong></div>
    </div>

    <section className="inv-section" aria-label="Existencia por bodega"><header><h3>Existencia por bodega</h3></header>
      {article.warehouses.length ? <div className="inv-table-wrap"><table className="inv-table"><thead><tr><th>Bodega</th><th>Cantidad</th></tr></thead><tbody>{article.warehouses.map(w => <tr key={w.warehouseId}><td><Place code={w.warehouseCode} names={names} /></td><td>{quantityText(w.quantity, article.unit)}</td></tr>)}</tbody></table></div> : <p className="inv-muted">Sin existencia en ninguna bodega.</p>}
    </section>

    <section className="inv-section" aria-label="Lotes"><header><h3>Lotes y vencimientos</h3></header>
      {lotsInUse.length || retired.length ? <div className="inv-table-wrap"><table className="inv-table"><caption className="sr-only">Lotes del artículo</caption><thead><tr><th>Lote</th><th>Vencimiento</th><th>Existencia</th><th>Bodegas</th>{canConfigure && <th><span className="sr-only">Acción</span></th>}</tr></thead>
        <tbody>{[...lotsInUse, ...retired].map(lot => <tr key={lot.id}>
          <td><strong>{lot.number}</strong>{!lot.active && <> <Tag value="inactivo" label="Dado de baja" /></>}</td>
          <td>{lot.expiresAt ? formatDate(lot.expiresAt) : 'No vence'}<br /><span className={lot.expired ? 'inv-expired' : expiryText(lot.expiresAt, today).startsWith('Vence') ? 'inv-soon' : 'inv-muted'}>{expiryText(lot.expiresAt, today)}</span></td>
          <td>{quantityText(lot.total, article.unit)}</td>
          <td>{lot.warehouses.length ? <ul className="inv-lot-places">{lot.warehouses.map(w => <li key={w.warehouseId}><Place code={w.warehouseCode} names={names} />: {w.quantity}</li>)}</ul> : '—'}</td>
          {canConfigure && <td><CrudActions><CrudButton kind="edit" iconOnly label={`Editar lote ${lot.number}`} onClick={() => onLot(article, lot)} /></CrudActions></td>}
        </tr>)}</tbody></table></div> : <p className="inv-muted">Todavía no hay lotes. {canConfigure ? 'Crea uno o registra una entrada con su número de lote.' : ''}</p>}
    </section>

    <section className="inv-section" aria-label="Historial de movimientos"><header><h3>Historial de movimientos</h3>
      <div className="inv-toolbar-row inv-history-tools"><Select label="Tipo" value={typeFilter} onChange={v => setTypeFilter(v as MovementType | 'todos')}><option value="todos">Todos</option>{(Object.keys(movementLabels) as MovementType[]).map(t => <option key={t} value={t}>{movementLabels[t].label}</option>)}</Select>
        <ExportMenu table={() => movementsExport({ ...article, movements }, names)} disabled={!movements.length} /></div></header>
      {movements.length ? <div className="inv-table-wrap"><table className="inv-table inv-history"><thead><tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Cantidad</th><th>Origen → destino</th><th>Motivo</th><th>Registró</th><th><span className="sr-only">Detalle</span></th></tr></thead>
        <tbody>{movements.map(m => <tr key={m.id} onClick={() => setOpened(m)}><td>{formatDateTime(m.registeredAt)}</td><td>{movementLabels[m.type].label}</td><td>{m.lotNumber}</td><td>{signedQuantity(m)}</td><td>{m.originWarehouseCode || m.destinationWarehouseCode ? <>{m.originWarehouseCode && <Place code={m.originWarehouseCode} names={names} />}{m.originWarehouseCode && m.destinationWarehouseCode && ' → '}{m.destinationWarehouseCode && <Place code={m.destinationWarehouseCode} names={names} />}</> : '—'}</td><td>{m.reason ?? '—'}</td><td>{m.authorName}</td>
          <td><CrudActions><CrudButton kind="view" iconOnly label={`Ver detalle del movimiento del ${formatDateTime(m.registeredAt)}`} onClick={e => { e.stopPropagation(); setOpened(m); }} /></CrudActions></td></tr>)}</tbody></table></div>
        : <Empty title="Sin movimientos" description="Cada entrada, consumo, traslado, ajuste o merma queda registrado aquí." />}
    </section>
    {opened && <MovementDetail article={article} movement={opened} names={names} onClose={() => setOpened(null)} />}
  </div>;
}

/** Owner obs. 10 «ver detalle mayor»: one movement with full warehouse names, lot, reason and who registered it. */
function MovementDetail({ article, movement: m, names, onClose }: { article: ArticleDetail; movement: ArticleMovement; names: Map<string, string>; onClose: () => void }) {
  const lot = article.lotList.find(l => l.number === m.lotNumber);
  const place = (code: string | null) => code ? names.get(code) ? `${names.get(code)} (${code})` : code : '—';
  return <Dialog title={`${movementLabels[m.type].label} · ${formatDateTime(m.registeredAt)}`} onClose={onClose}>
    <div className="module-form">
      <p className="inv-muted">{movementLabels[m.type].help}</p>
      <dl className="detail-grid inv-movement-detail">
        <div><dt>Artículo</dt><dd>{article.name} <span className="inv-muted">{article.code}</span></dd></div>
        <div><dt>Cantidad</dt><dd>{signedQuantity(m)} {Math.abs(m.quantity) === 1 ? article.unit : unitPlural(article.unit)}</dd></div>
        <div><dt>Lote</dt><dd>{m.lotNumber}{lot ? <span className="inv-muted"> · {lot.expiresAt ? `vence ${formatDate(lot.expiresAt)}` : 'no vence'}</span> : null}</dd></div>
        <div><dt>Sale de</dt><dd>{place(m.originWarehouseCode)}</dd></div>
        <div><dt>Llega a</dt><dd>{place(m.destinationWarehouseCode)}</dd></div>
        <div><dt>Motivo</dt><dd>{m.reason ?? '—'}</dd></div>
        <div><dt>Registró</dt><dd>{m.authorName}</dd></div>
        <div><dt>Fecha y hora</dt><dd>{formatDateTime(m.registeredAt)}</dd></div>
      </dl>
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div>
    </div>
  </Dialog>;
}
