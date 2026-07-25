import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/dataDir';

export type DB = Database.Database;

/** Version courante du schéma (incrémentée à chaque migration). */
const SCHEMA_VERSION = 5;

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
