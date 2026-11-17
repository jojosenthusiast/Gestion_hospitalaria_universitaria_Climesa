import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { NoticesPage } from '../features/notices';
import { NoticeCard } from '../features/avisos/NoticePreview';

// S11: un aviso solo de área llega por /me/avisos sin público, roles ni áreas. Quien lo lee ve «Tu área», como en iOS
// (`NoticeRules.audience`); quien publica sin elegir audiencia sigue viendo «sin audiencia» en la vista previa.
afterEach(cleanup);

const sinAudiencia = { titulo: 'Lavado de manos', cuerpo: 'Recordatorio del área.', prioridad: 'atencion' as const, nivel: 'informativo' as const, publico: false, roles: [], areas: [] };

describe('Audiencia de un aviso', () => {
  it('la vista previa de quien publica dice «sin audiencia» si no eligió a nadie', () => {
    render(<NoticeCard notice={sinAudiencia} />);
    expect(screen.getByText(/Para: sin audiencia/)).toBeTruthy();
  });

  it('quien lo recibe en «Para mí» ve «Tu área» en un aviso solo de área', async () => {
    const aviso = { ...sinAudiencia, id: 'a-1', desde: '2026-11-14T12:00:00.000Z', hasta: '2099-11-20T12:00:00.000Z', publicadoEn: '2026-11-14T12:00:00.000Z', dirigido: true, enteradoEn: null, recordarEn: null, destacado: false };
    const api = { request: vi.fn(async () => ({ actualizadoEn: '2026-11-14T12:00:00.000Z', avisos: [aviso], noLeidos: 1, criticos: 0, recordatorioHoras: 4, proximoCambio: null })), write: vi.fn() };
    const profile = { id: 'u', user: { id: 'u' }, email: 'u@example.test', name: 'Cuenta', roles: ['ENF'], platforms: ['web'], permissions: [], channels: [], patientId: null, staffId: null } as unknown as AccessProfile;
    render(<NoticesPage api={api as unknown as Api} profile={profile} version={0} />);
    expect(await screen.findByText(/Para: Tu área/)).toBeTruthy();
    expect(screen.queryByText(/sin audiencia/)).toBeNull();
  });
});
