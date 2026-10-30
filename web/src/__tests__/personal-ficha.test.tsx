import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Shift, type Space, type Staff } from '../lib/api';
import { PersonnelPage } from '../features/personnel';
import { registrationState } from '../features/personnel-ficha';

// jsdom no implementa <dialog>: lo abrimos con el atributo para que sus campos sean accesibles.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  // Hoy es 29-oct-2026 (mediodía en El Salvador); solo se falsea Date para no frenar a userEvent.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-29T18:00:00Z') });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'adm@example.test', name: 'Administración de prueba', roles: ['ADM'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const administrador = perfil(['personal.ver', 'personal.gestionar', 'turnos.ver']);
const jefatura = perfil(['personal.ver', 'turnos.ver']);

const area: Space = { id: 'a-1', parentId: null, type: 'area', code: 'EMG', name: 'Emergencia', active: true, version: 1, path: 'Emergencia', totalBeds: 0, freeBeds: 0 };
const ana: Staff = {
  id: 's-1', givenNames: 'Ana', surnames: 'Ficticia Prueba', type: 'medico', specialty: 'Medicina interna', areaId: 'a-1', area: 'Emergencia',
  phone: '7000-0000', dui: '00000001-8', active: true, version: 3,
  registrations: [
    { id: 'i-1', board: 'JVPM', number: 'JVPM-0001', validFrom: '2026-01-01', validTo: '2026-12-31' },
    { id: 'i-2', board: 'JVPM', number: 'JVPM-0000', validFrom: '2025-01-01', validTo: '2025-12-31' },
    { id: 'i-3', board: 'JVPE', number: 'JVPE-0002', validFrom: '2026-01-01', validTo: '2026-11-15' },
  ],
};
const luis: Staff = { id: 's-2', givenNames: 'Luis', surnames: 'Ejemplo Muestra', type: 'enfermero', active: true, version: 1, registrations: [] };
const turno = (id: string, staffId: string, start: string, end: string, state = 'publicado'): Shift =>
  ({ id, staffId, person: 'Persona', areaId: 'a-1', area: 'Emergencia', start, end, type: 'diurno', state, version: 1 });
const turnos: Shift[] = [
  turno('t-pasado', 's-1', '2026-10-20T13:00:00Z', '2026-10-20T21:00:00Z', 'completado'),
  turno('t-2', 's-1', '2026-11-05T13:00:00Z', '2026-11-05T21:00:00Z'),
  turno('t-1', 's-1', '2026-10-30T13:00:00Z', '2026-10-30T21:00:00Z'),
  turno('t-borrador', 's-1', '2026-11-02T13:00:00Z', '2026-11-02T21:00:00Z', 'borrador'),
  turno('t-otro', 's-2', '2026-11-03T13:00:00Z', '2026-11-03T21:00:00Z'),
];

type Opciones = { perfil?: AccessProfile; lista?: () => Promise<Staff[]>; turnos?: () => Promise<Shift[]>; escritura?: (path: string, body: unknown, method?: string) => Promise<unknown> };
function montar(opciones: Opciones = {}) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/espacios') return [area];
      if (path === '/turnos') return opciones.turnos ? opciones.turnos() : turnos;
      return opciones.lista ? opciones.lista() : [ana, luis];
    }),
    write: vi.fn(async (path: string, body: unknown, method?: string) => (opciones.escritura ? opciones.escritura(path, body, method) : { id: 'i-9', version: 4 })),
  };
  render(<PersonnelPage api={api as unknown as Api} profile={opciones.perfil ?? administrador} version={0} />);
  return api;
}
async function abrirFicha(nombre = /Ver ficha de Ana/) {
  await userEvent.click(await screen.findByRole('button', { name: nombre }));
  return screen.findByRole('dialog', { name: /Ficha de/ });
}
async function abrirFormulario() {
  const ficha = await abrirFicha();
  await userEvent.click(within(ficha).getByRole('button', { name: /Registrar inscripción/ }));
  return { ficha, formulario: within(ficha).getByRole('form', { name: 'Registrar inscripción' }) };
}
async function llenar(formulario: HTMLElement, valores: { numero?: string; desde?: string; hasta?: string; motivo?: string }) {
  if (valores.numero !== undefined) await userEvent.type(within(formulario).getByLabelText('Número de inscripción'), valores.numero);
  if (valores.desde !== undefined) await userEvent.type(within(formulario).getByLabelText('Vigente desde'), valores.desde);
  if (valores.hasta !== undefined) await userEvent.type(within(formulario).getByLabelText('Vigente hasta'), valores.hasta);
  if (valores.motivo !== undefined) await userEvent.type(within(formulario).getByLabelText('Motivo del registro'), valores.motivo);
}

