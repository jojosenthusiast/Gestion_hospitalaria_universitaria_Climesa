import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { NoticesPage } from '../features/notices';
import { CriticalNoticeBanner } from '../features/avisos/CriticalNoticeBanner';
import { modules } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const profile = (permissions: string[] = []): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'u@example.test', name: 'Cuenta', roles: ['ENF'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null } as unknown as AccessProfile);
const notice = (id: string, titulo: string, extra: Record<string, unknown> = {}) => ({
  id, titulo, cuerpo: `Texto de ${titulo}.`, desde: '2026-11-14T12:00:00.000Z', hasta: '2099-11-20T12:00:00.000Z', prioridad: 'atencion', nivel: 'informativo',
  publico: false, roles: ['ENF'], areas: [], publicadoEn: '2026-11-14T12:00:00.000Z', dirigido: true, enteradoEn: null, recordarEn: null, destacado: false, ...extra,
});
const inbox = (avisos: unknown[], extra: Record<string, unknown> = {}) => ({ actualizadoEn: '2026-11-14T12:00:00.000Z', avisos, noLeidos: avisos.length, criticos: 0, recordatorioHoras: 4, proximoCambio: null, ...extra });

describe('S11 · aviso crítico persistente en el inicio', () => {
  it('solo destaca los críticos dirigidos al rol o al área, como alerta con «Enterado»', async () => {
    const api = { request: vi.fn(async () => inbox([
      notice('c-1', 'Falla de oxígeno', { nivel: 'critico', prioridad: 'critico', destacado: true }),
      notice('i-1', 'Cambio de horario', { nivel: 'importante', prioridad: 'urgente' }),
      notice('p-1', 'Corte general', { nivel: 'critico', publico: true, roles: [], dirigido: false }),
    ])), write: vi.fn() };
    render(<CriticalNoticeBanner api={api as unknown as Api} version={0} />);
    const alert = await screen.findByRole('alert');
    expect(api.request).toHaveBeenCalledWith('/me/avisos/bandeja', expect.anything());
    expect(within(alert).getByText('Falla de oxígeno')).toBeTruthy();
    expect(within(alert).getByText('Crítico')).toBeTruthy();
    expect(screen.queryByText('Cambio de horario')).toBeNull();
    expect(screen.queryByText('Corte general')).toBeNull();
    const button = within(alert).getByRole('button', { name: 'Enterado' });
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('sin críticos destacados no ocupa lugar', async () => {
    const api = { request: vi.fn(async () => inbox([notice('i-1', 'Cambio de horario', { nivel: 'importante' })])), write: vi.fn() };
    const { container } = render(<CriticalNoticeBanner api={api as unknown as Api} version={0} />);
    await waitFor(() => expect(api.request).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('«Enterado» se guarda en el servidor y quita el aviso del inicio', async () => {
    let acknowledged = false;
    const api = { request: vi.fn(async () => inbox([notice('c-1', 'Falla de oxígeno', { nivel: 'critico', destacado: !acknowledged, enteradoEn: acknowledged ? '2026-11-14T12:05:00.000Z' : null })])),
      write: vi.fn(async () => { acknowledged = true; return { avisoId: 'c-1', enteradoEn: '2026-11-14T12:05:00.000Z', recordarEn: null }; }) };
    render(<CriticalNoticeBanner api={api as unknown as Api} version={0} />);
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Enterado' }));
    expect(api.write).toHaveBeenCalledWith('/me/avisos/c-1/enterado', {}, 'POST');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('pospuesto, vuelve a destacarse cuando llega la hora del recordatorio, sin sondeo', async () => {
    const due = new Date(Date.now() + 50).toISOString();
    let calls = 0;
    const api = { request: vi.fn(async () => (++calls === 1
      ? inbox([notice('c-1', 'Red caída', { nivel: 'critico', recordarEn: due })], { proximoCambio: due })
      : inbox([notice('c-1', 'Red caída', { nivel: 'critico', destacado: true })]))), write: vi.fn() };
    render(<CriticalNoticeBanner api={api as unknown as Api} version={0} />);
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(await screen.findByRole('alert', {}, { timeout: 3000 })).getByText('Red caída')).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
  });

  it('«Recordarme después» pospone en el servidor por el intervalo de la política', async () => {
    const api = { request: vi.fn(async () => inbox([notice('c-1', 'Red caída', { nivel: 'critico', destacado: true })], { recordatorioHoras: 4 })), write: vi.fn(async () => ({ avisoId: 'c-1', enteradoEn: null, recordarEn: '2099-01-01T00:00:00.000Z' })) };
    render(<CriticalNoticeBanner api={api as unknown as Api} version={0} />);
    await userEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Recordarme en 4 h' }));
    expect(api.write).toHaveBeenCalledWith('/me/avisos/c-1/posponer', {}, 'POST');
  });
});

describe('S11 · área de Avisos', () => {
  const items = [
    notice('c-1', 'Falla de oxígeno', { nivel: 'critico', prioridad: 'critico', destacado: true }),
    notice('i-1', 'Cambio de horario', { nivel: 'importante', prioridad: 'urgente' }),
    notice('n-1', 'Menú de la cafetería', { enteradoEn: '2026-11-14T13:00:00.000Z' }),
  ];
  const reader = () => ({ request: vi.fn(async (path: string) => path === '/me/avisos/bandeja' ? inbox(items, { noLeidos: 2, criticos: 1 }) : []), write: vi.fn(async () => ({ avisoId: 'i-1', enteradoEn: '2026-11-14T14:00:00.000Z', recordarEn: null })) });

  it('el menú lleva a Avisos a toda cuenta con sesión', () => {
    expect(modules.find(m => m.id === 'avisos')).toEqual({ id: 'avisos', label: 'Avisos' });
  });

  it('lista mis avisos con los críticos primero y filtra por sin leer y críticos', async () => {
    const api = reader();
    render(<NoticesPage api={api as unknown as Api} profile={profile()} version={0} />);
    const list = await screen.findByRole('list', { name: 'Mis avisos' });
    expect(within(list).getAllByRole('listitem').map(li => li.querySelector('strong')?.textContent)).toEqual(['Falla de oxígeno', 'Cambio de horario', 'Menú de la cafetería']);
    expect(api.request).not.toHaveBeenCalledWith('/avisos', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: /^Sin leer/ }));
    expect(within(list).queryByText('Menú de la cafetería')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /^Críticos/ }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByLabelText('Nuevo aviso')).toBeNull();
  });

  it('abre el detalle y «Enterado» es la acción principal', async () => {
    const api = reader();
    render(<NoticesPage api={api as unknown as Api} profile={profile()} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /Cambio de horario/ }));
    const detail = screen.getByRole('region', { name: 'Detalle del aviso' });
    expect(within(detail).getByText('Texto de Cambio de horario.')).toBeTruthy();
    expect(within(detail).getByText('Importante')).toBeTruthy();
    await userEvent.click(within(detail).getByRole('button', { name: 'Enterado' }));
    expect(api.write).toHaveBeenCalledWith('/me/avisos/i-1/enterado', {}, 'POST');
    await userEvent.click(screen.getByRole('button', { name: /Menú de la cafetería/ }));
    expect(within(screen.getByRole('region', { name: 'Detalle del aviso' })).queryByRole('button', { name: 'Enterado' })).toBeNull();
  });

  it('quien publica ve cuántas cuentas dieron «Enterado» y publica con nivel y área', async () => {
    const published = [{ id: 'c-1', titulo: 'Falla de oxígeno', cuerpo: 'Texto.', desde: '2026-11-14T12:00:00.000Z', hasta: '2099-11-20T12:00:00.000Z', prioridad: 'critico', nivel: 'critico', publico: false, roles: ['ENF'], areas: [], estado: 'vigente', publicadoEn: '2026-11-14T12:00:00.000Z', version: 1, allowedActions: ['editar', 'retirar'], retiradoEn: null, motivoRetiro: null }];
    const spaces = [{ id: 's-1', parentId: null, type: 'area', code: 'P1-EMG', name: 'Emergencia', active: true, version: 1, path: 'P1-EMG', totalBeds: 0, freeBeds: 0 }, { id: 's-2', parentId: 's-1', type: 'consultorio', code: 'C-101', name: 'Consultorio', active: true, version: 1, path: '', totalBeds: 0, freeBeds: 0 }];
    const api = { request: vi.fn(async (path: string) => path === '/avisos' ? published : path === '/avisos/estadisticas' ? [{ avisoId: 'c-1', enterados: 3, destinatarios: 8 }] : path === '/espacios' ? spaces : inbox([])), write: vi.fn(async (..._args: unknown[]) => ({ id: 'n' })) };
    render(<NoticesPage api={api as unknown as Api} profile={profile(['avisos.publicar', 'espacios.ver'])} version={0} />);
    const row = (await screen.findByText('Falla de oxígeno')).closest('tr') as HTMLElement;
    expect(await within(row).findByText('3/8 enterados')).toBeTruthy();
    expect(row.querySelector('.notice-level')?.textContent).toBe('Crítico');
    await userEvent.type(screen.getByLabelText('Título'), 'Simulacro');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'Simulacro a las 10.');
    await userEvent.click(screen.getByRole('button', { name: 'Importante' }));
    await userEvent.click(screen.getByLabelText(/^Público/));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Emergencia/ }));
    expect(screen.queryByRole('checkbox', { name: /Consultorio/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
    // R7 D-6: one scale; the API derives the old priority from the level.
    expect(api.write.mock.calls[0][1]).toEqual(expect.objectContaining({ nivel: 'importante', publico: false, roles: [], areas: ['P1-EMG'] }));
    expect(api.write.mock.calls[0][1]).not.toHaveProperty('prioridad');
  });
});
