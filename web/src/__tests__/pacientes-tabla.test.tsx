import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Patient } from '../lib/api';
import { PatientsPage } from '../features/patients';

// Owner obs. 15: the patients list is a table with a header row, the chosen row stays highlighted and its record comes
// into view, and a list longer than one page (50) says where it is and pages through the rest.
const scrolled = vi.fn();
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  scrolled.mockClear();
  Element.prototype.scrollIntoView = scrolled;
});
afterEach(() => { cleanup(); location.hash = ''; });

const perfil = (permissions: string[], roles = ['REC']): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'x@example.test', name: 'Cuenta', roles, platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null });
const rec = perfil(['pacientes.buscar', 'pacientes.ver_ficha', 'pacientes.registrar']);
const jop = perfil(['pacientes.buscar', 'pacientes.ver_ficha'], ['JOP']);
const year = new Date().getFullYear();
const p = (id: string, fullName: string, over: Partial<Patient> = {}): Patient => ({ id, record: `EXP-${id.padStart(6, '0')}`, fullName, givenNames: fullName, surnames: '', state: 'activo', active: true, sex: 'femenino', birth: `${year - 30}-01-02`, version: 1, ...over });
const many = (from: number, count: number) => Array.from({ length: count }, (_, i) => p(String(from + i), `Paciente Ficticio ${String(from + i).padStart(3, '0')}`));

function mount(profile: AccessProfile, pages: (offset: number) => Patient[]) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path.startsWith('/pacientes?')) return pages(Number(new URLSearchParams(path.split('?')[1]).get('offset') ?? '0'));
      const id = path.split('/')[2];
      return { ...pages(0).find(x => x.id === id) ?? pages(50).find(x => x.id === id), dui: '00000000-0' };
    }),
    write: vi.fn(),
  };
  render(<PatientsPage api={api as unknown as Api} profile={profile} version={0} />);
  return api;
}

describe('Pacientes · tabla (obs. 15)', () => {
  it('tiene encabezados Nombre, Expediente, Edad y Sexo, y una fila por paciente', async () => {
    mount(rec, () => [p('1', 'Ana Ficticia', { sex: 'femenino' }), p('2', 'Bruno Ficticio', { sex: 'masculino', state: 'inactivo', active: false })]);
    const table = await screen.findByRole('table', { name: 'Pacientes encontrados' });
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Nombre', 'Expediente', 'Edad', 'Sexo']);
    const bruno = within(table).getAllByRole('row').find(r => r.textContent?.includes('Bruno Ficticio'))!;
    expect(within(bruno).getByText('EXP-000002')).toBeTruthy();
    expect(within(bruno).getByText('30 años')).toBeTruthy();
    expect(within(bruno).getByText('Masculino')).toBeTruthy();
    expect(within(bruno).getByText('Inactivo')).toBeTruthy();
  });

  it('sin fecha de nacimiento para la cuenta (Jefatura) no hay columna Edad vacía', async () => {
    mount(jop, () => [p('1', 'Ana Ficticia', { birth: undefined })]);
    const table = await screen.findByRole('table', { name: 'Pacientes encontrados' });
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Nombre', 'Expediente', 'Sexo']);
  });

  it('elegir un paciente resalta su fila y trae la ficha a la vista', async () => {
    mount(rec, () => many(1, 30));
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir ficha de Paciente Ficticio 030' }));
    const row = screen.getAllByRole('row').find(r => r.textContent?.includes('Paciente Ficticio 030'))!;
    expect(row.className).toContain('is-selected');
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('complementary', { name: 'Ficha de paciente' })).toBeTruthy();
    expect(scrolled).toHaveBeenCalled();
    expect(screen.getAllByRole('row').filter(r => r.className.includes('is-selected'))).toHaveLength(1);
  });

  it('con 50 o más dice cuáles muestra y pasa a los siguientes 50 con offset', async () => {
    const api = mount(rec, offset => offset === 0 ? many(1, 50) : offset === 50 ? many(51, 7) : []);
    expect(await screen.findByText(/Mostrando 1–50/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anteriores 50' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Siguientes 50' }));
    expect(await screen.findByText('Mostrando 51–57')).toBeTruthy();
    expect(api.request.mock.calls.map(c => c[0])).toContain('/pacientes?limit=50&offset=50&estado=vigente');
    expect(screen.queryByRole('button', { name: 'Siguientes 50' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Anteriores 50' }));
    expect(await screen.findByText(/Mostrando 1–50/)).toBeTruthy();
  });

  it('una lista corta no muestra paginación', async () => {
    mount(rec, () => many(1, 3));
    await screen.findByRole('table', { name: 'Pacientes encontrados' });
    expect(screen.queryByText(/Mostrando/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Siguientes/ })).toBeNull();
  });
});
