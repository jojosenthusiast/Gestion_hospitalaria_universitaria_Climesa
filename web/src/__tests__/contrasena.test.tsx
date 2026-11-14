import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivationView, LoginView } from '../components/ui';
import { ChangePasswordForm, PasswordRecoveryView } from '../features/password';

// WEB-13: W01 «recuperar contraseña» y W35 «cambiar contraseña».
afterEach(cleanup);

describe('recuperar contraseña (W01)', () => {
  it('el ingreso ofrece el enlace de recuperación', () => {
    render(<LoginView email="" password="" setEmail={() => undefined} setPassword={() => undefined} busy={false} error={null} accepted={false} onSubmit={() => undefined} />);
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).getAttribute('href')).toBe('/recuperar');
  });

  it('pide el enlace y responde lo mismo exista o no la cuenta', async () => {
    const onRequest = vi.fn().mockRejectedValueOnce(new Error('cuenta inexistente'));
    render(<PasswordRecoveryView onRequest={onRequest} />);
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'persona@example.test');
    await userEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    expect(onRequest).toHaveBeenCalledWith('persona@example.test');
    expect(await screen.findByText(/Si el correo pertenece a una cuenta de CLIMESA/)).toBeTruthy();
  });

  it('valida el correo en español antes de pedir el enlace', async () => {
    const onRequest = vi.fn();
    render(<PasswordRecoveryView onRequest={onRequest} />);
    await userEvent.type(screen.getByLabelText(/Correo electrónico/), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: /Enviar enlace/ }));
    expect(onRequest).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Correo electrónico/).getAttribute('aria-invalid')).toBe('true');
  });

  it('el enlace del correo abre el formulario de nueva contraseña, no el de invitación', () => {
    render(<ActivationView mode="reset" ready email="persona@example.test" password="" confirmation="" setPassword={() => undefined} setConfirmation={() => undefined} busy={false} error={null} onSubmit={() => undefined} />);
    expect(screen.getByRole('heading', { name: 'Crea una nueva contraseña.' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Guardar contraseña/ })).toBeTruthy();
  });
});

describe('cambiar contraseña desde Perfil (W35)', () => {
  const llenar = async (actual: string, nueva: string, confirmacion: string) => {
    if (actual) await userEvent.type(screen.getByLabelText('Contraseña actual'), actual);
    if (nueva) await userEvent.type(screen.getByLabelText('Nueva contraseña'), nueva);
    if (confirmacion) await userEvent.type(screen.getByLabelText('Confirmar nueva contraseña'), confirmacion);
    await userEvent.click(screen.getByRole('button', { name: /Cambiar contraseña/ }));
  };

  it('exige una contraseña segura y que coincida, marcando el campo', async () => {
    const onChange = vi.fn();
    render(<ChangePasswordForm onChange={onChange} />);
    await llenar('Actual#2026', 'corta', 'corta');
    expect(screen.getByLabelText('Nueva contraseña').getAttribute('aria-invalid')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cambia la contraseña y confirma el resultado', async () => {
    const onChange = vi.fn(async () => null);
    render(<ChangePasswordForm onChange={onChange} />);
    await llenar('Actual#2026', 'Nueva#2026x', 'Nueva#2026x');
    expect(onChange).toHaveBeenCalledWith('Actual#2026', 'Nueva#2026x');
    expect(await screen.findByText(/Tu contraseña se cambió/)).toBeTruthy();
  });

  it('muestra el error cuando la contraseña actual no es correcta', async () => {
    render(<ChangePasswordForm onChange={async () => 'La contraseña actual no es correcta.'} />);
    await llenar('Equivocada#1', 'Nueva#2026x', 'Nueva#2026x');
    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy();
  });
});
