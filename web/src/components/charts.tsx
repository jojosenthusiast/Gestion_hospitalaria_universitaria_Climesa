import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Gráficos SVG ligeros (sin librería): barras, barra apilada, dona, línea/mini-línea e indicador semicircular.
 * Cada gráfico es una figura con título, descripción accesible y una tabla de datos equivalente: oculta para
 * lectores de pantalla (`sr`) o visible bajo «Ver datos» (`details`). El color nunca es el único canal: cada
 * valor lleva etiqueta y número. Los colores salen de los tokens de `styles.css`, así que siguen el tema oscuro.
 */
/**
 * R1 (S7): tones are the family and priority tokens. A threshold passed is `urgent` (amber); `critical` (red) is only
 * for critical clinical values. There is no generic "danger" tone: red never marks a busy queue or a full ward.
 */
export type Tone = 'ok' | 'warn' | 'info' | 'urgent' | 'critical' | 'violet' | 'slate' | 'primary' | 'ink';
export const toneColor: Record<Tone, string> = {
  ok: 'var(--status-listo)', warn: 'var(--status-llamado)', info: 'var(--status-atencion)', urgent: 'var(--priority-urgente)', critical: 'var(--critical)',
  violet: 'var(--status-espera)', slate: 'var(--status-cerrado)', primary: 'var(--primary)', ink: 'var(--ink)',
};
export type Datum = { label: string; value: number | null; tone?: Tone };
type TableMode = 'sr' | 'details';

const fmt = (value: number | null, unit = '') => value == null ? 'Sin datos' : `${new Intl.NumberFormat('es-SV', { maximumFractionDigits: 1 }).format(value)}${unit ? ` ${unit}` : ''}`;
const niceMax = (max: number) => {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max)), step = max / pow;
  return (step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10) * pow;
};

/** Tabla equivalente del gráfico (WCAG 1.1.1): mismas etiquetas y valores que el dibujo. */
export function ChartTable({ caption, rows, unit, visible = false, format }: { caption: string; rows: { label: string; value: number | null }[]; unit?: string; visible?: boolean; format?: (value: number) => string }) {
  return <table className={visible ? 'chart-table' : 'sr-only'}><caption>{caption}</caption><thead><tr><th scope="col">Categoría</th><th scope="col">Valor</th></tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th><td>{format && row.value != null ? format(row.value) : fmt(row.value, unit)}</td></tr>)}</tbody></table>;
}

function Figure({ title, description, rows, unit, table, children, className = '', format }: { title: string; description?: string; rows: { label: string; value: number | null }[]; unit?: string; table: TableMode; children: ReactNode; className?: string; format?: (value: number) => string }) {
  return <figure className={`chart ${className}`.trim()} aria-label={title}>
    {children}
    {table === 'details'
      ? <details className="chart-data"><summary>Ver datos</summary><ChartTable caption={title} rows={rows} unit={unit} visible format={format} /></details>
      : <ChartTable caption={description ? `${title}. ${description}` : title} rows={rows} unit={unit} format={format} />}
  </figure>;
}

export function Legend({ items }: { items: { label: string; value?: number | string; tone: Tone }[] }) {
  return <ul className="chart-legend">{items.map(item => <li key={item.label}><span className="chart-swatch" style={{ background: toneColor[item.tone] }} aria-hidden="true" /><span>{item.label}</span>{item.value !== undefined && <strong>{item.value}</strong>}</li>)}</ul>;
}

