import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, roleNames, type AccessProfile, type Api } from '../lib/api';
import { roleIdentity, ROLE_CODES } from '../components/identity';
import { audienceRoles } from '../features/avisos/rules';
import { RoleChecks, invitableRoles, roleForType } from '../features/personal/account-forms';
import { Dashboard } from '../features/dashboards';
import { canonicalRole } from '../features/dashboards/roles';
import { HospitalizationPage } from '../features/hospitalization';
import { ALL_FLOORS, bedFloors, defaultFloor, floorsOf, onFloor } from '../features/hospitalization/floors';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const profile = (roles: string[], permissions: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'enf@example.test', name: 'Persona Ficticia', roles, platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: 'staff-1',
});

describe('Lote 5 S10 · Asistencia retirada en Enfermería', () => {
  it('AST is no longer a role in force; its name stays for history as «Asistencia (retirado)»', () => {
    expect(ROLE_CODES).not.toContain('AST');
    expect(roleNames.AST).toBe('Asistencia (retirado)');
    expect(roleIdentity('AST').label).toBe('Asistencia (retirado)');
  });

  it('notices can no longer aim at AST', () => {
    expect(audienceRoles).not.toContain('AST');
    expect(audienceRoles).toContain('ENF');
  });

  it('invitations never offer AST; an assistant in the directory is invited as Enfermería', () => {
    expect(invitableRoles(true)).not.toContain('AST');
    expect(roleForType.asistente).toBe('ENF');
    render(<RoleChecks selected={[]} onChange={() => undefined} allowAdmin invitation />);
    expect(screen.queryByText('Asistencia (retirado)')).toBeNull();
    expect(screen.getByText('Enfermería')).toBeTruthy();
  });

  it('an account that still holds AST sees it checked in its roles, so it can be moved to Enfermería', () => {
    render(<RoleChecks selected={['AST']} onChange={() => undefined} allowAdmin />);
    expect((screen.getByRole('checkbox', { name: /Asistencia \(retirado\)/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('without AST selected, editing roles does not offer it', () => {
    render(<RoleChecks selected={['ENF']} onChange={() => undefined} allowAdmin />);
    expect(screen.queryByText('Asistencia (retirado)')).toBeNull();
  });

  it('an account with the old AST role gets the Enfermería home, with the assistant station inside', async () => {
    expect(canonicalRole('AST')).toBe('ENF');
    expect(canonicalRole('MED')).toBe('MED');
    const api = { request: vi.fn(async () => []), write: vi.fn() } as unknown as Api;
    render(<Dashboard api={api} profile={profile(['AST'], ['camas.ver_tablero', 'admision.ver', 'fila.ver', 'fila.llamar'])} version={0} />);
    expect(await screen.findByRole('heading', { name: 'Mi planta' })).toBeTruthy();
    expect(await screen.findByRole('region', { name: 'Quién sigue' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Llamar siguiente/ })).toBeTruthy();
  });

  it('Enfermería without the queue permission does not show the assistant station', async () => {
    const api = { request: vi.fn(async () => []), write: vi.fn() } as unknown as Api;
    render(<Dashboard api={api} profile={profile(['ENF'], ['camas.ver_tablero', 'admision.ver'])} version={0} />);
    expect(await screen.findByRole('heading', { name: 'Mi planta' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Quién sigue' })).toBeNull();
  });
});

const base = { attendingDoctorName: 'Dra. Ficticia', attendingDoctorHasAccount: true, bedCategory: null, authorized: false, dischargeRequestedAt: null, discharge: null, origin: 'emergencia', requestedCategory: 'semiprivada', isolation: false, version: 1, allowedActions: [] };
const ward = [
  { ...base, id: 'a-1', patientId: 'p-1', patientName: 'Paciente Ficticio Sin Cama', state: 'pendiente_cama', bed: '' },
  { ...base, id: 'a-2', patientId: 'p-2', patientName: 'Paciente Ficticio Piso Dos', state: 'hospitalizado', bed: 'C-201' },
  { ...base, id: 'a-3', patientId: 'p-3', patientName: 'Paciente Ficticio Piso Tres', state: 'hospitalizado', bed: 'C-301' },
  { ...base, id: 'a-4', patientId: 'p-4', patientName: 'Paciente Ficticio Otro Dos', state: 'hospitalizado', bed: 'C-204' },
];
const beds = [{ code: 'C-201', level: 2 }, { code: 'C-204', level: 2 }, { code: 'C-301', level: 3 }];

function mountWard(shiftArea: string | null) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/admisiones') return ward;
      if (path === '/camas') return beds;
      if (path === '/me/turno-activo') return { required: true, active: true, shift: shiftArea ? { id: 't', start: '', end: '', area: shiftArea, state: 'publicado' } : null, next: null };
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(),
  };
  render(<HospitalizationPage api={api as unknown as Api} profile={profile(['ENF'], ['admision.ver', 'camas.ver_tablero'])} version={0} />);
}

describe('Lote 5 S10 · pisos en la vista de Enfermería', () => {
  it('floor rules: the own floor is the default, «Todos los pisos» otherwise, rows without a bed always show', () => {
    const floors = bedFloors(beds);
    expect(floorsOf(ward, floors)).toEqual([{ level: 2, patients: 2 }, { level: 3, patients: 1 }]);
    expect(defaultFloor('Planta 2', [2, 3])).toBe('2');
    expect(defaultFloor('Piso 3 · Medicina', [2, 3])).toBe('3');
    expect(defaultFloor('Planta 5', [2, 3])).toBe(ALL_FLOORS);
    expect(defaultFloor('Emergencia', [2, 3])).toBe(ALL_FLOORS);
    expect(onFloor(ward, floors, '3').map(r => r.id)).toEqual(['a-1', 'a-3']);
    expect(onFloor(ward, floors, ALL_FLOORS)).toHaveLength(4);
  });

  it('opens on the nurse\'s floor and «Todos los pisos» shows every patient: the floor is a filter, not a limit', async () => {
    mountWard('Planta 2');
    const piso2 = await screen.findByRole('button', { name: /Piso 2/ });
    expect(piso2.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Paciente Ficticio Piso Dos')).toBeTruthy();
    expect(screen.getByText('Paciente Ficticio Sin Cama')).toBeTruthy();
    expect(screen.queryByText('Paciente Ficticio Piso Tres')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Todos los pisos/ }));
    expect(screen.getByText('Paciente Ficticio Piso Tres')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Todos los pisos/ }).textContent).toContain('4');
  });

  it('without a shift floor it opens on «Todos los pisos»', async () => {
    mountWard(null);
    const all = await screen.findByRole('button', { name: /Todos los pisos/ });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Paciente Ficticio Piso Tres')).toBeTruthy();
  });
});
