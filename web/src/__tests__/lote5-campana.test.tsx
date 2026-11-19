import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import { NoticesBell, badgeCount } from '../features/avisos/NoticesBell';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const bellWith = (noLeidos: number) => {
  const api = { request: vi.fn(async () => ({ actualizadoEn: new Date().toISOString(), avisos: [], noLeidos, criticos: 0, recordatorioHoras: 4, proximoCambio: null })), write: vi.fn() };
  render(<NoticesBell api={api as unknown as Api} version={0} current={false} />);
};

describe('Lote 5 S1 · bell badge', () => {
  it('caps the count at «99+» like Android', () => {
    expect(badgeCount(7)).toBe('7');
    expect(badgeCount(42)).toBe('42');
    expect(badgeCount(99)).toBe('99');
    expect(badgeCount(100)).toBe('99+');
  });

  it('shows 42 unread as «42», not «9+»', async () => {
    bellWith(42);
    const link = await screen.findByRole('link', { name: 'Avisos, 42 sin leer' });
    expect(link.querySelector('.notices-bell-count')?.textContent).toBe('42');
  });

  it('shows «99+» past 99 and keeps the exact count for screen readers', async () => {
    bellWith(250);
    const link = await screen.findByRole('link', { name: 'Avisos, 250 sin leer' });
    expect(link.querySelector('.notices-bell-count')?.textContent).toBe('99+');
  });
});
