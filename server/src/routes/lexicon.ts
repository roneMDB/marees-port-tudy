import { Router } from 'express';
import { Logger } from 'pino';
import { getDb } from '../db';
import {
  addEntry,
  deleteEntry,
  getLexicon,
  resetLexicon,
  updateEntry,
  type LexiconInput
} from '../db/lexiconRepository';
import { LEXICON_SEED } from '../service/lexiconSeed';
import { requestRole } from '../middleware/auth';

const MAX_TERM = 60;
const MAX_DEF = 400;

/** Valide/normalise le corps d'une entrée ; `null` si invalide. */
function parseInput(body: unknown): LexiconInput | null {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const term = typeof o.term === 'string' ? o.term.trim() : '';
  const definition = typeof o.definition === 'string' ? o.definition.trim() : '';
  const type = o.type === 'maree' || o.type === 'peche' ? o.type : null;
  if (!term || term.length > MAX_TERM || !definition || definition.length > MAX_DEF || !type) return null;
  return { term, definition, type };
}

/**
 * Routeur du **lexique du mot du jour** (issue #4 suite), monté sous `/api` :
 * - `GET /lexicon` : liste ordonnée (lecture ouverte).
 * - `POST /lexicon` `{ term, definition, type }` : ajoute (**admin**, 201) ; id slug généré.
 * - `PUT /lexicon/:id` : met à jour (**admin**, 200 / 404).
 * - `DELETE /lexicon/:id` : supprime (**admin**, 204 / 404).
 * - `POST /lexicon/reset` : rétablit les termes par défaut (**admin**, 200 → liste).
 */
export function createLexiconRouter(logger: Logger): Router {
  const router = Router();
  const isAdmin = (req: import('express').Request) => requestRole(req) === 'admin';
  const forbid = (res: import('express').Response) =>
    res.status(403).json({ error: 'Modification réservée au rôle administrateur.' });

  router.get('/lexicon', (_req, res, next) => {
    try {
      res.json(getLexicon(getDb()));
    } catch (err) {
      next(err);
    }
  });

  router.post('/lexicon', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const input = parseInput(req.body);
      if (!input) return res.status(400).json({ error: 'term, definition et type (maree|peche) requis.' });
      const entry = addEntry(getDb(), input);
      logger.info({ id: entry.id }, 'Terme de lexique ajouté');
      res.status(201).json(entry);
    } catch (err) {
      next(err);
    }
  });

  router.put('/lexicon/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const input = parseInput(req.body);
      if (!input) return res.status(400).json({ error: 'term, definition et type (maree|peche) requis.' });
      const entry = updateEntry(getDb(), req.params.id, input);
      if (!entry) return res.status(404).json({ error: 'Terme introuvable.' });
      res.json(entry);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/lexicon/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      if (!deleteEntry(getDb(), req.params.id)) return res.status(404).json({ error: 'Terme introuvable.' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/lexicon/reset', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      resetLexicon(getDb(), LEXICON_SEED);
      logger.info('Lexique rétabli aux termes par défaut');
      res.json(getLexicon(getDb()));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
