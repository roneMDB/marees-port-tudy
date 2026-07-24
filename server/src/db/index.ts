import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/dataDir';

export type DB = Database.Database;

/** Version courante du schéma (incrémentée à chaque migration). */
const SCHEMA_VERSION = 2;

/** Chemin du fichier SQLite runtime (dans le volume `DATA_DIR`). */
export function dbPath(): string {
  return path.join(DATA_DIR, 'marees.db');
}

/**
 * Applique les migrations manquantes (idempotent, via `PRAGMA user_version`).
 * v1 : tables `tides`, `settings`, `access_log`.
 * v2 : gestion d'utilisateurs (`users`) + secret de session persisté (`app_secret`).
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
