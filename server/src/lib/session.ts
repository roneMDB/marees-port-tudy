import { createHash, createHmac, timingSafeEqual } from 'crypto';

/** Nom du cookie de session posé après connexion. */
export const SESSION_COOKIE = 'marees_session';

/**
 * Secret de signature du jeton. Priorité à `SESSION_SECRET` (override explicite) ; sinon dérivé
 * de `APP_PASSWORD` — stable entre redémarrages **et** changer le mot de passe révoque toutes
 * les sessions. Lu à chaque appel (pas de capture à l'import) pour rester testable.
 */
export function sessionSecret(): string {
  const override = process.env.SESSION_SECRET;
  if (override && override.length > 0) return override;
  return createHash('sha256').update(process.env.APP_PASSWORD || '').digest('hex');
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

/** Fabrique un jeton `"<expiryMs>.<signature>"` valable `ttlMs` à partir de `now`. */
export function signSession(ttlMs: number, now: number): string {
  const payload = String(now + ttlMs);
  return `${payload}.${sign(payload)}`;
}

/** Vérifie la signature (temps constant) et la non-expiration. Robuste aux entrées malformées. */
export function verifySession(token: string | undefined, now: number): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expiry = Number(payload);
  return Number.isFinite(expiry) && expiry > now;
}

/** Parse l'en-tête `Cookie` en dictionnaire (valeurs non décodées, suffisant pour nos jetons). */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = part.slice(eq + 1).trim();
  }
  return out;
}
