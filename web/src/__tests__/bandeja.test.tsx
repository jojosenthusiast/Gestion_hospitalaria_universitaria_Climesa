import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PendingTray, TrayGroup } from '../features/dashboards/parts';
import { appointmentRequestCount } from '../features/listas/requests';

// W04 «Inicio de trabajo», R4a: the old row of counters (`WorkInbox`, glued links «5Vinculaciones→6Solicitudes…»)
// became the ONE pending tray of Inicio. These tests replace the counter tests: the tray groups own the counts.
afterEach(cleanup);
const remote = <T,>(data: T) => ({ data, loading: false, error: null, refresh: () => undefined });
const row = (id: string, title: string) => ({ id, title, tone: 'warn' as const, href: '#/citas', action: 'Confirmar' });

describe('bandeja de pendientes (W04, R4a)', () => {
  it('cuenta las solicitudes de cita igual en Inicio y en Citas: solicitadas + por motivo pendientes (S8)', () => {
    expect(appointmentRequestCount([{ state: 'solicitada' }, { state: 'confirmada' }, { state: 'solicitada' }], [{ state: 'pendiente' }, { state: 'asignada' }])).toBe(3);
  });

  it('un grupo muestra su cuenta una vez y oculta lo que no tiene', () => {
    render(<PendingTray groups={[
      { id: 'a', title: 'Solicitudes de cita', href: '#/citas', items: [row('1', 'Ana'), row('2', 'Luis')], state: remote([]) },
      { id: 'b', title: 'Admisiones sin cama', href: '#/hospitalizacion', items: [], state: remote([]) },
    ]} />);
    const grupo = screen.getByRole('region', { name: 'Solicitudes de cita' });
    expect(within(grupo).getByText('2').className).toContain('tray-count');
    expect(screen.queryByRole('region', { name: 'Admisiones sin cama' })).toBeNull();
    expect(screen.queryByText('Al día: nada pendiente.')).toBeNull();
  });

  it('con todo vacío dice una sola vez que está al día', () => {
    render(<PendingTray groups={[{ id: 'b', title: 'Admisiones sin cama', href: '#/hospitalizacion', items: [], state: remote([]) }]} />);
    expect(screen.getByText('Al día: nada pendiente.')).toBeTruthy();
  });

  it('un grupo extra (S10) abre solo si quedan huecos de los 2 más urgentes; si no, se pliega en una línea que lo despliega', async () => {
    const extra = { id: 'seg', title: 'Citas de seguimiento por confirmar', count: 1, node: <section aria-label="Citas de seguimiento por confirmar">Abigail</section> };
    const { rerender } = render(<PendingTray groups={[
      { id: 'a', title: 'Solicitudes de cita', href: '#/citas', items: [row('1', 'Ana')], state: remote([]) },
      { id: 'b', title: 'Admisiones sin cama', href: '#/hospitalizacion', items: [row('2', 'Luis')], state: remote([]) },
    ]} extras={[extra]} />);
    expect(screen.queryByRole('region', { name: 'Citas de seguimiento por confirmar' })).toBeNull();
    const folded = within(screen.getByRole('list', { name: 'Otros pendientes' })).getByText('Citas de seguimiento por confirmar').closest('li')!;
    expect(within(folded).getByText('1').className).toContain('tray-count');
    await userEvent.click(within(folded).getByRole('button', { name: 'Ver' }));
    expect(screen.getByRole('region', { name: 'Citas de seguimiento por confirmar' })).toBeTruthy();
    rerender(<PendingTray groups={[{ id: 'a', title: 'Solicitudes de cita', href: '#/citas', items: [row('1', 'Ana')], state: remote([]) }]} extras={[extra]} />);
    expect(screen.getByRole('region', { name: 'Citas de seguimiento por confirmar' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Otros pendientes' })).toBeNull();
  });

  it('un grupo que falla muestra su error con reintento y no un cero falso', () => {
    render(<TrayGroup group={{ id: 'c', title: 'Vinculaciones por verificar', href: '#/vinculaciones', items: [], state: { data: null, loading: false, error: { message: 'El servicio no está disponible.', status: 500 } as never, refresh: () => undefined } }} />);
    expect(screen.getByText('El servicio no está disponible.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
    expect(document.querySelector('.tray-count')).toBeNull();
  });
});
