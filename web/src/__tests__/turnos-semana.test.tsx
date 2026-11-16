import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { localMs, type ShiftCatalog, type ShiftRow } from '../features/shifts/rules';
import { addWeeks, dayHeading, daySegments, displayState, mondayOf, unionSegments, weekDays, weekLabel } from '../features/shifts/week';

// Martes 10 de noviembre de 2026, 09:00 en El Salvador.
const NOW = new Date('2026-11-10T15:00:00.000Z');
const iso = (day: string, time: string) => new Date(localMs(day, time)).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('turnos · reglas de la semana', () => {
  it('la semana va de lunes a domingo en hora local y los días llevan Hoy, Mañana o Ayer', () => {
    expect(mondayOf(NOW.valueOf())).toBe('2026-11-09');
    // Domingo 23:30 local sigue en la misma semana; el lunes 00:30 ya es la siguiente.
    expect(mondayOf(localMs('2026-11-15', '23:30'))).toBe('2026-11-09');
    expect(mondayOf(localMs('2026-11-16', '00:30'))).toBe('2026-11-16');
    expect(weekDays('2026-11-09').map(d => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(addWeeks('2026-11-30', -1)).toBe('2026-11-23');
    expect(dayHeading('2026-11-10', '2026-11-10')).toMatchObject({ relative: 'Hoy', label: 'martes, 10 de noviembre' });
    expect(dayHeading('2026-11-11', '2026-11-10').relative).toBe('Mañana');
    expect(dayHeading('2026-11-09', '2026-11-10').relative).toBe('Ayer');
    expect(dayHeading('2026-11-13', '2026-11-10').relative).toBeNull();
    expect(weekLabel('2026-11-09')).toBe('9 al 15 de noviembre de 2026');
    expect(weekLabel('2026-11-30')).toBe('30 de noviembre al 6 de diciembre de 2026');
  });

  it('una guardia de 24 h se parte en dos días y los traslapes toman carriles', () => {
    const [mon, tue] = weekDays('2026-11-09');
    const guard: [number, number] = [localMs('2026-11-09', '07:00'), localMs('2026-11-10', '07:00')];
    const morning: [number, number] = [localMs('2026-11-09', '07:00'), localMs('2026-11-09', '15:00')];
    const night: [number, number] = [localMs('2026-11-09', '19:00'), localMs('2026-11-10', '07:00')];
    const items = [guard, morning, night];
    const first = daySegments(items, x => x, mon);
    expect(first.map(s => [s.offset, s.lane, s.lanes, s.startsBefore, s.endsAfter])).toEqual([
      [7 / 24, 0, 2, false, true], [7 / 24, 1, 2, false, false], [19 / 24, 1, 2, false, true],
    ]);
    const second = daySegments(items, x => x, tue);
    expect(second.map(s => [s.offset, s.length, s.startsBefore])).toEqual([[0, 7 / 24, true], [0, 7 / 24, true]]);
    expect(unionSegments([morning, night], x => x, mon).map(u => [u.offset, u.length])).toEqual([[7 / 24, 8 / 24], [19 / 24, 5 / 24]]);
  });

  it('un publicado se ve en curso o completado según el reloj de la pantalla', () => {
    const s = { state: 'publicado', start: iso('2026-11-10', '07:00'), end: iso('2026-11-10', '15:00') };
    expect(displayState(s, localMs('2026-11-10', '06:00'))).toBe('publicado');
    expect(displayState(s, localMs('2026-11-10', '08:00'))).toBe('en_curso');
    expect(displayState(s, localMs('2026-11-10', '16:00'))).toBe('completado');
    expect(displayState({ ...s, state: 'ausente' }, localMs('2026-11-10', '08:00'))).toBe('ausente');
  });
});

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const jefatura = perfil(['turnos.ver', 'turnos.planificar', 'personal.ver']);
const catalogo: ShiftCatalog = {
  roles: [{ code: 'medico', name: 'Médico' }, { code: 'enfermero', name: 'Enfermería' }],
  areas: [{ id: 'a-1', parentId: null, type: 'area', code: 'EMG', name: 'Emergencia' }],
  staff: [
    { id: 's-1', name: 'Ana Ficticia Prueba', type: 'medico', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
    { id: 's-2', name: 'Rosa Enfermera Prueba', type: 'enfermero', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
  ],
};
const turno = (id: string, person: string, start: string, end: string, over: Partial<ShiftRow> = {}): ShiftRow => ({
  id, staffId: person.startsWith('Ana') ? 's-1' : 's-2', person, staffType: person.startsWith('Ana') ? 'medico' : 'enfermero', areaId: 'a-1', area: 'Emergencia',
  start, end, type: 'diurno', state: 'publicado', version: 2, attendance: 'pendiente', late: false, allowedActions: ['editar', 'cancelar', 'marcar_ausente'], ...over,
});
// Desordenados a propósito: la pantalla los ordena por día y hora de inicio.
const turnos: ShiftRow[] = [
  turno('t-3', 'Rosa Enfermera Prueba', iso('2026-11-12', '07:00'), iso('2026-11-12', '15:00')),
  turno('t-2', 'Rosa Enfermera Prueba', iso('2026-11-10', '08:00'), iso('2026-11-10', '14:00'), { state: 'en_curso', attendance: 'presente', allowedActions: ['marcar_presente', 'marcar_ausente'] }),
  turno('t-1', 'Ana Ficticia Prueba', iso('2026-11-10', '07:00'), iso('2026-11-11', '07:00'), { type: 'guardia', state: 'en_curso', attendance: 'presente', allowedActions: ['marcar_presente', 'marcar_ausente'] }),
  turno('t-4', 'Ana Ficticia Prueba', iso('2026-11-18', '07:00'), iso('2026-11-18', '15:00')),
];
const cobertura = { from: '2026-11-09', to: '2026-11-15', gaps: [{ areaId: 'a-1', area: 'Emergencia', role: 'MED', start: iso('2026-11-11', '07:00'), end: iso('2026-11-11', '19:00'), required: 1, actual: 0 }] };

function montar(ancho: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: ancho && query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  const api = {
    request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalogo : path.startsWith('/turnos/cobertura') ? cobertura : turnos),
    write: vi.fn(async () => ({})),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={jefatura} version={0} />);
  return api;
}

describe('turnos · vista semanal', () => {
  it('en pantalla ancha abre la semana actual con un bloque por turno, la guardia de 24 h en dos días y la leyenda', async () => {
    const api = montar(true);
    const semana = await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre de 2026/ });
    expect(screen.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed')).toBe('true');
    const hoy = within(semana).getByRole('group', { name: /Hoy, martes, 10 de noviembre/ });
    const bloques = within(hoy).getAllByRole('button').map(b => b.getAttribute('aria-label'));
    expect(bloques).toEqual([
      'Ana Ficticia Prueba, Emergencia, 07:00 a 07:00 del día siguiente, Guardia / 24 h, En curso',
      'Rosa Enfermera Prueba, Emergencia, 08:00 a 14:00, Diurno, En curso',
    ]);
    const manana = within(semana).getByRole('group', { name: /Mañana, miércoles, 11 de noviembre/ });
    expect(within(manana).getByRole('button', { name: /Ana Ficticia Prueba.*Guardia/ }).textContent).toMatch(/viene de ayer/);
    // El hueco de cobertura se ve en su día y hora.
    expect(within(manana).getByRole('img', { name: /Hueco de cobertura de 07:00 a 19:00: Emergencia · Medicina \(0 de 1\)/ })).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/turnos/cobertura?from=2026-11-09&to=2026-11-15', expect.anything());
    const leyenda = screen.getByRole('list', { name: 'Estados del turno' });
    expect(within(leyenda).getAllByRole('listitem').map(i => i.textContent)).toEqual(['Borrador', 'Publicado', 'En curso', 'Completado', 'Ausente', 'Cancelado']);
    // El turno de la semana siguiente no aparece hasta avanzar.
    expect(screen.queryByRole('button', { name: /18:00|2026-11-18/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    expect(await screen.findByRole('region', { name: /Semana del 16 al 22 de noviembre/ })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Ana Ficticia Prueba, Emergencia, 07:00 a 15:00/ })).toHaveLength(1);
  });

  it('un bloque abre el turno con solo las acciones que permite la API', async () => {
    montar(true);
    await userEvent.click(await screen.findByRole('button', { name: /Rosa Enfermera Prueba, Emergencia, 08:00 a 14:00/ }));
    const detalle = await screen.findByRole('dialog', { name: 'Rosa Enfermera Prueba' });
    expect(within(detalle).getByText(/Entrada confirmada automáticamente/)).toBeTruthy();
    expect(within(detalle).queryByRole('button', { name: /Editar/ })).toBeNull();
    await userEvent.click(within(detalle).getByRole('button', { name: 'Registrar asistencia' }));
    expect(await screen.findByRole('dialog', { name: 'Asistencia del turno' })).toBeTruthy();
  });

  it('la lista agrupa por día con encabezados y ordena por hora de inicio', async () => {
    montar(false);
    expect(screen.getByRole('button', { name: 'Lista por día' }).getAttribute('aria-pressed')).toBe('true');
    const dias = await screen.findAllByRole('heading', { level: 3 });
    expect(dias.map(h => h.textContent)).toEqual(['Hoy · martes, 10 de noviembre2 turnos', 'Jueves, 12 de noviembre1 turno']);
    const hoy = screen.getByRole('region', { name: /Hoy · martes, 10 de noviembre/ });
    expect(within(hoy).getAllByRole('row').slice(1).map(r => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      expect.stringContaining('Ana Ficticia'), expect.stringContaining('Rosa Enfermera'),
    ]);
    expect(within(hoy).getByText('07:00 a 07:00 del día siguiente')).toBeTruthy();
  });
});

describe('turnos · guardia de 24 h en un clic', () => {
  it('el botón Guardia 24 h fija tipo guardia y un fin 24 h después del inicio', async () => {
    const api = montar(false);
    await userEvent.click(await screen.findByRole('button', { name: /Asignar turno/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Área' }));
    await userEvent.click(await screen.findByRole('option', { name: /Emergencia/ }));
    fireEvent.change(within(dialogo).getByLabelText('Fecha de inicio'), { target: { value: '2026-11-20' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardia 24 h' }));
    expect((within(dialogo).getByLabelText('Hora de inicio') as HTMLInputElement).value).toBe('07:00');
    expect((within(dialogo).getByLabelText('Hora de fin') as HTMLInputElement).value).toBe('07:00');
    expect((within(dialogo).getByRole('radio', { name: 'Guardia / 24 h' }) as HTMLInputElement).checked).toBe(true);
    expect(within(dialogo).getByText(/Duración:/).textContent).toMatch(/24 h/);
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Persona' }));
    await userEvent.click(screen.getByRole('option', { name: /Rosa Enfermera/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Asignar turno' }));
    expect(api.write).toHaveBeenCalledWith('/turnos', expect.objectContaining({ type: 'guardia', start: iso('2026-11-20', '07:00'), end: iso('2026-11-21', '07:00') }), 'POST');
  });
});
