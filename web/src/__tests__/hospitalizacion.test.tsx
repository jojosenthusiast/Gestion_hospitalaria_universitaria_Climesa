import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { HospitalizationPage } from '../features/hospitalization';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const profile = (permissions: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: 'staff-1',
});
const admissions = [
  { id: 'a-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', origin: 'programada', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: false, bed: '', version: 1 },
  { id: 'a-2', patientId: 'p-2', patientName: 'Paciente Ficticio Dos', origin: 'emergencia', requestedCategory: 'semiprivada', state: 'hospitalizado', isolation: true, bed: 'C-201', version: 2, occupationId: 'o-2' },
  { id: 'a-3', patientId: 'p-3', patientName: 'Paciente Ficticio Tres', origin: 'consulta', requestedCategory: 'vip', state: 'alta_firmada', isolation: false, bed: 'C-301', version: 4, occupationId: 'o-3' },
];

function mount(permissions: string[], routes: Record<string, unknown> = {}, write?: (path: string, body: unknown) => Promise<unknown>) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/admisiones') return admissions;
      const key = Object.keys(routes).find(route => path === route || path.startsWith(route + '?'));
      if (key) return routes[key];
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(write ?? (async () => ({ id: 'nuevo', state: 'pendiente_cama', version: 1 }))),
  };
  render(<HospitalizationPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
const rowOf = async (name: string) => (await screen.findAllByRole('row')).find(r => r.textContent?.includes(name))!;

describe('W13 · admisiones con acciones por estado y permiso (WEB-02)', () => {
  it('muestra estados en español, celdas etiquetadas y solo las acciones permitidas', async () => {
    mount(['admision.ver', 'camas.asignar', 'admision.registrar_salida']);
    const pending = await rowOf('Paciente Ficticio Uno');
    expect(within(pending).getByText('Pendiente de cama')).toBeTruthy();
    expect(within(pending).getByText('Programada')).toBeTruthy();
    expect(pending.querySelector('td[data-label="Paciente"]')).toBeTruthy();
    expect(within(pending).getByRole('button', { name: /Asignar cama/ })).toBeTruthy();
    expect(within(await rowOf('Paciente Ficticio Dos')).queryByRole('button', { name: /Firmar alta/ })).toBeNull();
    expect(within(await rowOf('Paciente Ficticio Tres')).getByRole('button', { name: /Registrar salida/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Ingresar paciente/ })).toBeNull();
  });

  it('firma el alta de un hospitalizado con alta.firmar', async () => {
    const api = mount(['admision.ver', 'alta.firmar'], {}, async () => ({ id: 'a-2', state: 'alta_firmada', version: 3 }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Dos')).getByRole('button', { name: /Firmar alta/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Resumen de egreso/), 'Evolución favorable, control en consulta.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Firmar alta' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-2/alta', { type: 'medica', version: 2, summary: 'Evolución favorable, control en consulta.' }, 'POST');
  });

  it('el alta voluntaria exige la constancia antes de enviar', async () => {
    mount(['admision.ver', 'alta.firmar']);
    await userEvent.click(within(await rowOf('Paciente Ficticio Dos')).getByRole('button', { name: /Firmar alta/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo de alta'), 'voluntaria');
    expect((within(dialog).getByRole('button', { name: 'Firmar alta' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByLabelText(/constancia de alta voluntaria/));
    expect((within(dialog).getByRole('button', { name: 'Firmar alta' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('registra la salida física con versión y motivo, y conserva el motivo si la API rechaza', async () => {
    const api = mount(['admision.ver', 'admision.registrar_salida'], {}, async () => { throw new ApiError('Primero debe firmarse el alta.', 409); });
    await userEvent.click(within(await rowOf('Paciente Ficticio Tres')).getByRole('button', { name: /Registrar salida/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo o detalle de la salida/), 'Salida');
    expect((within(dialog).getByRole('button', { name: 'Registrar salida' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/^Motivo o detalle de la salida/), ' con familiar responsable.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar salida' }));
    expect(await within(dialog).findByText('Primero debe firmarse el alta.')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Motivo o detalle de la salida/) as HTMLInputElement).value).toBe('Salida con familiar responsable.');
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-3/salida', { version: 4, reason: 'Salida con familiar responsable.' }, 'POST');
  });

  it('asigna cama con el motivo que escribe la persona, no uno fijo (WEB-08)', async () => {
    const api = mount(['admision.ver', 'camas.asignar'], { '/admisiones/a-1/sugerencias-cama': [{ id: 'b-1', version: 5, code: 'C-202', room: 'H-202', category: 'semiprivada', reason: 'habitación vacía' }] });
    await userEvent.click(within(await rowOf('Paciente Ficticio Uno')).getByRole('button', { name: /Asignar cama/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(await within(dialog).findByLabelText(/C-202/));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo de la asignación \(opcional\)/), 'Cercanía a estación de enfermería.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cama' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-1/cama', { bedId: 'b-1', version: 5, reason: 'Cercanía a estación de enfermería.' }, 'POST');
  });

  it('traslada la ocupación activa a una cama libre con motivo y la versión de la admisión (API-05)', async () => {
    const api = mount(['admision.ver', 'camas.trasladar', 'camas.ver_tablero'], { '/camas': [
      { id: 'b-7', code: 'C-207', room: 'H-207', category: 'semiprivada', state: 'libre', version: 9 },
      { id: 'b-8', code: 'C-208', room: 'H-208', category: 'semiprivada', state: 'ocupada', version: 3 },
    ] });
    expect(within(await rowOf('Paciente Ficticio Tres')).queryByRole('button', { name: /Trasladar/ })).toBeNull();
    await userEvent.click(within(await rowOf('Paciente Ficticio Dos')).getByRole('button', { name: /Trasladar/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/C-208/)).toBeNull();
    await userEvent.click(await within(dialog).findByLabelText(/C-207/));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del traslado/), 'Necesita cama cerca de oxígeno central.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar traslado' }));
    expect(api.write).toHaveBeenCalledWith('/ocupaciones/o-2/traslado', { bedId: 'b-7', version: 2, reason: 'Necesita cama cerca de oxígeno central.' }, 'POST');
  });
});
