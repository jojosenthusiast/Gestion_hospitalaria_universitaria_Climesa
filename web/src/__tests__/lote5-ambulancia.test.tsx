import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, type AmbulanceStatus } from '../features/ambulance';
import { blockTone, coverageWarning, type CrewCoverageReport } from '../features/ambulance/readiness';

afterEach(cleanup);
const profile = (codes: string[]): AccessProfile => ({ id: 's', user: { id: 's' }, email: 'rec@example.test', name: 'Recepción', roles: ['REC'], platforms: ['web'], permissions: codes.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: 's' });
const dispatcher = profile(['ambulancia.ver_estado', 'ambulancia.despachar']);
const request = { id: 'req-1', channel: 'app_paciente', address: 'Colonia Ficticia 12', municipality: 'San Salvador', reason: 'Caída en casa', contactPhone: '7000-0001', createdAt: '2026-11-15T14:00:00.000Z', version: 1, registeredPatient: true };
const free = (extra: Partial<AmbulanceStatus> = {}): AmbulanceStatus => ({ unit: { id: 'u', plate: 'P-000-001', state: 'disponible', version: 5 }, activeService: null, paramedicOnDuty: true, driverOnDuty: true, pendingRequests: [request], availableCrew: [], ...extra } as AmbulanceStatus);
const noCrew = () => free({ paramedicOnDuty: false, dispatchBlock: { code: 'sin_paramedico_de_turno', message: 'No hay paramédico con turno en curso.', action: 'Publica el turno que falta para que cubra la hora actual.' } } as Partial<AmbulanceStatus>);
const tomorrow22 = () => { const sv = new Date(Date.now() - 6 * 3_600_000); return new Date(Date.UTC(sv.getUTCFullYear(), sv.getUTCMonth(), sv.getUTCDate() + 2, 4)); }; // tomorrow 22:00 in El Salvador (UTC-6)
const gapReport = (): CrewCoverageReport => {
  const start = tomorrow22();
  return { from: '', to: '', hoursWithoutCrew: 14, covered: false,
    days: Array.from({ length: 7 }, (_, i) => ({ date: `d${i}`, hoursWithoutCrew: i === 1 || i === 2 ? 7 : 0 })),
    gaps: [{ date: 'd1', hours: 8, start: start.toISOString(), end: new Date(start.valueOf() + 8 * 3_600_000).toISOString(), missing: 'motorista' }] };
};
function mount(status: AmbulanceStatus, who = dispatcher, coverage: () => unknown = () => { throw new ApiError('Not Found', 404); }) {
  const api = { request: vi.fn(async (path: string) => path === '/ambulancia' ? status : path.startsWith('/ambulancia/cobertura') ? coverage() : []), write: vi.fn() };
  render(<AmbulancePage api={api as unknown as Api} profile={who} version={0} />);
  return api;
}

describe('Lote 5 S8 · despacho de ambulancia en web', () => {
  it('«No se puede despachar» is a danger band with a title and the reason when someone must act', async () => {
    mount(noCrew());
    const band = await screen.findByRole('region', { name: 'Despacho bloqueado' });
    expect(band.className).toContain('is-danger');
    expect(within(band).getByText('No se puede despachar.').className).toContain('amb-block-title');
    expect(within(band).getByText(/No hay paramédico con turno en curso\./)).toBeTruthy();
    expect(blockTone(noCrew())).toBe('danger');
  });

  it('a unit busy on a service blocks with a warning tone (it ends by itself)', () => {
    expect(blockTone(free({ dispatchBlock: { code: 'en_servicio', message: 'La unidad atiende un servicio.', action: '' } } as Partial<AmbulanceStatus>))).toBe('warning');
  });

  it('the readiness checklist gives each line an icon, a colour and a word for its state', async () => {
    mount(noCrew());
    const list = await screen.findByRole('list', { name: 'Preparación de la unidad' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map(i => i.className)).toEqual(['amb-ready is-ok', 'amb-ready is-missing', 'amb-ready is-ok']);
    expect(within(items[0]).getByText('Sin servicio activo')).toBeTruthy();
    expect(within(items[1]).getByText('Sin paramédico de turno')).toBeTruthy();
    expect(within(items[1]).getByText(/Falta/)).toBeTruthy();
    for (const item of items) expect(item.querySelector('svg')).toBeTruthy();
  });

  it('requests to confirm: «Confirmar y despachar» is the primary action and «Descartar» the danger one', async () => {
    mount(free());
    const detail = await screen.findByRole('article', { name: 'Detalle de la solicitud' });
    expect(within(detail).getByRole('button', { name: 'Confirmar y despachar' }).className).toBe('primary-button');
    expect(within(detail).getByRole('button', { name: 'Descartar' }).className).toContain('crud-deactivate');
  });

  it('maintenance follows the API canSetMaintenance, not only the permission', async () => {
    mount(free({ canSetMaintenance: true }), profile(['ambulancia.ver_estado']));
    expect(await screen.findByRole('button', { name: 'Poner en mantenimiento' })).toBeTruthy();
    cleanup();
    mount(free({ canSetMaintenance: false }), profile(['ambulancia.ver_estado', 'ambulancia.mantenimiento']));
    await screen.findByText('P-000-001');
    expect(screen.queryByRole('button', { name: 'Poner en mantenimiento' })).toBeNull();
  });

  it('warns about the coming days without a full crew, from GET /ambulancia/cobertura?dias=7', async () => {
    const api = mount(free(), dispatcher, gapReport);
    expect(await screen.findByText('Faltan turnos de ambulancia: 14 h sin tripulación completa en 2 de los próximos 7 días. Primer hueco: Mañana 22:00 a 06:00, falta motorista.')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/ambulancia/cobertura?dias=7', expect.anything());
  });

  it('hides the coverage warning on a 404 (API not deployed) and when every hour is covered', async () => {
    mount(free());
    await screen.findByText('P-000-001');
    expect(screen.queryByText(/Faltan turnos de ambulancia/)).toBeNull();
    expect(coverageWarning({ from: '', to: '', hoursWithoutCrew: 0, covered: true, days: [], gaps: [] })).toBeNull();
    expect(coverageWarning(null)).toBeNull();
  });
});
