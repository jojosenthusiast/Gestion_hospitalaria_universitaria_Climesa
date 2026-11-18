import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { HospitalizationPage } from '../features/hospitalization';
import { admissionBody, groupBeds, initialForm, isImmediate, salvadorInstant, stepError, stepsFor, visitorError, type AdmissionForm, type BedPick } from '../features/hospitalization/admission-rules';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); history.replaceState(null, '', '#/'); });

const bed = (over: Partial<BedPick> = {}): BedPick => ({ id: 'b1', version: 3, code: 'C-201', roomId: 'r1', room: 'H-201', floor: 2, category: 'semiprivada', capacity: 2, state: 'libre', occupiedInRoom: 0, compatible: true, reason: null, suggested: true, ...over });
const complete = (over: Partial<AdmissionForm> = {}): AdmissionForm => ({
  ...initialForm('2026-11-20T08:30'), patient: { id: 'p9', label: 'Paciente Ficticio Nueve' }, origin: 'cita',
  originRecord: { id: 'c1', origin: 'cita', at: '2026-11-19T15:00:00Z', label: 'Cita del 19/11/2026', detail: '' }, motive: 'Dolor abdominal con fiebre',
  doctor: { id: 'd1', label: 'Dra. Ficticia', available: true, reason: null }, category: 'semiprivada', bed: bed(), ...over,
});

describe('ingreso guiado · reglas de cada paso', () => {
  it('paso 1 y 2: paciente, origen enlazado y motivo obligatorio', () => {
    expect(stepError('paciente', initialForm('2026-11-20T08:30'), true)).toMatch(/paciente/);
    const f = complete();
    expect(stepError('origen', { ...f, origin: null, originRecord: null }, true)).toMatch(/origen/);
    expect(stepError('origen', { ...f, originRecord: null }, true)).toMatch(/registro de origen/);
    expect(stepError('origen', { ...f, motive: 'corto' }, true)).toMatch(/motivo/);
    expect(stepError('origen', f, true)).toBeNull();
  });
  it('paso 3: el médico apagado no deja avanzar y explica por qué', () => {
    const f = complete({ doctor: { id: 'd2', label: 'Dr. Sin Turno', available: false, reason: 'Sin turno en ese horario' } });
    expect(stepError('medico', f, true)).toMatch(/Sin turno en ese horario/);
    expect(stepError('medico', { ...f, doctor: null }, true)).toMatch(/médico/);
  });
  // S13 (T10w): category, clinical requirements and visitors share one step, and the bed step only appears when a bed is
  // assigned now (immediate admission and permission). Eight steps become six, or five without a bed.
  it('el paso de cama solo existe si se asigna cama ahora; la cama es obligatoria en ese paso', () => {
    const now = new Date('2026-11-20T14:30:00Z');
    const f = complete({ at: '2026-11-20T08:30', bed: null });
    expect(isImmediate(f.at, now)).toBe(true);
    expect(stepsFor(f, true, now)).toEqual(['paciente', 'origen', 'medico', 'habitacion', 'cama', 'resumen']);
    expect(stepsFor(f, false, now)).toEqual(['paciente', 'origen', 'medico', 'habitacion', 'resumen']);
    expect(stepsFor({ ...f, at: '2026-11-22T08:30' }, true, now)).not.toContain('cama');
    expect(stepError('cama', f, true, now)).toMatch(/cama/);
  });
  it('el paso de habitación pide la categoría y valida aislamiento y visitas', () => {
    const f = complete();
    expect(stepError('habitacion', { ...f, category: null }, true)).toMatch(/categoría/);
    expect(stepError('habitacion', { ...f, isolation: false, isolationType: 'contacto' }, true)).toMatch(/aislamiento/);
    expect(stepError('habitacion', { ...f, visitorsAllowed: true, visitorsMax: 0 }, true)).toMatch(/al menos 1/);
    expect(stepError('habitacion', f, true)).toBeNull();
  });
  it('paso 7: visitas según categoría', () => {
    expect(visitorError(false, 0, 'vip')).toBeNull();
    expect(visitorError(false, 1, 'vip')).toMatch(/debe ser 0/);
    expect(visitorError(true, 0, 'vip')).toMatch(/al menos 1/);
    expect(visitorError(true, 2, 'semiprivada')).toMatch(/hasta 1 acompañante/);
    expect(visitorError(true, 3, 'vip')).toBeNull();
  });
  it('arma el cuerpo con cama solo si es inmediato y agrupa camas por planta y habitación', () => {
    const now = new Date('2026-11-20T14:30:00Z');
    expect(admissionBody(complete(), true, now)).toMatchObject({ patientId: 'p9', origin: 'cita', originId: 'c1', motive: 'Dolor abdominal con fiebre', attendingDoctorId: 'd1', scheduledAt: salvadorInstant('2026-11-20T08:30'), bedId: 'b1', bedVersion: 3, visitorsMax: 1 });
    expect(admissionBody(complete(), false, now)).not.toHaveProperty('bedId');
    expect(admissionBody(complete({ visitorsAllowed: false, visitorsMax: 0 }), true, now)).toMatchObject({ visitorsAllowed: false, visitorsMax: 0 });
    const groups = groupBeds([bed(), bed({ id: 'b2', code: 'C-202' }), bed({ id: 'b3', roomId: 'r2', room: 'H-101', floor: 1, code: 'C-101' })]);
    expect(groups.map(g => g.floor)).toEqual([1, 2]);
    expect(groups[1].rooms[0].beds).toHaveLength(2);
  });
});

