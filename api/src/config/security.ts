import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ConfigService } from '@nestjs/config';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { ProblemException } from '../platform/problem';

/** Default requests per IP and minute for the whole API (SEG-08). Generous: a screen refetches in bursts after realtime events. */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 300;

/** Paths that never count toward the limit: Render's health check hits `/salud` from its own network. */
const UNLIMITED_PATHS = new Set(['/salud']);

/**
 * Number of reverse proxies in front of the API whose `X-Forwarded-For` entry is trusted (Fastify `trustProxy`).
 * 0 (default) uses the socket address. On Render set `TRUST_PROXY_HOPS=1` so each client gets its own rate-limit bucket
 * instead of sharing the proxy's address; a larger value than the real number of proxies lets clients spoof their IP.
 */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const hops = Number(env.TRUST_PROXY_HOPS ?? 0);
  return Number.isInteger(hops) && hops >= 0 ? hops : 0;
}

/** Fastify `trustProxy` option: trusts exactly `hops` proxies (the same rule proxy-addr applies to a hop count), or none. */
export function trustProxyOption(env: NodeJS.ProcessEnv = process.env): false | ((address: string, hop: number) => boolean) {
  const hops = trustProxyHops(env);
  return hops ? (_address, hop) => hop < hops : false;
}

/** Requests per IP and minute from `RATE_LIMIT_MAX`, or the default when it is missing or not a positive integer. */
export function rateLimitPerMinute(value: string | number | undefined): number {
  const max = Number(value);
  return Number.isInteger(max) && max > 0 ? max : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

/**
 * Security headers (helmet) and a global rate limit per IP (SEG-08, audit 02 M-4/M-5).
 * The API only serves JSON plus the Swagger UI under `/api/v1/docs`, so the CSP allows same-origin assets and the inline
 * styles Swagger UI uses, and forbids framing. Registration is queued by Fastify before Nest adds its routes, so the hooks
 * apply to every route. The public screens keep their stricter limit (`PublicRateLimitGuard`, 120 per minute).
 */
export function registerSecurity(app: NestFastifyApplication, config: ConfigService) {
  void app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  const configured = config.get<string | number>('RATE_LIMIT_MAX');
  // The Jest suites drive hundreds of requests from one address per app; they opt in by setting RATE_LIMIT_MAX.
  if (config.get('NODE_ENV') === 'test' && (configured === undefined || configured === '')) return { rateLimitPerMinute: null };
  const max = rateLimitPerMinute(configured);
  void app.register(rateLimit, {
    global: true,
    max,
    timeWindow: 60_000,
    allowList: request => UNLIMITED_PATHS.has(request.url.split('?')[0]),
    // The plugin throws what this returns; Nest hands it to ApiErrorsFilter, so the 429 is problem+json with the same
    // `codigo` and `reintentarEn` as PublicRateLimitGuard (FR-100-11).
    errorResponseBuilder: (_request, context) => {
      const retry = Math.max(1, Math.ceil(context.ttl / 1000));
      return new ProblemException('demasiadas_solicitudes', 429, `Demasiadas solicitudes. Intenta de nuevo en ${retry} s.`, undefined, { reintentarEn: retry });
    },
  });
  return { rateLimitPerMinute: max };
}
