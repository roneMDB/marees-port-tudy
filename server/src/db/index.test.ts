import { describe, expect, it } from 'vitest';
import { openDb, migrate } from './index';

describe('db migrations', () => {
  it('creates the schema and sets user_version to the current version', () => {
    const db = openDb(':memory:');
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('tides');
    expect(tables).toContain('settings');
    expect(tables).toContain('access_log');
    // v2 : gestion d'utilisateurs + secret de session persisté.
    expect(tables).toContain('users');
    expect(tables).toContain('app_secret');
    db.close();
  });

  it('users : login unique (insensible à la casse)', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO users (login, password_hash, role, created_at, updated_at) VALUES ('Admin', 'h', 'admin', 't', 't')"
    ).run();
    expect(() =>
      db.prepare(
        "INSERT INTO users (login, password_hash, role, created_at, updated_at) VALUES ('admin', 'h', 'admin', 't', 't')"
      ).run()
    ).toThrow();
    db.close();
  });

  it('is idempotent (re-running migrate keeps the schema)', () => {
    const db = openDb(':memory:');
    migrate(db);
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    // La table settings impose une ligne unique (id = 1).
    db.prepare("INSERT INTO settings (id, data) VALUES (1, '{}')").run();
    expect(() => db.prepare("INSERT INTO settings (id, data) VALUES (2, '{}')").run()).toThrow();
    db.close();
  });
});
