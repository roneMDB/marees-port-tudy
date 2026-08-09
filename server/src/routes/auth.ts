import { Router } from 'express';
import { Role, SESSION_COOKIE, signSession } from '../lib/session';
import { authEnabled, requestUser, resolveUser } from '../middleware/auth';
import { recordAccess } from '../middleware/accessLog';

/** Durée du cookie « se souvenir de moi » : 30 jours. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Routeur d'authentification (monté sous `/api`, **routes publiques**) :
 * - `POST /login`  → résout l'utilisateur en base (`resolveUser`), pose le cookie de session signé
 *   portant son identifiant. Renvoie `{ ok, role, mustChangePassword }`.
 * - `POST /logout` → efface le cookie.
 * - `GET  /auth/status` → `{ authRequired, authenticated, role, user }` (pilote la mire + l'affichage
 *   des fonctions admin + le changement de mot de passe forcé côté client).
 */
export function createAuthRouter(): Router {
  const router = Router();

  router.get('/auth/status', (req, res) => {
    if (!authEnabled()) {
      // Auth désactivée (dev) : tout ouvert, rôle admin.
      return res.json({ authRequired: false, authenticated: true, role: 'admin' as Role, user: null });
    }
    const user = requestUser(req);
    res.json({
      authRequired: true,
      authenticated: user !== null,
      role: user?.role ?? null,
      user: user ? { id: user.id, login: user.login, mustChangePassword: user.mustChangePassword } : null
    });
  });

  router.post('/login', async (req, res, next) => {
    try {
      if (!authEnabled()) return res.json({ ok: true, role: 'admin' as Role, mustChangePassword: false }); // no-op
      const { user, password, remember } = req.body ?? {};
      const resolved = typeof user === 'string' && typeof password === 'string'
        ? await resolveUser(user, password)
        : null;
      if (!resolved) {
        return res.status(401).json({ error: 'Identifiants invalides.' });
      }
      const token = signSession(resolved.id, SESSION_TTL_MS, Date.now());
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        // HTTPS via reverse proxy (trust proxy + X-Forwarded-Proto) ; `COOKIE_SECURE=true` force le
        // flag si le proxy ne transmet pas `X-Forwarded-Proto` (cf. revue sécurité INFO-003).
        secure: req.secure || process.env.COOKIE_SECURE === 'true',
        path: '/',
        ...(remember ? { maxAge: SESSION_TTL_MS } : {}) // sinon cookie de session
      });
      // Journalise la connexion (attribuée à l'utilisateur) pour les statistiques d'accès.
      recordAccess(req, undefined, { kind: 'login', login: resolved.login });
      res.json({ ok: true, role: resolved.role, mustChangePassword: resolved.mustChangePassword });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
