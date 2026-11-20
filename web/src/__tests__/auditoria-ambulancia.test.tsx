import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import { DispatchForm } from '../features/ambulance/dialogs';
import { PrehospitalDialog } from '../features/ambulance';

// Audit 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T1): dispatch and prehospital for Recepción.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const pool = [{ staffId: 'p-1', role: 'paramedico', name: 'Paramédico Ficticio', hasAccount: true }, { staffId: 'm-1', role: 'motorista', name: 'Motorista Ficticio', hasAccount: false }];
const view = (over: Record<string, unknown> = {}) => ({ serviceId: 's-1', version: 3, active: true, arrived: true, priority: 'naranja', patientLinked: false, clinical: false, handover: null, allowedActions: [], reports: [], ...over });

describe('Despacho · auditoría', () => {
  it('D16: «elige un paramédico» shows right above «Despachar», not at the top, and nothing is sent', async () => {
    const api = { request: vi.fn(), write: vi.fn() } as unknown as Api & { write: ReturnType<typeof vi.fn> };
    render(<DispatchForm api={api} unitVersion={1} request={null} crewPool={pool} onClose={() => {}} onSaved={() => {}} />);
    await userEvent.type(screen.getByLabelText(/Origen/), 'Hospital Ficticio Norte');
    await userEvent.click(screen.getByRole('checkbox', { name: /Paramédico Ficticio/ }));
    await userEvent.click(screen.getByRole('button', { name: /Despachar/ }));
    const alert = await screen.findByText('Elige un paramédico con cuenta en la app: registra los hitos del servicio.');
    const actions = screen.getByRole('button', { name: /Despachar/ }).closest('.dialog-actions')!;
    expect(alert.closest('.write-error')!.nextElementSibling).toBe(actions);
    expect(api.write).not.toHaveBeenCalled();
  });
});

describe('Reporte prehospital · recepción (D120)', () => {
  it('offers «Marcar recibido» only when the API lists «recibir», and sends it', async () => {
    const api = { request: vi.fn(async () => view({ allowedActions: ['recibir'] })), write: vi.fn(async () => ({ receivedAt: '2026-11-20T12:00:00Z' })) } as unknown as Api & { write: ReturnType<typeof vi.fn> };
    render(<PrehospitalDialog api={api} serviceId="s-1" version={0} onClose={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar recibido al paciente' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/servicios/s-1/recepcion', {}, 'POST');
  });

  it('without «recibir» there is no button and the line says who registers the handover', async () => {
    const api = { request: vi.fn(async () => view()), write: vi.fn() } as unknown as Api;
    render(<PrehospitalDialog api={api} serviceId="s-1" version={0} onClose={() => {}} />);
    const dialog = await screen.findByRole('dialog', { name: 'Reporte prehospital' });
    expect(await within(dialog).findByText(/tu cuenta no puede marcarla/)).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Marcar recibido al paciente' })).toBeNull();
  });
});
