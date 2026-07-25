import { describe, expect, it } from 'vitest';
import { openDb, migrate } from './index';

describe('db migrations', () => {
  it('creates the schema and sets user_version to the current version', () => {
    const db = openDb(':memory:');
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(5);

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
    // v3 : colonne `login` sur access_log (attribution des connexions).
    const cols = db.prepare('PRAGMA table_info(access_log)').all().map((c: any) => c.name);
    expect(cols).toContain('login');
    // v4 : table des remises à flot constatées (issue #4).
    expect(tables).toContain('aflot_observations');
    // v5 : table du lexique du mot du jour (éditable).
    expect(tables).toContain('lexicon');
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

  it('migration v3 idempotente même si user_version a été remis à 1 (rollback puis re-upgrade)', () => {
    const db = openDb(':memory:'); // déjà en v3, colonne login présente
    // Simule un rollback (ancien binaire remet user_version=1) puis un re-upgrade.
    db.pragma('user_version = 1');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    const cols = db.prepare('PRAGMA table_info(access_log)').all().map((c: any) => c.name);
    expect(cols.filter((c: string) => c === 'login')).toHaveLength(1);
    db.close();
  });

  it('is idempotent (re-running migrate keeps the schema)', () => {
    const db = openDb(':memory:');
    migrate(db);
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(5);
    // La table settings impose une ligne unique (id = 1).
    db.prepare("INSERT INTO settings (id, data) VALUES (1, '{}')").run();
    expect(() => db.prepare("INSERT INTO settings (id, data) VALUES (2, '{}')").run()).toThrow();
    db.close();
  });
});
