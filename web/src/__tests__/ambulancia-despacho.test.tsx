import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type AccessProfile, type Api } from '../lib/api';
import { AmbulancePage, waitingLabel, type AmbulanceStatus } from '../features/ambulance';
import { AmbulanceLogPage, logPath } from '../features/ambulance-log';
import { modules, visibleModules } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); });

const profile = (permissions: Array<string | [string, string]>, roles = ['REC']): AccessProfile => ({
  id: 'staff-1', user: { id: 'staff-1' }, email: 'staff@example.test', name: 'Personal de prueba', roles, platforms: ['web'],
  permissions: permissions.map(p => Array.isArray(p) ? { code: p[0], context: p[1] } : { code: p, context: 'x' }), channels: ['ambulancia'], patientId: null, staffId: 'staff-1',
});
const request = { id: 'req-1', channel: 'app_paciente', address: 'Colonia Ficticia 12', municipality: 'San Salvador', reason: 'Caída en casa', contactPhone: '7000-0001', createdAt: '2026-11-15T14:00:00.000Z', version: 1, registeredPatient: true };
const board: AmbulanceStatus = { unit: { id: 'unit-1', plate: 'P-000-001', state: 'disponible', version: 5 }, activeService: null, paramedicOnDuty: true, pendingRequests: [request] };
const serving: AmbulanceStatus = {
  unit: { id: 'unit-1', plate: 'P-000-001', state: 'en_servicio', version: 6 }, paramedicOnDuty: true, pendingRequests: [],
  activeService: { id: 'svc-1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Ficticia 12', destination: 'Hospital CLIMESA', dispatchedAt: '2026-11-15T14:00:00.000Z', hasPrehospital: true, crew: [], milestones: [{ type: 'salida', occurredAt: '2026-11-15T14:05:00.000Z' }], nextMilestones: ['en_escena', 'finalizado'] },
};
const dispatcher = profile(['ambulancia.ver_estado', 'ambulancia.despachar', 'ambulancia.solicitar', 'ambulancia.recibir_prehospital']);
const apiReturning = (status: AmbulanceStatus, extra: Record<string, unknown> = {}) => {
  const request = vi.fn(async (path: string) => path === '/ambulancia' ? status : extra[path]);
  return { request, write: vi.fn().mockResolvedValue({ id: 'svc-1' }) } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
};

