import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LoginView } from '../components/ui';
import { Dialog, Select, Tag } from '../features/common';
import { HospitalShell } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

describe('ruta inexistente (W-09)', () => {
  const profile: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'jop@example.test', name: 'Jefatura', roles: ['JOP'], platforms: ['web'], permissions: [{ code: 'pacientes.buscar', context: 'x' }], channels: [], patientId: null, staffId: null };
  const api = { request: vi.fn(() => new Promise(() => undefined)), write: vi.fn() } as unknown as Api;

  it('una ruta que no existe dice "Página no encontrada"', () => {
    location.hash = '#/noexiste';
    render(<HospitalShell api={api} profile={profile} onLogout={() => undefined} />);
    expect(screen.getByRole('heading', { name: /Página no encontrada/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Sin permiso/ })).toBeNull();
  });

  it('una ruta que existe pero no corresponde al permiso vuelve a Inicio en lugar de quedarse en "Sin permiso"', () => {
    location.hash = '#/personal';
    render(<HospitalShell api={api} profile={profile} onLogout={() => undefined} />);
    expect(screen.queryByRole('heading', { name: /Sin permiso/ })).toBeNull();
    expect(location.hash).toBe('#/inicio');
    expect(screen.getByText('CLIMESA / Inicio')).toBeTruthy();
  });
});

