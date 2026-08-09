import { Router } from 'express';
import { Logger } from 'pino';
import { requestRole } from '../middleware/auth';
import { readAccessEntries, recordAccess } from '../middleware/accessLog';
import { aggregateAccess } from '../lib/stats';

/** Bornes acceptées pour `?days=` : au moins un jour, au plus dix ans. */
const MAX_DAYS = 3650;

/**
 * Convertit `?days=` en horodatage de début, ou `undefined` pour tout l'historique.
 * Renvoie `'invalid'` sur une valeur qui n'est ni `all` ni un entier de jours plausible.
 */
export function resolveSince(raw: unknown, now: number): string | undefined | 'invalid' {
  if (raw === undefined || raw === '' || raw === 'all') return undefined;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return 'invalid';
  const days = Number(raw);
  if (days < 1 || days > MAX_DAYS) return 'invalid';
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Routeur des statistiques d'accès, monté sous `/api` :
 * - `GET /stats?days=7|30|90|all` → agrégats d'accès, **réservés au rôle administrateur** (403 sinon).
 * - `POST /visit` → balise d'ouverture de l'app (tout utilisateur authentifié), 204.
 *
 * La balise existe parce que le service worker de la PWA sert les navigations depuis son précache :
 * sans elle, seule la toute première visite d'un appareil atteint le serveur, et le compteur cesse
 * ensuite de bouger (issue #16).
 *
 * (L'ancien `GET /context` a été retiré : le client déduit ses droits du `role` de `/auth/status`.)
 */
export function createStatsRouter(logger: Logger): Router {
  const router = Router();

  router.get('/stats', (req, res, next) => {
    try {
      if (requestRole(req) !== 'admin') {
        return res.status(403).json({ error: 'Statistiques réservées au rôle administrateur.' });
      }
      const since = resolveSince(req.query.days, Date.now());
      if (since === 'invalid') {
        return res.status(400).json({ error: 'Paramètre « days » invalide (entier de jours ou « all »).' });
      }
      res.json(aggregateAccess(readAccessEntries(undefined, since)));
    } catch (err) {
      logger.error({ err }, 'Échec de lecture des statistiques');
      next(err);
    }
  });

  router.post('/visit', (req, res) => {
    // Écriture best-effort (`recordAccess` avale ses erreurs) : une visite perdue ne doit jamais
    // dégrader l'usage de l'app. Le login est résolu depuis la session par `recordAccess`.
    recordAccess(req, undefined, { kind: 'visit' });
    res.status(204).end();
  });

  return router;
}
