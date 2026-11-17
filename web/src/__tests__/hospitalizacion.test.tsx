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
const tenMinutesAgo = () => new Date(Date.now() - 10 * 60000).toISOString();
const base = { attendingDoctorName: 'Dra. Ficticia Tratante', attendingDoctorHasAccount: true, bedCategory: null, authorized: false, dischargeRequestedAt: null, discharge: null };
const admissionsFixture = () => [
  { ...base, id: 'a-1', patientId: 'p-1', patientName: 'Paciente Ficticio Uno', origin: 'programada', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: false, bed: '', version: 1, allowedActions: ['asignar_cama', 'cancelar'] },
  { ...base, id: 'a-2', patientId: 'p-2', patientName: 'Paciente Ficticio Dos', origin: 'emergencia', requestedCategory: 'semiprivada', state: 'hospitalizado', isolation: true, bed: 'C-201', bedCategory: 'semiprivada', version: 2, occupationId: 'o-2', dischargeRequestedAt: tenMinutesAgo(), allowedActions: ['solicitar_alta', 'trasladar'] },
  { ...base, id: 'a-3', patientId: 'p-3', patientName: 'Paciente Ficticio Tres', origin: 'consulta', requestedCategory: 'vip', state: 'alta_firmada', isolation: false, bed: 'C-301', bedCategory: 'vip', version: 4, occupationId: 'o-3', discharge: { type: 'voluntaria', signedAt: '2026-11-14T15:00:00.000Z', signedByName: 'Dra. Ficticia Tratante', pending: [{ description: 'Entregar receta de alta', responsible: 'Enfermería' }], pendingCount: 1, specialHandling: false }, allowedActions: ['registrar_salida'] },
  { ...base, id: 'a-4', patientId: 'p-4', patientName: 'Paciente Ficticio Cuatro', origin: 'cita', requestedCategory: 'semiprivada', state: 'hospitalizado', isolation: false, bed: 'C-204', bedCategory: 'semiprivada', version: 6, occupationId: 'o-4', attendingDoctorName: 'Dr. Ficticio Sin Cuenta', attendingDoctorHasAccount: false, allowedActions: [] },
];

function mount(permissions: string[], routes: Record<string, unknown> = {}, write?: (path: string, body: unknown) => Promise<unknown>, rows: unknown[] = admissionsFixture()) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/admisiones') return rows;
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
const jopRow = (actions: string[], extra: Record<string, unknown> = {}) => [{ ...base, id: 'a-9', patientId: 'p-9', patientName: 'Paciente Ficticio Nueve', origin: 'emergencia', requestedCategory: 'semiprivada', state: 'hospitalizado', isolation: false, bed: 'C-209', bedCategory: 'semiprivada', version: 7, occupationId: 'o-9', allowedActions: actions, ...extra }];

