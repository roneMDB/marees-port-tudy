import { NextFunction, Request, Response } from 'express';
import { Role, SESSION_COOKIE, parseCookies, verifySession } from '../lib/session';
import { getDb, type DB } from '../db';
import { getUserById, getUserByLogin } from '../db/usersRepository';
import { verifyPassword } from '../lib/password';

/** Chemins accessibles sans authentification (relatifs au montage `/api`). */
const PUBLIC_API = new Set(['/health', '/login', '/logout', '/auth/status']);

/** Utilisateur effectif d'une requête (identité minimale portée par la session). */
export interface SessionUser {
  id: number;
  login: string;
  role: Role;
  mustChangePassword: boolean;
}

/**
 * L'authentification est active dès que `APP_PASSWORD` **ou** `ADMIN_PASSWORD` est renseigné.
 * Sert de master-switch : désactivée (dev/tests) → tout ouvert en `admin`, aucun compte requis.
 */
export function authEnabled(): boolean {
  return (process.env.APP_PASSWORD || '').length > 0 || (process.env.ADMIN_PASSWORD || '').length > 0;
}

/**
 * Résout un couple identifiant/mot de passe **contre la base** : renvoie l'utilisateur si le mot de
 * passe correspond au hash argon2id stocké, sinon `null`. Asynchrone (vérification du hash).
 */
export async function resolveUser(login: string, password: string, db: DB = getDb()): Promise<SessionUser | null> {
  const user = getUserByLogin(db, login);
  if (!user) return null;
  if (!(await verifyPassword(user.passwordHash, password))) return null;
  return { id: user.id, login: user.login, role: user.role, mustChangePassword: user.mustChangePassword };
}

/**
 * Utilisateur effectif de la requête : **`admin` synthétique si l'authentification est désactivée**
 * (dev/tests) ; sinon l'utilisateur du **cookie de session** valide, relu en base (le compte doit
 * toujours exister → révocation immédiate d'une session dont le compte a été supprimé). `null` sinon.
 */
export function requestUser(req: Request, db: DB = getDb()): SessionUser | null {
  if (!authEnabled()) return { id: 0, login: 'dev', role: 'admin', mustChangePassword: false };
  const cookies = parseCookies(req.headers.cookie);
  const userId = verifySession(cookies[SESSION_COOKIE], Date.now());
  if (userId === null) return null;
  const user = getUserById(db, userId);
  if (!user) return null;
  return { id: user.id, login: user.login, role: user.role, mustChangePassword: user.mustChangePassword };
}

/** Rôle effectif de la requête (dérivé de `requestUser`), ou `null` si non authentifié. */
export function requestRole(req: Request): Role | null {
  return requestUser(req)?.role ?? null;
}

/**
 * Garde d'authentification, à **monter sur `/api`** (`app.use('/api', basicAuth())`) pour couvrir
 * exactement les mêmes requêtes que les routeurs (casse/slash compris, cf. correctif FIX-001). Laisse
 * passer toute requête authentifiée (`requestUser !== null`) ; la coquille SPA (hors `/api`) reste
 * publique. Le contrôle **du rôle admin** pour les actions sensibles se fait dans les routes
 * concernées. Ne renvoie pas `WWW-Authenticate` (pas de popup natif).
 */
export function basicAuth() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (PUBLIC_API.has(req.path)) return next();
    if (requestUser(req) !== null) return next();
    res.status(401).json({ error: 'Authentification requise.' });
  };
}
