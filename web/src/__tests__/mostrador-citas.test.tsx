import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AppointmentsPage, NO_SHOW_DELAY_MS } from '../features/appointments';

// R7 U1 (odd/tasks/fase2-recorridos-auditoria.md), journeys A2-A4 and B1 from the agenda: the arrival is registered
// from the appointment (D-1), «No asistió» waits 8 s with «Deshacer» (D-3), the patient cancels with quick reasons
// (D-8), and assigning a request opens on the first day with a gap (A-1). Fixed clock: Tue 17 Nov 2026, 09:00 local.
const NOW = new Date('2026-11-17T15:00:00Z');
beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ''; });

const profile = (permissions: [string, string][], patientId: string | null = null): AccessProfile => ({ id: 'u-1', user: { id: 'u-1' }, email: 'cuenta@example.test', name: 'Cuenta Ficticia', roles: [patientId ? 'PAC' : 'REC'], platforms: ['web'], permissions: permissions.map(([code, context]) => ({ code, context })), channels: [], patientId, staffId: null });
const rec = () => profile([['citas.ver', 'global'], ['citas.agendar', 'global'], ['citas.cancelar', 'global'], ['pacientes.buscar', 'global'], ['fila.emitir', 'global']]);
const pac = () => profile([['citas.ver', 'propio'], ['citas.cancelar', 'propio'], ['citas.solicitar', 'propio']], 'p-1');
const row = (over: Record<string, unknown> = {}) => ({ id: 'c-1', patientId: 'p-1', patientName: 'Ana Ficticia Agenda', doctorId: 'd-1', doctorName: 'Dra. Rosa Prueba', start: '2026-11-17T16:20:00Z', end: '2026-11-17T16:40:00Z', state: 'confirmada', origin: 'recepcion', version: 4, allowedActions: ['cancelar', 'no_asistio'], blockedActions: [], arrival: null, ...over });
const doctors = [{ id: 'd-1', givenNames: 'Rosa', surnames: 'Prueba', specialty: 'Medicina general', active: true, tieneTurno: true }, { id: 'd-2', givenNames: 'Otro', surnames: 'Médico', specialty: 'Medicina general', active: true, tieneTurno: true }];
const request = { id: 's-1', patientId: 'p-1', patientName: 'Ana Ficticia Agenda', record: 'EXP-1', categories: [{ code: 'consulta_general', name: 'Consulta general', icon: 'general' }], specialties: ['Medicina general'], franja: 'tarde', note: null, preferredDoctorId: null, state: 'pendiente', appointment: null, createdAt: '2026-11-16T14:00:00Z', version: 1, allowedActions: ['asignar', 'rechazar'], blockedActions: [] };

function mount(who: AccessProfile, rows: unknown[] = [row()], write = vi.fn(async (..._args: unknown[]) => ({}))) {
  const api = {
    request: vi.fn(async (path: string) => {
      if (path === '/citas') return rows;
      if (path === '/citas/solicitudes-categoria') return who.patientId ? [] : [request];
      if (path === '/citas/solicitudes-categoria/s-1/sugerencia') return { found: true, doctorId: 'd-1', doctorName: 'Rosa Prueba', specialty: 'Medicina general', date: '2026-11-19', start: '2026-11-19T18:40:00Z', end: '2026-11-19T19:00:00Z' };
      if (path.startsWith('/citas/catalogos')) return { patients: [], doctors };
      if (path.startsWith('/citas/disponibilidad')) return { durationMinutes: 20, workPeriods: [], slots: [], franjas: [] };
      if (path === '/pacientes/p-9') return { id: 'p-9', record: 'EXP-9', fullName: 'Lucía Ficticia Ficha' };
      return [];
    }),
    write,
  };
  render(<AppointmentsPage api={api as unknown as Api} profile={who} version={0} />);
  return api;
}

