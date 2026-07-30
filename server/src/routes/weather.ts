import { Router } from 'express';
import { Logger } from 'pino';
import { fetchWeather } from '../service/weather';
// `fetchWeather(lat, lon, days, fetchImpl, extraSeaPoints)` : `undefined` laisse le `fetch` global.

// Zone par défaut : Belz (Morbihan) — lieu de consultation. Les marées restent référencées
// sur Port-Tudy (Groix), mais la météo affichée est celle de Belz.
const DEFAULT_LAT = 47.677;
const DEFAULT_LON = -3.166;

/**
 * Lieux dont on veut la **seule** température de l'eau, en plus du point principal (issue #13).
 *
 * Étel est ajouté parce que la grille marine d'Open-Meteo accroche la requête de Belz à ~4,6 km au
 * nord-est, soit dans la **haute ria** : une eau peu profonde qui chauffe plus que la sortie de
 * ria. Donner les deux évite de faire passer une température de haute ria pour celle du large.
 * Aucun aller-retour supplémentaire : Open-Meteo sert plusieurs points en une requête.
 */
const EXTRA_SEA_POINTS = [{ label: 'Étel', latitude: 47.657, longitude: -3.204 }];

/**
 * Routeur météo, monté sous `/api` :
 * - `GET /weather?lat&lon&days` → météo Open-Meteo (actuel + quotidien + marine).
 *   Sans `lat`/`lon`, utilise la zone de Belz (Morbihan). 400 si coordonnées invalides.
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

      const data = await fetchWeather(lat, lon, days, undefined, EXTRA_SEA_POINTS);
      res.json(data);
    } catch (err) {
      logger.error({ err }, 'Échec de récupération météo');
      next(err);
    }
  });

  return router;
}
