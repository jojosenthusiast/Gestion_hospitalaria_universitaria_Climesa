import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchPicker, foldText, type PickerItem } from '../components/search-picker';

afterEach(() => { cleanup(); history.replaceState(null, '', '#/'); });

function Harness({ search, items }: { search?: (q: string, o: number) => Promise<{ items: PickerItem[]; hasMore?: boolean }>; items?: PickerItem[] }) {
  const [value, setValue] = useState<PickerItem | null>(null);
  return <><SearchPicker label="Paciente" value={value} onChange={setValue} search={search} items={items} debounceMs={5} /><output data-testid="elegido">{value?.id ?? ''}</output></>;
}

describe('SearchPicker', () => {
  it('compara sin tildes ni mayúsculas', () => { expect(foldText('María ÁNGEL')).toBe('maria angel'); });

  it('espera al menos dos letras, busca con espera entre teclas y elige con el teclado', async () => {
    const search = vi.fn(async () => ({ items: [{ id: 'a', label: 'María Alejandra' }, { id: 'b', label: 'María Valeria' }] }));
    render(<Harness search={search} />);
    const box = screen.getByRole('combobox', { name: 'Paciente' });
    await userEvent.type(box, 'm');
    expect(search).not.toHaveBeenCalled();
    await userEvent.type(box, 'a');
    await screen.findByRole('option', { name: /María Alejandra/ });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('ma', 0);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByTestId('elegido').textContent).toBe('b');
  });

  it('muestra los elementos no disponibles apagados con su motivo y no los deja elegir', async () => {
    render(<Harness items={[{ id: 'd1', label: 'Dra. Sin Turno', disabled: true, reason: 'Sin turno' }, { id: 'd2', label: 'Dr. Con Turno' }]} />);
    await userEvent.click(screen.getByRole('combobox', { name: 'Paciente' }));
    const off = screen.getByRole('option', { name: /Dra\. Sin Turno/ });
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.textContent).toContain('Sin turno');
    await userEvent.click(off);
    expect(screen.getByTestId('elegido').textContent).toBe('');
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('elegido').textContent).toBe('d2');
  });

  it('filtra la lista local sin tildes y pagina con "Mostrar más"', async () => {
    const pages = [{ items: [{ id: '1', label: 'Uno' }], hasMore: true }, { items: [{ id: '2', label: 'Dos' }], hasMore: false }];
    const search = vi.fn(async (_q: string, offset: number) => pages[offset === 0 ? 0 : 1]);
    render(<Harness search={search} />);
    await userEvent.type(screen.getByRole('combobox'), 'un');
    await userEvent.click(await screen.findByRole('button', { name: /Mostrar más/ }));
    await waitFor(() => expect(screen.getByRole('option', { name: /Dos/ })).toBeTruthy());
    expect(search).toHaveBeenLastCalledWith('un', 1);
  });
});
