import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { localMs, type ShiftCatalog, type ShiftRow } from '../features/shifts/rules';
import { entryAt } from '../features/shifts/AttendanceDialog';
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
    expect(weekLabel('2026-11-09', { today: '2026-11-18' })).toBe('9 al 15 de noviembre');
    expect(weekLabel('2026-11-30', { today: '2026-11-18' })).toBe('30 de noviembre al 6 de diciembre');
    expect(weekLabel('2026-12-28', { today: '2026-11-18' })).toBe('28 de diciembre al 3 de enero de 2027');
    expect(weekLabel('2026-11-09', { withYear: true, today: '2026-11-18' })).toBe('9 al 15 de noviembre de 2026');
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

function montar(ancho: boolean, lista: ShiftRow[] = turnos, semana: (path: string) => ShiftRow[] = () => []) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: ancho && query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  const api = {
    request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalogo : path.startsWith('/turnos/cobertura') ? cobertura : path.startsWith('/turnos?') ? semana(path) : lista),
    write: vi.fn(async () => ({})),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={jefatura} version={0} />);
  return api;
}

describe('turnos · vista semanal', () => {
  it('en pantalla ancha abre la semana como resumen por día: franjas, roles, lo que viene de ayer y los huecos', async () => {
    const api = montar(true);
    const semana = await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre$/ });
    expect(screen.getByRole('button', { name: 'Semana' }).getAttribute('aria-pressed')).toBe('true');
    const hoy = within(semana).getByRole('group', { name: /Hoy, martes, 10 de noviembre/ });
    expect(within(hoy).getByText('2 turnos')).toBeTruthy();
    const franjas = within(within(hoy).getByRole('list', { name: 'Turnos por franja' })).getAllByRole('listitem').map(li => li.textContent);
    expect(franjas).toEqual(['Mañana1Enfermería 1', 'Guardia1Médico 1']);
    const manana = within(semana).getByRole('group', { name: /Mañana, miércoles, 11 de noviembre/ });
    expect(within(manana).getByText('1 viene de ayer')).toBeTruthy();
    // El hueco de cobertura se ve en su día y hora.
    expect(within(manana).getByRole('img', { name: /Hueco de cobertura de 07:00 a 19:00: Emergencia · Medicina \(0 de 1\)/ })).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/turnos/cobertura?from=2026-11-09&to=2026-11-15', expect.anything());
    // Sin nombres de una letra: la semana no dibuja bloques por persona.
    expect(semana.querySelector('.shift-bar, .shift-block')).toBeNull();
    // El turno de la semana siguiente no aparece hasta avanzar; desde su día se abre la vista Día con el nombre completo.
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    const siguiente = await screen.findByRole('region', { name: /Semana del 16 al 22 de noviembre/ });
    await userEvent.click(within(siguiente).getByRole('button', { name: 'Ver el día miércoles, 18 de noviembre' }));
    expect(screen.getByRole('button', { name: 'Día' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('button', { name: /Ana Ficticia Prueba, Emergencia, 07:00 a 15:00/ })).toHaveLength(1);
    const leyenda = screen.getByRole('list', { name: 'Estados del turno' });
    expect(within(leyenda).getAllByRole('listitem').map(i => i.textContent)).toEqual(['Borrador', 'Publicado', 'En curso', 'Completado', 'Ausente', 'Cancelado']);
  });

  it('la vista Día muestra nombres completos, la guardia que sigue mañana y la que viene de ayer', async () => {
    montar(true);
    await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre$/ });
    await userEvent.click(screen.getByRole('button', { name: 'Día' }));
    const hoy = screen.getByRole('group', { name: 'Hoy · martes 10 de noviembre' });
    expect(within(hoy).getAllByRole('button').filter(b => b.classList.contains('shift-bar')).map(b => b.getAttribute('aria-label'))).toEqual([
      'Rosa Enfermera Prueba, Emergencia, 08:00 a 14:00, Diurno, En curso',
      'Ana Ficticia Prueba, Emergencia, 07:00 a 07:00 del día siguiente, Guardia / 24 h, En curso',
    ]);
    expect(within(hoy).getByText('Ana Ficticia Prueba')).toBeTruthy();
    expect(within(hoy).getByRole('button', { name: /Ana Ficticia Prueba.*Guardia/ }).textContent).toMatch(/07:00 · sigue mañana/);
    // El día elegido se lee completo en su botón, no cortado.
    await userEvent.click(screen.getByRole('button', { name: 'mié 11' }));
    expect(screen.getByRole('button', { name: 'Mañana · miércoles 11 de noviembre' }).getAttribute('aria-pressed')).toBe('true');
    const manana = screen.getByRole('group', { name: 'Mañana · miércoles 11 de noviembre' });
    expect(within(manana).getByRole('button', { name: /Ana Ficticia Prueba.*Guardia/ }).textContent).toMatch(/viene de ayer/);
    expect(within(manana).getByRole('region', { name: 'Vienen de ayer: 1 turno' })).toBeTruthy();
  });

  it('un turno de la vista Día abre su detalle con solo las acciones que permite la API', async () => {
    montar(true);
    await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre$/ });
    await userEvent.click(screen.getByRole('button', { name: 'Día' }));
    await userEvent.click(await screen.findByRole('button', { name: /Rosa Enfermera Prueba, Emergencia, 08:00 a 14:00/ }));
    const detalle = await screen.findByRole('dialog', { name: 'Rosa Enfermera Prueba' });
    expect(within(detalle).getByText(/Entrada confirmada automáticamente/)).toBeTruthy();
    expect(within(detalle).queryByRole('button', { name: /Editar/ })).toBeNull();
    await userEvent.click(within(detalle).getByRole('button', { name: 'Registrar asistencia' }));
    expect(await screen.findByRole('dialog', { name: 'Asistencia del turno' })).toBeTruthy();
  });

  it('la lista agrupa por día con encabezados y ordena por hora de inicio', async () => {
    montar(false);
    expect(screen.getByRole('button', { name: 'Lista' }).getAttribute('aria-pressed')).toBe('true');
    const dias = await screen.findAllByRole('heading', { level: 3 });
    // Todos los días tienen su ancla; la guardia del martes también aparece el miércoles, al que llega. Hoy va primero y
    // los días pasados quedan plegados al final (S12).
    expect(dias.map(h => h.textContent)).toEqual([
      'Hoy · martes, 10 de noviembre2 turnos', 'Mañana · miércoles, 11 de noviembre1 turno',
      'Jueves, 12 de noviembre1 turno', 'Viernes, 13 de noviembreSin turnos', 'Sábado, 14 de noviembreSin turnos', 'Domingo, 15 de noviembreSin turnos',
      'Ayer · lunes, 9 de noviembreSin turnos',
    ]);
    expect(within(screen.getByRole('region', { name: /Mañana · miércoles/ })).getByText('Viene del día anterior')).toBeTruthy();
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

describe('turnos · días, reloj y semanas lejanas', () => {
  const guardia = (n: number) => turno(`g-${n}`, n % 2 ? 'Ana Ficticia Prueba' : 'Rosa Enfermera Prueba', iso('2026-11-10', '07:00'), iso('2026-11-11', '07:00'), { type: 'guardia', state: 'en_curso', attendance: 'presente', allowedActions: ['marcar_presente', 'marcar_ausente'] });

  it('cinco guardias martes 07:00 a miércoles 07:00: el miércoles dice que vienen de ayer y su día las lista con nombre', async () => {
    montar(true, [1, 2, 3, 4, 5].map(guardia));
    const semana = await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre/ });
    const miercoles = within(semana).getByRole('group', { name: /Mañana, miércoles, 11 de noviembre/ });
    expect(within(miercoles).getByText('5 vienen de ayer')).toBeTruthy();
    await userEvent.click(within(miercoles).getByRole('button', { name: /Ver el día/ }));
    const dia = screen.getByRole('group', { name: 'Mañana · miércoles 11 de noviembre' });
    expect(within(dia).getAllByText('viene de ayer a 07:00')).toHaveLength(5);
    expect(within(dia).getByRole('region', { name: 'Vienen de ayer: 5 turnos' })).toBeTruthy();
  });

  it('el lunes muestra la guardia que empezó el domingo anterior', async () => {
    montar(false, [turno('n-1', 'Rosa Enfermera Prueba', iso('2026-11-08', '19:00'), iso('2026-11-09', '07:00'), { type: 'nocturno', state: 'completado', attendance: 'presente', allowedActions: [] })]);
    const lunes = await screen.findByRole('region', { name: /Ayer · lunes, 9 de noviembre/ });
    expect(within(lunes).getByText('Viene del día anterior')).toBeTruthy();
    expect(within(lunes).getByText(/Rosa Enfermera Prueba/)).toBeTruthy();
  });

  it('al llegar la hora de inicio deja de ofrecer editar y cancelar y vuelve a pedir los turnos', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    const api = montar(false, [turno('p-1', 'Ana Ficticia Prueba', iso('2026-11-10', '09:30'), iso('2026-11-10', '15:30'))]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByRole('button', { name: 'Cancelar turno de Ana Ficticia Prueba' })).toBeTruthy();
    const antes = api.request.mock.calls.filter(([path]) => path === '/turnos').length;
    await act(async () => { await vi.advanceTimersByTimeAsync(31 * 60_000); });
    expect(screen.queryByRole('button', { name: 'Cancelar turno de Ana Ficticia Prueba' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Editar/ })).toBeNull();
    expect(api.request.mock.calls.filter(([path]) => path === '/turnos').length).toBeGreaterThan(antes);
  });

  it('una semana fuera de la ventana por omisión se pide con from y to, sin mostrar una semana vacía falsa', async () => {
    const lejano = turno('l-1', 'Ana Ficticia Prueba', iso('2027-02-09', '07:00'), iso('2027-02-09', '15:00'));
    const api = montar(true, turnos, path => path === '/turnos?from=2027-02-07&to=2027-02-14' ? [lejano] : []);
    await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre/ });
    for (let i = 0; i < 13; i++) fireEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    const martes = await screen.findByRole('group', { name: /martes, 9 de febrero/ });
    expect(await within(martes).findByText('1 turno')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/turnos?from=2027-02-07&to=2027-02-14', expect.anything());
  });
});

describe('turnos · hora real de entrada', () => {
  it('en un turno de noche, las 18:45 son del mismo día y las 06:30 del día siguiente', () => {
    const noche = { start: iso('2026-11-10', '19:00'), end: iso('2026-11-11', '07:00') };
    expect(entryAt(noche, '18:45')).toBe(localMs('2026-11-10', '18:45'));
    expect(entryAt(noche, '06:30')).toBe(localMs('2026-11-11', '06:30'));
    expect(entryAt({ start: iso('2026-11-10', '07:00'), end: iso('2026-11-10', '15:00') }, '07:20')).toBe(localMs('2026-11-10', '07:20'));
  });
});
