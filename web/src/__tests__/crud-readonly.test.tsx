import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CrudButton, ReadOnlyBadge } from '../components/system';

// Owner batch 1 (S0): one color and one symbol per CRUD verb, and a read-only cue that says who can change the data.
describe('CrudButton and ReadOnlyBadge', () => {
  it('gives each verb its own class, and the icon-only form keeps the label as name and tooltip', () => {
    render(<><CrudButton kind="create" label="Nuevo artículo" /><CrudButton kind="edit" label="Editar a Ana" iconOnly /><CrudButton kind="deactivate" label="Desactivar" /></>);
    expect(screen.getByRole('button', { name: 'Nuevo artículo' }).className).toContain('crud-create');
    const edit = screen.getByRole('button', { name: 'Editar a Ana' });
    expect(edit.className).toContain('crud-edit');
    expect(edit.className).toContain('crud-icon');
    expect(edit.getAttribute('title')).toBe('Editar a Ana');
    expect(screen.getByRole('button', { name: 'Desactivar' }).className).toContain('crud-deactivate');
  });

  it('says who can change read-only data', () => {
    render(<ReadOnlyBadge who="Recepción" what="el registro de pacientes" />);
    expect(screen.getByText('Solo lectura')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toBe('Puedes consultar el registro de pacientes. Para hacer cambios, contacta a Recepción.');
  });
});
