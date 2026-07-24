import { getDb, type DB } from '../db';
import type { Role } from '../lib/session';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  countAdmins,
  countUsers,
  createUser,
  deleteUser,
  getUserById,
  updateUser,
  type User
} from '../db/usersRepository';

/** Erreur métier portant un statut HTTP, mappée par les routes (`res.status(e.status)`). */
export class UserError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'UserError';
  }
}

const ROLES: readonly Role[] = ['viewer', 'admin'];
const MIN_PASSWORD_LEN = 6;
const MAX_LOGIN_LEN = 40;

/** Normalise/valide un login : chaîne non vide, sans espaces superflus, bornée. Lève 400 sinon. */
function cleanLogin(input: unknown): string {
  const login = typeof input === 'string' ? input.trim() : '';
  if (!login) throw new UserError(400, 'Identifiant requis.');
  if (login.length > MAX_LOGIN_LEN) throw new UserError(400, `Identifiant trop long (max ${MAX_LOGIN_LEN}).`);
  return login;
}

/** Valide un mot de passe (longueur minimale). Lève 400 sinon. */
function cleanPassword(input: unknown): string {
  const password = typeof input === 'string' ? input : '';
  if (password.length < MIN_PASSWORD_LEN) {
    throw new UserError(400, `Mot de passe trop court (min ${MIN_PASSWORD_LEN} caractères).`);
  }
  return password;
}

/** Valide un rôle ; `undefined` → défaut `viewer` (lecteur). Lève 400 sur rôle inconnu. */
function cleanRole(input: unknown, fallback: Role = 'viewer'): Role {
  if (input === undefined || input === null) return fallback;
  if (typeof input !== 'string' || !ROLES.includes(input as Role)) {
    throw new UserError(400, 'Rôle invalide.');
  }
  return input as Role;
}

/** Vrai si `login` est une contrainte d'unicité SQLite violée. */
function isUniqueViolation(e: unknown): boolean {
  return typeof (e as { code?: string })?.code === 'string' &&
    (e as { code: string }).code.startsWith('SQLITE_CONSTRAINT');
}

export interface CreateUserInput {
  login: unknown;
  password: unknown;
  role?: unknown;
}

/** Crée un compte : valide, hache le mot de passe, insère. 409 si le login est déjà pris. */
export async function createUserAccount(db: DB, input: CreateUserInput, now: string): Promise<User> {
  const login = cleanLogin(input.login);
  const password = cleanPassword(input.password);
  const role = cleanRole(input.role);
  const passwordHash = await hashPassword(password);
  try {
    return createUser(db, { login, passwordHash, role }, now);
  } catch (e) {
    if (isUniqueViolation(e)) throw new UserError(409, 'Cet identifiant est déjà utilisé.');
    throw e;
  }
}

export interface UpdateUserInput {
  role?: unknown;
  password?: unknown;
  mustChange?: boolean;
}

/**
 * Met à jour un compte (rôle et/ou mot de passe). Empêche de retirer le **dernier admin**.
 * 404 si l'utilisateur n'existe pas.
 */
export async function updateUserAccount(db: DB, id: number, input: UpdateUserInput, now: string): Promise<User> {
  const current = getUserById(db, id);
  if (!current) throw new UserError(404, 'Utilisateur introuvable.');

  const patch: { role?: Role; passwordHash?: string; mustChange?: boolean } = {};
  if (input.role !== undefined) {
    const role = cleanRole(input.role);
    if (current.role === 'admin' && role !== 'admin' && countAdmins(db) <= 1) {
      throw new UserError(409, 'Impossible de retirer le dernier administrateur.');
    }
    patch.role = role;
  }
  if (input.password !== undefined) {
    patch.passwordHash = await hashPassword(cleanPassword(input.password));
  }
  if (input.mustChange !== undefined) patch.mustChange = input.mustChange;

  return updateUser(db, id, patch, now)!;
}

/** Supprime un compte. Empêche de supprimer le **dernier admin**. 404 si inexistant. */
export async function deleteUserAccount(db: DB, id: number): Promise<void> {
  const current = getUserById(db, id);
  if (!current) throw new UserError(404, 'Utilisateur introuvable.');
  if (current.role === 'admin' && countAdmins(db) <= 1) {
    throw new UserError(409, 'Impossible de supprimer le dernier administrateur.');
  }
  deleteUser(db, id);
}

/**
 * Change le mot de passe de son propre compte : vérifie l'ancien (403 si faux), valide et hache le
 * nouveau, efface l'indicateur `must_change_password`. 404 si l'utilisateur n'existe pas.
 */
export async function changeOwnPassword(db: DB, id: number, current: string, next: string, now: string): Promise<void> {
  const user = getUserById(db, id);
  if (!user) throw new UserError(404, 'Utilisateur introuvable.');
  if (!(await verifyPassword(user.passwordHash, current))) {
    throw new UserError(403, 'Mot de passe actuel incorrect.');
  }
  const passwordHash = await hashPassword(cleanPassword(next));
  updateUser(db, id, { passwordHash, mustChange: false }, now);
}

/**
 * Amorce le premier administrateur si la table `users` est vide. Utilise
 * `ADMIN_USER`/`ADMIN_PASSWORD` s'ils sont renseignés (continuité des déploiements) ; sinon
 * `admin`/`admin` avec obligation de changer le mot de passe. Idempotent.
 */
export async function ensureAdminUser(db: DB = getDb(), now: string): Promise<void> {
  if (countUsers(db) > 0) return;
  const envUser = (process.env.ADMIN_USER || '').trim();
  const envPassword = process.env.ADMIN_PASSWORD || '';
  const login = envUser || 'admin';
  const password = envPassword || 'admin';
  const mustChange = envPassword.length === 0; // défaut admin/admin → changement forcé
  const passwordHash = await hashPassword(password);
  createUser(db, { login, passwordHash, role: 'admin', mustChange }, now);
}
