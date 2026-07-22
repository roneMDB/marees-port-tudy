import { Router } from 'express';
import { SESSION_COOKIE, parseCookies, signSession, verifySession } from '../lib/session';
import { authEnabled, verifyCredentials } from '../middleware/auth';

/** Durée du cookie « se souvenir de moi » : 60 jours. */
const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Routeur d'authentification (monté sous `/api`, **routes publiques**) :
 * - `POST /login`  → vérifie les identifiants, pose le cookie de session signé.
 * - `POST /logout` → efface le cookie.
 * - `GET  /auth/status` → `{ authRequired, authenticated }` (résout le poule-œuf côté client).
 */
export function createAuthRouter(): Router {
  const router = Router();

  router.get('/auth/status', (req, res) => {
    const authRequired = authEnabled();
    const cookies = parseCookies(req.headers.cookie);
    const authenticated = !authRequired || verifySession(cookies[SESSION_COOKIE], Date.now());
    res.json({ authRequired, authenticated });
  });

  router.post('/login', (req, res) => {
    if (!authEnabled()) return res.json({ ok: true }); // auth désactivée : no-op
    const { user, password, remember } = req.body ?? {};
    if (typeof user !== 'string' || typeof password !== 'string' || !verifyCredentials(user, password)) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }
    const token = signSession(SESSION_TTL_MS, Date.now());
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure, // HTTPS via reverse proxy (trust proxy + X-Forwarded-Proto)
      path: '/',
      ...(remember ? { maxAge: SESSION_TTL_MS } : {}) // sinon cookie de session
    });
    res.json({ ok: true });
  });

  router.post('/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  return router;
}
