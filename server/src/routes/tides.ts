import { Router } from 'express';
import { Logger } from 'pino';
import Maree from '../service/Maree';
import { TIDES_FILE } from '../config/dataDir';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Routeur des marées, monté sous `/api` :
 * - `GET /health` : sonde de vie.
 * - `GET /tides/meta` : bornes de dates disponibles + offsets Navihan.
 * - `GET /tides?from=YYYY-MM-DD&to=YYYY-MM-DD` : marées sur une plage inclusive
 *   (sans paramètres → toute la plage disponible). 400 si dates malformées ou `from > to`.
 */
export function createTidesRouter(logger: Logger): Router {
  const router = Router();
  const maree = new Maree(logger, { dataFile: TIDES_FILE });

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/tides/meta', (_req, res, next) => {
    try {
      res.json(maree.getMeta());
    } catch (err) {
      next(err);
    }
  });

  router.get('/tides', async (req, res, next) => {
    try {
      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;

      if (from && !DATE_RE.test(from)) {
        return res.status(400).json({ error: 'Paramètre "from" invalide : format attendu YYYY-MM-DD.' });
      }
      if (to && !DATE_RE.test(to)) {
        return res.status(400).json({ error: 'Paramètre "to" invalide : format attendu YYYY-MM-DD.' });
      }
      if (from && to && from > to) {
        return res.status(400).json({ error: 'Plage invalide : "from" doit être antérieur ou égal à "to".' });
      }

      const data = await maree.getTidesRange(from, to);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
