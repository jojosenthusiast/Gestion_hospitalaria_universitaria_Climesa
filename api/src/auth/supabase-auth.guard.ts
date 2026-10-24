import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AccessService } from './access.service';
import { ActorRequest } from '../platform/actor';
import { Clock } from '../platform/clock';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService, private readonly access: AccessService, private readonly config: ConfigService, private readonly clock: Clock) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ActorRequest>();
    const header = req.headers.authorization;
    const token = header?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
    if (!token || token.length > 8192) throw new UnauthorizedException('Se requiere una sesión válida.');
    try {
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;
      const issuer = `${this.config.get<string>('SUPABASE_URL')?.replace(/\/$/, '')}/auth/v1`;
      if (claims.iss !== issuer || typeof claims.exp !== 'number' || claims.exp * 1000 <= this.clock.now().getTime() || !(claims.aud === 'authenticated' || (Array.isArray(claims.aud) && claims.aud.includes('authenticated')))) throw Error('claims');
    } catch { throw new UnauthorizedException('La sesión expiró o pertenece a otro servicio.'); }
    // getUser verifies the token with Auth. Decoded claims and user_metadata never grant permissions.
    const { data, error } = await this.supabase.authClient.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException('El token no es válido o ha expirado.');
    req.actor = await this.access.actor(data.user.id, data.user.email);
    req.user = { id: data.user.id, email: data.user.email };
    return true;
  }
}
