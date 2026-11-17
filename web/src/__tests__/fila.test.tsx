import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { QueuePage } from '../features/queue';

// WEB-12: Fila del día (W29) — flujo feliz, conflicto 409 y permisos.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const ticket = (state: string, numero = 7, allowedActions: string[] = [], blockedActions: { action: string; reason: string }[] = []) => ({ id: `t-${numero}`, service: 'consulta_general', fecha: '2026-11-13', numero, patientName: 'Paciente Ficticio Uno', state, llamados: state === 'llamado' ? 1 : 0, version: 2, issuedAt: '2026-11-13T14:00:00Z', maxCalls: 3, callsForAbsence: 3, allowedActions, blockedActions });

function montar(permissions: string[], rows = [ticket('en_espera')], write: Api['write'] = vi.fn(async () => ({})) as Api['write']) {
  const api = {
    request: vi.fn(async (path: string) => path.startsWith('/pacientes/selector') ? { items: [{ id: 'p-1', fullName: 'Paciente Ficticio Uno', record: '000101-1' }], hasMore: false } : rows),
    write: vi.fn(write),
  } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<QueuePage api={api} profile={perfil(permissions)} version={0} />);
  return api;
}

describe('Fila del día (W29)', () => {
  it('llama al siguiente con la versión del número y recarga la fila', async () => {
    const api = montar(['fila.ver', 'fila.llamar'], [ticket('en_espera', 7, ['llamar'])]);
    await userEvent.click(await screen.findByRole('button', { name: /^Llamar$/ }));
    expect(api.write).toHaveBeenCalledWith('/fila/t-7/llamar', { version: 2 }, 'POST');
    // R4a: «Quién sigue» is always on the board now, so the refresh also re-reads `/fila/siguiente`; count the board only.
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([p]) => String(p) === '/fila').length).toBe(2));
  });

  it('muestra los estados en español, no el código', async () => {
    montar(['fila.ver'], [ticket('en_espera', 1), ticket('no_se_presento', 2)]);
    expect(await screen.findByRole('region', { name: 'En espera' })).toBeTruthy();
    const terminados = screen.getByRole('region', { name: 'Terminados' });
    expect(within(terminados).getByText('No se presentó')).toBeTruthy();
  });

  it('sin fila.llamar ni fila.gestionar solo consulta: no hay acciones ni botón de emitir', async () => {
    montar(['fila.ver'], [ticket('llamado')]);
    await screen.findByText('Paciente Ficticio Uno');
    // R4a: the read-only sentence became a short «Solo lectura» mark in the header.
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Llamar|Iniciar atención|No se presentó/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Emitir número/ })).toBeNull();
  });

  it('un 409 de versión ofrece recargar la fila', async () => {
    const api = montar(['fila.ver', 'fila.gestionar'], [ticket('llamado', 7, ['atender'])], vi.fn(async () => { throw new ApiError('El número cambió.', 409, 'version_conflicto', 3); }) as Api['write']);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar atención' }));
    await userEvent.click(await screen.findByRole('button', { name: /Recargar la fila/ }));
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([p]) => String(p).startsWith('/fila')).length).toBe(2));
  });

  it('emite un número para el paciente elegido', async () => {
    const api = montar(['fila.ver', 'fila.emitir', 'fila.gestionar']);
    await userEvent.click(await screen.findByRole('button', { name: /Emitir número/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Emitir número de fila' });
    await userEvent.type(within(dialogo).getByRole('combobox', { name: 'Paciente' }), 'pac');
    await userEvent.click(await within(dialogo).findByRole('option', { name: /Paciente Ficticio Uno/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: /Emitir|Guardar/ }));
    expect(api.write).toHaveBeenCalledWith('/fila', { service: 'consulta_general', patientId: 'p-1' }, 'POST');
  });

  // R4a: the summary cards were removed (they repeated the column counts); the column headers carry the counts.
  it('filtra por servicio con el control segmentado y cuenta cada estado en su columna', async () => {
    montar(['fila.ver'], [{ ...ticket('en_espera', 1) }, { ...ticket('llamado', 2), service: 'laboratorio' }, { ...ticket('atendido', 3) }]);
    const espera = await screen.findByRole('region', { name: 'En espera' });
    expect(within(espera).getByLabelText('1 número')).toBeTruthy();
    await userEvent.click(within(screen.getByRole('group', { name: 'Servicio' })).getByRole('button', { name: /^Laboratorio/ }));
    expect(within(screen.getByRole('region', { name: 'Llamados' })).getByText('2')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'En espera' })).getByText('Nadie por ahora.')).toBeTruthy();
    await userEvent.click(within(screen.getByRole('group', { name: 'Servicio' })).getByRole('button', { name: /^Todos/ }));
    expect(within(screen.getByRole('region', { name: 'En espera' })).queryByText('Nadie por ahora.')).toBeNull();
  });
});

describe('Fila del día · acciones según el servidor (FILA-01, FILA-02)', () => {
  it('"No se presentó" aparece desactivado con el motivo hasta completar los llamados', async () => {
    montar(['fila.ver', 'fila.gestionar'], [ticket('llamado', 7, ['atender'], [{ action: 'no_se_presento', reason: 'Disponible después de 3 llamados (van 1).' }])]);
    // R1 (S4): aria-disabled keeps it focusable; the reason is its accessible description (a tooltip), not body text.
    const boton = await screen.findByRole('button', { name: 'No se presentó' });
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(boton.getAttribute('aria-describedby')!)!.textContent).toBe('Disponible después de 3 llamados (van 1).');
    expect(document.querySelector('.form-hint')?.textContent ?? '').not.toMatch(/Disponible después/);
    expect(screen.getByText(/Llamado 1 de 3 vez/)).toBeTruthy();
  });

  it('recepción ve el estado real de quien espera y no tiene acciones que el servidor rechazaría', async () => {
    montar(['fila.ver', 'fila.gestionar', 'fila.emitir'], [ticket('en_espera')]);
    expect(await screen.findByText(/Esperando a que el médico llame/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /No se presentó|Llamar/ })).toBeNull();
  });

  it('la acción rápida del tablero ?accion=emitir abre el formulario y se consume del hash', async () => {
    location.hash = '#/fila?accion=emitir';
    montar(['fila.ver', 'fila.emitir', 'fila.gestionar', 'fila.llamar']);
    expect(await screen.findByRole('dialog', { name: 'Emitir número de fila' })).toBeTruthy();
    expect(location.hash).not.toContain('accion=');
    location.hash = '';
  });

  it('llamar siguiente pide al servidor el primer número del servicio elegido', async () => {
    const api = montar(['fila.ver', 'fila.llamar'], [ticket('en_espera', 7, ['llamar'])]);
    await userEvent.click(await screen.findByRole('radio', { name: /Consulta general/ }).catch(() => screen.findByRole('button', { name: /Consulta general/ })));
    await userEvent.click(await screen.findByRole('button', { name: /Llamar siguiente/ }));
    expect(api.write).toHaveBeenCalledWith('/fila/llamar-siguiente', { service: 'consulta_general' }, 'POST');
  });
});
