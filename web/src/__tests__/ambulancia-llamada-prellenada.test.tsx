import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AmbulancePage } from '../features/ambulance';
import { PhoneRequestForm } from '../features/ambulance/dialogs';

// Fase 2, S13 (T10w, W2): the phone request opens from the quick action and prefills what the chosen patient record knows.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const perfil = (permissions: string[]): AccessProfile => ({
  id: 'rec-1', user: { id: 'rec-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 'rec-1',
});
const ficha = { id: 'p1', record: 'EXP-000001', fullName: 'Ana Ficticia', givenNames: 'Ana', surnames: 'Ficticia', state: 'activo', active: true, sex: 'femenino', phone: '7000-0000', address: 'Colonia Ficticia, casa 1', version: 1 };
function api() {
  return {
    request: vi.fn(async (path: string) => {
      if (path.startsWith('/pacientes/selector')) return { items: [{ id: 'p1', record: 'EXP-000001', fullName: 'Ana Ficticia', age: 36 }], hasMore: false };
      if (path === '/pacientes/p1') return ficha;
      return { unit: { id: 'u', plate: 'P-000-001', state: 'disponible', version: 1 }, activeService: null, paramedicOnDuty: true };
    }),
    write: vi.fn(async () => ({ id: 'r1' })),
  } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
}
const conFicha = perfil(['ambulancia.solicitar', 'pacientes.buscar', 'pacientes.ver_ficha']);
async function elegirPaciente() {
  await userEvent.type(screen.getByRole('combobox', { name: /Paciente/ }), 'Ana');
  await userEvent.click(await screen.findByRole('option', { name: /Ana Ficticia/ }));
}

describe('llamada de ambulancia prellenada (S13)', () => {
  it('«Solicitar ambulancia» del inicio abre directamente el registro de la llamada', async () => {
    location.hash = '#/ambulancia?accion=solicitud';
    render(<AmbulancePage api={api()} profile={perfil(['ambulancia.ver_estado', 'ambulancia.solicitar'])} version={0} />);
    expect(await screen.findByRole('dialog', { name: 'Registrar llamada' })).toBeTruthy();
    expect(location.hash).toBe('#/ambulancia');
  });

  it('al elegir el paciente copia quien llama, teléfono y dirección, y lo dice', async () => {
    const a = api();
    render(<PhoneRequestForm api={a} profile={conFicha} onClose={() => {}} onSaved={() => {}} />);
    await elegirPaciente();
    expect(await screen.findByText('Copiamos del expediente: nombre de quien llama, teléfono y dirección.')).toBeTruthy();
    expect(screen.getByLabelText('Nombre de quien llama')).toHaveProperty('value', 'Ana Ficticia');
    expect(screen.getByLabelText('Teléfono de contacto')).toHaveProperty('value', '7000-0000');
    expect(screen.getByLabelText('Dirección')).toHaveProperty('value', 'Colonia Ficticia, casa 1');
  });

  it('no vuelve a llenar un campo que la persona vació y el aviso solo nombra lo llenado', async () => {
    render(<PhoneRequestForm api={api()} profile={conFicha} onClose={() => {}} onSaved={() => {}} />);
    const quien = screen.getByLabelText('Nombre de quien llama');
    await userEvent.type(quien, 'Vecino');
    await userEvent.clear(quien);
    await elegirPaciente();
    expect(await screen.findByText('Copiamos del expediente: teléfono y dirección.')).toBeTruthy();
    expect(quien).toHaveProperty('value', '');
  });

  it('sin permiso para ver fichas no ofrece elegir paciente', () => {
    render(<PhoneRequestForm api={api()} profile={perfil(['ambulancia.solicitar'])} onClose={() => {}} onSaved={() => {}} />);
    const dialogo = screen.getByRole('dialog', { name: 'Registrar llamada' });
    expect(within(dialogo).queryByRole('combobox', { name: /Paciente/ })).toBeNull();
  });
});
