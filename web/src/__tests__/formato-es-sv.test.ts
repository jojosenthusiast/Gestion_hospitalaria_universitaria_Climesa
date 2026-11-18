import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDayHeading, formatDuration, formatNumber, formatPercent, formatRelative, formatTime, plural } from '../lib/format';

// R4a (S5, §4.8): one es-SV formatter. Hospital time is El Salvador (UTC-6).
describe('formateador es-SV', () => {
  it('números con coma decimal y porcentaje que no se parte', () => {
    expect(formatNumber(35.7, 1)).toBe('35,7');
    expect(formatPercent(35.71, 1)).toBe('35,7 %');
    expect(formatPercent(50)).toBe('50 %');
    expect(formatNumber(12500)).toBe('12.500');
  });

  it('fechas cortas sin «de» ni mayúsculas, en hora de El Salvador', () => {
    const now = '2026-11-18T15:00:00Z';
    // R4: sin año dentro del año en curso.
    expect(formatDate('2026-11-16T22:13:00Z', { now })).toBe('16 nov');
    // 03:00 UTC del 17 es todavía el 16 en El Salvador.
    expect(formatDate('2026-11-17T03:00:00Z', { now })).toBe('16 nov');
    // Fuera del año en curso el año sí aparece.
    expect(formatDate('2028-05-31', { now })).toBe('31 may 2028');
    expect(formatDate('1990-03-04', { now })).toBe('4 mar 1990');
    expect(formatDate('2026-11-16T22:13:00Z', { withYear: false, now: '2027-01-02T12:00:00Z' })).toBe('16 nov');
    // Auditoría, historial de accesos, nacimientos y exportaciones piden el año siempre.
    expect(formatDate('2026-11-16T22:13:00Z', { withYear: true, now })).toBe('16 nov 2026');
    expect(formatTime('2026-11-16T15:33:00Z')).toBe('09:33');
    expect(formatDateTime('2026-11-14T07:33:00Z', { now })).toBe('14 nov, 01:33');
    expect(formatDateTime('2025-11-14T07:33:00Z', { now })).toBe('14 nov 2025, 01:33');
    expect(formatDateTime('2026-11-14T07:33:00Z', { withYear: true, now })).toBe('14 nov 2026, 01:33');
    expect(formatDateTime('2026-11-18T16:00:00Z', { short: true, now })).toBe('10:00');
    expect(formatDayHeading('2026-11-14T18:00:00Z')).toBe('sábado 14 de noviembre');
  });

  it('tiempos relativos con tope: nunca miles de minutos', () => {
    const now = Date.parse('2026-11-16T22:00:00Z');
    expect(formatRelative(new Date(now - 4123 * 60_000), now)).toBe('hace 2 d');
    expect(formatRelative(new Date(now - 5 * 60_000), now)).toBe('hace 5 min');
    expect(formatRelative(new Date(now - 190 * 60_000), now)).toBe('hace 3 h');
    expect(formatDuration(4123)).toBe('2 d 20 h');
    expect(formatDuration(125)).toBe('2 h 05 min');
    expect(formatDuration(45)).toBe('45 min');
  });

  it('plurales correctos', () => {
    expect(plural(1, 'cita', 'citas')).toBe('1 cita');
    expect(plural(3, 'cita', 'citas')).toBe('3 citas');
    expect(plural(0, 'cita', 'citas')).toBe('0 citas');
    expect(plural(1, 'año', 'años')).toBe('1 año');
  });
});
