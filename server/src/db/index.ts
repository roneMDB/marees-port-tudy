import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/dataDir';
import { upgradeFishingRefsToV10 } from './fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';

export type DB = Database.Database;

/** Version courante du schéma (incrémentée à chaque migration). */
const SCHEMA_VERSION = 10;

/** Chemin du fichier SQLite runtime (dans le volume `DATA_DIR`). */
export function dbPath(): string {
  return path.join(DATA_DIR, 'marees.db');
}

/**
 * Applique les migrations manquantes (idempotent, via `PRAGMA user_version`).
 * v1 : tables `tides`, `settings`, `access_log`.
 * v2 : gestion d'utilisateurs (`users`) + secret de session persisté (`app_secret`).
 * v3 : colonne `login` sur `access_log` (attribution des connexions à un utilisateur).
 * v4 : table `aflot_observations` (heures de remise à flot réellement constatées, issue #4).
 * v5 : table `lexicon` (mot du jour éditable en base, issue #4 suite).
 * v6 : colonne `kind` sur `access_log` (visite / chargement de page / connexion, issue #16).
 * v7 : carnet de pêche (`fishing_trips`, `fishing_catches`, `fishing_refs`, issue #3).
 * v8 : libellé au pluriel des référentiels de pêche (issue #3).
 * v9 : colonne `baited` sur `fishing_trips` (casiers boëttés ou non, issue #3).
 * v10 : engin par défaut d'une espèce (`fishing_refs.default_gear_id`, issue #3).
 */
export function migrate(db: DB): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id TEXT NOT NULL,
        date TEXT NOT NULL,
        maree TEXT NOT NULL,
        heure TEXT,
        hauteur TEXT,
        coefficient TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tides_site_date ON tides(site_id, date);

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS access_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        scope TEXT NOT NULL,
        ip TEXT,
        country TEXT,
        ua TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_access_ts ON access_log(ts);
    `);
  }
  if (version < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        login TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        must_change_password INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_secret (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL
      );
    `);
  }
  if (version < 3) {
    // `access_log` existe depuis v1 → ALTER pour les bases déjà déployées (login nullable).
    // `ADD COLUMN` n'est pas idempotent en SQLite : on ne l'ajoute que s'il est absent (robuste
    // à un rollback ayant remis `user_version` en arrière puis re-upgrade).
    const cols = db.prepare('PRAGMA table_info(access_log)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'login')) {
      db.exec('ALTER TABLE access_log ADD COLUMN login TEXT;');
    }
  }
  if (version < 4) {
    // Heures de remise à flot **constatées** (issue #4) : une par basse mer Port-Tudy (date + heure).
    db.exec(`
      CREATE TABLE IF NOT EXISTS aflot_observations (
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        observed TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (date, time)
      );
    `);
  }
  if (version < 5) {
    // Lexique éditable du « mot du jour » (issue #4 suite). `sort_order` = ordre d'affichage/rotation.
    db.exec(`
      CREATE TABLE IF NOT EXISTS lexicon (
        id TEXT PRIMARY KEY,
        term TEXT NOT NULL,
        definition TEXT NOT NULL,
        type TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  if (version < 6) {
    // Nature de l'accès (issue #16) : `visit` = ouverture réelle de l'app signalée par le client,
    // `page` = chargement de la coquille / sonde externe, `login` = connexion réussie. Les lignes
    // antérieures restent à NULL et sont lues comme `page` — c'est exactement ce qu'elles sont.
    // Même précaution qu'en v3 : `ADD COLUMN` n'est pas idempotent en SQLite.
    const cols = db.prepare('PRAGMA table_info(access_log)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'kind')) {
      db.exec('ALTER TABLE access_log ADD COLUMN kind TEXT;');
    }
  }
  if (version < 7) {
    // Carnet de pêche (issue #3). Une sortie porte N prises ; la météo est un instantané JSON
    // figé à la création (observation non reproductible), le contexte marée n'est **pas** stocké
    // — il est recalculé à l'affichage, pour qu'une graine corrigée profite aux sorties passées.
    db.exec(`
      CREATE TABLE IF NOT EXISTS fishing_trips (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL,
        start_time TEXT,
        end_time   TEXT,
        notes      TEXT,
        weather    TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fishing_trips_date ON fishing_trips(date);

      CREATE TABLE IF NOT EXISTS fishing_catches (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id    INTEGER NOT NULL REFERENCES fishing_trips(id) ON DELETE CASCADE,
        species_id TEXT NOT NULL,
        gear_id    TEXT NOT NULL,
        quantity   INTEGER NOT NULL,
        size_cm    REAL,
        weight_g   INTEGER,
        kept       INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_fishing_catches_trip ON fishing_catches(trip_id);

      CREATE TABLE IF NOT EXISTS fishing_refs (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        label      TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
  if (version < 8) {
    // Le pluriel d'une espèce est une **donnée**, pas un calcul : « lieu jaune » fait « lieus
    // jaunes » quand « lieu » l'endroit fait « lieux », et « crevette bouquet » garde son apposition
    // invariable. Aucune règle automatique ne couvre les deux (issue #3).
    // Même précaution qu'en v3 et v6 : `ADD COLUMN` n'est pas idempotent en SQLite.
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'label_plural')) {
      db.exec('ALTER TABLE fishing_refs ADD COLUMN label_plural TEXT;');
    }
  }
  if (version < 9) {
    // A-t-on boëtté les casiers ? Un simple oui / non au niveau de la sortie — la matière de la
    // boëtte n'est pas saisie (issue #3). Les sorties antérieures basculent à « non » : décision
    // assumée, plutôt qu'un troisième état « non renseigné » à traiter partout. Le `NOT NULL` n'est
    // permis ici que parce que le `DEFAULT` est non nul (SQLite refuserait l'inverse).
    // Même précaution qu'en v3, v6 et v8 : `ADD COLUMN` n'est pas idempotent en SQLite.
    const cols = db.prepare('PRAGMA table_info(fishing_trips)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'baited')) {
      db.exec('ALTER TABLE fishing_trips ADD COLUMN baited INTEGER NOT NULL DEFAULT 0;');
    }
  }
  if (version < 10) {
    // L'engin qu'on pré-sélectionne quand on choisit une espèce (issue #3). Une donnée saisie,
    // pas une règle : « fishing_refs » ne sait pas ce qu'est un casier.
    // Même précaution qu'en v3, v6, v8 et v9 : `ADD COLUMN` n'est pas idempotent en SQLite.
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'default_gear_id')) {
      db.exec('ALTER TABLE fishing_refs ADD COLUMN default_gear_id TEXT;');
    }
    // Complément **une seule fois** (cf. `upgradeFishingRefsToV10`) : ici et nulle part ailleurs.
    upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
  }
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}

/** Ouvre une base (fichier ou `:memory:`), active le WAL et applique les migrations. */
export function openDb(file: string): DB {
  // Crée le dossier parent pour une base fichier (le volume peut être vide au 1er démarrage).
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  // better-sqlite3 laisse `foreign_keys` à OFF : sans cette ligne, le ON DELETE CASCADE de
  // `fishing_catches` ne s'appliquerait jamais et laisserait des prises orphelines (issue #3).
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

// Singleton runtime : une base ouverte pour toute l'application (chemin dérivé de DATA_DIR).
let instance: DB | null = null;

/** Base partagée de l'application (ouverte à la demande). */
export function getDb(): DB {
  if (!instance) {
    instance = openDb(dbPath());
  }
  return instance;
}

/** Ferme et réinitialise le singleton (tests / arrêt). */
export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