const profile = (permissions: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: 'staff-1',
});
const beds = [
  bed(), bed({ id: 'b2', code: 'C-202', suggested: false, compatible: false, state: 'ocupada', reason: 'Ocupada' }),
  bed({ id: 'b3', code: 'C-203', suggested: false, compatible: false, reason: 'Habitación ocupada por un paciente de otro sexo' }),
];
const routes: Record<string, unknown> = {
  '/pacientes/selector': { items: [{ id: 'p9', fullName: 'Paciente Ficticio Nueve', record: 'EXP-000009', age: 41 }], hasMore: false },
  '/admisiones/origenes': [{ id: 'c1', origin: 'cita', at: '2026-11-19T15:00:00Z', label: 'Cita del 19/11/2026', detail: 'Dra. Ficticia · confirmada' }, { id: 'e1', origin: 'emergencia', at: '2026-11-20T09:00:00Z', label: 'Emergencia del 20/11/2026', detail: 'Ticket 3 · atendido' }],
  '/admisiones/medicos-disponibles': [{ id: 'd1', name: 'Dra. Ficticia', specialty: 'Medicina interna', available: true, reason: null }, { id: 'd2', name: 'Dr. Sin Turno', specialty: null, available: false, reason: 'Sin turno en ese horario' }],
  '/admisiones/mapa-camas': { categories: [{ category: 'semiprivada', free: 2, compatible: 1 }, { category: 'vip', free: 0, compatible: 0 }], beds },
  '/admisiones/factibilidad': { feasible: true, checks: [{ code: 'medico_en_turno', ok: true, message: 'El médico tiene turno en ese horario.' }] },
};

function mount(permissions: string[], write?: (path: string, body: unknown) => Promise<unknown>) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/admisiones') return [];
      const key = Object.keys(routes).find(route => path === route || path.startsWith(route + '?'));
      if (key) return routes[key];
      throw new ApiError(`Ruta inesperada: ${path}`, 404);
    }),
    write: vi.fn(write ?? (async () => ({ id: 'nuevo', state: 'hospitalizado', version: 2 }))),
  };
  render(<HospitalizationPage api={api as unknown as Api} profile={profile(permissions)} version={0} />);
  return api;
}
const next = async () => userEvent.click(screen.getByRole('button', { name: /Siguiente/ }));

