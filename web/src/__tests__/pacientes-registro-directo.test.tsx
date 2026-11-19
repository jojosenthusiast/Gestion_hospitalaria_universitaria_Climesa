import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Patient } from '../lib/api';
import { PatientsPage, autoQuery } from '../features/patients';

// Fase 2, S13 (T10w, W1): registering a patient is one form, search first, and the record view has one primary action.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; tokens = 0; });

const perfil: AccessProfile = {
  id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: ['pacientes.buscar', 'pacientes.ver_ficha', 'pacientes.registrar', 'pacientes.editar_demograficos'].map(code => ({ code, context: 'global' })),
  channels: [], patientId: null, staffId: null,
};
const paciente: Patient = { id: 'p1', record: 'EXP-000001', fullName: 'Ana Ficticia', givenNames: 'Ana', surnames: 'Ficticia', state: 'activo', active: true, sex: 'femenino', birth: '1990-05-01', dui: '00000001-8', version: 3, matchReason: 'Nombre parecido' };
let tokens = 0;
const recibo = (candidates: Patient[] = []) => ({ token: `tok-${++tokens}`, expiresAt: new Date(Date.now() + 600_000).toISOString(), candidates });

function montar(candidatos: Patient[] = []) {
  const api = {
    request: vi.fn(async (path: string) => (path === '/pacientes/p1' ? paciente : [paciente])),
    write: vi.fn(async (path: string, _body?: unknown, _method?: string) => (path === '/pacientes/busquedas' ? recibo(candidatos) : { id: 'p2' })),
  };
  render(<PatientsPage api={api as unknown as Api} profile={perfil} version={0} />);
  return api;
}
async function abrirRegistro() {
  await userEvent.click(screen.getByRole('button', { name: /Registrar paciente/ }));
  return screen.findByRole('dialog', { name: 'Registrar paciente' });
}
const llamadas = (api: ReturnType<typeof montar>, path: string) => api.write.mock.calls.filter(([p]) => p === path);

describe('registro de paciente en un solo formulario (S13)', () => {
  it('muestra la búsqueda y los datos juntos, con una sola acción principal', async () => {
    montar();
    const dialogo = await abrirRegistro();
    expect(within(dialogo).getByLabelText(/Nombre, DUI o expediente/)).toBeTruthy();
    expect(within(dialogo).getByLabelText('Nombres')).toBeTruthy();
    expect(dialogo.querySelectorAll('.primary-button')).toHaveLength(1);
    expect(within(dialogo).getByRole('button', { name: /Registrar paciente/ }).className).toContain('primary-button');
  });

  it('sin buscar antes, «Registrar paciente» busca con el nombre escrito y registra si no hay coincidencias', async () => {
    const api = montar([]);
    const dialogo = await abrirRegistro();
    await userEvent.type(within(dialogo).getByLabelText('Nombres'), 'Luis');
    await userEvent.type(within(dialogo).getByLabelText('Apellidos'), 'Prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar paciente/ }));
    await vi.waitFor(() => expect(llamadas(api, '/pacientes')).toHaveLength(1));
    expect(llamadas(api, '/pacientes/busquedas')[0][1]).toEqual({ query: 'Luis Prueba' });
    expect(llamadas(api, '/pacientes')[0][1]).toMatchObject({ givenNames: 'Luis', surnames: 'Prueba', searchToken: 'tok-1', searchQuery: 'Luis Prueba' });
  });

  it('si la búsqueda automática encuentra coincidencias, se detiene y las muestra; el segundo clic registra', async () => {
    const api = montar([paciente]);
    const dialogo = await abrirRegistro();
    await userEvent.type(within(dialogo).getByLabelText('Nombres'), 'Ana');
    await userEvent.type(within(dialogo).getByLabelText('Apellidos'), 'Ficticia');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar paciente/ }));
    expect(await within(dialogo).findByText(/Revisa estos expedientes/)).toBeTruthy();
    expect(within(dialogo).getByText(/EXP-000001/)).toBeTruthy();
    expect(llamadas(api, '/pacientes')).toHaveLength(0);
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar paciente/ }));
    await vi.waitFor(() => expect(llamadas(api, '/pacientes')).toHaveLength(1));
    expect(llamadas(api, '/pacientes/busquedas')).toHaveLength(1);
  });

  it('el aviso de lo copiado nombra solo los campos llenados y no vuelve a llenar uno que la persona vació', async () => {
    montar();
    const dialogo = await abrirRegistro();
    const busqueda = within(dialogo).getByLabelText(/Nombre, DUI o expediente/);
    await userEvent.type(busqueda, 'Pedro Gomez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Buscar' }));
    expect(await within(dialogo).findByText('Copiamos de tu búsqueda: nombres y apellidos.')).toBeTruthy();
    expect(within(dialogo).getByLabelText('Nombres')).toHaveProperty('value', 'Pedro');
    await userEvent.clear(within(dialogo).getByLabelText('Apellidos'));
    await userEvent.clear(busqueda);
    await userEvent.type(busqueda, 'Pedro Gomez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => expect(within(dialogo).queryByText(/Copiamos de tu búsqueda/)).toBeNull());
    expect(within(dialogo).getByLabelText('Apellidos')).toHaveProperty('value', '');
  });

  it('lo que la persona escribe mientras la búsqueda viaja no se pisa al llegar la respuesta', async () => {
    let soltar: (v: unknown) => void = () => {};
    const api = {
      request: vi.fn(async () => [paciente]),
      write: vi.fn((path: string) => (path === '/pacientes/busquedas' ? new Promise(r => { soltar = r; }) : Promise.resolve({ id: 'p2' }))),
    };
    render(<PatientsPage api={api as unknown as Api} profile={perfil} version={0} />);
    const dialogo = await abrirRegistro();
    await userEvent.type(within(dialogo).getByLabelText(/Nombre, DUI o expediente/), 'Pedro Gomez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Buscar' }));
    await userEvent.type(within(dialogo).getByLabelText('Apellidos'), 'Martínez');
    soltar(recibo());
    await vi.waitFor(() => expect(within(dialogo).getByLabelText('Nombres')).toHaveProperty('value', 'Pedro'));
    expect(within(dialogo).getByLabelText('Apellidos')).toHaveProperty('value', 'Martínez');
  });
});

