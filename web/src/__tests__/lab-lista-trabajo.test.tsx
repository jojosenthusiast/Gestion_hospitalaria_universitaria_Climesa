import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LaboratoryPage, patientLine } from '../features/laboratory';
import { formatElapsed, isCritical, slaLevel, sortOrders, stageOf, type WorkOrder } from '../features/listas/lab-worklist';

afterEach(cleanup);

const NOW = Date.parse('2026-11-14T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const order = (over: Partial<WorkOrder> & Record<string, unknown> = {}): WorkOrder & Record<string, unknown> => ({ id: 'o', patientName: 'Paciente Ficticio', priority: 'rutina', state: 'pendiente', version: 1, createdAt: minutesAgo(10), items: [{ id: 'i', code: 'HB', name: 'Hemoglobina', result: null }], ...over });

describe('reglas de la lista de trabajo', () => {
  it('ordena urgentes primero y luego la que más lleva esperando; lo cerrado al final', () => {
    const sorted = sortOrders([order({ id: 'a', createdAt: minutesAgo(5) }), order({ id: 'b', priority: 'urgente', createdAt: minutesAgo(1) }), order({ id: 'c', createdAt: minutesAgo(90) }), order({ id: 'd', priority: 'urgente', state: 'completado', createdAt: minutesAgo(300) })], 'prioridad');
    expect(sorted.map(o => o.id)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('el color de meta cambia con el tiempo y la prioridad, y se apaga al terminar la espera', () => {
    expect(slaLevel(order({ createdAt: minutesAgo(20) }), NOW)).toBe('ok');
    expect(slaLevel(order({ priority: 'urgente', createdAt: minutesAgo(35) }), NOW)).toBe('warn');
    expect(slaLevel(order({ priority: 'urgente', createdAt: minutesAgo(61) }), NOW)).toBe('late');
    expect(slaLevel(order({ state: 'completado', createdAt: minutesAgo(900) }), NOW)).toBe('none');
  });
  it('etapas y tiempos legibles', () => {
    expect(stageOf({ state: 'completado', reviewedAt: null })).toBe('por_revisar');
    expect(stageOf({ state: 'completado', reviewedAt: 'x' })).toBe('liberada');
    expect(stageOf({ state: 'cancelado', reviewedAt: null })).toBe('cancelada');
    expect([formatElapsed(7), formatElapsed(65), formatElapsed(120), formatElapsed(1500)]).toEqual(['7 min', '1 h 05 min', '2 h', '1 d 1 h']);
  });
  it('un valor crítico alto o bajo marca la orden', () => {
    expect(isCritical(order({ items: [{ id: 'i', code: 'K', name: 'Potasio', result: { mark: 'critico_alto' } }] }))).toBe(true);
    expect(isCritical(order({ items: [{ id: 'i', code: 'K', name: 'Potasio', result: { mark: 'alto' } }] }))).toBe(false);
  });
  it('la línea del paciente respeta lo que el rol puede ver', () => {
    expect(patientLine({ patientRecord: '000101-1', patientSex: 'femenino', patientAge: 34, patientAgeRange: null })).toBe('Exp. 000101-1 · 34 años · F');
    expect(patientLine({ patientRecord: '000101-1', patientSex: 'masculino', patientAge: null, patientAgeRange: '30-39' })).toBe('Exp. 000101-1 · 30-39 años · M');
  });
});

describe('lista de trabajo en pantalla', () => {
  const perfil: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'l@example.test', name: 'Lab', roles: ['LAB'], platforms: ['web'], permissions: [{ code: 'laboratorio.ver_cola', context: 'global' }], channels: [], patientId: null, staffId: 's' };
  const rows = [
    order({ id: 'r1', patientName: 'María Rutina', createdAt: minutesAgo(30), doctorName: 'Dr. Ficticio Uno', patientRecord: '000102-1' }),
    order({ id: 'u1', patientName: 'Ulises Urgente', priority: 'urgente', createdAt: minutesAgo(10), items: [{ id: 'k', code: 'K', name: 'Potasio', result: { mark: 'critico_alto' } }], state: 'en_proceso' }),
  ];
  const montar = () => render(<LaboratoryPage api={{ request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api} profile={perfil} version={0} />);

  it('muestra al urgente primero y filtra mientras se escribe sin importar tildes', async () => {
    montar();
    const lista = await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    expect(within(lista).getAllByRole('button')[0].getAttribute('aria-label')).toContain('Ulises Urgente');
    await userEvent.type(screen.getByRole('searchbox'), 'maria');
    expect(within(lista).getAllByRole('button')).toHaveLength(1);
    expect(screen.getAllByText('Dr. Ficticio Uno', { exact: false }).length).toBeGreaterThan(0);
  });

  it('los chips filtran y «Quitar filtros» los limpia', async () => {
    montar();
    await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    await userEvent.click(screen.getByRole('button', { name: /^Con valores críticos/ }));
    expect(screen.getByText('1 de 2 órdenes', { exact: false })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(screen.getByText('2 de 2 órdenes', { exact: false })).toBeTruthy();
  });
});
