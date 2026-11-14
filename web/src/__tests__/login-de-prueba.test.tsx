import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { LoginView } from '../components/ui';
import { demoAccountsFrom, parseDemoCredentials, type DemoAccount } from '../lib/demoLogin';

afterEach(cleanup);

// Placeholder accounts only (the real ones live in the git-ignored demo-credenciales.json).
const raw = JSON.stringify([
  { rol: 'ADM', correo: 'adm@example.test', contrasena: 'Placeholder-ADM-1' },
  { rol: 'REC', correo: 'rec@example.test', contrasena: 'Placeholder-REC-1' },
]);

function Harness({ demoAccounts }: { demoAccounts?: DemoAccount[] }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  return <LoginView {...{ email, password, setEmail, setPassword, demoAccounts }} busy={false} error={null} accepted={false} onSubmit={e => e.preventDefault()} />;
}

describe('login de prueba (temporal)', () => {
  it('con la bandera apagada no hay cuentas aunque existan credenciales', () => {
    expect(demoAccountsFrom('false', raw)).toEqual([]);
    expect(demoAccountsFrom(undefined, raw)).toEqual([]);
    expect(demoAccountsFrom('true', raw)).toHaveLength(2);
  });

  it('descarta entradas mal formadas y JSON inválido', () => {
    expect(parseDemoCredentials('no es json')).toEqual([]);
    expect(parseDemoCredentials(undefined)).toEqual([]);
    expect(parseDemoCredentials(JSON.stringify([{ rol: 'ADM' }, { rol: 'LAB', correo: 'lab@example.test', contrasena: 'x' }]))).toEqual([{ rol: 'LAB', correo: 'lab@example.test', contrasena: 'x' }]);
  });

  it('sin cuentas no muestra el selector ni el aviso', () => {
    render(<Harness demoAccounts={demoAccountsFrom('false', raw)} />);
    expect(screen.queryByLabelText('Cuenta de prueba')).toBeNull();
    expect(screen.queryByText('Modo de prueba: cuentas ficticias')).toBeNull();
  });

  it('elegir un rol llena el correo y la contraseña; el usuario todavía pulsa Iniciar sesión', async () => {
    render(<Harness demoAccounts={demoAccountsFrom('true', raw)} />);
    expect(screen.getByText('Modo de prueba: cuentas ficticias')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Cuenta de prueba'), 'REC');
    expect((screen.getByLabelText(/^Correo electrónico/) as HTMLInputElement).value).toBe('rec@example.test');
    expect((screen.getByLabelText(/^Contraseña/) as HTMLInputElement).value).toBe('Placeholder-REC-1');
  });
});
