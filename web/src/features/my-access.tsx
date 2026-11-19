import { useState } from 'react';
import type { Api } from '../lib/api';
import { formatShortDay, formatTime, localDayKey } from '../lib/format';
import { CompactHeader, RemoteState, useData } from './common';
import './my-access.css';

/** One row of `GET /me/accesos` (FR-110-08): date, role, data type and reason, never the staff member's name. */
export type AccessEntry = { fecha: string; rol: string; tipoDato: string; motivo: string };
/** Days of the last week stay open; older days fold under one line (same as Android). */
export const RECENT_DAYS = 7;

/** Rows grouped by hospital day, newest first; rows without a readable date are left out. */
export function accessDays(rows: readonly AccessEntry[], now: Date = new Date()) {
  const today = localDayKey(now), cutoff = localDayKey(new Date(now.valueOf() - (RECENT_DAYS - 1) * 86_400_000));
  const sorted = rows.filter(r => r.fecha && !Number.isNaN(Date.parse(r.fecha))).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const days = new Map<string, AccessEntry[]>();
  for (const r of sorted) { const key = localDayKey(r.fecha); days.set(key, [...(days.get(key) ?? []), r]); }
  return [...days].map(([day, entries]) => ({ day, older: day < cutoff && day !== today, entries }));
}

/** Lote 5 S16, «no se mira quien vio mi expediente en paciente»: the patient's own access log on the web. */
export function MyAccessPage({ api, version }: { api: Api; version: number }) {
  const data = useData<AccessEntry[]>(api, '/me/accesos', version);
  const [olderOpen, setOlderOpen] = useState(false);
  return <>
    <CompactHeader breadcrumb="Mi expediente / Transparencia" title="Quién vio mi expediente" />
    <p className="my-access-intro">Fecha, rol y motivo de cada consulta a tu información. No mostramos nombres del personal.</p>
    <RemoteState state={data} empty={rows => rows.length ? null : 'Nadie del personal ha consultado tu expediente todavía.'}>{rows => {
      const days = accessDays(rows), recent = days.filter(d => !d.older), older = days.filter(d => d.older);
      const olderCount = older.reduce((n, d) => n + d.entries.length, 0);
      const shown = olderOpen ? days : recent;
      return <div className="my-access">
        {shown.map(d => <section key={d.day} className="my-access-day" aria-label={formatShortDay(d.day)}>
          <h2>{formatShortDay(d.day)}</h2>
          <ol>{d.entries.map((e, i) => <li key={`${e.fecha}-${i}`}>
            <time dateTime={e.fecha}>{formatTime(e.fecha)}</time>
            <div><strong>{e.rol || 'Personal del hospital'}</strong><span>{e.tipoDato} · motivo: {e.motivo}</span></div>
          </li>)}</ol>
        </section>)}
        {olderCount > 0 && <button type="button" className="cl-link-button" onClick={() => setOlderOpen(!olderOpen)}>{olderOpen ? 'Ocultar consultas anteriores' : `Ver ${olderCount === 1 ? '1 consulta anterior' : `${olderCount} consultas anteriores`}`}</button>}
      </div>;
    }}</RemoteState>
  </>;
}
