import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { SESSION_COOKIE, parseCookies, verifySession } from '../lib/session';

/**
 * Chemins accessibles sans authentification (santé + endpoints de la mire). **Relatifs au
 * point de montage `/api`** : le garde est monté via `app.use('/api', basicAuth())`, donc Express
 * lui présente les mêmes requêtes (mêmes règles de casse/normalisation) qu'aux routeurs `/api`,
 * et `req.path` est déjà dépouillé du préfixe `/api`.
 */
const PUBLIC_API = new Set(['/health', '/login', '/logout', '/auth/status']);

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
  // On évalue les deux comparaisons **avant** le `&&` : pas de court-circuit, donc le temps de
  // réponse ne révèle pas si l'identifiant seul était correct (cf. revue sécurité INFO-002).
  const okUser = safeEqual(user, expectedUser);
  const okPassword = safeEqual(password, expectedPassword);
  return okUser && okPassword;
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
 * Garde d'authentification **optionnel** (actif si `APP_PASSWORD`), à **monter sur `/api`**
 * (`app.use('/api', basicAuth())`) afin qu'il couvre exactement les mêmes requêtes que les
 * routeurs `/api` — y compris les variantes de casse (`/API/…`) ou de slash qu'Express route
 * sans distinction : un test de chaîne manuel sur `req.path` laisserait passer ces variantes.
 * La coquille SPA (hors `/api`) reste publique pour afficher la mire. Accepte un **cookie de
 * session valide** ou un **en-tête Basic** (rétro-compat curl/sonde). Ne renvoie **plus**
 * `WWW-Authenticate` afin d'éviter le popup natif du navigateur.
 */
export function basicAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!authEnabled()) return next();
    if (PUBLIC_API.has(req.path)) return next(); // req.path est relatif au montage `/api`

    const cookies = parseCookies(req.headers.cookie);
    if (verifySession(cookies[SESSION_COOKIE], Date.now())) return next();
    if (basicHeaderMatches(req.headers.authorization)) return next();

    res.status(401).json({ error: 'Authentification requise.' });
  };
}
