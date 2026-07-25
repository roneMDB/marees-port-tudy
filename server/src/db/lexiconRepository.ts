import type { DB } from './index';
import type { LexiconSeedEntry, LexiconType } from '../service/lexiconSeed';

/** Une entrée du lexique telle que stockée/servie (mêmes champs que le seed). */
export type LexiconEntry = LexiconSeedEntry;

interface LexiconRow {
  id: string;
  term: string;
  definition: string;
  type: string;
}

/** Champs modifiables d'une entrée (l'id est généré / porté par l'URL). */
export interface LexiconInput {
  term: string;
  definition: string;
  type: LexiconType;
}

/** Lexique complet, ordonné (ordre d'affichage / rotation). */
export function getLexicon(db: DB): LexiconEntry[] {
  const rows = db
    .prepare('SELECT id, term, definition, type FROM lexicon ORDER BY sort_order, id')
    .all() as LexiconRow[];
  return rows.map(r => ({ id: r.id, term: r.term, definition: r.definition, type: r.type as LexiconType }));
}

export function countLexicon(db: DB): number {
  return (db.prepare('SELECT count(*) AS c FROM lexicon').get() as { c: number }).c;
}

/** Slug ASCII d'un libellé (mêmes conventions que les ids d'origine). */
function slugify(term: string): string {
  const base = term
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'terme';
}

/** Id unique dérivé du libellé (suffixe -2, -3… en cas de collision). */
function uniqueId(db: DB, term: string): string {
  const base = slugify(term);
  const exists = (id: string) => db.prepare('SELECT 1 FROM lexicon WHERE id = ?').get(id) != null;
  if (!exists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists(candidate)) return candidate;
  }
}

function nextSortOrder(db: DB): number {
  const row = db.prepare('SELECT max(sort_order) AS m FROM lexicon').get() as { m: number | null };
  return (row.m ?? -1) + 1;
}

/** Ajoute une entrée (id slug unique, ajoutée en fin de liste). Renvoie l'entrée créée. */
export function addEntry(db: DB, input: LexiconInput): LexiconEntry {
  const id = uniqueId(db, input.term);
  db.prepare('INSERT INTO lexicon (id, term, definition, type, sort_order) VALUES (?, ?, ?, ?, ?)').run(
    id,
    input.term,
    input.definition,
    input.type,
    nextSortOrder(db)
  );
  return { id, ...input };
}

/** Met à jour une entrée existante (par id). `null` si l'id n'existe pas. */
export function updateEntry(db: DB, id: string, input: LexiconInput): LexiconEntry | null {
  const res = db
    .prepare('UPDATE lexicon SET term = ?, definition = ?, type = ? WHERE id = ?')
    .run(input.term, input.definition, input.type, id);
  return res.changes > 0 ? { id, ...input } : null;
}

/** Supprime une entrée. `true` si une ligne a été supprimée. */
export function deleteEntry(db: DB, id: string): boolean {
  return db.prepare('DELETE FROM lexicon WHERE id = ?').run(id).changes > 0;
}

/** Insère la graine (dans l'ordre) — usage interne (seed / reset). */
function insertSeed(db: DB, seed: LexiconSeedEntry[]): void {
  const ins = db.prepare('INSERT INTO lexicon (id, term, definition, type, sort_order) VALUES (?, ?, ?, ?, ?)');
  seed.forEach((e, i) => ins.run(e.id, e.term, e.definition, e.type, i));
}

/** Amorce le lexique depuis la graine **uniquement si la table est vide** (idempotent). */
export function seedLexiconIfEmpty(db: DB, seed: LexiconSeedEntry[]): void {
  if (countLexicon(db) === 0) {
    db.transaction(() => insertSeed(db, seed))();
  }
}

/** Remet le lexique à la graine (vide puis réinsère). « Rétablir les termes par défaut ». */
export function resetLexicon(db: DB, seed: LexiconSeedEntry[]): void {
  db.transaction(() => {
    db.prepare('DELETE FROM lexicon').run();
    insertSeed(db, seed);
  })();
}
