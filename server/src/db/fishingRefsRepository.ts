import type { DB } from './index';
import type { FishingRef, FishingRefKind } from '../service/fishingSeed';

export type { FishingRef, FishingRefKind };

interface RefRow {
  id: string;
  kind: string;
  label: string;
}

/** Référentiels ordonnés : engins d'abord (`sort_order` de la graine), puis espèces. */
export function getRefs(db: DB): FishingRef[] {
  const rows = db
    .prepare('SELECT id, kind, label FROM fishing_refs ORDER BY sort_order, id')
    .all() as RefRow[];
  return rows.map(r => ({ id: r.id, kind: r.kind as FishingRefKind, label: r.label }));
}

/** `true` si l'id existe **avec ce type** (une espèce ne peut pas servir d'engin). */
export function refExists(db: DB, id: string, kind: FishingRefKind): boolean {
  return db.prepare('SELECT 1 FROM fishing_refs WHERE id = ? AND kind = ?').get(id, kind) != null;
}

/** Slug ASCII d'un libellé (mêmes conventions que les ids du lexique). */
function slugify(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'entree';
}

function uniqueId(db: DB, label: string): string {
  const base = slugify(label);
  const exists = (id: string) => db.prepare('SELECT 1 FROM fishing_refs WHERE id = ?').get(id) != null;
  if (!exists(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!exists(candidate)) return candidate;
  }
}

function nextSortOrder(db: DB): number {
  const row = db.prepare('SELECT max(sort_order) AS m FROM fishing_refs').get() as { m: number | null };
  return (row.m ?? -1) + 1;
}

/** Ajoute une entrée (id slug unique, en fin de liste). */
export function addRef(db: DB, kind: FishingRefKind, label: string): FishingRef {
  const id = uniqueId(db, label);
  db.prepare('INSERT INTO fishing_refs (id, kind, label, sort_order) VALUES (?, ?, ?, ?)').run(
    id,
    kind,
    label,
    nextSortOrder(db)
  );
  return { id, kind, label };
}

/** Met à jour le libellé (le type et l'id sont figés). `null` si l'id n'existe pas. */
export function updateRef(db: DB, id: string, label: string): FishingRef | null {
  const res = db.prepare('UPDATE fishing_refs SET label = ? WHERE id = ?').run(label, id);
  if (res.changes === 0) return null;
  const row = db.prepare('SELECT id, kind, label FROM fishing_refs WHERE id = ?').get(id) as RefRow;
  return { id: row.id, kind: row.kind as FishingRefKind, label: row.label };
}

/**
 * Supprime une entrée. **Aucune clé étrangère ne relie les prises aux référentiels** : une sortie
 * de 2026 ne doit pas perdre son espèce parce qu'on nettoie le référentiel deux ans plus tard.
 * La garde est donc explicite — `in-use` sera traduit en **409** par la route.
 */
export function deleteRef(db: DB, id: string): 'deleted' | 'missing' | 'in-use' {
  const exists = db.prepare('SELECT 1 FROM fishing_refs WHERE id = ?').get(id) != null;
  if (!exists) return 'missing';
  const used = db
    .prepare('SELECT 1 FROM fishing_catches WHERE species_id = ? OR gear_id = ? LIMIT 1')
    .get(id, id);
  if (used) return 'in-use';
  db.prepare('DELETE FROM fishing_refs WHERE id = ?').run(id);
  return 'deleted';
}

function insertSeed(db: DB, seed: FishingRef[]): void {
  const ins = db.prepare('INSERT INTO fishing_refs (id, kind, label, sort_order) VALUES (?, ?, ?, ?)');
  seed.forEach((r, i) => ins.run(r.id, r.kind, r.label, i));
}

/** Amorce les référentiels **uniquement si la table est vide** (idempotent). */
export function seedFishingRefsIfEmpty(db: DB, seed: FishingRef[]): void {
  const { c } = db.prepare('SELECT count(*) AS c FROM fishing_refs').get() as { c: number };
  if (c === 0) db.transaction(() => insertSeed(db, seed))();
}

/** « Rétablir les défauts » : vide puis réinsère la graine. */
export function resetFishingRefs(db: DB, seed: FishingRef[]): void {
  db.transaction(() => {
    db.prepare('DELETE FROM fishing_refs').run();
    insertSeed(db, seed);
  })();
}
