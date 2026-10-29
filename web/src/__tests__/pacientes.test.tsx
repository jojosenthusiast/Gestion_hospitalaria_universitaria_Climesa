import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Patient } from '../lib/api';
import { PatientsPage } from '../features/patients';

// jsdom no implementa <dialog>: lo abrimos con el atributo para que sus campos sean accesibles.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const perfil: AccessProfile = {
  id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: [{ code: 'pacientes.registrar', context: 'global' }, { code: 'pacientes.editar_demograficos', context: 'global' }],
  channels: [], patientId: null, staffId: null,
};
const paciente: Patient = {
  id: 'p1', record: 'EXP-000001', fullName: 'Ana Ficticia', givenNames: 'Ana', surnames: 'Ficticia', state: 'activo', active: true, sex: 'femenino',
  birth: '1990-05-01', dui: '00000000-0', version: 3, matchReason: 'Documento',
  history: [{ version: 2, at: '2026-10-01T15:00:00Z', reason: 'Corrección de datos', changes: {
    nombres: { before: 'Anna', after: 'Ana' }, primer_apellido: { before: 'Ficticio', after: 'Ficticia' }, segundo_apellido: { before: null, after: 'Prueba' },
    sexo: { before: 'masculino', after: 'femenino' }, nacimiento: { before: null, after: '1990-05-01' }, precision_nacimiento: { before: 'estimada', after: 'exacta' },
    telefono: { before: null, after: '7000-0000' }, correo: { before: null, after: 'a@example.test' }, direccion: { before: null, after: 'Calle 1' },
    dui: { before: null, after: '00000000-0' }, estado: { before: 'activo', after: 'inactivo' },
  } }],
};
const recibo = (vence: number, candidates: Patient[] = [paciente]) => ({ token: 'tok-1', expiresAt: new Date(vence).toISOString(), candidates });

function montar(opciones: { lista?: Patient[]; busqueda?: unknown; escritura?: (path: string, body: unknown, method?: string) => Promise<unknown> } = {}) {
  const api = {
    request: vi.fn(async (path: string) => (path === '/pacientes/p1' ? paciente : (opciones.lista ?? [paciente]))),
    write: vi.fn(async (path: string, body: unknown, method?: string) => {
      if (path === '/pacientes/busquedas') return opciones.busqueda ?? recibo(Date.now() + 600_000);
      if (opciones.escritura) return opciones.escritura(path, body, method);
      return { id: 'p2' };
    }),
  };
  render(<PatientsPage api={api as unknown as Api} profile={perfil} version={0} />);
  return api;
}
async function buscar(texto = 'Ana') {
  await userEvent.type(screen.getByLabelText(/Nombre, DUI o expediente/), texto);
  await userEvent.click(screen.getByRole('button', { name: /Buscar/ }));
}
const registrar = () => screen.getByRole('button', { name: /Registrar paciente/ });
async function llenarYEnviar() {
  await userEvent.click(registrar());
  const dialogo = await screen.findByRole('dialog', { name: 'Registrar paciente' });
  await userEvent.type(within(dialogo).getByLabelText('Nombres'), 'Luis');
  await userEvent.type(within(dialogo).getByLabelText('Apellidos'), 'Prueba');
  await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar paciente/ }));
  return dialogo;
}
async function abrirEdicion() {
  await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
  await userEvent.click(await screen.findByRole('button', { name: /Editar datos/ }));
  return screen.findByRole('dialog', { name: 'Corregir datos personales' });
}

