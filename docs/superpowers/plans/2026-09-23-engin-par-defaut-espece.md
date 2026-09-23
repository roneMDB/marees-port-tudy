# Engin par défaut d'une espèce — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Choisir une espèce dans le formulaire du carnet de pêche pré-sélectionne son engin
habituel (modifiable), le lien espèce → engin étant une donnée éditable ; ajout de l'engin
« Casier à morgates » et de l'espèce « Morgate ».

**Architecture:** Colonne `fishing_refs.default_gear_id` (schéma v10), complétée **une seule fois**
dans le palier de migration à partir de la graine. Validation dans les routes `POST`/`PUT
/fishing/refs`. Côté client, une fonction pure `defaultGearFor` utilisée par le formulaire
(`@change` du `<select>` d'espèce) et un `<select>` « engin par défaut » dans le panneau admin.

**Tech Stack:** Express + better-sqlite3 (serveur, CommonJS), Vue 3 `<script setup>` + TypeScript,
Vitest (+ supertest, @vue/test-utils/jsdom).

**Spec :** `docs/superpowers/specs/2026-09-23-engin-par-defaut-espece-design.md`

## Global Constraints

- Tout en **français** : commentaires, libellés, messages de commit (conventional commits,
  `feat(peche): …`), avec la ligne `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Schéma **v10** ; `ADD COLUMN` précédé d'un test `PRAGMA table_info` (non idempotent en SQLite).
- **Pas de clé étrangère** vers `fishing_refs`.
- Libellés exacts : « Casier à morgates » / « Casiers à morgates » (id `casier-morgates`),
  « Morgate » / « Morgates » (id `morgate`), « Moussette » / « Moussettes » (id `moussette`),
  « Homard » / « Homards » (id `homard`).
- Défauts de la graine : `casier-crabes` ← étrille, tourteau, araignée, moussette, homard ;
  `casier-crevettes` ← crevette bouquet, crevette grise ; `casier-morgates` ← morgate ; aucun pour
  les autres.
- Après chaque tâche : `npm test` **et** `npm run type-check` (Vitest ne vérifie aucun type).
- Tests d'un fichier : `cd server && npx vitest run <chemin>` ou `cd client && npx vitest run <chemin>`.

**Écart assumé au spec :** côté client, `FishingRef.defaultGearId` est déclaré **facultatif**
(`defaultGearId?: string | null`) : le serveur l'envoie toujours, mais une vingtaine de fixtures de
test antérieures resteraient sinon à compléter sans rien apporter. `defaultGearFor` traite
`undefined` comme `null`.

---

### Task 1: Graine, repository et migration v10 (serveur)

**Files:**
- Modify: `server/src/service/fishingSeed.ts`
- Modify: `server/src/db/fishingRefsRepository.ts`
- Modify: `server/src/db/index.ts`
- Test: `server/src/db/fishingRefsRepository.test.ts`, `server/src/db/index.test.ts`

**Interfaces:**
- Produces:
  - `FishingRef` (serveur) : `{ id; kind; label; labelPlural; defaultGearId: string | null }`
  - `addRef(db, kind, label, labelPlural?: string, defaultGearId?: string | null): FishingRef`
  - `updateRef(db, id, label, labelPlural?: string, defaultGearId?: string | null): FishingRef | null`
  - `upgradeFishingRefsToV10(db: DB, seed: FishingRef[]): void`
  - `refExists(db, id, 'gear')` (inchangé, réutilisé par la tâche 2)

- [ ] **Step 1: Adapter les tests existants à la graine élargie**

Dans `server/src/db/fishingRefsRepository.test.ts` :

1. Dans chaque `toEqual({ id, kind, label, labelPlural })` (lignes ~35-40, 47-58, 65-70 et dans
   « enregistre et met à jour le pluriel saisi »), ajouter `defaultGearId: null`.
2. « Homard » entre dans la graine : dans les tests **« rétablit la graine en écrasant les ajouts
   non utilisés »** et **« conserve au reset une entrée personnalisée encore utilisée par une
   prise »**, remplacer `'Homard'` par `'Langouste'` et `'homard'` par `'langouste'` (y compris
   dans l'`INSERT INTO fishing_catches`). Les deux premiers tests (base vide) gardent `Homard`.

Dans `server/src/db/index.test.ts`, remplacer tous les `.toBe(9)` par `.toBe(10)` (9 occurrences,
toutes sur `user_version`).

- [ ] **Step 2: Écrire les nouveaux tests du repository**

Ajouter à la fin du `describe('fishingRefsRepository', …)` de `fishingRefsRepository.test.ts`
(importer `upgradeFishingRefsToV10` dans l'import existant) :

```ts
  describe('engin par défaut', () => {
    it('amorce les engins par défaut de la graine', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      const gearOf = (id: string) => getRefs(db).find(r => r.id === id)!.defaultGearId;
      expect(gearOf('etrille')).toBe('casier-crabes');
      expect(gearOf('moussette')).toBe('casier-crabes');
      expect(gearOf('homard')).toBe('casier-crabes');
      expect(gearOf('crevette-bouquet')).toBe('casier-crevettes');
      expect(gearOf('crevette-grise')).toBe('casier-crevettes');
      expect(gearOf('morgate')).toBe('casier-morgates');
      expect(gearOf('bar')).toBeNull();
      expect(gearOf('ligne')).toBeNull();
      db.close();
    });

    it('enregistre et modifie l’engin par défaut d’une espèce', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      expect(addRef(db, 'species', 'Langouste', '', 'casier-crabes').defaultGearId).toBe('casier-crabes');
      expect(updateRef(db, 'langouste', 'Langouste', '', 'ligne')!.defaultGearId).toBe('ligne');
      expect(updateRef(db, 'langouste', 'Langouste', '', null)!.defaultGearId).toBeNull();
      db.close();
    });

    it('ne donne jamais d’engin par défaut à un engin', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      expect(addRef(db, 'gear', 'Épuisette', '', 'ligne').defaultGearId).toBeNull();
      expect(updateRef(db, 'ligne', 'Ligne', 'Lignes', 'casier-crabes')!.defaultGearId).toBeNull();
      db.close();
    });

    it('efface le défaut des espèces quand on supprime leur engin', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      expect(deleteRef(db, 'casier-morgates')).toBe('deleted');
      expect(getRefs(db).find(r => r.id === 'morgate')!.defaultGearId).toBeNull();
      db.close();
    });

    it('rétablit les défauts de la graine au reset, et garde celui d’une entrée conservée', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      updateRef(db, 'etrille', 'Étrille', 'Étrilles', null);
      addRef(db, 'species', 'Langouste', '', 'casier-crabes');
      db.prepare(
        "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
      ).run();
      db.prepare(
        "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'langouste', 'casier-crabes', 1)"
      ).run();

      resetFishingRefs(db, FISHING_REFS_SEED);

      const refs = getRefs(db);
      expect(refs.find(r => r.id === 'etrille')!.defaultGearId).toBe('casier-crabes');
      expect(refs.find(r => r.id === 'langouste')!.defaultGearId).toBe('casier-crabes');
      db.close();
    });

    it('au reset, efface le défaut d’une entrée conservée si son engin a disparu', () => {
      const db = openDb(':memory:');
      seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
      addRef(db, 'gear', 'Épuisette');
      addRef(db, 'species', 'Langouste', '', 'epuisette');
      db.prepare(
        "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
      ).run();
      db.prepare(
        "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'langouste', 'ligne', 1)"
      ).run();

      resetFishingRefs(db, FISHING_REFS_SEED); // l'épuisette n'est pas utilisée : elle disparaît

      expect(getRefs(db).find(r => r.id === 'langouste')!.defaultGearId).toBeNull();
      db.close();
    });
  });

  describe('upgradeFishingRefsToV10', () => {
    /** Les 19 entrées de la prod au 2026-09-23 (Moussette et Homard ajoutées par le panneau). */
    const PROD_V9: [string, string, string][] = [
      ['casier-crabes', 'gear', 'Casier à crabes'],
      ['casier-crevettes', 'gear', 'Casier à crevettes'],
      ['ligne', 'gear', 'Ligne'],
      ['etrille', 'species', 'Étrille'],
      ['crevette-bouquet', 'species', 'Crevette bouquet'],
      ['tourteau', 'species', 'Tourteau'],
      ['moussette', 'species', 'Moussette'],
      ['araignee', 'species', 'Araignée'],
      ['crevette-grise', 'species', 'Crevette grise'],
      ['bar', 'species', 'Bar'],
      ['dorade-grise', 'species', 'Dorade grise'],
      ['dorade-royale', 'species', 'Dorade royale'],
      ['vieille', 'species', 'Vieille'],
      ['lieu-jaune', 'species', 'Lieu jaune'],
      ['maquereau', 'species', 'Maquereau'],
      ['congre', 'species', 'Congre'],
      ['seiche', 'species', 'Seiche'],
      ['mulet', 'species', 'Mulet'],
      ['homard', 'species', 'Homard']
    ];

    function prodDb() {
      const db = openDb(':memory:');
      const ins = db.prepare(
        'INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES (?, ?, ?, ?, ?)'
      );
      PROD_V9.forEach(([id, kind, label], i) => ins.run(id, kind, label, label, i));
      return db;
    }

    it('ajoute le casier à morgates et la morgate, après les entrées existantes', () => {
      const db = prodDb();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      const refs = getRefs(db);
      expect(refs).toHaveLength(21);
      expect(refs.slice(-2).map(r => r.id)).toEqual(['casier-morgates', 'morgate']);
      expect(refs.find(r => r.id === 'casier-morgates')!.kind).toBe('gear');
      db.close();
    });

    it('pose les défauts sur les espèces de la graine', () => {
      const db = prodDb();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      const gearOf = (id: string) => getRefs(db).find(r => r.id === id)!.defaultGearId;
      expect(gearOf('moussette')).toBe('casier-crabes');
      expect(gearOf('homard')).toBe('casier-crabes');
      expect(gearOf('crevette-bouquet')).toBe('casier-crevettes');
      expect(gearOf('morgate')).toBe('casier-morgates');
      expect(gearOf('congre')).toBeNull();
      db.close();
    });

    it('ne pose pas de défaut sur une espèce de la graine renommée', () => {
      const db = prodDb();
      db.prepare("UPDATE fishing_refs SET label = 'Étrille à pattes bleues' WHERE id = 'etrille'").run();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      expect(getRefs(db).find(r => r.id === 'etrille')!.defaultGearId).toBeNull();
      db.close();
    });

    it('réinsère un engin de la graine manquant avant de poser les défauts', () => {
      const db = prodDb();
      db.prepare("DELETE FROM fishing_refs WHERE id = 'casier-crevettes'").run();
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      // Réinséré par l'étape 1, puisque son id manquait : le défaut est donc posé.
      expect(getRefs(db).find(r => r.id === 'crevette-bouquet')!.defaultGearId).toBe('casier-crevettes');
      db.close();
    });

    it('ne fait rien sur une table vide (base neuve : l’amorçage s’en charge)', () => {
      const db = openDb(':memory:');
      upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
      expect(getRefs(db)).toEqual([]);
      db.close();
    });
  });
