import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type Api } from '../lib/api';
import { FOLLOW_UP_REASON, LabFollowUpPanel } from '../features/dashboards/lab-follow-up';

// Fase 2, flujo C (S10): Recepción confirma la cita de seguimiento que el sistema propone al llegar resultados.
afterEach(cleanup);

const proposal = { id: 'p-1', orderId: 'o-1', patientId: 'pac-1', patientName: 'Paciente Ficticia Uno', patientRecord: '000201-1', doctorId: 'med-1', doctorName: 'Dra. Ficticia', priority: 'rutina', resultsAt: '2026-11-15T15:00:00Z', createdAt: '2026-11-15T15:00:00Z', version: 2 };
const slot = { start: '2026-11-23T15:00:00.000Z', end: '2026-11-23T15:20:00.000Z' };

function montar(rows: unknown[], write: (path: string, body: unknown) => Promise<unknown> = async path => path === '/citas' ? { id: 'cita-9', version: 1, state: 'confirmada' } : { state: 'confirmada' }) {
  const api = {
    request: vi.fn(async (path: string) => path.startsWith('/citas/disponibilidad') ? { slots: [slot] } : rows),
    write: vi.fn(write),
  } as unknown as Api & { request: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> };
  render(<LabFollowUpPanel api={api} version={0} />);
  return api;
}

describe('Citas de seguimiento por confirmar', () => {
  it('sin propuestas dice que está al día', async () => {
    montar([]);
    expect(await screen.findByText(/Al día: no hay citas de seguimiento por confirmar/)).toBeTruthy();
  });

  it('agenda con el comando de citas y enlaza la cita a la propuesta', async () => {
    const api = montar([proposal]);
    expect(await screen.findByText('Paciente Ficticia Uno')).toBeTruthy();
    expect(screen.getByText(/Con Dra. Ficticia/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Agendar cita' }));
    const form = await screen.findByRole('form', { name: /Agendar seguimiento de Paciente Ficticia Uno/ });
    await userEvent.click(await within(form).findByRole('radio'));
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar cita' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write).toHaveBeenNthCalledWith(1, '/citas', { patientId: 'pac-1', doctorId: 'med-1', start: slot.start, end: slot.end, reason: FOLLOW_UP_REASON }, 'POST');
    expect(api.write).toHaveBeenNthCalledWith(2, '/laboratorio/seguimientos/p-1/confirmar', { version: 2, appointmentId: 'cita-9' }, 'POST');
    expect(api.request.mock.calls.some(([path]) => String(path).startsWith('/citas/disponibilidad?doctorId=med-1&date='))).toBe(true);
  });

  it('si enlazar falla, reintenta con la misma cita sin agendar otra', async () => {
    let links = 0;
    const api = montar([proposal], async path => {
      if (path === '/citas') return { id: 'cita-9', version: 1, state: 'confirmada' };
      if (links++ === 0) throw new ApiError('Sin conexión.', 503, 'no_disponible');
      return { state: 'confirmada' };
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Agendar cita' }));
    const form = await screen.findByRole('form', { name: /Agendar seguimiento/ });
    await userEvent.click(await within(form).findByRole('radio'));
    await userEvent.click(within(form).getByRole('button', { name: 'Confirmar cita' }));
    await userEvent.click(await within(form).findByRole('button', { name: 'Enlazar la cita' }));
    await vi.waitFor(() => expect(api.write).toHaveBeenCalledTimes(3));
    expect(api.write.mock.calls.filter(([path]) => path === '/citas')).toHaveLength(1);
    expect(api.write).toHaveBeenLastCalledWith('/laboratorio/seguimientos/p-1/confirmar', { version: 2, appointmentId: 'cita-9' }, 'POST');
  });

  it('descarta con un motivo de al menos 10 caracteres', async () => {
    const api = montar([proposal]);
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    const form = await screen.findByRole('form', { name: /Descartar seguimiento/ });
    const boton = within(form).getByRole('button', { name: 'Descartar propuesta' }) as HTMLButtonElement;
    await userEvent.type(within(form).getByLabelText('Motivo para no agendar'), 'Ya tiene');
    expect(boton.disabled).toBe(true);
    await userEvent.type(within(form).getByLabelText('Motivo para no agendar'), ' control agendado');
    await userEvent.click(boton);
    expect(api.write).toHaveBeenCalledWith('/laboratorio/seguimientos/p-1/descartar', { version: 2, reason: 'Ya tiene control agendado' }, 'POST');
  });
});
