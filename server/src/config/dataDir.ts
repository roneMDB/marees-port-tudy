import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';
import { SITES, getSite } from './sites';

/**
 * Répertoire de données runtime (config + horaires), isolé pour être monté comme
 * volume Docker. Surchargable via `DATA_DIR` ; par défaut `<cwd>/data`
 * (dev → `server/data`, image → `/data`).
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/** Site historique par défaut (conservé pour compat/tests). */
export const TIDES_FILENAME = 'horaires_marees_port-tudy.json';
export const TIDES_FILE = path.join(DATA_DIR, TIDES_FILENAME);
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
export const ACCESS_LOG_FILE = path.join(DATA_DIR, 'access-log.jsonl');

/** Répertoire des graines versionnées, embarquées dans l'image (`dist/resources/`). */
const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

/** Chemin du fichier d'horaires runtime pour un site (dans `DATA_DIR`). */
export function tidesFileForSite(siteId: string): string {
  const site = getSite(siteId);
  if (!site) {
    throw new Error(`Site inconnu : ${siteId}`);
  }
  return path.join(DATA_DIR, site.filename);
}

/**
 * Garantit l'existence du répertoire de données et y initialise, pour **chaque site**,
 * le fichier d'horaires à partir de la graine s'il est absent (cas d'un volume vide au
 * 1er lancement).
 */
export function ensureDataDir(logger?: Logger): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const site of SITES) {
    const target = path.join(DATA_DIR, site.filename);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(path.join(RESOURCES_DIR, site.filename), target);
      logger?.info(`Horaires « ${site.label} » initialisés dans ${target} (depuis la graine)`);
    }
  }
}