describe('W08 · regla de estado de una inscripción', () => {
  const hoy = '2026-10-29';
  it('distingue vigente, por vencer, vencida y aún no vigente con ambos extremos incluidos', () => {
    expect(registrationState({ validFrom: '2026-01-01', validTo: '2026-12-31' }, hoy)).toBe('vigente');
    expect(registrationState({ validFrom: '2026-01-01', validTo: '2026-11-28' }, hoy)).toBe('por_vencer');
    expect(registrationState({ validFrom: '2026-01-01', validTo: '2026-11-29' }, hoy)).toBe('vigente');
    expect(registrationState({ validFrom: '2026-01-01', validTo: hoy }, hoy)).toBe('por_vencer');
    expect(registrationState({ validFrom: '2025-01-01', validTo: '2026-10-28' }, hoy)).toBe('vencida');
    expect(registrationState({ validFrom: '2026-10-30', validTo: '2027-10-29' }, hoy)).toBe('proxima');
  });
});

describe('W08 · ficha de personal', () => {
  it('se abre desde el directorio y muestra los datos de la persona', async () => {
    montar();
    const ficha = await abrirFicha();
    expect(within(ficha).getByText('Medicina interna')).toBeTruthy();
    expect(within(ficha).getAllByText('Emergencia').length).toBeGreaterThan(0);
    expect(within(ficha).getByText('00000001-8')).toBeTruthy();
  });

  it('lista las inscripciones con su vigencia y marca la vencida, la por vencer y la vigente', async () => {
    montar();
    const ficha = await abrirFicha();
    const tabla = within(ficha).getByRole('table', { name: 'Inscripciones profesionales' });
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(3);
    const por = (numero: string) => filas.find(f => within(f).queryByText(numero))!;
    expect(within(por('JVPM-0001')).getByText('Vigente')).toBeTruthy();
    expect(within(por('JVPM-0000')).getByText('Vencida')).toBeTruthy();
    expect(within(por('JVPE-0002')).getByText('Por vencer')).toBeTruthy();
    expect(within(por('JVPM-0001')).getByText(/1\/1\/2026 al 31\/12\/2026/)).toBeTruthy();
  });

  it('muestra solo los turnos próximos publicados de esa persona, en orden', async () => {
    montar();
    const ficha = await abrirFicha();
    const tabla = await within(ficha).findByRole('table', { name: 'Turnos próximos publicados' });
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    expect(filas[0].querySelector('[data-label="Inicio"]')!.textContent).toMatch(/30 oct 2026/);
    expect(filas[1].querySelector('[data-label="Inicio"]')!.textContent).toMatch(/5 nov 2026/);
  });

  it('avisa cuando no hay inscripciones ni turnos próximos', async () => {
    montar();
    const ficha = await abrirFicha(/Ver ficha de Luis/);
    expect(within(ficha).getByText('Sin inscripciones registradas')).toBeTruthy();
    expect((await within(ficha).findByRole('table', { name: 'Turnos próximos publicados' }))).toBeTruthy();
  });

  it('muestra el estado vacío de turnos y el error al cargarlos', async () => {
    montar({ turnos: async () => [] });
    expect(await within(await abrirFicha()).findByText('Sin turnos próximos')).toBeTruthy();
    cleanup();
    montar({ turnos: async () => { throw new ApiError('Sin servicio de turnos.', 500); } });
    expect(await within(await abrirFicha()).findByText('Sin servicio de turnos.')).toBeTruthy();
  });

  it('muestra "Cargando" mientras llegan los turnos', async () => {
    montar({ turnos: () => new Promise<Shift[]>(() => {}) });
    expect(within(await abrirFicha()).getByText('Cargando información…')).toBeTruthy();
  });

  it('sin permiso de gestión no ofrece registrar inscripción ni editar, y sin turnos.ver no pide los turnos', async () => {
    const api = montar({ perfil: perfil(['personal.ver']) });
    const ficha = await abrirFicha();
    expect(within(ficha).queryByRole('button', { name: /Registrar inscripción/ })).toBeNull();
    expect(within(ficha).queryByRole('button', { name: /Editar/ })).toBeNull();
    expect(within(ficha).queryByText('Turnos próximos')).toBeNull();
    expect(api.request.mock.calls.some(([path]) => path === '/turnos')).toBe(false);
  });

  it('JOP ve la ficha pero no registra inscripciones', async () => {
    montar({ perfil: jefatura });
    const ficha = await abrirFicha();
    expect(within(ficha).queryByRole('button', { name: /Registrar inscripción/ })).toBeNull();
    expect(await within(ficha).findByRole('table', { name: 'Turnos próximos publicados' })).toBeTruthy();
  });
});

