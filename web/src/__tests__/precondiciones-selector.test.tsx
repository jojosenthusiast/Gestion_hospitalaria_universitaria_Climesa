import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPicker, type PickerItem } from '../components/search-picker';
import { patientPicker } from '../features/appointments';
import { PATIENT_ADMITTED_REASON, PATIENT_INACTIVE_REASON, type PatientPickerGate } from '../features/patient-gates';
import type { Api } from '../lib/api';

afterEach(cleanup);

/** S1 (preconditions): the selector rows carry `active` / `activeAdmission`; a picker disables the row before the tap. */
const rows = [
  { id: 'p-ok', record: '9900001', fullName: 'Paciente Disponible', active: true, activeAdmission: false, careContext: true },
  { id: 'p-off', record: '9900002', fullName: 'Paciente Inactivo', active: false, activeAdmission: false, careContext: false },
  { id: 'p-in', record: '9900003', fullName: 'Paciente Ingresado', active: true, activeAdmission: true, careContext: true },
  { id: 'p-old', record: '9900004', fullName: 'Paciente Sin Banderas' },
];
const api = { request: vi.fn(async () => ({ items: rows, hasMore: false })) } as unknown as Api;

function Harness({ gate }: { gate: PatientPickerGate }) {
  const [value, setValue] = useState<PickerItem | null>(null);
  return <><SearchPicker label="Paciente" value={value} onChange={setValue} search={patientPicker(api, gate)} debounceMs={5} /><output data-testid="elegido">{value?.id ?? ''}</output></>;
}

describe('S1 · selector de pacientes con precondiciones', () => {
  it('queue and appointments: an inactive patient is shown disabled with the reason and cannot be chosen', async () => {
    render(<Harness gate="attend" />);
    await userEvent.type(screen.getByRole('combobox', { name: 'Paciente' }), 'pa');
    const off = await screen.findByRole('option', { name: /Paciente Inactivo/ });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.textContent).toContain(PATIENT_INACTIVE_REASON);
    await userEvent.click(off);
    expect(screen.getByTestId('elegido').textContent).toBe('');
    // An admitted patient can still take a number; a row without the flags (older API) stays available.
    expect(screen.getByRole('option', { name: /Paciente Ingresado/ }).getAttribute('aria-disabled')).toBeNull();
    expect(screen.getByRole('option', { name: /Paciente Sin Banderas/ }).getAttribute('aria-disabled')).toBeNull();
    await userEvent.click(screen.getByRole('option', { name: /Paciente Disponible/ }));
    expect(screen.getByTestId('elegido').textContent).toBe('p-ok');
  });

  it('admission intake: a patient with an active admission is disabled with «Ya tiene una admisión activa.»', async () => {
    const page = await patientPicker(api, 'admit')('pa', 0);
    expect(page.items.find(i => i.id === 'p-in')).toMatchObject({ disabled: true, reason: PATIENT_ADMITTED_REASON });
    expect(page.items.find(i => i.id === 'p-off')).toMatchObject({ disabled: true, reason: PATIENT_INACTIVE_REASON });
    expect(page.items.find(i => i.id === 'p-ok')?.disabled).toBeUndefined();
    expect(page.items.find(i => i.id === 'p-old')?.disabled).toBeUndefined();
  });

  it('a picker without a gate (for example the ambulance call) keeps every row available', async () => {
    const page = await patientPicker(api)('pa', 0);
    expect(page.items.every(i => !i.disabled)).toBe(true);
  });
});
