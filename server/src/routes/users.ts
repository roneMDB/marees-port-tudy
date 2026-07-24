import { Router } from 'express';
import { Logger } from 'pino';
import { getDb } from '../db';
import { listUsers } from '../db/usersRepository';
import { requestRole, requestUser } from '../middleware/auth';
import {
  UserError,
  changeOwnPassword,
  createUserAccount,
  deleteUserAccount,
  updateUserAccount
} from '../service/UsersStore';

/** Horodatage ISO courant (isolé pour la lisibilité ; l'horloge n'est pas figée en prod). */
function now(): string {
  return new Date().toISOString();
}

/** Envoie une `UserError` (statut + message) ou délègue au gestionnaire d'erreurs central (500). */
function handle(err: unknown, res: import('express').Response, next: import('express').NextFunction): void {
  if (err instanceof UserError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  next(err as Error);
}

/**
 * Routeur de gestion des utilisateurs (monté sous `/api`) :
 * - `GET/POST /users`, `PUT/DELETE /users/:id` → **réservés au rôle `admin`** (403 sinon).
 * - `PUT /users/me/password` → changement de son propre mot de passe (tout utilisateur authentifié).
 */
export function createUsersRouter(logger: Logger): Router {
  const router = Router();

  /** Garde admin partagé par les opérations CRUD. */
  function requireAdmin(req: import('express').Request, res: import('express').Response): boolean {
    if (requestRole(req) !== 'admin') {
      res.status(403).json({ error: 'Gestion des utilisateurs réservée au rôle administrateur.' });
      return false;
    }
    return true;
  }

  router.get('/users', (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      res.json(listUsers(getDb()));
    } catch (err) {
      next(err);
    }
  });

  router.post('/users', async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const body = req.body ?? {};
      const user = await createUserAccount(getDb(), body, now());
      logger.info({ login: user.login, role: user.role }, 'Utilisateur créé');
      res.status(201).json(user);
    } catch (err) {
      handle(err, res, next);
    }
  });

  router.put('/users/me/password', async (req, res, next) => {
    try {
      const current = requestUser(req);
      if (!current) return res.status(401).json({ error: 'Authentification requise.' });
      const { currentPassword, newPassword } = req.body ?? {};
      await changeOwnPassword(getDb(), current.id, String(currentPassword ?? ''), String(newPassword ?? ''), now());
      res.json({ ok: true });
    } catch (err) {
      handle(err, res, next);
    }
  });

  router.put('/users/:id', async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
      const user = await updateUserAccount(getDb(), id, req.body ?? {}, now());
      logger.info({ id, role: user.role }, 'Utilisateur mis à jour');
      res.json(user);
    } catch (err) {
      handle(err, res, next);
    }
  });

  router.delete('/users/:id', async (req, res, next) => {
    try {
      if (!requireAdmin(req, res)) return;
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
      await deleteUserAccount(getDb(), id);
      logger.info({ id }, 'Utilisateur supprimé');
      res.status(204).end();
    } catch (err) {
      handle(err, res, next);
    }
  });

  return router;
}