```

Ajouter dans `server/src/db/index.test.ts`, à la fin du `describe` :

```ts
  it('ajoute la colonne « engin par défaut » en v10 et complète une base v9 peuplée', () => {
    const db = openDb(':memory:');
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    expect(cols.some(c => c.name === 'default_gear_id')).toBe(true);

    // Simule une base v9 réellement antérieure : entrées de graine présentes, colonne absente.
    db.prepare(
      "INSERT INTO fishing_refs (id, kind, label, label_plural, sort_order) VALUES ('casier-crabes', 'gear', 'Casier à crabes', 'Casiers à crabes', 0), ('etrille', 'species', 'Étrille', 'Étrilles', 1)"
    ).run();
    db.exec('ALTER TABLE fishing_refs DROP COLUMN default_gear_id;');
    db.pragma('user_version = 9');

    migrate(db);

    expect(db.pragma('user_version', { simple: true })).toBe(10);
    const etrille = db
      .prepare("SELECT default_gear_id AS g FROM fishing_refs WHERE id = 'etrille'")
      .get() as { g: string | null };
    expect(etrille.g).toBe('casier-crabes');
    const morgate = db.prepare("SELECT kind FROM fishing_refs WHERE id = 'morgate'").get();
    expect(morgate).toEqual({ kind: 'species' });
    db.close();
  });

  it('rejoue la migration v10 sans erreur ni doublon (ADD COLUMN n’est pas idempotent)', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO fishing_refs (id, kind, label, sort_order) VALUES ('ligne', 'gear', 'Ligne', 0)"
    ).run();
    db.pragma('user_version = 9');
    expect(() => migrate(db)).not.toThrow();
    db.pragma('user_version = 9');
    expect(() => migrate(db)).not.toThrow();
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all().map((c: any) => c.name);
    expect(cols.filter((c: string) => c === 'default_gear_id')).toHaveLength(1);
    const { n } = db.prepare("SELECT count(*) AS n FROM fishing_refs WHERE id = 'morgate'").get() as { n: number };
    expect(n).toBe(1);
    db.close();
  });
