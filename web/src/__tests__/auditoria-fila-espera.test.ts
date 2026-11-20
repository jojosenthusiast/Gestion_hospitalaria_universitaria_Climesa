import { describe, expect, it } from 'vitest';
import { waitUntilCall } from '../features/listas/queue-board';

// Audit D48: the wait of a finished number is measured until it was first called, not until now.
describe('waitUntilCall (D48)', () => {
  const issuedAt = '2026-11-20T12:53:00Z';
  const now = Date.parse('2026-11-20T14:00:00Z');

  it('measures from issue to the first call', () => {
    expect(waitUntilCall({ issuedAt, calledAt: '2026-11-20T13:05:00Z', state: 'atendido' }, now)).toBe(12);
  });

  it('keeps running while the number is still waiting and was never called', () => {
    expect(waitUntilCall({ issuedAt, calledAt: null, state: 'en_espera' }, now)).toBe(67);
  });

  it('has no wait for a closed number that was never called', () => {
    expect(waitUntilCall({ issuedAt, calledAt: null, state: 'cerrado' }, now)).toBeNull();
  });
});
