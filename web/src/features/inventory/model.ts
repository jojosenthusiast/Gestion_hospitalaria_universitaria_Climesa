import type { IconName } from '../../components/ui';
import { foldText } from '../../components/search-picker';
import type { ExportTable } from '../../lib/export';

export type ArticleType = 'insumo' | 'reactivo' | 'equipo_menor';
export type StockStatus = 'ok' | 'bajo_minimo' | 'agotado' | 'por_vencer' | 'inactivo';
export type MovementType = 'entrada' | 'consumo' | 'traslado' | 'ajuste' | 'merma' | 'salida';

export type ArticleSummary = {
  id: string; code: string; name: string; type: ArticleType; unit: string; minimum: number; active: boolean; version: number;
  available: number; expired: number; expiringSoon: number; nextExpiry: string | null; lots: number; status: StockStatus;
};
export type LotStock = { warehouseId: string; warehouseCode: string; warehouseName: string; quantity: number };
export type Lot = { id: string; number: string; expiresAt: string | null; active: boolean; version: number; expired: boolean; total: number; warehouses: LotStock[] };
export type ArticleMovement = { id: string; type: MovementType; lotNumber: string; quantity: number; reason: string; originWarehouseCode: string | null; destinationWarehouseCode: string | null; authorName: string; registeredAt: string };
export type ArticleDetail = ArticleSummary & { lotList: Lot[]; warehouses: LotStock[]; movements: ArticleMovement[] };
export type Warehouse = { id: string; code: string; name: string };
export type AvailableLot = { id: string; number: string; expiresAt: string | null; expired: boolean; quantity: number; fefo: boolean };

/** Cada categoría tiene icono y color propios, los mismos en la lista, el detalle y el flujo de movimientos. */
export const categories: Record<ArticleType, { label: string; plural: string; icon: IconName }> = {
  insumo: { label: 'Insumo', plural: 'Insumos', icon: 'inventory' },
  reactivo: { label: 'Reactivo', plural: 'Reactivos', icon: 'lab' },
  equipo_menor: { label: 'Equipo menor', plural: 'Equipo menor', icon: 'steth' },
};
export const statusLabels: Record<StockStatus, string> = { ok: 'En orden', bajo_minimo: 'Bajo mínimo', agotado: 'Agotado', por_vencer: 'Por vencer', inactivo: 'Inactivo' };
export const statusOrder: StockStatus[] = ['agotado', 'bajo_minimo', 'por_vencer', 'ok', 'inactivo'];

export const movementLabels: Record<MovementType, { label: string; help: string }> = {
  entrada: { label: 'Entrada', help: 'Llega mercadería a una bodega, con lote y vencimiento.' },
  consumo: { label: 'Consumo', help: 'Se usa en la atención; puede ligarse a un paciente.' },
  traslado: { label: 'Traslado', help: 'Se mueve de una bodega a otra.' },
  ajuste: { label: 'Ajuste', help: 'Corrige un conteo físico: suma un sobrante o resta un faltante.' },
  merma: { label: 'Merma', help: 'Se da de baja por pérdida, daño o vencimiento.' },
  salida: { label: 'Salida', help: 'Sale de la bodega hacia un servicio.' },
};
/** Tipos que la persona puede elegir; «salida» sigue existiendo en el historial pero el flujo guiado usa consumo o merma. */
export const guidedTypes: MovementType[] = ['entrada', 'consumo', 'traslado', 'ajuste', 'merma'];
/** Lo que cada rol puede hacer lo decide la API; aquí solo se ofrece lo que el contexto del permiso permite. */
export const typesFor = (canMoveAll: boolean): MovementType[] => canMoveAll ? guidedTypes : ['consumo'];

/** Campos que pide cada tipo: el formulario muestra solo estos. */
export const fieldsFor = (type: MovementType) => ({
  origin: ['consumo', 'merma', 'traslado', 'ajuste', 'salida'].includes(type),
  destination: ['entrada', 'traslado'].includes(type),
  patient: type === 'consumo',
  newLot: type === 'entrada',
  existingLot: type !== 'entrada',
});

