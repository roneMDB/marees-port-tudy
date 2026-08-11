import { Router, type Request, type Response } from 'express';
import { Logger } from 'pino';
import { getDb } from '../db';
import {
  createTrip,
  deleteTrip,
  listTrips,
  updateTrip,
  type FishingCatch,
  type FishingTripInput
} from '../db/fishingRepository';
import {
  addRef,
  deleteRef,
  getRefs,
  refExists,
  reorderRefs,
  resetFishingRefs,
  updateRef,
  type FishingRefKind
} from '../db/fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';
import { captureTripWeather } from '../service/fishingWeather';
import { requestRole } from '../middleware/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const MAX_NOTES = 1000;
const MAX_CATCHES = 50;
const MAX_LABEL = 60;

/** Heure `HH:MM` ou `null` ; `undefined` est traité comme absent. `false` = invalide. */
function optionalTime(value: unknown): string | null | false {
  if (value == null || value === '') return null;
  return typeof value === 'string' && TIME_RE.test(value) ? value : false;
}

/** Nombre optionnel borné ; `null` si absent, `false` si invalide. */
function optionalNumber(value: unknown, min: number, max: number): number | null | false {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : false;
}

/** Valide une ligne de prise ; `null` si invalide. Les référentiels sont vérifiés en base. */
function parseCatch(raw: unknown): FishingCatch | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const speciesId = typeof o.speciesId === 'string' ? o.speciesId : '';
  const gearId = typeof o.gearId === 'string' ? o.gearId : '';
  const quantity = Number(o.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return null;
  const sizeCm = optionalNumber(o.sizeCm, 0, 300);
  const weightG = optionalNumber(o.weightG, 0, 100000);
  if (sizeCm === false || weightG === false) return null;
  const db = getDb();
  if (!refExists(db, speciesId, 'species')) return null;
  if (!refExists(db, gearId, 'gear')) return null;
  return { speciesId, gearId, quantity, sizeCm, weightG, kept: o.kept !== false };
}

/** Valide le corps d'une sortie ; `null` si invalide. */
function parseTrip(body: unknown): FishingTripInput | null {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (typeof o.date !== 'string' || !DATE_RE.test(o.date)) return null;
  const startTime = optionalTime(o.startTime);
  const endTime = optionalTime(o.endTime);
  if (startTime === false || endTime === false) return null;
  const notes = typeof o.notes === 'string' ? o.notes.trim() : '';
  if (notes.length > MAX_NOTES) return null;
  const rawCatches = Array.isArray(o.catches) ? o.catches : [];
  if (rawCatches.length > MAX_CATCHES) return null;
  const catches: FishingCatch[] = [];
  for (const raw of rawCatches) {
    const parsed = parseCatch(raw);
    if (!parsed) return null;
    catches.push(parsed);
  }
  return { date: o.date, startTime, endTime, notes: notes || null, catches };
}

/**
 * Routeur du **carnet de pêche** (issue #3), monté sous `/api`. Lecture ouverte à tout compte
 * connecté (comme les horaires), écriture réservée au rôle `admin` :
 * - `GET /fishing/trips?from&to` : sorties + prises, plage **inclusive**.
 * - `POST /fishing/trips` (**admin**) : crée ; la météo est **figée ici**, best-effort.
 * - `PUT /fishing/trips/:id` (**admin**) : remplace la sortie **et toutes ses prises** ; ne touche
 *   pas à la météo (la recapturer écraserait celle de juillet en corrigeant une note en janvier).
 * - `DELETE /fishing/trips/:id` (**admin**).
 * - `GET /fishing/refs`, `POST`/`PUT`/`DELETE /fishing/refs[/:id]`, `POST /fishing/refs/reset`,
 *   `POST /fishing/refs/reorder`.
 *   `POST`/`PUT` acceptent un `labelPlural` optionnel (le pluriel est une donnée saisie, pas une
 *   règle calculée, issue #3) ; absent ou vide, il vaut `label` (repli posé dans le repository).
 */
