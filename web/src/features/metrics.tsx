import { useState } from 'react';
import { BarChart, LineChart, Legend, type Tone } from '../components/charts';
import { ExportMenu } from '../components/export-menu';
import { Field, Notice } from '../components/ui';
import { exportName, type ExportTable } from '../lib/export';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Heading, RemoteState, useData, type Remote } from './common';

/** Respuesta de `GET /metricas/{indicador}` (FR-113-05). */
export type IndicatorSeries = { indicador: string; unidad: string; desde: string; hasta: string; actualizadoEn: string; serie: { fecha: string; valor: number | null; muestras: number }[] };
export type Indicator = {
  id: string; label: string;
  /** Qué mide, en una línea. */
  what: string;
  /** Cómo leerlo: qué es bueno y qué es malo. */
  how: string;
  /** Referencias de operación (no son metas clínicas): a partir de `warn` es ámbar y de `danger` rojo; menos es mejor. */
  warn: number; danger: number;
  chart: 'line' | 'bar';
};
export const indicators: Indicator[] = [
  { id: 'ocupacion_diaria', label: 'Ocupación diaria', what: 'Porcentaje de las camas de hospitalización que no estaban libres cada día.', how: 'Menos es más holgura. Por encima de 90 % casi no queda cama para un ingreso urgente.', warn: 70, danger: 90, chart: 'line' },
  { id: 'estancia_promedio', label: 'Estancia promedio', what: 'Días que, en promedio, permanece un paciente en cama, contando las estancias que terminaron ese día.', how: 'Si sube sin explicación, revisa altas retrasadas o casos complejos. Menos días suele ser mejor.', warn: 4, danger: 7, chart: 'line' },
  { id: 'tiempo_laboratorio', label: 'Tiempo de laboratorio (orden a completado)', what: 'Minutos entre que se pide el examen y su resultado queda completo.', how: 'Menos es mejor. Una subida sostenida indica cola acumulada o falta de reactivos.', warn: 60, danger: 120, chart: 'line' },
  { id: 'tiempo_ambulancia', label: 'Tiempo de respuesta de la ambulancia', what: 'Minutos entre la solicitud (o el despacho) y la llegada de la unidad a la escena.', how: 'Menos es mejor: cada minuto cuenta en una emergencia.', warn: 15, danger: 30, chart: 'line' },
  { id: 'cobertura_turnos', label: 'Horas con hueco de cobertura', what: 'Horas del día en que un área tuvo menos personal que el mínimo definido.', how: 'Lo ideal es cero. Cada hora con hueco es un turno por reforzar.', warn: 1, danger: 6, chart: 'bar' },
];
const units: Record<string, string> = { porcentaje: '%', dias: 'días', minutos: 'min', horas_con_hueco: 'h' };
const localDay = (offsetDays = 0) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);
const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const presets = [{ days: 7, label: 'Últimos 7 días' }, { days: 14, label: 'Últimos 14 días' }, { days: 30, label: 'Últimos 30 días' }];

const readTone = (value: number | null, spec: Indicator): Tone | 'neutral' => value == null ? 'neutral' : value >= spec.danger ? 'danger' : value >= spec.warn ? 'warn' : 'ok';
const toneWord = { ok: 'Dentro de lo esperado', warn: 'Requiere atención', danger: 'Crítico', neutral: 'Sin datos' } as const;
const toneKey = (tone: Tone | 'neutral') => (tone === 'ok' || tone === 'warn' || tone === 'danger' ? tone : 'neutral');
const stats = (series: IndicatorSeries) => {
  const values = series.serie.map(p => p.valor).filter((v): v is number => v != null);
  return values.length ? { avg: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, min: Math.min(...values), max: Math.max(...values), last: [...series.serie].reverse().find(p => p.valor != null)!.valor as number } : null;
};
const fmt = (value: number | null, unit: string) => value == null ? 'Sin datos' : `${new Intl.NumberFormat('es-SV', { maximumFractionDigits: 1 }).format(value)} ${unit}`;
const tableOf = (spec: Indicator, series: IndicatorSeries): ExportTable => ({
  filename: exportName(`metrica-${spec.id}`), title: spec.label, subtitle: `Del ${series.desde} al ${series.hasta}. ${spec.what}`,
  columns: ['Fecha', `Valor (${units[series.unidad] ?? series.unidad})`, 'Muestras'], rows: series.serie.map(p => [p.fecha, p.valor, p.muestras]),
});

