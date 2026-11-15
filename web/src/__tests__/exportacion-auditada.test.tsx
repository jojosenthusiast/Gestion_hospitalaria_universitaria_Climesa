import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExportMenu } from '../components/export-menu';
import { registerExportAuditor } from '../lib/export';

// MA-SEG-05: the file is built in the browser, so the web records each export in the API audit before saving it.
const table = () => ({ filename: 'Pacientes Hoy', title: 'Pacientes', columns: ['Expediente'], rows: [['9900001-1'], ['9900002-2']] });

describe('exportación auditada (MA-SEG-05)', () => {
  afterEach(() => { cleanup(); registerExportAuditor(null); vi.restoreAllMocks(); });

  it('registra lista, filas y formato antes de descargar', async () => {
    const auditor = vi.fn(async () => undefined);
    registerExportAuditor(auditor);
    URL.createObjectURL = vi.fn(() => 'blob:x'); URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ExportMenu table={table} />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(auditor).toHaveBeenCalledWith({ resource: 'pacientes-hoy', rows: 2, format: 'csv' });
  });

  it('si la auditoría falla no descarga y lo dice en español', async () => {
    registerExportAuditor(async () => { throw new Error('Network down'); });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<ExportMenu table={table} />);
    fireEvent.click(screen.getByRole('button', { name: /Exportar/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /CSV/ }));
    expect((await screen.findByRole('alert')).textContent).toBe('No se pudo registrar la exportación. Intenta de nuevo.');
    expect(click).not.toHaveBeenCalled();
  });
});
