import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { joinParts } from '../lib/format';
import { patientMeta } from '../features/patients';
import { LaboratoryPage } from '../features/laboratory';
import { StatusBadge } from '../components/system';
import { RowMenu } from '../components/row-menu';
import type { WorkOrder } from '../features/listas/lab-worklist';

afterEach(cleanup);

// Walkthrough in prod (2026-11-18): orphan «·», «Sin fecha» on every row, «Rutina» eating the lab card, grey «Urgente».
describe('separadores sin huérfanos', () => {
  it('joinParts only joins parts with text', () => {
    expect(joinParts('', '[DEMO] Solicitud de cita desde la app')).toBe('[DEMO] Solicitud de cita desde la app');
    expect(joinParts('Cardiología', null, undefined, false, '  ', 'hace 5 min')).toBe('Cardiología · hace 5 min');
    expect(joinParts('nota', '')).toBe('nota');
    expect(joinParts()).toBe('');
    expect(joinParts('Exp. 1', 34, 'F')).toBe('Exp. 1 · 34 · F');
  });
});

describe('Pacientes · segunda línea', () => {
  it('without birth nor age range shows only the sex, never «Sin fecha»', () => {
    expect(patientMeta({ birth: null, ageRange: null, sex: 'femenino' } as never)).toBe('Femenino');
  });
  it('keeps the age range or the birth date when the account sees them', () => {
    expect(patientMeta({ birth: null, ageRange: '30-39', sex: 'masculino' } as never)).toBe('30-39 años · Masculino');
    expect(patientMeta({ birth: '1990-05-04', ageRange: null, sex: 'femenino' } as never)).toMatch(/^4 may 1990 · \d+ años · Femenino$/);
  });
});

describe('prioridad con su insignia', () => {
  it('«urgente» passed as a status wears the priority badge, not a grey dot', () => {
    const { container } = render(<StatusBadge value="urgente" label="Urgente" />);
    const badge = container.firstElementChild!;
    expect(badge.className).toBe('priority-badge priority-urgente');
    expect(badge.querySelector('.status-dot')).toBeNull();
    expect(badge.textContent).toBe('Urgente');
  });
});

describe('Laboratorio · tarjeta de orden', () => {
  const NOW = Date.now();
  const order = (over: Partial<WorkOrder> & Record<string, unknown>) => ({ id: 'o', patientName: 'Paciente', priority: 'rutina', state: 'pendiente', version: 1, createdAt: new Date(NOW - 600_000).toISOString(), items: [], allowedActions: [], ...over });
  const perfil: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'l@example.test', name: 'Lab', roles: ['LAB'], platforms: ['web'], permissions: [{ code: 'laboratorio.ver_cola', context: 'global' }], channels: [], patientId: null } as unknown as AccessProfile;
  const rows = [
    order({ id: 'r1', patientName: 'Brenda Lisseth Castillo Cornejo', doctorName: 'Dra. Ficticia' }),
    order({ id: 'u1', patientName: 'Ulises Urgente', priority: 'urgente', state: 'en_proceso' }),
  ];

  it('routine has no tag; only urgent shows its badge, next to the name', async () => {
    render(<LaboratoryPage api={{ request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api} profile={perfil} version={0} />);
    const lista = await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    const routine = within(lista).getByRole('button', { name: /Brenda Lisseth/ });
    expect(routine.querySelector('.priority-badge')).toBeNull();
    expect(within(routine).queryByText('Rutina')).toBeNull();
    const urgent = within(lista).getByRole('button', { name: /Ulises Urgente/ });
    const badge = urgent.querySelector('.lab-row-name .priority-badge.priority-urgente');
    expect(badge?.textContent).toBe('Urgente');
  });

  it('the filter groups keep each label with its chips', async () => {
    render(<LaboratoryPage api={{ request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api} profile={perfil} version={0} />);
    await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    const groups = [...document.querySelectorAll('.cl-filter-group')];
    expect(groups.map(g => g.querySelector('.cl-filter-label')?.textContent)).toEqual(['Etapa', 'Prioridad', 'Valores']);
    expect(groups.every(g => g.querySelector('[role="group"]'))).toBe(true);
  });

  it('the detail shows the stage badge once', async () => {
    render(<LaboratoryPage api={{ request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api} profile={perfil} version={0} />);
    const lista = await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    await userEvent.click(within(lista).getByRole('button', { name: /Ulises Urgente/ }));
    const detail = await screen.findByRole('complementary', { name: /Detalle de la orden de Ulises Urgente/ });
    expect(within(detail.querySelector('header')!).getAllByText('En Proceso')).toHaveLength(1);
  });
});

describe('RowMenu', () => {
  it('shows the main action, folds two or more secondary ones under «Más acciones»', async () => {
    const calls: string[] = [];
    const act = (key: string) => ({ key, label: key, onClick: () => calls.push(key) });
    render(<RowMenu label="Paciente" actions={[act('Trasladar'), act('Solicitar alta'), act('Cancelar')]} />);
    expect(screen.getByRole('button', { name: /Trasladar/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Más acciones · Paciente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(calls).toEqual(['Cancelar']);
    expect(screen.queryByRole('button', { name: 'Solicitar alta' })).toBeNull();
  });
  it('a single secondary action is shown as is', () => {
    render(<RowMenu actions={[{ key: 'a', label: 'Asignar cama', onClick: () => {} }, { key: 'b', label: 'Cancelar admisión', onClick: () => {} }]} />);
    expect(screen.getByRole('button', { name: 'Cancelar admisión' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Más acciones/ })).toBeNull();
  });
});
