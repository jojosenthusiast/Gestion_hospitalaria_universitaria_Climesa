import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { NoticesPage } from '../features/notices';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const jop: AccessProfile = { id: 'jop', user: { id: 'jop' }, email: 'jop@example.test', name: 'Jefatura', roles: ['JOP'], platforms: ['web'], permissions: [{ code: 'avisos.publicar', context: 'x' }], channels: [], patientId: null, staffId: null } as unknown as AccessProfile;
const base = { cuerpo: 'Texto del aviso.', desde: '2026-11-14T12:00:00.000Z', hasta: '2099-11-20T12:00:00.000Z', prioridad: 'atencion', publico: true, roles: [], publicadoEn: '2026-11-14T12:00:00.000Z', retiradoEn: null, motivoRetiro: null };
const rows = [
  { ...base, id: 'a-1', titulo: 'Simulacro', prioridad: 'urgente', publico: false, roles: ['MED'], estado: 'vigente', version: 3, allowedActions: ['editar', 'retirar'] },
  { ...base, id: 'a-2', titulo: 'Aviso viejo', hasta: '2026-11-15T12:00:00.000Z', estado: 'vencido', version: 1, allowedActions: [] },
  { ...base, id: 'a-3', titulo: 'Aviso retirado', estado: 'retirado', version: 2, allowedActions: [], retiradoEn: '2026-11-14T13:00:00.000Z', motivoRetiro: 'Se publicó con la planta equivocada.' },
];
const apiDe = () => ({ request: vi.fn(async () => rows), write: vi.fn() });
const row = async (title: string) => (await screen.findByText(title)).closest('tr') as HTMLElement;

describe('MA-AVI-02 · editar y retirar avisos en la web', () => {
  it('solo ofrece editar y retirar donde el servidor lo acepta', async () => {
    render(<NoticesPage api={apiDe() as unknown as Api} profile={jop} version={0} />);
    expect(within(await row('Simulacro')).getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(within(await row('Simulacro')).getByRole('button', { name: 'Retirar' })).toBeTruthy();
    expect(within(await row('Aviso viejo')).queryByRole('button', { name: 'Editar' })).toBeNull();
    const retired = await row('Aviso retirado');
    expect(within(retired).queryByRole('button', { name: 'Retirar' })).toBeNull();
    expect(within(retired).getByText('Retirado')).toBeTruthy();
    expect(within(retired).getByText(/Se publicó con la planta equivocada/)).toBeTruthy();
  });

  it('editar carga el aviso en el formulario y guarda con su versión', async () => {
    const api = apiDe();
    api.write.mockResolvedValue({ id: 'a-1' });
    render(<NoticesPage api={api as unknown as Api} profile={jop} version={0} />);
    await userEvent.click(within(await row('Simulacro')).getByRole('button', { name: 'Editar' }));
    const title = screen.getByLabelText('Título') as HTMLInputElement;
    expect(title.value).toBe('Simulacro');
    expect((screen.getByLabelText('Medicina') as HTMLInputElement).checked).toBe(true);
    await userEvent.clear(title);
    await userEvent.type(title, 'Simulacro movido');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(1));
    const [path, body, method] = api.write.mock.calls[0];
    expect(path).toBe('/avisos/a-1');
    expect(method).toBe('PUT');
    expect(body).toEqual(expect.objectContaining({ version: 3, titulo: 'Simulacro movido', prioridad: 'urgente', publico: false, roles: ['MED'] }));
    expect(body).not.toHaveProperty('desde');
    expect(await screen.findByText(/Cambios guardados/)).toBeTruthy();
  });

  it('si otra persona lo cambió, ofrece recargar en lugar de pisarlo', async () => {
    const api = apiDe();
    api.write.mockRejectedValue(new ApiError('El aviso cambió mientras lo editabas.', 409, 'version_conflicto'));
    render(<NoticesPage api={api as unknown as Api} profile={jop} version={0} />);
    await userEvent.click(within(await row('Simulacro')).getByRole('button', { name: 'Editar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('button', { name: 'Cerrar y recargar' })).toBeTruthy();
  });

  it('retirar pide un motivo de 10 caracteres o más y envía la versión', async () => {
    const api = apiDe();
    api.write.mockResolvedValue({ id: 'a-1' });
    render(<NoticesPage api={api as unknown as Api} profile={jop} version={0} />);
    await userEvent.click(within(await row('Simulacro')).getByRole('button', { name: 'Retirar' }));
    const dialog = screen.getByRole('dialog', { name: 'Retirar aviso' });
    const confirm = within(dialog).getByRole('button', { name: 'Retirar aviso' }) as HTMLButtonElement;
    await userEvent.type(within(dialog).getByLabelText('Motivo del retiro'), 'corto');
    expect(confirm.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText('Motivo del retiro'), ' pero ahora suficiente');
    await userEvent.click(confirm);
    await waitFor(() => expect(api.write).toHaveBeenCalledWith('/avisos/a-1/retirar', { version: 3, motivo: 'corto pero ahora suficiente' }, 'POST'));
  });
});
