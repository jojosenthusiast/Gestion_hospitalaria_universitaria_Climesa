import { Icon } from '../../components/ui';
import { audienceText, priorityLabel, type NoticeAudience } from './rules';

/** Cómo se ve un aviso: la misma tarjeta sirve para la vista previa, el tablero de inicio y el listado. */
export function NoticeCard({ notice, compact = false, showAudience = true }: { notice: Pick<NoticeAudience, 'titulo' | 'cuerpo' | 'prioridad' | 'publico' | 'roles'> & { hasta?: string | null }; compact?: boolean; showAudience?: boolean }) {
  const until = notice.hasta ? new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/El_Salvador' }).format(new Date(notice.hasta)) : null;
  return <article className={`notice-card notice-${notice.prioridad}${compact ? ' is-compact' : ''}`} aria-label={`Aviso ${priorityLabel(notice.prioridad).toLowerCase()}: ${notice.titulo}`}>
    <span className="notice-card-icon" aria-hidden="true"><Icon name={notice.prioridad === 'atencion' ? 'megaphone' : 'alert'} size={20} /></span>
    <div>
      <div className="notice-card-head"><strong>{notice.titulo || 'Título del aviso'}</strong><span className="notice-badge">{priorityLabel(notice.prioridad)}</span></div>
      <p>{notice.cuerpo || 'Aquí aparece el texto que van a leer.'}</p>
      {(showAudience || until) && <small>{showAudience && <>Para: {audienceText(notice) || 'sin audiencia'}</>}{showAudience && until && ' · '}{until && <>Hasta {until}</>}</small>}
    </div>
  </article>;
}
