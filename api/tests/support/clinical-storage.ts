import { randomUUID } from 'node:crypto';
import { ClinicalFileStorage } from '../../src/platform/clinical-storage';

/** In-memory ClinicalFileStorage for tests: no network, inspectable objects and signed URLs. */
export class InMemoryClinicalFileStorage extends ClinicalFileStorage {
  readonly objects = new Map<string, { content: Buffer; mimeType: string }>();
  readonly signed: { path: string; seconds: number; downloadName: string }[] = [];
  async put(path: string, content: Buffer, mimeType: string) {
    if (this.objects.has(path)) throw new Error('object already exists');
    this.objects.set(path, { content: Buffer.from(content), mimeType });
  }
  async remove(path: string) { this.objects.delete(path); }
  async signedUrl(path: string, seconds: number, downloadName: string) {
    if (!this.objects.has(path)) throw new Error('object not found');
    this.signed.push({ path, seconds, downloadName });
    return `https://almacen.example.test/firmado/${randomUUID()}?expira=${seconds}`;
  }
}
