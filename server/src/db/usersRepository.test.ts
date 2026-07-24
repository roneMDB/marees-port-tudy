import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  createUser,
  getUserById,
  getUserByLogin,
  listUsers,
  updateUser,
  deleteUser,
  countUsers,
  countAdmins,
  getOrCreateSessionSecret
} from './usersRepository';

const NOW = '2026-07-24T10:00:00.000Z';

describe('usersRepository', () => {
  it('crée un utilisateur et le relit (sans exposer le hash dans la liste)', () => {
    const db = openDb(':memory:');
    const created = createUser(db, { login: 'alice', passwordHash: 'h1', role: 'viewer' }, NOW);
    expect(created).toMatchObject({ id: 1, login: 'alice', role: 'viewer', mustChangePassword: false });
    expect(created).not.toHaveProperty('passwordHash'); // création = objet public, sans hash

    const list = listUsers(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 1, login: 'alice', role: 'viewer' });
    expect(list[0]).not.toHaveProperty('passwordHash');
    db.close();
  });

  it('getUserByLogin renvoie le hash pour la vérification du mot de passe (insensible à la casse)', () => {
    const db = openDb(':memory:');
    createUser(db, { login: 'Bob', passwordHash: 'secret-hash', role: 'admin' }, NOW);
    const found = getUserByLogin(db, 'bob');
    expect(found).toMatchObject({ login: 'Bob', role: 'admin', passwordHash: 'secret-hash' });
    expect(getUserByLogin(db, 'absent')).toBeUndefined();
    db.close();
  });

  it('getUserById renvoie l’utilisateur avec hash, ou undefined', () => {
    const db = openDb(':memory:');
    const { id } = createUser(db, { login: 'carol', passwordHash: 'h', role: 'viewer' }, NOW);
    expect(getUserById(db, id)?.login).toBe('carol');
    expect(getUserById(db, 999)).toBeUndefined();
    db.close();
  });

  it('refuse un login dupliqué (casse comprise)', () => {
    const db = openDb(':memory:');
    createUser(db, { login: 'dave', passwordHash: 'h', role: 'viewer' }, NOW);
    expect(() => createUser(db, { login: 'DAVE', passwordHash: 'h', role: 'admin' }, NOW)).toThrow();
    db.close();
  });

  it('met à jour rôle et/ou hash et met à jour updated_at', () => {
    const db = openDb(':memory:');
    const { id } = createUser(db, { login: 'erin', passwordHash: 'old', role: 'viewer', mustChange: true }, NOW);
    const updated = updateUser(db, id, { role: 'admin', passwordHash: 'new', mustChange: false }, '2026-07-25T00:00:00.000Z');
    expect(updated).toMatchObject({ id, role: 'admin', mustChangePassword: false });
    expect(getUserById(db, id)?.passwordHash).toBe('new');
    expect(updateUser(db, 999, { role: 'admin' }, NOW)).toBeUndefined();
    db.close();
  });

  it('supprime un utilisateur', () => {
    const db = openDb(':memory:');
    const { id } = createUser(db, { login: 'frank', passwordHash: 'h', role: 'viewer' }, NOW);
    expect(deleteUser(db, id)).toBe(true);
    expect(getUserById(db, id)).toBeUndefined();
    expect(deleteUser(db, id)).toBe(false);
    db.close();
  });

  it('compte les utilisateurs et les admins', () => {
    const db = openDb(':memory:');
    createUser(db, { login: 'a', passwordHash: 'h', role: 'admin' }, NOW);
    createUser(db, { login: 'b', passwordHash: 'h', role: 'viewer' }, NOW);
    createUser(db, { login: 'c', passwordHash: 'h', role: 'admin' }, NOW);
    expect(countUsers(db)).toBe(3);
    expect(countAdmins(db)).toBe(2);
    db.close();
  });

  it('getOrCreateSessionSecret génère puis réutilise le même secret', () => {
    const db = openDb(':memory:');
    const s1 = getOrCreateSessionSecret(db);
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    const s2 = getOrCreateSessionSecret(db);
    expect(s2).toBe(s1);
    db.close();
  });
});
