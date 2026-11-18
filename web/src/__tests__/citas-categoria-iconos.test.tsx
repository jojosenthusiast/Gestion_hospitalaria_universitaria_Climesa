import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AppointmentsPage } from '../features/appointments';
import { CategoryBadges } from '../components/category';

// An appointment born from a request by reason shows a quiet body-part mark next to the patient's name;
// one booked directly by reception shows nothing.
afterEach(cleanup);

const profile: AccessProfile = { id: 'rec', user: { id: 'rec' }, email: 'rec@example.test', name: 'Recepción', roles: ['REC'], platforms: ['web'], permissions: ['citas.ver', 'citas.agendar'].map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null };
const dayAt = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(0, 0, 0, 0); return new Date(d.getTime() + hour * 3600_000).toISOString(); };
const cita = (id: string, start: string, categories?: unknown[]) => ({ id, patientId: `p-${id}`, patientName: `Paciente ${id}`, doctorId: 'd-1', doctorName: 'Médica Uno', start, end: new Date(Date.parse(start) + 20 * 60_000).toISOString(), state: 'confirmada', origin: 'paciente', version: 1, allowedActions: [], blockedActions: [], ...(categories ? { categories } : {}) });
const rows = [
  cita('motivo', dayAt(1, 10), [{ code: 'corazon', name: 'Corazón y presión', icon: 'corazon' }, { code: 'digestivo', name: 'Estómago e intestinos', icon: 'digestivo' }]),
  cita('directa', dayAt(1, 11), []),
  cita('antigua', dayAt(1, 12)),
];

describe('Citas · ícono de la categoría del motivo', () => {
  it('la cita pedida por motivo muestra sus íconos con nombre accesible; la agendada directo, ninguno', async () => {
    const api = { request: vi.fn(async (path: string) => path === '/citas' ? rows : path === '/citas/solicitudes-categoria' ? [] : path.startsWith('/citas/categorias') ? [] : { doctors: [] }), write: vi.fn(async () => ({})) };
    render(<AppointmentsPage api={api as unknown as Api} profile={profile} version={0} />);
    const withReason = (await screen.findByText('Paciente motivo')).closest('.ag-slot') as HTMLElement;
    expect(within(withReason).getByRole('img', { name: 'Corazón y presión' })).toBeTruthy();
    expect(within(withReason).getByRole('img', { name: 'Estómago e intestinos' })).toBeTruthy();
    expect(within(withReason).getByRole('list', { name: 'Motivo: Corazón y presión, Estómago e intestinos' })).toBeTruthy();
    for (const name of ['Paciente directa', 'Paciente antigua']) {
      const row = screen.getByText(name).closest('.ag-slot') as HTMLElement;
      expect(within(row).queryByRole('img')).toBeNull();
      expect(row.querySelector('.cat-badges')).toBeNull();
    }
  });

  it('cada marca usa un tono suave de la paleta de identidad y un ícono conocido o el estetoscopio', () => {
    const { container } = render(<CategoryBadges categories={[{ code: 'ojos', name: 'Ojos y visión', icon: 'ojo' }, { code: 'nueva', name: 'Otra', icon: 'desconocido' }]} />);
    const badges = container.querySelectorAll('.cat-badge');
    expect(badges[0].className).toContain('identity-tone-blue');
    expect(badges[0].getAttribute('title')).toBe('Ojos y visión');
    expect(badges[1].className).toContain('identity-tone-slate');
    expect(screen.getByRole('img', { name: 'Otra' }).querySelector('svg')).toBeTruthy();
  });
});
