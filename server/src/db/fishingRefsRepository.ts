import type { DB } from './index';
import type { FishingRef, FishingRefKind } from '../service/fishingSeed';

export type { FishingRef, FishingRefKind };

interface RefRow {
  id: string;
  kind: string;
  label: string;
  label_plural: string | null;
}

/** Mappe une ligne brute : une ligne antérieure à la v8 (`label_plural` NULL) vaut son singulier. */
function toRef(r: RefRow): FishingRef {
  return { id: r.id, kind: r.kind as FishingRefKind, label: r.label, labelPlural: r.label_plural ?? r.label };
}

/** Référentiels ordonnés : engins d'abord (`sort_order` de la graine), puis espèces. */
export function getRefs(db: DB): FishingRef[] {
  const rows = db
    .prepare('SELECT id, kind, label, label_plural FROM fishing_refs ORDER BY sort_order, id')
    .all() as RefRow[];
  return rows.map(toRef);
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

/**
 * Ajoute une entrée (id slug unique, en fin de liste). Un `labelPlural` vide ou absent vaut
 * `label` : l'invariant « il y a toujours un pluriel » tient ici, quel que soit l'appelant.
 */
export function addRef(db: DB, kind: FishingRefKind, label: string, labelPlural?: string): FishingRef {
  const id = uniqueId(db, label);
  const plural = labelPlural && labelPlural.trim() ? labelPlural : label;
  db.prepare('INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES (?, ?, ?, ?, ?)').run(
    id,
    kind,
    label,
    plural,
    nextSortOrder(db)
  );
  return { id, kind, label, labelPlural: plural };
}

/**
 * Met à jour le libellé et son pluriel (le type et l'id sont figés). `null` si l'id n'existe pas.
 * Même repli qu'`addRef` : `labelPlural` vide ou absent vaut `label`.
 */
export function updateRef(db: DB, id: string, label: string, labelPlural?: string): FishingRef | null {
  const plural = labelPlural && labelPlural.trim() ? labelPlural : label;
  const res = db
    .prepare('UPDATE fishing_refs SET label = ?, label_plural = ? WHERE id = ?')
    .run(label, plural, id);
  if (res.changes === 0) return null;
  const row = db.prepare('SELECT id, kind, label, label_plural FROM fishing_refs WHERE id = ?').get(id) as RefRow;
  return toRef(row);
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
  const ins = db.prepare(
    'INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  seed.forEach((r, i) => ins.run(r.id, r.kind, r.label, r.labelPlural, i));
}

/**
 * Complète le pluriel des entrées de graine amorcées **avant la v8** (colonne `NULL`).
 *
 * Sans cela, une base déjà amorcée garderait pour toujours des pluriels valant leur singulier — le
 * repli de lecture est correct mais silencieux, et « 3 casier à crabes » ne se signale pas comme un
 * défaut. La condition est double et volontairement stricte : **id de la graine** *et* **libellé
 * encore identique** à celui de la graine. Un libellé renommé n'est plus celui dont on connaît le
 * pluriel ; un pluriel déjà saisi (donc non `NULL`) est la volonté de l'utilisateur. Idempotent.
 */
export function backfillSeedPlurals(db: DB, seed: FishingRef[]): void {
  const upd = db.prepare(
    'UPDATE fishing_refs SET label_plural = ? WHERE id = ? AND label = ? AND label_plural IS NULL'
  );
  db.transaction(() => {
    for (const r of seed) upd.run(r.labelPlural, r.id, r.label);
  })();
}

/** Amorce les référentiels **uniquement si la table est vide** (idempotent). */
export function seedFishingRefsIfEmpty(db: DB, seed: FishingRef[]): void {
  const { c } = db.prepare('SELECT count(*) AS c FROM fishing_refs').get() as { c: number };
  if (c === 0) db.transaction(() => insertSeed(db, seed))();
}

/**
 * « Rétablir les défauts » : réinsère la graine **en conservant** les entrées personnalisées encore
 * référencées par une prise. Sans cette exception, le bouton ferait silencieusement ce que
 * `deleteRef` refuse par un 409, et une prise ancienne perdrait son libellé. Les entrées conservées
 * sont rangées **après** la graine (`insertSeed` numérote `sort_order` par index).
 */
export function resetFishingRefs(db: DB, seed: FishingRef[]): void {
  db.transaction(() => {
    const seedIds = new Set(seed.map(r => r.id));
    const kept = (
      db
        .prepare(
          `SELECT id, kind, label, label_plural FROM fishing_refs
           WHERE id IN (SELECT species_id FROM fishing_catches UNION SELECT gear_id FROM fishing_catches)
           ORDER BY sort_order, id`
        )
        .all() as RefRow[]
    )
      .map(toRef)
      .filter(r => !seedIds.has(r.id));
    db.prepare('DELETE FROM fishing_refs').run();
    insertSeed(db, [...seed, ...kept]);
  })();
}
