import { afterEach, describe, expect, it } from 'vitest';
import { openDb } from '../db';
import {
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  changeOwnPassword,
  ensureAdminUser
} from './UsersStore';
import { getUserById, getUserByLogin, countUsers } from '../db/usersRepository';
import { verifyPassword } from '../lib/password';

const NOW = '2026-07-24T10:00:00.000Z';

afterEach(() => {
  delete process.env.ADMIN_USER;
  delete process.env.ADMIN_PASSWORD;
});

describe('service/UsersStore', () => {
  it('crée un compte (rôle lecteur par défaut) et hache le mot de passe', async () => {
    const db = openDb(':memory:');
    const user = await createUserAccount(db, { login: 'alice', password: 'longenough' }, NOW);
    expect(user).toMatchObject({ login: 'alice', role: 'viewer' });
    const stored = getUserByLogin(db, 'alice')!;
    expect(stored.passwordHash).not.toBe('longenough');
    expect(await verifyPassword(stored.passwordHash, 'longenough')).toBe(true);
    db.close();
  });

  it('rejette un login vide ou un mot de passe trop court (400)', async () => {
    const db = openDb(':memory:');
    await expect(createUserAccount(db, { login: '  ', password: 'longenough' }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(createUserAccount(db, { login: 'bob', password: 'x' }, NOW)).rejects.toMatchObject({ status: 400 });
    db.close();
  });

  it('rejette un login déjà pris (409)', async () => {
    const db = openDb(':memory:');
    await createUserAccount(db, { login: 'dup', password: 'longenough' }, NOW);
    await expect(createUserAccount(db, { login: 'DUP', password: 'longenough' }, NOW)).rejects.toMatchObject({ status: 409 });
    db.close();
  });

  it('empêche de rétrograder le dernier admin (409)', async () => {
    const db = openDb(':memory:');
    const admin = await createUserAccount(db, { login: 'admin', password: 'longenough', role: 'admin' }, NOW);
    await expect(updateUserAccount(db, admin.id, { role: 'viewer' }, NOW)).rejects.toMatchObject({ status: 409 });
    db.close();
  });

  it('empêche de supprimer le dernier admin (409)', async () => {
    const db = openDb(':memory:');
    const admin = await createUserAccount(db, { login: 'admin', password: 'longenough', role: 'admin' }, NOW);
    await expect(deleteUserAccount(db, admin.id)).rejects.toMatchObject({ status: 409 });
    // Avec un second admin, la suppression est permise.
    await createUserAccount(db, { login: 'admin2', password: 'longenough', role: 'admin' }, NOW);
    await expect(deleteUserAccount(db, admin.id)).resolves.toBeUndefined();
    db.close();
  });

  it('change le mot de passe propre (mauvais actuel → 403, sinon efface must_change)', async () => {
    const db = openDb(':memory:');
    const u = await createUserAccount(db, { login: 'carol', password: 'oldpassword', role: 'viewer' }, NOW);
    // Force must_change pour vérifier qu'il est effacé.
    await updateUserAccount(db, u.id, { mustChange: true }, NOW);
    await expect(changeOwnPassword(db, u.id, 'wrong', 'newpassword', NOW)).rejects.toMatchObject({ status: 403 });
    await changeOwnPassword(db, u.id, 'oldpassword', 'newpassword', NOW);
    const stored = getUserById(db, u.id)!;
    expect(await verifyPassword(stored.passwordHash, 'newpassword')).toBe(true);
    expect(stored.mustChangePassword).toBe(false);
    db.close();
  });

  it('ensureAdminUser seed admin/admin (must_change) sans env, idempotent', async () => {
    const db = openDb(':memory:');
    await ensureAdminUser(db, NOW);
    const admin = getUserByLogin(db, 'admin')!;
    expect(admin.role).toBe('admin');
    expect(admin.mustChangePassword).toBe(true);
    expect(await verifyPassword(admin.passwordHash, 'admin')).toBe(true);
    // Idempotent : deuxième appel ne recrée rien.
    await ensureAdminUser(db, NOW);
    expect(countUsers(db)).toBe(1);
    db.close();
  });

  it('ensureAdminUser seed depuis ADMIN_USER/ADMIN_PASSWORD (sans must_change)', async () => {
    process.env.ADMIN_USER = 'patron';
    process.env.ADMIN_PASSWORD = 'supersecret';
    const db = openDb(':memory:');
    await ensureAdminUser(db, NOW);
    const admin = getUserByLogin(db, 'patron')!;
    expect(admin.role).toBe('admin');
    expect(admin.mustChangePassword).toBe(false);
    expect(await verifyPassword(admin.passwordHash, 'supersecret')).toBe(true);
    db.close();
  });
});
