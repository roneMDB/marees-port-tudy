import { createHash, createHmac, timingSafeEqual } from 'crypto';

/** Rôles applicatifs : `viewer` (consultation) ou `admin` (édition réglages + statistiques). */
export type Role = 'viewer' | 'admin';

const ROLES: readonly Role[] = ['viewer', 'admin'];

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

/**
 * Fabrique un jeton `"<role>.<expiryMs>.<signature>"` valable `ttlMs` à partir de `now`.
 * La signature couvre `"<role>.<expiryMs>"` : impossible de changer le rôle ou l'expiration
 * sans invalider le jeton.
 */
export function signSession(role: Role, ttlMs: number, now: number): string {
  const payload = `${role}.${now + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Vérifie la signature (temps constant), la non-expiration et un rôle connu ; renvoie le **rôle**
 * (`viewer`/`admin`) ou `null`. Robuste aux entrées malformées et à l'ancien format à 2 champs.
 */
export function verifySession(token: string | undefined, now: number): Role | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null; // format attendu : role.expiry.sig
  const [role, expiryStr, sig] = parts;
  if (!ROLES.includes(role as Role)) return null;

  const payload = `${role}.${expiryStr}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry <= now) return null;
  return role as Role;
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
