import type { DB } from './index';
import type { FishingRef, FishingRefKind } from '../service/fishingSeed';

export type { FishingRef, FishingRefKind };

interface RefRow {
  id: string;
  kind: string;
  label: string;
  label_plural: string | null;
  default_gear_id: string | null;
}

/** Colonnes lues par `toRef` (une seule liste, pour qu'aucune lecture n'en oublie une). */
const REF_COLUMNS = 'id, kind, label, label_plural, default_gear_id';

/**
 * Mappe une ligne brute : une ligne antérieure à la v8 (`label_plural` NULL) vaut son singulier ;
 * une ligne antérieure à la v10 n'a pas d'engin par défaut.
 */
function toRef(r: RefRow): FishingRef {
  return {
    id: r.id,
    kind: r.kind as FishingRefKind,
    label: r.label,
    labelPlural: r.label_plural ?? r.label,
    defaultGearId: r.default_gear_id ?? null
  };
}

/** Référentiels ordonnés : engins d'abord (`sort_order` de la graine), puis espèces. */
export function getRefs(db: DB): FishingRef[] {
  const rows = db.prepare(`SELECT ${REF_COLUMNS} FROM fishing_refs ORDER BY sort_order, id`).all() as RefRow[];
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
 * `defaultGearId` n'a de sens que pour une espèce : il est forcé à `NULL` pour un engin. Sa
 * validité (engin existant) est vérifiée par la route.
 */
export function addRef(
  db: DB,
  kind: FishingRefKind,
  label: string,
  labelPlural?: string,
  defaultGearId?: string | null
): FishingRef {
  const id = uniqueId(db, label);
  const plural = labelPlural && labelPlural.trim() ? labelPlural : label;
  const gear = kind === 'species' && defaultGearId ? defaultGearId : null;
  db.prepare(
    'INSERT INTO fishing_refs (id, kind, label, label_plural, default_gear_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, kind, label, plural, gear, nextSortOrder(db));
  return { id, kind, label, labelPlural: plural, defaultGearId: gear };
}

/**
 * Met à jour le libellé, son pluriel et l'engin par défaut (le type et l'id sont figés). `null`
 * si l'id n'existe pas. Mêmes replis qu'`addRef`. C'est un **remplacement** : un
 * `defaultGearId` absent efface le défaut, comme un `labelPlural` absent rétablit le singulier.
 */
export function updateRef(
  db: DB,
  id: string,
  label: string,
  labelPlural?: string,
  defaultGearId?: string | null
): FishingRef | null {
  const current = db.prepare('SELECT kind FROM fishing_refs WHERE id = ?').get(id) as
    | { kind: string }
    | undefined;
  if (!current) return null;
  const plural = labelPlural && labelPlural.trim() ? labelPlural : label;
  const gear = current.kind === 'species' && defaultGearId ? defaultGearId : null;
  db.prepare('UPDATE fishing_refs SET label = ?, label_plural = ?, default_gear_id = ? WHERE id = ?').run(
    label,
    plural,
    gear,
    id
  );
  const row = db.prepare(`SELECT ${REF_COLUMNS} FROM fishing_refs WHERE id = ?`).get(id) as RefRow;
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
  // Un engin supprimé n'est plus le défaut de personne. Contrairement aux prises, ce n'est qu'une
  // commodité de saisie : on l'efface plutôt que de refuser la suppression.
  db.transaction(() => {
    db.prepare('DELETE FROM fishing_refs WHERE id = ?').run(id);
    db.prepare('UPDATE fishing_refs SET default_gear_id = NULL WHERE default_gear_id = ?').run(id);
  })();
  return 'deleted';
}

function insertSeed(db: DB, seed: FishingRef[]): void {
  const ins = db.prepare(
    'INSERT INTO fishing_refs (id, kind, label, label_plural, default_gear_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  seed.forEach((r, i) => ins.run(r.id, r.kind, r.label, r.labelPlural, r.defaultGearId, i));
}

/**
 * Réordonne les entrées d'un `kind`. Renvoie la liste **complète** réordonnée, ou `null` si `ids`
 * n'est pas **exactement** l'ensemble des ids de ce `kind` — liste partielle, id étranger, id d'un
 * autre type ou doublon. Une liste périmée (un autre onglet vient d'ajouter une espèce) doit
 * échouer bruyamment plutôt que de faire disparaître l'absent du tri.
 *
 * ⚠️ Les rangs ne sont **pas** renumérotés 0..N−1 : on **redistribue les rangs déjà occupés** par
 * cette section. `sort_order` est global aux deux types (la graine numérote par index, et
 * `nextSortOrder` rend max + 1 quel que soit le `kind`), donc renuméroter une section déplacerait
 * l'autre. Ici elle garde ses rangs au bit près.
 */
export function reorderRefs(db: DB, kind: FishingRefKind, ids: string[]): FishingRef[] | null {
  const rows = db
    .prepare('SELECT id, sort_order AS s FROM fishing_refs WHERE kind = ? ORDER BY s, id')
    .all(kind) as { id: string; s: number }[];

  const wanted = new Set(ids);
  // `Set` écarte les doublons : comparer les cardinaux couvre donc aussi ce cas.
  if (wanted.size !== ids.length || wanted.size !== rows.length) return null;
  if (rows.some(r => !wanted.has(r.id))) return null;

  const slots = rows.map(r => r.s);
  const upd = db.prepare('UPDATE fishing_refs SET sort_order = ? WHERE id = ?');
  db.transaction(() => {
    ids.forEach((id, i) => upd.run(slots[i], id));
  })();
  return getRefs(db);
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
          `SELECT ${REF_COLUMNS} FROM fishing_refs
           WHERE id IN (SELECT species_id FROM fishing_catches UNION SELECT gear_id FROM fishing_catches)
           ORDER BY sort_order, id`
        )
        .all() as RefRow[]
    )
      .map(toRef)
      .filter(r => !seedIds.has(r.id));
    db.prepare('DELETE FROM fishing_refs').run();
    insertSeed(db, [...seed, ...kept]);
    // Une entrée conservée peut désigner un engin personnalisé que le reset vient de retirer.
    db.prepare(
      `UPDATE fishing_refs SET default_gear_id = NULL
       WHERE default_gear_id IS NOT NULL
         AND default_gear_id NOT IN (SELECT id FROM fishing_refs WHERE kind = 'gear')`
    ).run();
  })();
}

