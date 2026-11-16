import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ClinicalFileStorage, LAB_ATTACHMENTS_BUCKET } from './clinical-storage';
import { ProblemException } from './problem';

/**
 * Supabase Storage adapter of ClinicalFileStorage. It only works with the server key (`SUPABASE_SECRET_KEY` or
 * `SUPABASE_SERVICE_ROLE_KEY`): the bucket is private and has no policy for anon or authenticated, so the publishable
 * key could not read or write it anyway. Errors never carry the path, the URL or the provider message.
 */
@Injectable()
export class SupabaseClinicalFileStorage extends ClinicalFileStorage {
  private client?: SupabaseClient;
  constructor(private readonly config: ConfigService) { super(); }

  private bucket() {
    if (!this.client) {
      const url = this.config.get<string>('SUPABASE_URL');
      const secret = this.config.get<string>('SUPABASE_SECRET_KEY') || this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !secret) throw new ProblemException('no_disponible', 503, 'El almacenamiento de archivos clínicos no está configurado en el servidor.');
      this.client = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    }
    return this.client.storage.from(LAB_ATTACHMENTS_BUCKET);
  }

  async put(path: string, content: Buffer, mimeType: string) {
    const { error } = await this.bucket().upload(path, content, { contentType: mimeType, upsert: false });
    if (error) throw new ProblemException('no_disponible', 503, 'No se pudo guardar el archivo; intenta de nuevo en unos minutos.');
  }

  async remove(path: string) {
    const { error } = await this.bucket().remove([path]);
    if (error) throw new ProblemException('no_disponible', 503, 'No se pudo retirar el archivo del almacenamiento.');
  }

  async signedUrl(path: string, seconds: number, downloadName: string) {
    // storage-js appends `download` to the URL without encoding it, so a name with `&` or `#` would break the link.
    const { data, error } = await this.bucket().createSignedUrl(path, seconds, { download: encodeURIComponent(downloadName) });
    if (error || !data?.signedUrl) throw new ProblemException('no_disponible', 503, 'No se pudo preparar la descarga; intenta de nuevo en unos minutos.');
    return data.signedUrl;
  }
}