```

- [ ] **Step 3: Lancer les tests, vérifier qu'ils échouent**

Run: `cd server && npx vitest run src/db/fishingRefsRepository.test.ts src/db/index.test.ts`
Expected: FAIL (`upgradeFishingRefsToV10` inexistant, `user_version` à 9, `defaultGearId` absent).

- [ ] **Step 4: Mettre à jour la graine**

Dans `server/src/service/fishingSeed.ts`, compléter le commentaire d'en-tête d'un paragraphe et
remplacer l'interface et le tableau :

```ts
 *
 * L'engin par défaut (`defaultGearId`) est lui aussi une **donnée** : c'est l'engin que le
 * formulaire pré-sélectionne quand on choisit l'espèce. `null` = aucun ; toujours `null` pour un
 * engin.
 */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
  labelPlural: string;
  defaultGearId: string | null;
}

export const FISHING_REFS_SEED: FishingRef[] = [
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes', defaultGearId: null },
  { id: 'casier-crevettes', kind: 'gear', label: 'Casier à crevettes', labelPlural: 'Casiers à crevettes', defaultGearId: null },
  { id: 'casier-morgates', kind: 'gear', label: 'Casier à morgates', labelPlural: 'Casiers à morgates', defaultGearId: null },
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes', defaultGearId: null },

  { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux', defaultGearId: 'casier-crabes' },
  { id: 'etrille', kind: 'species', label: 'Étrille', labelPlural: 'Étrilles', defaultGearId: 'casier-crabes' },
  { id: 'araignee', kind: 'species', label: 'Araignée', labelPlural: 'Araignées', defaultGearId: 'casier-crabes' },
  { id: 'moussette', kind: 'species', label: 'Moussette', labelPlural: 'Moussettes', defaultGearId: 'casier-crabes' },
  { id: 'homard', kind: 'species', label: 'Homard', labelPlural: 'Homards', defaultGearId: 'casier-crabes' },
  { id: 'morgate', kind: 'species', label: 'Morgate', labelPlural: 'Morgates', defaultGearId: 'casier-morgates' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet', labelPlural: 'Crevettes bouquet', defaultGearId: 'casier-crevettes' },
  { id: 'crevette-grise', kind: 'species', label: 'Crevette grise', labelPlural: 'Crevettes grises', defaultGearId: 'casier-crevettes' },
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars', defaultGearId: null },
  { id: 'dorade-grise', kind: 'species', label: 'Dorade grise', labelPlural: 'Dorades grises', defaultGearId: null },
  { id: 'dorade-royale', kind: 'species', label: 'Dorade royale', labelPlural: 'Dorades royales', defaultGearId: null },
  { id: 'vieille', kind: 'species', label: 'Vieille', labelPlural: 'Vieilles', defaultGearId: null },
  { id: 'lieu-jaune', kind: 'species', label: 'Lieu jaune', labelPlural: 'Lieus jaunes', defaultGearId: null },
  { id: 'maquereau', kind: 'species', label: 'Maquereau', labelPlural: 'Maquereaux', defaultGearId: null },
  { id: 'congre', kind: 'species', label: 'Congre', labelPlural: 'Congres', defaultGearId: null },
  { id: 'seiche', kind: 'species', label: 'Seiche', labelPlural: 'Seiches', defaultGearId: null },
  { id: 'mulet', kind: 'species', label: 'Mulet', labelPlural: 'Mulets', defaultGearId: null }
];
```

Mettre à jour « sur ces dix-sept entrées » → « sur ces vingt et une entrées » dans le commentaire.

- [ ] **Step 5: Mettre à jour le repository**

Dans `server/src/db/fishingRefsRepository.ts` :

```ts
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
```

`getRefs` : `SELECT ${REF_COLUMNS} FROM fishing_refs ORDER BY sort_order, id`.

Remplacer `addRef` et `updateRef` :

```ts
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
```

Dans `deleteRef`, remplacer la ligne `db.prepare('DELETE FROM fishing_refs WHERE id = ?').run(id);` par :

```ts
  // Un engin supprimé n'est plus le défaut de personne. Contrairement aux prises, ce n'est qu'une
  // commodité de saisie : on l'efface plutôt que de refuser la suppression.
  db.transaction(() => {
    db.prepare('DELETE FROM fishing_refs WHERE id = ?').run(id);
    db.prepare('UPDATE fishing_refs SET default_gear_id = NULL WHERE default_gear_id = ?').run(id);
  })();
```

`insertSeed` :

```ts
function insertSeed(db: DB, seed: FishingRef[]): void {
  const ins = db.prepare(
    'INSERT INTO fishing_refs (id, kind, label, label_plural, default_gear_id, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  seed.forEach((r, i) => ins.run(r.id, r.kind, r.label, r.labelPlural, r.defaultGearId, i));
}
```

Dans `resetFishingRefs`, remplacer `SELECT id, kind, label, label_plural FROM fishing_refs` par
`SELECT ${REF_COLUMNS} FROM fishing_refs` (template literal), et ajouter après `insertSeed(db, [...seed, ...kept]);` :

```ts
    // Une entrée conservée peut désigner un engin personnalisé que le reset vient de retirer.
    db.prepare(
      `UPDATE fishing_refs SET default_gear_id = NULL
       WHERE default_gear_id IS NOT NULL
         AND default_gear_id NOT IN (SELECT id FROM fishing_refs WHERE kind = 'gear')`
    ).run();
```

Ajouter à la fin du fichier :

```ts
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
```

- [ ] **Step 6: Ajouter le palier v10**

Dans `server/src/db/index.ts` :

```ts
import { upgradeFishingRefsToV10 } from './fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';
```

(`fishingRefsRepository.ts` n'importe que le **type** `DB` de `./index` : pas de cycle à
l'exécution.) `const SCHEMA_VERSION = 10;`, ajouter à la liste du commentaire de `migrate` :
` * v10 : engin par défaut d'une espèce (\`fishing_refs.default_gear_id\`, issue #3).`, et après le
palier v9 :

```ts
  if (version < 10) {
    // L'engin qu'on pré-sélectionne quand on choisit une espèce (issue #3). Une donnée saisie,
    // pas une règle : « fishing_refs » ne sait pas ce qu'est un casier.
    // Même précaution qu'en v3, v6, v8 et v9 : `ADD COLUMN` n'est pas idempotent en SQLite.
    const cols = db.prepare('PRAGMA table_info(fishing_refs)').all() as { name: string }[];
    if (!cols.some(c => c.name === 'default_gear_id')) {
      db.exec('ALTER TABLE fishing_refs ADD COLUMN default_gear_id TEXT;');
    }
    // Complément **une seule fois** (cf. `upgradeFishingRefsToV10`) : ici et nulle part ailleurs.
    upgradeFishingRefsToV10(db, FISHING_REFS_SEED);
  }
```

- [ ] **Step 7: Lancer les tests serveur et la vérification de types**

Run: `npm -w server test && npm -w server run type-check`
Expected: PASS. Si `routes/fishing.test.ts` échoue sur `id: 'homard'`, c'est traité en tâche 2 —
ne pas le corriger ici, mais le noter ; tout le reste doit passer.

- [ ] **Step 8: Commit**

```bash
git add server/src/service/fishingSeed.ts server/src/db/fishingRefsRepository.ts server/src/db/index.ts server/src/db/fishingRefsRepository.test.ts server/src/db/index.test.ts
git commit -m "feat(peche): engin par défaut d'une espèce en base (schéma v10)

Ajoute aussi le casier à morgates et la morgate, et fait entrer
moussette et homard dans la graine.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Routes `POST`/`PUT /fishing/refs` (serveur)

**Files:**
- Modify: `server/src/routes/fishing.ts:116-147`
- Test: `server/src/routes/fishing.test.ts`

**Interfaces:**
- Consumes: `addRef(db, kind, label, labelPlural, defaultGearId)`, `updateRef(db, id, label, labelPlural, defaultGearId)`, `refExists(db, id, 'gear')` (tâche 1).
- Produces: contrat REST — `POST`/`PUT /api/fishing/refs[/:id]` acceptent `defaultGearId`
  (`string | null`, facultatif) ; 400 `{ error }` s'il ne désigne pas un engin existant. Toutes
  les réponses de référentiel portent `defaultGearId`.

- [ ] **Step 1: Adapter les tests existants**

Dans `server/src/routes/fishing.test.ts` : Homard est désormais dans la graine. Dans **« POST
ajoute une espèce puis PUT la renomme »** remplacer `'Homard'` → `'Langouste'`, `'homard'` →
`'langouste'`, `'Homard bleu'` → `'Langouste rose'` ; dans **« DELETE renvoie 404 sur un id
inconnu, 204 sinon »**, `'/api/fishing/refs/homard'` → `'/api/fishing/refs/langouste'`.

- [ ] **Step 2: Écrire les tests**

Ajouter dans le `describe('API /api/fishing/refs', …)` :

```ts
  it('GET expose l’engin par défaut de chaque espèce', async () => {
    const res = await request(app).get('/api/fishing/refs');
    const byId = (id: string) => res.body.find((r: any) => r.id === id);
    expect(byId('crevette-bouquet').defaultGearId).toBe('casier-crevettes');
    expect(byId('morgate').defaultGearId).toBe('casier-morgates');
    expect(byId('bar').defaultGearId).toBeNull();
  });

  it('POST et PUT enregistrent l’engin par défaut, vide = aucun', async () => {
    const post = await request(app)
      .post('/api/fishing/refs')
      .send({ kind: 'species', label: 'Bouquet géant', defaultGearId: 'casier-crevettes' });
    expect(post.status).toBe(201);
    expect(post.body.defaultGearId).toBe('casier-crevettes');

    const put = await request(app)
      .put(`/api/fishing/refs/${post.body.id}`)
      .send({ label: 'Bouquet géant', defaultGearId: '' });
    expect(put.status).toBe(200);
    expect(put.body.defaultGearId).toBeNull();

    expect((await request(app).delete(`/api/fishing/refs/${post.body.id}`)).status).toBe(204);
  });

  it('refuse un engin par défaut inconnu ou qui est une espèce (400)', async () => {
    const inconnu = await request(app)
      .post('/api/fishing/refs')
      .send({ kind: 'species', label: 'Truite', defaultGearId: 'filet' });
    expect(inconnu.status).toBe(400);
    const espece = await request(app).put('/api/fishing/refs/bar').send({ label: 'Bar', defaultGearId: 'tourteau' });
    expect(espece.status).toBe(400);
    const pasUneChaine = await request(app).put('/api/fishing/refs/bar').send({ label: 'Bar', defaultGearId: 3 });
    expect(pasUneChaine.status).toBe(400);
  });

  it('ignore l’engin par défaut d’un engin', async () => {
    const put = await request(app)
      .put('/api/fishing/refs/ligne')
      .send({ label: 'Ligne', labelPlural: 'Lignes', defaultGearId: 'casier-crabes' });
    expect(put.status).toBe(200);
    expect(put.body.defaultGearId).toBeNull();
  });
```

- [ ] **Step 3: Vérifier l'échec**

Run: `cd server && npx vitest run src/routes/fishing.test.ts`
Expected: FAIL (les nouveaux tests : `defaultGearId` ignoré par les routes, pas de 400).

- [ ] **Step 4: Implémenter**

Dans `server/src/routes/fishing.ts`, ajouter avant `createFishingRouter` :

```ts
/**
 * `defaultGearId` du corps d'un référentiel : absent, `null` ou `''` → `null` (aucun défaut) ; un
 * id d'engin existant → cet id ; toute autre valeur → `undefined`, que la route traduit en 400.
 * Pas de clé étrangère en base (cf. `deleteRef`) : c'est ici que la cohérence est tenue.
 */
function parseDefaultGear(o: Record<string, unknown>): string | null | undefined {
  const v = o.defaultGearId;
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !refExists(getDb(), v, 'gear')) return undefined;
  return v;
}

const BAD_DEFAULT_GEAR = { error: 'defaultGearId doit désigner un engin existant.' };
```

Dans `router.post('/fishing/refs', …)`, remplacer `res.status(201).json(addRef(getDb(), kind, label, labelPlural));` par :

```ts
      const defaultGearId = parseDefaultGear(o);
      if (defaultGearId === undefined) return res.status(400).json(BAD_DEFAULT_GEAR);
      res.status(201).json(addRef(getDb(), kind, label, labelPlural, defaultGearId));
```

Dans `router.put('/fishing/refs/:id', …)`, remplacer `const updated = updateRef(getDb(), req.params.id, label, labelPlural);` par :

```ts
      const defaultGearId = parseDefaultGear(o);
      if (defaultGearId === undefined) return res.status(400).json(BAD_DEFAULT_GEAR);
      // Pour un engin, le repository force `NULL` : un défaut valide y est simplement ignoré.
      const updated = updateRef(getDb(), req.params.id, label, labelPlural, defaultGearId);
```

Compléter le commentaire de la liste des routes (ligne ~95) :
` *   \`defaultGearId\` facultatif sur \`POST\`/\`PUT\` (engin existant, sinon 400).`

- [ ] **Step 5: Tests et types**

Run: `npm -w server test && npm -w server run type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/fishing.ts server/src/routes/fishing.test.ts
git commit -m "feat(peche): routes des référentiels acceptent l'engin par défaut

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Type, API, composable et règle pure (client)

**Files:**
- Modify: `client/src/types.ts:215-224`, `client/src/api/fishing.ts:45-66`,
  `client/src/composables/useFishingRefs.ts:49-56`, `client/src/lib/fishing.ts`
- Test: `client/src/lib/fishing.test.ts`

**Interfaces:**
- Consumes: contrat REST de la tâche 2.
- Produces:
  - `FishingRef.defaultGearId?: string | null`
  - `defaultGearFor(speciesId: string, species: FishingRef[], gears: FishingRef[]): string | null` (`lib/fishing.ts`)
  - `addRef(kind, label, labelPlural = '', defaultGearId: string | null = null)` et
    `updateRef(id, label, labelPlural = '', defaultGearId: string | null = null)` (`api/fishing.ts`)
  - `useFishingRefs().add(kind, label, labelPlural = '', defaultGearId: string | null = null)` et
    `.update(id, label, labelPlural = '', defaultGearId: string | null = null)`

- [ ] **Step 1: Écrire le test**

Dans `client/src/lib/fishing.test.ts`, ajouter `defaultGearFor` à l'import de `./fishing`, puis :

```ts
describe('defaultGearFor', () => {
  const species: FishingRef[] = [
    { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux', defaultGearId: 'casier-crabes' },
    { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars', defaultGearId: null },
    { id: 'morgate', kind: 'species', label: 'Morgate', labelPlural: 'Morgates', defaultGearId: 'casier-morgates' },
    { id: 'vieille', kind: 'species', label: 'Vieille', labelPlural: 'Vieilles' }
  ];
  const gears: FishingRef[] = [
    { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes', defaultGearId: null },
    { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes', defaultGearId: null }
  ];

  it('rend l’engin par défaut de l’espèce', () => {
    expect(defaultGearFor('tourteau', species, gears)).toBe('casier-crabes');
  });

  it('rend null pour une espèce sans défaut, même si le champ est absent', () => {
    expect(defaultGearFor('bar', species, gears)).toBeNull();
    expect(defaultGearFor('vieille', species, gears)).toBeNull();
  });

  it('rend null si le défaut désigne un engin absent de la liste', () => {
    expect(defaultGearFor('morgate', species, gears)).toBeNull();
  });

  it('rend null pour une espèce inconnue', () => {
    expect(defaultGearFor('licorne', species, gears)).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `cd client && npx vitest run src/lib/fishing.test.ts`
Expected: FAIL (`defaultGearFor` n'est pas exporté).

- [ ] **Step 3: Implémenter**

`client/src/types.ts`, dans `FishingRef` après `labelPlural` :

```ts
  /**
   * Engin pré-sélectionné quand on choisit cette espèce dans le formulaire de sortie (`null` =
   * aucun ; toujours `null` pour un engin). Le serveur l'envoie toujours ; facultatif ici pour que
   * les fixtures de test antérieures restent valides.
   */
  defaultGearId?: string | null;
```

`client/src/lib/fishing.ts`, à la suite de `summarizeCatches` :

```ts
/**
 * Engin à pré-sélectionner pour une espèce : son `defaultGearId` s'il désigne un engin **présent
 * dans la liste**, sinon `null` — l'appelant garde alors l'engin courant. Un défaut vers un engin
 * disparu (référentiel modifié dans un autre onglet) ne doit pas sélectionner une option absente.
 */
export function defaultGearFor(speciesId: string, species: FishingRef[], gears: FishingRef[]): string | null {
  const gearId = species.find(s => s.id === speciesId)?.defaultGearId;
  return gearId && gears.some(g => g.id === gearId) ? gearId : null;
}
```

`client/src/api/fishing.ts` — remplacer `addRef` et `updateRef` :

```ts
/**
 * POST /api/fishing/refs (**admin**). `labelPlural` est facultatif : vide ou absent, le serveur
 * le fait valoir `label`. `defaultGearId` n'a de sens que pour une espèce (`null` = aucun).
 */
export function addRef(
  kind: FishingRefKind,
  label: string,
  labelPlural = '',
  defaultGearId: string | null = null
): Promise<FishingRef> {
  return fetchJson<FishingRef>('/api/fishing/refs', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, label, labelPlural, defaultGearId })
  });
}

/**
 * PUT /api/fishing/refs/:id (**admin**) — libellés et engin par défaut changent ; l'id et le type
 * sont figés. C'est un remplacement : `defaultGearId` à `null` efface le défaut.
 */
export function updateRef(
  id: string,
  label: string,
  labelPlural = '',
  defaultGearId: string | null = null
): Promise<FishingRef> {
  return fetchJson<FishingRef>(`/api/fishing/refs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ label, labelPlural, defaultGearId })
  });
}
```

`client/src/composables/useFishingRefs.ts` — remplacer `add` et `update` :

```ts
  async function add(
    kind: FishingRefKind,
    label: string,
    labelPlural = '',
    defaultGearId: string | null = null
  ): Promise<void> {
    refs.value = [...refs.value, await apiAdd(kind, label, labelPlural, defaultGearId)];
  }

  async function update(
    id: string,
    label: string,
    labelPlural = '',
    defaultGearId: string | null = null
  ): Promise<void> {
    const updated = await apiUpdate(id, label, labelPlural, defaultGearId);
    refs.value = refs.value.map(r => (r.id === id ? updated : r));
  }
```

- [ ] **Step 4: Tests et types**

Run: `cd client && npx vitest run src/lib/fishing.test.ts && cd .. && npm -w client run type-check`
Expected: PASS. (`FishingRefsPanel.test.ts` passe encore : le panneau n'envoie pas encore le 4ᵉ argument.)

- [ ] **Step 5: Commit**

```bash
git add client/src/types.ts client/src/api/fishing.ts client/src/composables/useFishingRefs.ts client/src/lib/fishing.ts client/src/lib/fishing.test.ts
git commit -m "feat(peche): règle defaultGearFor et contrat client de l'engin par défaut

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Pré-sélection dans le formulaire de sortie

**Files:**
- Modify: `client/src/components/FishingTripForm.vue` (script ~l. 1-4 et 108-120, template ~l. 235-243)
- Test: `client/src/components/FishingTripForm.test.ts`

**Interfaces:**
- Consumes: `defaultGearFor` (tâche 3).

- [ ] **Step 1: Écrire les tests**

Dans `client/src/components/FishingTripForm.test.ts`, ajouter à `SPECIES` une espèce avec défaut
et à `GEARS` le casier correspondant, **sans changer l'ordre existant** (`bar` reste premier, sans
défaut, pour que les tests actuels gardent la `ligne`) :

```ts
const SPECIES: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars', defaultGearId: null },
  { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux', defaultGearId: 'casier-crabes' },
  {
    id: 'crevette-bouquet',
    kind: 'species',
    label: 'Crevette bouquet',
    labelPlural: 'Crevettes bouquet',
    defaultGearId: 'casier-crevettes'
  }
];
const GEARS: FishingRef[] = [
  { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes', defaultGearId: null },
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes', labelPlural: 'Casiers à crabes', defaultGearId: null },
  { id: 'casier-crevettes', kind: 'gear', label: 'Casier à crevettes', labelPlural: 'Casiers à crevettes', defaultGearId: null }
];
```

Puis ajouter dans le `describe` :

```ts
  describe('engin par défaut', () => {
    it('choisir une espèce sélectionne son engin par défaut', async () => {
      const wrapper = factory();
      await wrapper.find('[data-test="add-catch"]').trigger('click');
      expect(valueOf(wrapper, 'gear')).toBe('ligne');
      await wrapper.find('[data-test="species"]').setValue('crevette-bouquet');
      expect(valueOf(wrapper, 'gear')).toBe('casier-crevettes');
      await wrapper.find('[data-test="species"]').setValue('tourteau');
      expect(valueOf(wrapper, 'gear')).toBe('casier-crabes');
    });

    it('garde un engin changé à la main, et une espèce sans défaut n’y touche pas', async () => {
      const wrapper = factory();
      await wrapper.find('[data-test="add-catch"]').trigger('click');
      await wrapper.find('[data-test="species"]').setValue('tourteau');
      await wrapper.find('[data-test="gear"]').setValue('casier-crevettes');
      expect(valueOf(wrapper, 'gear')).toBe('casier-crevettes');
      await wrapper.find('[data-test="species"]').setValue('bar');
      expect(valueOf(wrapper, 'gear')).toBe('casier-crevettes');
    });

    it('émet l’engin choisi à la main, pas le défaut', async () => {
      const wrapper = factory();
      await wrapper.find('[data-test="add-catch"]').trigger('click');
      await wrapper.find('[data-test="species"]').setValue('tourteau');
      await wrapper.find('[data-test="gear"]').setValue('ligne');
      await wrapper.find('form').trigger('submit');
      const saved = wrapper.emitted('save')![0][0] as { catches: { speciesId: string; gearId: string }[] };
      expect(saved.catches[0]).toMatchObject({ speciesId: 'tourteau', gearId: 'ligne' });
    });

    it('une prise ajoutée démarre sur l’engin par défaut de la première espèce', async () => {
      const wrapper = factory({ species: [SPECIES[2], SPECIES[0]] });
      await wrapper.find('[data-test="add-catch"]').trigger('click');
      expect(valueOf(wrapper, 'species')).toBe('crevette-bouquet');
      expect(valueOf(wrapper, 'gear')).toBe('casier-crevettes');
    });

    it('n’altère aucun engin à l’ouverture d’une sortie existante', () => {
      const trip: FishingTrip = {
        id: 8,
        date: '2026-07-04',
        startTime: '06:30',
        endTime: null,
        notes: null,
        baited: false,
        weather: null,
        catches: [
          { speciesId: 'tourteau', gearId: 'ligne', quantity: 1, sizeCm: null, weightG: null, kept: true }
        ],
        createdAt: 'x',
        updatedAt: 'x'
      };
      const wrapper = factory({ initial: trip });
      expect(valueOf(wrapper, 'gear')).toBe('ligne');
    });
  });
```

(Si le type `FishingTrip` exige d'autres champs que ceux-ci, reprendre la forme de la fixture du
test existant « reprend une sortie existante en édition ».)

- [ ] **Step 2: Vérifier l'échec**

Run: `cd client && npx vitest run src/components/FishingTripForm.test.ts`
Expected: FAIL sur « choisir une espèce… » et « une prise ajoutée démarre… » ; les autres passent déjà.

- [ ] **Step 3: Implémenter**

Script de `FishingTripForm.vue` — ajouter l'import (à côté de `import type { AflotChoice } …`) :

```ts
import { defaultGearFor } from '../lib/fishing';
```

Remplacer `addCatch` et ajouter `onSpeciesChange` :

```ts
function addCatch(): void {
  const speciesId = props.species[0]?.id ?? '';
  catches.value = [
    ...catches.value,
    {
      speciesId,
      gearId: defaultGearFor(speciesId, props.species, props.gears) ?? props.gears[0]?.id ?? '',
      quantity: '1',
      sizeCm: '',
      weightG: '',
      kept: true
    }
  ];
}

/**
 * Choisir une espèce pré-sélectionne son engin habituel ; une espèce sans défaut laisse l'engin
 * tel quel. Branché sur `@change` et **pas** sur un `watch` de `speciesId` : un `watch` partirait
 * aussi au chargement d'une sortie existante et réécrirait l'engin saisi. La valeur est lue sur
 * l'événement plutôt que sur `c.speciesId`, pour ne pas dépendre de l'ordre d'exécution entre ce
 * gestionnaire et celui du `v-model`.
 */
function onSpeciesChange(c: CatchDraft, speciesId: string): void {
  const gearId = defaultGearFor(speciesId, props.species, props.gears);
  if (gearId) c.gearId = gearId;
}
```

Template, sur le `<select>` d'espèce (`data-test="species"`), ajouter :

```html
              @change="onSpeciesChange(c, ($event.target as HTMLSelectElement).value)"
```

- [ ] **Step 4: Tests et types**

Run: `cd client && npx vitest run src/components/FishingTripForm.test.ts && cd .. && npm -w client run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/FishingTripForm.vue client/src/components/FishingTripForm.test.ts
git commit -m "feat(peche): choisir une espèce pré-sélectionne son engin

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Engin par défaut dans le panneau des référentiels

**Files:**
- Modify: `client/src/components/FishingRefsPanel.vue`
- Test: `client/src/components/FishingRefsPanel.test.ts`

**Interfaces:**
- Consumes: `useFishingRefs().add(kind, label, labelPlural, defaultGearId)` / `.update(id, label, labelPlural, defaultGearId)` (tâche 3).

- [ ] **Step 1: Adapter les tests existants**

Dans `FishingRefsPanel.test.ts`, les trois `toHaveBeenCalledWith` prennent un 4ᵉ argument `null` :
`('species', 'Homard', 'Homards', null)`, `('gear', 'Épuisette', '', null)`,
`('bar', 'Bar rayé', 'Bars rayés', null)`.

Dans le `beforeEach`, donner un défaut au tourteau :
`{ id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux', defaultGearId: 'casier' }`.

- [ ] **Step 2: Écrire les tests**

```ts
  describe('engin par défaut', () => {
    it('affiche l’engin par défaut à côté de l’espèce', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      expect(wrapper.find('[data-test-ref="tourteau"] [data-test="default-gear"]').text()).toContain('Casier');
      expect(wrapper.find('[data-test-ref="bar"] [data-test="default-gear"]').exists()).toBe(false);
    });

    it('propose le choix à l’ajout d’une espèce, pas d’un engin', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      expect(wrapper.find('[data-test="new-default-gear"]').exists()).toBe(true);
      await wrapper.find('[data-test="new-kind"]').setValue('gear');
      expect(wrapper.find('[data-test="new-default-gear"]').exists()).toBe(false);
    });

    it('envoie l’engin par défaut choisi à l’ajout', async () => {
      api.addRef.mockResolvedValue({
        id: 'morgate',
        kind: 'species',
        label: 'Morgate',
        labelPlural: 'Morgates',
        defaultGearId: 'casier'
      });
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      await wrapper.find('[data-test="new-label"]').setValue('Morgate');
      await wrapper.find('[data-test="new-default-gear"]').setValue('casier');
      await wrapper.find('[data-test="add-form"]').trigger('submit');
      await flushPromises();
      expect(api.addRef).toHaveBeenCalledWith('species', 'Morgate', '', 'casier');
    });

    it('modifie l’engin par défaut d’une espèce, sélecteur prérempli', async () => {
      api.updateRef.mockResolvedValue({
        id: 'tourteau',
        kind: 'species',
        label: 'Tourteau',
        labelPlural: 'Tourteaux',
        defaultGearId: 'ligne'
      });
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      const row = wrapper.find('[data-test-ref="tourteau"]');
      await row.find('[data-test="edit"]').trigger('click');
      const select = row.find('[data-test="edit-default-gear"]');
      expect((select.element as HTMLSelectElement).value).toBe('casier');
      await select.setValue('ligne');
      await row.find('[data-test="edit-save"]').trigger('click');
      await flushPromises();
      expect(api.updateRef).toHaveBeenCalledWith('tourteau', 'Tourteau', 'Tourteaux', 'ligne');
    });

    it('« aucun » envoie null', async () => {
      api.updateRef.mockResolvedValue({
        id: 'tourteau',
        kind: 'species',
        label: 'Tourteau',
        labelPlural: 'Tourteaux',
        defaultGearId: null
      });
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      const row = wrapper.find('[data-test-ref="tourteau"]');
      await row.find('[data-test="edit"]').trigger('click');
      await row.find('[data-test="edit-default-gear"]').setValue('');
      await row.find('[data-test="edit-save"]').trigger('click');
      await flushPromises();
      expect(api.updateRef).toHaveBeenCalledWith('tourteau', 'Tourteau', 'Tourteaux', null);
    });

    it('ne propose pas d’engin par défaut à l’édition d’un engin', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      const row = wrapper.find('[data-test-ref="ligne"]');
      await row.find('[data-test="edit"]').trigger('click');
      expect(row.find('[data-test="edit-default-gear"]').exists()).toBe(false);
    });
  });
```

- [ ] **Step 3: Vérifier l'échec**

Run: `cd client && npx vitest run src/components/FishingRefsPanel.test.ts`
Expected: FAIL (sélecteurs absents, 4ᵉ argument non envoyé).

- [ ] **Step 4: Implémenter le script**

Dans `FishingRefsPanel.vue` :

```ts
/**
 * Le pluriel est **saisi**, pas calculé (« lieu jaune » → « lieus jaunes »). Il reste facultatif :
 * laissé vide, le serveur le fait valoir le singulier, ce qui convient à « Crevette bouquet » comme
 * à un engin qu'on ne comptera jamais. `defaultGearId` : `''` = aucun (valeur de l'option vide).
 */
const draft = reactive<{ kind: FishingRefKind; label: string; labelPlural: string; defaultGearId: string }>({
  kind: 'species',
  label: '',
  labelPlural: '',
  defaultGearId: ''
});

const editingId = ref<string | null>(null);
const editLabel = ref('');
const editPlural = ref('');
const editGear = ref('');

/** Libellé de chaque engin, pour afficher le défaut d'une espèce sans appel de fonction au rendu. */
const gearLabels = computed(() => new Map(gears.value.map(g => [g.id, g.label])));

/** L'option vide vaut « aucun » ; un engin n'a jamais de défaut. */
const gearOrNull = (kind: FishingRefKind, value: string): string | null =>
  kind === 'species' && value ? value : null;
```

`onAdd` :

```ts
function onAdd(): void {
  const label = draft.label.trim();
  if (!label) return;
  run(async () => {
    await add(draft.kind, label, draft.labelPlural.trim(), gearOrNull(draft.kind, draft.defaultGearId));
    draft.label = '';
    draft.labelPlural = '';
    draft.defaultGearId = '';
  });
}
```

`startEdit` et `saveEdit` (qui prend désormais l'entrée, pour connaître son type) :

```ts
function startEdit(entry: FishingRef): void {
  editingId.value = entry.id;
  editLabel.value = entry.label;
  editPlural.value = entry.labelPlural;
  editGear.value = entry.defaultGearId ?? '';
}

function saveEdit(entry: FishingRef): void {
  const label = editLabel.value.trim();
  if (!label) return;
  run(async () => {
    await update(entry.id, label, editPlural.value.trim(), gearOrNull(entry.kind, editGear.value));
    editingId.value = null;
  });
}
```

- [ ] **Step 5: Implémenter le template**

Dans le formulaire d'ajout, après le bloc `col-12` du pluriel (`data-test="new-plural"`) :

```html
        <div v-if="draft.kind === 'species'" class="col-12">
          <select
            v-model="draft.defaultGearId"
            class="form-select form-select-sm"
            aria-label="Engin par défaut"
            data-test="new-default-gear"
          >
            <option value="">Engin par défaut : aucun</option>
            <option v-for="g in gears" :key="g.id" :value="g.id">{{ g.label }}</option>
          </select>
        </div>
```

En mode édition, entre l'`<input data-test="edit-label">` et le `<div class="d-flex gap-2">` :

```html
              <select
                v-if="item.kind === 'species'"
                v-model="editGear"
                class="form-select form-select-sm"
                aria-label="Engin par défaut"
                data-test="edit-default-gear"
              >
                <option value="">Engin par défaut : aucun</option>
                <option v-for="g in gears" :key="g.id" :value="g.id">{{ g.label }}</option>
              </select>
```

Le bouton `data-test="edit-save"` appelle `saveEdit(item)` au lieu de `saveEdit(item.id)`.

En affichage, après le `<span v-if="item.labelPlural !== item.label" …>` du pluriel, toujours dans
le `<span>` du libellé :

```html
                <!-- Engin pré-sélectionné par le formulaire de sortie ; rien si aucun. -->
                <span
                  v-if="item.defaultGearId && gearLabels.has(item.defaultGearId)"
                  class="text-muted small"
                  title="Engin par défaut"
                  data-test="default-gear"
                >
                  <i class="bi bi-arrow-right-short"></i>{{ gearLabels.get(item.defaultGearId) }}
                </span>
```

- [ ] **Step 6: Tests et types**

Run: `cd client && npx vitest run src/components/FishingRefsPanel.test.ts && cd .. && npm -w client run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/FishingRefsPanel.vue client/src/components/FishingRefsPanel.test.ts
git commit -m "feat(peche): engin par défaut réglable dans le panneau des référentiels

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Documentation et vérification finale

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mettre à jour `CLAUDE.md`**

1. Section « Routes carnet de pêche », après le paragraphe du pluriel (qui finit par « Un renommage
   ou un pluriel déjà saisi n'est jamais écrasé. »), ajouter :

```markdown
- **Engin par défaut d'une espèce** (`defaultGearId`, v10) : l'engin que le formulaire
  pré-sélectionne quand on choisit l'espèce — **une donnée saisie** dans le panneau, pas une règle
  (même raison que le pluriel : `fishing_refs` ne sait pas ce qu'est un casier). `POST`/`PUT`
  l'acceptent **facultatif** : absent, `null` ou `''` = aucun ; un id qui n'est pas un engin
  existant → **400** (pas de clé étrangère, la route tient la cohérence) ; forcé à `NULL` pour un
  engin. Le `PUT` **remplace** : absent, il efface le défaut. Supprimer un engin **efface** le défaut
  des espèces qui le portaient au lieu de refuser — ce n'est qu'une commodité de saisie.
  ⚠️ Le complément d'une base existante (entrées ajoutées à la graine en v10 — casier à morgates,
  morgate — puis défauts des espèces de la graine au libellé inchangé) est fait **dans le palier de
  migration**, donc **une seule fois**, et **pas** rejoué par `initStorage` comme
  `backfillSeedPlurals` : un pluriel `NULL` voulait toujours dire « jamais renseigné », alors qu'un
  défaut `NULL` peut être un choix ; rejoué, il remettrait un défaut retiré ou une entrée
  supprimée. Le palier ne fait rien sur une table vide (base neuve : l'amorçage s'en charge).
  Spec : `docs/superpowers/specs/2026-09-23-engin-par-defaut-espece-design.md`.
```

2. Section Persistance : `Schéma **v9**` → `Schéma **v10**` ; après « …le `NOT NULL` n'est permis
   que parce que le `DEFAULT` est non nul) » insérer « et la colonne **`fishing_refs.default_gear_id`**
   (v10 : engin par défaut d'une espèce, cf. routes ci-dessus) » (en ajustant « et » → « , » devant
   `fishing_trips.baited`) ; « les paliers v3, v6, v8 et v9 » → « les paliers v3, v6, v8, v9 et v10 ».
   Dans la liste du repository, ajouter `upgradeFishingRefsToV10` après `seedFishingRefsIfEmpty`.

3. Section client « Carnet de pêche », après le paragraphe « Casiers boëttés » :

```markdown
  **Engin par défaut** : choisir une espèce dans le formulaire sélectionne son `defaultGearId`
  (`lib/fishing.defaultGearFor`, qui rend `null` si l'engin n'est pas dans la liste) ; une espèce
  sans défaut laisse l'engin tel quel, et un engin changé à la main tient jusqu'au prochain
  changement d'espèce. ⚠️ Branché sur **`@change`**, pas sur un `watch` de `speciesId` : un `watch`
  partirait aussi à l'ouverture d'une sortie existante et réécrirait l'engin saisi. Une prise
  ajoutée démarre sur l'engin par défaut de la première espèce.
```

- [ ] **Step 2: Vérification complète**

Run: `npm test && npm run type-check`
Expected: PASS sur les deux workspaces, sans erreur de types.

Run: `cd server && npx ts-node -e "const {openDb}=require('./src/db');const d=openDb('data/marees.db');console.log(d.pragma('user_version',{simple:true}),d.prepare(\"select id,default_gear_id from fishing_refs where kind='species' and default_gear_id is not null\").all())"`
Expected: `10` et les huit espèces avec défaut (étrille, crevette bouquet, tourteau, moussette,
araignée, crevette grise, homard, morgate). Ce contrôle **migre** la copie locale de la base de
prod (rapatriée par `npm run db:pull`) : c'est précisément la mise à niveau que subira la prod.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(peche): documente l'engin par défaut d'une espèce

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
