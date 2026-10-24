import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
@Injectable()
export class SupabaseService {
  private readonly client?: SupabaseClient;
  private readonly privileged: boolean;
  constructor(config: ConfigService) {
    const url = config.get<string>('SUPABASE_URL');
    const secret = config.get<string>('SUPABASE_SECRET_KEY') || config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    const key = secret || config.get<string>('SUPABASE_PUBLISHABLE_KEY');
    this.privileged = !!secret;
    if (url && key) this.client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  }
  isConfigured() { return !!this.client; }
  get authClient(): SupabaseClient {
    if (!this.client) throw new ServiceUnavailableException('Configura la conexión de Supabase Auth.');
    return this.client;
  }
  get admin(): SupabaseClient {
    if (!this.privileged) throw new ServiceUnavailableException('El envío de invitaciones requiere la clave privada en el servidor.');
    return this.authClient;
  }
}
