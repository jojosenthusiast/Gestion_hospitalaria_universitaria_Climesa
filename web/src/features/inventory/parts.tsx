import { Icon } from '../../components/ui';
import { categories, gaugePercent, minimumMarkPercent, statusLabels, type ArticleSummary, type ArticleType, type StockStatus } from './model';

export function CategoryIcon({ type, size = 22 }: { type: ArticleType; size?: number }) {
  return <span className={`inv-item-icon inv-cat-${type}`} role="img" aria-label={categories[type].label} title={categories[type].label}><Icon name={categories[type].icon} size={size} /></span>;
}
export const StatusChip = ({ status }: { status: StockStatus }) => <span className={`inv-tag inv-tag-${status}`}>{statusLabels[status]}</span>;
/** Existencia frente al mínimo: la marca vertical es el mínimo; llenar hasta el doble del mínimo es 100 %. */
export function StockGauge({ article }: { article: Pick<ArticleSummary, 'available' | 'minimum' | 'status' | 'unit'> }) {
  return <div className="inv-gauge" data-status={article.status} role="img" aria-label={`Existencia ${article.available} ${article.unit}, mínimo ${article.minimum}`}>
    <span style={{ width: `${gaugePercent(article)}%` }} />{article.minimum > 0 && <i style={{ left: `${minimumMarkPercent(article)}%` }} />}
  </div>;
}
