import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { ShiftsPage } from '../features/personnel';
import { localMs, type ShiftCatalog, type ShiftRow } from '../features/shifts/rules';
import { applyTemplate, bulkItems, copyWeek, dragResult, splitDays, templateFromWeek } from '../features/shifts/plan';
import { weekDays } from '../features/shifts/week';

// Fase 2, flujo F (S12). Martes 10 de noviembre de 2026, 09:00 en El Salvador.
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

/** Owner obs 8: the batch tools live in one «Herramientas de planificación» menu. */
async function planningTool(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Herramientas de planificación' }));
  await userEvent.click(screen.getByRole('menuitem', { name }));
}

const perfil = (permisos: string[]): AccessProfile => ({
  id: 'u-1', user: { id: 'u-1' }, email: 'jop@example.test', name: 'Jefatura de prueba', roles: ['JOP'], platforms: ['web'],
  permissions: permisos.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null,
});
const jefatura = perfil(['turnos.ver', 'turnos.planificar', 'turnos.publicar', 'turnos.ver_borradores', 'personal.ver']);
const catalogo: ShiftCatalog = {
  roles: [{ code: 'medico', name: 'Médico' }, { code: 'enfermero', name: 'Enfermería' }],
  areas: [{ id: 'a-1', parentId: null, type: 'area', code: 'P1-EMG', name: 'Emergencia' }, { id: 'a-2', parentId: null, type: 'area', code: 'P1-CON', name: 'Consulta externa' }],
  staff: [
    { id: 's-1', name: 'Ana Ficticia Prueba', type: 'medico', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
    { id: 's-2', name: 'Rosa Enfermera Prueba', type: 'enfermero', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
    { id: 's-3', name: 'Luis Enfermero Prueba', type: 'enfermero', specialty: null, areaId: 'a-1', area: 'Emergencia', registrations: [{ validFrom: '2026-01-01', validTo: '2026-12-31' }] },
  ],
};
const turno = (id: string, staffId: string, start: string, end: string, over: Partial<ShiftRow> = {}): ShiftRow => {
  const p = catalogo.staff.find(s => s.id === staffId)!;
  return { id, staffId, person: p.name, staffType: p.type, areaId: 'a-1', area: 'Emergencia', start, end, type: 'diurno', state: 'publicado', version: 1, attendance: 'pendiente', late: false, allowedActions: ['editar', 'cancelar', 'marcar_ausente'], ...over };
};
const turnos: ShiftRow[] = [
  turno('t-pasado', 's-1', iso('2026-11-09', '07:00'), iso('2026-11-09', '15:00'), { state: 'completado', attendance: 'presente', allowedActions: [] }),
  turno('t-hoy', 's-2', iso('2026-11-10', '13:00'), iso('2026-11-10', '19:00')),
  turno('t-borrador', 's-3', iso('2026-11-12', '07:00'), iso('2026-11-12', '15:00'), { state: 'borrador', attendance: null }),
  turno('t-anterior', 's-1', iso('2026-11-03', '07:00'), iso('2026-11-03', '15:00'), { state: 'completado', attendance: 'presente', allowedActions: [] }),
];
const cobertura = { from: '2026-11-09', to: '2026-11-15', gaps: [] };

type Writer = (path: string, body: any, method: string) => unknown;
function montar(ancho: boolean, write: Writer = () => ({}), lista: ShiftRow[] = turnos) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: ancho && query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  const api = {
    request: vi.fn(async (path: string) => path === '/turnos/catalogo' ? catalogo : path.startsWith('/turnos/cobertura') ? cobertura : path === '/turnos/plantillas' ? [] : path.startsWith('/turnos?') ? [] : lista),
    write: vi.fn(async (path: string, body: any, method = 'POST') => write(path, body, method)),
  };
  render(<ShiftsPage api={api as unknown as Api} profile={jefatura} version={0} />);
  return api;
}

describe('turnos · reglas puras de planificación', () => {
  it('arrastrar mueve en pasos de 30 min y entre días; estirar cambia solo el fin', () => {
    const t = { start: iso('2026-11-12', '07:00'), end: iso('2026-11-12', '15:00') };
    expect(dragResult(t, 'move', 50)).toEqual({ start: iso('2026-11-12', '08:00'), end: iso('2026-11-12', '16:00') });
    expect(dragResult(t, 'move', -20, 1)).toEqual({ start: iso('2026-11-13', '06:30'), end: iso('2026-11-13', '14:30') });
    expect(dragResult(t, 'stretch', 125)).toEqual({ start: t.start, end: iso('2026-11-12', '17:00') });
    expect(dragResult(t, 'stretch', -1000).end).toBe(iso('2026-11-12', '07:30'));
  });

  it('la lista pone hoy primero y deja los días pasados aparte, el más reciente primero', () => {
    const { upcoming, past } = splitDays(weekDays('2026-11-09'), '2026-11-11');
    expect(upcoming.map(d => d.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(past.map(d => d.date)).toEqual(['2026-11-10', '2026-11-09']);
  });

  it('copiar la semana anterior suma 7 días y omite cancelados y ausencias', () => {
    const items = copyWeek([...turnos, turno('t-x', 's-2', iso('2026-11-04', '07:00'), iso('2026-11-04', '15:00'), { state: 'cancelado' })], weekDays('2026-11-02'));
    expect(items.map(i => [i.staffId, i.start, i.end])).toEqual([['s-1', iso('2026-11-10', '07:00'), iso('2026-11-10', '15:00')]]);
  });

  it('una plantilla guarda día, hora y horas; aplicada a otra semana da los mismos turnos', () => {
    const shifts = templateFromWeek(turnos, weekDays('2026-11-09'), 'a-1');
    expect(shifts).toEqual([
      { day: 0, startTime: '07:00', hours: 8, type: 'diurno', staffId: 's-1' },
      { day: 1, startTime: '13:00', hours: 6, type: 'diurno', staffId: 's-2' },
      { day: 3, startTime: '07:00', hours: 8, type: 'diurno', staffId: 's-3' },
    ]);
    const applied = applyTemplate({ id: 'pl-1', areaId: 'a-1', area: 'Emergencia', name: 'Base', version: 1, shifts }, weekDays('2026-11-16'), id => id);
    expect(applied.map(i => [i.staffId, i.start])).toEqual([['s-1', iso('2026-11-16', '07:00')], ['s-2', iso('2026-11-17', '13:00')], ['s-3', iso('2026-11-19', '07:00')]]);
  });

  it('la asignación masiva da un turno por persona y día; una noche termina al día siguiente', () => {
    const items = bulkItems([{ id: 's-2', name: 'Rosa' }, { id: 's-3', name: 'Luis' }], ['2026-11-12', '2026-11-13'], 'a-1', '19:00', '07:00', 'nocturno');
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ staffId: 's-2', start: iso('2026-11-12', '19:00'), end: iso('2026-11-13', '07:00'), type: 'nocturno' });
  });
});

describe('turnos · lista para revisar', () => {
  it('hoy va primero y los días pasados quedan plegados abajo', async () => {
    montar(false);
    const dias = await screen.findAllByRole('heading', { level: 3 });
    expect(dias[0].textContent).toMatch(/^Hoy · martes, 10 de noviembre/);
    const pasados = screen.getByText(/Días anteriores/).closest('details')!;
    expect(pasados.open).toBe(false);
    expect(within(pasados).getByRole('heading', { level: 3 }).textContent).toMatch(/Ayer · lunes, 9 de noviembre/);
    expect(dias.indexOf(within(pasados).getByRole('heading', { level: 3 }))).toBe(dias.length - 1);
  });
});

describe('turnos · calendario para planificar', () => {
  it('cada día ofrece asignar un turno con la fecha ya puesta (sin arrastrar)', async () => {
    montar(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar turno el jueves, 12 de noviembre' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    expect((within(dialogo).getByLabelText('Fecha de inicio') as HTMLInputElement).value).toBe('12/11/2026');
  });

  it('la vista Día muestra un solo día y permite elegir otro de la semana', async () => {
    montar(true);
    await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre/ });
    await userEvent.click(screen.getByRole('button', { name: 'Día' }));
    const region = screen.getByRole('region', { name: 'Hoy · martes 10 de noviembre' });
    expect(within(region).getAllByRole('group').filter(g => g.classList.contains('shift-day'))).toHaveLength(1);
    // One row of day pills next to the week navigator; only the chosen day reads in full.
    const pills = within(screen.getByRole('group', { name: 'Día que se muestra' })).getAllByRole('button').map(b => b.textContent);
    expect(pills).toEqual(['lun 9', 'Hoy · martes 10 de noviembre', 'mié 11', 'jue 12', 'vie 13', 'sáb 14', 'dom 15']);
    await userEvent.click(screen.getByRole('button', { name: 'jue 12' }));
    expect(screen.getByRole('region', { name: 'Jueves 12 de noviembre' })).toBeTruthy();
    // «Asignar turno» in Día proposes the shown day.
    await userEvent.click(screen.getByRole('button', { name: 'Asignar turno' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    expect((within(dialogo).getByLabelText('Fecha de inicio') as HTMLInputElement).value).toBe('12/11/2026');
  });

  it('con el teclado un borrador se mueve 30 min, se valida en el servidor y se puede deshacer', async () => {
    const api = montar(true, (_path, body) => ({ id: 't-borrador', version: body.version + 1, advertencias: [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ver el día jueves, 12 de noviembre' }));
    const bloque = await screen.findByRole('button', { name: /Luis Enfermero Prueba, Emergencia, 07:00 a 15:00, Diurno, Borrador/ });
    bloque.focus();
    fireEvent.keyDown(bloque, { key: 'ArrowDown', altKey: true });
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/turnos/t-borrador', expect.objectContaining({ start: iso('2026-11-12', '07:30'), end: iso('2026-11-12', '15:30'), version: 1, reason: 'Ajuste de borrador en el calendario' }), 'PATCH'));
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenLastCalledWith('/turnos/t-borrador', expect.objectContaining({ start: iso('2026-11-12', '07:00'), end: iso('2026-11-12', '15:00'), version: 2 }), 'PATCH'));
  });

  it('mover un turno publicado pide el motivo antes de guardar; si el servidor lo rechaza, vuelve a su lugar con el error', async () => {
    const api = montar(true, () => { throw new ApiError('La persona está en descanso obligatorio hasta mañana.', 409, 'personal_en_descanso'); });
    await userEvent.click(await screen.findByRole('button', { name: 'Día' }));
    const bloque = await screen.findByRole('button', { name: /Rosa Enfermera Prueba, Emergencia, 13:00 a 19:00/ });
    fireEvent.keyDown(bloque, { key: 'ArrowDown', altKey: true, shiftKey: true });
    const dialogo = await screen.findByRole('dialog', { name: 'Mover turno' });
    expect(within(dialogo).getByText(/13:00 a 19:00/)).toBeTruthy();
    expect(within(dialogo).getByText(/13:00 a 19:30/)).toBeTruthy();
    await userEvent.type(within(dialogo).getByLabelText('Motivo del cambio'), 'Refuerzo por demanda de la tarde');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar cambio' }));
    expect(api.write).toHaveBeenCalledWith('/turnos/t-hoy', expect.objectContaining({ end: iso('2026-11-10', '19:30'), reason: 'Refuerzo por demanda de la tarde' }), 'PATCH');
    expect(await within(dialogo).findByText(/descanso obligatorio/)).toBeTruthy();
  });

  it('al asignar desde la semana, se abre el día del turno nuevo con el turno resaltado', async () => {
    let lista = turnos;
    const api = montar(true, (path, body) => {
      if (path === '/turnos') { lista = [...turnos, turno('t-nuevo', body.staffId, body.start, body.end)]; return { id: 't-nuevo', version: 1, advertencias: [] }; }
      return {};
    });
    api.request.mockImplementation(async (path: string) => path === '/turnos/catalogo' ? catalogo : path.startsWith('/turnos/cobertura') ? cobertura : path === '/turnos/plantillas' ? [] : path.startsWith('/turnos?') ? [] : lista);
    await screen.findByRole('region', { name: /Semana del 9 al 15 de noviembre/ });
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Asignar turno el viernes, 13 de noviembre' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Asignar turno' });
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Área' }));
    await userEvent.click(await screen.findByRole('option', { name: /Emergencia/ }));
    fireEvent.change(within(dialogo).getByLabelText('Hora de inicio'), { target: { value: '07:00' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de fin'), { target: { value: '15:00' } });
    await userEvent.click(within(dialogo).getByRole('combobox', { name: 'Persona' }));
    await userEvent.click(screen.getByRole('option', { name: /Rosa Enfermera/ }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Asignar turno' }));
    const nuevo = await screen.findByRole('button', { name: /Rosa Enfermera Prueba, Emergencia, 07:00 a 15:00/ });
    expect(nuevo.className).toMatch(/is-new/);
    expect(screen.getByRole('region', { name: 'Viernes 13 de noviembre' })).toBeTruthy();
  });
});

describe('turnos · lotes como borrador', () => {
  it('el generador muestra la vista previa con conflictos, deja quitar uno y crea el resto como borrador', async () => {
    const api = montar(true, (path, body) => {
      if (path === '/turnos/generar') return { personas: 2, huecos: [], items: [
        { staffId: 's-2', person: 'Rosa Enfermera Prueba', areaId: 'a-1', start: iso('2026-11-16', '07:00'), end: iso('2026-11-17', '07:00'), type: 'guardia', ok: true },
        { staffId: 's-3', person: 'Luis Enfermero Prueba', areaId: 'a-1', start: iso('2026-11-17', '07:00'), end: iso('2026-11-18', '07:00'), type: 'guardia', ok: false, codigo: 'personal_en_descanso', mensaje: 'La persona está en descanso obligatorio.' },
      ] };
      if (path === '/turnos/lote') return { creados: body.items.length, ids: ['b-1'], resultados: [], huecos: [] };
      return {};
    });
    await planningTool('Generar rotación');
    const dialogo = await screen.findByRole('dialog', { name: 'Generar rotación' });
    await userEvent.selectOptions(within(dialogo).getByLabelText('Área de los turnos'), 'a-1');
    await userEvent.click(within(dialogo).getByLabelText('Rosa Enfermera Prueba'));
    await userEvent.click(within(dialogo).getByLabelText('Luis Enfermero Prueba'));
    await userEvent.click(within(dialogo).getByRole('radio', { name: /Guardia 24 h con 72 h de descanso/ }));
    fireEvent.change(within(dialogo).getByLabelText('Desde'), { target: { value: '2026-11-16' } });
    fireEvent.change(within(dialogo).getByLabelText('Hasta'), { target: { value: '2026-11-22' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ver vista previa' }));
    expect(api.write).toHaveBeenCalledWith('/turnos/generar', expect.objectContaining({ areaId: 'a-1', staffIds: ['s-2', 's-3'], pattern: '24x72', from: '2026-11-16', to: '2026-11-22' }), 'POST');
    const previa = await screen.findByRole('dialog', { name: 'Vista previa de los borradores' });
    expect(within(previa).getByText('La persona está en descanso obligatorio.')).toBeTruthy();
    expect((within(previa).getByRole('button', { name: 'Crear 2 borradores' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(previa).getByRole('button', { name: /Quitar el turno de Luis Enfermero Prueba/ }));
    await userEvent.click(within(previa).getByRole('button', { name: 'Crear 1 borrador' }));
    expect(api.write).toHaveBeenLastCalledWith('/turnos/lote', { items: [{ staffId: 's-2', areaId: 'a-1', start: iso('2026-11-16', '07:00'), end: iso('2026-11-17', '07:00'), type: 'guardia' }] }, 'POST');
    expect(await screen.findByText(/1 borrador creado/)).toBeTruthy();
  });

  it('el generador distingue los turnos que agregó para cubrir el mínimo y lista los huecos que quedan con su motivo', async () => {
    montar(true, path => path === '/turnos/generar' ? { personas: 2, intentos: 3, limiteIntentos: 2000, items: [
      { staffId: 's-2', person: 'Rosa Enfermera Prueba', areaId: 'a-1', start: iso('2026-11-16', '07:00'), end: iso('2026-11-17', '07:00'), type: 'guardia', ok: true, origen: 'patron' },
      { staffId: 's-3', person: 'Luis Enfermero Prueba', areaId: 'a-1', start: iso('2026-11-17', '07:00'), end: iso('2026-11-18', '07:00'), type: 'guardia', ok: true, origen: 'cobertura' },
    ], huecos: [
      { areaId: 'a-1', area: 'Emergencia', role: 'MED', start: iso('2026-11-16', '07:00'), end: iso('2026-11-18', '07:00'), required: 1, actual: 0, motivo: 'sin_personal_elegible', mensaje: 'El grupo no tiene personal de esa función para cubrir el mínimo.' },
      { areaId: 'a-1', area: 'Emergencia', role: 'ENF', start: iso('2026-11-18', '07:00'), end: iso('2026-11-19', '07:00'), required: 1, actual: 0, motivo: 'personal_en_descanso', mensaje: 'Nadie del grupo puede cubrirlo. De las personas probadas: 2 en descanso obligatorio.' },
    ] } : {});
    await planningTool('Generar rotación');
    const dialogo = await screen.findByRole('dialog', { name: 'Generar rotación' });
    await userEvent.selectOptions(within(dialogo).getByLabelText('Área de los turnos'), 'a-1');
    await userEvent.click(within(dialogo).getByLabelText('Rosa Enfermera Prueba'));
    await userEvent.click(within(dialogo).getByLabelText('Luis Enfermero Prueba'));
    fireEvent.change(within(dialogo).getByLabelText('Desde'), { target: { value: '2026-11-16' } });
    fireEvent.change(within(dialogo).getByLabelText('Hasta'), { target: { value: '2026-11-18' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ver vista previa' }));
    const previa = await screen.findByRole('dialog', { name: 'Vista previa de los borradores' });
    expect(within(previa).getByText('2 turnos sin conflictos, 1 agregado para cubrir el mínimo del área. Se crean como borrador; nadie los ve hasta publicar la semana.')).toBeTruthy();
    expect(within(previa).getAllByText('Cubre el mínimo del área')).toHaveLength(1);
    const huecos = within(previa).getByRole('region', { name: 'Huecos que quedan sin cubrir' });
    expect(within(huecos).getByText('El grupo no tiene personal de esa función para cubrir el mínimo.')).toBeTruthy();
    expect(within(huecos).getByText('Nadie del grupo puede cubrirlo. De las personas probadas: 2 en descanso obligatorio.')).toBeTruthy();
  });

  it('copiar la semana anterior valida los turnos en el servidor antes de crearlos', async () => {
    const api = montar(true, (path, body) => path === '/turnos/lote/validar' ? { resultados: body.items.map((_: unknown, index: number) => ({ index, ok: true })), huecos: [] } : {});
    await planningTool('Copiar semana anterior');
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/turnos/lote/validar', { items: [{ staffId: 's-1', areaId: 'a-1', start: iso('2026-11-10', '07:00'), end: iso('2026-11-10', '15:00'), type: 'diurno' }] }, 'POST'));
    const previa = await screen.findByRole('dialog', { name: 'Vista previa de los borradores' });
    expect(within(previa).getByText('Ana Ficticia Prueba')).toBeTruthy();
    expect(within(previa).getByText('Sin conflictos')).toBeTruthy();
  });

  it('la asignación masiva da el mismo horario a varias personas', async () => {
    const api = montar(true, (path, body) => path === '/turnos/lote/validar' ? { resultados: body.items.map((_: unknown, index: number) => ({ index, ok: true })), huecos: [] } : {});
    await planningTool('Asignación masiva');
    const dialogo = await screen.findByRole('dialog', { name: 'Asignación masiva' });
    await userEvent.selectOptions(within(dialogo).getByLabelText('Área de los turnos'), 'a-1');
    await userEvent.click(within(dialogo).getByLabelText('Rosa Enfermera Prueba'));
    await userEvent.click(within(dialogo).getByLabelText('Luis Enfermero Prueba'));
    fireEvent.change(within(dialogo).getByLabelText('Desde'), { target: { value: '2026-11-13' } });
    fireEvent.change(within(dialogo).getByLabelText('Hasta'), { target: { value: '2026-11-13' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de inicio'), { target: { value: '07:00' } });
    fireEvent.change(within(dialogo).getByLabelText('Hora de fin'), { target: { value: '15:00' } });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Ver vista previa' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/turnos/lote/validar', { items: [
      { staffId: 's-2', areaId: 'a-1', start: iso('2026-11-13', '07:00'), end: iso('2026-11-13', '15:00'), type: 'diurno' },
      { staffId: 's-3', areaId: 'a-1', start: iso('2026-11-13', '07:00'), end: iso('2026-11-13', '15:00'), type: 'diurno' },
    ] }, 'POST'));
  });

  it('una plantilla se guarda con la semana del área elegida', async () => {
    const api = montar(true, () => ({ id: 'pl-1', version: 1 }));
    await planningTool('Plantillas');
    const dialogo = await screen.findByRole('dialog', { name: 'Plantillas de semana' });
    await userEvent.selectOptions(within(dialogo).getByLabelText('Área de la plantilla'), 'a-1');
    await userEvent.type(within(dialogo).getByLabelText('Nombre de la plantilla'), 'Semana base');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar esta semana como plantilla' }));
    expect(api.write).toHaveBeenCalledWith('/turnos/plantillas', { areaId: 'a-1', name: 'Semana base', shifts: [
      { day: 0, startTime: '07:00', hours: 8, type: 'diurno', staffId: 's-1' }, { day: 1, startTime: '13:00', hours: 6, type: 'diurno', staffId: 's-2' }, { day: 3, startTime: '07:00', hours: 8, type: 'diurno', staffId: 's-3' },
    ] }, 'POST');
  });

  it('Publicar semana confirma cuántos borradores salen y publica el rango de la semana', async () => {
    const api = montar(true, () => ({ from: '2026-11-09', to: '2026-11-15', published: 1, publishedBy: 'u-1', publishedAt: NOW.toISOString(), warnings: [] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar semana (1 borrador)' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Publicar semana' });
    expect(within(dialogo).getAllByText(/1 borrador/)[0]).toBeTruthy();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Publicar (1)' }));
    expect(api.write).toHaveBeenCalledWith('/turnos/publicar', { from: '2026-11-09', to: '2026-11-15' }, 'POST');
    await act(async () => {});
    expect(await screen.findByText(/Se publicó 1 turno/)).toBeTruthy();
  });
});
