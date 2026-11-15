import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { loadFor, localMs, restUntil, conflictsFor, type ShiftCatalog, type ShiftRow } from '../features/shifts/rules';

// jsdom no implementa <dialog>: lo abrimos con el atributo para que sus campos sean accesibles.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const jefatura = perfil(['turnos.ver', 'turnos.planificar', 'personal.ver']);
const catalogo: ShiftCatalog = {
  roles: [{ code: 'medico', name: 'Médico' }],
  areas: [{ id: 'a-1', parentId: null, type: 'area', code: 'EMG', name: 'Emergencia' }],
  staff: [
    { id: 's-1', name: 'Ana Ficticia Prueba', type: 'medico', specialty: 'Pediatría', areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
    { id: 's-2', name: 'Berta Suplente Prueba', type: 'medico', specialty: 'Pediatría', areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
  ],
};
const turno = (over: Partial<ShiftRow> = {}): ShiftRow => ({
  id: 't-1', staffId: 's-1', person: 'Ana Ficticia Prueba', areaId: 'a-1', area: 'Emergencia', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T22:00:00.000Z',
  type: 'diurno', state: 'en_curso', version: 4, attendance: 'sin_confirmar', late: false, allowedActions: ['marcar_presente', 'marcar_ausente'], ...over,
});
const semana = { from: '2026-11-09', to: '2026-11-15', items: [
  { date: '2026-11-10', specialty: 'Pediatría', name: 'Ana Ficticia Prueba', area: 'Emergencia', start: '2026-11-10T14:00:00.000Z', end: '2026-11-10T22:00:00.000Z', attendance: 'ausente' },
  { date: '2026-11-10', specialty: 'Medicina general', name: 'Carlos General Prueba', area: 'Consulta externa', start: '2026-11-10T13:00:00.000Z', end: '2026-11-10T20:00:00.000Z', attendance: 'presente' },
] };

function montar(turnos: ShiftRow[], escritura: (path: string, body: unknown, method?: string) => Promise<unknown> = async () => ({})) {
  const api = {
    request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalogo : path.startsWith('/turnos/especialistas') ? semana : turnos),
    write: vi.fn(escritura),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={jefatura} version={0} />);
  return api;
}

describe('turnos · acciones según el servidor (allowedActions)', () => {
  it('un turno iniciado no ofrece editar ni cancelar; ofrece asistencia si la API lo permite', async () => {
    montar([turno(), turno({ id: 't-2', state: 'completado', attendance: 'presente', allowedActions: [] })]);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /^Editar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cancelar turno de/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Asistencia de Ana/ })).toHaveLength(1);
    expect(screen.getAllByText('Sin entrada marcada').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Presente').length).toBeGreaterThan(0);
  });

  it('avisa los turnos en curso sin entrada y los filtra con un clic', async () => {
    montar([turno(), turno({ id: 't-2', person: 'Otra Persona', staffId: 's-2', attendance: 'presente', allowedActions: [] })]);
    await screen.findByRole('table');
    expect(screen.getByText(/Un turno en curso no tiene la entrada marcada/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Ver turnos sin entrada' }));
    expect(screen.getByText('1 de 2 turnos')).toBeTruthy();
  });
});

describe('turnos · asistencia (POST /turnos/{id}/asistencia)', () => {
  it('la ausencia pide tipo y motivo, envía la versión y luego muestra citas y suplentes; asignar prellena el turno', async () => {
    const api = montar([turno()], async () => ({ id: 't-1', version: 5, state: 'ausente', attendance: 'ausente', late: false,
      affectedAppointments: [{ id: 'c-1', start: '2026-11-10T16:00:00.000Z', end: '2026-11-10T16:20:00.000Z', state: 'confirmada' }],
      substitutes: [{ id: 's-2', name: 'Berta Suplente Prueba', type: 'medico', specialty: 'Pediatría', area: 'Emergencia' }] }));
    await userEvent.click(await screen.findByRole('button', { name: /Asistencia de Ana/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asistencia del turno' });
    // La primera opción es la píldora; el botón de envío toma el nombre de la opción elegida.
    await userEvent.click(within(dialogo).getAllByRole('button', { name: 'Marcar ausencia' })[0]);
    const enviar = within(dialogo).getAllByRole('button', { name: /Marcar ausencia/ }).at(-1)!;
    await userEvent.click(enviar);
    expect(api.write).not.toHaveBeenCalled();
    expect(within(dialogo).getByText(/justificada o injustificada/)).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Injustificada' }));
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la ausencia'), 'No se presentó ni avisó');
    await userEvent.click(enviar);
    expect(api.write).toHaveBeenCalledWith('/turnos/t-1/asistencia', { state: 'ausente', version: 4, absenceType: 'injustificada', reason: 'No se presentó ni avisó' }, 'POST');
    const hecho = await screen.findByRole('dialog', { name: 'Ausencia registrada' });
    expect(within(hecho).getByText(/Citas que hay que reprogramar/)).toBeTruthy();
    await userEvent.click(within(hecho).getByRole('button', { name: 'Asignar turno' }));
    const formulario = await screen.findByRole('dialog', { name: 'Asignar turno' });
    expect(within(formulario).getByRole('group', { name: 'Persona' }).textContent).toMatch(/Berta Suplente/);
    expect(within(formulario).getByRole('group', { name: 'Área' }).textContent).toMatch(/Emergencia/);
  });

  it('marcar la entrada de un turno ya terminado exige la hora', async () => {
    const api = montar([turno({ state: 'completado', start: '2026-01-10T14:00:00.000Z', end: '2026-01-10T22:00:00.000Z', allowedActions: ['marcar_presente'] })]);
    await userEvent.click(await screen.findByRole('button', { name: /Asistencia de Ana/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asistencia del turno' });
    fireEvent.change(within(dialogo).getByLabelText('Hora de entrada'), { target: { value: '08:10' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Marcar entrada' }));
    expect(api.write).toHaveBeenCalledWith('/turnos/t-1/asistencia', { state: 'presente', version: 4, at: '2026-01-10T14:10:00.000Z' }, 'POST');
  });
});

describe('turnos · cancelar con citas (MA-TUR-05)', () => {
  it('explica que Recepción debe reprogramar las citas, con sus horas', async () => {
    montar([turno({ state: 'publicado', attendance: 'pendiente', allowedActions: ['editar', 'cancelar'] })], async () => {
      throw new ApiError('El médico tiene una cita en ese horario.', 409, 'turno_con_citas', undefined, { citas: [{ id: 'c-1', start: '2026-11-10T16:00:00.000Z' }] });
    });
    await userEvent.click(await screen.findByRole('button', { name: /Cancelar turno de Ana/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar turno' });
    await userEvent.type(within(dialogo).getByLabelText('Motivo de la cancelación'), 'Licencia por capacitación');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar turno' }));
    expect(await within(dialogo).findByText(/Pide a Recepción que las reprograme o cancele desde Citas/)).toBeTruthy();
  });
});

describe('turnos · carga y emergencia (CARGA-01, CARGA-07)', () => {
  it('si la API pide una emergencia, aparece el motivo y se reenvía con emergencyReason', async () => {
    let intento = 0;
    const api = montar([], async () => { if (intento++ === 0) throw new ApiError('Supera el tope de 72 h en 7 días.', 409, 'carga_semanal_excedida'); return { id: 'n', version: 1, advertencias: [] }; });
    await userEvent.click(await screen.findByRole('button', { name: /Asignar turno/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Área' }));
    await userEvent.click(await screen.findByRole('option', { name: /Emergencia/ }));
    fireEvent.change(within(dialogo).getByLabelText('Fecha de inicio'), { target: { value: '2026-11-20' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de inicio'), { target: { value: '07:00' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de fin'), { target: { value: '15:00' } });
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Persona' }));
    await userEvent.click(screen.getByRole('option', { name: /Ana Ficticia/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Asignar turno' }));
    const motivo = await within(dialogo).findByLabelText('Motivo de la emergencia');
    expect(within(dialogo).getByRole('button', { name: 'Asignar turno' }).hasAttribute('disabled')).toBe(true);
    await userEvent.type(motivo, 'Brote sin otra persona disponible');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Asignar turno' }));
    expect(api.write).toHaveBeenLastCalledWith('/turnos', expect.objectContaining({ emergencyReason: 'Brote sin otra persona disponible' }), 'POST');
  });

  it('la carga cuenta el turno propuesto, la ventana de 7 días y los días seguidos; las ausencias no cuentan', () => {
    const t = (id: string, day: string, state = 'publicado'): ShiftRow => ({ id, staffId: 'p', person: 'P', areaId: 'a', area: 'A', start: new Date(localMs(day, '07:00')).toISOString(), end: new Date(localMs(day, '19:00')).toISOString(), type: 'diurno', state, version: 1 });
    const shifts = [t('1', '2026-11-16'), t('2', '2026-11-17'), t('3', '2026-11-18', 'ausente'), t('4', '2026-11-19')];
    expect(loadFor('p', localMs('2026-11-20', '07:00'), localMs('2026-11-20', '19:00'), shifts)).toEqual({ hours7Days: 48, daysInRow: 2 });
  });

  it('dos noches seguidas con 12 h de descanso no son conflicto; una guardia de 24 h sí exige descanso', () => {
    const night = { id: 'n', staffId: 'p', person: 'P', areaId: 'a', area: 'A', start: new Date(localMs('2026-11-20', '18:00')).toISOString(), end: new Date(localMs('2026-11-21', '06:00')).toISOString(), type: 'nocturno', state: 'publicado', version: 1 };
    const persona = { id: 'p', name: 'P', type: 'asistente', specialty: null, areaId: null, area: null, registrations: [] };
    expect(conflictsFor(persona, localMs('2026-11-21', '18:00'), localMs('2026-11-22', '06:00'), 'nocturno', [night])).toEqual([]);
    expect(restUntil(localMs('2026-11-20', '07:00'), localMs('2026-11-21', '07:00'))).toBe(localMs('2026-11-22', '00:00'));
  });
});

describe('turnos · especialistas de la semana (CARGA-04)', () => {
  it('agrupa por día y especialidad y marca al ausente', async () => {
    montar([]);
    await userEvent.click(await screen.findByRole('button', { name: 'Especialistas de la semana' }));
    const vista = await screen.findByRole('region', { name: 'Especialistas de la semana' });
    expect(await within(vista).findByText('Pediatría')).toBeTruthy();
    expect(within(vista).getByText('Medicina general')).toBeTruthy();
    expect(within(vista).getByText('Ausente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Asignar turno/ })).toBeNull();
  });
});
