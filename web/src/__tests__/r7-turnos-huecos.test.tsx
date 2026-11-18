import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../lib/api';
import { FillGapsDialog, GapCoverDialog, gapBlocks, shiftTypeFor } from '../features/shifts/GapCover';

/** R7 U3, journey F2 «Cubrir hueco» / «Llenar todos los huecos» (F-1) on fixed data: Tuesday 2026-12-08, El Salvador. */
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const local = (day: string, time: string) => new Date(`${day}T${time}:00-06:00`).toISOString();
const hourly = (areaId: string, area: string, role: string, day: string, from: number, to: number) => Array.from({ length: to - from }, (_, i) => ({ areaId, area, role, start: local(day, `${String(from + i).padStart(2, '0')}:00`), end: local(day, `${String(from + i + 1).padStart(2, '0')}:00`), required: 1, actual: 0 }));
const ana = { staffId: 's-ana', person: 'Ana Ejemplo', sameArea: true, weekHours: 0, advertencias: [] };
const beto = { staffId: 's-beto', person: 'Beto Ejemplo', sameArea: false, weekHours: 24, advertencias: [] };

describe('R7 F2 · bloques de hueco', () => {
  it('une las horas seguidas de un área y función y corta en turnos de 12 h como máximo', () => {
    const blocks = gapBlocks([...hourly('a-rec', 'Recepción', 'REC', '2026-12-08', 7, 19), ...hourly('a-emg', 'Emergencia', 'ENF', '2026-12-08', 0, 24)]);
    expect(blocks.map(b => [b.area, b.start, b.end])).toEqual([
      ['Emergencia', local('2026-12-08', '00:00'), local('2026-12-08', '12:00')],
      ['Recepción', local('2026-12-08', '07:00'), local('2026-12-08', '19:00')],
      ['Emergencia', local('2026-12-08', '12:00'), local('2026-12-09', '00:00')],
    ]);
    expect(blocks.map(shiftTypeFor)).toEqual(['nocturno', 'diurno', 'diurno']);
  });
});

describe('R7 F2 · Cubrir hueco', () => {
  it('pide los candidatos reales del hueco, explica a los descartados y entrega el turno elegido al resumen', async () => {
    const request = vi.fn(async () => ({ candidatos: [ana, beto], descartados: [{ staffId: 's-cira', person: 'Cira Ejemplo', codigo: 'personal_en_descanso', mensaje: 'La persona necesita descansar 8 h entre turnos.' }] }));
    const onPick = vi.fn();
    const [block] = gapBlocks(hourly('a-rec', 'Recepción', 'REC', '2026-12-08', 7, 19));
    render(<GapCoverDialog api={{ request } as unknown as Api} block={block} onClose={vi.fn()} onPick={onPick} />);
    const dialog = await screen.findByRole('dialog', { name: 'Cubrir hueco' });
    const path = new URL(String((request.mock.calls[0] as unknown[])[0]), 'https://x.invalid');
    expect([path.pathname, Object.fromEntries(path.searchParams)]).toEqual(['/turnos/candidatos', { areaId: 'a-rec', role: 'REC', start: block.start, end: block.end, type: 'diurno' }]);
    expect(await within(dialog).findByText(/De esta área · 0 h/)).toBeTruthy();
    expect(within(dialog).getByText(/La persona necesita descansar 8 h/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Revisar y asignar' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByRole('radio', { name: /Beto Ejemplo/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revisar y asignar' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ staffId: 's-beto', areaId: 'a-rec', start: block.start, end: block.end, type: 'diurno', fill: true }));
  });
});

describe('R7 F2 · Llenar todos los huecos', () => {
  it('propone una persona por hueco sin repetirla en huecos cercanos, resume antes de aplicar y lista lo que queda sin cubrir', async () => {
    const blocks = gapBlocks([...hourly('a-rec', 'Recepción', 'REC', '2026-12-08', 7, 19), ...hourly('a-lab', 'Laboratorio', 'LAB', '2026-12-08', 7, 19), ...hourly('a-rec', 'Recepción', 'REC', '2026-12-09', 7, 19)]);
    const request = vi.fn(async (path: string) => path.includes('role=LAB') ? { candidatos: [], descartados: [{ staffId: 's-x', person: 'X', codigo: 'carga_semanal_excedida', mensaje: 'Supera el tope de horas de la semana.' }] } : { candidatos: [ana], descartados: [] });
    const onPreview = vi.fn();
    render(<FillGapsDialog api={{ request } as unknown as Api} blocks={blocks} onClose={vi.fn()} onPreview={onPreview} />);
    const dialog = await screen.findByRole('dialog', { name: 'Llenar los huecos de esta semana' });
    expect(await within(dialog).findByText(/Se propondrán 2 turnos con 1 persona para 2 de 3 huecos\. Nada se guarda hasta que confirmes/)).toBeTruthy();
    expect(within(dialog).getByText(/Laboratorio · Laboratorio .*Supera el tope de horas de la semana\./)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revisar 2 turnos' }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    onPreview.mockClear();
    cleanup();
  });

  it('dos funciones con hueco a la misma hora en la misma área: cada propuesta muestra su propia función', async () => {
    const blocks = gapBlocks([...hourly('a-emg', 'Emergencia', 'MED', '2026-12-08', 7, 19), ...hourly('a-emg', 'Emergencia', 'ENF', '2026-12-08', 7, 19)]);
    const request = vi.fn(async (path: string) => ({ candidatos: [path.includes('role=MED') ? { ...ana, staffId: 's-med', person: 'Médica Ejemplo' } : { ...beto, staffId: 's-enf', person: 'Enfermero Ejemplo' }], descartados: [] }));
    render(<FillGapsDialog api={{ request } as unknown as Api} blocks={blocks} onClose={vi.fn()} onPreview={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Llenar los huecos de esta semana' });
    expect((await within(dialog).findByText('Médica Ejemplo')).closest('li')!.textContent).toMatch(/Emergencia · Medicina/);
    expect(within(dialog).getByText('Enfermero Ejemplo').closest('li')!.textContent).toMatch(/Emergencia · Enfermería/);
  });

  it('el resumen se aplica solo al confirmar', async () => {
    const blocks = gapBlocks([...hourly('a-rec', 'Recepción', 'REC', '2026-12-08', 7, 19), ...hourly('a-lab', 'Laboratorio', 'LAB', '2026-12-08', 7, 19), ...hourly('a-rec', 'Recepción', 'REC', '2026-12-09', 7, 19)]);
    const request = vi.fn(async (path: string) => path.includes('role=LAB') ? { candidatos: [], descartados: [{ staffId: 's-x', person: 'X', codigo: 'carga_semanal_excedida', mensaje: 'Supera el tope de horas de la semana.' }] } : { candidatos: [ana], descartados: [] });
    const onPreview = vi.fn();
    render(<FillGapsDialog api={{ request } as unknown as Api} blocks={blocks} onClose={vi.fn()} onPreview={onPreview} />);
    const dialog = await screen.findByRole('dialog', { name: 'Llenar los huecos de esta semana' });
    await within(dialog).findByText(/Se propondrán 2 turnos/);
    expect(onPreview).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revisar 2 turnos' }));
    expect((onPreview.mock.calls[0][0] as { staffId: string; start: string }[]).map(i => [i.staffId, i.start])).toEqual([['s-ana', local('2026-12-08', '07:00')], ['s-ana', local('2026-12-09', '07:00')]]);
  });
});
