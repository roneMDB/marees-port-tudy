import { Router } from 'express';
import { Role, SESSION_COOKIE, parseCookies, signSession, verifySession } from '../lib/session';
import { authEnabled, resolveRole } from '../middleware/auth';

/** Durée du cookie « se souvenir de moi » : 30 jours. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Routeur d'authentification (monté sous `/api`, **routes publiques**) :
 * - `POST /login`  → résout le rôle (`resolveRole`), pose le cookie de session signé portant le rôle.
 * - `POST /logout` → efface le cookie.
 * - `GET  /auth/status` → `{ authRequired, authenticated, role }` (pilote la mire + l'affichage
 *   des fonctions admin côté client).
 */
export function createAuthRouter(): Router {
  const router = Router();

  router.get('/auth/status', (req, res) => {
    if (!authEnabled()) {
      // Auth désactivée (dev) : tout ouvert, rôle admin.
      return res.json({ authRequired: false, authenticated: true, role: 'admin' as Role });
    }
    const cookies = parseCookies(req.headers.cookie);
    const role = verifySession(cookies[SESSION_COOKIE], Date.now());
    res.json({ authRequired: true, authenticated: role !== null, role });
  });

  router.post('/login', (req, res) => {
    if (!authEnabled()) return res.json({ ok: true, role: 'admin' as Role }); // auth désactivée : no-op
    const { user, password, remember } = req.body ?? {};
    const role = typeof user === 'string' && typeof password === 'string'
      ? resolveRole(user, password)
      : null;
    if (!role) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    const token = signSession(role, SESSION_TTL_MS, Date.now());
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      // HTTPS via reverse proxy (trust proxy + X-Forwarded-Proto) ; `COOKIE_SECURE=true` force le
      // flag si le proxy ne transmet pas `X-Forwarded-Proto` (cf. revue sécurité INFO-003).
      secure: req.secure || process.env.COOKIE_SECURE === 'true',
      path: '/',
      ...(remember ? { maxAge: SESSION_TTL_MS } : {}) // sinon cookie de session
    });
    res.json({ ok: true, role });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
