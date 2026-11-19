import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { NoticesPage } from '../features/avisos/NoticesPage';

// Owner obs. 22: audience grouped (Público, Roles, Áreas) with a plain «Lo verán» summary in the preview; obs. 10/22:
// published rows use the shared CRUD icon buttons and «Retirar aviso» confirms with the deactivate style.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const adm: AccessProfile = { id: 'adm', user: { id: 'adm' }, email: 'adm@example.test', name: 'Administración ficticia', roles: ['ADM'], platforms: ['web'], permissions: [{ code: 'avisos.publicar', context: 'x' }, { code: 'espacios.ver', context: 'x' }], channels: [], patientId: null, staffId: null } as unknown as AccessProfile;
const spaces = [{ id: 's-1', parentId: null, type: 'area', code: 'P1-HOS', name: 'Hospitalización', active: true, version: 1, path: 'P1-HOS', totalBeds: 0, freeBeds: 0 }];
const published = [{ id: 'a-1', titulo: 'Simulacro', cuerpo: 'Texto del aviso.', desde: '2026-11-14T12:00:00.000Z', hasta: '2099-11-20T12:00:00.000Z', prioridad: 'urgente', publico: false, roles: ['MED'], areas: [], publicadoEn: '2026-11-14T12:00:00.000Z', retiradoEn: null, motivoRetiro: null, estado: 'vigente', version: 3, allowedActions: ['editar', 'retirar'] }];

function mount() {
  const request = vi.fn(async (path: string) => {
    if (path === '/avisos') return published;
    if (path === '/avisos/estadisticas') return [];
    if (path === '/espacios') return spaces;
    if (path.startsWith('/avisos/alcance')) return { destinatarios: 7 };
    return { avisos: [], noLeidos: 0, criticos: 0, recordatorioHoras: 4 };
  });
  render(<NoticesPage api={{ request, write: vi.fn() } as unknown as Api} profile={adm} version={0} />);
}

describe('Avisos · composición y tabla (obs. 22)', () => {
  it('agrupa la audiencia y la vista previa dice quién lo verá, con el nombre del área', async () => {
    mount();
    await screen.findByLabelText('Título');
    const audience = screen.getByRole('group', { name: '¿Quién lo ve?' });
    for (const name of ['Público', /^Roles/, /^Áreas/]) expect(within(audience).getAllByRole('group', { name }).length).toBeGreaterThan(0);
    const preview = screen.getByRole('complementary', { name: 'Vista previa' });
    expect(within(preview).getByText('Pantalla pública y apps sin sesión')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: /Enfermería/ }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Hospitalización/ }));
    expect(within(preview).getByText('Roles: Enfermería')).toBeTruthy();
    expect(within(preview).getByText('Áreas: Hospitalización')).toBeTruthy();
    expect(await within(preview).findByText(/Llega a 7 personas/)).toBeTruthy();
    // The card does not repeat the audience line: the summary is the only place.
    expect(within(preview).queryByText(/^Para:/)).toBeNull();
  });

  it('editar y retirar son botones de ícono con su color, y «Retirar aviso» confirma con el de desactivar', async () => {
    mount();
    const row = (await screen.findByText('Simulacro')).closest('tr') as HTMLElement;
    const edit = within(row).getByRole('button', { name: 'Editar' }), withdraw = within(row).getByRole('button', { name: 'Retirar' });
    expect(edit.className).toContain('crud-edit');
    expect(edit.className).toContain('crud-icon');
    expect(withdraw.className).toContain('crud-deactivate');
    await userEvent.click(withdraw);
    const dialog = screen.getByRole('dialog', { name: 'Retirar aviso' });
    expect(within(dialog).getByRole('button', { name: 'Retirar aviso' }).className).toContain('crud-deactivate');
  });
});
