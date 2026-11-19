import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api, Patient } from '../lib/api';
import { Field } from '../components/ui';
import { formatDateTime } from '../features/common';
import { PatientsPage } from '../features/patients';
import { moduleIcons } from '../features/shell';

// Fase 2R sweep 2026-11-17 (odd/tasks/fase2-barrido-2026-11-17.md): typography, formats and noise on the web.
afterEach(() => { cleanup(); location.hash = ''; });

function DateProbe({ initial, onValue }: { initial: string; onValue: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return <Field label="Fecha" type="date" value={value} onChange={v => { setValue(v); onValue(v); }} />;
}

describe('formats', () => {
  it('a date field reads and writes in es-SV order (dd/mm/aaaa), whatever the browser language', () => {
    const onValue = vi.fn();
    render(<DateProbe initial="2026-11-18" onValue={onValue} />);
    const input = screen.getByLabelText('Fecha') as HTMLInputElement;
    expect(input.value).toBe('18/11/2026');
    fireEvent.change(input, { target: { value: '19/11/2026' } });
    expect(onValue).toHaveBeenLastCalledWith('2026-11-19');
    expect(input.value).toBe('19/11/2026');
    // An ISO value (older callers and tests) is accepted too.
    fireEvent.change(input, { target: { value: '2026-12-01' } });
    expect(onValue).toHaveBeenLastCalledWith('2026-12-01');
    // A half-typed date does not reach the form.
    onValue.mockClear();
    fireEvent.change(input, { target: { value: '31/02/20' } });
    expect(onValue).not.toHaveBeenCalled();
  });

  it('date and time use the 24-hour clock: no «a. m.» that a sentence can double into «a. m..»', () => {
    const text = formatDateTime('2026-11-17T14:00:00Z');
    expect(text).toMatch(/\b0?8:00$/);
    expect(text).not.toMatch(/m\./);
  });
});

describe('noise', () => {
  const perfil: AccessProfile = { id: 'u-1', user: { id: 'u-1' }, email: 'rec@example.test', name: 'Recepción de prueba', roles: ['REC'], platforms: ['web'], permissions: ['pacientes.buscar', 'pacientes.ver_ficha'].map(code => ({ code, context: 'global' })), channels: [], patientId: null, staffId: null };
  const base = { sex: 'femenino', birth: '1990-05-01', version: 1 } as const;
  const rows: Patient[] = [
    { ...base, id: 'p1', record: 'EXP-1', fullName: 'Ana Ficticia', givenNames: 'Ana', surnames: 'Ficticia', state: 'activo', active: true },
    { ...base, id: 'p2', record: 'EXP-2', fullName: 'Berta Inactiva', givenNames: 'Berta', surnames: 'Inactiva', state: 'inactivo', active: false },
  ] as Patient[];

  it('patient rows show only the exceptional state, never «Activo» on every row', async () => {
    const api = { request: vi.fn(async () => rows), write: vi.fn() } as unknown as Api;
    render(<PatientsPage api={api} profile={perfil} version={0} />);
    const list = await screen.findByRole('table', { name: 'Pacientes encontrados' });
    expect(within(list).queryByText('Activo')).toBeNull();
    expect(within(list).getByText('Inactivo')).toBeTruthy();
  });

  it('Camas and Hospitalización, Ambulancia and its Bitácora have distinct icons', () => {
    expect(moduleIcons.camas).not.toBe(moduleIcons.hospitalizacion);
    expect(moduleIcons.ambulancia).not.toBe(moduleIcons['bitacora-ambulancia']);
  });
});