describe('búsqueda antes de registrar', () => {
  it('muestra los candidatos con el motivo de coincidencia', async () => {
    montar({ busqueda: recibo(Date.now() + 600_000, [{ ...paciente, matchReason: 'Coincidencia de documento' }]) });
    await buscar();
    expect((await screen.findAllByText('Coincidencia de documento')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Posibles coincidencias/)).toBeTruthy();
  });

  it('deshabilita "Registrar paciente" hasta tener una búsqueda vigente', async () => {
    montar();
    expect((registrar() as HTMLButtonElement).disabled).toBe(true);
    await buscar();
    await screen.findByText(/Puedes registrar/);
    expect((registrar() as HTMLButtonElement).disabled).toBe(false);
  });

  it('envía searchToken y searchQuery al registrar', async () => {
    const api = montar();
    await buscar('  Luis Prueba ');
    await screen.findByText(/Puedes registrar/);
    await llenarYEnviar();
    const llamada = api.write.mock.calls.find(([path]) => path === '/pacientes');
    expect(llamada?.[1]).toMatchObject({ givenNames: 'Luis', surnames: 'Prueba', searchToken: 'tok-1', searchQuery: 'Luis Prueba' });
  });

  it('un DUI duplicado muestra el mensaje de la API con el expediente', async () => {
    montar({ escritura: async () => { throw new ApiError('Ese DUI pertenece al expediente EXP-000009, incluso si está inactivo.', 409); } });
    await buscar();
    await screen.findByText(/Puedes registrar/);
    const dialogo = await llenarYEnviar();
    expect(await within(dialogo).findByText(/pertenece al expediente EXP-000009/)).toBeTruthy();
    expect(within(dialogo).queryByText(/Conservamos lo que escribiste/)).toBeNull();
  });

  it('con el recibo vencido con el diálogo abierto no llama a la API y bloquea el envío', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const api = montar({ busqueda: recibo(Date.now() + 60_000) });
    const vaciar = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await vaciar();
    fireEvent.change(screen.getByLabelText(/Nombre, DUI o expediente/), { target: { value: 'Luis' } });
    fireEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    await vaciar();
    fireEvent.click(registrar());
    await vaciar();
    const dialogo = screen.getByRole('dialog', { name: 'Registrar paciente' });
    fireEvent.change(within(dialogo).getByLabelText('Nombres'), { target: { value: 'Luis' } });
    fireEvent.change(within(dialogo).getByLabelText('Apellidos'), { target: { value: 'Prueba' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(within(dialogo).getByText('La búsqueda venció; vuelve a buscar.')).toBeTruthy();
    const enviar = within(dialogo).getByRole('button', { name: /Registrar paciente/ }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    fireEvent.submit(enviar.closest('form')!);
    await vaciar();
    expect(api.write.mock.calls.some(([path]) => path === '/pacientes')).toBe(false);
  });
});

describe('edición y estado', () => {
  it('la corrección exige un motivo de al menos 10 caracteres', async () => {
    const api = montar();
    const dialogo = await abrirEdicion();
    const motivo = within(dialogo).getByLabelText(/Motivo de la corrección/);
    await userEvent.type(motivo, 'corto');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Guardar corrección/ }));
    expect(api.write.mock.calls.some(([path]) => path === '/pacientes/p1')).toBe(false);
    await userEvent.type(motivo, ' y ahora suficiente');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Guardar corrección/ }));
    const llamada = api.write.mock.calls.find(([path]) => path === '/pacientes/p1');
    expect(llamada?.[1]).toMatchObject({ version: 3, reason: 'corto y ahora suficiente' });
    expect(llamada?.[2]).toBe('PATCH');
  });

  it('un conflicto de versión pide recargar la ficha en vez de un error genérico', async () => {
    montar({ escritura: async () => { throw new ApiError('La ficha cambió. Vuelve a abrirla antes de guardar.', 409); } });
    const dialogo = await abrirEdicion();
    await userEvent.type(within(dialogo).getByLabelText(/Motivo de la corrección/), 'motivo suficiente');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Guardar corrección/ }));
    expect(await within(dialogo).findByText(/La ficha cambió\. Vuelve a abrirla/)).toBeTruthy();
    expect(within(dialogo).queryByText(/Conservamos lo que escribiste/)).toBeNull();
    await userEvent.click(within(dialogo).getByRole('button', { name: /Cerrar y recargar/ }));
    expect(screen.queryByRole('dialog', { name: 'Corregir datos personales' })).toBeNull();
  });

  it('inactivar envía active=false, la versión y el motivo; reactivar envía active=true', async () => {
    const api = montar();
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Inactivar paciente' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Inactivar paciente' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'Solicitud del titular');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Confirmar cambio/ }));
    expect(api.write).toHaveBeenCalledWith('/pacientes/p1/estado', { active: false, version: 3, reason: 'Solicitud del titular' }, 'POST');
    cleanup();

    const inactivo = { ...paciente, active: false, state: 'inactivo' };
    const api2 = { request: vi.fn(async (path: string) => (path === '/pacientes/p1' ? inactivo : [inactivo])), write: vi.fn(async () => ({})) };
    render(<PatientsPage api={api2 as unknown as Api} profile={perfil} version={0} />);
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'todos');
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Reactivar paciente' }));
    const reactivar = await screen.findByRole('dialog', { name: 'Reactivar paciente' });
    await userEvent.type(within(reactivar).getByLabelText('Motivo'), 'Vuelve a consulta');
    await userEvent.click(within(reactivar).getByRole('button', { name: /Confirmar cambio/ }));
    expect(api2.write).toHaveBeenCalledWith('/pacientes/p1/estado', { active: true, version: 3, reason: 'Vuelve a consulta' }, 'POST');
  });

  it('el historial usa etiquetas en español para cada campo', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    const historial = (await screen.findByText('Historial de cambios')).closest('section')!;
    for (const etiqueta of ['Nombres', 'Apellidos', 'Segundo apellido', 'Sexo', 'Nacimiento', 'Precisión del nacimiento', 'Teléfono', 'Correo', 'Dirección', 'DUI', 'Estado']) {
      expect(within(historial).getAllByText(etiqueta).length).toBeGreaterThan(0);
    }
    expect(within(historial).queryByText('precision_nacimiento')).toBeNull();
  });
});

