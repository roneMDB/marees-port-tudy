import { createHmac, timingSafeEqual } from 'crypto';
import { getDb } from '../db';
import { getOrCreateSessionSecret } from '../db/usersRepository';

/** Rôles applicatifs : `viewer` (lecteur, consultation) ou `admin` (édition réglages + statistiques). */
export type Role = 'viewer' | 'admin';

/** Nom du cookie de session posé après connexion. */
export const SESSION_COOKIE = 'marees_session';

/**
 * Secret de signature du jeton. Priorité à `SESSION_SECRET` (override explicite) ; sinon un secret
 * aléatoire **persisté en base** (`getOrCreateSessionSecret`), stable entre redémarrages et
 * indépendant des mots de passe utilisateurs. Lu à chaque appel (pas de capture à l'import) pour
 * rester testable.
 */
export function sessionSecret(): string {
  const override = process.env.SESSION_SECRET;
  if (override && override.length > 0) return override;
  return getOrCreateSessionSecret(getDb());
}

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

/**
 * Fabrique un jeton `"<userId>.<expiryMs>.<signature>"` valable `ttlMs` à partir de `now`.
 * La signature couvre `"<userId>.<expiryMs>"` : impossible de changer l'identité ou l'expiration
 * sans invalider le jeton. Le rôle n'est **pas** dans le jeton — il est relu en base à chaque requête.
 */
export function signSession(userId: number, ttlMs: number, now: number): string {
  const payload = `${userId}.${now + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

/**
 * Vérifie la signature (temps constant), la non-expiration et un identifiant numérique ; renvoie
 * l'**userId** ou `null`. Robuste aux entrées malformées et à l'ancien format à 2 champs.
 */
export function verifySession(token: string | undefined, now: number): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null; // format attendu : userId.expiry.sig
  const [idStr, expiryStr, sig] = parts;

  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return null;

  const payload = `${idStr}.${expiryStr}`;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry <= now) return null;
  return id;
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
