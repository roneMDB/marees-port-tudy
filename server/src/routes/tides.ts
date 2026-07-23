import { Router } from 'express';
import { Logger } from 'pino';
import Maree from '../service/Maree';
import { getDb } from '../db';
import { getSiteData, mergeSiteData, replaceSiteData } from '../db/tidesRepository';
import { sanitizeImport } from '../lib/tidesImport';
import { requestRole } from '../middleware/auth';
import { SITES, DEFAULT_SITE_ID, getSite } from '../config/sites';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Routeur des marées, monté sous `/api` :
 * - `GET /health` : sonde de vie.
 * - `GET /sites` : liste des ports disponibles (`{ id, label }`).
 * - `GET /tides/meta?site=` : bornes de dates disponibles + offsets Navihan (site par défaut si absent).
 * - `GET /tides?site=&from=&to=` : marées d'un site sur une plage inclusive
 *   (sans plage → toute la plage disponible). 400 si dates malformées, `from > to`, ou site inconnu.
 */
export function createTidesRouter(logger: Logger): Router {
  const router = Router();

  // Une instance `Maree` par site (mémoïsée). Les horaires sont lus depuis la base à chaque appel
  // via le repository, donc une édition runtime (Phase 2) est prise en compte sans redémarrage.
  const mareeBySite = new Map<string, Maree>();
  function mareeForSite(siteId: string): Maree {
    let maree = mareeBySite.get(siteId);
    if (!maree) {
      const site = getSite(siteId)!; // l'appelant a déjà validé le site
      maree = new Maree(logger, {
        siteId: site.id,
        timezone: site.timezone,
        load: () => getSiteData(getDb(), site.id)
      });
      mareeBySite.set(siteId, maree);
    }
    return maree;
  }

  /** Résout le paramètre `site` (défaut = site historique) ; `null` si explicitement inconnu. */
  function resolveSiteId(raw: unknown): string | null {
    if (raw === undefined) return DEFAULT_SITE_ID;
    const id = String(raw);
    return getSite(id) ? id : null;
  }

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/sites', (_req, res) => {
    res.json(SITES.map(({ id, label }) => ({ id, label })));
  });

  router.get('/tides/meta', (req, res, next) => {
    try {
      const siteId = resolveSiteId(req.query.site);
      if (!siteId) {
        return res.status(400).json({ error: 'Paramètre "site" invalide : port inconnu.' });
      }
      res.json(mareeForSite(siteId).getMeta());
    } catch (err) {
      next(err);
    }
  });

  router.get('/tides', async (req, res, next) => {
    try {
      const siteId = resolveSiteId(req.query.site);
      if (!siteId) {
        return res.status(400).json({ error: 'Paramètre "site" invalide : port inconnu.' });
      }

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

      const data = await mareeForSite(siteId).getTidesRange(from, to);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Import en lot des horaires d'un site (réservé au rôle admin). Reflété immédiatement par
  // `GET /tides` (Maree relit la base à chaque requête → pas d'invalidation de cache nécessaire).
  router.post('/tides/import', (req, res, next) => {
    try {
      if (requestRole(req) !== 'admin') {
        return res.status(403).json({ error: 'Import réservé au rôle administrateur.' });
      }
      const siteId = resolveSiteId(req.query.site);
      if (!siteId) {
        return res.status(400).json({ error: 'Paramètre "site" invalide : port inconnu.' });
      }
      const mode = req.query.mode === 'replace' ? 'replace' : 'merge';

      const data = sanitizeImport(req.body);
      const dates = Object.keys(data).length;
      if (dates === 0) {
        return res.status(400).json({ error: 'Aucune marée valide à importer.' });
      }

      const db = getDb();
      if (mode === 'replace') replaceSiteData(db, siteId, data);
      else mergeSiteData(db, siteId, data);

      const entries = Object.values(data).reduce((n, arr) => n + arr.length, 0);
      logger.info(`Import horaires « ${siteId} » (${mode}) : ${dates} jours, ${entries} marées`);
      res.json({ ok: true, site: siteId, mode, dates, entries });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
