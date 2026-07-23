import type { DB } from './index';
import type { MareeType, RawTideData, RawTideEntry } from '../lib/readTides';

interface TideRow {
  date: string;
  maree: string;
  heure: string | null;
  hauteur: string | null;
  coefficient: string | null;
}

/**
 * Renvoie les horaires d'un site sous la forme `{ date: entries }`, **identique** au contrat de
 * `readTides` (round-trip fidèle : `hauteur`/`coefficient` restent des chaînes, `coefficient` et
 * `heure` omis quand absents). Les entrées sont triées par date puis heure.
 */
export function getSiteData(db: DB, siteId: string): RawTideData {
  // Ordre d'insertion (`id`) → round-trip fidèle à `readTides` (l'ordre intra-jour n'a pas
  // d'importance fonctionnelle : `Maree.mapDay` trie par heure et `getMeta` trie les dates).
  const rows = db
    .prepare('SELECT date, maree, heure, hauteur, coefficient FROM tides WHERE site_id = ? ORDER BY id')
    .all(siteId) as TideRow[];

  const result: RawTideData = {};
  for (const r of rows) {
    const entry: RawTideEntry = { maree: r.maree as MareeType, hauteur: r.hauteur ?? '' };
    if (r.heure != null) entry.heure = r.heure;
    if (r.coefficient != null) entry.coefficient = r.coefficient;
    (result[r.date] ??= []).push(entry);
  }
  return result;
}

/** Remplace **toutes** les marées d'un site par `data` (transaction : delete + insert). */
export function replaceSiteData(db: DB, siteId: string, data: RawTideData): void {
  const del = db.prepare('DELETE FROM tides WHERE site_id = ?');
  const ins = db.prepare(
    'INSERT INTO tides (site_id, date, maree, heure, hauteur, coefficient) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    del.run(siteId);
    for (const [date, entries] of Object.entries(data)) {
      for (const e of entries) {
        ins.run(siteId, date, e.maree, e.heure ?? null, e.hauteur ?? null, e.coefficient ?? null);
      }
    }
  });
  tx();
}

/**
 * Fusionne `data` dans un site : pour **chaque date fournie**, remplace ses marées (delete +
 * insert) ; les autres dates du site sont conservées. Transaction unique.
 */
export function mergeSiteData(db: DB, siteId: string, data: RawTideData): void {
  const del = db.prepare('DELETE FROM tides WHERE site_id = ? AND date = ?');
  const ins = db.prepare(
    'INSERT INTO tides (site_id, date, maree, heure, hauteur, coefficient) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const [date, entries] of Object.entries(data)) {
      del.run(siteId, date);
      for (const e of entries) {
        ins.run(siteId, date, e.maree, e.heure ?? null, e.hauteur ?? null, e.coefficient ?? null);
      }
    }
  });
  tx();
}

/** Nombre de marées en base (pour un site, ou toutes). */
export function countTides(db: DB, siteId?: string): number {
  const row = siteId
    ? db.prepare('SELECT count(*) AS c FROM tides WHERE site_id = ?').get(siteId)
    : db.prepare('SELECT count(*) AS c FROM tides').get();
  return (row as { c: number }).c;
}
