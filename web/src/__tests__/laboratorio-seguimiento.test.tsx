import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LaboratoryPage } from '../features/laboratory';
import { EXTERNAL_INSTRUCTIONS_TEMPLATE, attachmentMimeType, attachmentProblem, groupLabOrders, labGroupOf } from '../lib/lab-flow';

// Fase 2, flujo C (S10): lista agrupada, completar por lote, observación relevante y orden externa con su informe.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const perfil: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'lab@example.test', name: 'Lab', roles: ['LAB'], platforms: ['web'], permissions: ['laboratorio.ver_cola', 'laboratorio.procesar', 'laboratorio.validar'].map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: 's' };
const base = { priority: 'rutina', createdAt: new Date(Date.now() - 20 * 60_000).toISOString() };
const item = (result: unknown = null) => ({ id: 'i-1', code: 'HB', name: 'Hemoglobina', unit: 'g/dL', resultType: 'numerico', result });
const order = (id: string, name: string, state: string, over: Record<string, unknown> = {}) => ({ ...base, id, patientName: name, state, version: 3, items: [item()], allowedActions: [], ...over });

function montar(rows: unknown[]) {
  const api = { request: vi.fn(async (path: string) => path.startsWith('/laboratorio/ordenes/') ? { attachments: [] } : rows), write: vi.fn(async () => ({})) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<LaboratoryPage api={api} profile={perfil} version={0} />);
  return api;
}

