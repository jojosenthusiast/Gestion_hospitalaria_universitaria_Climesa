import { useState } from 'react';
import { ExportMenu } from '../../components/export-menu';
import { Icon } from '../../components/ui';
import type { Api } from '../../lib/api';
import { Empty, RemoteState, WriteError, formatDate, formatDateTime, useAction, useData } from '../common';
import { CategoryIcon, StatusChip, StockGauge } from './parts';
import { categories, expiryText, movementLabels, movementsExport, quantityText, todayIso, type ArticleDetail, type Lot, type MovementType } from './model';

type Props = { api: Api; id: string; version: number; canMove: boolean; canConfigure: boolean; onBack: () => void; onMove: (articleId: string) => void; onEdit: (a: ArticleDetail) => void; onLot: (a: ArticleDetail, lot: Lot | null) => void; onChanged: () => void; onGone: () => void };

export function ArticleDetailPane(props: Props) {
  const state = useData<ArticleDetail>(props.api, `/inventario/articulos/${props.id}`, props.version);
  return <RemoteState state={state}>{article => <Body {...props} article={article} />}</RemoteState>;
}

function Body({ api, article, canMove, canConfigure, onBack, onMove, onEdit, onLot, onGone }: Props & { article: ArticleDetail }) {
  const today = todayIso(), action = useAction(api), [confirming, setConfirming] = useState(false), [typeFilter, setTypeFilter] = useState<MovementType | 'todos'>('todos');
  const lotsInUse = article.lotList.filter(l => l.active), retired = article.lotList.filter(l => !l.active);
  const movements = article.movements.filter(m => typeFilter === 'todos' || m.type === typeFilter);
  const removable = article.lotList.length === 0;
  async function remove() { if (await action.run(`/inventario/articulos/${article.id}`, {}, 'DELETE')) onGone(); }
  return <div className="inv-detail">
    <button type="button" className="secondary-button inv-back" onClick={onBack}><Icon name="back" size={18} />Volver a la lista</button>
    <header className="inv-detail-head">
      <div className="inv-detail-title"><CategoryIcon type={article.type} size={26} /><div><h2>{article.name}</h2><span className="inv-muted">{article.code} · {categories[article.type].label} · {article.unit}</span></div></div>
      <div className="inv-detail-actions">
        {canMove && article.active && <button type="button" className="primary-button" onClick={() => onMove(article.id)}><Icon name="plus" size={18} />Registrar movimiento</button>}
        {canConfigure && <button type="button" className="secondary-button" onClick={() => onEdit(article)}>Editar artículo</button>}
        {canConfigure && <button type="button" className="secondary-button" onClick={() => onLot(article, null)}>Nuevo lote</button>}
        {canConfigure && (removable ? <button type="button" className="secondary-button" onClick={() => setConfirming(true)}>Eliminar</button> : article.active && <button type="button" className="secondary-button" onClick={() => onEdit(article)} title="Con lotes o historial no se elimina; se desactiva al editarlo">Desactivar</button>)}
      </div>
    </header>
    {confirming && <div className="conflict-notice" role="alertdialog" aria-label="Confirmar eliminación"><p>¿Eliminar «{article.name}»? Solo se puede porque no tiene lotes ni historial. No se puede deshacer.</p><div className="inv-detail-actions"><button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Conservar</button><button type="button" className="primary-button" disabled={action.busy} onClick={() => void remove()}>Sí, eliminar</button></div></div>}
    <WriteError error={action.error} />
    <div className="inv-stats">
      <div><span className="inv-muted">Existencia usable</span><strong>{quantityText(article.available, article.unit)}</strong><StockGauge article={article} /></div>
      <div><span className="inv-muted">Mínimo</span><strong>{quantityText(article.minimum, article.unit)}</strong><StatusChip status={article.status} /></div>
      <div><span className="inv-muted">Por vencer (30 días)</span><strong className={article.expiringSoon > 0 ? 'inv-soon' : undefined}>{quantityText(article.expiringSoon, article.unit)}</strong></div>
      <div><span className="inv-muted">Vencida</span><strong className={article.expired > 0 ? 'inv-expired' : undefined}>{quantityText(article.expired, article.unit)}</strong></div>
    </div>

    <section className="inv-section" aria-label="Existencia por bodega"><header><h3>Existencia por bodega</h3></header>
      {article.warehouses.length ? <div className="inv-table-wrap"><table className="inv-table"><thead><tr><th>Bodega</th><th>Cantidad</th></tr></thead><tbody>{article.warehouses.map(w => <tr key={w.warehouseId}><td>{w.warehouseName} <span className="inv-muted">{w.warehouseCode}</span></td><td>{quantityText(w.quantity, article.unit)}</td></tr>)}</tbody></table></div> : <p className="inv-muted">Sin existencia en ninguna bodega.</p>}
    </section>

    <section className="inv-section" aria-label="Lotes"><header><h3>Lotes y vencimientos</h3></header>
      {lotsInUse.length || retired.length ? <div className="inv-table-wrap"><table className="inv-table"><caption className="sr-only">Lotes del artículo</caption><thead><tr><th>Lote</th><th>Vencimiento</th><th>Existencia</th><th>Bodegas</th>{canConfigure && <th><span className="sr-only">Acción</span></th>}</tr></thead>
        <tbody>{[...lotsInUse, ...retired].map(lot => <tr key={lot.id}>
          <td><strong>{lot.number}</strong>{!lot.active && <> <span className="inv-tag inv-tag-inactivo">Dado de baja</span></>}</td>
          <td>{lot.expiresAt ? formatDate(lot.expiresAt) : 'No vence'}<br /><span className={lot.expired ? 'inv-expired' : expiryText(lot.expiresAt, today).startsWith('Vence') ? 'inv-soon' : 'inv-muted'}>{expiryText(lot.expiresAt, today)}</span></td>
          <td>{quantityText(lot.total, article.unit)}</td>
          <td>{lot.warehouses.length ? lot.warehouses.map(w => `${w.warehouseCode}: ${w.quantity}`).join(' · ') : '—'}</td>
          {canConfigure && <td><button type="button" className="row-action" onClick={() => onLot(article, lot)}>Editar</button></td>}
        </tr>)}</tbody></table></div> : <p className="inv-muted">Todavía no hay lotes. {canConfigure ? 'Crea uno o registra una entrada con su número de lote.' : ''}</p>}
    </section>

    <section className="inv-section" aria-label="Historial de movimientos"><header><h3>Historial de movimientos</h3>
      <div className="inv-toolbar-row"><label className="inv-muted" htmlFor="inv-move-type">Tipo</label><select id="inv-move-type" value={typeFilter} onChange={e => setTypeFilter(e.target.value as MovementType | 'todos')}><option value="todos">Todos</option>{(Object.keys(movementLabels) as MovementType[]).map(t => <option key={t} value={t}>{movementLabels[t].label}</option>)}</select>
        <ExportMenu table={() => movementsExport({ ...article, movements })} disabled={!movements.length} /></div></header>
      {movements.length ? <div className="inv-table-wrap"><table className="inv-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Cantidad</th><th>De → a</th><th>Motivo</th><th>Registró</th></tr></thead>
        <tbody>{movements.map(m => <tr key={m.id}><td>{formatDateTime(m.registeredAt)}</td><td>{movementLabels[m.type].label}</td><td>{m.lotNumber}</td><td>{m.quantity > 0 && m.type !== 'entrada' && m.type !== 'ajuste' && m.type !== 'traslado' ? `−${m.quantity}` : m.quantity}</td><td>{[m.originWarehouseCode, m.destinationWarehouseCode].filter(Boolean).join(' → ') || '—'}</td><td>{m.reason}</td><td>{m.authorName}</td></tr>)}</tbody></table></div>
        : <Empty title="Sin movimientos" description="Cada entrada, consumo, traslado, ajuste o merma queda registrado aquí." />}
    </section>
  </div>;
}
