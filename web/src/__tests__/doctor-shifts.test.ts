import { describe, expect, it } from 'vitest';
import { effectiveShiftFilter, orderByShift, visibleByShift } from '../features/listas/doctor-shifts';
import { formatShortDateTime, formatShortDay } from '../lib/format';

const doctors = [
  { id: 'a', label: 'Ana', disabled: true, reason: 'Sin turno ese día' },
  { id: 'b', label: 'Beto' },
  { id: 'c', label: 'Carla', disabled: true },
  { id: 'd', label: 'Diego' },
];

describe('doctor picker by shift (R1-R3)', () => {
  it('puts doctors with a shift first, keeping their order, each with its badge', () => {
    const ordered = orderByShift(doctors);
    expect(ordered.map(d => d.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(ordered.map(d => [d.status, d.statusLabel])).toEqual([['disponible', 'Con turno'], ['disponible', 'Con turno'], ['cerrado', 'Sin turno ese día'], ['cerrado', 'Sin turno']]);
  });
  it('«Con turno» hides doctors without a shift; «Todos» shows all', () => {
    expect(visibleByShift(doctors, 'con_turno').map(d => d.id)).toEqual(['b', 'd']);
    expect(visibleByShift(doctors, 'todos').map(d => d.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  it('falls back to «Todos» when nobody has a shift', () => {
    const none = doctors.filter(d => d.disabled);
    expect(effectiveShiftFilter('con_turno', none)).toBe('todos');
    expect(visibleByShift(none, 'con_turno').map(d => d.id)).toEqual(['a', 'c']);
    expect(effectiveShiftFilter('con_turno', doctors)).toBe('con_turno');
  });
});

describe('formatShortDay (R4)', () => {
  const now = '2026-11-18T15:00:00Z';
  it('says Hoy/Mañana and never the year', () => {
    expect(formatShortDay('2026-11-18', now)).toBe('Hoy · mié 18 nov');
    expect(formatShortDay('2026-11-19', now)).toBe('Mañana · jue 19 nov');
    expect(formatShortDay('2026-11-26', now)).toBe('Jue 26 nov');
  });
});

describe('formatShortDateTime (R4)', () => {
  const now = '2026-11-18T15:00:00Z';
  it('reads Hoy 09:00 near today and the short day beyond', () => {
    expect(formatShortDateTime('2026-11-18T15:00:00Z', now)).toBe('Hoy 09:00');
    expect(formatShortDateTime('2026-11-26T15:20:00Z', now)).toBe('Jue 26 nov, 09:20');
  });
});
