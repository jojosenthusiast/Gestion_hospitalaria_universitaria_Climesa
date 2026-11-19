import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { Dashboard } from '../features/dashboards';
import { localMs, type CatalogArea, type ShiftCatalog, type ShiftRow } from '../features/shifts/rules';
import { areaScope, areaTree, bandOf, hourlyLoad, summarizeDay } from '../features/shifts/bands';
import { weekDays } from '../features/shifts/week';
import permisosCsv from '../../../docs/arquitectura/datos/permisos.csv?raw';

// Owner observations 3, 8, 14 and 20 (2026-11-18): Turnos with heavy data and «Mi turno» for accounts without a staff
// record. Fixed clock: Wednesday 18 November 2026, 09:00 in El Salvador.
const NOW = new Date('2026-11-18T15:00:00.000Z');
const iso = (day: string, time: string) => new Date(localMs(day, time)).toISOString();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); location.hash = ''; });

const areas: CatalogArea[] = [
  { id: 'h', parentId: null, type: 'hospital', code: 'HU', name: 'Hospital Universitario' },
  { id: 'p1', parentId: 'h', type: 'planta', code: 'P1', name: 'Planta 1' },
  { id: 'p2', parentId: 'h', type: 'planta', code: 'P2', name: 'Planta 2' },
  { id: 'emg', parentId: 'p1', type: 'area', code: 'P1-EMG', name: 'Emergencia' },
  { id: 'c101', parentId: 'p1', type: 'consultorio', code: 'C-101', name: 'Consultorio C-101' },
  { id: 'hos', parentId: 'p2', type: 'area', code: 'P2-HOS', name: 'Hospitalización ala norte' },
];
const TYPES = ['medico', 'enfermero', 'asistente', 'limpieza'];
// Long real-looking names (owner: «nombres largos»), 30 shifts on Wednesday: mornings, afternoons, nights that go on
// to Thursday, 24 h guards, overlapping on purpose.
const LONG = 'María de los Ángeles Hernández Castellanos de la Paz';
const person = (i: number) => i === 0 ? LONG : `Persona Ficticia Número ${i + 1} Apellido Largo`;
const staff = Array.from({ length: 30 }, (_, i) => ({ id: `s-${i}`, name: person(i), type: TYPES[i % 4], specialty: null, areaId: i % 3 === 2 ? 'hos' : 'emg', area: i % 3 === 2 ? 'Hospitalización ala norte' : 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] }));
const catalog: ShiftCatalog = { roles: TYPES.map(code => ({ code, name: code })), areas, staff };
const SLOTS: [string, string, string, string][] = [['06:00', '2026-11-18', '14:00', 'diurno'], ['07:00', '2026-11-18', '19:00', 'diurno'], ['13:00', '2026-11-18', '19:00', 'diurno'], ['19:00', '2026-11-19', '07:00', 'nocturno'], ['07:00', '2026-11-19', '07:00', 'guardia']];
const heavy: ShiftRow[] = staff.map((p, i) => {
  const [from, endDay, to, type] = SLOTS[i % SLOTS.length];
  return { id: `t-${i}`, staffId: p.id, person: p.name, staffType: p.type, areaId: p.areaId!, area: p.area!, start: iso('2026-11-18', from), end: iso(endDay, to), type, state: 'publicado', version: 1, attendance: 'pendiente', late: false, allowedActions: ['editar', 'cancelar'] };
});
const gaps = [{ areaId: 'emg', area: 'Emergencia', role: 'MED', start: iso('2026-11-18', '03:00'), end: iso('2026-11-18', '05:00'), required: 2, actual: 1 }];

const profile = (permissions: string[], staffId: string | null = null): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'x@example.test', name: 'Jefatura Ficticia', roles: ['JOP'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId });
const planner = profile(['turnos.ver', 'turnos.planificar', 'turnos.publicar', 'turnos.ver_borradores', 'personal.ver']);
function mount(who: AccessProfile = planner, rows: ShiftRow[] = heavy) {
  const api = {
    request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalog : path.startsWith('/turnos/cobertura') ? { from: '2026-11-16', to: '2026-11-22', gaps } : path.startsWith('/turnos?') ? [] : rows),
    write: vi.fn(async () => ({})),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={who} version={0} />);
  return api;
}

