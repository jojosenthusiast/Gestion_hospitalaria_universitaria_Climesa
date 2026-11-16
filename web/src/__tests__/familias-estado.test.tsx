import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PriorityBadge, statusFamily, StatusBadge } from '../components/system';
import { priorityLevel } from '../features/ambulance/types';
import { AttentionList } from '../features/dashboards/parts';
import { StatusChip } from '../features/inventory/parts';

// Fase 2, S13 (T10w): stock and link-check states join the shared family table, same as Android.
afterEach(cleanup);

describe('familias de estado de existencias y de verificación (S13)', () => {
  it('asigna cada estado de existencias a su familia, sin rojo', () => {
    expect(statusFamily('agotado')).toBe('cerrado');
    expect(statusFamily('bajo_minimo')).toBe('llamado');
    expect(statusFamily('por_vencer')).toBe('espera');
    expect(statusFamily('ok')).toBe('listo');
  });

  it('asigna coincide y revisar a sus familias', () => {
    expect(statusFamily('coincide')).toBe('listo');
    expect(statusFamily('revisar')).toBe('espera');
  });

  it('muestra los estados nuevos con ícono, etiqueta y patrón', () => {
    render(<><StatusBadge value="agotado" /><StatusBadge value="coincide" /><StatusBadge value="revisar" /></>);
    for (const [label, pattern] of [['Agotado', 'discontinuo'], ['Coincide', 'contorno'], ['Revisar', 'rayado']] as const) {
      const badge = screen.getByText(label).closest('.status-badge')!;
      expect(badge.querySelector('svg')).toBeTruthy();
      expect(badge.className).toContain(`pattern-${pattern}`);
    }
  });

  it('el chip de inventario usa el StatusBadge común', () => {
    render(<StatusChip status="por_vencer" />);
    const badge = screen.getByText('Por vencer').closest('.status-badge')!;
    expect(badge.className).toContain('fam-espera');
    expect(badge.className).not.toContain('inv-tag');
  });
});

describe('prioridad de ambulancia y lista de atención (S13)', () => {
  it('el triage de ambulancia usa PriorityBadge: solo roja es emergencia', () => {
    expect(['roja', 'naranja', 'amarilla', 'verde'].map(priorityLevel)).toEqual(['emergencia', 'urgente', 'urgente', 'rutina']);
    render(<PriorityBadge value={priorityLevel('roja')} label="Roja" />);
    expect(screen.getByText('Roja').closest('.priority-badge')!.className).toContain('priority-emergencia');
  });

  it('la lista de atención muestra el estado con StatusBadge y el área con AreaTag', () => {
    render(<AttentionList items={[
      { id: '1', title: 'Guantes', tone: 'warn', href: '#/inventario', action: 'Ver', tag: 'Bajo mínimo', status: 'bajo_minimo' },
      { id: '2', title: 'Caída en casa', tone: 'danger', href: '#/ambulancia', action: 'Despachar', tag: 'Ambulancia', area: 'AMB' },
    ]} />);
    expect(screen.getByText('Bajo mínimo').closest('.status-badge')!.className).toContain('fam-llamado');
    expect(document.querySelector('.attention-tag')).toBeNull();
    expect(screen.getByText('AMB')).toBeTruthy();
  });
});
