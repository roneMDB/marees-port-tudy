import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { SESSION_COOKIE, parseCookies, verifySession } from '../lib/session';

/** Chemins `/api` accessibles sans authentification (santé + endpoints de la mire). */
const PUBLIC_API = new Set(['/api/health', '/api/login', '/api/logout', '/api/auth/status']);

/** Comparaison à temps constant (le test de longueur ne fuit qu'une info négligeable). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** L'authentification est active dès que `APP_PASSWORD` est renseigné. */
export function authEnabled(): boolean {
  return (process.env.APP_PASSWORD || '').length > 0;
}

/** Vérifie un couple identifiant/mot de passe contre `APP_USER`/`APP_PASSWORD`. */
export function verifyCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.APP_USER || 'marees';
  const expectedPassword = process.env.APP_PASSWORD || '';
  return safeEqual(user, expectedUser) && safeEqual(password, expectedPassword);
}

/** Extrait et valide un en-tête `Authorization: Basic ...`. */
function basicHeaderMatches(header: string | undefined): boolean {
  const [scheme, encoded] = (header || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  return verifyCredentials(decoded.slice(0, sep), decoded.slice(sep + 1));
}

/**
 * Garde d'authentification **optionnel** (actif si `APP_PASSWORD`). Protège uniquement `/api`
 * (hors `PUBLIC_API`) : la coquille SPA reste publique pour afficher la mire. Accepte un
 * **cookie de session valide** ou un **en-tête Basic** (rétro-compat curl/sonde). Ne renvoie
 * **plus** `WWW-Authenticate` afin d'éviter le popup natif du navigateur.
 */
export function basicAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authEnabled()) return next();
    if (!req.path.startsWith('/api')) return next(); // coquille SPA publique
    if (PUBLIC_API.has(req.path)) return next();

    const cookies = parseCookies(req.headers.cookie);
    if (verifySession(cookies[SESSION_COOKIE], Date.now())) return next();
    if (basicHeaderMatches(req.headers.authorization)) return next();

    res.status(401).json({ error: 'Authentification requise.' });
  };
}
