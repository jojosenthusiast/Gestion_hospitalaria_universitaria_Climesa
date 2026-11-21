/**
 * Fase 2, flujo C (S10): pure rules of the lab worklist groups, external orders and attachments. No network, no clock.
 */

export type LabGroupId = 'en_proceso' | 'muestra' | 'externa' | 'por_revisar' | 'liberada' | 'cancelada';

/**
 * Worklist groups in the order the lab works them: finish what is already in hand, then take new samples, then follow
 * the external orders. What waits for the doctor and what is closed go last; closed groups start folded.
 */
export const LAB_GROUPS: { id: LabGroupId; label: string; folded: boolean }[] = [
  { id: 'en_proceso', label: 'En Proceso', folded: false },
  { id: 'muestra', label: 'Por tomar muestra', folded: false },
  { id: 'externa', label: 'Externas: esperan el informe', folded: false },
  { id: 'por_revisar', label: 'Esperan revisión médica', folded: false },
  { id: 'liberada', label: 'Liberadas', folded: true },
  { id: 'cancelada', label: 'Canceladas', folded: true },
];

type GroupInput = { state: string; reviewedAt?: string | null; external?: boolean | null };

export function labGroupOf(order: GroupInput): LabGroupId {
  if (order.state === 'cancelado') return 'cancelada';
  if (order.state === 'en_proceso') return 'en_proceso';
  if (order.state === 'pendiente') return order.external ? 'externa' : 'muestra';
  return order.reviewedAt ? 'liberada' : 'por_revisar';
}

/** Keeps the incoming order (already sorted) inside each group; empty groups are dropped. */
export function groupLabOrders<T extends GroupInput>(orders: T[]): { id: LabGroupId; label: string; folded: boolean; orders: T[] }[] {
  return LAB_GROUPS.map(group => ({ ...group, orders: orders.filter(order => labGroupOf(order) === group.id) })).filter(group => group.orders.length > 0);
}

/** Same list as the API (`TipoAdjuntoLaboratorio`); the file picker offers only these. */
export const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** `accept` of the file pickers: the types plus the extensions, because Windows gives a HEIC photo no type. */
export const ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic,image/webp,.pdf,.jpg,.jpeg,.png,.heic,.heif,.webp';
const TYPE_OF_EXTENSION: Record<string, (typeof ATTACHMENT_TYPES)[number]> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heic', webp: 'image/webp',
};

export type AttachmentMeta = { fileName: string; mimeType: string; sizeBytes: number; sha256?: string };

/**
 * Type sent for a picked file: the browser's when it is an accepted one; when the browser gives none (Chrome and
 * Firefox on Windows with a HEIC photo), the one of its extension. Null when neither is accepted. The API reads the
 * real type from the bytes anyway.
 */
export function attachmentMimeType(file: { name: string; type: string }): string | null {
  if ((ATTACHMENT_TYPES as readonly string[]).includes(file.type)) return file.type;
  if (file.type) return null;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
  return (extension && TYPE_OF_EXTENSION[extension]) || null;
}

/** Human message when a picked file cannot back an external result, or null when it can. */
export function attachmentProblem(file: { name: string; type: string; size: number } | null): string | null {
  if (!file) return 'Adjunta la foto o el PDF del informe externo.';
  if (!attachmentMimeType(file)) return 'El informe debe ser PDF o una foto (JPG, PNG, HEIC o WEBP).';
  if (file.size <= 0) return 'El archivo está vacío.';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'El archivo pasa de 10 MB; toma una foto más liviana o comprime el PDF.';
  return null;
}

export const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;

/** SHA-256 in hex of the picked file, or undefined when the browser cannot read it (the API accepts no fingerprint). */
export async function fingerprintFile(file: Blob): Promise<string | undefined> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

/** Body of POST /laboratorio/ordenes/{id}/resultado-externo. Numeric exams send `value`, text exams send `text`. */
export function externalResultBody(version: number, attachment: AttachmentMeta, items: { id: string; numeric: boolean }[], values: Record<string, string>, note: string) {
  return {
    version,
    attachment,
    results: items.map(item => item.numeric ? { orderItemId: item.id, value: Number(values[item.id]) } : { orderItemId: item.id, text: (values[item.id] ?? '').trim() }),
    ...(note.trim() ? { note: note.trim() } : {}),
  };
}

/** Template for the patient's instructions; the person edits it before sending. */
export const EXTERNAL_INSTRUCTIONS_TEMPLATE = 'Presente esta orden y su DUI en el lugar indicado. Siga la preparación que le indiquen. Traiga el informe (foto o PDF) a su próxima cita o al laboratorio.';