export function createFishingRouter(logger: Logger): Router {
  const router = Router();
  const isAdmin = (req: Request) => requestRole(req) === 'admin';
  const forbid = (res: Response) =>
    res.status(403).json({ error: 'Modification réservée au rôle administrateur.' });

  // ---------- Référentiels ----------

  router.get('/fishing/refs', (_req, res, next) => {
    try {
      res.json(getRefs(getDb()));
    } catch (err) {
      next(err);
    }
  });

  router.post('/fishing/refs', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const o = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const kind = o.kind === 'species' || o.kind === 'gear' ? (o.kind as FishingRefKind) : null;
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      const labelPlural = typeof o.labelPlural === 'string' ? o.labelPlural.trim() : '';
      if (!kind || !label || label.length > MAX_LABEL || labelPlural.length > MAX_LABEL) {
        return res.status(400).json({ error: 'kind (species|gear) et label requis.' });
      }
      res.status(201).json(addRef(getDb(), kind, label, labelPlural));
    } catch (err) {
      next(err);
    }
  });

  router.put('/fishing/refs/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const o = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      const labelPlural = typeof o.labelPlural === 'string' ? o.labelPlural.trim() : '';
      if (!label || label.length > MAX_LABEL || labelPlural.length > MAX_LABEL) {
        return res.status(400).json({ error: 'label requis.' });
      }
      const updated = updateRef(getDb(), req.params.id, label, labelPlural);
      if (!updated) return res.status(404).json({ error: 'Référentiel introuvable.' });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/fishing/refs/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const outcome = deleteRef(getDb(), req.params.id);
      if (outcome === 'missing') return res.status(404).json({ error: 'Référentiel introuvable.' });
      if (outcome === 'in-use') {
        return res
          .status(409)
          .json({ error: 'Ce référentiel est utilisé par des prises enregistrées : il ne peut pas être supprimé.' });
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/fishing/refs/reset', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      resetFishingRefs(getDb(), FISHING_REFS_SEED);
      res.json(getRefs(getDb()));
    } catch (err) {
      next(err);
    }
  });

  /**
   * Réordonne une section (les espèces entre elles, les engins entre eux). `ids` doit être
   * **exactement** l'ensemble des ids de ce `kind`, sinon 400 : une liste périmée doit échouer
   * bruyamment plutôt que d'escamoter l'entrée absente.
   *
   * ⚠️ C'est un `POST`, sur le modèle de `/reset`, et non un `PUT /fishing/refs/order` : ce dernier
   * serait capté par `PUT /fishing/refs/:id` (id = « order ») selon l'ordre de déclaration.
   */
  router.post('/fishing/refs/reorder', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const o = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const kind = o.kind === 'species' || o.kind === 'gear' ? (o.kind as FishingRefKind) : null;
      const ids = Array.isArray(o.ids) && o.ids.every(i => typeof i === 'string') ? (o.ids as string[]) : null;
      if (!kind || !ids) {
        return res.status(400).json({ error: 'kind (species|gear) et ids (tableau) requis.' });
      }
      const reordered = reorderRefs(getDb(), kind, ids);
      if (!reordered) {
        return res
          .status(400)
          .json({ error: 'La liste doit contenir exactement les identifiants de ce type.' });
      }
      res.json(reordered);
    } catch (err) {
      next(err);
    }
  });

  // ---------- Sorties ----------

  router.get('/fishing/trips', (req, res, next) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
        return res.status(400).json({ error: 'Paramètres "from"/"to" au format YYYY-MM-DD.' });
      }
      if (from && to && from > to) {
        return res.status(400).json({ error: '"from" doit précéder "to".' });
      }
      res.json(listTrips(getDb(), from, to));
    } catch (err) {
      next(err);
    }
  });

  router.post('/fishing/trips', async (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const input = parseTrip(req.body);
      if (!input) return res.status(400).json({ error: 'Sortie invalide (date, heures, notes ou prises).' });
      // Best-effort : `captureTripWeather` avale ses erreurs et renvoie `null`.
      const weather = await captureTripWeather(input.date, new Date());
      const trip = createTrip(getDb(), input, weather, new Date().toISOString());
      logger.info({ id: trip.id, date: trip.date }, 'Sortie de pêche enregistrée');
      res.status(201).json(trip);
    } catch (err) {
      next(err);
    }
  });

  router.put('/fishing/trips/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
      const input = parseTrip(req.body);
      if (!input) return res.status(400).json({ error: 'Sortie invalide (date, heures, notes ou prises).' });
      const updated = updateTrip(getDb(), id, input, new Date().toISOString());
      if (!updated) return res.status(404).json({ error: 'Sortie introuvable.' });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/fishing/trips/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
      if (!deleteTrip(getDb(), id)) return res.status(404).json({ error: 'Sortie introuvable.' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
