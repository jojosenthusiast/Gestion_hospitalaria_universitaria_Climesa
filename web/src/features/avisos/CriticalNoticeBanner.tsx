import { useEffect, useState } from 'react';
import { Icon } from '../../components/ui';
import type { Api } from '../../lib/api';
import { useRefreshAt } from '../../lib/publico';
import { useAction, useData, WriteError } from '../common';
import { NoticeLevelBadge } from './NoticePreview';
import type { Inbox, NoticeAck } from './rules';
import './avisos.css';

/**
 * S11 · Aviso crítico persistente en el inicio. Solo los críticos dirigidos al rol o al área de la cuenta que siguen sin
 * «Enterado» (`destacado` lo decide la API). Se queda hasta el «Enterado»; «Recordarme en N h» lo aparta y vuelve solo
 * cuando la API lo anuncia en `proximoCambio` (una recarga en ese instante, sin sondeo) o por el evento `aviso`.
 */
export function CriticalNoticeBanner({ api, version }: { api: Api; version: number }) {
  const inbox = useData<Inbox>(api, '/me/avisos/bandeja', version);
  useRefreshAt(inbox.data?.proximoCambio, inbox.refresh);
  const action = useAction(api);
  // Hidden right after a successful write until the next answer from the API arrives (it already reflects the write).
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => setHidden([]), [inbox.data]);
  const pending = (inbox.data?.avisos ?? []).filter(n => n.destacado && !hidden.includes(n.id));
  if (!pending.length) return null;
  const notice = pending[0], hours = inbox.data?.recordatorioHoras ?? 4;
  async function send(verb: 'enterado' | 'posponer') {
    if (await action.run<NoticeAck>(`/me/avisos/${notice.id}/${verb}`, {})) { setHidden(current => [...current, notice.id]); inbox.refresh(); }
  }
  return <section className="critical-banner" role="alert" aria-labelledby={`aviso-critico-${notice.id}`}>
    <span className="critical-banner-icon" aria-hidden="true"><Icon name="alert" size={24} /></span>
    <div className="critical-banner-body">
      <div className="critical-banner-meta"><NoticeLevelBadge level="critico" />{pending.length > 1 && <span>1 de {pending.length} sin «Enterado»</span>}</div>
      <h2 id={`aviso-critico-${notice.id}`}>{notice.titulo}</h2>
      <p>{notice.cuerpo}</p>
      <WriteError error={action.error} />
      <div className="critical-banner-actions">
        <button type="button" className="primary-button" disabled={action.busy} onClick={() => void send('enterado')}><Icon name="check" size={18} />Enterado</button>
        <button type="button" className="secondary-button" disabled={action.busy} onClick={() => void send('posponer')}>Recordarme en {hours} h</button>
        <a className="row-action" href="#/avisos?filtro=criticos">Ver en Avisos <Icon name="arrow" size={16} /></a>
      </div>
    </div>
  </section>;
}
