import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessProfile, Api } from '../lib/api';
import { LoginView } from '../components/ui';
import { Dialog, Select, Tag } from '../features/common';
import { HospitalShell } from '../features/shell';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => { cleanup(); location.hash = ''; });

describe('ingreso con validación en español (W-11)', () => {
  function mount(email = '', password = '') {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(<LoginView email={email} password={password} setEmail={() => undefined} setPassword={() => undefined} busy={false} error={null} accepted={false} onSubmit={onSubmit} />);
    return onSubmit;
  }

  it('con campos vacíos muestra mensajes propios en español y no envía', async () => {
    const onSubmit = mount();
    expect(document.querySelector('form')?.noValidate).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Escribe tu correo electrónico.')).toBeTruthy();
    expect(screen.getByText('Escribe tu contraseña.')).toBeTruthy();
    expect(screen.getByLabelText(/^Correo electrónico/).getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('con un correo mal escrito lo dice', async () => {
    const onSubmit = mount('correo-sin-arroba', 'Secreta1!');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Escribe un correo electrónico válido, por ejemplo nombre@correo.com.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('con datos completos envía', async () => {
    const onSubmit = mount('rec@example.test', 'Secreta1!');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