describe('ficha con una sola acción principal (S13)', () => {
  it('con la ficha abierta solo «Registrar paciente» es acción principal', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    await screen.findByRole('button', { name: /Editar datos/ });
    const principales = [...document.querySelectorAll('.primary-button, .crud-create')].map(b => b.textContent);
    expect(principales).toEqual(['Registrar paciente']);
  });
});

describe('correcciones del registro en un solo formulario (S13, revisión)', () => {
  it('B1: al registrar sin buscar, el DUI copiado de la búsqueda viaja en el registro', async () => {
    const api = montar([]);
    const dialogo = await abrirRegistro();
    await userEvent.type(within(dialogo).getByLabelText(/Nombre, DUI o expediente/), '00000002-6');
    await userEvent.type(within(dialogo).getByLabelText('Nombres'), 'Luis');
    await userEvent.type(within(dialogo).getByLabelText('Apellidos'), 'Prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar paciente/ }));
    await vi.waitFor(() => expect(llamadas(api, '/pacientes')).toHaveLength(1));
    expect(llamadas(api, '/pacientes')[0][1]).toMatchObject({ dui: '00000002-6', givenNames: 'Luis', surnames: 'Prueba', searchQuery: '00000002-6', searchToken: 'tok-1' });
  });

  it('B2: cambiar el texto después de buscar invalida la búsqueda: al registrar busca de nuevo y no manda el recibo viejo', async () => {
    const api = montar([]);
    const dialogo = await abrirRegistro();
    const busqueda = within(dialogo).getByLabelText(/Nombre, DUI o expediente/);
    await userEvent.type(busqueda, 'Pedro Gomez');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Buscar' }));
    await within(dialogo).findByText(/Copiamos de tu búsqueda/);
    await userEvent.type(busqueda, ' Lopez');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar paciente/ }));
    await vi.waitFor(() => expect(llamadas(api, '/pacientes')).toHaveLength(1));
    expect(llamadas(api, '/pacientes/busquedas').map(([, body]) => body)).toEqual([{ query: 'Pedro Gomez' }, { query: 'Pedro Gomez Lopez' }]);
    expect(llamadas(api, '/pacientes')[0][1]).toMatchObject({ searchToken: 'tok-2', searchQuery: 'Pedro Gomez Lopez' });
  });

  it('A4: la búsqueda automática no pasa de 100 caracteres', () => {
    const form = { givenNames: `${'A'.repeat(60)} ${'B'.repeat(19)}`, surnames: `${'C'.repeat(60)} ${'D'.repeat(39)}`, sex: 'no_registrado' as const, dui: '' };
    const q = autoQuery(form, '');
    expect(q.length).toBeLessThanOrEqual(100);
    expect(q).toBe(`${'A'.repeat(60)} ${'C'.repeat(39)}`);
    expect(autoQuery({ ...form, dui: '00000002-6' }, '')).toBe('00000002-6');
  });
});
