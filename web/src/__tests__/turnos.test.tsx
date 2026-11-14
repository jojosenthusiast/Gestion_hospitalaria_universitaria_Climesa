import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api, type Shift, type Staff } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import type { ShiftCatalog } from '../features/shifts/rules';
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

const ana: Staff = { id: 's-1', givenNames: 'Ana', surnames: 'Ficticia Prueba', type: 'medico', areaId: 'a-1', area: 'Emergencia', active: true, version: 3 };
const turno = (id: string, state: string, version = 2): Shift => ({
  id, staffId: 's-1', person: 'Ana Ficticia Prueba', areaId: 'a-1', area: 'Emergencia', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T22:00:00.000Z', type: 'diurno', state, version,
});

const catalogo: ShiftCatalog = {
  roles: [{ code: 'medico', name: 'Médico' }, { code: 'enfermero', name: 'Enfermería' }, { code: 'laboratorista', name: 'Laboratorio' }],
  areas: [
    { id: 'a-1', parentId: 'h-1', type: 'area', code: 'EMG', name: 'Emergencia' },
    { id: 'a-2', parentId: 'h-1', type: 'area', code: 'LAB', name: 'Laboratorio clínico' },
    { id: 'a-3', parentId: 'h-1', type: 'consultorio', code: 'CON', name: 'Consulta externa' },
  ],
  staff: [
    { id: 's-1', name: 'Ana Ficticia Prueba', type: 'medico', specialty: 'Medicina general', areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
    { id: 's-2', name: 'Rosa Enfermera Prueba', type: 'enfermero', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
    { id: 's-3', name: 'Luis Laboratorio Prueba', type: 'laboratorista', specialty: null, areaId: 'a-2', area: 'Laboratorio clínico', registrations: [] },
    { id: 's-4', name: 'Marta Sin Inscripción', type: 'medico', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [] },
  ],
};

function montar(perfilActual: AccessProfile, turnos: Shift[], escritura: (path: string, body: unknown, method?: string) => Promise<unknown> = async () => ({})) {
  const api = {
    request: vi.fn(async (path: string) => (path === '/turnos/catalogo' ? catalogo : turnos)),
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
});

describe('turnos · asignar turno de punta a punta (obs. 9)', () => {
  const abrir = async () => {
    const api = montar(jefatura, []);
    await userEvent.click(await screen.findByRole('button', { name: /Asignar turno/ }));
    return { api, dialogo: await screen.findByRole('dialog', { name: 'Asignar turno' }) };
  };
  const elegirArea = async (dialogo: HTMLElement, texto: string, nombre: RegExp) => {
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Área' }));
    await userEvent.type(within(dialogo).getByRole('combobox', { name: 'Área' }), texto);
    await userEvent.click(await screen.findByRole('option', { name: nombre }));
  };
  const horario = async (dialogo: HTMLElement, inicio: string, fin: string) => {
    fireEvent.change(within(dialogo).getByLabelText('Fecha de inicio'), { target: { value: '2026-11-20' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de inicio'), { target: { value: inicio } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de fin'), { target: { value: fin } });
  };

  it('sigue el orden área, horario y personal; sin área no se puede buscar personal', async () => {
    const { dialogo } = await abrir();
    expect(within(dialogo).getByRole('combobox', { name: 'Persona' }).hasAttribute('disabled')).toBe(true);
    expect(within(dialogo).queryByLabelText('Filtrar personal por área')).toBeNull();
    await elegirArea(dialogo, 'emerg', /Emergencia/);
    expect(within(dialogo).getByRole('combobox', { name: 'Persona' }).hasAttribute('disabled')).toBe(false);
  });

  it('el personal elegible depende del área y del rol, y se busca sin tildes', async () => {
    const { dialogo } = await abrir();
    await elegirArea(dialogo, 'emerg', /Emergencia/);
    await horario(dialogo, '07:00', '15:00');
    const persona = within(dialogo).getByRole('combobox', { name: 'Persona' });
    await userEvent.click(persona);
    expect(within(screen.getByRole('listbox', { name: 'Persona' })).getAllByRole('option').map(o => o.textContent)).toEqual([expect.stringContaining('Ana Ficticia'), expect.stringContaining('Rosa Enfermera'), expect.stringContaining('Marta Sin')]);
    expect(screen.queryByRole('option', { name: /Luis Laboratorio/ })).toBeNull();
    await userEvent.click(within(dialogo).getByRole('button', { name: /Enfermería/ }));
    await userEvent.click(persona);
    expect(within(screen.getByRole('listbox', { name: 'Persona' })).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Rosa Enfermera/ })).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: /otras áreas/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: /Laboratorio/ }));
    await userEvent.click(persona);
    expect(screen.getByRole('option', { name: /Luis Laboratorio/ })).toBeTruthy();
  });

  it('muestra apagada a la persona sin inscripción vigente y la que ya tiene turno, con su motivo', async () => {
    const api = { request: vi.fn(async (path: string) => (path === '/turnos/catalogo' ? catalogo : [turno('t-9', 'publicado')].map(t => ({ ...t, start: '2026-11-20T14:00:00.000Z', end: '2026-11-20T22:00:00.000Z' })))), write: vi.fn(async () => ({})) };
    render(<ShiftsPage api={api as unknown as Api} profile={jefatura} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /Asignar turno/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    await elegirArea(dialogo, 'emerg', /Emergencia/);
    await horario(dialogo, '09:00', '17:00');
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Persona' }));
    const ana = screen.getByRole('option', { name: /Ana Ficticia/ });
    expect(ana.getAttribute('aria-disabled')).toBe('true');
    expect(ana.textContent).toMatch(/traslapa/);
    expect(screen.getByRole('option', { name: /Marta Sin/ }).textContent).toMatch(/Sin inscripción profesional vigente/);
    expect(screen.getByRole('option', { name: /Rosa Enfermera/ }).getAttribute('aria-disabled')).toBeNull();
  });

  it('avisa la regla de 4 a 24 horas y no deja guardar fuera de ella', async () => {
    const { dialogo } = await abrir();
    await elegirArea(dialogo, 'emerg', /Emergencia/);
    await horario(dialogo, '07:00', '09:00');
    expect((await within(dialogo).findByRole('alert')).textContent).toMatch(/de 4 a 12 horas/);
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Persona' }));
    await userEvent.click(screen.getByRole('option', { name: /Rosa Enfermera/ }));
    expect(within(dialogo).getByRole('button', { name: 'Asignar turno' }).hasAttribute('disabled')).toBe(true);
  });

  it('envía el turno con zona horaria y tipo sugerido por el horario', async () => {
    const { api, dialogo } = await abrir();
    await elegirArea(dialogo, 'emerg', /Emergencia/);
    await horario(dialogo, '19:00', '07:00');
    expect(within(dialogo).getByRole('radio', { name: 'Nocturno' }).hasAttribute('checked') || (within(dialogo).getByRole('radio', { name: 'Nocturno' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Persona' }));
    await userEvent.click(screen.getByRole('option', { name: /Rosa Enfermera/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Asignar turno' }));
    expect(api.write).toHaveBeenCalledTimes(1);
    const [ruta, cuerpo, metodo] = api.write.mock.calls[0];
    expect([ruta, metodo]).toEqual(['/turnos', 'POST']);
    expect(cuerpo).toMatchObject({ staffId: 's-2', areaId: 'a-1', type: 'nocturno', start: '2026-11-21T01:00:00.000Z', end: '2026-11-21T13:00:00.000Z' });
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

describe('turnos · filtros con todas las opciones reales (obs. 2)', () => {
  const fila = (id: string, person: string, staffType: string, areaId: string, area: string): Shift & { staffType: string } => ({ ...turno(id, 'publicado'), staffId: `s-${id}`, person, staffType, areaId, area });
  // Una cuenta de solo lectura (LAB, REC, ENF…) ve solo dos turnos, pero el catálogo trae todas las opciones del sistema.
  const turnos = [fila('1', 'Ana Ficticia Prueba', 'medico', 'a-1', 'Emergencia'), fila('2', 'Rosa Enfermera Prueba', 'enfermero', 'a-1', 'Emergencia')];
  const montarLectura = () => {
    const api = { request: vi.fn(async (path: string) => (path === '/turnos' ? turnos : path === '/turnos/catalogo' ? catalogo : (() => { throw new ApiError('Sin permiso', 403); })())), write: vi.fn() };
    render(<ShiftsPage api={api as unknown as Api} profile={soloLectura} version={0} />);
    return api;
  };
  const personas = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent);

  it('lista todos los roles y todas las áreas aunque solo se vean turnos de dos', async () => {
    const api = montarLectura();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    const roles = within(screen.getByRole('group', { name: 'Rol del personal' })).getAllByRole('button').map(b => b.textContent);
    expect(roles).toEqual(['Médico', 'Enfermería', 'Laboratorio']);
    const areas = within(screen.getByRole('group', { name: 'Área de trabajo' })).getAllByRole('button').map(b => b.textContent);
    expect(areas).toEqual(['Emergencia', 'Laboratorio clínico', 'Consulta externa']);
    expect(api.request).toHaveBeenCalledWith('/turnos/catalogo', expect.anything());
    expect(api.request).not.toHaveBeenCalledWith('/personal', expect.anything());
  });

  it('busca a cualquier persona del personal, tenga o no turnos cargados, y los filtros se combinan', async () => {
    montarLectura();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Área de trabajo' })).getByRole('button', { name: 'Emergencia' }));
    expect(personas()).toHaveLength(2);
    await userEvent.click(within(screen.getByRole('group', { name: 'Rol del personal' })).getByRole('button', { name: 'Enfermería' }));
    expect(personas()).toHaveLength(1);
    expect(personas()[0]).toContain('Rosa Enfermera');
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(personas()).toHaveLength(2);
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar persona' }), 'luis');
    expect(screen.getByRole('option', { name: /Luis Laboratorio/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('option', { name: /Luis Laboratorio/ }));
    expect(screen.getByRole('button', { name: /Quitar filtro Persona: Luis/ })).toBeTruthy();
    expect(screen.getByText(/Sin turnos en esta vista/)).toBeTruthy();
  });

  it('cada fila muestra chips de rol y de área', async () => {
    montarLectura();
    await screen.findByRole('table');
    const fila1 = screen.getAllByRole('row')[1];
    expect(fila1.querySelector('[data-identity="MED"]')).toBeTruthy();
    expect(fila1.querySelector('[data-identity="emergencia"]')).toBeTruthy();
  });

  it('?accion=planificar abre el formulario de asignar turno y limpia el parámetro', async () => {
    location.hash = '#/turnos?accion=planificar';
    montar(jefatura, []);
    expect(await screen.findByRole('dialog', { name: 'Asignar turno' })).toBeTruthy();
    expect(location.hash).toBe('#/turnos');
    location.hash = '';
  });
});