export type Filters = { query: string; types: ArticleType[]; statuses: StockStatus[]; onlyLow: boolean };
export const emptyFilters: Filters = { query: '', types: [], statuses: [], onlyLow: false };
export const activeFilterCount = (f: Filters) => f.types.length + f.statuses.length + (f.onlyLow ? 1 : 0) + (f.query.trim() ? 1 : 0);

export type SortKey = 'nombre' | 'estado' | 'existencia' | 'vencimiento';
export const sortLabels: Record<SortKey, string> = { nombre: 'Nombre', estado: 'Urgencia', existencia: 'Existencia (menor primero)', vencimiento: 'Vencimiento próximo' };

export function filterArticles(rows: ArticleSummary[], f: Filters): ArticleSummary[] {
  const q = foldText(f.query.trim());
  return rows.filter(a =>
    (!q || foldText(`${a.code} ${a.name} ${categories[a.type].label}`).includes(q)) &&
    (!f.types.length || f.types.includes(a.type)) &&
    (!f.statuses.length || f.statuses.includes(a.status)) &&
    (!f.onlyLow || a.status === 'bajo_minimo' || a.status === 'agotado'));
}
export function sortArticles(rows: ArticleSummary[], key: SortKey): ArticleSummary[] {
  const by: Record<SortKey, (a: ArticleSummary, b: ArticleSummary) => number> = {
    nombre: (a, b) => a.name.localeCompare(b.name, 'es'),
    estado: (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status) || a.name.localeCompare(b.name, 'es'),
    existencia: (a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name, 'es'),
    vencimiento: (a, b) => (a.nextExpiry ?? '9999').localeCompare(b.nextExpiry ?? '9999') || a.name.localeCompare(b.name, 'es'),
  };
  return [...rows].sort(by[key]);
}
/** Existencia frente al mínimo: 1 = justo en el mínimo; sin mínimo se ordena por cantidad. */
export const ratio = (a: Pick<ArticleSummary, 'available' | 'minimum'>) => a.minimum > 0 ? a.available / a.minimum : a.available;
/** Ancho del medidor (0-100): el 100 % es el doble del mínimo, para que se vea cuánto margen hay. */
export const gaugePercent = (a: Pick<ArticleSummary, 'available' | 'minimum'>) => a.minimum > 0 ? Math.max(0, Math.min(100, Math.round((a.available / (a.minimum * 2)) * 100))) : a.available > 0 ? 100 : 0;
export const minimumMarkPercent = (a: Pick<ArticleSummary, 'minimum'>) => a.minimum > 0 ? 50 : 0;

export const quantityText = (n: number, unit: string) => `${new Intl.NumberFormat('es-SV', { maximumFractionDigits: 4 }).format(n)} ${unit}`;

/** Días hasta el vencimiento (negativo = ya venció); null si el lote no vence. */
export function daysUntil(expiresAt: string | null, today: string): number | null {
  if (!expiresAt) return null;
  return Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}
export function expiryText(expiresAt: string | null, today: string): string {
  const days = daysUntil(expiresAt, today);
  if (days === null) return 'No vence';
  if (days < 0) return `Venció hace ${-days} ${days === -1 ? 'día' : 'días'}`;
  if (days === 0) return 'Vence hoy';
  return days <= 30 ? `Vence en ${days} ${days === 1 ? 'día' : 'días'}` : 'Vigente';
}

export type MovementForm = {
  type: MovementType; articleId: string; lotId: string; lotNumber: string; expiresAt: string;
  origin: string; destination: string; quantity: string; reason: string; patientId: string;
};
export const emptyMovement = (type: MovementType = 'consumo'): MovementForm => ({ type, articleId: '', lotId: '', lotNumber: '', expiresAt: '', origin: '', destination: '', quantity: '', reason: '', patientId: '' });

