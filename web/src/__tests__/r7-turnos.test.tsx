import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { localMs, type ShiftCatalog, type ShiftRow } from '../features/shifts/rules';

/** R7 U3, journeys F1 and F3 "Comprobaciones". Fixed clock: Wednesday 2026-12-02, 09:00 in El Salvador. */
const NOW = new Date('2026-12-02T15:00:00.000Z');
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

const profile = (permissions: string[], staffId: string | null = null): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'x@example.test', name: 'Rosa Enfermera Prueba', roles: ['JOP'], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId });
const planner = profile(['turnos.ver', 'turnos.planificar', 'turnos.publicar', 'turnos.ver_borradores', 'personal.ver']);
const registrations = [{ validFrom: '2026-01-01', validTo: '2026-12-31' }];
const catalog: ShiftCatalog = {
  roles: [{ code: 'enfermero', name: 'Enfermería' }],
  areas: [{ id: 'a-1', parentId: null, type: 'area', code: 'P1-EMG', name: 'Emergencia' }, { id: 'a-2', parentId: null, type: 'area', code: 'P1-HOS', name: 'Hospitalización' }],
  staff: [
    { id: 's-2', name: 'Rosa Enfermera Prueba', type: 'enfermero', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations },
    { id: 's-3', name: 'Luis Enfermero Prueba', type: 'enfermero', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations },
  ],
};
const shift = (id: string, staffId: string, day: string, over: Partial<ShiftRow> = {}): ShiftRow => {
  const p = catalog.staff.find(s => s.id === staffId)!;
  return { id, staffId, person: p.name, staffType: p.type, areaId: 'a-1', area: 'Emergencia', start: iso(day, '07:00'), end: iso(day, '15:00'), type: 'diurno', state: 'publicado', version: 1, attendance: 'pendiente', late: false, allowedActions: [], ...over };
};
const week: ShiftRow[] = [
  shift('t-rosa', 's-2', '2026-12-02'),
  shift('t-luis', 's-3', '2026-12-02'),
  shift('b-emg', 's-3', '2026-12-03', { state: 'borrador', attendance: null }),
  shift('b-hos-1', 's-2', '2026-12-04', { state: 'borrador', attendance: null, areaId: 'a-2', area: 'Hospitalización' }),
  shift('b-hos-2', 's-3', '2026-12-05', { state: 'borrador', attendance: null, areaId: 'a-2', area: 'Hospitalización' }),
];

function mount(who: AccessProfile, write: (path: string, body: unknown) => unknown = () => ({})) {
  const api = {
    request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalog : path.startsWith('/turnos/cobertura') ? { from: '2026-11-30', to: '2026-12-06', gaps: [] } : path === '/turnos/plantillas' ? [] : path.startsWith('/turnos?') ? [] : week),
    write: vi.fn(async (path: string, body: unknown) => write(path, body)),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={who} version={0} />);
  return api;
}

describe('R7 F1 · generar y publicar la semana', () => {
  it('«Atrás» en la vista previa vuelve al generador con todo lo llenado', async () => {
    mount(planner, path => path === '/turnos/generar' ? { items: [{ staffId: 's-2', person: 'Rosa Enfermera Prueba', areaId: 'a-1', start: iso('2026-12-07', '07:00'), end: iso('2026-12-07', '15:00'), type: 'diurno', ok: true }], huecos: [] } : {});
    await userEvent.click(await screen.findByRole('button', { name: 'Generar rotación' }));
    let generator = await screen.findByRole('dialog', { name: 'Generar rotación' });
    await userEvent.selectOptions(within(generator).getByLabelText('Área de los turnos'), 'a-1');
    await userEvent.click(within(generator).getByLabelText('Rosa Enfermera Prueba'));
    fireEvent.change(within(generator).getByLabelText('Desde'), { target: { value: '2026-12-07' } });
    await userEvent.click(within(generator).getByRole('button', { name: 'Ver vista previa' }));
    const preview = await screen.findByRole('dialog', { name: 'Vista previa de los borradores' });
    expect(screen.queryByRole('dialog', { name: 'Generar rotación' })).toBeNull();
    await userEvent.click(within(preview).getByRole('button', { name: 'Atrás' }));
    generator = await screen.findByRole('dialog', { name: 'Generar rotación' });
    expect((within(generator).getByLabelText('Área de los turnos') as HTMLSelectElement).value).toBe('a-1');
    expect((within(generator).getByLabelText('Rosa Enfermera Prueba') as HTMLInputElement).checked).toBe(true);
    expect((within(generator).getByLabelText('Desde') as HTMLInputElement).value).toBe('07/12/2026');
  });

  it('con el filtro de un área, la confirmación dice qué áreas se publican y ofrece «Publicar todas las áreas»', async () => {
    const api = mount(planner, () => ({ from: '2026-11-30', to: '2026-12-06', published: 3, warnings: [] }));
    await screen.findAllByText('Luis Enfermero Prueba');
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await userEvent.click(screen.getAllByRole('button', { name: /Hospitalización/ }).find(b => b.classList.contains('shift-pill'))!);
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar semana (2 borradores)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publicar semana' });
    expect(within(dialog).getByRole('radio', { name: 'Solo Hospitalización (2)' })).toBeTruthy();
    expect(within(within(dialog).getByRole('list', { name: 'Borradores por área' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Hospitalización2 borradores']);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Publicar todas las áreas (3)' }));
    expect(within(within(dialog).getByRole('list', { name: 'Borradores por área' })).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Emergencia1 borrador', 'Hospitalización2 borradores']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publicar (3)' }));
    expect(api.write).toHaveBeenCalledWith('/turnos/publicar', { from: '2026-11-30', to: '2026-12-06' }, 'POST');
  });
});

describe('R7 F3 · Mis turnos', () => {
  it('#/turnos?persona=yo muestra solo los turnos de quien entra', async () => {
    location.hash = '#/turnos?persona=yo';
    mount(profile(['turnos.ver'], 's-2'));
    expect(await screen.findByText('Persona: Rosa Enfermera Prueba (yo)')).toBeTruthy();
    expect(screen.queryByText('Luis Enfermero Prueba')).toBeNull();
    expect(location.hash).toBe('#/turnos');
  });
});
