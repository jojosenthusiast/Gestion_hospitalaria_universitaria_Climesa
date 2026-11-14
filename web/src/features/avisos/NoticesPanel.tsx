import { useState } from 'react';
import type { Api } from '../../lib/api';
import { useRefreshAt } from '../../lib/publico';
import { useData } from '../common';
import { NoticeCard } from './NoticePreview';
import type { MyNotices } from './rules';
import './avisos.css';

const COLLAPSED = 2;

/**
 * Avisos de mi tablero de inicio (obs. 14): los públicos y los dirigidos a mis roles, por prioridad.
 * Solo lectura; sin avisos no ocupa lugar. Se vuelve a pedir con el evento `aviso` y cuando uno vence.
 */
export function NoticesPanel({ api, version }: { api: Api; version: number }) {
  const state = useData<MyNotices>(api, '/me/avisos', version);
  const [all, setAll] = useState(false);
  useRefreshAt(state.data?.proximoCambio, state.refresh);
  const notices = state.data?.avisos ?? [];
  if (!notices.length) return null;
  const shown = all ? notices : notices.slice(0, COLLAPSED);
  return <section className="notice-panel" aria-label="Avisos para ti">
    <header><h2>Avisos</h2><span>{notices.length} vigente{notices.length === 1 ? '' : 's'}</span></header>
    <div className="notice-list">{shown.map(n => <NoticeCard key={n.id} notice={n} compact />)}</div>
    {notices.length > COLLAPSED && <button type="button" className="row-action" aria-expanded={all} onClick={() => setAll(v => !v)}>{all ? 'Mostrar menos' : `Ver los ${notices.length} avisos`}</button>}
  </section>;
}
