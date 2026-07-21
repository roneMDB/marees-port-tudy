import { Router } from 'express';
import { Logger } from 'pino';
import { readSettings, writeSettings } from '../service/SettingsStore';
import { isPrivateIp } from '../lib/net';

/**
 * Routeur de configuration, monté sous `/api` :
 * - `GET /settings` : configuration courante (défauts si non initialisée).
 * - `PUT /settings` : fusionne le corps sur la config courante, valide/borne et persiste.
 */
export function createSettingsRouter(logger: Logger): Router {
  const router = Router();

  router.get('/settings', (_req, res, next) => {
    try {
      res.json(readSettings());
    } catch (err) {
      next(err);
    }
  });

  router.put('/settings', (req, res, next) => {
    try {
      // Verrou global optionnel : lecture seule partout.
      if (process.env.READ_ONLY === 'true') {
        return res.status(403).json({ error: 'Modification désactivée (mode lecture seule).' });
      }
      // Sinon, écriture réservée au réseau local : les requêtes passées par le reverse proxy
      // portent l'IP publique réelle du client (`trust proxy`) → refusées.
      if (!isPrivateIp(req.ip)) {
        return res.status(403).json({ error: 'Modification possible uniquement depuis le réseau local.' });
      }

      const current = readSettings();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const merged = {
        ...current,
        ...body,
        navihan: { ...current.navihan, ...(body.navihan ?? {}) }
      };
      const saved = writeSettings(merged);
      logger.info('Configuration mise à jour');
      res.json(saved);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
