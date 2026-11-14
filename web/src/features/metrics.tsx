import { useState } from 'react';
import { Field, Notice } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Heading, RemoteState, useData } from './common';

/** Respuesta de `GET /metricas/{indicador}` (FR-113-05). */
export type IndicatorSeries = { indicador: string; unidad: string; desde: string; hasta: string; actualizadoEn: string; serie: { fecha: string; valor: number | null; muestras: number }[] };
export const indicators: { id: string; label: string }[] = [
  { id: 'ocupacion_diaria', label: 'Ocupación diaria' },
  { id: 'estancia_promedio', label: 'Estancia promedio' },
  { id: 'tiempo_laboratorio', label: 'Tiempo de laboratorio (orden a completado)' },
  { id: 'tiempo_ambulancia', label: 'Tiempo de respuesta de la ambulancia' },
  { id: 'cobertura_turnos', label: 'Horas con hueco de cobertura' },
];
const units: Record<string, string> = { porcentaje: '%', dias: 'días', minutos: 'min', horas_con_hueco: 'h' };
const localDay = (offsetDays = 0) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

function Indicator({ api, id, label, from, to, version }: { api: Api; id: string; label: string; from: string; to: string; version: number }) {
  const data = useData<IndicatorSeries>(api, `/metricas/${id}?desde=${from}&hasta=${to}`, version);
  return <section className="board-card board-card-wide" aria-label={label}><h2>{label}</h2>
    <RemoteState state={data}>{s => <table className="record-table"><caption className="sr-only">{label} por día</caption><thead><tr><th>Día</th><th>Valor</th></tr></thead>
      <tbody>{s.serie.map(p => <tr key={p.fecha}><td data-label="Día">{p.fecha}</td><td data-label="Valor">{p.valor == null ? <span className="muted">Sin datos</span> : `${p.valor} ${units[s.unidad] ?? s.unidad}`}</td></tr>)}</tbody></table>}</RemoteState>
  </section>;
}

/** W33 · métricas detalladas por rango (máximo 31 días). Solo agregados. */
export function MetricsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [from, setFrom] = useState(() => localDay(-6)), [to, setTo] = useState(() => localDay());
  if (!can(profile, 'metricas.ver')) return <Notice kind="info">Tu cuenta no tiene permiso para ver las métricas.</Notice>;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  return <>
    <Heading eyebrow="CLIMESA / Métricas" title="Métricas" description="Indicadores agregados por día, sin datos personales." />
    <div className="form-grid"><Field label="Desde" type="date" value={from} onChange={setFrom} /><Field label="Hasta" type="date" value={to} onChange={setTo} /></div>
    {!valid ? <Notice kind="info">Elige un rango con el fin igual o posterior al inicio.</Notice>
      : <div className="board-grid board-grid-detail">{indicators.map(i => <Indicator key={i.id} api={api} id={i.id} label={i.label} from={from} to={to} version={version} />)}</div>}
  </>;
}
