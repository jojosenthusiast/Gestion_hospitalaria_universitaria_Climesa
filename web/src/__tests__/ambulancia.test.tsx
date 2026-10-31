import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { HospitalShell, modules } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
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
    render(<AmbulancePage api={apiWith(free)} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    expect(await screen.findByText('P-000-001')).toBeTruthy();
    expect(screen.getByText('Disponible')).toBeTruthy();
    expect(screen.getByText('Sin servicio activo')).toBeTruthy();
    expect(screen.getByText('Paramédico de turno')).toBeTruthy();
  });

  it('avisa cuando no hay paramédico de turno', async () => {
    render(<AmbulancePage api={apiWith({ ...free, unit: { ...free.unit, state: 'en_mantenimiento' }, paramedicOnDuty: false })} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    expect(await screen.findByText('En mantenimiento')).toBeTruthy();
    expect(screen.getByText('Sin paramédico con turno en curso')).toBeTruthy();
  });

  it('muestra el servicio activo con su tripulación y sin datos del paciente', async () => {
    const { container } = render(<AmbulancePage api={apiWith(serving)} profile={profile(['ambulancia.ver_estado'])} version={0} />);
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
    const view = render(<AmbulancePage api={api} profile={profile(['ambulancia.ver_estado'])} version={0} />);
    expect(await screen.findByText('Disponible')).toBeTruthy();
    view.rerender(<AmbulancePage api={api} profile={profile(['ambulancia.ver_estado'])} version={1} />);
    expect(await screen.findByText('En servicio')).toBeTruthy();
    expect(api.request).toHaveBeenCalledTimes(2);
    expect(api.request.mock.calls.every(c => c[0] === '/ambulancia')).toBe(true);
  });
});

describe('entrada de menú de la ambulancia', () => {
  beforeEach(() => { location.hash = '#/ambulancia'; });
  it('exige ambulancia.ver_estado y no depende del rol', () => {
    const entry = modules.find(m => m.id === 'ambulancia');
    expect(entry).toMatchObject({ permission: 'ambulancia.ver_estado', label: 'Ambulancia' });
    expect(entry).not.toHaveProperty('roles');
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
describe('mantenimiento de la unidad (POST /ambulancia/mantenimiento)', () => {
  const gestor = profile(['ambulancia.ver_estado', 'ambulancia.mantenimiento'], ['JOP']);
  const enMantenimiento: AmbulanceStatus = { ...free, unit: { ...free.unit, state: 'en_mantenimiento', version: 6 } };
  const conEscritura = (...answers: AmbulanceStatus[]) => { const api = apiWith(...answers); (api.write as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'unit-1', version: 7 }); return api; };

  it('sin ambulancia.mantenimiento no ofrece entrar ni salir de mantenimiento', async () => {
    render(<AmbulancePage api={apiWith(free)} profile={profile(['ambulancia.ver_estado'], ['REC'])} version={0} />);
    await screen.findByText('P-000-001');
    expect(screen.queryByRole('button', { name: /mantenimiento/i })).toBeNull();
  });

  it('con servicio activo no se ofrece, porque la API lo rechaza', async () => {
    render(<AmbulancePage api={apiWith(serving)} profile={gestor} version={0} />);
    await screen.findByText('En servicio');
    expect(screen.queryByRole('button', { name: /mantenimiento/i })).toBeNull();
  });

  it('pone la unidad en mantenimiento con versión y motivo de al menos 10 caracteres', async () => {
    const api = conEscritura(free);
    render(<AmbulancePage api={api} profile={gestor} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Poner en mantenimiento' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Poner en mantenimiento' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'corto');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Poner en mantenimiento' }));
    expect(within(dialogo).getByText(/al menos 10 caracteres/)).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), ' cambio de llantas programado');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Poner en mantenimiento' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/mantenimiento', { version: 3, inMaintenance: true, reason: 'corto cambio de llantas programado' }, 'POST');
  });

  it('saca la unidad de mantenimiento con inMaintenance=false', async () => {
    const api = conEscritura(enMantenimiento);
    render(<AmbulancePage api={api} profile={gestor} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sacar de mantenimiento' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Sacar de mantenimiento' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo'), 'revisión mecánica terminada');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Sacar de mantenimiento' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/mantenimiento', { version: 6, inMaintenance: false, reason: 'revisión mecánica terminada' }, 'POST');
  });

  it('sin paramédico de turno no deja salir de mantenimiento y lo explica', async () => {
    render(<AmbulancePage api={apiWith({ ...enMantenimiento, paramedicOnDuty: false })} profile={gestor} version={0} />);
    const boton = await screen.findByRole('button', { name: 'Sacar de mantenimiento' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Para sacar la unidad de mantenimiento debe haber un paramédico/)).toBeTruthy();
  });
});