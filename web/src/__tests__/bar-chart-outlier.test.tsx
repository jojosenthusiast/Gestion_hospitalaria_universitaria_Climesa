import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart } from '../components/charts';
import { formatDuration } from '../lib/format';

// Lab dashboard: one day far above the goal (6707 min) flattened every other bar and the goal label hit a bar value.
describe('BarChart with a goal and an outlier', () => {
  afterEach(cleanup);
  const data = [{ label: '13/11', value: 65 }, { label: '14/11', value: 54 }, { label: '17/11', value: 6707 }, { label: '18/11', value: 2 }];

  it('keeps the scale near the goal, cuts the outlier and writes its real value', () => {
    const { container } = render(<BarChart title="Tiempo" unit="min" format={formatDuration} threshold={{ value: 60, label: 'Meta 60 min' }} data={data} />);
    const values = [...container.querySelectorAll('.chart-value')].map(n => n.textContent);
    expect(values).toEqual(['1 h 05 min', '54 min', '4 d 15 h', '2 min']);
    expect(container.querySelectorAll('.chart-break')).toHaveLength(1);
    const heights = [...container.querySelectorAll('rect')].map(r => Number(r.getAttribute('height')));
    expect(heights[0]).toBeGreaterThan(heights[2] * 0.5);
    expect(screen.getByText('Meta 60 min').closest('.chart-legend')).toBeTruthy();
    expect(screen.getByText('Barra cortada: su valor real está escrito encima.')).toBeTruthy();
  });

  it('draws every bar to scale when nothing is far above the goal', () => {
    const { container } = render(<BarChart title="Tiempo" unit="min" threshold={{ value: 60, label: 'Meta 60 min' }} data={data.slice(0, 2)} />);
    expect(container.querySelectorAll('.chart-break')).toHaveLength(0);
    expect(screen.queryByText('Barra cortada: su valor real está escrito encima.')).toBeNull();
  });
});
