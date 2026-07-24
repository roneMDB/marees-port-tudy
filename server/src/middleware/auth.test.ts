import { afterEach, describe, expect, it, vi } from 'vitest';

// On espionne verifyPassword pour prouver l'égalisation du temps de réponse (anti-énumération).
const verifyPasswordMock = vi.fn();
const hashPasswordMock = vi.fn();
vi.mock('../lib/password', () => ({
  verifyPassword: (h: string, p: string) => verifyPasswordMock(h, p),
  hashPassword: (p: string) => hashPasswordMock(p)
}));

import { openDb } from '../db';
import { resolveUser } from './auth';
import { createUser } from '../db/usersRepository';

afterEach(() => {
  verifyPasswordMock.mockReset();
  hashPasswordMock.mockReset();
});

describe('middleware/auth — resolveUser', () => {
  it('login inconnu : effectue quand même une vérification argon2 (temps constant) puis renvoie null', async () => {
    const db = openDb(':memory:');
    verifyPasswordMock.mockResolvedValue(false);
    const res = await resolveUser('ghost', 'whatever', db);
    expect(res).toBeNull();
    // Une vérification est effectuée malgré l'absence d'utilisateur → pas de court-circuit temporel.
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('login connu, mauvais mot de passe : vérifie puis renvoie null', async () => {
    const db = openDb(':memory:');
    createUser(db, { login: 'alice', passwordHash: 'stored-hash', role: 'viewer' }, '2026-07-24T00:00:00Z');
    verifyPasswordMock.mockResolvedValue(false);
    const res = await resolveUser('alice', 'bad', db);
    expect(res).toBeNull();
    expect(verifyPasswordMock).toHaveBeenCalledWith('stored-hash', 'bad');
    db.close();
  });

  it('login connu, bon mot de passe : renvoie l’utilisateur', async () => {
    const db = openDb(':memory:');
    createUser(db, { login: 'bob', passwordHash: 'stored-hash', role: 'admin' }, '2026-07-24T00:00:00Z');
    verifyPasswordMock.mockResolvedValue(true);
    const res = await resolveUser('bob', 'good', db);
    expect(res).toMatchObject({ login: 'bob', role: 'admin' });
    db.close();
  });
});
