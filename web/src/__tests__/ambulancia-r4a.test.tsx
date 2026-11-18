import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { AmbulanceLogPage, type AmbulanceLogRow } from '../features/ambulance-log';
import { formatTime } from '../lib/format';

// R4a (Ambulancia y Bitácora): normal-size type, the unit code on one line, a readable «En servicio» badge, priority
// as a label, coordinates only behind a map link, crew names or «Sin asignar», and «Sin cierre» past 12 h.
afterEach(cleanup);
const profile: AccessProfile = { id: 's', user: { id: 's' }, email: 'jop@example.test', name: 'Jefatura', roles: ['JOP'], platforms: ['web'], permissions: [{ code: 'ambulancia.ver_estado', context: 'global' }], channels: [], patientId: null, staffId: 's' };
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const status = (dispatchedAt: string, crew: { staffId: string; role: string; name: string; hasAccount?: boolean }[] = [{ staffId: 'p', role: 'paramedico', name: 'Persona Ficticia A', hasAccount: true }]): AmbulanceStatus => ({
  unit: { id: 'u', plate: 'P-000-001', state: 'en_servicio', version: 1 },
  activeService: { id: 'svc', type: 'emergencia_domicilio', priority: 'roja', origin: 'Calle 1', destination: 'Hospital', version: 1, dispatchedAt, allowedActions: [], crew, lastLocation: { latitude: 13.69294, longitude: -89.21819, capturedAt: hoursAgo(0.1) } },
  paramedicOnDuty: true,
} as AmbulanceStatus);
const mount = (s: AmbulanceStatus) => render(<AmbulancePage api={{ request: vi.fn(async () => s), write: vi.fn() } as unknown as Api} profile={profile} version={0} />);

describe('Ambulancia · estado y servicio (R4a)', () => {
  it('la unidad se lee en una línea, sin la franja de números gigantes, con su estado como badge', async () => {
    const { container } = mount(status(hoursAgo(1)));
    const plate = await screen.findByText('P-000-001');
    expect(plate.className).toContain('nowrap-code');
    expect(container.querySelector('.number-strip')).toBeNull();
    expect(container.querySelector('.amb-unit .status-badge')?.textContent).toContain('En servicio');
  });

  it('la prioridad es una etiqueta, y las coordenadas solo viven detrás de un enlace al mapa', async () => {
    mount(status(hoursAgo(1)));
    const service = await screen.findByRole('region', { name: 'Servicio activo' });
    expect(within(service).getByText('Roja')).toBeTruthy();
    expect(within(service).queryByText(/13\.69294/)).toBeNull();
    const map = within(service).getByRole('link', { name: /Ver en el mapa/ });
    expect(map.getAttribute('href')).toContain('13.69294');
  });

  it('sin tripulación dice «Sin asignar»', async () => {
    mount(status(hoursAgo(1), []));
    const service = await screen.findByRole('region', { name: 'Servicio activo' });
    expect(within(service).getByText('Sin asignar')).toBeTruthy();
  });

  it('un servicio en curso de más de 12 h se marca «Sin cierre» (ámbar)', async () => {
    mount(status(hoursAgo(13)));
    const service = await screen.findByRole('region', { name: 'Servicio activo' });
    expect(within(service).getByText('Sin cierre').closest('.status-badge, .priority-badge')!.className).toContain('priority-urgente');
  });
});

describe('Bitácora · servicios (R4a)', () => {
  const row = (id: string, dispatchedAt: string, crew: AmbulanceLogRow['crew'] = []): AmbulanceLogRow => ({ id, type: 'emergencia_domicilio', priority: 'amarilla', origin: 'Calle 1', destination: 'Hospital', dispatchedAt, finalState: null, responseMinutes: null, crew });
  it('«En curso» de más de 12 h lleva «Sin cierre»; uno reciente no', async () => {
    const old = hoursAgo(20), recent = hoursAgo(1);
    render(<AmbulanceLogPage api={{ request: vi.fn(async () => [row('viejo', old), row('nuevo', recent)]) } as unknown as Api} version={0} />);
    // The log groups by day (the 20 h old one may sit under «Días anteriores»), so find each service by its time.
    const items = await screen.findAllByRole('listitem', { name: /Servicio/ });
    const at = (iso: string) => items.find(i => within(i).queryByText(formatTime(iso)))!;
    expect(within(at(old)).getByText('Sin cierre')).toBeTruthy();
    expect(within(at(recent)).queryByText('Sin cierre')).toBeNull();
  });
});