describe('turnos · reglas para leer un día con muchos turnos', () => {
  it('franjas por hora de inicio y duración: mañana, tarde, noche y guardia de 20 h o más', () => {
    expect(bandOf({ start: iso('2026-11-18', '06:00'), end: iso('2026-11-18', '14:00') })).toBe('manana');
    expect(bandOf({ start: iso('2026-11-18', '13:00'), end: iso('2026-11-18', '19:00') })).toBe('tarde');
    expect(bandOf({ start: iso('2026-11-18', '19:00'), end: iso('2026-11-19', '07:00') })).toBe('noche');
    expect(bandOf({ start: iso('2026-11-18', '02:00'), end: iso('2026-11-18', '08:00') })).toBe('noche');
    expect(bandOf({ start: iso('2026-11-18', '07:00'), end: iso('2026-11-19', '07:00') })).toBe('guardia');
    expect(bandOf({ start: iso('2026-11-18', '07:00'), end: iso('2026-11-18', '19:00'), type: 'guardia' })).toBe('guardia');
  });

  it('cada hora dice el mínimo y el máximo de personas de turno y los huecos de cobertura', () => {
    const day = weekDays('2026-11-16')[2];
    const rows = [
      { start: iso('2026-11-17', '19:00'), end: iso('2026-11-18', '06:30'), state: 'publicado' },
      { start: iso('2026-11-18', '06:00'), end: iso('2026-11-18', '14:00'), state: 'en_curso' },
      { start: iso('2026-11-18', '06:00'), end: iso('2026-11-18', '14:00'), state: 'cancelado' },
      { start: iso('2026-11-18', '06:45'), end: iso('2026-11-18', '14:00'), state: 'ausente' },
    ];
    const hours = hourlyLoad(rows, gaps, day);
    expect(hours[4]).toMatchObject({ min: 1, max: 1, missing: 1 });
    expect(hours[3].gaps).toHaveLength(1);
    expect(hours[5]).toMatchObject({ min: 1, max: 1, missing: 0 });
    // From 06:00 to 06:30 the night and the morning overlap; then only the morning. Cancelled and absent never count.
    expect(hours[6]).toMatchObject({ min: 1, max: 2, missing: 0 });
    expect(hours[7]).toMatchObject({ min: 1, max: 1 });
    expect(hours[15]).toMatchObject({ min: 0, max: 0 });
  });

  it('el resumen del día cuenta por franja y rol, y aparte lo que viene de ayer', () => {
    const [, , wednesday, thursday] = weekDays('2026-11-16');
    const typeOf = (t: ShiftRow) => t.staffType ?? undefined;
    const wed = summarizeDay(heavy, wednesday, typeOf);
    expect(wed.total).toBe(30);
    expect(wed.bands.map(b => [b.band, b.count])).toEqual([['manana', 12], ['tarde', 6], ['noche', 6], ['guardia', 6]]);
    expect(wed.bands[0].roles.reduce((n, r) => n + r.count, 0)).toBe(12);
    const thu = summarizeDay(heavy, thursday, typeOf);
    expect([thu.total, thu.carried]).toEqual([0, 12]);
  });

  it('las áreas se agrupan por planta y una planta incluye todas sus áreas', () => {
    expect(areaTree(areas).map(n => [n.area.name, n.children.map(c => c.area.name)])).toEqual([
      ['Planta 1', ['Emergencia', 'Consultorio C-101']], ['Planta 2', ['Hospitalización ala norte']],
    ]);
    expect([...areaScope(areas, 'p1')].sort()).toEqual(['c101', 'emg', 'p1']);
  });
});

