import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { areaOf, AreaTag, CompactHeader, PriorityBadge, StatusBadge, StatusLegend, AREAS, STATUS_FAMILIES, Skeleton } from '../components/system';

// Fase 2, S1 y S7: encabezado compacto y color con significado (nunca solo color).
afterEach(cleanup);

describe('CompactHeader (S1)', () => {
  it('muestra un h1 accesible, la ruta y la acción principal, sin descripción', () => {
    render(<CompactHeader breadcrumb="Atención / Fila" title="Fila del día" actions={<button>Emitir número</button>} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Fila del día' });
    const header = heading.closest('header')!;
    expect(header.className).toContain('compact-header');
    expect(within(header).getByText('Atención / Fila')).toBeTruthy();
    expect(within(header).getByRole('button', { name: 'Emitir número' })).toBeTruthy();
    expect(header.querySelector('p')).toBeNull();
  });

  it('acepta filtros junto al título', () => {
    render(<CompactHeader title="Pacientes" filters={<label>Buscar<input /></label>} />);
    expect(screen.getByRole('textbox', { name: 'Buscar' })).toBeTruthy();
  });
});

describe('StatusBadge (S7)', () => {
  it('lleva ícono, texto y patrón: no depende solo del color', () => {
    render(<StatusBadge value="en_espera" />);
    const badge = screen.getByText('En espera').closest('.status-badge')!;
    expect(badge.querySelector('svg')).toBeTruthy();
    expect(badge.className).toMatch(/pattern-rayado/);
  });

  it('cada familia de estado tiene un patrón y un ícono distintos', () => {
    const patterns = new Set(STATUS_FAMILIES.map(f => f.pattern));
    const icons = new Set(STATUS_FAMILIES.map(f => f.icon));
    expect(patterns.size).toBe(STATUS_FAMILIES.length);
    expect(icons.size).toBe(STATUS_FAMILIES.length);
  });

  it('en atención es sólido y distinto de en espera', () => {
    render(<><StatusBadge value="en_atencion" /><StatusBadge value="en_espera" /></>);
    expect(screen.getByText('En atención').closest('.status-badge')!.className).toMatch(/pattern-solido/);
  });
});

describe('PriorityBadge y AreaTag (S7)', () => {
  it('la prioridad emergencia usa el acento crítico con ícono y texto', () => {
    render(<PriorityBadge value="emergencia" />);
    const badge = screen.getByText('Emergencia').closest('.priority-badge')!;
    expect(badge.className).toContain('priority-emergencia');
    expect(badge.querySelector('svg')).toBeTruthy();
  });

  it('el área muestra su código y su nombre accesible; ninguna área usa el rojo crítico', () => {
    render(<AreaTag code="EMG" />);
    expect(screen.getByText('EMG')).toBeTruthy();
    expect(screen.getByLabelText('Área Emergencia')).toBeTruthy();
    expect(AREAS.length).toBeGreaterThanOrEqual(6);
    expect(AREAS.length).toBeLessThanOrEqual(8);
    expect(AREAS.every(a => a.token !== 'critical')).toBe(true);
  });

  it('la leyenda usa las mismas clases de patrón y área que las insignias', () => {
    const { container } = render(<StatusLegend />);
    for (const family of STATUS_FAMILIES) expect(container.querySelector(`.status-badge.pattern-${family.pattern}`)).toBeTruthy();
    for (const area of AREAS) expect(container.querySelector(`.area-tag.area-${area.code.toLowerCase()}`)).toBeTruthy();
  });
});

describe('Skeleton (S3)', () => {
  it('anuncia la carga sin spinner y reserva la altura pedida', () => {
    render(<Skeleton rows={4} label="Cargando camas" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(within(status).getByText('Cargando camas')).toBeTruthy();
    expect(status.querySelectorAll('.skeleton-line').length).toBe(4);
    expect(status.querySelector('.spinner, .status-spinner')).toBeNull();
  });
});

describe('área de un código de espacio (02-sistema §1)', () => {
  it('un código de área real gana al alias: BOD-LAB es LAB, BOD-CEN es GEN', () => {
    expect(areaOf('BOD-LAB')).toBe('LAB');
    expect(areaOf('BOD-CEN')).toBe('GEN');
    expect(areaOf('P3-VIP')).toBe('HOS');
    expect(areaOf('P1-EMG')).toBe('EMG');
    expect(areaOf('C-101')).toBe('CON');
  });

  it('el número de fila atendido es de la familia "listo", como en Android e iOS', () => {
    render(<StatusBadge value="atendido" />);
    expect(screen.getByText('Atendido')).toBeTruthy();
    expect(document.querySelector('.fam-listo')).toBeTruthy();
    expect(areaOf(null)).toBe('GEN');
  });
});
