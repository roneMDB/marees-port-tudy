import { Router } from 'express';
import { Logger } from 'pino';
import { getDb } from '../db';
import {
  deleteObservation,
  getObservations,
  upsertObservation
} from '../db/aflotObservationsRepository';
import { requestRole } from '../middleware/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidKey(body: Record<string, unknown>): boolean {
  return typeof body.date === 'string' && DATE_RE.test(body.date)
    && typeof body.time === 'string' && TIME_RE.test(body.time);
}

/**
 * Routeur des **heures de remise à flot constatées** (issue #4), monté sous `/api` :
 * - `GET /aflot-observations` : liste (lecture ouverte, comme les horaires).
 * - `PUT /aflot-observations` `{ date, time, observed }` : enregistre/écrase (**admin**).
 * - `DELETE /aflot-observations` `{ date, time }` : supprime (**admin**).
 * `date`/`time` identifient la basse mer **Port-Tudy** ; `observed` = heure réelle (HH:MM).
 */
export function createAflotObservationsRouter(logger: Logger): Router {
  const router = Router();

  router.get('/aflot-observations', (_req, res, next) => {
    try {
      res.json(getObservations(getDb()));
    } catch (err) {
      next(err);
    }
  });

  router.put('/aflot-observations', (req, res, next) => {
    try {
      if (requestRole(req) !== 'admin') {
        return res.status(403).json({ error: 'Modification réservée au rôle administrateur.' });
      }
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      if (!isValidKey(body) || typeof body.observed !== 'string' || !TIME_RE.test(body.observed)) {
        return res.status(400).json({ error: 'date (YYYY-MM-DD), time et observed (HH:MM) requis.' });
      }
      const obs = { date: body.date as string, time: body.time as string, observed: body.observed as string };
      upsertObservation(getDb(), obs);
      logger.info({ date: obs.date, time: obs.time }, 'Remise à flot constatée enregistrée');
      res.json(obs);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/aflot-observations', (req, res, next) => {
    try {
      if (requestRole(req) !== 'admin') {
        return res.status(403).json({ error: 'Modification réservée au rôle administrateur.' });
      }
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      if (!isValidKey(body)) {
        return res.status(400).json({ error: 'date (YYYY-MM-DD) et time (HH:MM) requis.' });
      }
      deleteObservation(getDb(), body.date as string, body.time as string);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
