import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Patient } from '../lib/api';
import { PatientForm, PatientsPage } from '../features/patients';

/**
 * Owner observations 2026-11-18, batch 2: the app account joins its record on its own by verified email. Recepción writes
 * the patient's email on the record and sees whether the account already joined; there is no «Vinculaciones» screen.
 */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const base: Patient = { id: 'p1', record: 'EXP-000001', fullName: 'Ana Ficticia', givenNames: 'Ana', surnames: 'Ficticia', state: 'activo', active: true, sex: 'femenino', birth: '1990-05-01', dui: null, phone: '7000-0000', email: 'ana@example.test', address: null, version: 3, history: [] };
const perfil = (codes: string[]): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'r@example.test', name: 'Rec', roles: ['REC'], platforms: ['web'], permissions: codes.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null });

describe('ficha: cuenta de la app', () => {
  const abrir = async (paciente: Patient) => {
    const api = { request: vi.fn(async (path: string) => path === '/pacientes/p1' ? paciente : [paciente]), write: vi.fn() };
    render(<PatientsPage api={api as unknown as Api} profile={perfil(['pacientes.buscar', 'pacientes.ver_ficha'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    return screen.findByRole('complementary', { name: 'Ficha de paciente' });
  };
  const linea = (ficha: HTMLElement) => within(ficha).queryByText('Cuenta de la app')?.closest('div')?.querySelector('dd')?.textContent;

  it('dice si la cuenta ya está vinculada o si todavía no hay cuenta', async () => {
    expect(linea(await abrir({ ...base, appAccount: 'vinculada' }))).toBe('Vinculada');
    cleanup();
    expect(linea(await abrir({ ...base, appAccount: 'sin_cuenta' }))).toBe('Sin cuenta todavía');
  });

  it('explica que un correo repetido impide vincular', async () => {
    expect(linea(await abrir({ ...base, appAccount: 'correo_repetido' }))).toMatch(/otro expediente activo tiene este mismo correo/);
  });

  it('no aparece para quien no ve los datos de contacto (la API no manda el campo)', async () => {
    const ficha = await abrir({ ...base, email: undefined, phone: undefined });
    await within(ficha).findByRole('tablist', { name: 'Secciones de la ficha' });
    expect(within(ficha).queryByText('Cuenta de la app')).toBeNull();
  });
});

describe('formulario: correo del paciente', () => {
  const montar = (write: Api['write']) => {
    const api = { request: vi.fn(), write: vi.fn(write) };
    render(<PatientForm api={api as unknown as Api} patient={base} receipt={null} query="" onClose={() => undefined} onSaved={() => undefined} />);
    return api;
  };

  it('pide el correo y explica que une la cuenta de la app sola', () => {
    montar(async () => ({}) as never);
    const campo = screen.getByLabelText(/^Correo del paciente/);
    expect((campo as HTMLInputElement).value).toBe('ana@example.test');
    expect(screen.getByText('Con este correo, su cuenta de la app se une sola a este expediente.')).toBeTruthy();
  });

  it('valida el formato antes de enviar', async () => {
    const api = montar(async () => ({}) as never);
    const campo = screen.getByLabelText(/^Correo del paciente/);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'sin-arroba');
    await userEvent.type(screen.getByLabelText(/Motivo de la corrección/), 'Recepción corrige el correo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(api.write).not.toHaveBeenCalled();
  });

  it('muestra en el campo, una sola vez, el 409 de correo ya usado en otro expediente', async () => {
    const mensaje = 'Ese correo ya está en el expediente activo 0000002-5. Cada correo puede estar en un solo expediente activo: revisa si es la misma persona o usa otro correo.';
    const api = montar(async () => { throw new ApiError(mensaje, 409, 'correo_en_uso'); });
    await userEvent.type(screen.getByLabelText(/Motivo de la corrección/), 'Recepción corrige el correo');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar corrección' }));
    expect(api.write).toHaveBeenCalledWith('/pacientes/p1', expect.objectContaining({ email: 'ana@example.test' }), 'PATCH');
    expect(await screen.findAllByText(mensaje)).toHaveLength(1);
    expect(screen.getByLabelText(/^Correo del paciente/).getAttribute('aria-invalid')).toBe('true');
  });
});
