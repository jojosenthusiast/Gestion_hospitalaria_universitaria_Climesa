import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AccessProfile, type Api } from '../lib/api';
import { AuditPage } from '../features/privacy';
import { lowStockAlerts } from '../features/inventory';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); });

const profile = (permissions: string[], id = 'dpd-1'): AccessProfile => ({
  id, user: { id }, email: 'cuenta@example.test', name: 'Cuenta ficticia', roles: ['DPD'], platforms: ['web'],
  permissions: permissions.map(code => ({ code, context: 'x' })), channels: [], patientId: null, staffId: null,
});
const fakeApi = (answer: unknown) => ({ request: vi.fn().mockResolvedValue(answer), write: vi.fn() }) as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };

describe('W32 · auditoría con filtros y verificación', () => {
  it('filtra por persona y acción, y avisa del registro alterado', async () => {
    const api = fakeApi([{ seq: '7', at: '2026-11-14T16:44:12.000Z', role: 'MED', actor: 'Persona Ficticia', action: 'consulta.leer', entity: 'consulta', entityId: 'c-1', patientRecord: '000412-7', result: 'exito', reason: 'acceso_excepcional' }]);  // legacy row of the retired module
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
