import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Patient } from '../lib/api';
import { PatientsPage } from '../features/patients';
import { ageFrom, profileGaps, validatePatientDraft } from '../features/listas/patient-rules';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

describe('reglas de la ficha', () => {
  const ok = { givenNames: 'Ana', surnames: 'Ficticia' };
  it('acepta una ficha mínima y los opcionales vacíos', () => { expect(validatePatientDraft({ ...ok, dui: '', phone: '', email: '', birth: '' })).toEqual({}); });
  it('explica qué corregir en cada campo', () => {
    const errors = validatePatientDraft({ givenNames: 'A1', surnames: 'F', dui: '12345678-0', phone: '1234', email: 'sin-arroba', birth: '2999-01-01' }, new Date('2026-11-14T12:00:00Z'));
    expect(Object.keys(errors).sort()).toEqual(['birth', 'dui', 'email', 'givenNames', 'phone', 'surnames']);
    expect(errors.birth).toMatch(/futura/);
  });
  it('un DUI con dígito verificador correcto pasa', () => { expect(validatePatientDraft({ ...ok, dui: '00000001-8' }).dui).toBeUndefined(); });
  it('señala los datos que faltan solo si el rol los ve', () => {
    expect(profileGaps({ dui: null, phone: '7000-0000' })).toEqual(['DUI']);
    expect(profileGaps({})).toEqual([]);
  });
  it('calcula la edad', () => { expect(ageFrom('1990-05-01', new Date(2026, 10, 14))).toBe(36); expect(ageFrom(null)).toBeNull(); });
});

describe('ficha maestro-detalle', () => {
  const paciente: Patient = { id: 'p1', record: 'EXP-000001', fullName: 'Ana Ficticia', givenNames: 'Ana', surnames: 'Ficticia', state: 'activo', active: true, sex: 'femenino', birth: '1990-05-01', dui: null, phone: '7000-0000', email: null, address: null, version: 3, matchReason: 'Documento', history: [] };
  const perfil = (codes: string[]): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'r@example.test', name: 'Rec', roles: ['REC'], platforms: ['web'], permissions: codes.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null });
  const montar = (codes: string[]) => {
    const api = { request: vi.fn(async (path: string) => path === '/pacientes/p1' ? paciente : path.startsWith('/citas') ? [{ id: 'c1', patientId: 'p1', patientName: 'Ana Ficticia', doctorId: 'd', doctorName: 'Dr. Ficticio', start: '2026-11-20T14:00:00Z', end: '2026-11-20T14:20:00Z', state: 'confirmada', origin: 'recepcion', version: 1 }] : [paciente]), write: vi.fn() };
    render(<PatientsPage api={api as unknown as Api} profile={perfil(codes)} version={0} />);
    return api;
  };

  it('muestra pestañas según el permiso, avisa de los datos faltantes y lista las citas con su rango', async () => {
    montar(['pacientes.buscar', 'pacientes.ver_ficha', 'citas.ver']);
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    const tabs = await screen.findByRole('tablist', { name: 'Secciones de la ficha' });
    expect(within(tabs).getAllByRole('tab').map(t => t.textContent)).toEqual(['Datos', 'Citas', 'Cambios']);
    expect(await screen.findByText(/Faltan datos/)).toBeTruthy();
    await userEvent.click(within(tabs).getByRole('tab', { name: 'Citas' }));
    expect(await screen.findByText(/08:00 – 08:20/)).toBeTruthy();
  });

  it('pide la lista con el texto mientras se escribe', async () => {
    const api = montar(['pacientes.buscar', 'pacientes.ver_ficha']);
    await userEvent.type(await screen.findByLabelText(/Nombre, DUI o expediente/), 'ana');
    await vi.waitFor(() => expect(api.request.mock.calls.some(([path]) => String(path).includes('query=ana'))).toBe(true));
  });

  it('el formulario de registro muestra los errores de cada campo antes de enviar', async () => {
    const api = montar(['pacientes.buscar', 'pacientes.ver_ficha', 'pacientes.registrar', 'pacientes.editar_demograficos']);
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    await userEvent.click(await screen.findByRole('button', { name: /Editar datos/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Corregir datos personales' });
    await userEvent.type(within(dialogo).getByLabelText(/Correo/), 'sin-arroba');
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'motivo suficiente');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Guardar corrección/ }));
    expect(await within(dialogo).findByText(/Revisa el correo/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });
});
