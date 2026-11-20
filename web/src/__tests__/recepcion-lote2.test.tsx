import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { HospitalizationPage } from '../features/hospitalization';
import { PhoneRequestForm } from '../features/ambulance/dialogs';
import { admissionDraftKey } from '../features/hospitalization/admission-stepper';

// Owner «Lote 2» (Recepción, 2026-11-18): S26 faster phone call form, S27 guided admission keeps progress and the
// indicated admission says where it comes from and shows beds as rooms.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); sessionStorage.clear(); location.hash = ''; });

const profile = (permissions: string[], id = 'rec-1'): AccessProfile => ({
  id, user: { id }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 'staff-1',
});

describe('S26 · Registrar llamada más rápido', () => {
  const callApi = () => ({ request: vi.fn(async () => ({ items: [], hasMore: false })), write: vi.fn(async () => ({ id: 'r1' })) }) as unknown as Api & { write: ReturnType<typeof vi.fn> };

  it('agrupa «Quién llama» y «Dónde y qué pasa», enfoca el primer campo y el teléfono abre el teclado telefónico', () => {
    render(<PhoneRequestForm api={callApi()} profile={profile(['ambulancia.solicitar'])} onClose={() => {}} onSaved={() => {}} />);
    const who = screen.getByRole('group', { name: 'Quién llama' }), where = screen.getByRole('group', { name: 'Dónde y qué pasa' });
    expect(within(who).getByLabelText('Nombre de quien llama')).toBe(document.activeElement);
    const phone = within(who).getByLabelText('Teléfono de contacto') as HTMLInputElement;
    expect(phone.type).toBe('tel');
    expect(phone.inputMode).toBe('tel');
    expect(within(where).getByLabelText('Dirección')).toBeTruthy();
    expect(within(where).getByLabelText('Municipio')).toBeTruthy();
    expect(within(where).getByLabelText('Motivo')).toBeTruthy();
    expect(screen.getByText('Si hay riesgo de vida, que llame al 911.')).toBeTruthy();
  });

  it('con el buscador de pacientes, el primer campo enfocado es el paciente', async () => {
    render(<PhoneRequestForm api={callApi()} profile={profile(['ambulancia.solicitar', 'pacientes.buscar', 'pacientes.ver_ficha'])} onClose={() => {}} onSaved={() => {}} />);
    await vi.waitFor(() => expect(screen.getByRole('combobox', { name: /Paciente/ })).toBe(document.activeElement));
  });

  it('Enter registra con la misma llamada a la API; luego confirma y «Registrar otra» deja el formulario en blanco', async () => {
    const api = callApi(), onSaved = vi.fn(), onRegistered = vi.fn();
    render(<PhoneRequestForm api={api} profile={profile(['ambulancia.solicitar'])} onClose={() => {}} onSaved={onSaved} onRegistered={onRegistered} doneMessage="Llamada registrada: queda por confirmar en despacho." />);
    await userEvent.type(screen.getByLabelText('Nombre de quien llama'), 'Vecina');
    await userEvent.type(screen.getByLabelText('Teléfono de contacto'), '2200-0000');
    await userEvent.type(screen.getByLabelText('Dirección'), 'Barrio Ficticio, calle 2');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Dolor de pecho{Enter}');
    expect(api.write).toHaveBeenCalledWith('/ambulancia/solicitudes', { address: 'Barrio Ficticio, calle 2', reason: 'Dolor de pecho', contactPhone: '2200-0000', callerName: 'Vecina' }, 'POST');
    expect(await screen.findByText(/Llamada registrada: queda por confirmar en despacho\./)).toBeTruthy();
    expect(onRegistered).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar otra' }));
    expect(screen.getByLabelText('Dirección')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Nombre de quien llama')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Nombre de quien llama')).toBe(document.activeElement);
  });

  it('«Listo» cierra; Enter con datos incompletos no llama a la API y dice qué falta (sin cambios)', async () => {
    const api = callApi(), onSaved = vi.fn();
    render(<PhoneRequestForm api={api} profile={profile(['ambulancia.solicitar'])} onClose={() => {}} onSaved={onSaved} />);
    await userEvent.type(screen.getByLabelText('Dirección'), 'Calle{Enter}');
    // Audit D15: the message names every field with a problem (the phone too), and each field says why under itself.
    expect(await screen.findByText('Revisa el teléfono y el motivo.')).toBeTruthy();
    expect(screen.getByText('Indica un teléfono de 8 a 20 dígitos.')).toBeTruthy();
    expect(screen.getByText('Indica el motivo, de al menos 5 caracteres.')).toBeTruthy();
    expect(api.write).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Dirección'), ' Ficticia 3');
    await userEvent.type(screen.getByLabelText('Motivo'), 'Caída en casa');
    await userEvent.type(screen.getByLabelText('Teléfono de contacto'), '2200-0001{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Listo' }));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

const routes: Record<string, unknown> = {
  '/pacientes/selector': { items: [{ id: 'p9', fullName: 'Paciente Ficticio Nueve', record: 'EXP-000009', age: 41 }], hasMore: false },
  '/admisiones/origenes': [
    { id: 'e1', origin: 'emergencia', at: '2026-11-20T09:00:00Z', label: 'Emergencia del 20/11/2026', detail: 'Ticket 3 · atendido' },
    { id: 's1', origin: 'ambulancia', at: '2026-11-20T08:00:00Z', label: 'Ambulancia del 20/11/2026', detail: 'Colonia Ficticia a Hospital CLIMESA · completado' },
  ],
  '/admisiones/medicos-disponibles': [{ id: 'd1', name: 'Dra. Ficticia', specialty: 'Medicina interna', available: true, reason: null }],
  '/admisiones/mapa-camas': { categories: [{ category: 'semiprivada', free: 1, compatible: 1 }, { category: 'vip', free: 0, compatible: 0 }], beds: [] },
};
function mountPage(permissions: string[], rows: unknown[] = [], extra: Record<string, unknown> = {}) {
  const all = { ...routes, ...extra };
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/admisiones') return rows;
      const key = Object.keys(all).find(route => path === route || path.startsWith(route + '?'));
      if (key) return all[key];
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(async () => ({ id: 'nuevo', state: 'pendiente_cama', version: 1 })),
  };
  render(<HospitalizationPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
const next = async () => userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
async function startWithPatient() {
  await userEvent.click(await screen.findByRole('button', { name: /Ingresar paciente/ }));
  const dialog = screen.getByRole('dialog', { name: 'Ingresar paciente' });
  await userEvent.type(within(dialog).getByRole('combobox', { name: /Paciente/ }), 'nueve');
  await userEvent.click(await within(dialog).findByRole('option', { name: /Paciente Ficticio Nueve/ }));
  await next();
  return dialog;
}

describe('S27 · ingreso guiado conserva el progreso', { timeout: 30000 }, () => {
  it('cerrar y volver a abrir ofrece «Continuar ingreso de …» en el mismo paso y con los mismos datos', async () => {
    mountPage(['admision.ver', 'admision.crear', 'pacientes.buscar']);
    let dialog = await startWithPatient();
    await userEvent.click(await within(dialog).findByLabelText(/^Emergencia/));
    await userEvent.click(within(dialog).getByLabelText(/^Emergencia · /));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del ingreso/), 'Trauma por caída desde altura');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar formulario' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Ingresar paciente/ }));
    dialog = screen.getByRole('dialog', { name: 'Ingresar paciente' });
    expect(within(dialog).getByText(/guardado en el paso «Origen y motivo»/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: /Continuar ingreso de Paciente Ficticio Nueve/ }));
    expect(within(dialog).getByText(/Paso 2 de 5 · Origen y motivo/)).toBeTruthy();
    expect(await within(dialog).findByLabelText(/^Motivo del ingreso/)).toHaveProperty('value', 'Trauma por caída desde altura');
    expect(within(dialog).getByLabelText(/^Emergencia · /)).toHaveProperty('checked', true);
    // «Atrás» keeps everything too.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Atrás' }));
    expect(within(dialog).getByText(/Paso 1 de 5/)).toBeTruthy();
    expect(within(dialog).getByText('Paciente Ficticio Nueve')).toBeTruthy();
  });

  it('«Empezar de nuevo» borra el borrador y abre el primer paso vacío', async () => {
    sessionStorage.setItem(admissionDraftKey('rec-1'), JSON.stringify({ step: 'origen', form: { patient: { id: 'p9', label: 'Paciente Ficticio Nueve' }, origin: null, originRecord: null, motive: 'Algo pendiente', at: '2026-11-20T09:00', doctor: null, category: null, isolation: false, isolationType: '', unstable: false, postSurgical: false, bed: null, visitorsAllowed: true, visitorsMax: 1, feasible: false } }));
    mountPage(['admision.ver', 'admision.crear', 'pacientes.buscar']);
    await userEvent.click(await screen.findByRole('button', { name: /Ingresar paciente/ }));
    const dialog = screen.getByRole('dialog', { name: 'Ingresar paciente' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Empezar de nuevo' }));
    expect(within(dialog).getByText(/Paso 1 de/)).toBeTruthy();
    expect(within(dialog).getByRole('combobox', { name: /Paciente/ })).toHaveProperty('value', '');
    expect(sessionStorage.getItem(admissionDraftKey('rec-1'))).toBeNull();
  });

  it('el borrador es de cada usuario: otra cuenta no lo ve', async () => {
    sessionStorage.setItem(admissionDraftKey('otra-cuenta'), JSON.stringify({ step: 'origen', form: { patient: { id: 'p9', label: 'Paciente Ficticio Nueve' } } }));
    mountPage(['admision.ver', 'admision.crear', 'pacientes.buscar']);
    await userEvent.click(await screen.findByRole('button', { name: /Ingresar paciente/ }));
    expect(screen.queryByRole('button', { name: /Continuar ingreso/ })).toBeNull();
  });

  it('las tarjetas Emergencia y Ambulancia se habilitan cuando el paciente tiene esos registros; el ingreso confirmado borra el borrador', async () => {
    const api = mountPage(['admision.ver', 'admision.crear', 'pacientes.buscar'], [], { '/admisiones/factibilidad': { feasible: true, checks: [{ code: 'origen_vinculado', ok: true, message: 'El registro de origen pertenece al paciente.' }] } });
    const dialog = await startWithPatient();
    expect(await within(dialog).findByLabelText(/^Emergencia/)).toHaveProperty('disabled', false);
    expect(within(dialog).getByLabelText(/^Ambulancia/)).toHaveProperty('disabled', false);
    expect(within(dialog).getByLabelText(/^Cita/)).toHaveProperty('disabled', true);
    await userEvent.click(within(dialog).getByLabelText(/^Ambulancia/));
    await userEvent.click(within(dialog).getByLabelText(/^Ambulancia · /));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del ingreso/), 'Traslado tras caída en domicilio');
    await next();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Médico tratante/ }));
    await userEvent.click(await within(dialog).findByRole('option', { name: /Dra\. Ficticia/ }));
    await next();
    await userEvent.click(await within(dialog).findByLabelText(/Semiprivada/));
    await next();
    await userEvent.click(await within(dialog).findByRole('button', { name: /Confirmar ingreso/ }));
    expect(api.write).toHaveBeenCalledWith('/admisiones', expect.objectContaining({ origin: 'ambulancia', originId: 's1' }), 'POST');
    await vi.waitFor(() => expect(sessionStorage.getItem(admissionDraftKey('rec-1'))).toBeNull());
  });

  it('la fecha se escribe dd/mm/aaaa y la hora en 24 h; una hora incompleta no deja avanzar', async () => {
    mountPage(['admision.ver', 'admision.crear', 'pacientes.buscar']);
    const dialog = await startWithPatient();
    await userEvent.click(await within(dialog).findByLabelText(/^Emergencia/));
    await userEvent.click(within(dialog).getByLabelText(/^Emergencia · /));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del ingreso/), 'Trauma por caída desde altura');
    await next();
    const date = within(dialog).getByLabelText('Fecha del ingreso') as HTMLInputElement, time = within(dialog).getByLabelText('Hora del ingreso') as HTMLInputElement;
    expect(date.value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(time.value).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Médico tratante/ }));
    await userEvent.click(await within(dialog).findByRole('option', { name: /Dra\. Ficticia/ }));
    await userEvent.clear(time);
    await userEvent.type(time, '9:');
    expect(within(dialog).getByRole('button', { name: /Siguiente/ })).toHaveProperty('disabled', true);
    expect(within(dialog).getByText('Indica la fecha y la hora del ingreso.')).toBeTruthy();
    await userEvent.clear(time);
    await userEvent.type(time, '0930');
    expect(time.value).toBe('09:30');
    expect(within(dialog).getByRole('button', { name: /Siguiente/ })).toHaveProperty('disabled', false);
  });
});