describe('ingreso guiado · recorrido de seis pasos', { timeout: 30000 }, () => {
  it('recorre los pasos validando cada uno y confirma con cama sugerida preseleccionada', async () => {
    const api = mount(['admision.ver', 'admision.crear', 'camas.asignar', 'pacientes.buscar']);
    await userEvent.click(await screen.findByRole('button', { name: /Ingresar paciente/ }));
    const dialog = screen.getByRole('dialog');
    // 1. paciente
    expect((within(dialog).getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByRole('combobox', { name: /Paciente/ }), 'nueve');
    await userEvent.click(await within(dialog).findByRole('option', { name: /Paciente Ficticio Nueve/ }));
    await next();
    // 2. origen y motivo
    await userEvent.click(await within(dialog).findByLabelText(/Cita/));
    await userEvent.click(within(dialog).getByLabelText(/^Cita · /));
    expect((within(dialog).getByRole('button', { name: /Siguiente/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByLabelText(/Ambulancia/) as HTMLInputElement).disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del ingreso/), 'Dolor abdominal con fiebre');
    await next();
    // 3. fecha y médico: el médico sin turno aparece apagado
    await userEvent.click(within(dialog).getByRole('button', { name: /^Todos/ }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Médico tratante/ }));
    const off = await within(dialog).findByRole('option', { name: /Dr\. Sin Turno/ });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.textContent).toContain('Sin turno en ese horario');
    await userEvent.click(within(dialog).getByRole('option', { name: /Dra\. Ficticia/ }));
    await next();
    // 4. habitación: categoría (VIP apagada por no tener camas libres), requisitos y visitas en un solo paso
    expect(within(dialog).getByText(/Paso 4 de 6/)).toBeTruthy();
    expect((await within(dialog).findByLabelText(/VIP/) as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByLabelText(/Semiprivada/));
    await userEvent.click(within(dialog).getByLabelText('Paciente inestable'));
    await userEvent.click(within(dialog).getByLabelText(/Se permiten visitas/));
    await next();
    // 5. cama: la sugerida viene elegida y las incompatibles están apagadas con su motivo
    const suggested = await within(dialog).findByRole('button', { name: /C-201, sugerida/ });
    expect(suggested.getAttribute('aria-pressed')).toBe('true');
    expect((within(dialog).getByRole('button', { name: /C-202, no disponible: Ocupada/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: /C-203, no disponible: Habitación ocupada por un paciente de otro sexo/ }) as HTMLButtonElement).disabled).toBe(true);
    await next();
    // 6. resumen y factibilidad
    expect(await within(dialog).findByText('El médico tiene turno en ese horario.')).toBeTruthy();
    expect(within(dialog).getByText(/C-201 · H-201 · planta 2/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: /Confirmar ingreso/ }));
    expect(api.write).toHaveBeenCalledWith('/admisiones', expect.objectContaining({
      patientId: 'p9', origin: 'cita', originId: 'c1', motive: 'Dolor abdominal con fiebre', attendingDoctorId: 'd1', requestedCategory: 'semiprivada',
      isolation: false, unstable: true, postSurgical: false, visitorsAllowed: false, visitorsMax: 0, bedId: 'b1', bedVersion: 3,
    }), 'POST');
  });

  it('sin permiso de cama no hay paso de cama y el ingreso queda pendiente de cama', async () => {
    mount(['admision.ver', 'admision.crear', 'pacientes.buscar']);
    await userEvent.click(await screen.findByRole('button', { name: /Ingresar paciente/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByRole('combobox', { name: /Paciente/ }), 'nueve');
    await userEvent.click(await within(dialog).findByRole('option', { name: /Paciente Ficticio Nueve/ }));
    await next();
    await userEvent.click(await within(dialog).findByLabelText(/Emergencia/));
    await userEvent.click(within(dialog).getByLabelText(/^Emergencia · /));
    await userEvent.type(within(dialog).getByLabelText(/^Motivo del ingreso/), 'Trauma por caída desde altura');
    await next();
    await userEvent.click(within(dialog).getByRole('combobox', { name: /Médico tratante/ }));
    await userEvent.click(await within(dialog).findByRole('option', { name: /Dra\. Ficticia/ }));
    await next();
    await userEvent.click(await within(dialog).findByLabelText(/Semiprivada/));
    expect(within(dialog).getByText(/Paso 4 de 5/)).toBeTruthy();
    await next();
    // S13: without permission there is no bed step; the summary says the admission waits for a bed.
    expect(await within(dialog).findByText('Pendiente de cama (sin permiso para asignar)')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: /Confirmar ingreso/ })).toBeTruthy();
  });

  it('abre el ingreso guiado con ?accion=admision si el rol puede crear admisiones', async () => {
    history.replaceState(null, '', '#/hospitalizacion?accion=admision');
    mount(['admision.ver', 'admision.crear']);
    expect(await screen.findByRole('dialog', { name: 'Ingresar paciente' })).toBeTruthy();
  });
});
