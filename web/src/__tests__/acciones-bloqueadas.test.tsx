import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionButton } from '../components/system';

// Fase 2, R1 (S4): the server's allowedActions/blockedActions decide; a blocked reason is never body text.
afterEach(cleanup);

const blocked = [{ action: 'cancelar', reason: 'La consulta ya empezó.' }];

describe('ActionButton (R1, WC-6 a WC-8)', () => {
  it('una acción permitida es un botón que actúa', async () => {
    const onClick = vi.fn();
    render(<ActionButton action="cancelar" allowed={['cancelar']} blocked={[]} onClick={onClick}>Cancelar</ActionButton>);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('una acción bloqueada no se dibuja y su motivo no aparece como texto', () => {
    render(<ActionButton action="cancelar" allowed={[]} blocked={blocked} onClick={vi.fn()}>Cancelar</ActionButton>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/La consulta ya empezó/)).toBeNull();
  });

  it('una acción que no está ni permitida ni bloqueada no se dibuja', () => {
    render(<ActionButton action="cancelar" allowed={['confirmar']} showBlocked onClick={vi.fn()}>Cancelar</ActionButton>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('cuando sirve verla, queda desactivada, enfocable, con el motivo en una descripción accesible', async () => {
    const onClick = vi.fn();
    render(<ActionButton action="cancelar" allowed={[]} blocked={blocked} showBlocked onClick={onClick}>Cancelar</ActionButton>);
    const button = screen.getByRole('button', { name: 'Cancelar' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    const tip = document.getElementById(button.getAttribute('aria-describedby')!)!;
    expect(tip.textContent).toBe('La consulta ya empezó.');
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.closest('p, small, .form-hint')).toBeNull();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