function IndicatorCard({ spec, state }: { spec: Indicator; state: Remote<IndicatorSeries> }) {
  return <section className="board-card board-card-wide metric-card" aria-label={spec.label}>
    <header className="metric-head"><h2>{spec.label}</h2>{state.data && <ExportMenu label="Exportar" table={() => tableOf(spec, state.data as IndicatorSeries)} disabled={state.data.serie.every(p => p.valor == null)} />}</header>
    <p className="metric-what"><strong>Qué mide.</strong> {spec.what}</p>
    <p className="metric-how"><strong>Cómo leerlo.</strong> {spec.how}</p>
    <RemoteState state={state}>{s => {
      const unit = units[s.unidad] ?? s.unidad, summary = stats(s), tone = readTone(summary?.avg ?? null, spec);
      const data = s.serie.map(p => ({ label: dayLabel(p.fecha), value: p.valor, tone: spec.chart === 'bar' && p.valor != null ? readTone(p.valor, spec) as Tone : undefined }));
      const threshold = { value: spec.warn, label: `Atención ${spec.warn} ${unit}` };
      return <>
        {summary
          ? <div className="metric-summary">
            <div className={`metric-figure tone-${toneKey(tone)}`}><span>Promedio del rango</span><strong>{fmt(summary.avg, unit)}</strong><em>{toneWord[toneKey(tone)]}</em></div>
            <div><span>Último dato</span><strong>{fmt(summary.last, unit)}</strong></div>
            <div><span>Mínimo</span><strong>{fmt(summary.min, unit)}</strong></div>
            <div><span>Máximo</span><strong>{fmt(summary.max, unit)}</strong></div>
          </div>
          : <p className="panel-empty" role="status">No hay datos en este rango. Prueba con un rango más amplio.</p>}
        {spec.chart === 'bar'
          ? <BarChart title={`${spec.label} por día`} data={data} unit={unit} threshold={threshold} table="details" empty="Sin datos en este rango." />
          : <LineChart title={`${spec.label} por día`} data={data} unit={unit} threshold={threshold} table="details" empty="Sin datos en este rango." />}
        <Legend items={[{ label: `Dentro de lo esperado: menos de ${spec.warn} ${unit}`, tone: 'ok' }, { label: `Atención: desde ${spec.warn} ${unit}`, tone: 'warn' }, { label: `Crítico: desde ${spec.danger} ${unit}`, tone: 'danger' }]} />
      </>;
    }}</RemoteState>
  </section>;
}

const seriesPath = (id: string, from: string, to: string) => `/metricas/${id}?desde=${from}&hasta=${to}`;

/** W33 · métricas detalladas por rango (máximo 31 días): gráficos, explicación de cada indicador y exportación. Solo agregados. */
export function MetricsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const [from, setFrom] = useState(() => localDay(-6)), [to, setTo] = useState(() => localDay());
  const allowed = can(profile, 'metricas.ver'), valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
  const on = allowed && valid;
  // Siempre las mismas cinco lecturas, en el mismo orden: una por indicador.
  const states = [
    useData<IndicatorSeries>(api, seriesPath(indicators[0].id, from, to), version, on), useData<IndicatorSeries>(api, seriesPath(indicators[1].id, from, to), version, on),
    useData<IndicatorSeries>(api, seriesPath(indicators[2].id, from, to), version, on), useData<IndicatorSeries>(api, seriesPath(indicators[3].id, from, to), version, on),
    useData<IndicatorSeries>(api, seriesPath(indicators[4].id, from, to), version, on),
  ];
  if (!allowed) return <Notice kind="info">Tu cuenta no tiene permiso para ver las métricas.</Notice>;
  const ready = states.every(s => s.data);
  const everything = (): ExportTable => ({
    filename: exportName('metricas'), title: 'Métricas del hospital', subtitle: `Del ${from} al ${to}. Indicadores agregados por día, sin datos personales.`,
    columns: ['Indicador', 'Unidad', 'Fecha', 'Valor', 'Muestras'],
    rows: indicators.flatMap((spec, i) => (states[i].data?.serie ?? []).map(p => [spec.label, units[states[i].data!.unidad] ?? states[i].data!.unidad, p.fecha, p.valor, p.muestras])),
  });
  const active = (days: number) => from === localDay(-(days - 1)) && to === localDay();
  return <>
    <Heading eyebrow="CLIMESA / Métricas" title="Métricas" description="Indicadores agregados por día, sin datos personales. Cada uno explica qué mide y cómo leerlo." actions={<ExportMenu label="Exportar todo" table={everything} disabled={!ready} />} />
    <div className="metric-controls">
      <div className="segmented-control" role="group" aria-label="Rangos rápidos">{presets.map(p => <button key={p.days} type="button" aria-pressed={active(p.days)} onClick={() => { setFrom(localDay(-(p.days - 1))); setTo(localDay()); }}>{p.label}</button>)}</div>
      <div className="form-grid"><Field label="Desde" type="date" value={from} onChange={setFrom} /><Field label="Hasta" type="date" value={to} onChange={setTo} /></div>
    </div>
    <p className="metric-note">Las franjas de color son referencias de operación para leer los datos con rapidez: no son metas clínicas. Rango máximo: 31 días.</p>
    {!valid ? <Notice kind="info">Elige un rango con el fin igual o posterior al inicio.</Notice>
      : <div className="board-grid board-grid-detail">{indicators.map((spec, i) => <IndicatorCard key={spec.id} spec={spec} state={states[i]} />)}</div>}
  </>;
}
