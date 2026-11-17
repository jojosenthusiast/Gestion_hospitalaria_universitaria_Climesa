import './segmented.css';

export type SegmentOption<T extends string> = { value: T; label: string; count?: number };

/**
 * R4a (S1, §4.1): one compact segmented control for a filter with a few states. At most about four segments are
 * visible; the rest live in a «Más» select inside the same control, so the bar stays one line. Counts are tabular.
 */
export function Segmented<T extends string>({ label, value, options, more = [], onChange }: { label: string; value: T; options: SegmentOption<T>[]; more?: SegmentOption<T>[]; onChange: (value: T) => void }) {
  const inMore = more.find(option => option.value === value);
  return <div className="segmented" role="group" aria-label={label}>
    {options.map(option => <button type="button" key={option.value} className="segment" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      <span>{option.label}</span>{option.count !== undefined && <small>{option.count}</small>}
    </button>)}
    {more.length > 0 && <label className={`segment segment-more${inMore ? ' is-selected' : ''}`}>
      <span className="sr-only">Más opciones de {label.toLowerCase()}</span>
      <select value={inMore ? inMore.value : ''} onChange={event => event.target.value && onChange(event.target.value as T)}>
        <option value="">Más</option>
        {more.map(option => <option key={option.value} value={option.value}>{option.label}{option.count !== undefined ? ` (${option.count})` : ''}</option>)}
      </select>
    </label>}
  </div>;
}
