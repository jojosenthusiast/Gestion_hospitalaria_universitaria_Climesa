import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api, type Bed, type Space } from '../lib/api';
import { BedsPage, SpacesPage } from '../features/spaces';
import { HospitalizationPage } from '../features/hospitalization';

// R4a (Camas y Hospitalización): bed cards carry their area colour, room codes never break, the empty detail column
// collapses, and isolation is only said when there is one.

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
const habitacionesVisibles = () => document.querySelectorAll('.plan-room');

describe('Camas · plano (R4a)', () => {
  it('cada habitación lleva el color de su área (tinte, franja y código)', async () => {
    montar('camas');
    await screen.findByRole('button', { name: 'Ver habitación HAB-201' });
    const room = habitacionesVisibles()[0];
    expect(room.className).toMatch(/area-surface area-hos/);
    expect(room.querySelector('.area-tag')?.textContent).toContain('HOS');
  });

  it('el código de la habitación no se parte y la tarjeta no repite «libres» bajo el título (obs. 7)', async () => {
    montar('camas');
    const title = await screen.findByRole('button', { name: 'Ver habitación HAB-201' });
    expect(title.querySelector('strong')!.className).toContain('nowrap-code');
    expect(habitacionesVisibles()[0].querySelector('.plan-free, .plan-free-pill')).toBeNull();
  });

  it('sin selección no hay columna de detalle vacía', async () => {
    montar('camas');
    await screen.findByRole('button', { name: 'Ver habitación HAB-201' });
    expect(screen.queryByText('Selecciona una cama o un espacio')).toBeNull();
    expect(document.querySelector('.building-split')!.className).toContain('is-collapsed');
  });
});

describe('Hospitalización · lista (R4a)', () => {
  const base = { motive: null, unstable: false, postSurgical: false };
  const rows = [
    { ...base, id: 'a-1', patientId: 'p-1', patientName: 'Paciente Uno', origin: 'programada', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: false, bed: '', version: 1, allowedActions: [] },
    { ...base, id: 'a-2', patientId: 'p-2', patientName: 'Paciente Dos', origin: 'emergencia', requestedCategory: 'semiprivada', state: 'hospitalizado', isolation: true, bed: 'HAB-201-A', version: 1, allowedActions: [] },
  ];
  it('el aislamiento solo se dice cuando existe; la cama no se parte', async () => {
    const api = { request: vi.fn(async () => rows), write: vi.fn() };
    render(<HospitalizationPage api={api as unknown as Api} profile={{ ...perfil, permissions: [{ code: 'admision.ver', context: 'global' }] }} version={0} />);
    await screen.findByText('Paciente Uno');
    expect(screen.queryByText(/Sin aislamiento/)).toBeNull();
    expect(screen.getByText('Aislamiento')).toBeTruthy();
    expect(screen.getByText('HAB-201-A').className).toContain('nowrap-code');
  });
});
