import fs from 'fs';
import path from 'path';
import { Logger } from 'pino';

/**
 * Répertoire de données runtime (config + horaires), isolé pour être monté comme
 * volume Docker. Surchargable via `DATA_DIR` ; par défaut `<cwd>/data`
 * (dev → `server/data`, image → `/data`).
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

export const TIDES_FILENAME = 'horaires_marees_port-tudy.json';
export const TIDES_FILE = path.join(DATA_DIR, TIDES_FILENAME);
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

/** Graine versionnée, embarquée dans l'image (copiée en `dist/resources/` au build). */
const BUNDLED_TIDES = path.join(__dirname, '..', 'resources', TIDES_FILENAME);

/**
 * Garantit l'existence du répertoire de données et l'y initialise à partir de la
 * graine si le fichier d'horaires est absent (cas d'un volume vide au 1er lancement).
 */
export function ensureDataDir(logger?: Logger): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(TIDES_FILE)) {
    fs.copyFileSync(BUNDLED_TIDES, TIDES_FILE);
    logger?.info(`Horaires initialisés dans ${TIDES_FILE} (depuis la graine)`);
  }
}