/**
 * Palier v10 : complète une base **déjà amorcée** avec ce que la graine a gagné — les entrées
 * manquantes (le casier à morgates, la morgate) puis les engins par défaut des espèces.
 *
 * Appelé **par la migration**, donc une seule fois, et non par `initStorage` comme
 * `backfillSeedPlurals` : un pluriel `NULL` voulait toujours dire « jamais renseigné », alors
 * qu'un engin par défaut `NULL` est aussi un choix (« aucun »). Rejoué à chaque démarrage, ce
 * complément remettrait un défaut que l'utilisateur a retiré, ou une entrée qu'il a supprimée.
 *
 * Défaut posé seulement si l'espèce porte **encore le libellé de la graine** (renommée, ce n'est
 * plus l'espèce dont on connaît l'engin), si l'engin existe, et si aucun défaut n'est déjà là.
 * Table vide (base neuve) : rien — `seedFishingRefsIfEmpty` amorcera tout, défauts compris.
 */
export function upgradeFishingRefsToV10(db: DB, seed: FishingRef[]): void {
  const { c } = db.prepare('SELECT count(*) AS c FROM fishing_refs').get() as { c: number };
  if (c === 0) return;
  db.transaction(() => {
    const exists = db.prepare('SELECT 1 FROM fishing_refs WHERE id = ?');
    const ins = db.prepare(
      'INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    for (const r of seed) {
      if (!exists.get(r.id)) ins.run(r.id, r.kind, r.label, r.labelPlural, nextSortOrder(db));
    }
    const upd = db.prepare(
      `UPDATE fishing_refs SET default_gear_id = ?
       WHERE id = ? AND kind = 'species' AND label = ? AND default_gear_id IS NULL
         AND EXISTS (SELECT 1 FROM fishing_refs g WHERE g.id = ? AND g.kind = 'gear')`
    );
    for (const r of seed) {
      if (r.kind === 'species' && r.defaultGearId) upd.run(r.defaultGearId, r.id, r.label, r.defaultGearId);
    }
  })();
}
