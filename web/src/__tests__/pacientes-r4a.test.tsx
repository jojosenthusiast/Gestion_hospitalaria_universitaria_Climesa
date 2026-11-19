import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Patient } from '../lib/api';
import { PatientsPage } from '../features/patients';

// R4a (list + detail): the search comes first, filters live in one «Filtros» popover with a count, the list title
// says how it is sorted, the empty detail column collapses, and «Inactivar» does not weigh like a normal action.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const perfil: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'rec@example.test', name: 'Recepción', roles: ['REC'], platforms: ['web'],
  permissions: ['pacientes.buscar', 'pacientes.ver_ficha', 'pacientes.registrar', 'pacientes.editar_demograficos', 'admision.ver', 'fila.ver'].map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null };
const year = new Date().getFullYear();
const p = (id: string, fullName: string, over: Partial<Patient> = {}): Patient => ({ id, record: `EXP-00000${id}`, fullName, givenNames: fullName, surnames: '', state: 'activo', active: true, sex: 'femenino', birth: `${year - 1}-01-02`, version: 1, matchReason: 'Listado sin criterio de búsqueda', ...over });
const lista = [p('1', 'Ana Ficticia'), p('2', 'Berta Ficticia')];
function montar() {
  const api = { request: vi.fn(async (path: string) => path.startsWith('/pacientes/1') ? lista[0] : lista), write: vi.fn() };
  const view = render(<PatientsPage api={api as unknown as Api} profile={perfil} version={0} />);
  return { api, ...view };
}

describe('Pacientes · lista y ficha (R4a)', () => {
  it('la búsqueda va primero y los filtros viven en un solo botón «Filtros» con su cuenta', async () => {
    const { container } = montar();
    await screen.findByText('Ana Ficticia');
    const search = screen.getByLabelText(/Nombre, DUI o expediente/);
    const filtros = screen.getByRole('button', { name: /^Filtros/ });
    expect(search.compareDocumentPosition(filtros) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Estado del expediente' })).toBeNull();
    await userEvent.click(filtros);
    await userEvent.click(within(screen.getByRole('group', { name: 'Estado del expediente' })).getAllByRole('button')[1]);
    expect(screen.getByRole('button', { name: /^Filtros · 1 activo/ })).toBeTruthy();
    expect(container.querySelectorAll('.cl-filter-row').length).toBe(0);
  });

  it('sin búsqueda no imprime el motivo «Listado sin criterio de búsqueda»', async () => {
    montar();
    await screen.findByText('Ana Ficticia');
    expect(screen.queryByText('Listado sin criterio de búsqueda')).toBeNull();
  });

  it('el título dice el orden real de la lista (por nombre), no «recientes»', async () => {
    montar();
    await screen.findByText('Ana Ficticia');
    expect(screen.queryByText('Expedientes recientes')).toBeNull();
    expect(screen.getByText(/por nombre/)).toBeTruthy();
  });

  it('sin paciente elegido no hay columna de detalle vacía ni frase de ayuda', async () => {
    const { container } = montar();
    await screen.findByText('Ana Ficticia');
    expect(container.querySelector('.cl-detail')).toBeNull();
    expect(screen.queryByText(/Elige un paciente de la lista/)).toBeNull();
    expect(screen.queryByText(/Para registrar a alguien nuevo/)).toBeNull();
  });

  it('«1 año», nunca «1 años»', async () => {
    montar();
    expect((await screen.findAllByText(/^1 año$/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\b1 años/)).toBeNull();
  });

  it('«Inactivar» no pesa igual que «Editar datos»', async () => {
    montar();
    await userEvent.click(await screen.findByRole('button', { name: /Abrir ficha de Ana Ficticia/ }));
    const editar = await screen.findByRole('button', { name: 'Editar datos' });
    const inactivar = screen.getByRole('button', { name: 'Inactivar paciente' });
    // S0: one color and symbol per CRUD verb: edit is the blue pencil, inactivate the red trash.
    expect(editar.className).toContain('crud-edit');
    expect(inactivar.className).toContain('crud-deactivate');
    expect(inactivar.className).not.toContain('crud-edit');
  });
});
