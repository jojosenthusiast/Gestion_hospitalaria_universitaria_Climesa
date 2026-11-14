import { describe, expect, it } from 'vitest';
import type { Shift } from '../lib/api';
import { conflictsFor, durationProblem, eligibleFor, endOf, localMs, suggestKind, type CatalogArea, type CatalogStaff } from '../features/shifts/rules';

const persona = (over: Partial<CatalogStaff> = {}): CatalogStaff => ({ id: 'p', name: 'Persona', type: 'medico', specialty: null, areaId: null, area: null, registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }], ...over });
const turno = (start: string, end: string, type = 'diurno', state = 'publicado'): Shift => ({ id: 't', staffId: 'p', person: 'Persona', areaId: 'a', area: 'A', start, end, type, state, version: 1 });

describe('turnos · reglas de horario', () => {
  it('el fin menor o igual al inicio cruza la medianoche', () => {
    expect(endOf('2026-11-20', '19:00', '07:00')).toBe(localMs('2026-11-21', '07:00'));
    expect(endOf('2026-11-20', '07:00', '07:00')).toBe(localMs('2026-11-21', '07:00'));
  });
  it('regla 4–24 h: diurno hasta 12, nocturno y guardia hasta 24', () => {
    const s = localMs('2026-11-20', '07:00');
    expect(durationProblem(s, s + 3 * 3600_000, 'diurno')).toMatch(/4 a 12/);
    expect(durationProblem(s, s + 8 * 3600_000, 'diurno')).toBeNull();
    expect(durationProblem(s, s + 13 * 3600_000, 'diurno')).toMatch(/4 a 12/);
    expect(durationProblem(s, s + 24 * 3600_000, 'guardia')).toBeNull();
    expect(suggestKind(s, s + 24 * 3600_000)).toBe('guardia');
    expect(suggestKind(localMs('2026-11-20', '19:00'), localMs('2026-11-21', '07:00'))).toBe('nocturno');
  });
  it('detecta traslape, descanso e inscripción vencida', () => {
    const start = localMs('2026-11-20', '09:00'), end = localMs('2026-11-20', '17:00');
    const overlap = turno('2026-11-20T14:00:00.000Z', '2026-11-20T22:00:00.000Z');
    expect(conflictsFor(persona(), start, end, 'diurno', [overlap]).map(c => c.code)).toContain('traslape');
    const prevNight = turno('2026-11-20T00:00:00.000Z', '2026-11-20T12:00:00.000Z', 'nocturno');
    expect(conflictsFor(persona(), start, end, 'diurno', [prevNight]).map(c => c.code)).toContain('descanso');
    expect(conflictsFor(persona({ registrations: [] }), start, end, 'diurno', []).map(c => c.code)).toEqual(['inscripcion']);
    expect(conflictsFor(persona({ type: 'asistente', registrations: [] }), start, end, 'diurno', [])).toEqual([]);
    expect(conflictsFor(persona(), start, end, 'diurno', [{ ...overlap, state: 'cancelado' }])).toEqual([]);
  });
  it('el personal elegible incluye el área, sus contenedores y a quien no tiene área', () => {
    const areas: CatalogArea[] = [{ id: 'h', parentId: null, type: 'hospital', code: 'H', name: 'Hospital' }, { id: 'a', parentId: 'h', type: 'area', code: 'A', name: 'A' }, { id: 'b', parentId: 'h', type: 'area', code: 'B', name: 'B' }];
    const staff = [persona({ id: '1', areaId: 'a' }), persona({ id: '2', areaId: 'b' }), persona({ id: '3', areaId: 'h' }), persona({ id: '4' }), persona({ id: '5', areaId: 'a', type: 'enfermero' })];
    expect(eligibleFor(staff, areas, 'a', 'todos', false).map(p => p.id)).toEqual(['1', '3', '4', '5']);
    expect(eligibleFor(staff, areas, 'a', 'enfermero', false).map(p => p.id)).toEqual(['5']);
    expect(eligibleFor(staff, areas, 'a', 'todos', true)).toHaveLength(5);
  });
});
