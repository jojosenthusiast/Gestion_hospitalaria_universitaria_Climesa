import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { statusFamily, statusPriority, StatusBadge } from '../components/system';

// Fase 2, R1 (S7): each value reads as what it means. A confirmed appointment waits for its time (no megaphone),
// out-of-range lab values and stock problems need attention (urgent amber), and red stays for critical only.
afterEach(cleanup);

const badge = (value: string) => {
  render(<StatusBadge value={value} />);
  return document.querySelector('.status-badge')!;
};

describe('familias de estado corregidas (R1, WC-9, WC-10, WC-11)', () => {
  it('confirmada espera su hora: reloj, no megáfono', () => {
    expect(statusFamily('confirmada')).toBe('espera');
    expect(badge('confirmada').className).toContain('fam-espera');
  });

  it('reprogramada espera su nueva hora', () => {
    expect(statusFamily('reprogramada')).toBe('espera');
  });

  it('una cama en limpieza está en uso, no llamada', () => {
    expect(statusFamily('limpieza')).toBe('atencion');
  });

  // Cross-platform mapping (web, iOS, Android): stock below the minimum waits for a restock.
  it('bajo mínimo espera reposición: reloj, no megáfono', () => {
    expect(statusFamily('bajo_minimo')).toBe('espera');
    expect(statusPriority('bajo_minimo')).toBeNull();
    expect(badge('bajo_minimo').className).toContain('fam-espera');
  });

  it('llamado y en proceso son los únicos valores de la familia llamado', () => {
    expect(statusFamily('llamado')).toBe('llamado');
    expect(statusFamily('en_proceso')).toBe('llamado');
  });

  it('una métrica que requiere atención es un estado de atención', () => {
    expect(statusFamily('requiere_atencion')).toBe('atencion');
    render(<StatusBadge value="requiere_atencion" />);
    expect(screen.getByText('Requiere atención').closest('.status-badge')!.className).toContain('fam-atencion');
  });

  it('un valor de laboratorio alto es urgente, con ícono y etiqueta', () => {
    expect(statusPriority('alto')).toBe('urgente');
    const b = badge('alto');
    expect(b.className).toContain('priority-urgente');
    expect(b.className).not.toContain('status-neutral');
    expect(b.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Alto')).toBeTruthy();
  });

  it('un valor de laboratorio bajo es urgente', () => {
    expect(statusPriority('bajo')).toBe('urgente');
    expect(badge('bajo').className).toContain('priority-urgente');
  });

  it('crítico sigue siendo la única familia roja', () => {
    expect(statusFamily('critico_alto')).toBe('critico');
    expect(statusFamily('critico_bajo')).toBe('critico');
    expect(statusPriority('critico_alto')).toBeNull();
  });

  it('agotado y vencido se leen igual: urgente, en el badge y en inventario', () => {
    expect(statusPriority('agotado')).toBe('urgente');
    expect(statusPriority('vencido')).toBe('urgente');
    expect(statusFamily('agotado')).toBeNull();
    expect(statusFamily('vencido')).toBeNull();
  });

  it('sin rango queda neutro explícito', () => {
    expect(statusFamily('sin_rango')).toBeNull();
    expect(statusPriority('sin_rango')).toBeNull();
    expect(badge('sin_rango').className).toContain('status-neutral');
  });
});