describe('W08 · registrar inscripción', () => {
  it('envía el cuerpo correcto con la versión de la ficha y recarga la lista', async () => {
    const api = montar();
    const { formulario } = await abrirFormulario();
    await llenar(formulario, { numero: ' JVPM-0099 ', desde: '2026-11-01', hasta: '2027-10-31', motivo: 'Renovación presentada por la persona' });
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar inscripción' }));
    expect(api.write).toHaveBeenCalledWith('/personal/s-1/inscripciones', {
      board: 'JVPM', number: 'JVPM-0099', validFrom: '2026-11-01', validTo: '2027-10-31', version: 3, reason: 'Renovación presentada por la persona',
    }, 'POST');
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([path]) => path === '/personal').length).toBe(2));
  });

  it('valida en español antes de enviar: número, fechas invertidas y motivo corto', async () => {
    const api = montar();
    const { formulario } = await abrirFormulario();
    const guardar = () => userEvent.click(within(formulario).getByRole('button', { name: 'Guardar inscripción' }));
    await guardar();
    expect(await within(formulario).findByText(/Escribe el número de inscripción/)).toBeTruthy();
    await llenar(formulario, { numero: 'JVPM-0099', desde: '2026-12-01', hasta: '2026-11-01' });
    await guardar();
    expect(await within(formulario).findByText(/no puede ser anterior al inicio/)).toBeTruthy();
    await userEvent.clear(within(formulario).getByLabelText('Vigente hasta'));
    await userEvent.type(within(formulario).getByLabelText('Vigente hasta'), '2027-01-01');
    await llenar(formulario, { motivo: 'corto' });
    await guardar();
    expect(await within(formulario).findByText(/al menos 10 caracteres/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
  });

  it('ante un 409 de versión pide recargar la ficha y no guarda', async () => {
    const api = montar({ escritura: async () => { throw new ApiError('La ficha cambió; vuelve a abrirla.', 409, 'version_conflicto', 4); } });
    const { ficha, formulario } = await abrirFormulario();
    await llenar(formulario, { numero: 'JVPM-0099', desde: '2026-11-01', hasta: '2027-10-31', motivo: 'Renovación presentada por la persona' });
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar inscripción' }));
    expect(await within(ficha).findByText(/La ficha cambió\. Recárgala/)).toBeTruthy();
    await userEvent.click(within(ficha).getByRole('button', { name: 'Recargar ficha' }));
    expect(within(ficha).queryByRole('form', { name: 'Registrar inscripción' })).toBeNull();
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([path]) => path === '/personal').length).toBe(2));
  });

  it('muestra el mensaje de la API cuando la inscripción ya existe', async () => {
    montar({ escritura: async () => { throw new ApiError('Esa inscripción ya está registrada.', 409, 'conflicto'); } });
    const { ficha, formulario } = await abrirFormulario();
    await llenar(formulario, { numero: 'JVPM-0001', desde: '2026-11-01', hasta: '2027-10-31', motivo: 'Registro de prueba repetido' });
    await userEvent.click(within(formulario).getByRole('button', { name: 'Guardar inscripción' }));
    expect(await within(ficha).findByText(/Esa inscripción ya está registrada/)).toBeTruthy();
  });

  it('"Editar datos" cierra la ficha y abre el formulario de edición', async () => {
    montar();
    const ficha = await abrirFicha();
    await userEvent.click(within(ficha).getByRole('button', { name: 'Editar datos' }));
    expect(await screen.findByRole('dialog', { name: 'Editar persona' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: /Ficha de/ })).toBeNull();
  });
});
