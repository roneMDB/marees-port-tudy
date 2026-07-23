import { describe, expect, it } from 'vitest';
import { openDb, migrate } from './index';

describe('db migrations', () => {
  it('creates the v1 schema and sets user_version', () => {
    const db = openDb(':memory:');
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(1);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('tides');
    expect(tables).toContain('settings');
    expect(tables).toContain('access_log');
    db.close();
  });

  it('is idempotent (re-running migrate keeps the schema)', () => {
    const db = openDb(':memory:');
    migrate(db);
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    // La table settings impose une ligne unique (id = 1).
    db.prepare("INSERT INTO settings (id, data) VALUES (1, '{}')").run();
    expect(() => db.prepare("INSERT INTO settings (id, data) VALUES (2, '{}')").run()).toThrow();
    db.close();
  });
});
