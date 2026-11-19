import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LAB_FLAG, labFlagSummary } from '../lib/lab-sheet';
import { ReleaseDialog } from '../features/lab-release';
import { LabResultsInbox, type LabFollowUp } from '../features/dashboards/lab-results-inbox';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(cleanup);

const values = [
  { name: 'Glucosa', value: 88, unit: 'mg/dL', mark: 'normal' },
  { name: 'Colesterol', value: 240, unit: 'mg/dL', mark: 'alto' },
  { name: 'Hemoglobina', value: 5.1, unit: 'g/dL', mark: 'critico_bajo' },
];
const doctor: AccessProfile = { id: 'm', user: { id: 'm' }, email: 'med@example.test', name: 'Medicina', roles: ['MED'], platforms: ['web'], permissions: [{ code: 'laboratorio.revisar', context: 'relacion' }], channels: [], patientId: null, staffId: 's' };

describe('Lote 5 S13 · banderas de resultados en web', () => {
  it('each mark has the Android word; the summary counts out of range and critical', () => {
    expect(Object.values(LAB_FLAG).map(f => f.label)).toEqual(['En rango', 'Alto', 'Bajo', 'Crítico alto', 'Crítico bajo', 'Sin rango']);
    expect(labFlagSummary(values)).toBe('2 fuera de rango · 1 crítico');
    expect(labFlagSummary([{ mark: 'alto' }])).toBe('1 fuera de rango');
    expect(labFlagSummary([{ mark: 'critico_alto' }, { mark: 'critico_bajo' }])).toBe('2 fuera de rango · 2 críticos');
    expect(labFlagSummary([{ mark: 'normal' }, { mark: 'sin_rango' }])).toBeNull();
  });

  it('the release summary shows a flag next to every component and the «N fuera de rango · M crítico» line', async () => {
    render(<ReleaseDialog api={{ request: vi.fn(), write: vi.fn() } as unknown as Api} target={{ orderId: 'o', version: 1, patientName: 'Ana Ficticia', values }} onClose={() => {}} onReleased={() => {}} />);
    const dialog = await screen.findByRole('dialog', { name: 'Revisar y liberar al paciente' });
    expect(within(dialog).getByText('2 fuera de rango · 1 crítico')).toBeTruthy();
    expect(within(dialog).getByText('Crítico bajo').className).toBe('lab-flag is-critical');
    expect(within(dialog).getByText('Alto').className).toBe('lab-flag is-high');
    expect(within(dialog).getByText('En rango').className).toBe('lab-flag is-ok');
  });

  it('the results inbox row carries the same summary and flags', async () => {
    const row: LabFollowUp = { id: 'f', orderId: 'o', patientId: 'p', patientName: 'Ana Ficticia', reason: 'critico', detail: '', createdAt: '2026-11-18T15:00:00Z', version: 1, orderVersion: 2, orderActions: ['revisar'], values: values.map(v => ({ ...v, code: v.name })) };
    render(<LabResultsInbox api={{ request: vi.fn(async () => [row]), write: vi.fn() } as unknown as Api} profile={doctor} version={0} />);
    const li = (await screen.findByText('Ana Ficticia')).closest('li')!;
    expect(within(li).getByText('2 fuera de rango · 1 crítico')).toBeTruthy();
    expect(within(li).getByText('Crítico bajo').className).toBe('lab-flag is-critical');
  });
});