describe('S27 · ingreso indicado: de dónde viene y camas por habitación', () => {
  const indicated = { id: 'adm-1', patientId: 'p-1', patientName: 'Ana Pérez Ficticia', origin: 'consulta', requestedCategory: 'semiprivada', state: 'pendiente_cama', isolation: false, bed: '', version: 1, motive: 'Neumonía con hipoxemia', attendingDoctorName: 'Ana Isabel Ejemplo López', createdAt: '2026-11-18T16:20:00Z', originAt: '2026-11-18T15:40:00Z', allowedActions: ['asignar_cama'] };
  const beds = [
    { id: 'b-1', version: 4, code: 'C-201-B', roomId: 'r-201', room: 'H-201', level: 2, category: 'semiprivada', reason: 'habitación con ocupante compatible', occupiedInRoom: 1 },
    { id: 'b-2', version: 2, code: 'C-205-A', roomId: 'r-205', room: 'H-205', level: 2, category: 'semiprivada', reason: 'habitación vacía', occupiedInRoom: 0 },
    { id: 'b-3', version: 7, code: 'C-205-B', roomId: 'r-205', room: 'H-205', level: 2, category: 'semiprivada', reason: 'habitación vacía', occupiedInRoom: 0 },
  ];
  it('dice quién lo indicó, cuándo y desde qué consulta, con el motivo; las camas van por habitación y la primera libre viene elegida', async () => {
    const api = mountPage(['admision.ver', 'camas.asignar'], [indicated], { '/admisiones/adm-1/sugerencias-cama': beds });
    await userEvent.click(within(await screen.findByRole('region', { name: 'Ingresos indicados' })).getByRole('button', { name: 'Ingresar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ingresar paciente indicado' });
    const origin = within(dialog).getByRole('region', { name: 'De dónde viene el ingreso' });
    expect(origin.textContent).toMatch(/^Indicado por Dr\(a\)\. Ana Isabel Ejemplo López el .+ desde su consulta del .+\./);
    expect(within(origin).getByText('Neumonía con hipoxemia')).toBeTruthy();
    // No duplicated origin, doctor or reason in the summary below.
    expect(within(dialog).queryByText('Médico tratante')).toBeNull();
    const rooms = within(dialog).getByRole('group', { name: 'Camas sugeridas' });
    expect(within(rooms).getByText('H-201')).toBeTruthy();
    expect(within(rooms).getByText('Planta 2 · 1 libre · 1 ocupada')).toBeTruthy();
    expect(within(rooms).getByText('Planta 2 · 2 libres · vacía')).toBeTruthy();
    expect(within(rooms).getAllByRole('radio')).toHaveLength(3);
    expect(within(rooms).getByRole('radio', { name: /C-201-B/ })).toHaveProperty('checked', true);
    await userEvent.click(within(rooms).getByRole('radio', { name: /C-205-B/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cama' }));
    expect(api.write).toHaveBeenCalledWith('/admisiones/adm-1/cama', { bedId: 'b-3', version: 7 }, 'POST');
  });

  it('un ingreso desde Emergencia dice cuándo se registró y de qué emergencia viene', async () => {
    location.hash = '#/hospitalizacion?ingresar=adm-1';
    mountPage(['admision.ver', 'camas.asignar'], [{ ...indicated, origin: 'emergencia' }], { '/admisiones/adm-1/sugerencias-cama': beds });
    const dialog = await screen.findByRole('dialog', { name: 'Asignar cama' });
    expect(within(dialog).getByRole('region', { name: 'De dónde viene el ingreso' }).textContent).toMatch(/^Ingreso registrado el .+ desde Emergencia del .+ · médico tratante Dr\(a\)\. Ana Isabel Ejemplo López\./);
  });
});
