import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { LaboratoryPage } from '../features/laboratory';

// T07b (S10): the file of an external result goes to the private bucket through the API; staff download it with a
// short-lived signed link. The browser never sees a bucket path.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const permissions = (codes: string[]) => codes.map(code => ({ code, context: 'x' }));
const lab: AccessProfile = { id: 'u', user: { id: 'u' }, email: 'lab@example.test', name: 'Lab', roles: ['LAB'], platforms: ['web'], permissions: permissions(['laboratorio.ver_cola', 'laboratorio.procesar', 'laboratorio.validar', 'resultados.ver']), channels: [], patientId: null, staffId: 's' };
const doctor: AccessProfile = { ...lab, roles: ['MED'], permissions: permissions(['resultados.ver']) };
const item = { id: 'i-1', code: 'HB', name: 'Hemoglobina', unit: 'g/dL', resultType: 'numerico', result: null };
const base = { id: 'a', patientName: 'Ana Externa', priority: 'rutina', createdAt: new Date(Date.now() - 20 * 60_000).toISOString(), version: 3, items: [item], allowedActions: [], external: true, externalPlace: 'Clínica Ficticia' };
const attachment = (stored: boolean) => ({ id: 'att-1', fileName: 'informe.pdf', mimeType: 'application/pdf', sizeBytes: 2048, sha256: null, stored, note: null, uploadedAt: new Date().toISOString(), uploadedByName: 'Lab Prueba' });

type MockApi = Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
function mount(order: Record<string, unknown>, profile: AccessProfile, attachments: unknown[], link?: () => unknown) {
  const api = {
    request: vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/enlace')) return link ? link() : { url: 'https://almacen.example.test/firmado/abc', expiresAt: new Date().toISOString(), expiresInSeconds: 300, fileName: 'informe.pdf', mimeType: 'application/pdf', sizeBytes: 2048 };
      if (path.endsWith('/archivo') && init?.method === 'POST') return { id: 'att-1', stored: true, mimeType: 'application/pdf', sizeBytes: 17, sha256: 'f'.repeat(64) };
      if (path.startsWith('/laboratorio/ordenes/')) return { attachments };
      return [order];
    }),
    write: vi.fn(async () => ({ id: 'a', state: 'completado', version: 4, attachmentId: 'att-1' })),
  } as unknown as MockApi;
  render(<LaboratoryPage api={api} profile={profile} version={0} />);
  return api;
}
const uploads = (api: MockApi) => api.request.mock.calls.filter(([path, init]) => String(path).endsWith('/archivo') && (init as RequestInit | undefined)?.method === 'POST');

