import { describe, expect, it } from 'vitest';
import { openDb, migrate } from './index';

describe('db migrations', () => {
  it('creates the schema and sets user_version to the current version', () => {
    const db = openDb(':memory:');
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(10);

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
    expect(db.pragma('user_version', { simple: true })).toBe(10);
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
    expect(db.pragma('user_version', { simple: true })).toBe(10);
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
    // Une base neuve est toujours amenée à la version courante du schéma (v10 désormais).
    expect(db.pragma('user_version', { simple: true })).toBe(10);
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
    // `migrate` amène toujours à la version courante (v10) : les paliers restants (dont v8 à v10)
    // s'appliquent dans le même appel.
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    db.close();
  });

  it('ajoute la colonne des libellés au pluriel en v8', () => {
    const db = openDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'label_plural')).toBe(true);
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    db.close();
  });

  it('rejoue la migration v8 sans erreur (ADD COLUMN n’est pas idempotent en SQLite)', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 7');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    db.close();
  });

  it('ajoute la colonne « casiers boëttés » en v9, à faux par défaut', () => {
    const db = openDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(fishing_trips)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'baited')).toBe(true);
    // Les sorties antérieures au palier basculent à « non boëttées » : décision assumée, plutôt
    // qu'un troisième état « non renseigné » à traiter partout.
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    const row = db.prepare('SELECT baited FROM fishing_trips WHERE id = 1').get() as {
      baited: number;
    };
    expect(row.baited).toBe(0);
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    db.close();
  });

  it('rejoue la migration v9 sans erreur (ADD COLUMN n’est pas idempotent en SQLite)', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 8');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(10);
    const cols = db.prepare('PRAGMA table_info(fishing_trips)').all().map((c: any) => c.name);
    expect(cols.filter((c: string) => c === 'baited')).toHaveLength(1);
    db.close();
  });

  it('ajoute la colonne « engin par défaut » en v10 et complète une base v9 peuplée', () => {
    const db = openDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'default_gear_id')).toBe(true);

    // Simule une base v9 réellement antérieure : entrées de graine présentes, colonne absente.
    db.prepare(
      "INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES ('casier-crabes', 'gear', 'Casier à crabes', 'Casiers à crabes', 0), ('etrille', 'species', 'Étrille', 'Étrilles', 1)"
    ).run();
    db.exec('ALTER TABLE fishing_refs DROP COLUMN default_gear_id;');
    db.pragma('user_version = 9');

    migrate(db);

    expect(db.pragma('user_version', { simple: true })).toBe(10);
    const etrille = db
      .prepare("SELECT default_gear_id AS g FROM fishing_refs WHERE id = 'etrille'")
      .get() as { g: string | null };
    expect(etrille.g).toBe('casier-crabes');
    const morgate = db.prepare("SELECT kind FROM fishing_refs WHERE id = 'morgate'").get();
    expect(morgate).toEqual({ kind: 'species' });
    db.close();
  });

  it('rejoue la migration v10 sans erreur ni doublon (ADD COLUMN n’est pas idempotent)', () => {
    const db = openDb(':memory:');
    // Base v9 réelle (colonne absente), comme le test voisin « complète une base v9 peuplée ».
    db.prepare(
      "INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES ('ligne', 'gear', 'Ligne', 'Lignes', 0)"
    ).run();
    db.exec('ALTER TABLE fishing_refs DROP COLUMN default_gear_id;');
    db.pragma('user_version = 9');
    expect(() => migrate(db)).not.toThrow();
    // Rollback simulé (ancien binaire) suivi d'une re-migration : la colonne est déjà là, donc le
    // complément v10 ne doit pas rejouer une seconde fois.
    db.pragma('user_version = 9');
    expect(() => migrate(db)).not.toThrow();
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all().map((c: any) => c.name);
    expect(cols.filter((c: string) => c === 'default_gear_id')).toHaveLength(1);
    const { n } = db.prepare("SELECT count(*) AS n FROM fishing_refs WHERE id = 'morgate'").get() as { n: number };
    expect(n).toBe(1);
    db.close();
  });

  it('un rollback puis re-migration ne ressuscite pas une entrée supprimée ni un défaut effacé', () => {
    const db = openDb(':memory:');
    // Base v9 réelle, peuplée comme la production (mêmes entrées que le test voisin).
    db.prepare(
      "INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES ('casier-crabes', 'gear', 'Casier à crabes', 'Casiers à crabes', 0), ('etrille', 'species', 'Étrille', 'Étrilles', 1)"
    ).run();
    db.exec('ALTER TABLE fishing_refs DROP COLUMN default_gear_id;');
    db.pragma('user_version = 9');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(10);

    // L'utilisateur retire le défaut de l'étrille et supprime la morgate (comme deleteRef le ferait).
    db.prepare("UPDATE fishing_refs SET default_gear_id = NULL WHERE id = 'etrille'").run();
    db.prepare("DELETE FROM fishing_refs WHERE id = 'morgate'").run();

    // Rollback (ancien binaire remet user_version en arrière) puis re-migration.
    db.pragma('user_version = 9');
    expect(() => migrate(db)).not.toThrow();

    const etrille = db
      .prepare("SELECT default_gear_id AS g FROM fishing_refs WHERE id = 'etrille'")
      .get() as { g: string | null };
    expect(etrille.g).toBeNull();
    const morgate = db.prepare("SELECT 1 FROM fishing_refs WHERE id = 'morgate'").get();
    expect(morgate).toBeUndefined();
    db.close();
  });
});
