import type { Api } from './api';

/**
 * T07b (S10): the photo or PDF of an external lab result lives in a private bucket. The browser never talks to the
 * bucket: it uploads through the API and downloads through a 5-minute signed link the API hands out (and audits).
 */

export type StoredAttachment = { id: string; stored: boolean; mimeType: string; sizeBytes: number; sha256: string };
export type AttachmentLink = { url: string; expiresAt: string; expiresInSeconds: number; fileName: string; mimeType: string; sizeBytes: number };

export const attachmentFilePath = (attachmentId: string) => `/laboratorio/adjuntos/${attachmentId}/archivo`;
export const attachmentLinkPath = (attachmentId: string) => `/laboratorio/adjuntos/${attachmentId}/enlace`;

/** POST /laboratorio/adjuntos/{id}/archivo as multipart/form-data with the file in the `archivo` part. */
export function uploadAttachment(api: Api, attachmentId: string, file: File) {
  const form = new FormData();
  form.append('archivo', file, file.name);
  return api.request<StoredAttachment>(attachmentFilePath(attachmentId), { method: 'POST', body: form, headers: { 'Idempotency-Key': crypto.randomUUID() } });
}

/**
 * Asks for a fresh signed link and follows it. The link answers with `Content-Disposition: attachment`, so the browser
 * downloads the file and the page stays where it is. The link is never stored or shown.
 */
export async function downloadAttachment(api: Api, attachmentId: string) {
  const link = await api.request<AttachmentLink>(attachmentLinkPath(attachmentId));
  const anchor = document.createElement('a');
  anchor.href = link.url;
  anchor.rel = 'noopener noreferrer';
  anchor.click();
}
