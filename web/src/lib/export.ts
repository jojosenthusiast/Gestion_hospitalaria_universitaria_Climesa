/**
 * Exportación de tablas: CSV (con BOM y «;» para que Excel en español lo abra por columnas), Excel real (.xlsx)
 * y PDF con la paleta de la aplicación. Las librerías de Excel y PDF se cargan solo al exportar, así que no pesan
 * en la carga inicial. Solo se exportan los agregados o listas que la persona ya tiene en pantalla.
 */
export type ExportCell = string | number | null | undefined;
export type ExportTable = {
  /** Nombre de archivo sin extensión. */
  filename: string;
  title: string;
  subtitle?: string;
  columns: string[];
  rows: ExportCell[][];
};
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export const BRAND = { primary: '#0043B2', ink: '#0E1B33', muted: '#55617A', soft: '#E6EEFB', band: '#F2F5F9' } as const;
const hex = (value: string): [number, number, number] => [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];

/** Nombre de archivo seguro con la fecha local: `metricas-2026-11-14`. */
export const exportName = (base: string, now = new Date()) => `${base.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'exportacion'}-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(now)}`;

const generatedAt = (now: Date) => new Intl.DateTimeFormat('es-SV', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/El_Salvador' }).format(now);
const display = (cell: ExportCell) => cell == null ? '' : String(cell);

function csvCell(cell: ExportCell): string {
  if (cell == null) return '';
  // Decimales con coma: es lo que Excel en español espera junto al separador «;».
  let text = typeof cell === 'number' ? (Number.isInteger(cell) ? String(cell) : String(cell).replace('.', ',')) : String(cell);
  // Una celda de texto que empieza como fórmula se neutraliza (CSV injection).
  if (typeof cell === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV con BOM UTF-8, separador «;» y saltos CRLF. */
export function toCsv(table: Pick<ExportTable, 'columns' | 'rows'>): string {
  const lines = [table.columns, ...table.rows].map(row => row.map(csvCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; link.rel = 'noopener';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadCsv = (table: ExportTable) => saveBlob(new Blob([toCsv(table)], { type: 'text/csv;charset=utf-8' }), `${table.filename}.csv`);

const sheetName = (title: string) => title.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Datos';

/** Excel real: encabezado azul CLIMESA, números como números y anchos de columna según el contenido. */
export async function downloadXlsx(table: ExportTable) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const head = table.columns.map(value => ({ value, fontWeight: 'bold' as const, textColor: '#FFFFFF', backgroundColor: BRAND.primary }));
  const body = table.rows.map(row => row.map(cell => cell == null || cell === '' ? null : typeof cell === 'number' ? cell : String(cell)));
  const widths = table.columns.map((name, i) => ({ width: Math.min(48, Math.max(10, name.length + 2, ...table.rows.map(row => display(row[i]).length + 2))) }));
  const blob = await writeXlsxFile([head, ...body], { sheet: sheetName(table.title), columns: widths }).toBlob();
  saveBlob(blob, `${table.filename}.xlsx`);
}

// Las fuentes estándar de PDF solo cubren Latin-1: se sustituyen los pocos símbolos que quedan fuera.
const pdfSafe = (text: string) => text.replace(/[…]/g, '...').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/[\u0100-\uFFFF]/g, '');

/** Arma el PDF (sin descargarlo): banda azul con el logotipo y el nombre en cada página, fecha de generación y «Página X de Y». */
export async function buildPdf(table: ExportTable, now = new Date()) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: table.columns.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 36, bandHeight = 54;
  const drawBand = () => {
    doc.setFillColor(...hex(BRAND.primary)); doc.rect(0, 0, width, bandHeight, 'F');
    doc.setFillColor(255, 255, 255); doc.rect(margin + 8, 15, 8, 24, 'F'); doc.rect(margin, 23, 24, 8, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('climesa', margin + 34, 30);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text('Hospital universitario', margin + 34, 43);
    doc.setFontSize(8.5); doc.text(pdfSafe(generatedAt(now)), width - margin, 30, { align: 'right' }); doc.text('Generado en CLIMESA', width - margin, 43, { align: 'right' });
  };
  drawBand();
  doc.setTextColor(...hex(BRAND.ink)); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(pdfSafe(table.title), margin, bandHeight + 34);
  let y = bandHeight + 34;
  if (table.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...hex(BRAND.muted)); const lines = doc.splitTextToSize(pdfSafe(table.subtitle), width - margin * 2) as string[]; doc.text(lines, margin, y + 16); y += 16 * lines.length; }
  autoTable(doc, {
    startY: y + 16, margin: { top: bandHeight + 22, left: margin, right: margin, bottom: 40 }, theme: 'grid',
    head: [table.columns.map(pdfSafe)], body: table.rows.map(row => row.map(cell => pdfSafe(display(cell)))),
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 5, textColor: hex(BRAND.ink), lineColor: [211, 219, 230], lineWidth: 0.4 },
    headStyles: { fillColor: hex(BRAND.primary), textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: hex(BRAND.band) },
    didDrawPage: data => { if (data.pageNumber > 1) drawBand(); },
  });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...hex(BRAND.muted));
    doc.text('CLIMESA - Hospital universitario. Información visible para tu cuenta.', margin, height - 20);
    doc.text(`Página ${page} de ${pages}`, width - margin, height - 20, { align: 'right' });
  }
  return doc;
}

export async function downloadPdf(table: ExportTable) {
  const doc = await buildPdf(table);
  saveBlob(doc.output('blob'), `${table.filename}.pdf`);
}

export async function exportTable(format: ExportFormat, table: ExportTable) {
  if (format === 'csv') return downloadCsv(table);
  if (format === 'xlsx') return downloadXlsx(table);
  return downloadPdf(table);
}
