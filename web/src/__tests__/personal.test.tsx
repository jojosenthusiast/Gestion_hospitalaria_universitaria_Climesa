import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Space, type Staff } from '../lib/api';
import { PersonnelPage } from '../features/personnel';

// jsdom no implementa <dialog>: lo abrimos con el atributo para que sus campos sean accesibles.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'adm@example.test', name: 'Administración de prueba', roles: ['ADM'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const administrador = perfil(['personal.ver', 'personal.gestionar']);
const jefatura = perfil(['personal.ver']);

const area: Space = { id: 'a-1', parentId: null, type: 'area', code: 'EMG', name: 'Emergencia', active: true, version: 1, path: 'Emergencia', totalBeds: 0, freeBeds: 0 };
const ana: Staff = { id: 's-1', givenNames: 'Ana', surnames: 'Ficticia Prueba', type: 'medico', specialty: 'Medicina interna', areaId: 'a-1', area: 'Emergencia', phone: '7000-0000', dui: '00000001-8', active: true, version: 3 };
const luis: Staff = { id: 's-2', givenNames: 'Luis', surnames: 'Ejemplo Muestra', type: 'motorista', active: false, version: 1 };

function montar(opciones: { perfil?: AccessProfile; lista?: () => Promise<Staff[]>; escritura?: (path: string, body: unknown, method?: string) => Promise<unknown> } = {}) {
  const api = {
    request: vi.fn(async (path: string) => (path === '/espacios' ? [area] : (opciones.lista ? opciones.lista() : [ana, luis]))),
    write: vi.fn(async (path: string, body: unknown, method?: string) => (opciones.escritura ? opciones.escritura(path, body, method) : { id: 's-9', version: 4 })),
  };
  render(<PersonnelPage api={api as unknown as Api} profile={opciones.perfil ?? administrador} version={0} />);
  return api;
}
const escrituras = (api: ReturnType<typeof montar>) => api.write.mock.calls;
async function abrirEdicion() {
  await userEvent.click(await screen.findByRole('button', { name: /Editar/ }));
  return screen.findByRole('dialog', { name: 'Editar persona' });
}
async function escribir(dialogo: HTMLElement, etiqueta: string | RegExp, texto: string) {
  const campo = within(dialogo).getByLabelText(etiqueta);
  await userEvent.clear(campo);
  if (texto) await userEvent.type(campo, texto);
}

