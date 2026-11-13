import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Shift, type Space, type Staff } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { StaffFicha } from '../features/personnel-ficha';

// jsdom no implementa <dialog>: lo abrimos con el atributo para que sus campos sean accesibles.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const jefatura = perfil(['turnos.ver', 'turnos.planificar', 'turnos.publicar', 'personal.ver']);
const soloLectura = perfil(['turnos.ver']);

const area: Space = { id: 'a-1', parentId: null, type: 'area', code: 'EMG', name: 'Emergencia', active: true, version: 1, path: 'Emergencia', totalBeds: 0, freeBeds: 0 };
const ana: Staff = { id: 's-1', givenNames: 'Ana', surnames: 'Ficticia Prueba', type: 'medico', areaId: 'a-1', area: 'Emergencia', active: true, version: 3 };
const turno = (id: string, state: string, version = 2): Shift => ({
  id, staffId: 's-1', person: 'Ana Ficticia Prueba', areaId: 'a-1', area: 'Emergencia', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T22:00:00.000Z', type: 'diurno', state, version,
});

function montar(perfilActual: AccessProfile, turnos: Shift[], escritura: (path: string, body: unknown, method?: string) => Promise<unknown> = async () => ({})) {
  const api = {
    request: vi.fn(async (path: string) => (path === '/espacios' ? [area] : path === '/personal' ? [ana] : turnos)),
    write: vi.fn(escritura),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={perfilActual} version={0} />);
  return api;
}

describe('turnos · permisos de escritura', () => {
  it('con solo turnos.ver lista los turnos sin planificar, publicar, editar ni cancelar', async () => {
    montar(soloLectura, [turno('t-1', 'borrador')]);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Planificar turno/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Publicar planificación/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancelar turno/ })).toBeNull();
  });

  it('turnos.planificar no necesita el permiso legado de publicación', async () => {
    montar(perfil(['turnos.ver', 'turnos.planificar']), [turno('t-1', 'borrador')]);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Publicar planificación/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Asignar turno/ })).toBeTruthy();
  });
});

describe('turnos · jornada automática', () => {
  it('JOP ve la jornada abierta y asigna horarios sin un paso de publicación manual', async () => {
    const api = montar(jefatura, [turno('t-1', 'publicado')]);
    await screen.findByRole('table');
    expect(screen.getByText('Jornada laboral abierta')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Asignar turno/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Publicar planificación/ })).toBeNull();
    expect(api.write).not.toHaveBeenCalled();
  });
  it('el formulario filtra el personal por rol y área antes de asignar', async () => {
    montar(jefatura, []);
    await userEvent.click(await screen.findByRole('button', { name: /Asignar turno/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    expect(within(dialogo).getByLabelText('Filtrar personal por área')).toBeTruthy();
    expect(within(dialogo).getByLabelText('Filtrar personal por rol')).toBeTruthy();
    expect(within(dialogo).getByLabelText('Persona · disponibilidad')).toBeTruthy();
  });
});

describe('turnos · cancelar (PATCH /turnos/{id})', () => {
  it('pide un motivo de al menos 10 caracteres y envía state=cancelado con la versión', async () => {
    const api = montar(jefatura, [turno('t-1', 'publicado', 5)]);
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar turno de Ana Ficticia Prueba/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar turno' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), 'corto');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar turno' }));
    expect(within(dialogo).getByText(/al menos 10 caracteres/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), ' — la persona está de licencia');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar turno' }));
    expect(api.write).toHaveBeenCalledTimes(1);
    const [ruta, cuerpo, metodo] = api.write.mock.calls[0];
    expect(ruta).toBe('/turnos/t-1');
    expect(metodo).toBe('PATCH');
    expect(cuerpo).toMatchObject({ state: 'cancelado', version: 5, staffId: 's-1', areaId: 'a-1', type: 'diurno' });
    expect((cuerpo as { reason: string }).reason).toMatch(/licencia/);
  });

  it('un conflicto de versión pide recargar en vez de un error genérico', async () => {
    montar(jefatura, [turno('t-1', 'borrador')], async () => { throw new ApiError('El turno cambió.', 409, 'version_conflicto', 6); });
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar turno de/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar turno' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), 'Motivo de prueba suficiente');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar turno' }));
    expect(await within(dialogo).findByRole('button', { name: 'Cerrar y recargar' })).toBeTruthy();
  });

  it('no ofrece cancelar turnos ya cancelados o completados', async () => {
    montar(jefatura, [turno('t-1', 'cancelado'), turno('t-2', 'completado')]);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Cancelar turno de/ })).toBeNull();
  });
});

describe('ficha de personal · función legible', () => {
  it('muestra la función en español y no el código crudo', async () => {
    const api = { request: vi.fn(async () => []), write: vi.fn() };
    render(<StaffFicha api={api as unknown as Api} profile={perfil(['personal.ver'])} person={ana} version={0} onClose={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    const funcion = (await screen.findByText('Función')).nextElementSibling!;
    expect(funcion.textContent).toBe('Médico');
    expect(screen.queryByText('medico')).toBeNull();
  });

  it('una función desconocida cae al código sin romper', async () => {
    const api = { request: vi.fn(async () => []), write: vi.fn() };
    render(<StaffFicha api={api as unknown as Api} profile={perfil(['personal.ver'])} person={{ ...ana, type: 'nueva_funcion' }} version={0} onClose={() => {}} onEdit={() => {}} onChanged={() => {}} />);
    expect((await screen.findByText('Función')).nextElementSibling!.textContent).toBe('nueva_funcion');
  });
});
