/**
 * Port of the private clinical file storage (ADR-0009). The API is the only door: clients never talk to the bucket, a
 * download is a short-lived signed URL that the API hands out after checking scope and writing the audit row.
 * Implementations never log file contents, object paths, signed URLs or keys.
 */
export abstract class ClinicalFileStorage {
  /** Stores `content` at `path`; fails if the path already exists (paths are random, never reused). */
  abstract put(path: string, content: Buffer, mimeType: string): Promise<void>;
  /** Removes the object; removing a missing object is not an error. */
  abstract remove(path: string): Promise<void>;
  /** URL that downloads the object as `downloadName` and stops working after `seconds`. */
  abstract signedUrl(path: string, seconds: number, downloadName: string): Promise<string>;
}

/** Private Supabase Storage bucket created by supabase/migrations/20261125006000_laboratorio_adjuntos_storage.sql. */
export const LAB_ATTACHMENTS_BUCKET = 'laboratorio-adjuntos';
