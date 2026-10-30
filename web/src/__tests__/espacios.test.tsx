import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api, type Bed, type Space } from '../lib/api';
import { BedsPage, SpacesPage } from '../features/spaces';

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

function montar(pagina: 'camas' | 'espacios') {
  const api = { request: vi.fn(async () => (pagina === 'camas' ? camas : espacios)), write: vi.fn(async () => ({ ok: true })) };
  const props = { api: api as unknown as Api, profile: perfil, version: 0 };
  render(pagina === 'camas' ? <BedsPage {...props} /> : <SpacesPage {...props} />);
  return api;
}
const filasDeCama = () => document.querySelectorAll('.bed-row');
const bloques = () => document.querySelectorAll('.room-block');

describe('W12 · plano de camas por planta', () => {
  it('muestra las 17 camas de hospitalización y reparte 12 en la planta 2 y 5 en la planta 3', async () => {
    montar('camas');
    expect(await screen.findByText('Camas de hospitalización')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(bloques()).toHaveLength(6);
    expect(filasDeCama()).toHaveLength(12);
    expect(screen.getByText('HAB-201-A')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Planta 3 · VIP' }));
    expect(bloques()).toHaveLength(5);
    expect(filasDeCama()).toHaveLength(5);
    expect(screen.getByText('VIP-301-A')).toBeTruthy();
  });

  it('muestra el estado de cada cama de la planta 2 dentro de su habitación', async () => {
    montar('camas');
    await screen.findByText('HAB-201-A');
    const hab201 = screen.getByRole('heading', { name: 'HAB-201' }).closest('article') as HTMLElement;
    expect(within(hab201).getAllByText('Ocupada')).toHaveLength(2);
    const hab202 = screen.getByRole('heading', { name: 'HAB-202' }).closest('article') as HTMLElement;
    expect(within(hab202).getByText('Ocupada')).toBeTruthy();
    expect(within(hab202).getByText('Reservada')).toBeTruthy();
    const hab203 = screen.getByRole('heading', { name: 'HAB-203' }).closest('article') as HTMLElement;
    expect(within(hab203).getByText('Bloqueada')).toBeTruthy();
    expect(within(hab203).getByText('En limpieza')).toBeTruthy();
  });

  it('cambia de planta y filtra por estado', async () => {
    montar('camas');
    await screen.findByText('HAB-201-A');
    await userEvent.selectOptions(screen.getByLabelText('Estado de cama'), 'ocupada');
    expect(filasDeCama()).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('Estado de cama'), 'libre');
    expect(filasDeCama()).toHaveLength(libres(2));
    await userEvent.click(screen.getByRole('button', { name: 'Planta 3 · VIP' }));
    expect(filasDeCama()).toHaveLength(5);
    await userEvent.selectOptions(screen.getByLabelText('Estado de cama'), 'ocupada');
    expect(screen.getByText('No hay camas con este estado')).toBeTruthy();
  });
});

describe('W09 · árbol de espacios', () => {
  it('lista plantas, habitaciones y camas con sus camas libres por nodo', async () => {
    montar('espacios');
    const arbol = await screen.findByRole('list', { name: 'Árbol de espacios' });
    const fila = (codigo: string) => within(arbol).getAllByRole('listitem').find(f => within(f).queryByText(codigo, { selector: '.mono-data' }))!;
    expect(within(arbol).getAllByRole('listitem')).toHaveLength(espacios.length);
    expect(within(fila('P2')).getByText(`${libres(2)}/12`)).toBeTruthy();
    expect(within(fila('P3')).getByText(`${libres(3)}/5`)).toBeTruthy();
    expect(within(fila('HAB-201')).getByText('0/2')).toBeTruthy();
    expect(within(fila('HAB-203')).getByText('0/2')).toBeTruthy();
    expect(within(fila('HAB-204')).getByText('2/2')).toBeTruthy();
  });

  it('en la vista por planta cambia entre la planta 2 con 12 camas y la planta 3 con 5', async () => {
    montar('espacios');
    await screen.findByRole('list', { name: 'Árbol de espacios' });
    await userEvent.click(screen.getByRole('button', { name: 'Por planta' }));
    expect(bloques()).toHaveLength(6);
    expect(document.querySelectorAll('.room-structure span')).toHaveLength(12);
    await userEvent.click(screen.getByRole('button', { name: 'Planta 3' }));
    expect(bloques()).toHaveLength(5);
    expect(document.querySelectorAll('.room-structure span')).toHaveLength(5);
    expect(screen.getByText('VIP-301-A')).toBeTruthy();
  });
});
