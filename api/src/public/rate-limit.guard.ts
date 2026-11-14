import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Clock } from '../platform/clock';
import { ProblemException } from '../platform/problem';

/** Solicitudes por dirección IP y minuto para los endpoints sin sesión (plan 112). */
export const PUBLIC_LIMIT_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
const MAX_TRACKED = 10_000;

/**
 * Ventana fija por IP en memoria del proceso. La pantalla pública solo vuelve a pedir al llegar un evento
 * (en lotes), así que un televisor queda muy por debajo del límite; uno que lo supere recibe 429.
 */
@Injectable()
export class PublicRateLimitGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly clock: Clock) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    const ip = request.ip ?? 'desconocida';
    const now = this.clock.now().valueOf();
    let window = this.windows.get(ip);
    if (!window || now - window.start >= WINDOW_MS) {
      if (!window && this.windows.size >= MAX_TRACKED) this.prune(now);
      window = { start: now, count: 0 };
      this.windows.set(ip, window);
    }
    window.count++;
    if (window.count > PUBLIC_LIMIT_PER_MINUTE) {
      const retry = Math.max(1, Math.ceil((window.start + WINDOW_MS - now) / 1000));
      throw new ProblemException('demasiadas_solicitudes', 429, `Demasiadas solicitudes. Intenta de nuevo en ${retry} s.`, undefined, { reintentarEn: retry });
    }
    return true;
  }

  private prune(now: number) {
    for (const [ip, window] of this.windows) if (now - window.start >= WINDOW_MS) this.windows.delete(ip);
    if (this.windows.size >= MAX_TRACKED) this.windows.clear();
  }
}
