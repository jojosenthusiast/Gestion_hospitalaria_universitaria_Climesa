import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Staff, UserAccount } from '../lib/api';
import { PersonnelPage } from '../features/personnel';
import { rowActionLabels, rowOf } from './row-actions';

// Owner observations 4, 5, 6 and 16 (odd/tasks/owner-obs-batch1.md, U1): one create flow, no stat cards, counts beside
// the filters, pages of 50, one column per idea and icon-only CRUD actions; the JOP view without accounts looks complete.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

const profile = (permissions: string[]): AccessProfile => ({
  id: 'adm-1', user: { id: 'adm-1' }, email: 'adm@example.test', name: 'Administración de prueba', roles: ['ADM'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const ADMIN = ['personal.ver', 'personal.gestionar', 'usuarios.ver', 'usuarios.invitar', 'usuarios.asignar_roles', 'usuarios.desactivar'];
const JOP = ['personal.ver', 'turnos.ver'];

const longName = 'María de los Ángeles Guadalupe Hernández Villalobos de la Cruz';
const valeria: Staff = { id: 's-0', givenNames: 'Valeria Sofía', surnames: 'Aguilar Campos', type: 'medico', specialty: 'Medicina interna', areaId: 'a-1', area: 'Emergencia', active: true, version: 2, shiftToday: 'de_turno' };
/** 63 active people: Valeria, one with a very long name, and 61 more; 9 of them have an account. */
const team: Staff[] = [
  valeria,
  { id: 's-1', givenNames: 'María de los Ángeles Guadalupe', surnames: 'Hernández Villalobos de la Cruz', type: 'enfermero', active: true, version: 1, shiftToday: 'libre' },
  ...Array.from({ length: 61 }, (_, i): Staff => ({ id: `s-${i + 2}`, givenNames: `Persona ${String(i + 2).padStart(2, '0')}`, surnames: 'Ficticia', type: i % 2 ? 'recepcionista' : 'asistente', active: true, version: 1, shiftToday: 'libre' })),
];
const valeriaAccount: UserAccount = { id: 'u-0', email: 'valeria.aguilar.campos.de.prueba@example.test', name: 'Valeria Sofía Aguilar Campos', roles: ['MED'], state: 'activo', version: 4, staffId: 's-0', allowedActions: ['roles', 'desactivar'] };
const accounts: UserAccount[] = [valeriaAccount, ...Array.from({ length: 8 }, (_, i): UserAccount => ({ id: `u-${i + 2}`, email: `p${i + 2}@example.test`, name: `Persona ${i + 2}`, roles: ['AST'], state: 'activo', version: 1, staffId: `s-${i + 2}`, allowedActions: ['roles', 'desactivar'] }))];

function mount(permissions: string[], options: { staff?: Staff[]; users?: UserAccount[] } = {}) {
  const api = {
    request: vi.fn(async (path: string): Promise<unknown> => (path === '/personal' ? options.staff ?? team : path === '/usuarios' ? options.users ?? accounts : [])),
    write: vi.fn(async () => ({ id: 's-99', version: 9 })),
  };
  render(<PersonnelPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
const bodyRows = () => screen.getAllByRole('row').slice(1);
const optionTexts = (label: string) => [...(screen.getByLabelText(label) as HTMLSelectElement).options].map(o => o.textContent);

describe('U1 · Personal: espacio y conteos (obs. 5)', () => {
  it('sin tarjetas de cifras: cada opción del filtro dice cuántas personas deja', async () => {
    mount(ADMIN);
    await screen.findByText('Aguilar Campos', { exact: false });
    expect(document.querySelector('.number-strip')).toBeNull();
    expect(screen.queryByText('Con cuenta de acceso')).toBeNull();
    expect(optionTexts('Cuenta de acceso')).toEqual(expect.arrayContaining(['Con o sin cuenta (63)', 'Con cuenta (9)', 'Sin cuenta todavía (54)']));
    expect(optionTexts('Mostrar')[0]).toBe('Personal activo (63)');
    expect(optionTexts('Función')).toEqual(expect.arrayContaining(['Médico (1)', 'Enfermería (1)']));
    // «Cuenta de acceso» and «Turno de hoy» share one compact row.
    const row = screen.getByLabelText('Cuenta de acceso').closest('.cl-filter-row')!;
    expect(within(row as HTMLElement).getByRole('group', { name: 'Turno de hoy' })).toBeTruthy();
  });

  it('muestra 50 por página con el rango, pasa a las siguientes y vuelve a la primera al filtrar', async () => {
    mount(ADMIN);
    await screen.findByText('Aguilar Campos', { exact: false });
    expect(screen.getAllByText('Mostrando 1–50 de 63 personas').length).toBeGreaterThan(0);
    expect(bodyRows()).toHaveLength(50);
    await userEvent.click(screen.getAllByRole('button', { name: 'Siguiente' })[0]);
    expect(screen.getAllByText('Mostrando 51–63 de 63 personas').length).toBeGreaterThan(0);
    expect(bodyRows()).toHaveLength(13);
    expect(screen.getAllByText('Página 2 de 2').length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText('Cuenta de acceso'), 'con');
    expect(screen.getByText('Mostrando 1–9 de 9 personas')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull();
  });
});

describe('U1 · Personal: tabla sin repeticiones (obs. 6)', () => {
  it('una columna por idea: especialidad rotulada, función con su chip, roles, cuenta con marca y correo legible', async () => {
    mount(ADMIN);
    const row = await rowOf('Valeria Sofía Aguilar Campos');
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Persona', 'Función', 'Roles de acceso', 'Área', 'Cuenta', 'Turno hoy', 'Acciones']);
    expect(within(row).getByText('Especialidad: Medicina interna')).toBeTruthy();
    expect(within(row).getByText('Médico').closest('.identity-chip')).toBeTruthy();
    expect(within(row).getByText('Medicina').closest('.identity-chip')).toBeTruthy();
    expect(within(row).getByRole('img', { name: 'Cuenta activa' })).toBeTruthy();
    expect(within(row).getByText(valeriaAccount.email)).toBeTruthy();
    expect(within(row).getByText('De turno ahora')).toBeTruthy();
    expect(within(row).queryByText('Activo')).toBeNull();
    // A long name is shown whole, and a person without specialty gets no placeholder line.
    const long = await rowOf(longName);
    expect(within(long).getByText(longName)).toBeTruthy();
    expect(within(long).queryByText(/Especialidad|Sin especialidad/)).toBeNull();
    expect(within(long).getByRole('img', { name: 'Sin cuenta' })).toBeTruthy();
  });

  it('acciones de icono: ver, editar (con los roles dentro) y desactivar; sin «Roles» aparte; dar acceso a quien no tiene cuenta', async () => {
    mount(ADMIN);
    await screen.findByText('Aguilar Campos', { exact: false });
    expect(await rowActionLabels('Valeria Sofía Aguilar Campos')).toEqual(['Ver ficha', 'Editar', 'Desactivar']);
    expect(await rowActionLabels(longName)).toEqual(['Ver ficha', 'Editar', 'Dar acceso a la app', 'Desactivar']);
    const view = within(await rowOf('Valeria Sofía Aguilar Campos')).getByRole('button', { name: 'Ver ficha' });
    expect(view.className).toMatch(/crud-view/);
    expect(view.textContent).toBe('');
  });

  it('editar guarda la ficha y, en el mismo acto, los roles de su cuenta con el mismo motivo', async () => {
    const api = mount(ADMIN);
    await userEvent.click(within(await rowOf('Valeria Sofía Aguilar Campos')).getByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar persona' });
    expect(within(dialog).getByText(valeriaAccount.email)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Operaciones/ }));
    await userEvent.type(within(dialog).getByLabelText('Motivo de la modificación'), 'Asume la jefatura de turno');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[0]).toEqual(['/personal/s-0', expect.objectContaining({ version: 2, reason: 'Asume la jefatura de turno' }), 'PATCH']);
    expect(api.write.mock.calls[1]).toEqual(['/usuarios/u-0/roles', { roles: ['MED', 'JOP'], staffId: 's-0', version: 4, reason: 'Asume la jefatura de turno' }, 'PATCH']);
  });

  it('desactivar a quien tiene cuenta desactiva la ficha y la cuenta, sin borrar nada', async () => {
    const api = mount(ADMIN);
    await userEvent.click(within(await rowOf('Valeria Sofía Aguilar Campos')).getByRole('button', { name: 'Desactivar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desactivar a Valeria Sofía Aguilar Campos' });
    expect(within(dialog).getByText(/no borra a nadie/)).toBeTruthy();
    expect((within(dialog).getByLabelText(/Desactivar también su cuenta de acceso/) as HTMLInputElement).checked).toBe(true);
    await userEvent.type(within(dialog).getByLabelText('Motivo'), 'Termina su contrato');
    await userEvent.click(within(dialog).getByRole('button', { name: /^Desactivar$/ }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[0]).toEqual(['/personal/s-0', expect.objectContaining({ active: false, version: 2, reason: 'Termina su contrato' }), 'PATCH']);
    expect(api.write.mock.calls[1]).toEqual(['/usuarios/u-0/estado', { state: 'desactivado', version: 4, reason: 'Termina su contrato' }, 'PATCH']);
  });
});

describe('U1 · Personal: un solo flujo de alta (obs. 4)', () => {
  it('agrega la ficha y su acceso con varios roles en un solo acto', async () => {
    const api = mount(ADMIN, { staff: [], users: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar personal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Agregar personal' });
    await userEvent.type(within(dialog).getByLabelText('Nombres'), 'Rosa');
    await userEvent.type(within(dialog).getByLabelText('Apellidos'), 'Prueba Ficticia');
    await userEvent.type(within(dialog).getByLabelText('Correo electrónico'), 'rosa@example.test');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Operaciones/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /Agregar e invitar/ }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[1]).toEqual(['/usuarios/invitaciones', { email: 'rosa@example.test', displayName: 'Rosa Prueba Ficticia', roles: ['MED', 'JOP'], staffId: 's-99' }, 'POST']);
  });

  it('quien solo invita (sin personal.gestionar) ve «Invitar persona» y «Dar acceso a la app», nunca editar la ficha', async () => {
    mount(['personal.ver', 'usuarios.ver', 'usuarios.invitar']);
    expect(await screen.findByRole('button', { name: 'Invitar persona' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agregar personal' })).toBeNull();
    expect(await rowActionLabels(longName)).toEqual(['Ver ficha', 'Dar acceso a la app']);
    expect(await rowActionLabels('Valeria Sofía Aguilar Campos')).toEqual(['Ver ficha']);
  });
});

describe('U1 · Personal en Jefatura de operaciones (obs. 16)', () => {
  it('sin usuarios.ver la vista está completa: función con chip de color e icono, sin «Sin cuenta» falso, solo lectura visible', async () => {
    const api = mount(JOP);
    const row = await rowOf('Valeria Sofía Aguilar Campos');
    expect(api.request).not.toHaveBeenCalledWith('/usuarios', expect.anything());
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Persona', 'Función', 'Área', 'Turno hoy', 'Acciones']);
    const chip = within(row).getByText('Médico').closest('.identity-chip')!;
    expect(chip.className).toMatch(/identity-tone-cyan/);
    expect(chip.querySelector('svg')).toBeTruthy();
    expect(screen.queryByText('Sin cuenta')).toBeNull();
    expect(screen.queryByLabelText('Cuenta de acceso')).toBeNull();
    expect(await rowActionLabels('Valeria Sofía Aguilar Campos')).toEqual(['Ver ficha']);
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Agregar personal|Invitar persona/ })).toBeNull();
  });
});