describe('B1 desde la agenda · registrar llegada (D-1)', () => {
  it('a confirmed appointment of today registers the arrival in one click and says the number in place', async () => {
    const write = vi.fn(async () => ({ id: 't-12', numero: 12, area: 'CON', service: 'consulta_general', ahead: 2 }));
    const api = mount(rec(), [row(), row({ id: 'c-2', start: '2026-11-18T16:20:00Z', end: '2026-11-18T16:40:00Z', patientName: 'Mañana Ficticia' })], write);
    const buttons = await screen.findAllByRole('button', { name: /^Registrar llegada ·/ });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(api.write).toHaveBeenCalledTimes(1);
    expect(api.write).toHaveBeenCalledWith('/fila', { service: 'consulta_general', patientId: 'p-1', appointmentId: 'c-1' }, 'POST');
    expect(await screen.findByText('Llegada registrada: Ana Ficticia Agenda tiene el número CON 12, 2 antes.')).toBeTruthy();
    await vi.waitFor(() => expect(api.request.mock.calls.filter(([p]) => p === '/citas').length).toBe(2));
  });

  it('an appointment that already arrived shows its number instead of the button', async () => {
    mount(rec(), [row({ arrival: { id: 't-12', numero: 12, state: 'en_espera' } })]);
    expect(await screen.findByText(/Llegó · CON 12/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Registrar llegada ·/ })).toBeNull();
  });
});

describe('#9 and #15 · the request tray', () => {
  it('#/citas?asignar=<id> opens the assign panel of that request and clears the address', async () => {
    location.hash = '#/citas?asignar=s-1';
    mount(rec());
    expect((await screen.findByRole('button', { name: 'Asignar · Ana Ficticia Agenda' })).getAttribute('aria-expanded')).toBe('true');
    expect(location.hash).not.toContain('asignar=');
  });

  it('on a phone a tray of more than 3 folds to 3 with «Ver las N restantes»', async () => {
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      const asked = [1, 2, 3, 4].map(n => row({ id: `a-${n}`, state: 'solicitada', patientName: `Pide Ficticia ${n}`, start: `2026-11-2${n}T16:20:00Z`, end: `2026-11-2${n}T16:40:00Z`, allowedActions: ['confirmar', 'rechazar'] }));
      mount(rec(), asked);
      const tray = await screen.findByRole('region', { name: 'Solicitudes por asignar' });
      await within(tray).findByText('Ana Ficticia Agenda');
      expect(tray.querySelectorAll('.rq-row')).toHaveLength(3);
      await userEvent.click(within(tray).getByRole('button', { name: 'Ver las 2 restantes' }));
      expect(tray.querySelectorAll('.rq-row')).toHaveLength(5);
    } finally { window.matchMedia = media; }
  });

  it('on a phone each doctor of the day starts folded (except the first) and opens on its header', async () => {
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      mount(rec(), [row(), row({ id: 'c-3', doctorId: 'd-2', doctorName: 'Dr. Otro Médico', patientName: 'Segunda Ficticia', start: '2026-11-17T17:20:00Z', end: '2026-11-17T17:40:00Z' })]);
      await screen.findByRole('button', { name: /Dr. Otro Médico/ });
      const headers = [/Dr. Otro Médico/, /Dra. Rosa Prueba/].map(name => screen.getByRole('button', { name }));
      expect(headers.map(h => h.getAttribute('aria-expanded')).sort()).toEqual(['false', 'true']);
      const folded = headers.find(h => h.getAttribute('aria-expanded') === 'false')!;
      const hidden = folded === headers[0] ? 'Segunda Ficticia' : 'Ana Ficticia Agenda';
      expect(screen.queryAllByText(hidden).filter(n => n.closest('.ag-day'))).toHaveLength(0);
      await userEvent.click(folded);
      expect(screen.queryAllByText(hidden).filter(n => n.closest('.ag-day')).length).toBeGreaterThan(0);
    } finally { window.matchMedia = media; }
  });

  it('on a phone reception sees one day with day navigation; «Quitar filtros» does not appear for it', async () => {
    const media = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      mount(rec(), [row(), row({ id: 'c-2', start: '2026-11-25T16:20:00Z', end: '2026-11-25T16:40:00Z', patientName: 'Otro Día Ficticia' })]);
      expect((await screen.findAllByText('Ana Ficticia Agenda')).length).toBeGreaterThan(0);
      expect((screen.getByRole('combobox', { name: 'Fechas' }) as HTMLSelectElement).value).toBe('dia');
      expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeTruthy();
      expect(screen.queryByText('Otro Día Ficticia')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Quitar filtros' })).toBeNull();
    } finally { window.matchMedia = media; }
  });
});