describe('W18 centro de despacho', () => {
  it('confirma y despacha una solicitud con la versión de la unidad', async () => {
    const api = apiReturning(board);
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    const table = await screen.findByRole('region', { name: 'Solicitudes por confirmar' });
    expect(within(table).getByText('Colonia Ficticia 12 · San Salvador')).toBeTruthy();
    await userEvent.click(within(table).getByRole('button', { name: 'Confirmar y despachar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar y despachar' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Prioridad'), 'roja');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despachar' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/servicios', { version: 5, type: 'emergencia_domicilio', priority: 'roja', destination: 'Hospital CLIMESA, emergencia', requestId: 'req-1', municipality: 'San Salvador' }, 'POST');
  });

  it('quien pierde la carrera ve "La ambulancia ya fue despachada."', async () => {
    const api = apiReturning(board);
    api.write.mockRejectedValue(new ApiError('La ambulancia ya fue despachada.', 409, 'ambulancia_ya_despachada'));
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar y despachar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar y despachar' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Despachar' }));
    expect(await within(dialog).findByText('La ambulancia ya fue despachada.')).toBeTruthy();
  });

  it('descarta con motivo y registra una llamada telefónica', async () => {
    const api = apiReturning(board);
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    const discard = await screen.findByRole('dialog', { name: 'Descartar solicitud' });
    await userEvent.type(within(discard).getByLabelText('Motivo'), 'Llamada duplicada');
    await userEvent.click(within(discard).getByRole('button', { name: 'Descartar' }));
    expect(api.write).toHaveBeenCalledWith('/ambulancia/solicitudes/req-1/descartar', { version: 1, reason: 'Llamada duplicada' }, 'POST');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar llamada' }));
    const call = await screen.findByRole('dialog', { name: 'Registrar llamada' });
    expect(within(call).getByText(/llame al 911/)).toBeTruthy();
    await userEvent.type(within(call).getByLabelText('Dirección'), 'Barrio Ficticio, calle 2');
    await userEvent.type(within(call).getByLabelText('Motivo'), 'Dolor de pecho');
    await userEvent.type(within(call).getByLabelText('Teléfono de contacto'), '2200-0000');
    await userEvent.click(within(call).getByRole('button', { name: 'Registrar solicitud' }));
    expect(api.write).toHaveBeenLastCalledWith('/ambulancia/solicitudes', { address: 'Barrio Ficticio, calle 2', reason: 'Dolor de pecho', contactPhone: '2200-0000' }, 'POST');
  });

  it('sin despachar no muestra solicitudes ni acciones de despacho', async () => {
    render(<AmbulancePage api={apiReturning(board)} profile={profile(['ambulancia.ver_estado'], ['MED'])} version={0} />);
    await screen.findByText('P-000-001');
    expect(screen.queryByRole('region', { name: 'Solicitudes por confirmar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Registrar llamada' })).toBeNull();
  });

  it('muestra los hitos del servicio activo y el prehospital sin datos clínicos cuando la API los omite', async () => {
    const api = apiReturning(serving, { '/ambulancia/servicios/svc-1/prehospital': { serviceId: 'svc-1', active: true, priority: 'roja', patientLinked: false, clinical: false, reports: [{ id: 'r1', priority: 'roja', estimatedArrival: '2026-11-15T14:30:00.000Z', capturedAt: '2026-11-15T14:10:00.000Z', receivedAt: '2026-11-15T14:10:00.000Z' }] } });
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    const milestones = await screen.findByRole('list', { name: 'Hitos del servicio' });
    expect(within(milestones).getAllByText('Pendiente')).toHaveLength(4);
    await userEvent.click(screen.getByRole('button', { name: 'Ver reporte prehospital' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reporte prehospital' });
    expect(await within(dialog).findByText(/solo los ve el equipo que recibe/)).toBeTruthy();
    expect(within(dialog).queryByText('Motivo')).toBeNull();
  });
});

describe('W18 solicitudes en maestro-detalle', () => {
  const phone = { ...request, id: 'req-2', channel: 'telefono', address: 'Calle a Apopa', municipality: 'Apopa', reason: 'Persona caída en la vía', contactPhone: '7000-2222', registeredPatient: false, requesterName: 'Marta Quintanilla', callerName: 'Marta Quintanilla', patientRecord: null, createdAt: '2026-11-15T13:00:00.000Z' };
  const known = { ...request, requesterName: 'Ana Ficticia Pérez', patientRecord: 'EXP-0042' };

  it('muestra quién pidió, su expediente o teléfono y el tiempo de espera, y cambia el detalle al elegir otra', async () => {
    const api = apiReturning({ ...board, pendingRequests: [known, phone] });
    render(<AmbulancePage api={api} profile={dispatcher} version={0} />);
    const detail = await screen.findByRole('article', { name: 'Detalle de la solicitud' });
    expect(within(detail).getByText(/Ana Ficticia Pérez · expediente/)).toBeTruthy();
    expect(within(detail).getByText('EXP-0042')).toBeTruthy();
    expect(within(detail).getByText('7000-0001')).toBeTruthy();
    expect(within(detail).getByText('Caída en casa')).toBeTruthy();
    expect(screen.getAllByText(/^(Espera |Recién)/).length).toBe(2);
    expect(waitingLabel(0)).toBe('Recién recibida');
    expect(waitingLabel(45)).toBe('Espera 45 min');
    expect(waitingLabel(130)).toBe('Espera 2 h 10 min');
    await userEvent.click(within(screen.getByRole('list', { name: 'Lista de solicitudes' })).getByRole('button', { name: /Marta Quintanilla/ }));
    const second = screen.getByRole('article', { name: 'Detalle de la solicitud' });
    expect(within(second).getByText(/Marta Quintanilla · sin expediente/)).toBeTruthy();
    expect(within(second).getByText('7000-2222')).toBeTruthy();
    expect(within(second).getByText('Llamada telefónica')).toBeTruthy();
    await userEvent.click(within(second).getByRole('button', { name: 'Confirmar y despachar' }));
    await screen.findByRole('dialog', { name: 'Confirmar y despachar' });
    expect(screen.getByText(/pidió Marta Quintanilla/)).toBeTruthy();
  });

  it('con la unidad en mantenimiento no despacha, dice por qué y qué hacer, y deja descartar', async () => {
    const blocked: AmbulanceStatus = { ...board, unit: { ...board.unit, state: 'en_mantenimiento', stateReason: 'Cambio de llantas', stateSince: '2026-11-15T12:00:00.000Z' }, paramedicOnDuty: false, dispatchBlock: { code: 'en_mantenimiento', message: 'La unidad está en mantenimiento y no hay paramédico con turno en curso.', action: 'Publica un turno de paramédico que cubra la hora actual y luego saca la unidad de mantenimiento (RN-30).' }, pendingRequests: [phone] };
    render(<AmbulancePage api={apiReturning(blocked)} profile={profile([...dispatcher.permissions.map(p => p.code), 'ambulancia.mantenimiento'], ['JOP'])} version={0} />);
    const detail = await screen.findByRole('article', { name: 'Detalle de la solicitud' });
    expect(within(detail).getByText(/No se puede despachar ahora/)).toBeTruthy();
    expect(within(detail).getByText(/Publica un turno de paramédico/)).toBeTruthy();
    expect((within(detail).getByRole('button', { name: 'Confirmar y despachar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(detail).getByRole('button', { name: 'Descartar' }) as HTMLButtonElement).disabled).toBe(false);
    const maintenance = screen.getByRole('region', { name: 'Mantenimiento de la unidad' });
    expect(within(maintenance).getByText(/Cambio de llantas/)).toBeTruthy();
    expect((within(maintenance).getByRole('button', { name: 'Sacar de mantenimiento' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('W19 bitácora de ambulancia', () => {
  it('arma la consulta solo con los filtros llenos', () => {
    expect(logPath({ from: '2026-11-01', to: '', type: '', finalState: 'completado', priority: '', municipality: ' ', minResponseMinutes: '15', q: '' })).toBe('/ambulancia/bitacora?from=2026-11-01&finalState=completado&minResponseMinutes=15');
  });

  it('cuenta cada servicio como historia con sus tiempos y vuelve a pedir con los filtros', async () => {
    const rows = [{ id: 's1', type: 'emergencia_domicilio', priority: 'roja', origin: 'Colonia Ficticia', destination: 'Hospital CLIMESA', municipality: 'San Salvador', dispatchedAt: '2026-11-15T14:00:00.000Z', finishedAt: '2026-11-15T14:40:00.000Z', finalState: 'completado', responseMinutes: 20, patientRef: '*******042', milestones: [{ type: 'salida', occurredAt: '2026-11-15T14:05:00.000Z' }, { type: 'en_escena', occurredAt: '2026-11-15T14:20:00.000Z' }], crew: [{ staffId: 'p1', role: 'paramedico', name: 'Persona Ficticia' }] }];
    const api = { request: vi.fn().mockResolvedValue(rows), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
    render(<AmbulanceLogPage api={api} version={0} />);
    expect(await screen.findByText(/Llegó a la escena en 20 min/)).toBeTruthy();
    expect(screen.getByText(/La ambulancia salió de Colonia Ficticia \(San Salvador\) hacia Hospital CLIMESA — paciente con expediente \*+042, con Persona Ficticia, completado\./)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Hitos del servicio' })).getAllByRole('listitem')).toHaveLength(2);
    // Los filtros viven en un panel plegable; al elegir uno aparece su chip y la consulta cambia.
    expect(screen.queryByLabelText('Prioridad')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Filtros' }));
    await userEvent.selectOptions(screen.getByLabelText('Prioridad'), 'roja');
    expect(api.request).toHaveBeenLastCalledWith('/ambulancia/bitacora?priority=roja', expect.anything());
    expect(screen.getByText('Prioridad: Roja')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtros' }));
    expect(api.request).toHaveBeenLastCalledWith('/ambulancia/bitacora', expect.anything());
    expect(screen.queryByText('Prioridad: Roja')).toBeNull();
  });

  it('la búsqueda compacta consulta con q y la vista de tabla conserva los datos', async () => {
    const rows = [{ id: 's1', type: 'traslado_interhospitalario', priority: 'verde', origin: 'Clínica Norte', destination: 'Hospital CLIMESA', dispatchedAt: '2026-11-15T14:00:00.000Z', finalState: null, responseMinutes: null, crew: [] }];
    const api = { request: vi.fn().mockResolvedValue(rows), write: vi.fn() } as unknown as Api & { request: ReturnType<typeof vi.fn> };
    render(<AmbulanceLogPage api={api} version={0} />);
    await screen.findByText(/sin paciente vinculado/);
    await userEvent.type(screen.getByLabelText('Buscar en la bitácora'), 'Soyapango');
    await waitFor(() => expect(api.request).toHaveBeenLastCalledWith('/ambulancia/bitacora?q=Soyapango', expect.anything()));
    await userEvent.click(screen.getByRole('button', { name: 'Tabla' }));
    expect(screen.getByRole('cell', { name: 'En curso' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Sin llegada a escena' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Quitar búsqueda' }));
    await waitFor(() => expect(api.request).toHaveBeenLastCalledWith('/ambulancia/bitacora', expect.anything()));
  });

  it('aparece en el menú solo con ambulancia.ver_bitacora', () => {
    expect(modules.find(m => m.id === 'bitacora-ambulancia')).toMatchObject({ permission: 'ambulancia.ver_bitacora' });
    expect(visibleModules(profile(['ambulancia.ver_bitacora'], ['DPD'])).map(m => m.id)).toContain('bitacora-ambulancia');
    expect(visibleModules(profile(['ambulancia.ver_estado'])).map(m => m.id)).not.toContain('bitacora-ambulancia');
  });
});
