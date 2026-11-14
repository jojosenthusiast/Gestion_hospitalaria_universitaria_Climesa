import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BarChart, Donut, Gauge, HBarList, LineChart, StackedBar } from '../components/charts';

afterEach(cleanup);

describe('gráficos SVG accesibles', () => {
  it('las barras tienen título, imagen con nombre y tabla de datos equivalente', () => {
    render(<BarChart title="Citas por día" unit="citas" data={[{ label: '14/11', value: 3 }, { label: '15/11', value: null }]} />);
    expect(screen.getByRole('img', { name: 'Citas por día' })).toBeTruthy();
    const tabla = screen.getByRole('table', { name: /Citas por día/ });
    expect(within(tabla).getByText('3 citas')).toBeTruthy();
    expect(within(tabla).getByText('Sin datos')).toBeTruthy();
  });

  it('con `details` la tabla queda visible bajo «Ver datos»', () => {
    render(<LineChart title="Ocupación" unit="%" table="details" data={[{ label: 'a', value: 50 }, { label: 'b', value: 70 }]} />);
    expect(screen.getByText('Ver datos')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('sin datos muestra un mensaje en vez de un gráfico vacío', () => {
    render(<><BarChart title="x" data={[]} empty="Nada que mostrar." /><LineChart title="y" data={[{ label: 'a', value: null }]} empty="Sin serie." /><Donut title="z" segments={[{ label: 'a', value: 0, tone: 'ok' }]} empty="Sin partes." /></>);
    expect(screen.getByText('Nada que mostrar.')).toBeTruthy();
    expect(screen.getByText('Sin serie.')).toBeTruthy();
    expect(screen.getByText('Sin partes.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('la dona, la barra apilada y la barra horizontal muestran etiqueta y número de cada parte', () => {
    render(<>
      <Donut title="Cuentas" segments={[{ label: 'Activas', value: 8, tone: 'ok' }, { label: 'Desactivadas', value: 2, tone: 'slate' }]} />
      <StackedBar title="Camas" segments={[{ label: 'Libres', value: 5, tone: 'ok' }, { label: 'Ocupadas', value: 3, tone: 'ink' }]} />
      <HBarList title="Fila" data={[{ label: 'En espera', value: 4, tone: 'warn' }]} />
    </>);
    expect(screen.getByRole('img', { name: /Cuentas: Activas 8, Desactivadas 2/ })).toBeTruthy();
    expect(screen.getByRole('img', { name: /Camas: Libres 5, Ocupadas 3/ })).toBeTruthy();
    expect(screen.getByRole('table', { name: /Fila/ })).toBeTruthy();
  });

  it('el indicador semicircular dice su valor', () => {
    render(<Gauge title="Ocupación" value={72} tone="warn" caption="5 de 17 libres" />);
    expect(screen.getByRole('img', { name: 'Ocupación: 72 %' })).toBeTruthy();
    expect(screen.getByText('5 de 17 libres')).toBeTruthy();
  });
});
