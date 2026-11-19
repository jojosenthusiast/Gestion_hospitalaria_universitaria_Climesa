import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';
import { CATEGORY_GROUPS, categorySections, groupOf } from '../features/listas/category-groups';
import { MyAccessPage, accessDays } from '../features/my-access';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const codes = ['cabeza_nervios', 'corazon', 'huesos', 'piel', 'digestivo', 'rinon_urinario', 'alergias', 'salud_mental', 'ojos', 'oido_garganta', 'consulta_general', 'ninos', 'mujer_embarazo', 'cirugia'];
const category = (code: string) => ({ code, name: `Motivo ${code}`, description: `Descripción ${code}`, icon: 'general', specialties: [], keywords: '' });

describe('Lote 5 S16 · «Pedir una cita» por grupos', () => {
  it('the 14 codes fall in the same five groups as Android; an unknown code goes to General', () => {
    expect(CATEGORY_GROUPS.map(g => g.title)).toEqual(['Cuerpo: cabeza, torso y extremidades', 'Interno y digestivo', 'Mente y emociones', 'Sentidos: vista, oído, nariz y garganta', 'General']);
    expect(codes.map(groupOf)).toEqual(['cuerpo', 'cuerpo', 'cuerpo', 'cuerpo', 'interno', 'interno', 'interno', 'mente', 'sentidos', 'sentidos', 'general', 'general', 'general', 'general']);
    expect(groupOf('nuevo_motivo')).toBe('general');
    const sections = categorySections([...codes, 'nuevo_motivo'].map(category));
    expect(sections.map(s => s.categories.length)).toEqual([4, 3, 1, 2, 5]);
    // Inside a group the server's order is kept; empty groups are left out.
    expect(categorySections([category('piel'), category('corazon')]).map(s => [s.id, s.categories.map(c => c.code)])).toEqual([['cuerpo', ['piel', 'corazon']]]);
  });

  it('the patient sees the reasons under group headings', async () => {
    const pac: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'pac@example.test', name: 'Paciente', roles: ['PAC'], platforms: ['web'], permissions: [{ code: 'citas.ver', context: 'propio' }, { code: 'citas.solicitar', context: 'propio' }], channels: [], patientId: 'p-1', staffId: null };
    const api = { request: vi.fn(async (path: string) => path === '/citas/categorias' ? codes.map(category) : path === '/citas' || path === '/citas/solicitudes-categoria' ? [] : (() => { throw new ApiError('x', 404); })()), write: vi.fn() };
    window.location.hash = '';
    render(<AppointmentsPage api={api as unknown as Api} profile={pac} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: /Pedir una cita/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Pedir una cita' });
    const senses = await within(dialog).findByRole('region', { name: 'Sentidos: vista, oído, nariz y garganta' });
    expect(within(senses).getAllByRole('button').map(b => b.textContent)).toEqual(['Motivo ojosDescripción ojos', 'Motivo oido_gargantaDescripción oido_garganta']);
    expect(within(dialog).getByRole('region', { name: 'Mente y emociones' })).toBeTruthy();
    expect(within(dialog).getByRole('heading', { name: 'General' })).toBeTruthy();
  });
});

describe('Lote 5 S16 · «Quién vio mi expediente» en web', () => {
  const now = new Date();
  const ago = (days: number, hour = 15) => { const d = new Date(now.valueOf() - days * 86_400_000); d.setUTCHours(hour, 30, 0, 0); return d.toISOString(); };
  const rows = [
    { fecha: ago(0), rol: 'Medicina', tipoDato: 'Consulta', motivo: 'atención' },
    { fecha: ago(2), rol: 'Laboratorio', tipoDato: 'Resultados de laboratorio', motivo: 'atención' },
    { fecha: ago(20), rol: 'Recepción', tipoDato: 'Ficha del paciente', motivo: 'acceso excepcional' },
  ];

  it('lists date, role, data type and reason by day; older days fold under one line', async () => {
    const api = { request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api;
    render(<MyAccessPage api={api} version={0} />);
    expect(await screen.findByRole('heading', { name: 'Quién vio mi expediente' })).toBeTruthy();
    expect(screen.getByText('Fecha, rol y motivo de cada consulta a tu información. No mostramos nombres del personal.')).toBeTruthy();
    expect(screen.getByText('Medicina')).toBeTruthy();
    expect(screen.getByText('Consulta · motivo: atención')).toBeTruthy();
    expect(screen.getByText('Resultados de laboratorio · motivo: atención')).toBeTruthy();
    expect(screen.queryByText('Recepción')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ver 1 consulta anterior' }));
    expect(screen.getByText('Ficha del paciente · motivo: acceso excepcional')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/me/accesos', expect.anything());
  });

  it('with no access says so in one line', async () => {
    render(<MyAccessPage api={{ request: vi.fn(async () => []), write: vi.fn() } as unknown as Api} version={0} />);
    expect(await screen.findByText('Nadie del personal ha consultado tu expediente todavía.')).toBeTruthy();
  });

  it('groups newest day first and skips rows without a date', () => {
    const days = accessDays([...rows, { fecha: '', rol: 'X', tipoDato: 'Y', motivo: 'Z' }], now);
    expect(days.map(d => d.older)).toEqual([false, false, true]);
    expect(days.flatMap(d => d.entries).map(e => e.rol)).toEqual(['Medicina', 'Laboratorio', 'Recepción']);
  });
});
