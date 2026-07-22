import { Router } from 'express';
import { Logger } from 'pino';
import { requestRole } from '../middleware/auth';
import { readAccessEntries } from '../middleware/accessLog';
import { aggregateAccess } from '../lib/stats';

/**
 * Routeur des statistiques d'accès, monté sous `/api` :
 * - `GET /stats` → agrégats d'accès, **réservés au rôle administrateur** (403 sinon).
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
      res.json(aggregateAccess(readAccessEntries()));
    } catch (err) {
      logger.error({ err }, 'Échec de lecture des statistiques');
      next(err);
    }
  });

  return router;
}
