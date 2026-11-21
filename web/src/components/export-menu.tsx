import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';
import { auditExport, exportTable, type ExportFormat, type ExportTable } from '../lib/export';

const options: { format: ExportFormat; label: string; hint: string }[] = [
  { format: 'csv', label: 'CSV', hint: 'Para Excel y otras hojas de cálculo' },
  { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Hoja de cálculo con formato' },
  { format: 'pdf', label: 'PDF', hint: 'Documento listo para imprimir' },
];

/**
 * Menú «Exportar». `table` se evalúa al elegir el formato, así que siempre exporta lo que hay en pantalla;
 * si no hay filas el menú queda deshabilitado en lugar de generar un archivo vacío.
 */
export function ExportMenu({ table, label = 'Exportar', disabled = false, keepLabel = false }: { table: () => ExportTable; label?: string; disabled?: boolean; keepLabel?: boolean }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState<ExportFormat | null>(null), [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  async function run(format: ExportFormat) {
    setBusy(format); setError(null);
    const data = table();
    // MA-SEG-05: the export is recorded in the audit first; if that fails, no file leaves the system.
    try { await auditExport(format, data); }
    catch { setError('No se pudo registrar la exportación. Intenta de nuevo.'); setBusy(null); return; }
    try { await exportTable(format, data); setOpen(false); }
    catch { setError('No se pudo generar el archivo. Intenta de nuevo.'); }
    finally { setBusy(null); }
  }
  return <div className="export-menu" ref={root}>
    <button ref={trigger} type="button" className={`secondary-button export-trigger${keepLabel ? ' keep-label' : ''}`} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)}><Icon name="download" size={18} /><span className="export-label">{label}</span></button>
    {open && <div className="export-popover" role="menu" aria-label="Formato de exportación">
      {options.map(option => <button key={option.format} type="button" role="menuitem" disabled={busy !== null} onClick={() => void run(option.format)}><strong>{busy === option.format ? 'Generando…' : option.label}</strong><span>{option.hint}</span></button>)}
      {error && <p className="export-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