describe('turnos · 30 turnos en un día (obs. 8)', () => {
  it('una sola selección de vista, sin la franja «Jornada laboral abierta» y con las herramientas en un menú', async () => {
    mount();
    await screen.findByRole('region', { name: /Semana del 16 al 22 de noviembre/ });
    const vistas = within(screen.getByRole('group', { name: 'Vista' })).getAllByRole('button').map(b => b.textContent);
    expect(vistas).toEqual(['Semana', 'Día', 'Lista', 'Especialistas']);
    expect(screen.queryByRole('group', { name: 'Escala del calendario' })).toBeNull();
    expect(screen.queryByText('Toda la semana')).toBeNull();
    expect(screen.queryByText('Jornada laboral abierta')).toBeNull();
    expect(screen.getByText(/Jornada abierta · Miércoles/)).toBeTruthy();
    // The create action is the shared CRUD «create» button.
    expect(screen.getByRole('button', { name: 'Asignar turno' }).className).toMatch(/crud-create/);
    expect(screen.queryByRole('button', { name: 'Generar rotación' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Herramientas de planificación' }));
    expect(within(screen.getByRole('menu', { name: 'Herramientas de planificación' })).getAllByRole('menuitem').map(m => m.getAttribute('aria-label')))
      .toEqual(['Generar rotación', 'Copiar semana anterior', 'Asignación masiva', 'Plantillas']);
  });

  it('la semana resume el día de 30 turnos por franja y rol, sin nombres cortados a una letra', async () => {
    mount();
    const semana = await screen.findByRole('region', { name: /Semana del 16 al 22 de noviembre/ });
    const hoy = within(semana).getByRole('group', { name: /Hoy, miércoles, 18 de noviembre/ });
    expect(within(hoy).getByText('30 turnos')).toBeTruthy();
    const franjas = within(within(hoy).getByRole('list', { name: 'Turnos por franja' })).getAllByRole('listitem');
    expect(franjas.map(li => li.querySelector('.shift-band-name')?.textContent)).toEqual(['Mañana', 'Tarde', 'Noche', 'Guardia']);
    expect(franjas.map(li => li.querySelector('.shift-band-count')?.textContent)).toEqual(['12', '6', '6', '6']);
    expect(within(hoy).getByRole('img', { name: /Hueco de cobertura de 03:00 a 05:00: Emergencia · Medicina \(1 de 2\)/ })).toBeTruthy();
    const jueves = within(semana).getByRole('group', { name: /Mañana, jueves, 19 de noviembre/ });
    expect(within(jueves).getByText('12 vienen de ayer')).toBeTruthy();
    expect(semana.textContent).not.toContain(LONG.slice(0, 1) + '…');
  });

  it('el día muestra los 30 nombres completos, agrupados por franja, y las personas por hora con sus huecos', async () => {
    mount();
    await screen.findByRole('region', { name: /Semana del 16 al 22 de noviembre/ });
    await userEvent.click(screen.getByRole('button', { name: 'Ver el día Hoy, miércoles, 18 de noviembre' }));
    const dia = screen.getByRole('group', { name: 'Hoy · miércoles 18 de noviembre' });
    expect(dia.querySelectorAll('.shift-bar')).toHaveLength(30);
    expect(within(dia).getByText(LONG)).toBeTruthy();
    expect(within(dia).getAllByRole('region').map(r => r.getAttribute('aria-label'))).toEqual([
      'Personas de turno por hora', 'Mañana: 12 turnos', 'Tarde: 6 turnos', 'Noche: 6 turnos', 'Guardia: 6 turnos',
    ]);
    const horas = within(within(dia).getByRole('region', { name: 'Personas de turno por hora' })).getAllByRole('listitem');
    expect(horas).toHaveLength(24);
    expect(horas[4].getAttribute('aria-label')).toBe('04:00: 0 personas. Hueco, falta 1 persona: Emergencia · Medicina (1 de 2)');
    // 07:00–08:00: the 06:00 and 07:00 mornings plus the 07:00 guards.
    expect(horas[7].getAttribute('aria-label')).toBe('07:00: 18 personas');
    // 13:00–14:00: the 06:00 mornings end at 14:00, the 13:00 afternoons start: 6 + 6 + 6 + 6.
    expect(horas[13].getAttribute('aria-label')).toBe('13:00: 24 personas');
    // The night that goes on to Thursday says so.
    expect(within(dia).getAllByRole('button', { name: /19:00 a 07:00 del día siguiente, Nocturno/ })[0].textContent).toBe('19:00 · sigue mañana');
  });

  it('el área se elige por planta: Planta 1 trae Emergencia y sus consultorios; se puede buscar', async () => {
    mount();
    await screen.findByRole('region', { name: /Semana del 16 al 22 de noviembre/ });
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    const grupo = screen.getByRole('group', { name: 'Área de trabajo' });
    const plantas = [...grupo.querySelectorAll('.shift-area-tree.is-depth-0 > li > .shift-area-option')].map(b => b.textContent);
    expect(plantas).toEqual(['Planta 120', 'Planta 210']);
    await userEvent.click(within(grupo).getByRole('button', { name: /^Planta 1/ }));
    expect(screen.getByText('20 de 30 turnos de la semana')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar filtro Área: Planta 1' })).toBeTruthy();
    await userEvent.type(within(grupo).getByRole('searchbox', { name: 'Buscar área' }), 'consul');
    expect(within(grupo).getAllByRole('button').map(b => b.querySelector('.identity-chip')?.textContent)).toEqual(['Planta 1', 'Consultorio C-101']);
  });

  it('#/turnos?dia=hoy abre la vista Día de hoy', async () => {
    location.hash = '#/turnos?dia=hoy';
    mount(profile(['turnos.ver']));
    expect(await screen.findByRole('group', { name: 'Hoy · miércoles 18 de noviembre' })).toBeTruthy();
    expect(location.hash).toBe('#/turnos');
  });
});

function permisosDe(rol: string) {
  const [cabecera, ...filas] = permisosCsv.replace(/^﻿/, '').trim().split(/\r?\n/);
  const columna = cabecera.split(',').indexOf(rol);
  return filas.map(f => f.split(',')).filter(c => c[columna]?.trim()).map(c => ({ code: c[0], context: c[columna].trim() }));
}
const cuenta = (rol: string, staffId: string | null): AccessProfile => ({ id: 'u', user: { id: 'u' }, email: 'p@example.test', name: 'Persona Ficticia', roles: [rol], platforms: ['web'], permissions: permisosDe(rol), channels: [], patientId: null, staffId });

describe('Inicio · De turno ahora (obs. 3 y 14)', () => {
  const inicio = (who: AccessProfile) => {
    const api = { request: vi.fn(async (path: string) => { if (path === '/turnos') return heavy; if (path === '/turnos/mios') return []; throw new ApiError('No disponible', 503); }), write: vi.fn() };
    render(<Dashboard api={api as unknown as Api} profile={who} version={0} />);
    return api;
  };

  it('ADM sin ficha ve quién está de turno ahora por rol, sin nombres, con enlace al día de hoy', async () => {
    const api = inicio(cuenta('ADM', null));
    const panel = await screen.findByRole('region', { name: 'De turno ahora' });
    // 09:00: the 06:00 and 07:00 mornings and the 07:00 guards: 18 people.
    expect(await within(panel).findByText('personas de turno', { exact: false })).toBeTruthy();
    expect(panel.querySelector('.on-shift-total strong')?.textContent).toBe('18');
    expect(within(within(panel).getByRole('list', { name: 'De turno por rol' })).getAllByRole('listitem')).toHaveLength(4);
    expect(within(panel).queryByText(LONG)).toBeNull();
    expect(within(panel).getByRole('link', { name: /Ver turnos de hoy/ }).getAttribute('href')).toBe('#/turnos?dia=hoy');
    expect(screen.queryByRole('region', { name: 'Mi turno' })).toBeNull();
    expect(api.request).not.toHaveBeenCalledWith('/turnos/mios', expect.anything());
  });

  it('JOP sin ficha también; una cuenta con ficha conserva «Mi turno»', async () => {
    inicio(cuenta('JOP', null));
    expect(await screen.findByRole('region', { name: 'De turno ahora' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Mi turno' })).toBeNull();
    cleanup();
    inicio(cuenta('JOP', 's-0'));
    expect(await screen.findByRole('region', { name: 'Mi turno' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'De turno ahora' })).toBeNull();
  });
});
