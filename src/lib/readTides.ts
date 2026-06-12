import fs from 'fs';
import path from 'path';

export type MareeType = 'haute' | 'basse';

/** Une marée telle que stockée dans le fichier de ressources (déjà un extrême). */
export interface RawTideEntry {
  maree: MareeType;
  heure?: string;
  hauteur: string;
  coefficient?: string;
}

/** Données indexées par date (clé `YYYY-MM-DD`). */
export type RawTideData = Record<string, RawTideEntry[]>;

const DATA_FILE = path.join(__dirname, '..', 'resources', 'horaires_marees_port-tudy.json');
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lit les horaires de marées depuis le fichier de ressources local.
 * Le fichier contient directement les pleines/basses mers, pas des relevés horaires.
 */
export function readTides(filePath: string = DATA_FILE): RawTideData {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(content) as Record<string, unknown>;
  return normalize(parsed);
}

/**
 * Aplatit les données vers `{ date: entries }`. Le fichier mélange deux formes :
 * des clés date directes (`"2026-06-01": [...]`) et des sections groupées par mois
 * (`"septembre": { "2026-09-01": [...] }`).
 */
function normalize(parsed: Record<string, unknown>): RawTideData {
  const result: RawTideData = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (DATE_KEY.test(key) && Array.isArray(value)) {
      result[key] = value as RawTideEntry[];
    } else if (value && typeof value === 'object') {
      for (const [date, entries] of Object.entries(value as Record<string, RawTideEntry[]>)) {
        if (DATE_KEY.test(date)) {
          result[date] = entries;
        }
      }
    }
  }
  return result;
}