describe('archivo privado del resultado externo (T07b)', () => {
  it('al guardar el resultado externo sube el archivo a la API como multipart, con su clave de idempotencia', async () => {
    const api = mount({ ...base, state: 'pendiente', externalActions: ['cargar_externo'] }, lab, []);
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar resultado externo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cargar resultado externo' });
    const pdf = new File(['%PDF-1.4 ficticio'], 'informe.pdf', { type: 'application/pdf' });
    await userEvent.upload(within(dialog).getByLabelText(/Informe \(PDF o foto/), pdf);
    await userEvent.type(within(dialog).getByLabelText('Hemoglobina (g/dL)'), '12.9');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar resultado' }));
    await vi.waitFor(() => expect(uploads(api)).toHaveLength(1));
    const [path, init] = uploads(api)[0] as [string, RequestInit];
    expect(path).toBe('/laboratorio/adjuntos/att-1/archivo');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('archivo')).toBeInstanceOf(File);
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByText(/el original queda con quien lo cargó/)).toBeNull();
  });

  it('si los valores se guardan pero el archivo no sube, lo dice y no cierra en silencio', async () => {
    const api = mount({ ...base, state: 'pendiente', externalActions: ['cargar_externo'] }, lab, []);
    api.request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/archivo') && init?.method === 'POST') throw new ApiError('El archivo no es un PDF ni una foto JPG, PNG, HEIC o WEBP.', 415, 'adjunto_tipo_invalido');
      return [{ ...base, state: 'pendiente', externalActions: ['cargar_externo'] }];
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Cargar resultado externo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cargar resultado externo' });
    await userEvent.upload(within(dialog).getByLabelText(/Informe \(PDF o foto/), new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' }));
    await userEvent.type(within(dialog).getByLabelText('Hemoglobina (g/dL)'), '12.9');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar resultado' }));
    expect(await within(dialog).findByText(/Los valores se guardaron, pero el archivo no se subió/)).toBeTruthy();
    expect(within(dialog).getByText(/no es un PDF ni una foto/)).toBeTruthy();
  });

  it('el médico descarga un archivo guardado con un enlace firmado que no se muestra', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const api = mount({ ...base, state: 'completado', completedAt: new Date().toISOString() }, doctor, [attachment(true)]);
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar informe.pdf' }));
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(api.request).toHaveBeenCalledWith('/laboratorio/adjuntos/att-1/enlace');
    expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe('https://almacen.example.test/firmado/abc');
    expect(screen.queryByText(/almacen\.example\.test/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Subir archivo/ })).toBeNull();
  });

  it('un adjunto con solo la referencia lo explica y el laboratorio puede subir el archivo desde la orden', async () => {
    const api = mount({ ...base, state: 'completado', completedAt: new Date().toISOString() }, lab, [attachment(false)]);
    expect(await screen.findByText(/Solo se guardó la referencia/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull();
    await userEvent.upload(screen.getByLabelText('Subir archivo de informe.pdf'), new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' }));
    await vi.waitFor(() => expect(uploads(api)).toHaveLength(1));
    expect(uploads(api)[0][0]).toBe('/laboratorio/adjuntos/att-1/archivo');
  });

  // Auditoría T15: una foto HEIC sin tipo (Windows) se acepta por su extensión y sube con el tipo que le corresponde.
  it('una foto HEIC sin tipo del navegador sube con su tipo por extensión', async () => {
    const api = mount({ ...base, state: 'completado', completedAt: new Date().toISOString() }, lab, [attachment(false)]);
    await userEvent.upload(await screen.findByLabelText('Subir archivo de informe.pdf'), new File(['ftypheic'], 'Foto.HEIC', { type: '' }));
    await vi.waitFor(() => expect(uploads(api)).toHaveLength(1));
    const part = (uploads(api)[0][1] as RequestInit).body as FormData;
    expect([(part.get('archivo') as File).name, (part.get('archivo') as File).type]).toEqual(['Foto.HEIC', 'image/heic']);
  });

  it('un archivo distinto del declarado se explica en español junto al adjunto', async () => {
    mount({ ...base, state: 'completado', completedAt: new Date().toISOString() }, lab, [attachment(false)]).request.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/archivo') && init?.method === 'POST') throw new ApiError('x', 409, 'adjunto_no_coincide');
      if (path.startsWith('/laboratorio/ordenes/')) return { attachments: [attachment(false)] };
      return [{ ...base, state: 'completado', completedAt: new Date().toISOString() }];
    });
    await userEvent.upload(await screen.findByLabelText('Subir archivo de informe.pdf'), new File(['%PDF-1.4'], 'informe.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText(/no coincide con el que se adjuntó/)).toBeTruthy();
  });

  it('quien no carga resultados no ve la opción de subir', async () => {
    mount({ ...base, state: 'completado', completedAt: new Date().toISOString() }, doctor, [attachment(false)]);
    expect(await screen.findByText(/Solo se guardó la referencia/)).toBeTruthy();
    expect(screen.queryByLabelText(/Subir archivo/)).toBeNull();
  });

  it('un error de descarga se muestra en español junto al archivo', async () => {
    mount({ ...base, state: 'completado', completedAt: new Date().toISOString() }, doctor, [attachment(true)], () => { throw new ApiError('x', 409, 'adjunto_sin_archivo'); });
    await userEvent.click(await screen.findByRole('button', { name: 'Descargar informe.pdf' }));
    expect(await screen.findByText(/solo tiene la referencia/)).toBeTruthy();
  });
});