describe('A3 · «No asistió» con deshacer (D-3)', () => {
  it('waits 8 s before sending; «Deshacer» sends nothing', async () => {
    const api = mount(rec());
    const button = await screen.findByRole('button', { name: 'No asistió · Ana Ficticia Agenda' });
    vi.useRealTimers(); vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    expect(screen.getByText('Se marcará «No asistió» en unos segundos.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Deshacer/ }));
    await act(async () => { vi.advanceTimersByTime(NO_SHOW_DELAY_MS + 100); });
    expect(api.write).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'No asistió · Ana Ficticia Agenda' })).toBeTruthy();
  });

  it('after 8 s it is sent with the version it had', async () => {
    const api = mount(rec());
    const button = await screen.findByRole('button', { name: 'No asistió · Ana Ficticia Agenda' });
    vi.useRealTimers(); vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    await act(async () => { vi.advanceTimersByTime(NO_SHOW_DELAY_MS - 100); });
    expect(api.write).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(api.write).toHaveBeenCalledWith('/citas/c-1/no-asistio', { version: 4 }, 'POST');
  });

  const CHANGED = 'La cita cambió mientras esperaba; no se marcó «No asistió».';
  it('sends the live version: a refresh during the 8 s wins over the version of the click', async () => {
    const rows = [row()];
    const api = { request: vi.fn(async (path: string) => (path === '/citas' ? rows : path.startsWith('/citas/catalogos') ? { patients: [], doctors } : [])), write: vi.fn(async (..._args: unknown[]) => ({})) };
    const view = render(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={0} />);
    const button = await screen.findByRole('button', { name: 'No asistió · Ana Ficticia Agenda' });
    vi.useRealTimers(); vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    rows[0] = row({ version: 5, note: 'editada' });
    view.rerender(<AppointmentsPage api={api as unknown as Api} profile={rec()} version={1} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(api.request.mock.calls.filter(([p]) => p === '/citas').length).toBe(2);
    expect(api.write).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(NO_SHOW_DELAY_MS); });
    vi.useRealTimers();
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledWith('/citas/c-1/no-asistio', { version: 5 }, 'POST'));
  });

  it('a 409 (the appointment changed meanwhile) says so in plain words', async () => {
    const write = vi.fn(async (..._args: unknown[]) => { throw new ApiError('La cita cambió; vuelve a abrirla.', 409, 'version_conflicto', 5); });
    mount(rec(), [row()], write);
    const button = await screen.findByRole('button', { name: 'No asistió · Ana Ficticia Agenda' });
    vi.useRealTimers(); vi.useFakeTimers({ now: NOW, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fireEvent.click(button);
    await act(async () => { vi.advanceTimersByTime(NO_SHOW_DELAY_MS + 100); });
    vi.useRealTimers();
    expect(await screen.findByText(CHANGED)).toBeTruthy();
  });
});

