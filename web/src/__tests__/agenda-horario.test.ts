import { describe, expect, it } from 'vitest';
import { addDays, dayKey, groupAgenda, timeRange, weekOf } from '../features/listas/schedule';

describe('presentación de la agenda', () => {
  it('escribe el rango en hora de El Salvador', () => { expect(timeRange('2026-11-20T14:00:00Z', '2026-11-20T14:20:00Z')).toBe('08:00 – 08:20'); });
  it('el día se cuenta en hora local, no en UTC', () => { expect(dayKey('2026-11-21T03:30:00Z')).toBe('2026-11-20'); });
  it('la semana va de lunes a domingo', () => {
    expect(weekOf('2026-11-14')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(weekOf('2026-11-15')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
  it('agrupa por día, luego por médico y ordena por hora', () => {
    const item = (id: string, doctorId: string, doctorName: string, start: string) => ({ id, doctorId, doctorName, start, end: start });
    const days = groupAgenda([item('3', 'b', 'Beto', '2026-11-21T15:00:00Z'), item('2', 'a', 'Ana', '2026-11-20T16:00:00Z'), item('1', 'a', 'Ana', '2026-11-20T14:00:00Z')]);
    expect(days.map(d => d.day)).toEqual(['2026-11-20', '2026-11-21']);
    expect(days[0].doctors[0].items.map(i => i.id)).toEqual(['1', '2']);
  });
});
