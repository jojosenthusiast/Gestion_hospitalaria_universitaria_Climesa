import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Bed, Space } from '../lib/api';
import { Dashboard } from '../features/dashboards';
import { SpacesPage } from '../features/spaces';
import { QueueSummary } from '../features/queue';
import { bedTypeCounts, bedTypeText } from '../components/bed-types';
import { waitingSplit } from '../features/listas/queue-board';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

// Owner batch 5 (S4): «En espera» splits walk-ins of the day and appointments; free beds show per room type.

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

function permisosDe(rol: string) {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
}
const perfil = (rol: string): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'p@example.test', name: 'Persona Ficticia', roles: [rol], platforms: ['web'], permissions: permisosDe(rol), channels: [], patientId: null, staffId: null });

const hoy = new Date().toISOString();
const ticket = (n: number, extra: Record<string, unknown> = {}) => ({ id: `t${n}`, service: 'consulta_general', numero: n, state: 'en_espera', issuedAt: hoy, ...extra });
// 3 walk-ins, 2 with appointment (one by appointment time, one by registered arrival), 1 called (not waiting).
const fila = [ticket(1), ticket(2), ticket(3), ticket(4, { appointmentAt: hoy, appointmentId: 'c1' }), ticket(5, { arrivalFromAppointment: true }), ticket(6, { state: 'llamado' })];
const cama = (id: string, category: string, state: string): Bed => ({ id, code: id, roomId: `r-${id}`, room: `Hab ${id}`, category, level: 2, state, version: 1, cleaningPending: false, cleaningCompleted: false, cleanedByCurrentUser: false, path: '' });
// 4 free semiprivada beds, no free VIP bed.
const camas = [cama('S1', 'semiprivada', 'libre'), cama('S2', 'semiprivada', 'libre'), cama('S3', 'semiprivada', 'libre'), cama('S4', 'semiprivada', 'libre'), cama('V1', 'vip', 'ocupada')];
const tablero = { actualizadoEn: hoy, fecha: hoy.slice(0, 10), camas: { total: 5, libres: 4, ocupadas: 1, limpieza: 0, bloqueadas: 0, reservadas: 0 }, ocupacionPorPlanta: [], ambulancia: null, fila: { emitidos: 6, enEspera: 5, llamados: 1, enAtencion: 0, atendidos: 0, noSePresento: 0 }, laboratorio: { pendiente: 0, enProceso: 0, completadoHoy: 0, canceladoHoy: 0 }, cobertura: { huecos: 0, detalle: [], vigentes: [] }, turnosEnCurso: 0, pacientesActivos: 0 };
const respuestas: Record<string, unknown> = {
  '/fila': fila, '/camas': camas, '/metricas/tablero': tablero,
  '/inicio': { lastUpdate: hoy, beds: { total: 5, free: 4, occupied: 1 }, patients: { total: 1, active: 1 } },
  '/ambulancia': { unit: { id: 'u', plate: 'P-1', state: 'disponible', version: 1 }, activeService: null, paramedicOnDuty: true, pendingRequests: [] },
};
function montar(rol: string) {
  const api = { request: vi.fn(async (path: string) => respuestas[path.split('?')[0]] ?? []), write: vi.fn() } as unknown as Api;
  render(<Dashboard api={api} profile={perfil(rol)} version={0} />);
}
const figura = async (id: string) => { await screen.findByRole('region', { name: 'Cifras del día' }); return await vi.waitFor(() => { const el = document.querySelector(`[data-figure="${id}"]`); if (!el?.querySelector('.figure-detail')) throw new Error('sin detalle'); return el as HTMLElement; }); };