describe('W13 · admisiones con acciones según allowedActions (D-02)', () => {
  it('muestra solo las acciones de allowedActions, sin depender de permisos del rol, y nunca "Firmar alta"', async () => {
    mount(['admision.ver']);
    const pending = await rowOf('Paciente Ficticio Uno');
    expect(within(pending).getByText('Pendiente de cama')).toBeTruthy();
    expect(within(pending).getByText('Programada')).toBeTruthy();
    expect(pending.querySelector('td[data-label="Paciente"]')).toBeTruthy();
    expect(within(pending).getByRole('button', { name: /Asignar cama/ })).toBeTruthy();
    expect(within(pending).getByRole('button', { name: /Cancelar admisión/ })).toBeTruthy();
    const hospitalized = await rowOf('Paciente Ficticio Dos');
    expect(within(hospitalized).getByRole('button', { name: /Solicitar alta al médico tratante/ })).toBeTruthy();
    expect(within(hospitalized).getByRole('button', { name: /Trasladar/ })).toBeTruthy();
    expect(within(hospitalized).queryByRole('button', { name: /Anular ingreso/ })).toBeNull();
    expect(within(hospitalized).queryByRole('button', { name: /Reasignar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Firmar alta/ })).toBeNull();
    expect(within(await rowOf('Paciente Ficticio Tres')).getByRole('button', { name: /Registrar salida/ })).toBeTruthy();
    expect(within(await rowOf('Paciente Ficticio Cuatro')).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Ingresar paciente/ })).toBeNull();
  });

  it('un hospitalizado sin firmar_alta espera el alta médica del tratante y muestra cuándo se pidió', async () => {
    mount(['admision.ver']);
    const hospitalized = await rowOf('Paciente Ficticio Dos');
    expect(within(hospitalized).getByText('Esperando alta médica: la firma Dra. Ficticia Tratante desde la app')).toBeTruthy();
    expect(within(hospitalized).getByText('Alta solicitada hace 10 min')).toBeTruthy();
    const orphan = await rowOf('Paciente Ficticio Cuatro');
    expect(within(orphan).getByText('El médico tratante no tiene cuenta en la app; reasígnalo')).toBeTruthy();
  });

  it('solicita el alta al médico tratante con la versión y la nota opcional', async () => {
    const api = mount(['admision.ver'], {}, async () => ({ id: 'a-2', state: 'hospitalizado', version: 3 }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Dos')).getByRole('button', { name: /Solicitar alta al médico tratante/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Dra\. Ficticia Tratante/)).toBeTruthy();
    expect(within(dialog).getByText(/C-201/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Nota para el médico/), 'Familia lista para el egreso.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Solicitar alta' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-2/solicitar-alta', { version: 2, note: 'Familia lista para el egreso.' }, 'POST');
  });

  it('cancela una admisión pendiente de cama con motivo de al menos 10 caracteres', async () => {
    const api = mount(['admision.ver'], {}, async () => ({ id: 'a-1', state: 'cancelada', version: 2 }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Uno')).getByRole('button', { name: /Cancelar admisión/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'Duplicado');
    expect((within(dialog).getByRole('button', { name: 'Cancelar admisión' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), ' por error de digitación.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar admisión' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-1/cancelar', { version: 1, reason: 'Duplicado por error de digitación.' }, 'POST');
  });

  it('muestra en español un cambio de estado (transicion_invalida), no el texto del servidor', async () => {
    mount(['admision.ver'], {}, async () => { throw new ApiError('Invalid state transition', 409, 'transicion_invalida'); });
    await userEvent.click(within(await rowOf('Paciente Ficticio Uno')).getByRole('button', { name: /Cancelar admisión/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'Paciente decidió no ingresar.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar admisión' }));
    expect(await within(dialog).findByText(/El registro cambió de estado; vuelve a cargar\./)).toBeTruthy();
    expect(within(dialog).queryByText(/Invalid state transition/)).toBeNull();
  });

  it('anula un ingreso por error (JOP) explicando que la cama pasa a limpieza', async () => {
    const api = mount(['admision.ver'], {}, async () => ({ id: 'a-9', state: 'cancelada', version: 8 }), jopRow(['anular']));
    await userEvent.click(within(await rowOf('Paciente Ficticio Nueve')).getByRole('button', { name: /Anular ingreso por error/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/limpieza/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'Se registró al paciente equivocado.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anular ingreso' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-9/anular', { version: 7, reason: 'Se registró al paciente equivocado.' }, 'POST');
  });

  it('revoca un alta firmada con motivo', async () => {
    const api = mount(['admision.ver'], {}, async () => ({ id: 'a-9', state: 'hospitalizado', version: 8 }), jopRow(['revocar_alta', 'registrar_salida'], { state: 'alta_firmada', discharge: { type: 'medica', signedAt: '2026-11-14T15:00:00.000Z', signedByName: 'Dra. Ficticia Tratante', pending: [], pendingCount: 0, specialHandling: false } }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Nueve')).getByRole('button', { name: /Revocar alta/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'El paciente presentó fiebre antes de salir.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revocar alta' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-9/revocar-alta', { version: 7, reason: 'El paciente presentó fiebre antes de salir.' }, 'POST');
  });

  it('autoriza una excepción de categoría (JOP) con motivo', async () => {
    const api = mount(['admision.ver'], {}, async () => ({ id: 'a-9', version: 8 }), jopRow(['asignar_cama', 'autorizar'], { state: 'pendiente_cama', bed: '', bedCategory: null, occupationId: null }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Nueve')).getByRole('button', { name: /Autorizar excepción/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'No hay semiprivadas libres hoy.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Autorizar excepción' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-9/autorizar', { version: 7, reason: 'No hay semiprivadas libres hoy.' }, 'POST');
  });

  it('reasigna el médico tratante: los médicos sin cuenta aparecen apagados', async () => {
    const api = mount(['admision.ver'], { '/admisiones/medicos-disponibles': [
      { id: 'd-1', name: 'Dr. Ficticio Sin App', specialty: 'Medicina interna', available: true, reason: null, hasAccount: false },
      { id: 'd-2', name: 'Dra. Ficticia Con App', specialty: null, available: true, reason: null, hasAccount: true },
    ] }, async () => ({ id: 'a-9', version: 8 }), jopRow(['reasignar_tratante']));
    await userEvent.click(within(await rowOf('Paciente Ficticio Nueve')).getByRole('button', { name: /Reasignar médico tratante/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Nuevo médico tratante/ }));
    const off = await within(dialog).findByRole('option', { name: /Dr\. Ficticio Sin App/ });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.textContent).toContain('Sin cuenta en la app');
    await userEvent.click(within(dialog).getByRole('option', { name: /Dra\. Ficticia Con App/ }));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'El tratante actual no tiene cuenta.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reasignar' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-9/tratante', { attendingDoctorId: 'd-2', version: 7, reason: 'El tratante actual no tiene cuenta.' }, 'POST');
  });

  it('sin relación de atención (D-031) la salida muestra solo datos operativos: firma, cantidad de pendientes y trámite especial', async () => {
    mount(['admision.ver'], {}, async () => ({}), jopRow(['registrar_salida'], { state: 'alta_firmada', discharge: { type: null, signedAt: '2026-11-14T15:00:00.000Z', signedByName: 'Dra. Ficticia Tratante', pending: null, pendingCount: 2, specialHandling: true } }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Nueve')).getByRole('button', { name: /Registrar salida/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/firmada por Dra. Ficticia Tratante/)).toBeTruthy();
    expect(within(dialog).getByText(/Hay 2 pendientes registrados por el médico/)).toBeTruthy();
    expect(within(dialog).getByText(/requiere un trámite especial/)).toBeTruthy();
    expect(within(dialog).queryByText(/Defunción|Traslado a otro centro|Médica|Voluntaria/)).toBeNull();
  });

  it('registra la salida mostrando el tipo de alta y sus pendientes con responsable', async () => {
    const api = mount(['admision.ver'], {}, async () => { throw new ApiError('Primero debe firmarse el alta.', 409); });
    await userEvent.click(within(await rowOf('Paciente Ficticio Tres')).getByRole('button', { name: /Registrar salida/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Voluntaria/)).toBeTruthy();
    expect(within(dialog).getByText(/Entregar receta de alta/)).toBeTruthy();
    expect(within(dialog).getByText(/Enfermería/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText(/^Motivo o detalle de la salida/), 'Salida');
    expect((within(dialog).getByRole('button', { name: 'Registrar salida' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/^Motivo o detalle de la salida/), ' con familiar responsable.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar salida' }));
    expect(await within(dialog).findByText('Primero debe firmarse el alta.')).toBeTruthy();
    expect((within(dialog).getByLabelText(/^Motivo o detalle de la salida/) as HTMLInputElement).value).toBe('Salida con familiar responsable.');
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-3/salida', { version: 4, reason: 'Salida con familiar responsable.' }, 'POST');
  });

  it('asigna cama con el motivo que escribe la persona, no uno fijo (WEB-08)', async () => {
    const api = mount(['admision.ver'], { '/admisiones/a-1/sugerencias-cama': [{ id: 'b-1', version: 5, code: 'C-202', room: 'H-202', category: 'semiprivada', reason: 'habitación vacía' }] });
    await userEvent.click(within(await rowOf('Paciente Ficticio Uno')).getByRole('button', { name: /Asignar cama/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Categoría de cama')).toBeNull();
    await userEvent.click(await within(dialog).findByLabelText(/C-202/));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo de la asignación \(opcional\)/), 'Cercanía a estación de enfermería.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cama' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-1/cama', { bedId: 'b-1', version: 5, reason: 'Cercanía a estación de enfermería.' }, 'POST');
  });

  // S13 (T10w): the category select is gone; both categories' suggested beds show at once and the first one comes chosen.
  it('con excepción autorizada muestra las camas sugeridas de ambas categorías, sin pedir la categoría antes (MA-HOS-06)', async () => {
    const api = mount(['admision.ver'], {
      '/admisiones/a-9/sugerencias-cama?category=semiprivada': [{ id: 'b-2', version: 3, code: 'C-205', room: 'H-205', category: 'semiprivada', reason: 'habitación vacía' }],
      '/admisiones/a-9/sugerencias-cama?category=vip': [{ id: 'b-7', version: 2, code: 'V-301', room: 'H-301', category: 'vip', reason: 'única libre' }],
    }, undefined, jopRow(['asignar_cama'], { state: 'pendiente_cama', bed: '', bedCategory: null, occupationId: null, authorized: true }));
    await userEvent.click(within(await rowOf('Paciente Ficticio Nueve')).getByRole('button', { name: /Asignar cama/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Categoría de cama')).toBeNull();
    expect(await within(dialog).findByLabelText(/V-301/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/C-205/)).toHaveProperty('checked', true);
    expect(api.request).toHaveBeenCalledWith('/admisiones/a-9/sugerencias-cama?category=vip', expect.anything());
    await userEvent.click(within(dialog).getByLabelText(/V-301/));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cama' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/a-9/cama', { bedId: 'b-7', version: 2 }, 'POST');
  });

  // S13 review (A1): the first bed is chosen only on the first load; if the chosen bed leaves the list the choice empties.
  it('si la cama elegida sale de la lista, la elección queda vacía y no se elige otra en silencio', async () => {
    let beds = [{ id: 'b-1', version: 5, code: 'C-202', room: 'H-202', category: 'semiprivada', reason: 'habitación vacía' }, { id: 'b-2', version: 1, code: 'C-203', room: 'H-203', category: 'semiprivada', reason: 'cerca de enfermería' }];
    const api = {
      request: vi.fn(async (path: string) => path === '/admisiones' ? admissionsFixture() : beds),
      write: vi.fn(async () => ({})),
    };
    const view = render(<HospitalizationPage api={api as unknown as Api} profile={profile(['admision.ver'])} version={0} />);
    await userEvent.click(within(await rowOf('Paciente Ficticio Uno')).getByRole('button', { name: /Asignar cama/ }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByLabelText(/C-202/)).toHaveProperty('checked', true);
    beds = beds.slice(1);
    view.rerender(<HospitalizationPage api={api as unknown as Api} profile={profile(['admision.ver'])} version={1} />);
    await vi.waitFor(() => expect(within(dialog).queryByLabelText(/C-202/)).toBeNull());
    expect(within(dialog).getByLabelText(/C-203/)).toHaveProperty('checked', false);
    expect((within(dialog).getByRole('button', { name: 'Confirmar cama' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('traslada solo a camas libres de la misma categoría, sin la cama actual (MA-HOS-01)', async () => {
    const api = mount(['admision.ver'], { '/camas': [
      { id: 'b-1', code: 'C-201', room: 'H-201', category: 'semiprivada', state: 'libre', version: 1 },
      { id: 'b-6', code: 'V-106', room: 'H-106', category: 'vip', state: 'libre', version: 2 },
      { id: 'b-7', code: 'C-207', room: 'H-207', category: 'semiprivada', state: 'libre', version: 9 },
      { id: 'b-8', code: 'C-208', room: 'H-208', category: 'semiprivada', state: 'ocupada', version: 3 },
    ] });
    expect(within(await rowOf('Paciente Ficticio Tres')).queryByRole('button', { name: /Trasladar/ })).toBeNull();
    await userEvent.click(within(await rowOf('Paciente Ficticio Dos')).getByRole('button', { name: /Trasladar/ }));
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByLabelText(/C-207/);
    expect(within(dialog).queryByLabelText(/C-208/)).toBeNull();
    expect(within(dialog).queryByLabelText(/V-106/)).toBeNull();
    expect(within(dialog).queryByRole('radio', { name: /C-201/ })).toBeNull();
    await userEvent.click(within(dialog).getByLabelText(/C-207/));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del traslado/), 'Necesita cama cerca de oxígeno central.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar traslado' }));
    expect(api.write).toHaveBeenCalledWith('/ocupaciones/o-2/traslado', { bedId: 'b-7', version: 2, reason: 'Necesita cama cerca de oxígeno central.' }, 'POST');
  });
});
