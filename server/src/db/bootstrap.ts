import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { DATA_DIR, RESOURCES_DIR } from '../config/dataDir';
import { SITES } from '../config/sites';
import { readTides } from '../lib/readTides';
import { getDb, type DB } from './index';
import { countTides, replaceSiteData } from './tidesRepository';
import { writeSettings, ensureSettings } from '../service/SettingsStore';

/**
 * Prépare le stockage au démarrage : crée `DATA_DIR`, ouvre la base et l'amorce si vide.
 *
 * - **Horaires** : pour chaque site sans données en base, importe depuis le fichier legacy
 *   `DATA_DIR/<site>.json` s'il existe (déploiements antérieurs), sinon depuis la graine embarquée.
 * - **Réglages** : si la ligne de config est absente, importe `settings.json` legacy s'il existe,
 *   sinon écrit les défauts.
 *
 * Idempotent : ne réimporte rien si la base contient déjà les données.
 */
export function initStorage(logger?: Logger, db: DB = getDb()): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const site of SITES) {
    if (countTides(db, site.id) > 0) continue;
    const legacy = path.join(DATA_DIR, site.filename);
    const source = fs.existsSync(legacy) ? legacy : path.join(RESOURCES_DIR, site.filename);
    replaceSiteData(db, site.id, readTides(source));
    logger?.info(`Horaires « ${site.label} » importés en base depuis ${source}`);
  }

  const hasSettings = db.prepare('SELECT 1 FROM settings WHERE id = 1').get();
  if (!hasSettings) {
    const legacySettings = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(legacySettings)) {
      try {
        writeSettings(JSON.parse(fs.readFileSync(legacySettings, 'utf-8')), db);
        logger?.info('Réglages importés depuis settings.json (legacy)');
        return;
      } catch {
        /* fichier illisible → défauts */
      }
    }
    ensureSettings(db);
  }
}
