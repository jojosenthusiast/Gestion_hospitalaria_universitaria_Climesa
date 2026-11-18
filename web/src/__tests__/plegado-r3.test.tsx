import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { useFold } from '../components/fold';
import { AttentionList } from '../features/dashboards/parts';

afterEach(cleanup);

// R3: long lists show what matters first and fold the rest behind «Ver N más».
function Folded({ items }: { items: string[] }) {
  const fold = useFold(items, 3);
  return <><ul>{fold.shown.map(item => <li key={item}>{item}</li>)}</ul>{fold.more}</>;
}

describe('R3 · listas plegadas', () => {
  it('useFold muestra los primeros y despliega el resto en su lugar', async () => {
    render(<Folded items={['a', 'b', 'c', 'd', 'e']} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Ver 2 más' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /Ver \d+ más/ })).toBeNull();
  });

  it('useFold no pinta el botón cuando todo cabe', () => {
    render(<Folded items={['a', 'b', 'c']} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('un panel de Inicio con más filas que su límite enlaza «Ver N más» a la pantalla completa', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `t-${i}`, title: `Paciente ${i}`, tone: 'info' as const, href: '#/fila', action: 'Llamar' }));
    render(<AttentionList items={items} moreHref="#/fila" />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Ver 2 más' }).getAttribute('href')).toBe('#/fila');
  });
});
