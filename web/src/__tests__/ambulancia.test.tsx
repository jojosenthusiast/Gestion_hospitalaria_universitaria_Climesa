import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { HospitalShell, modules } from '../features/shell';

afterEach(() => { cleanup(); location.hash = ''; });

const profile = (permissions: string[], roles = ['REC']): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'staff@example.test', name: 'Personal de prueba', roles, platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const free: AmbulanceStatus = {
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 3 }, activeService: null, paramedicOnDuty: true,
};
const serving: AmbulanceStatus = {
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'en_servicio', version: 4 },
  activeService: {
    id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Calle ficticia 1', destination: 'Hospital CLIMESA',
    dispatchedAt: '2026-11-10T17:00:00.000Z', crew: [{ staffId: 'p-1', role: 'paramedico', name: 'Persona Ficticia A' }],
  },
  paramedicOnDuty: true,
};
const apiWith = (...answers: AmbulanceStatus[]) => {
  const request = vi.fn();
  answers.forEach(a => request.mockResolvedValueOnce(a));
  request.mockResolvedValue(answers.at(-1));
  return { request, write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
};

describe('estado de la ambulancia (W18 mínima)', () => {
  it('muestra la unidad disponible sin servicio activo', async () => {
    render(<AmbulancePage api={apiWith(free)} version={0} />);
    expect(await screen.findByText('P-000-001')).toBeTruthy();
    expect(screen.getByText('Disponible')).toBeTruthy();
    expect(screen.getByText('Sin servicio activo')).toBeTruthy();
    expect(screen.getByText('Paramédico de turno')).toBeTruthy();
  });

  it('avisa cuando no hay paramédico de turno', async () => {
    render(<AmbulancePage api={apiWith({ ...free, unit: { ...free.unit, state: 'en_mantenimiento' }, paramedicOnDuty: false })} version={0} />);
    expect(await screen.findByText('En mantenimiento')).toBeTruthy();
    expect(screen.getByText('Sin paramédico con turno en curso')).toBeTruthy();
  });

  it('muestra el servicio activo con su tripulación y sin datos del paciente', async () => {
    const { container } = render(<AmbulancePage api={apiWith(serving)} version={0} />);
    const card = await screen.findByRole('region', { name: 'Servicio activo' });
    expect(screen.getByText('En servicio')).toBeTruthy();
    expect(within(card).getByText('Calle ficticia 1')).toBeTruthy();
    expect(within(card).getByText('Hospital CLIMESA')).toBeTruthy();
    expect(within(card).getByText('Roja')).toBeTruthy();
    expect(within(card).getByText(/Persona Ficticia A/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/paciente/i);
  });

  it('se actualiza sola cuando cambia la versión del canal en vivo', async () => {
    const api = apiWith(free, serving);
    const view = render(<AmbulancePage api={api} version={0} />);
    expect(await screen.findByText('Disponible')).toBeTruthy();
    view.rerender(<AmbulancePage api={api} version={1} />);
    expect(await screen.findByText('En servicio')).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request.mock.calls.every(c => c[0] === '/ambulancia')).toBe(true);
  });
});

describe('entrada de menú de la ambulancia', () => {
  beforeEach(() => { location.hash = '#/ambulancia'; });
  it('exige ambulancia.ver_estado y la reservan Operaciones y Recepción', () => {
    const entry = modules.find(m => m.id === 'ambulancia');
    expect(entry).toMatchObject({ permission: 'ambulancia.ver_estado', label: 'Ambulancia' });
    expect([...entry!.roles].sort()).toEqual(['JOP', 'REC']);
  });

  it('con el permiso aparece en el menú y abre la pantalla', async () => {
    render(<HospitalShell api={apiWith(free)} profile={profile(['ambulancia.ver_estado'])} onLogout={() => undefined} />);
    expect(screen.getByRole('link', { name: 'Ambulancia' })).toBeTruthy();
    expect(await screen.findByText('P-000-001')).toBeTruthy();
  });

  it('sin el permiso no aparece y la ruta queda restringida', () => {
    const api = apiWith(free);
    render(<HospitalShell api={api} profile={profile(['pacientes.buscar'])} onLogout={() => undefined} />);
    expect(screen.queryByRole('link', { name: 'Ambulancia' })).toBeNull();
    expect(screen.getByText('Sin permiso')).toBeTruthy();
    expect(api.request).not.toHaveBeenCalled();
  });
});