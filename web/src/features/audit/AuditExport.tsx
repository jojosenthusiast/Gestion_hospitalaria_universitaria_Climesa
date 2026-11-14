import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/ui';
import { exportTable, type ExportFormat } from '../../lib/export';
import type { Api } from '../../lib/api';
import { exportTableOf, type AuditPageData, type AuditRowData } from './query';

const options: { format: ExportFormat; label: string; hint: string }[] = [
  { format: 'csv', label: 'CSV', hint: 'Para Excel y otras hojas de cálculo' },
  { format: 'xlsx', label: 'Excel (.xlsx)', hint: 'Hoja de cálculo con formato' },
  { format: 'pdf', label: 'PDF', hint: 'Documento listo para imprimir' },
];
const BATCH = 500, MAX_ROWS = 5000;

/**
 * Exporta TODAS las filas del filtro actual (no solo la página en pantalla), de 500 en 500 hasta 5 000.
 * Cada petición lleva `exportar=true`, así que la auditoría registra la exportación como tal.
 */
export function AuditExport({ api, queryFor, total, subtitle }: { api: Api; queryFor: (page: number, size: number) => string; total: number; subtitle: string }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState<ExportFormat | null>(null), [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key); };
  }, [open]);
  async function run(format: ExportFormat) {
    setBusy(format); setError(null);
    try {
      const rows: AuditRowData[] = [];
      for (let page = 1; rows.length < Math.min(total, MAX_ROWS); page++) {
        const part = await api.request<AuditPageData>(`/auditoria/registros${queryFor(page, BATCH)}`);
        rows.push(...part.filas);
        if (part.filas.length < BATCH) break;
      }
      const note = total > MAX_ROWS ? `${subtitle} · primeras ${MAX_ROWS} de ${total} filas` : subtitle;
      await exportTable(format, exportTableOf(rows.slice(0, MAX_ROWS), note));
      setOpen(false);
    } catch { setError('No se pudo generar el archivo. Intenta de nuevo.'); }
    finally { setBusy(null); }
  }
  return <div className="export-menu" ref={root}>
    <button type="button" className="secondary-button export-trigger" aria-haspopup="menu" aria-expanded={open} disabled={total === 0} onClick={() => setOpen(v => !v)}><Icon name="download" size={18} />Exportar {total ? `(${Math.min(total, MAX_ROWS)})` : ''}</button>
    {open && <div className="export-popover" role="menu" aria-label="Formato de exportación">
      {options.map(o => <button key={o.format} type="button" role="menuitem" disabled={busy !== null} onClick={() => void run(o.format)}><strong>{busy === o.format ? 'Generando…' : o.label}</strong><span>{o.hint}</span></button>)}
      {error && <p className="export-error" role="alert">{error}</p>}
    </div>}
  </div>;
}
