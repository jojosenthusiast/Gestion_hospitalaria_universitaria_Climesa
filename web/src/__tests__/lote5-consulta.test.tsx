import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ConsultationsPage, VITALS, vitalLabel, vitalRangeError, type Consultation } from '../features/consultations';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); localStorage.clear(); });

const doctor: AccessProfile = { id: 'med-1', user: { id: 'med-1' }, email: 'med@example.test', name: 'Medicina', roles: ['MED'], platforms: ['web'],
  permissions: ['consulta.iniciar', 'consulta.registrar', 'signos.registrar'].map(code => ({ code, context: 'relacion' })), channels: [], patientId: null, staffId: 's' };
const base = { patientId: 'pac-1', start: '2026-11-13T15:00:00Z', end: '2026-11-13T15:20:00Z', appointmentState: 'confirmada' };
const openOne: Consultation = { ...base, appointmentId: 'cita-1', patientName: 'Paciente Uno', consultationId: 'cons-1', consultationState: 'abierta', consultationReason: '', plan: '', version: 2 };
const newOne: Consultation = { ...base, appointmentId: 'cita-2', patientName: 'Paciente Dos', consultationId: null, consultationState: null };
const unsigned = [{ id: 'cons-9', patientId: 'pac-9', patientName: 'Paciente Nueve', startedAt: '2026-11-12T15:00:00Z', version: 1 }];

function mount(agenda: Consultation[], sinFirmar: unknown[] = []) {
  const api = { request: vi.fn(async (path: string) => {
    if (path === '/consultas/agenda') return agenda;
    if (path === '/consultas/sin-firmar') return sinFirmar;
    if (path === '/consultas/cons-1/detalle') return { diagnoses: [], prescriptions: [] };
    if (path === '/consultas/cons-9/detalle') return { consultation: { id: 'cons-9', patientId: 'pac-9', state: 'abierta', version: 1, patientName: 'Paciente Nueve', reason: 'Control' }, diagnoses: [], prescriptions: [] };
    throw new ApiError(`Ruta inesperada: ${path}`, 404);
  }), write: vi.fn(async () => ({ version: 3 })) };
  render(<ConsultationsPage api={api as unknown as Api} profile={doctor} version={0} />);
  return api;
}

describe('Lote 5 S12/S3 · consulta en web', () => {
  it('vital signs use full names with units, never PA, FC, Temp or Sat. O₂', async () => {
    mount([openOne]);
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    const dialog = screen.getByRole('dialog');
    for (const label of ['Presión sistólica (mmHg)', 'Presión diastólica (mmHg)', 'Frecuencia cardiaca (lpm)', 'Temperatura (°C)', 'Saturación de oxígeno (%)']) expect(within(dialog).getByLabelText(label)).toBeTruthy();
    expect(within(dialog).queryByLabelText(/^PA |Sat\. O|^FC$|^Temp\b/)).toBeNull();
    expect(VITALS.map(vitalLabel)).toHaveLength(5);
  });

  it('a vital out of range says so at the field and blocks «Registrar signos»', async () => {
    mount([openOne]);
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Temperatura (°C)'), '50');
    expect(within(dialog).getByText('Fuera de rango: entre 30 y 45 °C.')).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Registrar signos' }) as HTMLButtonElement).disabled).toBe(true);
    expect(vitalRangeError(VITALS[0], '120')).toBeUndefined();
  });

  it('required fields are marked and explained, and signing with them empty shows the error at each field', async () => {
    const api = mount([openOne]);
    await userEvent.click(await screen.findByRole('button', { name: /Continuar/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Los campos con * son obligatorios.')).toBeTruthy();
    expect((within(dialog).getByLabelText('Motivo de consulta') as HTMLInputElement).required).toBe(true);
    expect((within(dialog).getByLabelText('Plan') as HTMLTextAreaElement).required).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Firmar consulta' }));
    expect(within(dialog).getByText('Escribe el motivo de consulta para poder firmar.')).toBeTruthy();
    expect(within(dialog).getByText('Escribe el plan para poder firmar.')).toBeTruthy();
    expect(within(dialog).getByLabelText('Plan').getAttribute('aria-invalid')).toBe('true');
    expect(api.write).not.toHaveBeenCalled();
  });

  it('starting another consultation with one unsigned asks first; «Reanudarla» is the main choice', async () => {
    mount([newOne], unsigned);
    await screen.findByText('Paciente Nueve');
    await userEvent.click(await screen.findByRole('button', { name: /Iniciar consulta/ }));
    const guard = screen.getByRole('dialog', { name: 'Tienes una consulta sin firmar de Paciente Nueve' });
    expect(within(guard).getByText(/Lo recomendable es terminarla y firmarla antes de atender a otro paciente\./)).toBeTruthy();
    expect(within(guard).getByRole('button', { name: 'Reanudarla' }).className).toBe('primary-button');
    await userEvent.click(within(guard).getByRole('button', { name: 'Iniciar otra de todos modos' }));
    expect(await screen.findByRole('dialog', { name: 'Iniciar consulta' })).toBeTruthy();
  });

  it('«Reanudarla» opens the unsigned one; with none unsigned there is no question', async () => {
    mount([newOne], unsigned);
    await screen.findByText('Paciente Nueve');
    await userEvent.click(await screen.findByRole('button', { name: /Iniciar consulta/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Reanudarla' }));
    expect(await screen.findByRole('dialog', { name: 'Continuar consulta' })).toBeTruthy();
    cleanup();
    mount([newOne]);
    await userEvent.click(await screen.findByRole('button', { name: /Iniciar consulta/ }));
    expect(await screen.findByRole('dialog', { name: 'Iniciar consulta' })).toBeTruthy();
  });
});
