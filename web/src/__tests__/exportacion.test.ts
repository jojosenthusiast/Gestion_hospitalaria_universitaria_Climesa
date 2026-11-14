import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPdf, exportName, toCsv, downloadXlsx } from '../lib/export';

const writer = vi.hoisted(() => vi.fn());
vi.mock('write-excel-file/browser', () => ({ default: writer }));
afterEach(() => { vi.restoreAllMocks(); writer.mockReset(); });

describe('exportación', () => {
  it('CSV: BOM, separador «;», decimales con coma, comillas y fórmulas neutralizadas', () => {
    const csv = toCsv({ columns: ['Nombre', 'Valor'], rows: [['María; "la" doctora', 12.5], ['=SUMA(A1)', 3], [null, 0]] });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')).toEqual(['\uFEFFNombre;Valor', '"María; ""la"" doctora";12,5', "'=SUMA(A1);3", ';0', '']);
  });

  it('el nombre de archivo es seguro y lleva la fecha local', () => {
    expect(exportName('Métricas del Hospital', new Date('2026-11-14T18:00:00Z'))).toBe('metricas-del-hospital-2026-11-14');
  });

  it('Excel: encabezado azul CLIMESA, números como números y hoja con nombre válido', async () => {
    const toBlob = vi.fn(async () => new Blob(['x']));
    writer.mockReturnValue({ toBlob });
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    await downloadXlsx({ filename: 'm', title: 'Ocupación: día/noche', columns: ['Fecha', 'Valor'], rows: [['2026-11-14', 70], ['2026-11-15', null]] });
    const [data, options] = writer.mock.calls[0];
    expect(data[0][0]).toMatchObject({ value: 'Fecha', backgroundColor: '#0043B2', fontWeight: 'bold' });
    expect(data[1]).toEqual(['2026-11-14', 70]);
    expect(data[2]).toEqual(['2026-11-15', null]);
    expect(options.sheet).toBe('Ocupación  día noche');
    expect(toBlob).toHaveBeenCalled();
  });

  it('PDF: genera páginas con encabezado de marca y número de página', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => [`Fila ${i}`, i, 'Ocupación 70 % — ok']);
    const doc = await buildPdf({ filename: 'p', title: 'Métricas del hospital', subtitle: 'Del 2026-11-08 al 2026-11-14', columns: ['Nombre', 'Valor', 'Nota'], rows }, new Date('2026-11-14T18:00:00Z'));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const text = doc.output();
    expect(text).toContain('climesa');
    expect(text).toContain('Métricas del hospital'.replace('é', '\xE9'));
    expect(text).toContain(`de ${doc.getNumberOfPages()}`);
  });
});
