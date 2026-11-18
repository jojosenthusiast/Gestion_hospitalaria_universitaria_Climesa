import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { NoticesPage } from '../features/notices';
import { NoticesBell } from '../features/avisos/NoticesBell';
import { filterInbox, groupInbox, noticeWhen, shortWhen, type InboxNotice } from '../features/avisos/rules';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const profile = { id: 'u', user: { id: 'u' }, email: 'u@example.test', name: 'Cuenta', roles: ['ENF'], platforms: ['web'], permissions: [], channels: [], patientId: null, staffId: null } as unknown as AccessProfile;
const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
const notice = (id: string, titulo: string, extra: Partial<InboxNotice> = {}): InboxNotice => ({
  id, titulo, cuerpo: `Texto de ${titulo}.`, desde: iso(-day), hasta: iso(day), prioridad: 'atencion', nivel: 'informativo',
  publico: false, roles: ['ENF'], areas: [], estado: 'vigente', publicadoEn: iso(-day), dirigido: true, enteradoEn: null, recordarEn: null, destacado: false, ...extra,
});
const sample = () => [
  notice('v-1', 'Vigente uno'),
  notice('p-2', 'Programado lejos', { estado: 'programado', desde: iso(5 * day), hasta: iso(6 * day) }),
  notice('p-1', 'Programado pronto', { estado: 'programado', desde: iso(2 * day), hasta: iso(3 * day) }),
  notice('x-1', 'Vencido viejo', { estado: 'vencido', desde: iso(-20 * day), hasta: iso(-10 * day) }),
  notice('x-2', 'Vencido reciente', { estado: 'vencido', desde: iso(-5 * day), hasta: iso(-2 * day), enteradoEn: iso(-4 * day) }),
];
const inbox = (avisos: InboxNotice[]) => ({ actualizadoEn: iso(0), avisos, noLeidos: 1, criticos: 0, recordatorioHoras: 4, proximoCambio: null });

describe('Avisos · historial como la agenda de citas', () => {
  it('groups in-force first, scheduled by start day (soonest first) and expired by end day (latest first)', () => {
    const { current, upcoming, past } = groupInbox(sample());
    expect(current.map(n => n.id)).toEqual(['v-1']);
    expect(upcoming.flatMap(d => d.items.map(n => n.id))).toEqual(['p-1', 'p-2']);
    expect(upcoming).toHaveLength(2);
    expect(past.flatMap(d => d.items.map(n => n.id))).toEqual(['x-2', 'x-1']);
  });

  it('a notice without estado (older answer) counts as in force', () => {
    const legacy = notice('l-1', 'Sin estado');
    delete legacy.estado;
    expect(groupInbox([legacy]).current.map(n => n.id)).toEqual(['l-1']);
  });

  it('«Sin leer» keeps only unread notices in force; expired and scheduled cannot be acknowledged', () => {
    expect(filterInbox(sample(), 'sin-leer').map(n => n.id)).toEqual(['v-1']);
  });

  it('«Críticos» lists exactly what the API counts: in force, addressed to the account, without «Enterado»', () => {
    const items = [
      notice('c-1', 'Crítico pendiente', { nivel: 'critico' }),
      notice('c-2', 'Crítico leído', { nivel: 'critico', enteradoEn: iso(-1000) }),
      notice('c-3', 'Crítico vencido', { nivel: 'critico', estado: 'vencido', desde: iso(-5 * day), hasta: iso(-2 * day) }),
      notice('c-4', 'Crítico de otra audiencia', { nivel: 'critico', dirigido: false }),
      notice('i-1', 'Informativo'),
    ];
    const listed = filterInbox(items, 'criticos');
    expect(listed.map(n => n.id)).toEqual(['c-1']);
    // Same rule as the API `criticos` (public.service.ts).
    const apiCount = items.filter(n => n.estado === 'vigente' && n.nivel === 'critico' && n.dirigido && !n.enteradoEn).length;
    expect(listed).toHaveLength(apiCount);
  });

  it('short dates leave out the year and say hoy / ayer / mañana like Android', () => {
    const now = new Date('2026-11-18T16:00:00.000Z');
    expect(shortWhen('2026-11-16T15:33:00.000Z', now)).toBe('lun 16 nov, 09:33');
    expect(shortWhen('2026-11-18T15:33:00.000Z', now)).toBe('hoy 09:33');
    // List, detail and «Enterado» read the same instant the same way: «Ayer 23:22 · hasta hoy 23:22».
    expect(noticeWhen('2026-11-18T05:22:00.000Z', now)).toBe('Ayer 23:22');
    expect(shortWhen('2026-11-19T05:22:00.000Z', now)).toBe('hoy 23:22');
    expect(noticeWhen('2026-11-19T15:00:00.000Z', now)).toBe('Mañana 09:00');
  });

  it('shows in-force and scheduled notices, folds expired ones behind «Vencidos», with state tags', async () => {
    const api = { request: vi.fn(async () => inbox(sample())), write: vi.fn() };
    render(<NoticesPage api={api as unknown as Api} profile={profile} version={0} />);
    const current = await screen.findByRole('region', { name: 'Vigentes' });
    expect(within(current).getByText('Vigente uno')).toBeTruthy();
    expect(within(current).getByText('Sin leer')).toBeTruthy();
    expect(screen.getAllByText('Programado')).toHaveLength(2);
    const folded = screen.getByText(/Vencidos · 2 avisos/).closest('details')!;
    expect(folded.open).toBe(false);
    expect(within(folded).getByText('Vencido reciente')).toBeTruthy();
    await userEvent.click(screen.getByText(/Vencidos · 2 avisos/));
    expect(folded.open).toBe(true);
    await userEvent.click(within(folded).getByText('Vencido reciente'));
    const detail = screen.getByRole('region', { name: 'Detalle del aviso' });
    expect(within(detail).getByText('Este aviso ya venció.', { exact: false })).toBeTruthy();
    expect(within(detail).queryByRole('button', { name: 'Enterado' })).toBeNull();
    await userEvent.click(screen.getByText('Programado pronto'));
    expect(within(screen.getByRole('region', { name: 'Detalle del aviso' })).queryByRole('button', { name: 'Enterado' })).toBeNull();
  });

  it('with nothing in force, expired notices are shown open, like past appointment days', async () => {
    const api = { request: vi.fn(async () => inbox(sample().filter(n => n.estado === 'vencido'))), write: vi.fn() };
    render(<NoticesPage api={api as unknown as Api} profile={profile} version={0} />);
    expect((await screen.findAllByText('Vencido reciente')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Vencidos · /)).toBeNull();
  });

  it('the bell still shows the server unread count (in-force only)', async () => {
    const api = { request: vi.fn(async () => inbox(sample())), write: vi.fn() };
    render(<NoticesBell api={api as unknown as Api} version={0} current={false} />);
    expect(await screen.findByRole('link', { name: 'Avisos, 1 sin leer' })).toBeTruthy();
    // Only in-force notices tint the bell: the sample has no critical one in force.
    expect(screen.getByRole('link').className).not.toContain('is-critical');
  });
});
