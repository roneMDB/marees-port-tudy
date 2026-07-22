import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { Role, SESSION_COOKIE, parseCookies, verifySession } from '../lib/session';

/** Chemins accessibles sans authentification (relatifs au montage `/api`). */
const PUBLIC_API = new Set(['/health', '/login', '/logout', '/auth/status']);

/** Comparaison à temps constant (le test de longueur ne fuit qu'une info négligeable). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** L'authentification est active dès que `APP_PASSWORD` **ou** `ADMIN_PASSWORD` est renseigné. */
export function authEnabled(): boolean {
  return (process.env.APP_PASSWORD || '').length > 0 || (process.env.ADMIN_PASSWORD || '').length > 0;
}

/**
 * Résout le rôle d'un couple identifiant/mot de passe : teste d'abord les identifiants **admin**
 * (`ADMIN_USER`/`ADMIN_PASSWORD`), puis **viewer** (`APP_USER`/`APP_PASSWORD`). `null` si aucun.
 * Les deux `safeEqual` sont évalués sans court-circuit (cf. revue sécurité INFO-002).
 */
export function resolveRole(user: string, password: string): Role | null {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (adminPassword.length > 0) {
    const okUser = safeEqual(user, adminUser);
    const okPassword = safeEqual(password, adminPassword);
    if (okUser && okPassword) return 'admin';
  }
  const viewerUser = process.env.APP_USER || 'marees';
  const viewerPassword = process.env.APP_PASSWORD || '';
  if (viewerPassword.length > 0) {
    const okUser = safeEqual(user, viewerUser);
    const okPassword = safeEqual(password, viewerPassword);
    if (okUser && okPassword) return 'viewer';
  }
  return null;
}

/** Rôle porté par un en-tête `Authorization: Basic ...` (rétro-compat curl/sonde), sinon `null`. */
function basicRole(header: string | undefined): Role | null {
  const [scheme, encoded] = (header || '').split(' ');
  if (scheme !== 'Basic' || !encoded) return null;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep < 0) return null;
  return resolveRole(decoded.slice(0, sep), decoded.slice(sep + 1));
}

/**
 * Rôle effectif de la requête : **`admin` si l'authentification est désactivée** (dev/tests, tout
 * ouvert) ; sinon le rôle du **cookie de session** valide, ou à défaut celui de l'en-tête **Basic** ;
 * `null` si rien de valide.
 */
export function requestRole(req: Request): Role | null {
  if (!authEnabled()) return 'admin';
  const cookies = parseCookies(req.headers.cookie);
  const cookieRole = verifySession(cookies[SESSION_COOKIE], Date.now());
  if (cookieRole) return cookieRole;
  return basicRole(req.headers.authorization);
}

/**
 * Garde d'authentification, à **monter sur `/api`** (`app.use('/api', basicAuth())`) pour couvrir
 * exactement les mêmes requêtes que les routeurs (casse/slash compris, cf. correctif FIX-001). Laisse
 * passer toute requête ayant un rôle (`requestRole !== null`) ; la coquille SPA (hors `/api`) reste
 * publique. Le contrôle **du rôle admin** pour les actions sensibles se fait dans les routes
 * concernées (`PUT /settings`, `/stats`). Ne renvoie pas `WWW-Authenticate` (pas de popup natif).
 */
export function basicAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (PUBLIC_API.has(req.path)) return next();
    if (requestRole(req) !== null) return next();
    res.status(401).json({ error: 'Authentification requise.' });
  };
}
