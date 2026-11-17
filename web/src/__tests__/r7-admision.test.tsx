import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { HospitalizationPage } from '../features/hospitalization';

/** R7 U3, journey G3 "Comprobaciones" on a fixed clock (Wednesday 2026-12-02, 09:00 local). */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ''; });

const profile: AccessProfile = { id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción Ficticia', roles: ['REC'], platforms: ['web'], permissions: ['admision.ver', 'admision.crear', 'camas.asignar'].map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' };
const indicated = { id: 'adm-1', patientId: 'p-1', patientName: 'Ana Pérez Ficticia', origin: 'consulta', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: true, bed: '', version: 1, motive: 'Neumonía con hipoxemia', attendingDoctorName: 'Dra. Ana Isabel Ejemplo López', allowedActions: ['asignar_cama', 'cancelar'] };

function mount(beds: unknown[]) {
  let rows: unknown[] = [indicated];
  const request = vi.fn(async (path: string) => path.includes('/sugerencias-cama') ? beds : rows);
  const write = vi.fn(async () => { rows = []; return { id: 'adm-1', version: 2 }; });
  render(<HospitalizationPage api={{ request, write } as unknown as Api} profile={profile} version={0} />);
  return { request, write };
}

describe('R7 G3 · ingresos indicados', () => {
  it('REC ve «Ingresos indicados (1)» e ingresa en dos clics, sin buscar al paciente ni teclear', async () => {
    const { write } = mount([{ id: 'bed-203', version: 5, code: 'HAB-203', room: 'Habitación 203', category: 'semiprivada', reason: 'Aislamiento disponible' }]);
    const tray = await screen.findByRole('region', { name: 'Ingresos indicados' });
    expect(within(tray).getByRole('heading').textContent).toBe('Ingresos indicados 1');
    expect(within(tray).getByText(/Indicado por Dra. Ana Isabel Ejemplo López · Semiprivada · Aislamiento/)).toBeTruthy();
    await userEvent.click(within(tray).getByRole('button', { name: 'Ingresar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ingresar paciente indicado' });
    expect(within(dialog).getByText('Neumonía con hipoxemia')).toBeTruthy();
    expect((within(dialog).getByRole('radio', { name: /HAB-203/ }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cama' }));
    expect(write).toHaveBeenCalledWith('/admisiones/adm-1/cama', { bedId: 'bed-203', version: 5 }, 'POST');
    expect(await screen.findByText('Ana Pérez Ficticia: ingresada · Cama HAB-203.')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('region', { name: 'Ingresos indicados' })).toBeNull());
  });

  it('sin camas de aislamiento libres dice «No hay camas compatibles» y ofrece ingresar sin cama o ver el tablero', async () => {
    const { write } = mount([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Ingresar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ingresar paciente indicado' });
    expect(within(dialog).getByText('No hay camas compatibles')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Ver tablero' }).getAttribute('href')).toBe('#/camas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ingresar sin cama' }));
    expect(write).not.toHaveBeenCalled();
    expect(await screen.findByText(/queda ingresada sin cama/)).toBeTruthy();
  });

  it('?ingresar=<id> desde Inicio abre directo la elección de cama', async () => {
    location.hash = '#/hospitalizacion?ingresar=adm-1';
    mount([{ id: 'bed-203', version: 5, code: 'HAB-203', room: 'Habitación 203', category: 'semiprivada', reason: 'Libre' }]);
    expect(await screen.findByRole('dialog', { name: 'Ingresar paciente indicado' })).toBeTruthy();
    expect(location.hash).toBe('#/hospitalizacion');
  });
});
