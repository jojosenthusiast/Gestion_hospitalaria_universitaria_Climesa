import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { NoticesPage } from '../features/avisos/NoticesPage';

/** R7 U3, journey D1 "Comprobaciones" on a fixed clock (Wednesday 2026-12-02, 09:00 local). */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const profile = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'jop@example.test', name: 'Jefatura Ficticia', roles: ['JOP'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const spaces = [{ id: 's-1', parentId: null, type: 'area', code: 'P1-HOS', name: 'Hospitalización', active: true, version: 1, path: 'P1-HOS', totalBeds: 0, freeBeds: 0 }];

function mount(permissions = ['avisos.publicar', 'espacios.ver'], reachFor = (path: string): number => path.includes('areas=P1-HOS') ? 38 : 12) {
  const request = vi.fn(async (path: string) => {
    if (path === '/avisos' || path === '/avisos/estadisticas') return [];
    if (path === '/espacios') return spaces;
    if (path.startsWith('/avisos/alcance')) return { destinatarios: reachFor(path) };
    return { avisos: [], noLeidos: 0, criticos: 0, recordatorioHoras: 4 };
  });
  const write = vi.fn(async () => ({ id: 'n-1' }));
  render(<NoticesPage api={{ request, write } as unknown as Api} profile={profile(permissions)} version={0} />);
  return { request, write };
}

describe('R7 D1 · publicar avisos', () => {
  it('una audiencia sin nadie activo lo dice en vez de «Llega a 0 personas»; los miles llevan separador', async () => {
    mount(undefined, path => path.includes('areas=P1-HOS') ? 1284 : 0);
    await userEvent.type(await screen.findByLabelText('Título'), 'Aviso');
    await userEvent.click(screen.getByLabelText(/^Público/));
    await userEvent.click(screen.getByRole('checkbox', { name: /Enfermería/ }));
    expect(await screen.findByText('Nadie del personal activo recibe este aviso con esta audiencia.')).toBeTruthy();
    expect(screen.queryByText(/Llega a 0/)).toBeNull();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Hospitalización/ }));
    expect(await screen.findByText(/^Llega a 1.?284 personas$/)).toBeTruthy();
  });

  it('«Importante» para ENF de HOS: muestra «llega a N personas» y publica solo con nivel', async () => {
    const { request, write } = mount();
    await userEvent.type(await screen.findByLabelText('Título'), 'Cambio de turno');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'El relevo de la noche será a las 19:00.');
    await userEvent.click(screen.getByRole('button', { name: 'Importante' }));
    await userEvent.click(screen.getByLabelText(/^Público/));
    await userEvent.click(screen.getByRole('checkbox', { name: /Enfermería/ }));
    expect(await screen.findByText('Llega a 12 personas')).toBeTruthy();
    await userEvent.click(await screen.findByRole('checkbox', { name: /Hospitalización/ }));
    expect(await screen.findByText('Llega a 38 personas')).toBeTruthy();
    expect(request.mock.calls.map(call => call[0])).toContain('/avisos/alcance?roles=ENF&areas=P1-HOS');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    const [path, body, method] = write.mock.calls[0] as unknown as [string, Record<string, unknown>, string];
    expect([path, method]).toEqual(['/avisos', 'POST']);
    expect(body).toEqual(expect.objectContaining({ nivel: 'importante', publico: false, roles: ['ENF'], areas: ['P1-HOS'] }));
    expect(body).not.toHaveProperty('prioridad');
  });

  it('un aviso crítico pide confirmación con resumen antes de publicar', async () => {
    const { write } = mount();
    await userEvent.type(await screen.findByLabelText('Título'), 'Falla de oxígeno');
    await userEvent.type(screen.getByLabelText('Texto del aviso'), 'Usar el respaldo del piso 2.');
    await userEvent.click(screen.getByRole('button', { name: 'Crítico' }));
    await userEvent.click(screen.getByLabelText(/^Público/));
    await userEvent.click(screen.getByRole('checkbox', { name: /Enfermería/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Publicar aviso' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publicar aviso' });
    expect(within(dialog).getByText('Falla de oxígeno')).toBeTruthy();
    expect(within(dialog).getByText('Llega a 12 personas')).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar aviso' }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Aviso publicado. Ya aparece donde lo elegiste.')).toBeTruthy();
  });

  it('sin permiso para ver espacios explica por qué no hay áreas', async () => {
    mount(['avisos.publicar']);
    expect(await screen.findByText(/Para dirigirlo a un área hace falta el permiso de ver espacios/)).toBeTruthy();
  });
});
