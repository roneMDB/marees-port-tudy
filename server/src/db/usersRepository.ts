import { randomBytes } from 'crypto';
import type { DB } from './index';
import type { Role } from '../lib/session';

/** Utilisateur exposé (sans le hash de mot de passe). */
export interface User {
  id: number;
  login: string;
  role: Role;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Utilisateur avec le hash de mot de passe (usage interne : login, réinitialisation). */
export interface UserWithHash extends User {
  passwordHash: string;
}

interface UserRow {
  id: number;
  login: string;
  password_hash: string;
  role: string;
  must_change_password: number;
  created_at: string;
  updated_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    login: row.login,
    role: row.role as Role,
    mustChangePassword: row.must_change_password === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toUserWithHash(row: UserRow): UserWithHash {
  return { ...toUser(row), passwordHash: row.password_hash };
}

/** Liste les utilisateurs (sans hash), triés par login. */
export function listUsers(db: DB): User[] {
  const rows = db
    .prepare('SELECT * FROM users ORDER BY login COLLATE NOCASE')
    .all() as UserRow[];
  return rows.map(toUser);
}

/** Utilisateur par identifiant (avec hash), ou `undefined`. */
export function getUserById(db: DB, id: number): UserWithHash | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toUserWithHash(row) : undefined;
}

/** Utilisateur par login (insensible à la casse, avec hash), ou `undefined`. */
export function getUserByLogin(db: DB, login: string): UserWithHash | undefined {
  const row = db
    .prepare('SELECT * FROM users WHERE login = ? COLLATE NOCASE')
    .get(login) as UserRow | undefined;
  return row ? toUserWithHash(row) : undefined;
}

export interface NewUser {
  login: string;
  passwordHash: string;
  role: Role;
  mustChange?: boolean;
}

/** Crée un utilisateur. Lève si le login existe déjà (contrainte `UNIQUE COLLATE NOCASE`). */
export function createUser(db: DB, user: NewUser, now: string): User {
  const info = db
    .prepare(
      `INSERT INTO users (login, password_hash, role, must_change_password, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(user.login, user.passwordHash, user.role, user.mustChange ? 1 : 0, now, now);
  const { passwordHash, ...pub } = getUserById(db, Number(info.lastInsertRowid))!;
  return pub; // objet public : ne jamais exposer le hash aux appelants (routes)
}

export interface UserPatch {
  role?: Role;
  passwordHash?: string;
  mustChange?: boolean;
}

/** Met à jour les champs fournis d'un utilisateur (+ `updated_at`). `undefined` si absent. */
export function updateUser(db: DB, id: number, patch: UserPatch, now: string): User | undefined {
  const current = getUserById(db, id);
  if (!current) return undefined;
  const role = patch.role ?? current.role;
  const passwordHash = patch.passwordHash ?? current.passwordHash;
  const mustChange = patch.mustChange ?? current.mustChangePassword;
  db.prepare(
    'UPDATE users SET role = ?, password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?'
  ).run(role, passwordHash, mustChange ? 1 : 0, now, id);
  const updated = getUserById(db, id);
  if (!updated) return undefined;
  const { passwordHash: _hash, ...pub } = updated;
  return pub; // objet public : sans hash
}

/** Supprime un utilisateur. Renvoie `true` si une ligne a été supprimée. */
export function deleteUser(db: DB, id: number): boolean {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id).changes > 0;
}

/** Nombre total d'utilisateurs. */
export function countUsers(db: DB): number {
  return (db.prepare('SELECT count(*) AS c FROM users').get() as { c: number }).c;
}

/** Nombre d'utilisateurs de rôle `admin` (garde-fou « dernier admin »). */
export function countAdmins(db: DB): number {
  return (db.prepare("SELECT count(*) AS c FROM users WHERE role = 'admin'").get() as { c: number }).c;
}

/**
 * Renvoie le secret de session persisté (ligne unique `app_secret.id = 1`), en le générant
 * (32 octets aléatoires en hex) au premier appel. Découple le secret du mot de passe admin.
 */
export function getOrCreateSessionSecret(db: DB): string {
  const row = db.prepare('SELECT value FROM app_secret WHERE id = 1').get() as { value: string } | undefined;
  if (row) return row.value;
  const value = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO app_secret (id, value) VALUES (1, ?) ON CONFLICT(id) DO NOTHING').run(value);
  // Relit : en cas de course, la valeur retenue est celle réellement insérée.
  return (db.prepare('SELECT value FROM app_secret WHERE id = 1').get() as { value: string }).value;
}
