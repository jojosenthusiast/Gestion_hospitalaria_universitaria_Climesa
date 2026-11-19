import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api, type Bed, type Space } from '../lib/api';
import { BedsPage, SpacesPage } from '../features/spaces';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil: AccessProfile = {
  id: 'jop-1', user: { id: 'jop-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: ['espacios.ver', 'camas.ver_tablero'].map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
};
const estados = ['ocupada', 'ocupada', 'ocupada', 'reservada', 'bloqueada', 'limpieza'];

// Planta 2: HAB-201 a HAB-206 de 2 camas (12); planta 3: VIP-301 a VIP-305 de 1 cama (5). Total 17.
const habitaciones = [
  ...[1, 2, 3, 4, 5, 6].map(n => ({ code: `HAB-20${n}`, level: 2, category: 'semiprivada', beds: ['A', 'B'] })),
  ...[1, 2, 3, 4, 5].map(n => ({ code: `VIP-30${n}`, level: 3, category: 'vip', beds: ['A'] })),
];
const camas: Bed[] = habitaciones.flatMap((h, i) => h.beds.map((letra, j) => ({
  id: `${h.code}-${letra}`, code: `${h.code}-${letra}`, roomId: h.code, room: h.code, category: h.category, level: h.level,
  state: i < 3 ? estados[i * 2 + j] ?? 'libre' : 'libre', path: `Planta ${h.level} > ${h.code} > Cama ${letra}`, version: 1,
  cleaningPending: false, cleaningCompleted: false, cleanedByCurrentUser: false,
} as Bed)));
const espacio = (id: string, code: string, type: string, extra: Partial<Space> = {}): Space => ({
  id, parentId: null, type, code, name: code, active: true, version: 1, path: code, totalBeds: 0, freeBeds: 0, ...extra,
});
const libres = (nivel: number) => camas.filter(c => c.level === nivel && c.state === 'libre').length;
const espacios: Space[] = [
  espacio('P2', 'P2', 'planta', { name: 'Planta 2', level: 2, path: 'Planta 2', totalBeds: 12, freeBeds: libres(2) }),
  espacio('P3', 'P3', 'planta', { name: 'Planta 3', level: 3, path: 'Planta 3', totalBeds: 5, freeBeds: libres(3) }),
  ...habitaciones.flatMap(h => {
    const hijas = camas.filter(c => c.roomId === h.code);
    return [
      espacio(h.code, h.code, 'habitacion', { parentId: h.level === 2 ? 'P2' : 'P3', category: h.category, capacity: h.beds.length, level: h.level, path: `Planta ${h.level} > ${h.code}`, totalBeds: hijas.length, freeBeds: hijas.filter(c => c.state === 'libre').length }),
      ...hijas.map(c => espacio(c.id, c.code, 'cama', { parentId: h.code, level: h.level, path: c.path, totalBeds: 1, freeBeds: c.state === 'libre' ? 1 : 0 })),
    ];
  }),
];

function montar(pagina: 'camas' | 'espacios', permisos: string[] = ['espacios.ver', 'camas.ver_tablero']) {
  const api = {
    request: vi.fn(async (path: string): Promise<unknown> => (path.startsWith('/camas') ? camas : path.startsWith('/espacios') ? espacios : [])),
    write: vi.fn(async () => ({ ok: true })),
  };
  const props = { api: api as unknown as Api, profile: { ...perfil, permissions: permisos.map(code => ({ code, context: 'global' })) }, version: 0 };
  render(pagina === 'camas' ? <BedsPage {...props} /> : <SpacesPage {...props} />);
  return api;
}
const glifos = () => document.querySelectorAll('.bed-glyph');
const habitacionesVisibles = () => document.querySelectorAll('.plan-room');
const planta = (nombre: RegExp) => screen.getByRole('button', { name: nombre });

describe('W12 · plano de camas por planta', () => {
  it('las plantas salen de los datos y cada una reparte sus camas', async () => {
    montar('camas');
    const totales = await screen.findByLabelText('Camas del hospital');
    expect(totales.textContent).toBe(`17camas${libres(2) + libres(3)}libres3ocupadas`);
    expect(planta(/Planta 2/)).toBeTruthy();
    expect(planta(/Planta 3/)).toBeTruthy();
    expect(habitacionesVisibles()).toHaveLength(6);
    expect(glifos()).toHaveLength(12);
    await userEvent.click(planta(/Planta 3/));
    expect(habitacionesVisibles()).toHaveLength(5);
    expect(glifos()).toHaveLength(5);
    expect(screen.getByRole('button', { name: /^Cama VIP-301-A/ })).toBeTruthy();
  });

  it('muestra el estado de cada cama con su palabra, no solo con color', async () => {
    montar('camas');
    await screen.findByRole('button', { name: /^Cama HAB-201-A/ });
    const hab201 = screen.getByRole('article', { name: 'Habitación HAB-201' });
    expect(within(hab201).getAllByText('Ocupada')).toHaveLength(2);
    const hab202 = screen.getByRole('article', { name: 'Habitación HAB-202' });
    expect(within(hab202).getByText('Ocupada')).toBeTruthy();
    expect(within(hab202).getByText('Reservada')).toBeTruthy();
    const hab203 = screen.getByRole('article', { name: 'Habitación HAB-203' });
    expect(within(hab203).getByText('Bloqueada')).toBeTruthy();
    expect(within(hab203).getByText('En limpieza')).toBeTruthy();
  });

  it('la leyenda cuenta las camas de la planta y filtra al tocarla', async () => {
    montar('camas');
    await screen.findByRole('button', { name: /^Cama HAB-201-A/ });
    const leyenda = screen.getByRole('list', { name: /Leyenda/ });
    expect(within(leyenda).getByRole('button', { name: /Ocupada/ }).textContent).toContain('3');
    await userEvent.click(within(leyenda).getByRole('button', { name: /Ocupada/ }));
    expect(glifos()).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('Estado de cama'), 'libre');
    expect(glifos()).toHaveLength(libres(2));
    await userEvent.click(planta(/Planta 3/));
    await userEvent.selectOptions(screen.getByLabelText('Estado de cama'), 'ocupada');
    expect(screen.getByText('No hay espacios con este filtro')).toBeTruthy();
  });

  it('busca por código sin importar acentos ni mayúsculas', async () => {
    montar('camas');
    await screen.findByRole('button', { name: /^Cama HAB-201-A/ });
    await userEvent.type(screen.getByLabelText('Buscar espacio o cama'), 'hab-204');
    expect(habitacionesVisibles()).toHaveLength(1);
    expect(glifos()).toHaveLength(2);
  });

  it('al tocar una cama libre con permiso, asigna una admisión que espera cama', async () => {
    const api = montar('camas', ['camas.ver_tablero', 'camas.asignar', 'admision.ver']);
    api.request.mockImplementation(async (path: string) => (path.startsWith('/camas') ? camas : [{ id: 'adm-1', patientName: 'Paciente Ficticio', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: false }]));
    await userEvent.click(await screen.findByRole('button', { name: /^Cama HAB-204-A/ }));
    const formulario = await screen.findByRole('form', { name: 'Asignar cama HAB-204-A' });
    await userEvent.selectOptions(within(formulario).getByLabelText('Admisión que espera cama'), 'adm-1');
    await userEvent.click(within(formulario).getByRole('button', { name: 'Asignar esta cama' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/adm-1/cama', { bedId: 'HAB-204-A', version: 1 }, 'POST');
  });
});

describe('W09 · edificio', () => {
  it('muestra plantas con sus libres y cada habitación con el estado de sus camas', async () => {
    montar('espacios');
    expect(await screen.findByRole('button', { name: /Planta 2/ })).toBeTruthy();
    expect(planta(/Planta 2/).textContent).toContain(`${libres(2)}/12 libres`);
    expect(planta(/Planta 3/).textContent).toContain(`${libres(3)}/5 libres`);
    const hab204 = screen.getByRole('article', { name: 'Habitación HAB-204' });
    expect(within(hab204).getAllByText('Libre')).toHaveLength(2);
    expect(within(screen.getByRole('article', { name: 'Habitación HAB-201' })).getAllByText('Ocupada')).toHaveLength(2);
    expect(hab204.querySelector('.plan-free, .plan-free-pill')).toBeNull();
  });

  it('al tocar una habitación abre su detalle y, con permiso, ofrece editar y agregar dentro', async () => {
    montar('espacios', ['espacios.ver', 'espacios.configurar']);
    await userEvent.click(await screen.findByRole('button', { name: 'Ver habitación HAB-201' }));
    const panel = screen.getByRole('complementary', { name: 'Detalle del espacio' });
    const dato = (label: string) => within(panel).getByText(label).nextElementSibling?.textContent;
    expect(dato('Tipo')).toBe('Habitación');
    expect(dato('Categoría')).toBe('Semiprivada');
    expect(dato('Planta')).toBe('2');
    expect(dato('Capacidad')).toBe('2 camas');
    expect(dato('Estado')).toBe('Activo');
    expect(within(panel).getByRole('button', { name: 'Editar habitación' }).className).toContain('crud-edit');
    expect(within(panel).getByRole('button', { name: /Agregar espacio dentro/ }).className).toContain('crud-create');
    await userEvent.click(within(panel).getByRole('button', { name: /Agregar espacio dentro/ }));
    expect(await screen.findByRole('dialog', { name: 'Agregar dentro de HAB-201' })).toBeTruthy();
  });

  it('sin espacios.configurar no ofrece crear ni editar y lo dice con «Solo lectura»', async () => {
    montar('espacios');
    await userEvent.click(await screen.findByRole('button', { name: 'Ver habitación HAB-201' }));
    expect(screen.queryByRole('button', { name: 'Crear espacio' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar habitación/ })).toBeNull();
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toContain('contacta a Administración');
  });

  it('con espacios.configurar ofrece «Crear espacio» con el botón de crear y sin «Solo lectura»', async () => {
    montar('espacios', ['espacios.ver', 'espacios.configurar']);
    expect((await screen.findByRole('button', { name: 'Crear espacio' })).className).toContain('crud-create');
    expect(screen.queryByText('Solo lectura')).toBeNull();
  });

  it('explica en una sola línea cómo se usa el plano', async () => {
    montar('espacios');
    expect((await screen.findByText(/Toca un espacio o una cama para ver su detalle/)).textContent).toBe('Planta → área → habitación → cama. Toca un espacio o una cama para ver su detalle.');
    expect(screen.queryByText(/Asignar espacios es decidir/)).toBeNull();
  });

  it('?accion=crear abre el formulario de crear espacio y limpia el parámetro', async () => {
    location.hash = '#/espacios?accion=crear';
    montar('espacios', ['espacios.ver', 'espacios.configurar']);
    expect(await screen.findByRole('dialog', { name: 'Crear espacio' })).toBeTruthy();
    expect(location.hash).toBe('#/espacios');
    location.hash = '';
  });
});

// Obs. 7: ADM configures the building without the bed board; /espacios carries each bed's state (never its occupant).
describe('Edificio de Administración · estado de cada cama sin datos del paciente (obs. 7)', () => {
  const conEstado = espacios.map(s => (s.type === 'cama' ? { ...s, bedState: camas.find(c => c.id === s.id)!.state } : { ...s, bedState: null }));
  function montarAdm(arbol: Space[] = conEstado) {
    const api = {
      request: vi.fn(async (path: string): Promise<unknown> => (path.startsWith('/espacios') ? arbol : [])),
      write: vi.fn(async () => ({ ok: true })),
    };
    const profile = { ...perfil, roles: ['ADM'], permissions: ['espacios.ver', 'espacios.configurar'].map(code => ({ code, context: 'global' })) };
    render(<SpacesPage api={api as unknown as Api} profile={profile} version={0} />);
    return api;
  }

  it('ve los mismos colores, leyenda con conteo y filtro de estado que Operaciones, sin pedir /camas', async () => {
    const api = montarAdm();
    expect(await screen.findByRole('button', { name: 'Cama HAB-201-A, Ocupada' })).toBeTruthy();
    expect(screen.getByLabelText('Estado de cama')).toBeTruthy();
    const leyenda = screen.getByRole('list', { name: 'Leyenda y conteo de camas de la planta' });
    expect(within(leyenda).getByRole('button', { name: /Ocupada/ }).textContent).toBe('Ocupada3');
    expect(within(leyenda).getByRole('button', { name: /Libre/ }).textContent).toBe(`Libre${libres(2)}`);
    await userEvent.click(within(leyenda).getByRole('button', { name: /Bloqueada/ }));
    expect(glifos()).toHaveLength(1);
    expect(screen.getByLabelText('Camas del hospital').textContent).toBe(`17camas${libres(2) + libres(3)}libres3ocupadas`);
    expect(api.request.mock.calls.map(([path]) => path).filter(path => String(path).startsWith('/camas'))).toEqual([]);
    expect(screen.queryByText(/Operaciones/)).toBeNull();
  });

  it('el detalle de una cama da su estado, sin ocupante ni mensajes de «lo consulta Operaciones»', async () => {
    montarAdm();
    await userEvent.click(await screen.findByRole('button', { name: 'Cama HAB-201-A, Ocupada' }));
    const panel = screen.getByRole('complementary', { name: 'Detalle del espacio' });
    expect(within(panel).getByText('Tiene un paciente')).toBeTruthy();
    expect(panel.textContent).not.toMatch(/Operaciones|Identidad|Asignar/);
    expect(within(panel).getByRole('button', { name: 'Editar cama' })).toBeTruthy();
  });

  it('si el árbol no trae estados, la habitación muestra sus libres en una sola cápsula', async () => {
    montarAdm(espacios);
    const hab204 = await screen.findByRole('article', { name: 'Habitación HAB-204' });
    expect(hab204.querySelector('.plan-free-pill')!.textContent).toBe('2 libres');
    expect(within(screen.getByRole('article', { name: 'Habitación HAB-201' })).getByText('0 libres')).toBeTruthy();
    expect(screen.queryByLabelText('Estado de cama')).toBeNull();
    expect(screen.queryByLabelText('Camas del hospital')).toBeNull();
  });
});
