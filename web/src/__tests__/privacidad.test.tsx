import { describe, expect, it } from 'vitest';
import { lowStockAlerts } from '../features/inventory';

describe('W22 · alertas de mínimo', () => {
  it('agrupa por artículo los lotes bajo el mínimo', () => {
    const row = { articulo_id: 'a-1', codigo: 'GAS-01', nombre: 'Gasa', tipo: 'insumo', unidad: 'unidad', minimo: 10, disponible: 9, vencido: 0, bajo_minimo: true };
    expect(lowStockAlerts([row, { ...row, lotId: 'l-2' }, { ...row, articulo_id: 'a-2', bajo_minimo: false }]).map(r => r.articulo_id)).toEqual(['a-1']);
  });
});