describe('W07 · personal de salud', () => {
  it('lista solo al personal activo y permite ver a las personas inactivas', async () => {
    montar();
    expect(await screen.findByText('Ana Ficticia Prueba')).toBeTruthy();
    expect(screen.queryByText('Luis Ejemplo Muestra')).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'inactivos');
    expect(screen.getByText('Luis Ejemplo Muestra')).toBeTruthy();
  });

  it('muestra los estados cargando, vacío y error', async () => {
    let falla = true;
    const api = montar({ lista: async () => { if (falla) { falla = false; throw new ApiError('No se pudo cargar el personal.', 500); } return []; } });
    expect(screen.getByText(/Cargando/)).toBeTruthy();
    expect(await screen.findByText('No se pudo cargar el personal.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
    expect(await screen.findByText('No hay personas en esta vista')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/personal', expect.anything());
  });

  it('sin el permiso personal.gestionar no ofrece registrar ni editar', async () => {
    montar({ perfil: jefatura });
    await screen.findByText('Ana Ficticia Prueba');
    expect(screen.queryByRole('button', { name: /Registrar personal/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });
});

describe('W07 · crear personal', () => {
  it('registra a una persona nueva con POST /personal, sin versión ni motivo, y recarga el directorio', async () => {
    const api = montar();
    await screen.findByText('Ana Ficticia Prueba');
    await userEvent.click(screen.getByRole('button', { name: /Registrar personal/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar personal' });
    await escribir(dialogo, 'Nombres', 'María José');
    await escribir(dialogo, 'Apellidos', 'Prueba Ejemplo');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Función'), 'enfermero');
    await userEvent.selectOptions(within(dialogo).getByLabelText('Área de trabajo'), 'a-1');
    await escribir(dialogo, /Teléfono/, '7000-1111');
    await escribir(dialogo, /DUI/, '00000001-8');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar persona/ }));
    await waitFor(() => expect(escrituras(api)).toHaveLength(1));
    const [ruta, cuerpo, metodo] = escrituras(api)[0] as [string, Record<string, unknown>, string | undefined];
    expect(ruta).toBe('/personal');
    expect(metodo ?? 'POST').toBe('POST');
    expect(cuerpo).toMatchObject({ givenNames: 'María José', surnames: 'Prueba Ejemplo', type: 'enfermero', areaId: 'a-1', phone: '7000-1111', dui: '00000001-8' });
    expect(cuerpo).not.toHaveProperty('version');
    expect(cuerpo).not.toHaveProperty('reason');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar personal' })).toBeNull());
    expect(api.request.mock.calls.filter(([p]) => p === '/personal').length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['nombres con números', 'Nombres', 'Ana2', 'Los nombres y apellidos no pueden contener números.'],
    ['teléfono mal formado', /Teléfono/, '1234', 'Revisa el teléfono de ocho dígitos.'],
    ['DUI con dígito verificador incorrecto', /DUI/, '00000001-5', 'Revisa el dígito verificador del DUI.'],
  ])('antes de enviar rechaza %s con un mensaje en español', async (_caso, etiqueta, valor, mensaje) => {
    const api = montar();
    await screen.findByText('Ana Ficticia Prueba');
    await userEvent.click(screen.getByRole('button', { name: /Registrar personal/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar personal' });
    await escribir(dialogo, 'Nombres', 'María');
    await escribir(dialogo, 'Apellidos', 'Prueba');
    await escribir(dialogo, etiqueta, valor);
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar persona/ }));
    expect(await within(dialogo).findByText(mensaje)).toBeTruthy();
    expect(escrituras(api)).toHaveLength(0);
  });

  it('muestra en español el rechazo de validación que devuelve la API y conserva lo escrito', async () => {
    const api = montar({ escritura: async () => { throw new ApiError('Selecciona un área válida.', 400, 'validacion'); } });
    await screen.findByText('Ana Ficticia Prueba');
    await userEvent.click(screen.getByRole('button', { name: /Registrar personal/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar personal' });
    await escribir(dialogo, 'Nombres', 'María');
    await escribir(dialogo, 'Apellidos', 'Prueba');
    await userEvent.click(within(dialogo).getByRole('button', { name: /Registrar persona/ }));
    expect(await within(dialogo).findByText('Selecciona un área válida.')).toBeTruthy();
    expect((within(dialogo).getByLabelText('Nombres') as HTMLInputElement).value).toBe('María');
    expect(escrituras(api)).toHaveLength(1);
  });
});

describe('W07 · editar e inactivar', () => {
  it('abre la ficha con los datos actuales y envía PATCH con la versión y el motivo', async () => {
    const api = montar();
    const dialogo = await abrirEdicion();
    expect((within(dialogo).getByLabelText('Nombres') as HTMLInputElement).value).toBe('Ana');
    expect((within(dialogo).getByLabelText(/Especialidad/) as HTMLInputElement).value).toBe('Medicina interna');
    await escribir(dialogo, /Especialidad/, 'Cardiología');
    await escribir(dialogo, 'Motivo de la modificación', 'Cambio de especialidad');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(escrituras(api)).toHaveLength(1));
    const [ruta, cuerpo, metodo] = escrituras(api)[0] as [string, Record<string, unknown>, string];
    expect(ruta).toBe('/personal/s-1');
    expect(metodo).toBe('PATCH');
    expect(cuerpo).toMatchObject({ specialty: 'Cardiología', version: 3, reason: 'Cambio de especialidad', active: true });
  });

  it('exige un motivo de al menos diez caracteres antes de guardar', async () => {
    const api = montar();
    const dialogo = await abrirEdicion();
    await escribir(dialogo, 'Motivo de la modificación', 'corto');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialogo).findByText('Indica el motivo de la modificación, de al menos 10 caracteres.')).toBeTruthy();
    expect(escrituras(api)).toHaveLength(0);
  });

  it('inactiva a la persona desmarcando "activa" con motivo y envía active en falso', async () => {
    const api = montar();
    const dialogo = await abrirEdicion();
    await userEvent.click(within(dialogo).getByLabelText('Persona activa en el directorio'));
    await escribir(dialogo, 'Motivo de la modificación', 'Renuncia de la persona');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(escrituras(api)).toHaveLength(1));
    expect(escrituras(api)[0][1]).toMatchObject({ active: false, version: 3, reason: 'Renuncia de la persona' });
  });

  it('si la API rechaza inactivar por turnos futuros, muestra su mensaje y deja el diálogo abierto', async () => {
    montar({ escritura: async () => { throw new ApiError('Reasigna o cancela sus turnos futuros antes de inactivarla.', 409, 'conflicto'); } });
    const dialogo = await abrirEdicion();
    await userEvent.click(within(dialogo).getByLabelText('Persona activa en el directorio'));
    await escribir(dialogo, 'Motivo de la modificación', 'Renuncia de la persona');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialogo).findByText(/Reasigna o cancela sus turnos futuros/)).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Editar persona' })).toBeTruthy();
  });

  it('ante un conflicto de versión (409) avisa que la ficha cambió y recarga el directorio al cerrar', async () => {
    const api = montar({ escritura: async () => { throw new ApiError('La ficha cambió; vuelve a abrirla.', 409, 'version_conflicto', 4); } });
    const dialogo = await abrirEdicion();
    await escribir(dialogo, 'Motivo de la modificación', 'Cambio de especialidad');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialogo).findByText('La ficha cambió. Vuelve a abrirla para ver los datos actuales; tus cambios no se guardaron.')).toBeTruthy();
    const antes = api.request.mock.calls.filter(([p]) => p === '/personal').length;
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar y recargar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar persona' })).toBeNull());
    await waitFor(() => expect(api.request.mock.calls.filter(([p]) => p === '/personal').length).toBeGreaterThan(antes));
  });
});