describe('reglas de la lista agrupada y del adjunto', () => {
  it('agrupa por lo que toca hacer y deja lo cerrado plegado al final', () => {
    expect(labGroupOf({ state: 'pendiente', external: true })).toBe('externa');
    expect(labGroupOf({ state: 'pendiente' })).toBe('muestra');
    const groups = groupLabOrders([{ state: 'completado', reviewedAt: 'x' }, { state: 'pendiente' }, { state: 'en_proceso' }]);
    expect(groups.map(g => [g.id, g.folded])).toEqual([['en_proceso', false], ['muestra', false], ['liberada', true]]);
  });
  it('el informe externo debe ser PDF o foto de hasta 10 MB', () => {
    expect(attachmentProblem(null)).toMatch(/Adjunta/);
    expect(attachmentProblem({ name: 'a.zip', type: 'application/zip', size: 10 })).toMatch(/PDF o una foto/);
    expect(attachmentProblem({ name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(attachmentProblem({ name: 'a.jpg', type: 'image/jpeg', size: 2048 })).toBeNull();
  });
  // Auditoría T15: Chrome y Firefox en Windows entregan una foto HEIC sin tipo; cuenta la extensión.
  it('sin tipo del navegador, el tipo sale de la extensión del archivo', () => {
    expect(attachmentProblem({ name: 'Foto.HEIC', type: '', size: 2048 })).toBeNull();
    expect(attachmentProblem({ name: 'foto.heif', type: '', size: 2048 })).toBeNull();
    expect(attachmentProblem({ name: 'informe', type: '', size: 2048 })).toMatch(/PDF o una foto/);
    expect(attachmentProblem({ name: 'informe.docx', type: '', size: 2048 })).toMatch(/PDF o una foto/);
    expect([['a.pdf', 'application/pdf'], ['a.jpg', 'image/jpeg'], ['a.JPEG', 'image/jpeg'], ['a.png', 'image/png'], ['a.heic', 'image/heic'], ['a.heif', 'image/heic'], ['a.webp', 'image/webp']]
      .map(([name]) => [name, attachmentMimeType({ name, type: '' })])).toEqual([['a.pdf', 'application/pdf'], ['a.jpg', 'image/jpeg'], ['a.JPEG', 'image/jpeg'], ['a.png', 'image/png'], ['a.heic', 'image/heic'], ['a.heif', 'image/heic'], ['a.webp', 'image/webp']]);
    expect(attachmentMimeType({ name: 'a.zip', type: 'application/zip' })).toBeNull();
    expect(attachmentMimeType({ name: 'a.bin', type: 'image/png' })).toBe('image/png');
  });
});

describe('Laboratorio · flujo C en pantalla', () => {
  it('muestra la lista agrupada; las liberadas empiezan plegadas y se abren a pedido', async () => {
    montar([order('a', 'Ana En Proceso', 'en_proceso'), order('b', 'Beto Pendiente', 'pendiente'), order('c', 'Carla Liberada', 'completado', { reviewedAt: '2026-11-13T17:00:00Z', items: [item({ value: 13, mark: 'normal', version: 1 })] })]);
    const lista = await screen.findByRole('list', { name: 'Órdenes de laboratorio' });
    expect(within(lista).getAllByRole('heading').map(h => h.textContent)).toEqual(['En proceso', 'Por tomar muestra', 'Liberadas']);
    expect(within(lista).queryByText('Carla Liberada')).toBeNull();
    await userEvent.click(within(lista).getByRole('button', { name: 'Mostrar liberadas' }));
    expect(within(lista).getByText('Carla Liberada')).toBeTruthy();
  });

  it('completa por lote las órdenes listas, cada una con su versión', async () => {
    const ready = (id: string, name: string, version: number) => order(id, name, 'en_proceso', { version, allowedActions: ['capturar', 'completar'], items: [item({ value: 13, mark: 'normal', version: 1 })] });
    const api = montar([ready('a', 'Ana Lista', 4), ready('b', 'Beto Listo', 7)]);
    const lote = await screen.findByRole('group', { name: 'Completar por lote' });
    await userEvent.click(within(lote).getByRole('button', { name: 'Seleccionar todas' }));
    await userEvent.click(within(lote).getByRole('button', { name: 'Completar 2 seleccionadas' }));
    expect(api.write).toHaveBeenCalledWith('/laboratorio/ordenes/a/completar', { version: 4 }, 'POST');
    expect(api.write).toHaveBeenCalledWith('/laboratorio/ordenes/b/completar', { version: 7 }, 'POST');
    expect(await screen.findByText('Se completaron 2 órdenes.')).toBeTruthy();
  });

  it('una observación marcada como relevante viaja con el resultado', async () => {
    const api = montar([order('a', 'Ana Captura', 'en_proceso', { allowedActions: ['capturar'] })]);
    await userEvent.type(await screen.findByLabelText('Valor'), '13.4');
    const relevante = screen.getByRole('checkbox', { name: /Es relevante/ }) as HTMLInputElement;
    expect(relevante.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Observación (opcional)'), 'Muestra hemolizada');
    await userEvent.click(relevante);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar resultado' }));
    expect(api.write).toHaveBeenCalledWith('/laboratorio/ordenes/a/resultados', { orderItemId: 'i-1', version: 3, value: 13.4, observation: 'Muestra hemolizada', relevant: true }, 'POST');
  });

  it('envía a externo una orden pendiente con el lugar y las instrucciones para el paciente', async () => {
    const api = montar([order('a', 'Ana Externa', 'pendiente', { allowedActions: ['tomar_muestra'], externalActions: ['enviar_externo'] })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Se realiza en otro sitio' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Examen en otro sitio' });
    await userEvent.type(within(dialogo).getByLabelText('Dónde se realiza'), 'Clínica Ficticia de Imágenes');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar a externo' }));
    expect(api.write).toHaveBeenCalledWith('/laboratorio/ordenes/a/externa', { version: 3, place: 'Clínica Ficticia de Imágenes', instructions: EXTERNAL_INSTRUCTIONS_TEMPLATE }, 'POST');
  });

  it('una orden externa dice dónde y qué hacer, y su informe entra con adjunto y valores clave', async () => {
    const api = montar([order('a', 'Ana Externa', 'pendiente', { external: true, externalPlace: 'Clínica Ficticia', externalInstructions: 'Sin ayuno. Traiga su DUI.', externalActions: ['cargar_externo'] })]);
    expect(await screen.findByText(/Se realiza en otro sitio: Clínica Ficticia/)).toBeTruthy();
    expect(screen.getByText('Sin ayuno. Traiga su DUI.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tomar muestra' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Cargar resultado externo' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cargar resultado externo' });
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar resultado' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    await userEvent.upload(within(dialogo).getByLabelText(/Informe \(PDF o foto/), new File(['%PDF-1.4 ficticio'], 'informe.pdf', { type: 'application/pdf' }));
    await userEvent.type(within(dialogo).getByLabelText('Hemoglobina (g/dL)'), '12.9');
    await userEvent.click(guardar);
    await vi.waitFor(() => expect(api.write).toHaveBeenCalled());
    const [path, body] = api.write.mock.calls[0] as [string, { version: number; attachment: Record<string, unknown>; results: unknown[] }];
    expect(path).toBe('/laboratorio/ordenes/a/resultado-externo');
    expect(body.version).toBe(3);
    expect(body.attachment).toMatchObject({ fileName: 'informe.pdf', mimeType: 'application/pdf', sizeBytes: 17 });
    expect(body.results).toEqual([{ orderItemId: 'i-1', value: 12.9 }]);
  });
});
