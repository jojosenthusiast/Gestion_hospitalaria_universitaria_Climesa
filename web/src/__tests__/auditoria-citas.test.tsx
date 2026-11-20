import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';
import { maskDateText } from '../components/ui';
import { shownState } from '../features/listas/schedule';

// Audit 2026-11-20 (odd/tasks/auditoria-2026-11-20.md, T1): Citas for Recepción.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const rec = (): AccessProfile => ({
  id: 'rec-1', user: { id: 'rec-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: ['citas.ver', 'citas.agendar', 'citas.cancelar'].map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null,
});
const base = { id: 'c-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', doctorId: 'd-1', doctorName: 'Médica Ficticia', start: '2026-11-20T15:00:00Z', end: '2026-11-20T15:20:00Z', state: 'confirmada', origin: 'recepcion', version: 1, allowedActions: [] as string[], blockedActions: [] as unknown[], reschedule: null as unknown };
const franjas = [
  { start: '2026-11-20T15:00:00Z', end: '2026-11-20T15:20:00Z', estado: 'ocupado', motivo: 'Ocupado' },
  { start: '2026-11-20T15:20:00Z', end: '2026-11-20T15:40:00Z', estado: 'libre', motivo: null },
];

function mount(rows: unknown[]) {
  const api = {
    request: vi.fn(async (path: string) => path.startsWith('/citas/disponibilidad') ? { durationMinutes: 20, workPeriods: [], slots: [franjas[1]], franjas } : path.startsWith('/citas/catalogos') ? { patients: [], doctors: [] } : path === '/citas' ? rows : []),
    write: vi.fn(async () => ({})),
  };
  render(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={0} />);
  return api;
}

describe('Citas · auditoría 2026-11-20', () => {
  it('D61/D63/D62: a change request is its own block; accepting asks, then the card leaves it and says where the appointment went', async () => {
    const row = { ...base, allowedActions: ['aceptar_reprogramacion', 'rechazar_reprogramacion'], reschedule: { id: 'r-1', version: 2, state: 'pendiente', start: '2026-11-23T13:00:00Z', end: '2026-11-23T13:20:00Z', reason: 'Trabajo' } };
    const api = mount([row]);
    const note = await screen.findByRole('note');
    expect(within(note).getByText('Pide cambiar de horario')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /^Aceptar nuevo horario · Paciente Ficticio Uno/ }));
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Aceptar nuevo horario' })).getByRole('button', { name: 'Aceptar nuevo horario' }));
    expect(api.write).toHaveBeenCalledWith('/citas/reprogramaciones/r-1/aceptar', { version: 2 }, 'POST');
    expect(await screen.findByText(/^Nuevo horario aceptado: la cita de Paciente Ficticio Uno pasó a .*«Próximas»\.$/)).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Rechazar nuevo horario ·/ })).toBeNull();
  });

  it('D57: rescheduling marks the slot the appointment holds as «Actual», not «Ocupado»', async () => {
    mount([{ ...base, allowedActions: ['reprogramar'] }]);
    await userEvent.click(await screen.findByRole('button', { name: /^Reprogramar · Paciente Ficticio Uno/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Reprogramar cita' });
    expect(await within(dialog).findByRole('button', { name: /horario actual de la cita/ })).toBeTruthy();
    expect(within(dialog).getByText('Actual')).toBeTruthy();
  });

  it('D59: an overdue appointment shows its blocked actions with the reason instead of nothing', async () => {
    vi.setSystemTime(new Date('2026-11-20T18:00:00Z'));
    mount([{ ...base, blockedActions: [{ action: 'cancelar', reason: 'La hora de la cita ya pasó.' }] }]);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Estado de la cita' })).getByRole('button', { name: /^Todas/ }));
    const cancel = await screen.findByRole('button', { name: /^Cancelar · Paciente Ficticio Uno/ });
    expect(cancel.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('La hora de la cita ya pasó.')).toBeTruthy();
  });
});

describe('shared rules', () => {
  it('D60: an appointment whose arrival was registered is never «vencida»', () => {
    const now = Date.parse('2026-11-20T18:00:00Z');
    expect(shownState(base, now)).toBe('vencida');
    expect(shownState({ ...base, arrival: { numero: 3 } }, now)).toBe('confirmada');
  });

  it('D111/D58: digits typed into a date field take the dd/mm/aaaa shape', () => {
    expect(maskDateText('01')).toBe('01');
    expect(maskDateText('0101')).toBe('01/01');
    expect(maskDateText('01012020')).toBe('01/01/2020');
    expect(maskDateText('010120209')).toBe('01/01/2020');
    expect(maskDateText('01/012')).toBe('01/01/2');
    expect(maskDateText('1/1/2026')).toBe('1/1/2026');
    expect(maskDateText('20/27-')).toBe('2027-');
    expect(maskDateText('2027-01-01')).toBe('2027-01-01');
  });
});
