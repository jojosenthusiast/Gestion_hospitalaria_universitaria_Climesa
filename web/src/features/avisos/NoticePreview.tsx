import { Icon, type IconName } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { audienceText, levelLabel, priorityLabel, type Level, type NoticeAudience } from './rules';

const levelIcon: Record<Level, IconName> = { critico: 'alert', importante: 'chevronsUp', informativo: 'info' };
/** Clase de prioridad del sistema (02-sistema §3) para cada nivel: el rojo es solo de «Crítico». */
const levelTone: Record<Level, string> = { critico: 'emergencia', importante: 'urgente', informativo: 'rutina' };
/** Tono de la tarjeta (avisos.css) para cada nivel. */
const cardTone: Record<Level, string> = { critico: 'critico', importante: 'urgente', informativo: 'atencion' };

/** Nivel de un aviso con ícono + etiqueta (S7): el color acompaña, nunca va solo. */
export function NoticeLevelBadge({ level }: { level: Level | undefined }) {
  const value = level ?? 'informativo';
  return <span className={`priority-badge priority-${levelTone[value]} notice-level`}><Icon name={levelIcon[value]} size={14} /><span>{levelLabel(value)}</span></span>;
}

/**
 * Cómo se ve un aviso: la misma tarjeta sirve para la vista previa y el detalle. Con nivel, el tono sale del nivel.
 * `emptyAudience` es el texto cuando no hay público, roles ni áreas: en la vista previa de quien publica es un aviso sin
 * audiencia; quien lo recibe en «Para mí» lo tiene por su área (llega por /me/avisos sin códigos), como en iOS.
 */
export function NoticeCard({ notice, compact = false, showAudience = true, emptyAudience = 'sin audiencia' }: { notice: Pick<NoticeAudience, 'titulo' | 'cuerpo' | 'prioridad' | 'publico' | 'roles' | 'nivel' | 'areas'> & { hasta?: string | null }; compact?: boolean; showAudience?: boolean; emptyAudience?: string }) {
  const until = notice.hasta ? formatDateTime(notice.hasta) : null;
  const tone = notice.nivel ? cardTone[notice.nivel] : notice.prioridad;
  const label = notice.nivel ? levelLabel(notice.nivel) : priorityLabel(notice.prioridad);
  return <article className={`notice-card notice-${tone}${compact ? ' is-compact' : ''}`} aria-label={`Aviso ${label.toLowerCase()}: ${notice.titulo}`}>
    <span className="notice-card-icon" aria-hidden="true"><Icon name={tone === 'atencion' ? 'megaphone' : 'alert'} size={20} /></span>
    <div>
      <div className="notice-card-head"><strong>{notice.titulo || 'Título del aviso'}</strong>{notice.nivel ? <NoticeLevelBadge level={notice.nivel} /> : <span className="notice-badge">{label}</span>}</div>
      <p>{notice.cuerpo || 'Aquí aparece el texto que van a leer.'}</p>
      {(showAudience || until) && <small>{showAudience && <>Para: {audienceText(notice) || emptyAudience}</>}{showAudience && until && ' · '}{until && <>Hasta {until}</>}</small>}
    </div>
  </article>;
}
