import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { statusFilterLook } from '../components/system';
import { Segmented } from '../components/segmented';
import { ChipGroup } from '../features/listas/chips';

// R4a (owner): a filter for a status wears the same family colour, texture and icon as the badge it filters.
afterEach(cleanup);

describe('filtros con el aspecto de su estado', () => {
  it('«Sin leer» toma la familia de espera con su rayado y «Críticos» el rojo de emergencia; «Todos» queda neutro', () => {
    render(<Segmented label="Filtrar avisos" value="todos" onChange={() => undefined}
      options={[{ value: 'todos', label: 'Todos' }, { value: 'sin-leer', label: 'Sin leer', count: 3, status: 'pendiente' }, { value: 'criticos', label: 'Críticos', status: 'emergencia' }]} />);
    const unread = screen.getByRole('button', { name: /Sin leer/ });
    expect(unread.className).toContain('status-filter sf-fam-espera sf-pattern-rayado');
    expect(unread.textContent).toContain('Sin leer');
    expect(unread.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Críticos/ }).className).toContain('status-filter sf-prio-emergencia');
    expect(screen.getByRole('button', { name: 'Todos' }).className).not.toContain('status-filter');
  });

  it('los chips de laboratorio usan la misma familia que su insignia', () => {
    render(<ChipGroup label="Valores críticos" value="si" onChange={() => undefined}
      options={[{ value: 'no', label: 'Todos los valores' }, { value: 'si', label: 'Con valores críticos', status: 'critico_alto' }]} />);
    const critical = screen.getByRole('button', { name: /Con valores críticos/ });
    expect(critical.className).toContain('status-filter sf-fam-critico sf-pattern-doble');
    expect(critical.getAttribute('aria-pressed')).toBe('true');
  });

  it('sin estado conocido o en rutina no hay aspecto de estado', () => {
    expect(statusFilterLook(undefined)).toBeNull();
    expect(statusFilterLook('proximas')).toBeNull();
    expect(statusFilterLook('rutina')).toBeNull();
    expect(statusFilterLook('urgente')?.className).toBe('status-filter sf-prio-urgente');
    expect(statusFilterLook('completado')?.className).toBe('status-filter sf-fam-listo sf-pattern-contorno');
  });
});
