import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { Dashboard } from '../features/dashboards';
import { HospitalizationPage } from '../features/hospitalization';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

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

describe('Inicio · ambulancia por confirmar: el verbo dice lo que la persona puede hacer', () => {
  const montar = (rol: string, unit: string, dispatchBlock: unknown = null) => {
    const ambulancia = { unit: { id: 'u', plate: 'P-1', state: unit, version: 1 }, activeService: null, paramedicOnDuty: true, dispatchBlock, pendingRequests: [{ id: 'r1', reason: 'Caída en casa', address: 'Calle Ficticia 1', createdAt: hoy, channel: 'app', contactPhone: '7000-0000' }] };
    const api = { request: vi.fn(async (path: string) => path.split('?')[0] === '/ambulancia' ? ambulancia : []), write: vi.fn() } as unknown as Api;
    render(<Dashboard api={api} profile={perfil(rol)} version={0} />);
  };
  const accion = async () => { const fila = (await screen.findByText('Caída en casa')).closest('li') as HTMLElement; return within(fila).getByRole('link'); };

  it('REC puede despachar (permisos.csv) y con la unidad disponible ve «Despachar»', async () => {
    expect(permisosDe('REC').some(p => p.code === 'ambulancia.despachar')).toBe(true);
    montar('REC', 'disponible');
    expect((await accion()).textContent).toBe('Despachar');
  });

  it('con la unidad en servicio el despacho está bloqueado: la fila dice «Ver solicitud»', async () => {
    montar('REC', 'en_servicio', { code: 'en_servicio', message: 'La unidad está en un servicio.', action: '' });
    expect((await accion()).textContent).toBe('Ver solicitud');
  });
});

describe('Asignar cama · la lista de camas se pliega', () => {
  // S27: the suggestions are room cards now; the first 8 rooms show in their order and the rest fold behind «Ver N más».
  it('muestra las 8 primeras habitaciones sugeridas en su orden y pliega el resto con «Ver N más»', async () => {
    const beds = Array.from({ length: 14 }, (_, i) => ({ id: `b-${i}`, version: 1, code: `C-${200 + i}`, room: `H-${200 + i}`, category: 'semiprivada', reason: 'habitación vacía' }));
    const admission = { id: 'a-1', patientId: 'p', patientName: 'Paciente Ficticio Uno', origin: 'directa', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: false, bed: '', version: 1, allowedActions: ['asignar_cama'], createdAt: hoy };
    const api = { request: vi.fn(async (path: string) => path === '/admisiones' ? [admission] : path.startsWith('/admisiones/a-1/sugerencias-cama') ? beds : []), write: vi.fn(async () => ({})) } as unknown as Api;
    render(<HospitalizationPage api={api} profile={perfil('JOP')} version={0} />);
    const fila = (await screen.findByText('Paciente Ficticio Uno')).closest('tr, li, article') as HTMLElement;
    await userEvent.click(within(fila).getByRole('button', { name: /Asignar cama/ }));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText(/C-200/);
    expect(within(dialog).getAllByRole('radio').map(r => (r as HTMLInputElement).value)).toEqual(['b-0', 'b-1', 'b-2', 'b-3', 'b-4', 'b-5', 'b-6', 'b-7']);
    expect(within(dialog).getByLabelText(/C-200/)).toHaveProperty('checked', true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ver 6 más' }));
    expect(within(dialog).getAllByRole('radio')).toHaveLength(14);
  });
});
