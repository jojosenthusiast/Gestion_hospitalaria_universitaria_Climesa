/**
 * Parameters Supabase Auth appends to the e-mail landing pages (`/confirmar-correo`, `/aceptar-invitacion`, `/restablecer`;
 * docs/operacion/correo-auth.md). A link can arrive as an implicit session in the hash (`#access_token=…&type=signup`),
 * as a PKCE `?code=`, as `?token_hash=&type=` (custom template) or as an error (`#error=…&error_code=otp_expired`).
 *
 * supabase-js reads and then clears the hash while it starts, so this module snapshots the URL when it is first evaluated.
 * `lib/supabase.ts` imports it before creating the client, which guarantees the snapshot happens first.
 */
export type AuthRedirect = {
  pathname: string;
  hasAccessToken: boolean;
  type?: string;
  code?: string;
  tokenHash?: string;
  error?: { code?: string; description?: string };
};

type UrlParts = { pathname: string; search: string; hash: string };

export function parseAuthRedirect(url: UrlParts): AuthRedirect {
  const query = new URLSearchParams(url.search), hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const read = (key: string) => hash.get(key) ?? query.get(key) ?? undefined;
  const errorCode = read('error_code') ?? read('error'), description = read('error_description');
  return {
    pathname: url.pathname,
    hasAccessToken: hash.has('access_token'),
    type: read('type'),
    code: query.get('code') ?? undefined,
    tokenHash: read('token_hash'),
    error: errorCode || description ? { code: errorCode, description } : undefined,
  };
}

const captured = typeof window === 'undefined' ? null : parseAuthRedirect(window.location);

/** The redirect of the page being shown: the startup snapshot when it belongs to this path, otherwise the current URL. */
export function currentAuthRedirect(): AuthRedirect {
  return captured && captured.pathname === window.location.pathname ? captured : parseAuthRedirect(window.location);
}

/** Spanish message for a link that Supabase rejected (used or expired link, wrong link). */
export function linkProblemMessage(error: NonNullable<AuthRedirect['error']>): string {
  if (error.code === 'otp_expired' || /expired|invalid/i.test(error.description ?? '')) return 'El enlace ya se usó o expiró.';
  if (error.code === 'access_denied') return 'El enlace ya no es válido.';
  return 'No pudimos validar el enlace.';
}
