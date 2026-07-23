import path from 'path';
import { getSite } from './sites';

/**
 * Répertoire de données runtime (base SQLite + éventuels fichiers legacy), isolé pour être monté
 * comme volume Docker. Surchargable via `DATA_DIR` ; par défaut `<cwd>/data`
 * (dev → `server/data`, image → `/data`).
 */
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

/** Répertoire des graines versionnées, embarquées dans l'image (`dist/resources/`). */
export const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

/** Chemin d'un fichier d'horaires legacy pour un site (dans `DATA_DIR`), pour import ponctuel. */
export function tidesFileForSite(siteId: string): string {
  const site = getSite(siteId);
  if (!site) {
    throw new Error(`Site inconnu : ${siteId}`);
  }
  return path.join(DATA_DIR, site.filename);
}