/** Width in CSS pixels of the element, so an SVG can draw at 1:1 and its text never scales with the card. */
function useWidth<T extends Element>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0), observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect();
    if (!node) return;
    setWidth(node.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver(entries => setWidth(entries[0]?.contentRect.width ?? 0));
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

/**
 * Barras verticales. `threshold` dibuja una línea de referencia (por ejemplo la meta), nombrada en la leyenda bajo
 * el gráfico para que nunca choque con el número de una barra. The SVG draws at the card's real width, so labels keep
 * their CSS size. With a threshold, a value far above it (more than 4×) no longer flattens the rest: the scale stops
 * near the others and that bar is cut with a break mark, its real value still written on top. `format` writes values.
 */
export function BarChart({ title, data, unit = '', height = 180, threshold, description, table = 'sr', empty = 'Sin datos para mostrar.', format }: { title: string; data: Datum[]; unit?: string; height?: number; threshold?: { value: number; label: string }; description?: string; table?: TableMode; empty?: string; format?: (value: number) => string }) {
  const titleId = useId(), [ref, measured] = useWidth<HTMLDivElement>();
  if (data.length === 0 || data.every(d => d.value == null)) return <p className="chart-empty" role="status">{empty}</p>;
  const text = (value: number) => format ? format(value) : new Intl.NumberFormat('es-SV', { maximumFractionDigits: 1 }).format(value);
  const w = Math.max(measured || 0, data.length * 44, 280), pad = { l: 8, r: 8, t: 24, b: 28 }, innerH = height - pad.t - pad.b;
  const values = data.map(d => d.value ?? 0), limit = threshold ? threshold.value * 4 : Infinity;
  const max = niceMax(Math.max(threshold?.value ?? 0, ...values.filter(v => v <= limit))), slot = (w - pad.l - pad.r) / data.length, bar = Math.min(40, slot * 0.6);
  const every = Math.ceil(data.length / Math.max(4, Math.floor(w / 64)));
  const yOf = (value: number) => pad.t + innerH * (1 - Math.min(value, max) / max);
  return <Figure title={title} description={description} rows={data.map(d => ({ label: d.label, value: d.value }))} unit={format ? undefined : unit} table={table} format={format}>
    <div ref={ref} className="chart-frame">
      <svg className="chart-svg" width={w} height={height} viewBox={`0 0 ${w} ${height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{title}</title>
        {[0, 0.5, 1].map(f => <line key={f} className="chart-grid" x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - f)} y2={pad.t + innerH * (1 - f)} />)}
        {threshold && <line className="chart-threshold" x1={pad.l} x2={w - pad.r} y1={yOf(threshold.value)} y2={yOf(threshold.value)} />}
        {data.map((d, i) => {
          const x = pad.l + slot * i + (slot - bar) / 2, cut = d.value != null && d.value > max;
          const h = d.value == null ? 0 : Math.max(2, (Math.min(d.value, max) / max) * innerH), y = pad.t + innerH - h;
          return <g key={`${d.label}-${i}`}>
            {d.value != null && <rect x={x} y={y} width={bar} height={h} rx={3} fill={toneColor[d.tone ?? 'primary']}><title>{`${d.label}: ${format ? format(d.value) : fmt(d.value, unit)}`}</title></rect>}
            {cut && <path className="chart-break" d={`M${x - 2} ${y + 14} l${bar / 2 + 2} -6 l${bar / 2 + 2} 6 M${x - 2} ${y + 20} l${bar / 2 + 2} -6 l${bar / 2 + 2} 6`} />}
            {d.value != null && <text className="chart-value" x={x + bar / 2} y={y - 6} textAnchor="middle">{text(d.value)}</text>}
            {(i % every === 0 || i === data.length - 1) && <text className="chart-axis" x={x + bar / 2} y={height - 9} textAnchor="middle">{d.label}</text>}
          </g>;
        })}
      </svg>
    </div>
    {threshold && <ul className="chart-legend chart-legend-threshold"><li><span className="chart-swatch-line" aria-hidden="true" /><span>{threshold.label}</span></li>{data.some(d => d.value != null && d.value > max) && <li><span>Barra cortada: su valor real está escrito encima.</span></li>}</ul>}
  </Figure>;
}

/** Barras horizontales con etiqueta y valor en cada fila (estados de la fila, laboratorio por estado…). */
export function HBarList({ title, data, unit = '', description, table = 'sr', empty = 'Sin datos para mostrar.', total }: { title: string; data: Datum[]; unit?: string; description?: string; table?: TableMode; empty?: string; total?: number }) {
  const max = Math.max(1, total ?? 0, ...data.map(d => d.value ?? 0));
  if (data.length === 0) return <p className="chart-empty" role="status">{empty}</p>;
  return <Figure title={title} description={description} rows={data} unit={unit} table={table}>
    <ul className="hbar-list" aria-hidden="true">{data.map(d => <li key={d.label}><span className="hbar-label">{d.label}</span><span className="hbar-track"><span className="hbar-fill" style={{ width: `${d.value == null ? 0 : Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%`, background: toneColor[d.tone ?? 'primary'] }} /></span><strong className="hbar-value">{fmt(d.value, unit)}</strong></li>)}</ul>
  </Figure>;
}

/** Una sola barra dividida en tramos (por ejemplo, camas libres / ocupadas / limpieza). */
export function StackedBar({ title, segments, unit = '', description, table = 'sr', empty = 'Sin datos para mostrar.' }: { title: string; segments: { label: string; value: number; tone: Tone }[]; unit?: string; description?: string; table?: TableMode; empty?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0), titleId = useId();
  if (total === 0) return <p className="chart-empty" role="status">{empty}</p>;
  let offset = 0;
  return <Figure title={title} description={description} rows={segments} unit={unit} table={table}>
    <svg className="chart-svg chart-stacked" viewBox="0 0 400 28" role="img" aria-labelledby={titleId} preserveAspectRatio="none">
      <title id={titleId}>{`${title}: ${segments.map(s => `${s.label} ${s.value}`).join(', ')}`}</title>
      {segments.filter(s => s.value > 0).map(s => { const x = (offset / total) * 400, width = (s.value / total) * 400; offset += s.value; return <rect key={s.label} x={x} y={0} width={Math.max(0, width - 1)} height={28} rx={2} fill={toneColor[s.tone]}><title>{`${s.label}: ${s.value}`}</title></rect>; })}
    </svg>
    <Legend items={segments.map(s => ({ label: s.label, value: s.value, tone: s.tone }))} />
  </Figure>;
}

/** Dona con total al centro y leyenda con cada valor. */
export function Donut({ title, segments, centerValue, centerLabel, unit = '', description, table = 'sr', empty = 'Sin datos para mostrar.' }: { title: string; segments: { label: string; value: number; tone: Tone }[]; centerValue?: string; centerLabel?: string; unit?: string; description?: string; table?: TableMode; empty?: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0), titleId = useId();
  if (total === 0) return <p className="chart-empty" role="status">{empty}</p>;
  let acc = 0;
  return <Figure title={title} description={description} rows={segments} unit={unit} table={table} className="chart-donut">
    <svg className="chart-svg" viewBox="0 0 42 42" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{`${title}: ${segments.map(s => `${s.label} ${s.value}`).join(', ')}`}</title>
      <circle className="chart-ring" cx="21" cy="21" r="15.915" fill="none" strokeWidth="5.5" />
      {segments.filter(s => s.value > 0).map(s => {
        const share = (s.value / total) * 100, dash = Math.max(0, share - (segments.length > 1 ? 0.8 : 0)), rotate = (acc / total) * 360 - 90;
        acc += s.value;
        return <circle key={s.label} cx="21" cy="21" r="15.915" fill="none" strokeWidth="5.5" stroke={toneColor[s.tone]} strokeDasharray={`${dash} ${100 - dash}`} transform={`rotate(${rotate} 21 21)`}><title>{`${s.label}: ${s.value}`}</title></circle>;
      })}
      <text className="chart-center" x="21" y="21.5" textAnchor="middle">{centerValue ?? String(total)}</text>
      {centerLabel && <text className="chart-center-label" x="21" y="27" textAnchor="middle">{centerLabel}</text>}
    </svg>
    <Legend items={segments.map(s => ({ label: s.label, value: s.value, tone: s.tone }))} />
  </Figure>;
}

/** Línea de tendencia. Los días sin dato (`null`) cortan la línea en lugar de dibujar un cero falso. */
export function LineChart({ title, data, unit = '', height = 150, threshold, tone = 'primary', description, table = 'sr', compact = false, empty = 'Sin datos para mostrar.' }: { title: string; data: Datum[]; unit?: string; height?: number; threshold?: { value: number; label: string }; tone?: Tone; description?: string; table?: TableMode; compact?: boolean; empty?: string }) {
  const titleId = useId();
  const real = data.filter(d => d.value != null);
  if (real.length === 0) return <p className="chart-empty" role="status">{empty}</p>;
  const h = compact ? 44 : height, w = compact ? 160 : 420, pad = compact ? { l: 4, r: 4, t: 6, b: 6 } : { l: 10, r: 10, t: 18, b: 26 }, innerH = h - pad.t - pad.b, innerW = w - pad.l - pad.r;
  const max = niceMax(Math.max(threshold?.value ?? 0, ...real.map(d => d.value as number)));
  const px = (i: number) => pad.l + (data.length === 1 ? innerW / 2 : (innerW * i) / (data.length - 1)), py = (v: number) => pad.t + innerH * (1 - v / max);
  const segments: { x: number; y: number }[][] = [];
  data.forEach((d, i) => { if (d.value == null) { segments.push([]); return; } if (!segments.length) segments.push([]); segments[segments.length - 1].push({ x: px(i), y: py(d.value) }); });
  const color = toneColor[tone], last = [...data].map((d, i) => ({ d, i })).reverse().find(item => item.d.value != null);
  return <Figure title={title} description={description} rows={data} unit={unit} table={table} className={compact ? 'chart-spark' : ''}>
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-labelledby={titleId} preserveAspectRatio="xMidYMid meet">
      <title id={titleId}>{`${title}. Último valor: ${fmt(last?.d.value ?? null, unit)}`}</title>
      {!compact && [0, 0.5, 1].map(f => <line key={f} className="chart-grid" x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * (1 - f)} y2={pad.t + innerH * (1 - f)} />)}
      {threshold && <line className="chart-threshold" x1={pad.l} x2={w - pad.r} y1={py(threshold.value)} y2={py(threshold.value)} />}
      {segments.filter(s => s.length > 0).map((s, i) => <g key={i}>
        {s.length > 1 && <path d={`M${s[0].x} ${pad.t + innerH} ${s.map(p => `L${p.x} ${p.y}`).join(' ')} L${s[s.length - 1].x} ${pad.t + innerH}Z`} fill={color} opacity="0.1" />}
        <polyline points={s.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={compact ? 1.8 : 2.2} strokeLinejoin="round" strokeLinecap="round" />
        {!compact && s.map((p, j) => <circle key={j} cx={p.x} cy={p.y} r={s.length > 20 ? 1.8 : 3} fill={color} />)}
      </g>)}
      {last && <circle cx={px(last.i)} cy={py(last.d.value as number)} r={compact ? 2.6 : 4} fill={color} stroke="var(--surface)" strokeWidth="1.5"><title>{`${last.d.label}: ${fmt(last.d.value, unit)}`}</title></circle>}
      {!compact && data.length > 0 && <><text className="chart-axis" x={pad.l} y={h - 8}>{data[0].label}</text>{data.length > 2 && <text className="chart-axis" x={w / 2} y={h - 8} textAnchor="middle">{data[Math.floor((data.length - 1) / 2)].label}</text>}{data.length > 1 && <text className="chart-axis" x={w - pad.r} y={h - 8} textAnchor="end">{data[data.length - 1].label}</text>}</>}
      {!compact && threshold && <text className="chart-axis" x={w - pad.r} y={py(threshold.value) - 4} textAnchor="end">{threshold.label}</text>}
    </svg>
  </Figure>;
}

/** Indicador semicircular de 0 a `max` con el valor al centro (ocupación, cumplimiento…). */
export function Gauge({ title, value, max = 100, unit = '%', tone = 'primary', caption, table = 'sr' }: { title: string; value: number; max?: number; unit?: string; tone?: Tone; caption?: string; table?: TableMode }) {
  const titleId = useId(), ratio = Math.max(0, Math.min(1, max ? value / max : 0)), r = 40, cx = 50, cy = 50, arc = (f: number) => { const a = Math.PI * (1 - f); return `${cx + r * Math.cos(a)} ${cy - r * Math.sin(a)}`; };
  return <Figure title={title} rows={[{ label: title, value }]} unit={unit} table={table} className="chart-gauge">
    <svg className="chart-svg" viewBox="0 0 100 62" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{`${title}: ${fmt(value, unit)}`}</title>
      <path className="chart-ring" d={`M${arc(0)} A${r} ${r} 0 0 1 ${arc(1)}`} fill="none" strokeWidth="9" strokeLinecap="round" />
      {ratio > 0 && <path d={`M${arc(0)} A${r} ${r} 0 ${ratio > 0.5 ? 1 : 0} 1 ${arc(ratio)}`} fill="none" stroke={toneColor[tone]} strokeWidth="9" strokeLinecap="round" />}
      <text className="chart-center" x="50" y="48" textAnchor="middle">{new Intl.NumberFormat('es-SV', { maximumFractionDigits: 1 }).format(value)}{unit}</text>
    </svg>
    {caption && <figcaption className="chart-caption">{caption}</figcaption>}
  </Figure>;
}