describe('S4 · En espera: de fila y con cita', () => {
  it('la regla cuenta solo los números en espera y separa los que tienen cita', () => {
    expect(waitingSplit(fila)).toEqual({ total: 5, walkIn: 3, booked: 2 });
  });

  for (const rol of ['REC', 'JOP', 'MED']) {
    it(`${rol}: la cifra «En espera» dice «3 de fila, 2 con cita»`, async () => {
      montar(rol);
      const el = await figura('espera');
      expect(el.querySelector('.figure-value')?.textContent).toBe('5');
      expect(within(el).getByText('En espera')).toBeTruthy();
      expect(within(el).getByText('3 de fila, 2 con cita')).toBeTruthy();
    });
  }

  it('Fila del día: el resumen dice «5 en espera · 3 de fila, 2 con cita»', () => {
    render(<QueueSummary visible={fila as never} now={Date.now()} proposal={null} onCallNext={null} callDisabled={false} onIssue={null} />);
    expect(screen.getByText('5 en espera · 3 de fila, 2 con cita')).toBeTruthy();
  });
});

describe('S4 · camas libres por tipo de habitación', () => {
  it('la regla lista siempre VIP y Semiprivada, aun sin camas libres de un tipo', () => {
    expect(bedTypeText(bedTypeCounts(camas.map(b => ({ category: b.category, free: b.state === 'libre' }))))).toBe('VIP 0 · Semiprivada 4');
  });

  for (const rol of ['REC', 'JOP']) {
    it(`${rol}: «Camas libres» muestra «VIP 0 · Semiprivada 4» y resalta el tipo sin camas`, async () => {
      montar(rol);
      const el = await figura('camas-libres');
      const tipos = within(el).getByRole('list', { name: 'Camas libres por tipo de habitación' });
      const items = within(tipos).getAllByRole('listitem');
      expect(items.map(i => i.textContent)).toEqual(['VIP 0', 'Semiprivada 4']);
      expect(items[0].className).toContain('is-none');
      expect(items[1].className).not.toContain('is-none');
    });
  }

  it('Edificio: muestra los libres por tipo de la planta y de todo el edificio', async () => {
    const espacio = (id: string, type: string, extra: Partial<Space> = {}): Space => ({ id, parentId: null, type, code: id, name: id, active: true, version: 1, path: id, totalBeds: 0, freeBeds: 0, ...extra });
    const bedsP2 = [cama('H1-A', 'semiprivada', 'libre'), cama('H1-B', 'semiprivada', 'ocupada')], bedsP3 = [{ ...cama('V1-A', 'vip', 'libre'), level: 3 }];
    const espacios: Space[] = [
      espacio('P2', 'planta', { name: 'Planta 2', level: 2, totalBeds: 2, freeBeds: 1 }), espacio('P3', 'planta', { name: 'Planta 3', level: 3, totalBeds: 1, freeBeds: 1 }),
      espacio('H1', 'habitacion', { parentId: 'P2', category: 'semiprivada', level: 2, totalBeds: 2, freeBeds: 1 }), espacio('V1', 'habitacion', { parentId: 'P3', category: 'vip', level: 3, totalBeds: 1, freeBeds: 1 }),
      ...bedsP2.map(b => espacio(b.id, 'cama', { parentId: 'H1', level: 2, totalBeds: 1 })), ...bedsP3.map(b => espacio(b.id, 'cama', { parentId: 'V1', level: 3, totalBeds: 1 })),
    ];
    const api = { request: vi.fn(async (path: string) => path.startsWith('/camas') ? [...bedsP2, ...bedsP3] : path.startsWith('/espacios') ? espacios : []), write: vi.fn() } as unknown as Api;
    render(<SpacesPage api={api} profile={{ ...perfil('JOP'), permissions: ['espacios.ver', 'camas.ver_tablero'].map(code => ({ code, context: 'global' })) }} version={0} />);
    const planta = await screen.findByRole('list', { name: /Camas libres por tipo en Planta/ });
    expect(within(planta).getAllByRole('listitem').map(i => i.textContent)).toEqual(['VIP 0', 'Semiprivada 1']);
    const edificio = screen.getByRole('list', { name: 'Camas libres por tipo en todo el edificio' });
    expect(within(edificio).getAllByRole('listitem').map(i => i.textContent)).toEqual(['VIP 1', 'Semiprivada 1']);
  });
});