/** Validación en línea: un mensaje por campo, solo de lo que ese tipo necesita. La API vuelve a validar todo. */
export function validateMovement(f: MovementForm, lot: AvailableLot | null): Partial<Record<'article' | 'lot' | 'lotNumber' | 'origin' | 'destination' | 'quantity' | 'reason', string>> {
  const need = fieldsFor(f.type), e: ReturnType<typeof validateMovement> = {}, quantity = Number(f.quantity);
  if (!f.articleId) e.article = 'Elige el artículo.';
  if (need.origin && !f.origin) e.origin = f.type === 'ajuste' ? 'Elige la bodega que contaste.' : 'Elige la bodega de origen.';
  if (need.destination && !f.destination) e.destination = 'Elige la bodega de destino.';
  if (f.type === 'traslado' && f.origin && f.origin === f.destination) e.destination = 'El destino debe ser otra bodega.';
  if (need.existingLot && f.articleId && f.origin && !f.lotId) e.lot = 'Elige el lote.';
  if (need.newLot && !f.lotNumber.trim()) e.lotNumber = 'Escribe el número de lote.';
  if (!f.quantity.trim() || !Number.isFinite(quantity) || quantity === 0) e.quantity = 'Indica la cantidad.';
  else if (f.type !== 'ajuste' && quantity < 0) e.quantity = 'La cantidad debe ser mayor que cero.';
  else if (lot && ['consumo', 'merma', 'traslado', 'salida'].includes(f.type) && quantity > lot.quantity) e.quantity = `Solo hay ${lot.quantity} disponibles en ese lote.`;
  else if (lot && f.type === 'ajuste' && quantity < 0 && -quantity > lot.quantity) e.quantity = `Solo hay ${lot.quantity} en ese lote.`;
  if (f.reason.trim().length < 5) e.reason = 'Escribe un motivo de al menos 5 letras.';
  return e;
}

export function movementBody(f: MovementForm) {
  const need = fieldsFor(f.type);
  return {
    type: f.type, quantity: Number(f.quantity), reason: f.reason.trim(),
    ...(need.newLot ? { articleId: f.articleId, lotNumber: f.lotNumber.trim(), ...(f.expiresAt ? { expiresAt: f.expiresAt } : {}) } : { lotId: f.lotId }),
    ...(need.origin ? { originWarehouseId: f.origin } : {}),
    ...(need.destination ? { destinationWarehouseId: f.destination } : {}),
    ...(need.patient && f.patientId ? { patientId: f.patientId } : {}),
  };
}

export function articleExport(rows: ArticleSummary[], filtersText: string): ExportTable {
  return {
    filename: 'inventario', title: 'Inventario', subtitle: filtersText || 'Todos los artículos visibles',
    columns: ['Código', 'Artículo', 'Categoría', 'Unidad', 'Existencia', 'Mínimo', 'Por vencer', 'Vencidas', 'Próximo vencimiento', 'Estado'],
    rows: rows.map(a => [a.code, a.name, categories[a.type].label, a.unit, a.available, a.minimum, a.expiringSoon, a.expired, a.nextExpiry ?? '', statusLabels[a.status]]),
  };
}
export function movementsExport(article: ArticleDetail): ExportTable {
  return {
    filename: `movimientos-${article.code}`, title: `Movimientos de ${article.name}`, subtitle: article.code,
    columns: ['Fecha', 'Tipo', 'Lote', 'Cantidad', 'Origen', 'Destino', 'Motivo', 'Registró'],
    rows: article.movements.map(m => [m.registeredAt, movementLabels[m.type].label, m.lotNumber, m.quantity, m.originWarehouseCode ?? '', m.destinationWarehouseCode ?? '', m.reason, m.authorName]),
  };
}

/** Día de hoy en la hora del hospital (yyyy-MM-dd), para contar días hasta el vencimiento. */
export const todayIso = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador' }).format(now);

/** Qué movimientos ofrece la pantalla según el contexto del permiso `inventario.mover` (la API lo vuelve a exigir). */
export function movementTypesFor(permissions: { code: string; context: string }[]): MovementType[] {
  const contexts = permissions.filter(p => p.code === 'inventario.mover').map(p => p.context);
  if (!contexts.length) return [];
  return contexts.some(c => c === 'x' || c === 'reactivos') ? guidedTypes : ['consumo'];
}
export const canConfigure = (permissions: { code: string }[]) => permissions.some(p => p.code === 'inventario.configurar');
