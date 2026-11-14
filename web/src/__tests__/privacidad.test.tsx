import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api, type ExceptionalAccess } from '../lib/api';
import { AuditPage, ExceptionalAccessPage } from '../features/privacy';
import { lowStockAlerts } from '../features/inventory';
import { visibleModules } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); });

const profile = (permissions: string[], id = 'dpd-1'): AccessProfile => ({
  id, user: { id }, email: 'cuenta@example.test', name: 'Cuenta ficticia', roles: ['DPD'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null,
});
const access = (over: Partial<ExceptionalAccess> = {}): ExceptionalAccess => ({
  id: 'acc-1', solicitanteId: 'jop-1', solicitante: 'Persona Ficticia', solicitanteRoles: 'JOP', pacienteId: 'pac-1', expediente: '000412-7',
  motivo: 'Autorizar traslado de cama ficticio', horas: 2, urgencia: false, estado: 'pendiente', vista: 'pendiente', resueltoPor: null, resueltoEn: null,
  desde: null, hasta: null, creadoEn: '2026-11-14T16:20:00.000Z', version: 1, ...over,
});
const fakeApi = (answer: unknown) => ({ request: vi.fn().mockResolvedValue(answer), write: vi.fn() }) as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

describe('W30 · bandeja del delegado', () => {
  it('muestra la solicitud pendiente y aprueba por las horas elegidas con la versión', async () => {
    const api = fakeApi([access()]);
    api.write.mockResolvedValue(access({ estado: 'aprobado', vista: 'vigente', version: 2 }));
    render(<ExceptionalAccessPage api={api} profile={profile(['privacidad.aprobar_acceso'])} version={0} />);
    expect(await screen.findByText('Persona Ficticia (Operaciones)')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/accesos-excepcionales?estado=pendiente', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Aprobar 2 h' }));
    const dialog = screen.getByRole('dialog');
    const hours = within(dialog).getByLabelText(/Horas que apruebas/);
    await userEvent.clear(hours); await userEvent.type(hours, '1');
    await userEvent.click(within(dialog).getByRole('button', { name: /Aprobar/ }));
    expect(api.write).toHaveBeenCalledWith('/accesos-excepcionales/acc-1/aprobar', { version: 1, horas: 1 }, 'POST');
    expect(await screen.findByText('Acceso aprobado.')).toBeTruthy();
  });

  it('negar exige motivo y nunca ofrece resolver la propia solicitud (RN-38)', async () => {
    const api = fakeApi([access(), access({ id: 'acc-2', solicitanteId: 'dpd-1' })]);
    render(<ExceptionalAccessPage api={api} profile={profile(['privacidad.aprobar_acceso'])} version={0} />);
    expect(await screen.findByText('Tu propia solicitud')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Negar con motivo/ })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /Negar con motivo/ }));
    const dialog = screen.getByRole('dialog');
    const deny = within(dialog).getByRole('button', { name: /Negar/ }) as HTMLButtonElement;
    expect(deny.disabled).toBe(true);
    await userEvent.type(within(dialog).getByLabelText(/Motivo de la decisión/), 'No requiere ver contenido clínico');
    expect(deny.disabled).toBe(false);
  });
});

describe('W31 · solicitar acceso excepcional', () => {
  it('quien solo puede pedir ve sus solicitudes y envía paciente, motivo y duración', async () => {
    const api = fakeApi([access({ vista: 'vigente', estado: 'aprobado', hasta: '2026-11-14T18:20:00.000Z' })]);
    api.write.mockResolvedValue(access());
    render(<ExceptionalAccessPage api={api} profile={profile(['privacidad.solicitar_acceso'], 'jop-1')} version={0} />);
    expect(await screen.findByText('Tu solicitud')).toBeTruthy();
    expect(screen.getByText('Vigente')).toBeTruthy();
    expect(api.request).toHaveBeenCalledWith('/accesos-excepcionales', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: /Solicitar acceso/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/Identificador del paciente/), '11111111-1111-4111-8111-111111111111');
    await userEvent.type(within(dialog).getByLabelText(/^Motivo/), 'Revisión de una queja formal');
    await userEvent.click(within(dialog).getByRole('button', { name: /Enviar solicitud/ }));
    expect(api.write).toHaveBeenCalledWith('/accesos-excepcionales', { pacienteId: '11111111-1111-4111-8111-111111111111', motivo: 'Revisión de una queja formal', horas: 2 }, 'POST');
    expect(await screen.findByText(/Solicitud enviada/)).toBeTruthy();
  });

  it('el módulo se abre con cualquiera de los dos permisos y no con otros', () => {
    const ids = (codes: string[]) => visibleModules(profile(codes)).map(m => m.id);
    expect(ids(['privacidad.solicitar_acceso'])).toContain('privacidad');
    expect(ids(['privacidad.aprobar_acceso'])).toContain('privacidad');
    expect(ids(['auditoria.ver'])).not.toContain('privacidad');
  });
});

describe('W32 · auditoría con filtros y verificación', () => {
  it('filtra por persona y acción, y avisa del registro alterado', async () => {
    const api = fakeApi([{ seq: '7', at: '2026-11-14T16:44:12.000Z', role: 'MED', actor: 'Persona Ficticia', action: 'consulta.leer', entity: 'consulta', entityId: 'c-1', patientRecord: '000412-7', result: 'exito', reason: 'acceso_excepcional' }]);
    api.write.mockResolvedValue({ integra: false, revisados: 6, primeraFallida: 7, motivo: 'hash no coincide con el evento canónico', verificadoEn: '2026-11-14T16:45:00.000Z' });
    render(<AuditPage api={api} version={0} />);
    expect(await screen.findByText('consulta.leer')).toBeTruthy();
    expect(screen.getByText('Excepcional')).toBeTruthy();
    await userEvent.type(screen.getByLabelText(/^Persona/), 'Ficticia');
    await userEvent.type(screen.getByLabelText(/^Acción/), 'consulta.');
    await userEvent.click(screen.getByRole('button', { name: /Buscar/ }));
    expect(api.request).toHaveBeenLastCalledWith('/auditoria?persona=Ficticia&accion=consulta.', expect.anything());
    await userEvent.click(screen.getByRole('button', { name: /Verificar integridad/ }));
    expect(api.write).toHaveBeenCalledWith('/auditoria/verificacion', {}, 'POST');
    expect(await screen.findByText(/La cadena está alterada en el registro 7/)).toBeTruthy();
  });
});

describe('W22 · alertas de mínimo', () => {
  it('agrupa por artículo los lotes bajo el mínimo', () => {
    const row = { articulo_id: 'a-1', codigo: 'GAS-01', nombre: 'Gasa', tipo: 'insumo', unidad: 'unidad', minimo: 10, disponible: 9, vencido: 0, bajo_minimo: true };
    expect(lowStockAlerts([row, { ...row, lotId: 'l-2' }, { ...row, articulo_id: 'a-2', bajo_minimo: false }]).map(r => r.articulo_id)).toEqual(['a-1']);
  });
});
