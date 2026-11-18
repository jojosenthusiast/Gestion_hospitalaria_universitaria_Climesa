import { Icon } from '../../components/ui';
import type { Api } from '../../lib/api';
import { useData } from '../common';
import type { Inbox } from './rules';

/**
 * Notices one click away on every screen (they used to live only in the sidebar): a bell in the header with the unread
 * count of the account's inbox, the same `/me/avisos/bandeja` the Avisos page reads. Critical unread ones tint it.
 */
export function NoticesBell({ api, version, current }: { api: Api; version: number; current: boolean }) {
  const inbox = useData<Inbox>(api, '/me/avisos/bandeja', version);
  const unread = inbox.data?.noLeidos ?? 0;
  const critical = (inbox.data?.avisos ?? []).some(a => a.nivel === 'critico' && !a.enteradoEn);
  const label = unread ? `Avisos, ${unread} sin leer` : 'Avisos';
  return <a className={`notices-bell${critical ? ' is-critical' : ''}`} href={unread ? '#/avisos?filtro=sin-leer' : '#/avisos'} aria-label={label} title={label} aria-current={current ? 'page' : undefined}>
    <Icon name="bell" size={20} />
    {unread > 0 && <span className="notices-bell-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
  </a>;
}
