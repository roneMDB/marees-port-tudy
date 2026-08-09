import { afterEach, describe, expect, it } from 'vitest';
import type { Request } from 'express';
import { openDb } from '../db';
import { createUser } from '../db/usersRepository';
import { SESSION_COOKIE, signSession } from '../lib/session';
import { recordAccess, readAccessEntries } from './accessLog';

function fakeReq(ip: string, ua = 'TestAgent', cookie?: string): Request {
  return { ip, headers: { 'user-agent': ua, ...(cookie ? { cookie } : {}) } } as unknown as Request;
}

afterEach(() => {
  delete process.env.APP_PASSWORD;
  delete process.env.SESSION_SECRET;
});

describe('middleware/accessLog — login', () => {
  it('enregistre le login fourni (connexion) et le relit', () => {
    const db = openDb(':memory:');
    recordAccess(fakeReq('192.168.1.5'), db, { kind: 'login', login: 'admin' });
    const entries = readAccessEntries(db);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ scope: 'lan', login: 'admin', kind: 'login' });
    db.close();
  });

  it('login null par défaut (ouverture de page anonyme, auth désactivée)', () => {
    const db = openDb(':memory:');
    recordAccess(fakeReq('192.168.1.5'), db);
    expect(readAccessEntries(db)[0].login).toBeNull();
    db.close();
  });

  it("résout le login depuis le cookie de session quand il n'est pas fourni", () => {
    process.env.APP_PASSWORD = 'x'; // active l'authentification
    process.env.SESSION_SECRET = 'secret-de-test'; // évite de dépendre de la base singleton
    const db = openDb(':memory:');
    const user = createUser(db, { login: 'erwan', passwordHash: 'h', role: 'viewer' }, 't');
    const token = signSession(user.id, 60_000, Date.now());

    recordAccess(fakeReq('192.168.1.5', 'TestAgent', `${SESSION_COOKIE}=${token}`), db, { kind: 'visit' });

    expect(readAccessEntries(db)[0]).toMatchObject({ login: 'erwan', kind: 'visit' });
    db.close();
  });

  it("n'attribue pas l'utilisateur de développement quand l'authentification est désactivée", () => {
    // `requestUser` renvoie un admin synthétique `dev` hors auth : il ne doit pas polluer les stats.
    const db = openDb(':memory:');
    recordAccess(fakeReq('192.168.1.5', 'TestAgent', `${SESSION_COOKIE}=peu-importe`), db, { kind: 'visit' });
    expect(readAccessEntries(db)[0].login).toBeNull();
    db.close();
  });
});

describe('middleware/accessLog — nature de l’accès (kind)', () => {
  it('vaut `page` par défaut', () => {
    const db = openDb(':memory:');
    recordAccess(fakeReq('192.168.1.5'), db);
    expect(readAccessEntries(db)[0].kind).toBe('page');
    db.close();
  });

  it('relit les lignes antérieures à la v6 (kind NULL) comme `page`', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO access_log (ts, scope, ip, country, ua, login, kind) VALUES ('2026-08-09T10:00:00.000Z', 'lan', '192.168.x.x', NULL, 'UA', NULL, NULL)").run();
    expect(readAccessEntries(db)[0].kind).toBe('page');
    db.close();
  });
});

describe('middleware/accessLog — lecture bornée', () => {
  it('ne renvoie que les entrées postérieures à la borne', () => {
    const db = openDb(':memory:');
    const insert = db.prepare(
      "INSERT INTO access_log (ts, scope, ip, country, ua, login, kind) VALUES (?, 'lan', '192.168.x.x', NULL, 'UA', NULL, 'visit')"
    );
    insert.run('2026-08-01T10:00:00.000Z');
    insert.run('2026-08-08T10:00:00.000Z');

    const entries = readAccessEntries(db, '2026-08-05T00:00:00.000Z');
    expect(entries.map(e => e.ts)).toEqual(['2026-08-08T10:00:00.000Z']);
    db.close();
  });
});
