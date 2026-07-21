import { Router } from 'express';
import { Logger } from 'pino';
import { isPrivateIp } from '../lib/net';
import { readAccessEntries } from '../middleware/accessLog';
import { aggregateAccess } from '../lib/stats';

/**
 * Routeur des statistiques d'accès, monté sous `/api` :
 * - `GET /context` → `{ local }` : le client sait s'il est sur le réseau local (affichage du bouton Stats).
 * - `GET /stats` → agrégats d'accès, **réservés au réseau local** (403 sinon).
 */
export function createStatsRouter(logger: Logger): Router {
  const router = Router();

  router.get('/context', (req, res) => {
    res.json({ local: isPrivateIp(req.ip) });
  });

  router.get('/stats', (req, res, next) => {
    try {
      if (!isPrivateIp(req.ip)) {
        return res.status(403).json({ error: 'Statistiques disponibles uniquement depuis le réseau local.' });
      }
      res.json(aggregateAccess(readAccessEntries()));
    } catch (err) {
      logger.error({ err }, 'Échec de lecture des statistiques');
      next(err);
    }
  });

  return router;
}
