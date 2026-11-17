import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { QueuePage } from '../features/queue';
import { PatientsPage } from '../features/patients';

// R7 U1 journey B1, check 3: "Buscar un DUI inexistente → Registrar paciente. Se espera: DUI prellenado;
// al guardar se ofrece emitir número sin volver a buscar".
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const REC = ['fila.ver', 'fila.emitir', 'fila.gestionar', 'fila.llamar', 'pacientes.buscar', 'pacientes.ver_ficha', 'pacientes.registrar'];
const DUI = '04567891-1';

describe('B1 · un DUI que no existe se registra y recibe número sin volver a buscar', () => {
  it('prefills the DUI (never in the URL) and, after saving, offers «Emitir número» for the new patient', async () => {
    const queueApi = {
      request: vi.fn(async (path: string) => (path.startsWith('/pacientes/selector') ? { items: [], hasMore: false } : [])),
      write: vi.fn(async () => ({})),
    };
    render(<QueuePage api={queueApi as unknown as Api} profile={perfil(REC)} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /Emitir número/ }));
    const desk = await screen.findByRole('dialog', { name: 'Mostrador' });
    await userEvent.type(within(desk).getByRole('combobox', { name: 'Paciente' }), DUI);
    expect(await within(desk).findByText('No hay pacientes con ese nombre, DUI o expediente.')).toBeTruthy();
    const register = within(desk).getByRole('link', { name: 'Registrar paciente nuevo' });
    expect(register.getAttribute('href')).toBe('#/pacientes?accion=registrar');
    await userEvent.click(register);
    cleanup();

    // The router mounts the patients page on that address.
    location.hash = '#/pacientes?accion=registrar';
    const write = vi.fn(async (path: string, ..._rest: unknown[]) => (path === '/pacientes/busquedas'
      ? { token: 'tok-1', expiresAt: new Date(Date.now() + 600_000).toISOString(), candidates: [] }
      : { id: 'p-new', record: '000300-1', version: 1 }));
    render(<PatientsPage api={{ request: vi.fn(async () => []), write } as unknown as Api} profile={perfil(REC)} version={0} />);
    const form = await screen.findByRole('dialog', { name: 'Registrar paciente' });
    expect((within(form).getByLabelText(/^DUI/) as HTMLInputElement).value).toBe(DUI);
    expect(location.hash).not.toContain('0456');
    await userEvent.type(within(form).getByLabelText('Nombres'), 'Rosa');
    await userEvent.type(within(form).getByLabelText('Apellidos'), 'Ficticia');
    await userEvent.click(within(form).getByRole('button', { name: /Registrar paciente/ }));
    await vi.waitFor(() => expect(write.mock.calls.filter(([p]) => p === '/pacientes')).toHaveLength(1));
    expect(write.mock.calls.find(([p]) => p === '/pacientes')?.[1]).toMatchObject({ dui: DUI, givenNames: 'Rosa', surnames: 'Ficticia', searchToken: 'tok-1' });
    const issue = await screen.findByRole('link', { name: 'Emitir número' });
    expect(issue.getAttribute('href')).toBe('#/fila?accion=emitir&paciente=p-new');
    expect(screen.getByText(/000300-1/)).toBeTruthy();
  });

  it('a register opened from anywhere else starts empty and offers no number', async () => {
    location.hash = '#/pacientes?accion=registrar';
    const write = vi.fn(async (path: string, ..._rest: unknown[]) => (path === '/pacientes/busquedas'
      ? { token: 'tok-2', expiresAt: new Date(Date.now() + 600_000).toISOString(), candidates: [] }
      : { id: 'p-other', record: '000301-1', version: 1 }));
    render(<PatientsPage api={{ request: vi.fn(async () => []), write } as unknown as Api} profile={perfil(REC)} version={0} />);
    const form = await screen.findByRole('dialog', { name: 'Registrar paciente' });
    expect((within(form).getByLabelText(/^DUI/) as HTMLInputElement).value).toBe('');
    await userEvent.type(within(form).getByLabelText('Nombres'), 'Luis');
    await userEvent.type(within(form).getByLabelText('Apellidos'), 'Prueba');
    await userEvent.click(within(form).getByRole('button', { name: /Registrar paciente/ }));
    await vi.waitFor(() => expect(write.mock.calls.filter(([p]) => p === '/pacientes')).toHaveLength(1));
    expect(screen.queryByRole('link', { name: 'Emitir número' })).toBeNull();
  });
});
