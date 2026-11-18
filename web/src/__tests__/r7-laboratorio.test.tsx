import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LaboratoryPage } from '../features/laboratory';
import { LabResultsInbox } from '../features/dashboards/lab-results-inbox';
import { LabFollowUpPanel } from '../features/dashboards/lab-follow-up';
import { formatLabValue, markOf, parseValue, rangeText, releaseLines } from '../lib/lab-sheet';

/** R7 U3, journey C1 "Comprobaciones" (fase2-recorridos-auditoria.md), on a fixed clock: Wednesday 2026-12-02, 09:00 local. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-02T15:00:00Z'));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ''; });

const perfil = (permissions: string[]): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'x@example.test', name: 'Cuenta Ficticia', roles: [], platforms: ['web'], permissions: permissions.map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: 's-1' });
const range = (min: number, max: number, criticalLow: number, criticalHigh: number) => ({ min, max, criticalLow, criticalHigh });
const exam = (id: string, code: string, name: string, unit: string, r: ReturnType<typeof range>) => ({ id, code, name, unit, resultType: 'numerico', result: null, referenceRange: r });
const fiveExams = [exam('i-hb', 'HB', 'Hemoglobina', 'g/dL', range(12, 15.5, 7, 20)), exam('i-hto', 'HTO', 'Hematocrito', '%', range(36, 46, 20, 60)), exam('i-leu', 'LEU', 'Leucocitos', 'mil/µL', range(4, 11, 2, 30)), exam('i-plq', 'PLQ', 'Plaquetas', 'mil/µL', range(150, 450, 50, 1000)), exam('i-glu', 'GLU', 'Glucosa', 'mg/dL', range(70, 100, 40, 400))];
const inProcess = { id: 'o-1', patientName: 'Ana Pérez Ficticia', patientRecord: '000123', doctorName: 'Dra. Ana Isabel Ejemplo López', priority: 'rutina', state: 'en_proceso', version: 4, createdAt: '2026-12-02T14:00:00Z', sampleTakenAt: '2026-12-02T14:20:00Z', items: fiveExams, allowedActions: ['capturar'] };

describe('R7 C1 · reglas de la hoja', () => {
  it('marca crítico y fuera de rango igual que el servidor y acepta coma decimal', () => {
    const hb = range(12, 15.5, 7, 20);
    expect([markOf(5.1, hb), markOf(11, hb), markOf(13, hb), markOf(13, null)]).toEqual(['critico', 'fuera', 'normal', 'sin_rango']);
    expect([parseValue('5,1'), parseValue('5.1'), parseValue('abc'), parseValue('')]).toEqual([5.1, 5.1, null, null]);
    expect(releaseLines([{ name: 'Glucosa', value: 88, unit: 'mg/dL', mark: 'normal' }, { name: 'Hemoglobina', value: 7.1, unit: 'g/dL', mark: 'critico_bajo' }]).map(l => l.text))
      .toEqual(['Hemoglobina 7.1 g/dL (crítico bajo)', 'Glucosa 88 mg/dL']);
  });

  it('el rango incluye los límites críticos y el valor va con su unidad en un solo formato', () => {
    expect(rangeText(range(12, 15.5, 7, 20))).toBe(`${formatLabValue(12)}–${formatLabValue(15.5)} · crítico < ${formatLabValue(7)} o > ${formatLabValue(20)}`);
    expect(rangeText({ min: 70, max: null, criticalLow: null, criticalHigh: null })).toBe('≥ 70');
    expect(rangeText({ min: null, max: null, criticalLow: null, criticalHigh: 400 })).toBe('crítico > 400');
    expect([formatLabValue(452), formatLabValue(452, 'mil/µL')]).toEqual(['452', '452 mil/µL']);
  });
});

describe('R7 C1 · LAB guarda la hoja completa en un clic', () => {
  it('orden con 5 exámenes y uno crítico: se marca al salir del campo, la confirmación nombra al médico y un clic guarda todo', async () => {
    const write = vi.fn(async () => ({ state: 'completado', criticalCount: 1 }));
    const api = { request: vi.fn(async () => [inProcess]), write } as unknown as Api;
    render(<LaboratoryPage api={api} profile={perfil(['laboratorio.ver_cola', 'laboratorio.procesar', 'laboratorio.validar'])} version={0} />);
    const values = { Hemoglobina: '5,1', Hematocrito: '40', Leucocitos: '7.2', Plaquetas: '250', Glucosa: '88' };
    for (const [name, value] of Object.entries(values)) await userEvent.type(await screen.findByLabelText(new RegExp(`^${name} \\(`)), value);
    await userEvent.tab();
    const hbRow = screen.getByLabelText('Hemoglobina (g/dL)').closest('tr')!;
    expect(within(hbRow).getByText('Crítico')).toBeTruthy();
    expect(within(screen.getByLabelText('Glucosa (mg/dL)').closest('tr')!).getByText('Normal')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y completar (5)' }));
    const confirm = await screen.findByRole('dialog', { name: '1 valor crítico' });
    expect(within(confirm).getByText('Dra. Ana Isabel Ejemplo López')).toBeTruthy();
    expect(write).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Guardar, completar y avisar' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('/laboratorio/ordenes/o-1/resultados/lote', { version: 4, complete: true, items: [
      { orderItemId: 'i-hb', value: 5.1 }, { orderItemId: 'i-hto', value: 40 }, { orderItemId: 'i-leu', value: 7.2 }, { orderItemId: 'i-plq', value: 250 }, { orderItemId: 'i-glu', value: 88 }] }, 'POST');
    expect(await screen.findByText(/Se guardaron 5 resultados y la orden quedó completada.*1 valor crítico avisó a Dra. Ana Isabel Ejemplo López/)).toBeTruthy();
  });

  it('un valor no numérico se marca en el lugar y bloquea el guardado', async () => {
    const api = { request: vi.fn(async () => [inProcess]), write: vi.fn() } as unknown as Api;
    render(<LaboratoryPage api={api} profile={perfil(['laboratorio.ver_cola', 'laboratorio.procesar'])} version={0} />);
    await userEvent.type(await screen.findByLabelText('Glucosa (mg/dL)'), 'alta');
    await userEvent.tab();
    expect(screen.getByText('Escribe un número, por ejemplo 5.1.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Guardar resultados/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('la toma de muestra compara expediente y nombre al teclear', async () => {
    const pending = { ...inProcess, state: 'pendiente', sampleTakenAt: null, allowedActions: ['tomar_muestra'] };
    const api = { request: vi.fn(async () => [pending]), write: vi.fn() } as unknown as Api;
    render(<LaboratoryPage api={api} profile={perfil(['laboratorio.ver_cola', 'laboratorio.procesar'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Tomar muestra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar identidad para toma de muestra' });
    await userEvent.type(within(dialog).getByLabelText('Número de expediente'), '000124');
    await userEvent.type(within(dialog).getByLabelText('Nombre completo'), 'ana  pérez ficticia');
    expect(within(dialog).getAllByText(/oincide con la orden/).map(n => n.textContent)).toEqual(['No coincide con la orden', 'Coincide con la orden']);
    expect((within(dialog).getByRole('button', { name: 'Confirmar identidad' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.clear(within(dialog).getByLabelText('Número de expediente'));
    await userEvent.type(within(dialog).getByLabelText('Número de expediente'), '000123');
    expect((within(dialog).getByRole('button', { name: 'Confirmar identidad' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('R7 C1 · MED revisa y libera desde la bandeja', () => {
  const pending = { id: 'f-1', orderId: 'o-1', patientId: 'p-1', patientName: 'Ana Pérez Ficticia', patientRecord: '000123', reason: 'critico', detail: 'Hemoglobina: Crítico bajo', createdAt: '2026-12-02T14:40:00Z', version: 1, orderVersion: 6, orderActions: ['revisar'],
    values: [{ code: 'GLU', name: 'Glucosa', unit: 'mg/dL', value: 88, text: null, mark: 'normal' }, { code: 'HB', name: 'Hemoglobina', unit: 'g/dL', value: 7.1, text: null, mark: 'critico_bajo' }] };

  it('la fila trae los valores clave, abre la orden y la liberación confirma con resumen; orden y pendiente se van juntas', async () => {
    let rows = [pending];
    const request = vi.fn(async () => rows);
    const write = vi.fn(async () => { rows = []; return { id: 'o-1', version: 7, reviewedAt: '2026-12-02T15:00:00Z', followUpsClosed: 1, followUpProposalId: null }; });
    render(<LabResultsInbox api={{ request, write } as unknown as Api} profile={perfil(['laboratorio.revisar'])} version={0} />);
    const row = (await screen.findByText('Ana Pérez Ficticia')).closest('li')!;
    expect(within(row).getByText('Hemoglobina 7.1 g/dL (crítico bajo)')).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'Abrir la orden de Ana Pérez Ficticia' }).getAttribute('href')).toBe('#/laboratorio?orden=o-1');
    expect(within(row).queryByRole('button', { name: 'Marcar como revisado' })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: 'Revisar y liberar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revisar y liberar al paciente' });
    expect(within(dialog).getByText(/incluido 1 valor crítico/)).toBeTruthy();
    expect(within(dialog).getAllByRole('listitem').map(li => li.textContent)).toEqual(['Hemoglobina 7.1 g/dL (crítico bajo)', 'Glucosa 88 mg/dL']);
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /cita de seguimiento/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Liberar resultados' }));
    expect(write).toHaveBeenCalledWith('/laboratorio/ordenes/o-1/revisar', { version: 6, followUp: false }, 'POST');
    expect(await screen.findByText('Resultados liberados: Ana Pérez Ficticia ya los ve.')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Revisar y liberar' })).toBeNull());
    expect(request.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('R7 C1 · A5 nota al paciente y motivo real sin cita', () => {
  const pending = { id: 'f-2', orderId: 'o-2', patientId: 'p-1', patientName: 'Ana Pérez Ficticia', patientRecord: '000123', reason: 'critico', detail: '', createdAt: '2026-12-02T14:40:00Z', version: 1, orderVersion: 6, orderActions: ['revisar'],
    values: [{ code: 'GLU', name: 'Glucosa', unit: 'mg/dL', value: 88, text: null, mark: 'normal' }] };

  it('envía la nota opcional y, con el paciente hospitalizado, dice que no se propuso cita', async () => {
    const write = vi.fn(async () => ({ id: 'o-2', version: 7, reviewedAt: '2026-12-02T15:00:00Z', followUpsClosed: 1, followUpProposalId: null, followUpSkipped: 'hospitalizado' }));
    render(<LabResultsInbox api={{ request: vi.fn(async () => [pending]), write } as unknown as Api} profile={perfil(['laboratorio.revisar'])} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revisar y liberar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revisar y liberar al paciente' });
    await userEvent.type(within(dialog).getByLabelText('Nota para el paciente (opcional)'), 'Repetir en ayunas el lunes.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Liberar resultados' }));
    expect(write).toHaveBeenCalledWith('/laboratorio/ordenes/o-2/revisar', { version: 6, followUp: true, patientNote: 'Repetir en ayunas el lunes.' }, 'POST');
    expect(await screen.findByText('Resultados liberados: Ana Pérez Ficticia ya los ve. No se propuso cita de seguimiento porque el paciente está ingresado.')).toBeTruthy();
    expect(screen.queryByText(/ya estaba propuesta/)).toBeNull();
  });
});

describe('R7 C1 · REC agenda el seguimiento', () => {
  it('sin hueco hoy abre en el primer día con hueco y ofrece otro médico de la misma especialidad', async () => {
    const proposal = { id: 'pr-1', orderId: 'o-1', patientId: 'p-1', patientName: 'Ana Pérez Ficticia', patientRecord: '000123', doctorId: 'd-1', doctorName: 'Dra. Ana Isabel Ejemplo López', priority: 'rutina', resultsAt: '2026-12-02T14:00:00Z', createdAt: '2026-12-02T14:30:00Z', version: 2 };
    const doctors = [{ id: 'd-1', givenNames: 'Ana Isabel', surnames: 'Ejemplo López', specialty: 'Medicina general', active: true }, { id: 'd-2', givenNames: 'Mario', surnames: 'Ficticio Ruiz', specialty: 'Medicina general', active: true }, { id: 'd-3', givenNames: 'Sara', surnames: 'Prueba Díaz', specialty: 'Dermatología', active: true }];
    const request = vi.fn(async (path: string) => {
      if (path === '/laboratorio/seguimientos') return [proposal];
      if (path === '/citas/catalogos') return { doctors };
      const date = new URL(path, 'https://x.invalid').searchParams.get('date');
      // d-1 has nothing until Friday 2026-12-04.
      return { slots: date === '2026-12-04' ? [{ start: '2026-12-04T15:20:00Z', end: '2026-12-04T15:40:00Z' }] : [] };
    });
    const write = vi.fn(async (path: string) => path === '/citas' ? { id: 'c-9' } : { id: 'pr-1', state: 'confirmada' });
    render(<LabFollowUpPanel api={{ request, write } as unknown as Api} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar cita' }));
    const chips = await screen.findByRole('group', { name: 'Días con horas libres' });
    const pressed = within(chips).getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map(b => b.textContent)).toEqual([expect.stringMatching(/vie.*4.*· 1/)]);
    const medico = screen.getByLabelText('Médico') as HTMLSelectElement;
    expect([...medico.options].map(o => o.textContent)).toEqual(['Dra. Ana Isabel Ejemplo López (pidió los exámenes)', 'Mario Ficticio Ruiz']);
    await userEvent.click(screen.getByRole('radio', { name: '09:20' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar cita' }));
    expect(write).toHaveBeenCalledWith('/citas', expect.objectContaining({ doctorId: 'd-1', start: '2026-12-04T15:20:00Z' }), 'POST');
    expect(write).toHaveBeenCalledWith('/laboratorio/seguimientos/pr-1/confirmar', { version: 2, appointmentId: 'c-9' }, 'POST');
    expect(await screen.findByText(/Cita de seguimiento confirmada: Ana Pérez Ficticia, .*4.* a las 09:20 con Dra. Ana Isabel Ejemplo López\./)).toBeTruthy();
  });
});