describe('A4 · cancelar (D-8)', () => {
  it('the patient taps a quick reason, no text; the summary shows doctor and time', async () => {
    const api = mount(pac(), [row({ start: '2026-11-20T16:20:00Z', end: '2026-11-20T16:40:00Z' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar · Ana Ficticia Agenda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar cita' });
    expect(within(dialog).getByText('Dra. Rosa Prueba')).toBeTruthy();
    const send = within(dialog).getByRole('button', { name: /Cancelar cita/ });
    expect(send).toHaveProperty('disabled', true);
    await userEvent.click(within(dialog).getByRole('radio', { name: 'No puedo a esa hora' }));
    await userEvent.click(send);
    expect(api.write).toHaveBeenCalledWith('/citas/c-1/cancelar', { version: 4, reasonCode: 'no_puedo_a_esa_hora' }, 'POST');
  });

  it('«Otro motivo» asks a few words', async () => {
    const api = mount(pac(), [row({ start: '2026-11-20T16:20:00Z', end: '2026-11-20T16:40:00Z' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar · Ana Ficticia Agenda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar cita' });
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Otro motivo' }));
    await userEvent.type(within(dialog).getByLabelText(/Cuéntanos brevemente/), 'Viaje');
    await userEvent.click(within(dialog).getByRole('button', { name: /Cancelar cita/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/c-1/cancelar', { version: 4, reasonCode: 'otro', reason: 'Viaje' }, 'POST');
  });

  it('reception keeps writing the reason (10+ characters), no chips', async () => {
    const api = mount(rec(), [row({ start: '2026-11-20T16:20:00Z', end: '2026-11-20T16:40:00Z' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar · Ana Ficticia Agenda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar cita' });
    expect(within(dialog).queryByRole('radio')).toBeNull();
    await userEvent.type(within(dialog).getByLabelText(/Motivo de cancelación/), 'Paciente llamó para cancelar');
    await userEvent.click(within(dialog).getByRole('button', { name: /Cancelar cita/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/c-1/cancelar', { version: 4, reason: 'Paciente llamó para cancelar' }, 'POST');
  });

  it('reception can fill the reason with one tap and still edit it; the text is what the server gets', async () => {
    const api = mount(rec(), [row({ start: '2026-11-20T16:20:00Z', end: '2026-11-20T16:40:00Z' })]);
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar · Ana Ficticia Agenda' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar cita' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'El paciente llamó para cancelar' }));
    const field = within(dialog).getByLabelText(/Motivo de cancelación/) as HTMLInputElement;
    expect(field.value).toBe('El paciente llamó para cancelar');
    await userEvent.type(field, ' por viaje');
    await userEvent.click(within(dialog).getByRole('button', { name: /^Cancelar cita$/ }));
    expect(api.write).toHaveBeenCalledWith('/citas/c-1/cancelar', { version: 4, reason: 'El paciente llamó para cancelar por viaje' }, 'POST');
  });

  it('a cancelled appointment shows the patient reason to reception', async () => {
    mount(rec(), [row({ state: 'cancelada', allowedActions: [], cancelReasonCode: 'ya_no_lo_necesito', cancelReason: null, start: '2026-11-20T16:20:00Z', end: '2026-11-20T16:40:00Z' })]);
    await userEvent.click(within(await screen.findByRole('group', { name: 'Estado de la cita' })).getByRole('button', { name: /^Todas/ }));
    expect(await screen.findByText('Motivo: Ya no lo necesito')).toBeTruthy();
  });
});

describe('A2 · asignar abre en el primer hueco (A-1)', () => {
  it('the panel opens on the suggested day with the suggested doctor and offers 7 day chips', async () => {
    const api = mount(rec(), []);
    await userEvent.click(await screen.findByRole('button', { name: 'Asignar · Ana Ficticia Agenda' }));
    expect(await screen.findByText(/Primer hueco en la franja pedida/)).toBeTruthy();
    await vi.waitFor(() => expect(api.request).toHaveBeenCalledWith('/citas/catalogos?date=2026-11-19', expect.anything()));
    const days = screen.getByRole('group', { name: 'Días' });
    expect(within(days).getAllByRole('button')).toHaveLength(7);
    expect(within(days).getAllByRole('button')[0].getAttribute('aria-pressed')).toBe('true');
    await vi.waitFor(() => expect(api.request.mock.calls.map(([p]) => p)).toContain('/citas/disponibilidad?doctorId=d-1&date=2026-11-19'));
  });
});

describe('A2 · agendar desde la ficha', () => {
  it('#/citas?accion=agendar&paciente=<id> opens the form with the patient fixed', async () => {
    location.hash = '#/citas?accion=agendar&paciente=p-9';
    mount(rec(), []);
    const dialog = await screen.findByRole('dialog', { name: 'Agendar cita' });
    expect(await within(dialog).findByText('Lucía Ficticia Ficha')).toBeTruthy();
    expect(within(dialog).queryByRole('combobox', { name: 'Paciente' })).toBeNull();
    expect(location.hash).not.toContain('paciente=');
  });
});
