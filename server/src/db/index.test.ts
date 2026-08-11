import { describe, expect, it } from 'vitest';
import { openDb, migrate } from './index';

describe('db migrations', () => {
  it('creates the schema and sets user_version to the current version', () => {
    const db = openDb(':memory:');
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(8);

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
    // v6 : colonne `kind` sur access_log (visite / chargement de page / connexion, issue #16).
    expect(cols).toContain('kind');
    // v7 : carnet de pêche (issue #3).
    expect(tables).toContain('fishing_trips');
    expect(tables).toContain('fishing_catches');
    expect(tables).toContain('fishing_refs');
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

  it('migrations ALTER idempotentes même si user_version a été remis à 1 (rollback puis re-upgrade)', () => {
    const db = openDb(':memory:'); // déjà à jour, colonnes login (v3) et kind (v6) présentes
    // Simule un rollback (ancien binaire remet user_version=1) puis un re-upgrade.
    db.pragma('user_version = 1');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    const cols = db.prepare('PRAGMA table_info(access_log)').all().map((c: any) => c.name);
    // `ADD COLUMN` n'est pas idempotent en SQLite : chaque colonne doit rester unique.
    expect(cols.filter((c: string) => c === 'login')).toHaveLength(1);
    expect(cols.filter((c: string) => c === 'kind')).toHaveLength(1);
    db.close();
  });

  it('is idempotent (re-running migrate keeps the schema)', () => {
    const db = openDb(':memory:');
    migrate(db);
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    // La table settings impose une ligne unique (id = 1).
    db.prepare("INSERT INTO settings (id, data) VALUES (1, '{}')").run();
    expect(() => db.prepare("INSERT INTO settings (id, data) VALUES (2, '{}')").run()).toThrow();
    db.close();
  });

  it('crée les tables du carnet de pêche en v7', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('fishing_trips');
    expect(tables).toContain('fishing_catches');
    expect(tables).toContain('fishing_refs');
    // Une base neuve est toujours amenée à la version courante du schéma (v8 désormais).
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    db.close();
  });

  it('active les clés étrangères (sans quoi ON DELETE CASCADE serait inopérant)', () => {
    const db = openDb(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('supprime les prises en cascade avec leur sortie', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'bar', 'ligne', 2)"
    ).run();
    db.prepare('DELETE FROM fishing_trips WHERE id = 1').run();
    const rest = db.prepare('SELECT count(*) AS c FROM fishing_catches').get() as { c: number };
    expect(rest.c).toBe(0);
    db.close();
  });

  it('rejoue la migration v7 sans erreur (idempotence)', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 6');
    expect(() => migrate(db)).not.toThrow();
    // `migrate` amène toujours à la version courante (v8) : les paliers restants (dont v8)
    // s'appliquent dans le même appel.
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    db.close();
  });

  it('ajoute la colonne des libellés au pluriel en v8', () => {
    const db = openDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'label_plural')).toBe(true);
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    db.close();
  });

  it('rejoue la migration v8 sans erreur (ADD COLUMN n’est pas idempotent en SQLite)', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 7');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(8);
    db.close();
  });
});
