import { Router } from 'express';
import { Logger } from 'pino';
import { fetchWeather } from '../service/weather';

// Zone par défaut : Port-Tudy / île de Groix (station de référence des marées).
const DEFAULT_LAT = 47.638;
const DEFAULT_LON = -3.445;

/**
 * Routeur météo, monté sous `/api` :
 * - `GET /weather?lat&lon&days` → météo Open-Meteo (actuel + quotidien + marine).
 *   Sans `lat`/`lon`, utilise la zone de Port-Tudy (Groix). 400 si coordonnées invalides.
 */
export function createWeatherRouter(logger: Logger): Router {
  const router = Router();

  router.get('/weather', async (req, res, next) => {
    try {
      const lat = req.query.lat != null ? Number(req.query.lat) : DEFAULT_LAT;
      const lon = req.query.lon != null ? Number(req.query.lon) : DEFAULT_LON;
      const daysRaw = req.query.days != null ? Number(req.query.days) : 3;

      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({ error: 'Paramètre "lat" invalide (−90..90).' });
      }
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        return res.status(400).json({ error: 'Paramètre "lon" invalide (−180..180).' });
      }
      const days = Number.isFinite(daysRaw) ? Math.min(16, Math.max(1, Math.round(daysRaw))) : 3;

      const data = await fetchWeather(lat, lon, days);
      res.json(data);
    } catch (err) {
      logger.error({ err }, 'Échec de récupération météo');
      next(err);
    }
  });

  return router;
}
