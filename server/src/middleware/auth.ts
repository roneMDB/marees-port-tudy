import { NextFunction, Request, Response } from 'express';
import { Role, SESSION_COOKIE, parseCookies, verifySession } from '../lib/session';
import { getDb, type DB } from '../db';
import { getUserById, getUserByLogin } from '../db/usersRepository';
import { verifyPassword } from '../lib/password';

/** Chemins accessibles sans authentification (relatifs au montage `/api`). */
const PUBLIC_API = new Set(['/health', '/login', '/logout', '/auth/status']);

/**
 * Hash argon2id **factice** (valeur arbitraire), vérifié quand le login n'existe pas afin
 * d'égaliser le temps de réponse du login et d'empêcher l'énumération d'utilisateurs par canal
 * temporel. Mêmes paramètres que les hash réels → coût comparable.
 */
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$8Vz9rOki5zvQJfC01aSNJQ$hWBEruFCqQq0ju2/lIqPFhYEsTs7GKqC3EIYyTvAy6o';

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
  if (!user) {
    // Vérification factice : coût argon2 identique à un login existant → pas de fuite temporelle.
    await verifyPassword(DUMMY_PASSWORD_HASH, password);
    return null;
  }
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
    const user = requestUser(req);
    if (user === null) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    // Changement de mot de passe forcé (ex. compte `admin`/`admin` amorcé) : tant qu'il n'est pas
    // fait, on ne laisse passer QUE le changement de son propre mot de passe (verrou serveur, pas
    // seulement l'écran client). Défense en profondeur contre l'usage d'un identifiant par défaut.
    if (user.mustChangePassword && !(req.method === 'PUT' && req.path === '/users/me/password')) {
      res.status(403).json({ error: 'Changement de mot de passe requis.', code: 'PASSWORD_CHANGE_REQUIRED' });
      return;
    }
    next();
  };
}
