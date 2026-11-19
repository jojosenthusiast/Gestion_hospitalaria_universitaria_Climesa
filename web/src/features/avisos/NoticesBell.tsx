import { Icon } from '../../components/ui';
import type { Api } from '../../lib/api';
import { useRefreshAt } from '../../lib/publico';
import { useData } from '../common';
import { inboxState, type Inbox } from './rules';

/**
 * Notices one click away on every screen (they used to live only in the sidebar): a bell in the header with the unread
 * count of the account's inbox, the same `/me/avisos/bandeja` the Avisos page reads. Critical unread ones tint it.
 */
/** Lote 5 S1: the badge shows up to 99 and then «99+», the same cap as Android, so a busy inbox is never cut to «9+». */
export const badgeCount = (unread: number) => (unread > 99 ? '99+' : String(unread));

export function NoticesBell({ api, version, current }: { api: Api; version: number; current: boolean }) {
  const inbox = useData<Inbox>(api, '/me/avisos/bandeja', version);
  // A notice that starts or ends changes the count with no event: read again at the next change, like the Avisos page.
  useRefreshAt(inbox.data?.proximoCambio, inbox.refresh);
  const unread = inbox.data?.noLeidos ?? 0;
  // Only notices in force tint the bell: expired and scheduled ones in the history cannot be acknowledged.
  const critical = (inbox.data?.avisos ?? []).some(a => inboxState(a) === 'vigente' && a.nivel === 'critico' && !a.enteradoEn);
  const label = unread ? `Avisos, ${unread} sin leer` : 'Avisos';
  return <a className={`notices-bell${critical ? ' is-critical' : ''}`} href={unread ? '#/avisos?filtro=sin-leer' : '#/avisos'} aria-label={label} title={label} aria-current={current ? 'page' : undefined}>
    <Icon name="bell" size={20} />
    {unread > 0 && <span className="notices-bell-count" aria-hidden="true">{badgeCount(unread)}</span>}
  </a>;
}
