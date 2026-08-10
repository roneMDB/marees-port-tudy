# Carnet de pêche — plan d'implémentation (issue #3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collecter les sorties de pêche (date, heures, notes, météo figée, N lignes de prises) dans une vue dédiée `/peche`, avec des référentiels espèces/engins éditables.

**Architecture:** Serveur Express + SQLite (migration v7 : `fishing_trips`, `fishing_catches`, `fishing_refs`), routes `/api/fishing/*` en lecture ouverte / écriture `admin`. Client Vue 3 : introduction de `vue-router` (l'app était mono-vue), une vue `FishingView` avec formulaire inline, et des fonctions pures dans `lib/fishing.ts` pour le résumé des prises, le contexte marée et le pré-remplissage depuis la remise à flot.

**Tech Stack:** TypeScript strict, Express 4, better-sqlite3 11, Vitest + supertest (serveur), Vue 3 `<script setup>` + vue-router 4 + Bootstrap 5.3, Vitest + @vue/test-utils + jsdom (client).

**Spec de référence :** `docs/superpowers/specs/2026-08-10-gestion-peche-design.md`

## Global Constraints

- Langue : **tout en français** — code, commentaires, libellés d'interface, messages d'erreur, messages de commit.
- Serveur en **CommonJS**, TypeScript `strict`. Client en **ESM**, `strict`.
- Autorisation : lecture ouverte à tout compte connecté ; écriture réservée à `admin` via `requestRole(req) !== 'admin'` → **403** `{ error: 'Modification réservée au rôle administrateur.' }`.
- Ne jamais éditer les `dist/` (générés, gitignorés).
- `npm test` **et** `npm run type-check` : Vitest passe par esbuild et ne vérifie **aucun** type.
- Commits : conventional commits, scope `peche`, avec la ligne `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` et `Refs #3`.
- Le format des heures est `HH:MM` (regex `^([01]\d|2[0-3]):[0-5]\d$`), celui des dates `YYYY-MM-DD` (regex `^\d{4}-\d{2}-\d{2}$`).
- Aucune donnée de marée n'est stockée dans une sortie : le contexte marée est **recalculé** à l'affichage. Seule la **météo** est figée, et **uniquement à la création**.

---

## Structure des fichiers

**Serveur (`server/src/`)**

| Fichier | Responsabilité |
|---|---|
| `db/index.ts` *(modifié)* | migration v7, `SCHEMA_VERSION = 7`, `PRAGMA foreign_keys = ON` |
| `service/fishingSeed.ts` *(créé)* | graine des référentiels espèces/engins |
| `db/fishingRefsRepository.ts` *(créé)* | CRUD référentiels + garde « référentiel utilisé » |
| `db/fishingRepository.ts` *(créé)* | CRUD sorties + prises (transactions) |
| `service/fishingWeather.ts` *(créé)* | capture de l'instantané météo d'une date |
| `service/weather.ts` *(modifié)* | paramètre `pastDays`, export de `DEFAULT_LAT`/`DEFAULT_LON` |
| `routes/fishing.ts` *(créé)* | routeur `/api/fishing/*` + validation |
| `app.ts` *(modifié)* | montage du routeur |
| `db/bootstrap.ts` *(modifié)* | amorçage des référentiels |

**Client (`client/src/`)**

| Fichier | Responsabilité |
|---|---|
| `types.ts` *(modifié)* | miroir du contrat REST pêche |
| `router.ts` *(créé)* | `/` → Dashboard, `/peche` → FishingView |
| `main.ts`, `App.vue` *(modifiés)* | montage du routeur, lien « Pêche », panneau référentiels |
| `api/fishing.ts` *(créé)* | appels REST |
| `composables/useFishingRefs.ts` *(créé)* | singleton référentiels + CRUD |
| `composables/useFishing.ts` *(créé)* | singleton sorties + CRUD |
| `lib/fishing.ts` *(créé)* | **pur** : `summarizeCatches`, `tripTideContext`, `aflotChoices`, `nearestAflot` |
| `components/FishingTripCard.vue` *(créé)* | une sortie en lecture |
| `components/FishingTripForm.vue` *(créé)* | saisie d'une sortie |
| `components/FishingRefsPanel.vue` *(créé)* | offcanvas admin des référentiels |
| `views/FishingView.vue` *(créé)* | assemblage + états |

---

## Task 1 : Migration v7 et clés étrangères

**Files:**
- Modify: `server/src/db/index.ts` (constante `SCHEMA_VERSION`, bloc `migrate`, fonction `openDb`)
- Test: `server/src/db/index.test.ts`

**Interfaces:**
- Consumes: `openDb(file)`, `DB` (existants).
- Produces: base au schéma **v7** avec les tables `fishing_trips`, `fishing_catches`, `fishing_refs` et `PRAGMA foreign_keys = ON` actif sur toute connexion ouverte par `openDb`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin du `describe` existant de `server/src/db/index.test.ts` :

```ts
  it('crée les tables du carnet de pêche en v7', () => {
    const db = openDb(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r: any) => r.name);
    expect(tables).toContain('fishing_trips');
    expect(tables).toContain('fishing_catches');
    expect(tables).toContain('fishing_refs');
    expect(db.pragma('user_version', { simple: true })).toBe(7);
    db.close();
  });

  it('active les clés étrangères (sans quoi ON DELETE CASCADE serait inopérant)', () => {
    const db = openDb(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('supprime les prises en cascade avec leur sortie', () => {
    const db = openDb(':memory:');
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'bar', 'ligne', 2)"
    ).run();
    db.prepare('DELETE FROM fishing_trips WHERE id = 1').run();
    const rest = db.prepare('SELECT count(*) AS c FROM fishing_catches').get() as { c: number };
    expect(rest.c).toBe(0);
    db.close();
  });

  it('rejoue la migration v7 sans erreur (idempotence)', () => {
    const db = openDb(':memory:');
    db.pragma('user_version = 6');
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(7);
    db.close();
  });
```

Vérifier que `migrate` et `openDb` sont bien tous deux importés en tête du fichier de test ; sinon compléter l'import :

```ts
import { migrate, openDb } from './index';
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd server && npx vitest run src/db/index.test.ts`
Expected : FAIL — `expect(tables).toContain('fishing_trips')` échoue, et `user_version` vaut 6.

- [ ] **Step 3 : Écrire la migration**

Dans `server/src/db/index.ts`, passer la constante à 7 :

```ts
const SCHEMA_VERSION = 7;
```

Compléter le commentaire de `migrate` par une ligne :

```ts
 * v7 : carnet de pêche (`fishing_trips`, `fishing_catches`, `fishing_refs`, issue #3).
```

Ajouter le palier **avant** la ligne `db.pragma(\`user_version = ${SCHEMA_VERSION}\`);` :

```ts
  if (version < 7) {
    // Carnet de pêche (issue #3). Une sortie porte N prises ; la météo est un instantané JSON
    // figé à la création (observation non reproductible), le contexte marée n'est **pas** stocké
    // — il est recalculé à l'affichage, pour qu'une graine corrigée profite aux sorties passées.
    db.exec(`
      CREATE TABLE IF NOT EXISTS fishing_trips (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        date       TEXT NOT NULL,
        start_time TEXT,
        end_time   TEXT,
        notes      TEXT,
        weather    TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fishing_trips_date ON fishing_trips(date);

      CREATE TABLE IF NOT EXISTS fishing_catches (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        trip_id    INTEGER NOT NULL REFERENCES fishing_trips(id) ON DELETE CASCADE,
        species_id TEXT NOT NULL,
        gear_id    TEXT NOT NULL,
        quantity   INTEGER NOT NULL,
        size_cm    REAL,
        weight_g   INTEGER,
        kept       INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_fishing_catches_trip ON fishing_catches(trip_id);

      CREATE TABLE IF NOT EXISTS fishing_refs (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        label      TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
    `);
  }
```

Dans `openDb`, activer les clés étrangères **avant** `migrate(db)` :

```ts
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  // better-sqlite3 laisse `foreign_keys` à OFF : sans cette ligne, le ON DELETE CASCADE de
  // `fishing_catches` ne s'appliquerait jamais et laisserait des prises orphelines (issue #3).
  db.pragma('foreign_keys = ON');
  migrate(db);
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd server && npx vitest run src/db/index.test.ts`
Expected : PASS, tous les tests du fichier.

- [ ] **Step 5 : Commit**

```bash
git add server/src/db/index.ts server/src/db/index.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): schéma v7 du carnet de pêche et activation des clés étrangères

better-sqlite3 laisse PRAGMA foreign_keys à OFF : le ON DELETE CASCADE
des prises serait resté lettre morte.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 : Graine et référentiels espèces/engins

**Files:**
- Create: `server/src/service/fishingSeed.ts`
- Create: `server/src/db/fishingRefsRepository.ts`
- Test: `server/src/db/fishingRefsRepository.test.ts`

**Interfaces:**
- Consumes: `DB`, `openDb` (Task 1).
- Produces:
  - `type FishingRefKind = 'species' | 'gear'`
  - `interface FishingRef { id: string; kind: FishingRefKind; label: string }`
  - `const FISHING_REFS_SEED: FishingRef[]`
  - `getRefs(db): FishingRef[]`
  - `refExists(db, id: string, kind: FishingRefKind): boolean`
  - `addRef(db, kind, label): FishingRef`
  - `updateRef(db, id, label): FishingRef | null`
  - `deleteRef(db, id): 'deleted' | 'missing' | 'in-use'`
  - `resetFishingRefs(db, seed): void`
  - `seedFishingRefsIfEmpty(db, seed): void`

- [ ] **Step 1 : Écrire la graine**

Créer `server/src/service/fishingSeed.ts` :

```ts
/**
 * Référentiels par défaut du carnet de pêche (issue #3) : engins et espèces amorcés en base au
 * premier démarrage (table `fishing_refs`). Ensuite éditables via l'API / le panneau admin ; ce
 * fichier reste la source du « Rétablir les défauts ».
 */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
}

export const FISHING_REFS_SEED: FishingRef[] = [
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes' },
  { id: 'casier-crevettes', kind: 'gear', label: 'Casier à crevettes' },
  { id: 'ligne', kind: 'gear', label: 'Ligne' },

  { id: 'tourteau', kind: 'species', label: 'Tourteau' },
  { id: 'etrille', kind: 'species', label: 'Étrille' },
  { id: 'araignee', kind: 'species', label: 'Araignée' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet' },
  { id: 'crevette-grise', kind: 'species', label: 'Crevette grise' },
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'dorade-grise', kind: 'species', label: 'Dorade grise' },
  { id: 'dorade-royale', kind: 'species', label: 'Dorade royale' },
  { id: 'vieille', kind: 'species', label: 'Vieille' },
  { id: 'lieu-jaune', kind: 'species', label: 'Lieu jaune' },
  { id: 'maquereau', kind: 'species', label: 'Maquereau' },
  { id: 'congre', kind: 'species', label: 'Congre' },
  { id: 'seiche', kind: 'species', label: 'Seiche' },
  { id: 'mulet', kind: 'species', label: 'Mulet' }
];
```

- [ ] **Step 2 : Écrire les tests qui échouent**

Créer `server/src/db/fishingRefsRepository.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  addRef,
  deleteRef,
  getRefs,
  refExists,
  resetFishingRefs,
  seedFishingRefsIfEmpty,
  updateRef
} from './fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';

describe('fishingRefsRepository', () => {
  it('renvoie une liste vide sur une base neuve', () => {
    const db = openDb(':memory:');
    expect(getRefs(db)).toEqual([]);
    db.close();
  });

  it('amorce la graine une seule fois (idempotent)', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    expect(getRefs(db)).toHaveLength(FISHING_REFS_SEED.length);
    db.close();
  });

  it('ordonne les engins avant les espèces, dans l’ordre de la graine', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    const refs = getRefs(db);
    expect(refs[0]).toEqual({ id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes' });
    expect(refs.filter(r => r.kind === 'gear')).toHaveLength(3);
    db.close();
  });

  it('ajoute une entrée avec un id slug unique', () => {
    const db = openDb(':memory:');
    expect(addRef(db, 'species', 'Homard')).toEqual({ id: 'homard', kind: 'species', label: 'Homard' });
    expect(addRef(db, 'species', 'Homard')).toEqual({ id: 'homard-2', kind: 'species', label: 'Homard' });
    db.close();
  });

  it('met à jour un libellé sans changer l’id', () => {
    const db = openDb(':memory:');
    addRef(db, 'species', 'Homard');
    expect(updateRef(db, 'homard', 'Homard bleu')).toEqual({ id: 'homard', kind: 'species', label: 'Homard bleu' });
    expect(updateRef(db, 'inconnu', 'Rien')).toBeNull();
    db.close();
  });

  it('refuse de supprimer un référentiel utilisé par une prise', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'bar', 'ligne', 1)"
    ).run();
    expect(deleteRef(db, 'bar')).toBe('in-use');
    expect(deleteRef(db, 'ligne')).toBe('in-use');
    expect(deleteRef(db, 'congre')).toBe('deleted');
    expect(deleteRef(db, 'inconnu')).toBe('missing');
    db.close();
  });

  it('rétablit la graine en écrasant les ajouts non utilisés', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    addRef(db, 'species', 'Homard');
    resetFishingRefs(db, FISHING_REFS_SEED);
    expect(getRefs(db)).toHaveLength(FISHING_REFS_SEED.length);
    expect(getRefs(db).some(r => r.id === 'homard')).toBe(false);
    db.close();
  });

  it('conserve au reset une entrée personnalisée encore utilisée par une prise', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    addRef(db, 'species', 'Homard');
    db.prepare(
      "INSERT INTO fishing_trips (id, date, created_at, updated_at) VALUES (1, '2026-08-10', 'x', 'x')"
    ).run();
    db.prepare(
      "INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity) VALUES (1, 'homard', 'ligne', 1)"
    ).run();

    resetFishingRefs(db, FISHING_REFS_SEED);

    const refs = getRefs(db);
    expect(refs.some(r => r.id === 'homard')).toBe(true);
    // Rangée après la graine, pas au milieu.
    expect(refs.at(-1)!.id).toBe('homard');
    expect(refs).toHaveLength(FISHING_REFS_SEED.length + 1);
    db.close();
  });

  it('rétablit le libellé d’une entrée de graine renommée', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    updateRef(db, 'bar', 'Bar moucheté');
    resetFishingRefs(db, FISHING_REFS_SEED);
    expect(getRefs(db).find(r => r.id === 'bar')!.label).toBe('Bar');
    db.close();
  });

  it('sait dire si un id existe avec le bon type', () => {
    const db = openDb(':memory:');
    seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
    expect(refExists(db, 'bar', 'species')).toBe(true);
    expect(refExists(db, 'bar', 'gear')).toBe(false);
    expect(refExists(db, 'inconnu', 'species')).toBe(false);
    db.close();
  });
});
```

- [ ] **Step 3 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd server && npx vitest run src/db/fishingRefsRepository.test.ts`
Expected : FAIL — `Cannot find module './fishingRefsRepository'`.

- [ ] **Step 4 : Écrire le repository**

Créer `server/src/db/fishingRefsRepository.ts` :

```ts
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
          `SELECT id, kind, label FROM fishing_refs
           WHERE id IN (SELECT species_id FROM fishing_catches UNION SELECT gear_id FROM fishing_catches)
           ORDER BY sort_order, id`
        )
        .all() as RefRow[]
    )
      .map(r => ({ id: r.id, kind: r.kind as FishingRefKind, label: r.label }))
      .filter(r => !seedIds.has(r.id));
    db.prepare('DELETE FROM fishing_refs').run();
    insertSeed(db, [...seed, ...kept]);
  })();
}
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd server && npx vitest run src/db/fishingRefsRepository.test.ts`
Expected : PASS, 8 tests.

- [ ] **Step 6 : Commit**

```bash
git add server/src/service/fishingSeed.ts server/src/db/fishingRefsRepository.ts server/src/db/fishingRefsRepository.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): référentiels espèces et engins, amorcés et éditables

Suppression refusée (in-use) quand une prise s'y réfère encore : sans clé
étrangère, c'est la seule garde qui protège l'historique.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 : Repository des sorties et des prises

**Files:**
- Create: `server/src/db/fishingRepository.ts`
- Test: `server/src/db/fishingRepository.test.ts`

**Interfaces:**
- Consumes: `DB`, `openDb` (Task 1).
- Produces:
  - `interface TripWeather { tempMin: number | null; tempMax: number | null; windMax: number | null; windDir: number | null; weatherCode: number | null; seaTemperature: number | null }`
  - `interface FishingCatch { speciesId: string; gearId: string; quantity: number; sizeCm: number | null; weightG: number | null; kept: boolean }`
  - `interface FishingTrip { id: number; date: string; startTime: string | null; endTime: string | null; notes: string | null; weather: TripWeather | null; catches: FishingCatch[]; createdAt: string; updatedAt: string }`
  - `interface FishingTripInput { date: string; startTime: string | null; endTime: string | null; notes: string | null; catches: FishingCatch[] }`
  - `listTrips(db, from?: string, to?: string): FishingTrip[]`
  - `getTrip(db, id: number): FishingTrip | null`
  - `createTrip(db, input, weather: TripWeather | null, nowIso: string): FishingTrip`
  - `updateTrip(db, id, input, nowIso: string): FishingTrip | null`
  - `deleteTrip(db, id): boolean`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `server/src/db/fishingRepository.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from './index';
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTrips,
  updateTrip,
  type FishingTripInput
} from './fishingRepository';

const NOW = '2026-08-10T18:00:00.000Z';

function input(over: Partial<FishingTripInput> = {}): FishingTripInput {
  return {
    date: '2026-08-10',
    startTime: '19:42',
    endTime: null,
    notes: null,
    catches: [
      { speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true },
      { speciesId: 'tourteau', gearId: 'casier-crabes', quantity: 3, sizeCm: null, weightG: null, kept: true }
    ],
    ...over
  };
}

describe('fishingRepository', () => {
  it('renvoie une liste vide sur une base neuve', () => {
    const db = openDb(':memory:');
    expect(listTrips(db)).toEqual([]);
    db.close();
  });

  it('crée une sortie avec ses prises, dans l’ordre de saisie', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input(), null, NOW);
    expect(trip.id).toBeGreaterThan(0);
    expect(trip.date).toBe('2026-08-10');
    expect(trip.startTime).toBe('19:42');
    expect(trip.catches).toHaveLength(2);
    expect(trip.catches[0]).toEqual({
      speciesId: 'bar',
      gearId: 'ligne',
      quantity: 1,
      sizeCm: 42,
      weightG: null,
      kept: true
    });
    expect(trip.catches[1].speciesId).toBe('tourteau');
    db.close();
  });

  it('accepte une sortie bredouille (aucune prise)', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input({ catches: [] }), null, NOW);
    expect(trip.catches).toEqual([]);
    expect(listTrips(db)).toHaveLength(1);
    db.close();
  });

  it('conserve l’instantané météo tel quel', () => {
    const db = openDb(':memory:');
    const weather = { tempMin: 14, tempMax: 22, windMax: 18, windDir: 250, weatherCode: 3, seaTemperature: 19.5 };
    const trip = createTrip(db, input(), weather, NOW);
    expect(getTrip(db, trip.id)!.weather).toEqual(weather);
    db.close();
  });

  it('liste les sorties de la plus récente à la plus ancienne', () => {
    const db = openDb(':memory:');
    createTrip(db, input({ date: '2026-08-01' }), null, NOW);
    createTrip(db, input({ date: '2026-08-09' }), null, NOW);
    createTrip(db, input({ date: '2026-08-05' }), null, NOW);
    expect(listTrips(db).map(t => t.date)).toEqual(['2026-08-09', '2026-08-05', '2026-08-01']);
    db.close();
  });

  it('filtre sur une plage de dates inclusive', () => {
    const db = openDb(':memory:');
    createTrip(db, input({ date: '2026-08-01' }), null, NOW);
    createTrip(db, input({ date: '2026-08-05' }), null, NOW);
    createTrip(db, input({ date: '2026-08-09' }), null, NOW);
    expect(listTrips(db, '2026-08-05', '2026-08-09').map(t => t.date)).toEqual(['2026-08-09', '2026-08-05']);
    expect(listTrips(db, '2026-08-05', '2026-08-05').map(t => t.date)).toEqual(['2026-08-05']);
    db.close();
  });

  it('remplace toutes les prises à la mise à jour', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input(), null, NOW);
    const updated = updateTrip(
      db,
      trip.id,
      input({
        notes: 'Vent d’ouest',
        catches: [
          { speciesId: 'seiche', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: 900, kept: false }
        ]
      }),
      '2026-08-11T09:00:00.000Z'
    );
    expect(updated!.catches).toHaveLength(1);
    expect(updated!.catches[0]).toMatchObject({ speciesId: 'seiche', kept: false, weightG: 900 });
    expect(updated!.notes).toBe('Vent d’ouest');
    expect(updated!.updatedAt).toBe('2026-08-11T09:00:00.000Z');
    expect(updated!.createdAt).toBe(NOW);
    const orphans = db.prepare('SELECT count(*) AS c FROM fishing_catches').get() as { c: number };
    expect(orphans.c).toBe(1);
    db.close();
  });

  it('ne touche pas à la météo lors d’une mise à jour', () => {
    const db = openDb(':memory:');
    const weather = { tempMin: 14, tempMax: 22, windMax: 18, windDir: 250, weatherCode: 3, seaTemperature: 19.5 };
    const trip = createTrip(db, input(), weather, NOW);
    const updated = updateTrip(db, trip.id, input({ notes: 'corrigé' }), NOW);
    expect(updated!.weather).toEqual(weather);
    db.close();
  });

  it('renvoie null sur une sortie absente', () => {
    const db = openDb(':memory:');
    expect(getTrip(db, 404)).toBeNull();
    expect(updateTrip(db, 404, input(), NOW)).toBeNull();
    expect(deleteTrip(db, 404)).toBe(false);
    db.close();
  });

  it('supprime une sortie et ses prises', () => {
    const db = openDb(':memory:');
    const trip = createTrip(db, input(), null, NOW);
    expect(deleteTrip(db, trip.id)).toBe(true);
    expect(listTrips(db)).toEqual([]);
    const rest = db.prepare('SELECT count(*) AS c FROM fishing_catches').get() as { c: number };
    expect(rest.c).toBe(0);
    db.close();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd server && npx vitest run src/db/fishingRepository.test.ts`
Expected : FAIL — `Cannot find module './fishingRepository'`.

- [ ] **Step 3 : Écrire le repository**

Créer `server/src/db/fishingRepository.ts` :

```ts
import type { DB } from './index';

/**
 * Instantané météo d'une sortie (issue #3) : **figé à la création**, jamais recalculé. Contrairement
 * au contexte marée — donnée de référence, corrigeable, donc dérivée à l'affichage — la météo d'un
 * jour passé n'est pas reproductible.
 */
export interface TripWeather {
  tempMin: number | null;
  tempMax: number | null;
  windMax: number | null;
  windDir: number | null;
  weatherCode: number | null;
  seaTemperature: number | null;
}

export interface FishingCatch {
  speciesId: string;
  gearId: string;
  quantity: number;
  sizeCm: number | null;
  weightG: number | null;
  kept: boolean;
}

export interface FishingTrip {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  weather: TripWeather | null;
  catches: FishingCatch[];
  createdAt: string;
  updatedAt: string;
}

/** Champs saisis (l'id, les horodatages et la météo ne viennent jamais du client). */
export interface FishingTripInput {
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  catches: FishingCatch[];
}

interface TripRow {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  weather: string | null;
  created_at: string;
  updated_at: string;
}

interface CatchRow {
  trip_id: number;
  species_id: string;
  gear_id: string;
  quantity: number;
  size_cm: number | null;
  weight_g: number | null;
  kept: number;
}

function parseWeather(raw: string | null): TripWeather | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TripWeather;
  } catch {
    return null; // instantané illisible : la sortie reste lisible, c'est elle la donnée
  }
}

function toCatch(row: CatchRow): FishingCatch {
  return {
    speciesId: row.species_id,
    gearId: row.gear_id,
    quantity: row.quantity,
    sizeCm: row.size_cm,
    weightG: row.weight_g,
    kept: row.kept === 1
  };
}

/** Attache leurs prises à des sorties déjà lues (une seule requête, quel que soit le nombre). */
function withCatches(db: DB, rows: TripRow[]): FishingTrip[] {
  if (rows.length === 0) return [];
  const placeholders = rows.map(() => '?').join(',');
  const catches = db
    .prepare(
      `SELECT trip_id, species_id, gear_id, quantity, size_cm, weight_g, kept
       FROM fishing_catches WHERE trip_id IN (${placeholders}) ORDER BY trip_id, sort_order, id`
    )
    .all(...rows.map(r => r.id)) as CatchRow[];

  const byTrip = new Map<number, FishingCatch[]>();
  for (const row of catches) {
    const list = byTrip.get(row.trip_id) ?? [];
    list.push(toCatch(row));
    byTrip.set(row.trip_id, list);
  }

  return rows.map(r => ({
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    notes: r.notes,
    weather: parseWeather(r.weather),
    catches: byTrip.get(r.id) ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

/**
 * Sorties de la plus récente à la plus ancienne, sur une plage **inclusive** (bornes optionnelles).
 * Le tri secondaire sur l'id départage deux sorties du même jour dans leur ordre de saisie inverse.
 */
export function listTrips(db: DB, from?: string, to?: string): FishingTrip[] {
  const where: string[] = [];
  const params: string[] = [];
  if (from) {
    where.push('date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('date <= ?');
    params.push(to);
  }
  const rows = db
    .prepare(
      `SELECT id, date, start_time, end_time, notes, weather, created_at, updated_at
       FROM fishing_trips ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY date DESC, id DESC`
    )
    .all(...params) as TripRow[];
  return withCatches(db, rows);
}

export function getTrip(db: DB, id: number): FishingTrip | null {
  const row = db
    .prepare(
      `SELECT id, date, start_time, end_time, notes, weather, created_at, updated_at
       FROM fishing_trips WHERE id = ?`
    )
    .get(id) as TripRow | undefined;
  return row ? withCatches(db, [row])[0] : null;
}

function insertCatches(db: DB, tripId: number, catches: FishingCatch[]): void {
  const ins = db.prepare(
    `INSERT INTO fishing_catches (trip_id, species_id, gear_id, quantity, size_cm, weight_g, kept, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  catches.forEach((c, i) =>
    ins.run(tripId, c.speciesId, c.gearId, c.quantity, c.sizeCm, c.weightG, c.kept ? 1 : 0, i)
  );
}

/** Crée une sortie et ses prises en une transaction. `weather` est figé ici, une fois pour toutes. */
export function createTrip(
  db: DB,
  input: FishingTripInput,
  weather: TripWeather | null,
  nowIso: string
): FishingTrip {
  const id = db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO fishing_trips (date, start_time, end_time, notes, weather, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.date,
        input.startTime,
        input.endTime,
        input.notes,
        weather ? JSON.stringify(weather) : null,
        nowIso,
        nowIso
      );
    const tripId = Number(res.lastInsertRowid);
    insertCatches(db, tripId, input.catches);
    return tripId;
  })();
  return getTrip(db, id)!;
}

/**
 * Remplace la sortie **et toutes ses prises** en une transaction : une sortie s'édite comme un
 * formulaire, d'un bloc. La colonne `weather` n'est **pas** touchée — la recapturer écraserait
 * la météo de juillet par un « — » le jour où l'on corrige une note en janvier.
 */
export function updateTrip(
  db: DB,
  id: number,
  input: FishingTripInput,
  nowIso: string
): FishingTrip | null {
  const exists = db.prepare('SELECT 1 FROM fishing_trips WHERE id = ?').get(id) != null;
  if (!exists) return null;
  db.transaction(() => {
    db.prepare(
      `UPDATE fishing_trips SET date = ?, start_time = ?, end_time = ?, notes = ?, updated_at = ?
       WHERE id = ?`
    ).run(input.date, input.startTime, input.endTime, input.notes, nowIso, id);
    db.prepare('DELETE FROM fishing_catches WHERE trip_id = ?').run(id);
    insertCatches(db, id, input.catches);
  })();
  return getTrip(db, id);
}

/** Supprime une sortie ; ses prises partent avec (cascade **et** suppression explicite ci-dessus). */
export function deleteTrip(db: DB, id: number): boolean {
  return db.transaction(() => {
    db.prepare('DELETE FROM fishing_catches WHERE trip_id = ?').run(id);
    return db.prepare('DELETE FROM fishing_trips WHERE id = ?').run(id).changes > 0;
  })();
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd server && npx vitest run src/db/fishingRepository.test.ts`
Expected : PASS, 10 tests.

- [ ] **Step 5 : Commit**

```bash
git add server/src/db/fishingRepository.ts server/src/db/fishingRepository.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): repository des sorties et des prises

Le PUT remplace les prises d'un bloc mais laisse la météo intacte :
corriger une note en janvier ne doit pas effacer la météo de juillet.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 : Amorçage des référentiels au démarrage

**Files:**
- Modify: `server/src/db/bootstrap.ts`
- Test: `server/src/db/bootstrap.test.ts`

**Interfaces:**
- Consumes: `seedFishingRefsIfEmpty`, `FISHING_REFS_SEED` (Task 2), `initStorage` (existant).
- Produces: table `fishing_refs` amorcée au premier démarrage, idempotente.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `server/src/db/bootstrap.test.ts`, à l'intérieur du `describe` existant :

```ts
  it('amorce les référentiels de pêche, sans les réamorcer au second appel', async () => {
    const db = openDb(':memory:');
    await initStorage(undefined, db);
    const first = getRefs(db);
    expect(first.length).toBeGreaterThan(10);
    expect(first.some(r => r.id === 'casier-crevettes')).toBe(true);
    await initStorage(undefined, db);
    expect(getRefs(db)).toHaveLength(first.length);
    db.close();
  });
```

Compléter les imports en tête du fichier de test :

```ts
import { getRefs } from './fishingRefsRepository';
```

(`openDb` et `initStorage` y sont déjà importés ; ne pas les dupliquer.)

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

Run : `cd server && npx vitest run src/db/bootstrap.test.ts`
Expected : FAIL — `expect(first.length).toBeGreaterThan(10)` reçoit 0.

- [ ] **Step 3 : Brancher l'amorçage**

Dans `server/src/db/bootstrap.ts`, ajouter les imports :

```ts
import { seedFishingRefsIfEmpty } from './fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';
```

Puis, juste après la ligne `seedLexiconIfEmpty(db, LEXICON_SEED);` :

```ts
  // Référentiels du carnet de pêche (issue #3) : mêmes règles que le lexique — amorçage si vide.
  seedFishingRefsIfEmpty(db, FISHING_REFS_SEED);
```

Compléter le commentaire de `initStorage` par une puce :

```ts
 * - **Pêche** : amorce les référentiels espèces/engins si la table `fishing_refs` est vide.
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il passe**

Run : `cd server && npx vitest run src/db/bootstrap.test.ts`
Expected : PASS.

- [ ] **Step 5 : Commit**

```bash
git add server/src/db/bootstrap.ts server/src/db/bootstrap.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): amorce les référentiels espèces/engins au démarrage

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 : Capture de l'instantané météo

**Files:**
- Modify: `server/src/service/weather.ts` (constantes exportées + paramètre `pastDays`)
- Modify: `server/src/routes/weather.ts` (importe les constantes au lieu de les redéclarer)
- Create: `server/src/service/fishingWeather.ts`
- Test: `server/src/service/fishingWeather.test.ts`

**Interfaces:**
- Consumes: `fetchWeather` (existant), `TripWeather` (Task 3).
- Produces:
  - `DEFAULT_LAT = 47.677`, `DEFAULT_LON = -3.166` exportés depuis `service/weather.ts`
  - `fetchWeather(latitude, longitude, days, fetchImpl, extraSeaPoints, pastDays)` — 6ᵉ paramètre optionnel, défaut `0`
  - `captureTripWeather(date: string, now: Date, fetchImpl?: typeof fetch): Promise<TripWeather | null>`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `server/src/service/fishingWeather.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import { captureTripWeather } from './fishingWeather';

const NOW = new Date('2026-08-10T18:00:00');

/** Réponse Open-Meteo minimale : prévision quotidienne + marine, pour les dates demandées. */
function fakeFetch(dates: string[]) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes('marine-api')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          current: { wave_height: 0.6, wave_period: 5, wave_direction: 250, sea_surface_temperature: 19.4 },
          daily: {
            time: dates,
            wave_height_max: dates.map(() => 0.9),
            wave_period_max: dates.map(() => 6),
            sea_surface_temperature_max: dates.map((_, i) => 19 + i)
          }
        })
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        timezone: 'Europe/Paris',
        current: {},
        current_units: {},
        daily: {
          time: dates,
          weather_code: dates.map(() => 3),
          temperature_2m_max: dates.map((_, i) => 20 + i),
          temperature_2m_min: dates.map(() => 14),
          precipitation_sum: dates.map(() => 0),
          wind_speed_10m_max: dates.map(() => 18),
          wind_gusts_10m_max: dates.map(() => 32),
          wind_direction_10m_dominant: dates.map(() => 250),
          uv_index_max: dates.map(() => 6)
        }
      })
    } as unknown as Response;
  });
}

describe('captureTripWeather', () => {
  it('fige la météo du jour de la sortie, pas celle du jour de saisie', async () => {
    const fetchImpl = fakeFetch(['2026-08-08', '2026-08-09', '2026-08-10']);
    const snap = await captureTripWeather('2026-08-09', NOW, fetchImpl as unknown as typeof fetch);
    expect(snap).toEqual({
      tempMin: 14,
      tempMax: 21,
      windMax: 18,
      windDir: 250,
      weatherCode: 3,
      seaTemperature: 20
    });
  });

  it('demande des jours passés à Open-Meteo pour une sortie antérieure', async () => {
    const fetchImpl = fakeFetch(['2026-08-05', '2026-08-10']);
    await captureTripWeather('2026-08-05', NOW, fetchImpl as unknown as typeof fetch);
    const called = String(fetchImpl.mock.calls[0][0]);
    expect(called).toContain('past_days=5');
  });

  it('renvoie null au-delà de la fenêtre exploitable (plus de 92 jours en arrière)', async () => {
    const fetchImpl = fakeFetch([]);
    expect(await captureTripWeather('2026-01-01', NOW, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('renvoie null au-delà de la fenêtre de prévision (plus de 7 jours à venir)', async () => {
    const fetchImpl = fakeFetch([]);
    expect(await captureTripWeather('2026-09-30', NOW, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('renvoie null si la date demandée est absente de la réponse', async () => {
    const fetchImpl = fakeFetch(['2026-08-10']);
    expect(await captureTripWeather('2026-08-09', NOW, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('renvoie null sur échec réseau, sans propager l’erreur', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('réseau coupé');
    });
    await expect(
      captureTripWeather('2026-08-10', NOW, fetchImpl as unknown as typeof fetch)
    ).resolves.toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd server && npx vitest run src/service/fishingWeather.test.ts`
Expected : FAIL — `Cannot find module './fishingWeather'`.

- [ ] **Step 3 : Ouvrir `fetchWeather` aux jours passés**

Dans `server/src/service/weather.ts`, ajouter en tête du fichier (après le bloc `WMO`) :

```ts
/**
 * Zone par défaut : Belz (Morbihan) — lieu de consultation. Les marées restent référencées sur
 * Port-Tudy (Groix). Exportées ici parce que deux appelants s'en servent : la route météo et la
 * capture de l'instantané d'une sortie de pêche (issue #3).
 * ⚠️ `EPHEMERIDE_LOCATION` (client) est un miroir de ces valeurs.
 */
export const DEFAULT_LAT = 47.677;
export const DEFAULT_LON = -3.166;
```

Modifier la signature de `fetchWeather` et son commentaire :

```ts
/**
 * Récupère la météo (Open-Meteo, sans clé) pour des coordonnées : conditions actuelles,
 * prévisions quotidiennes, et conditions marines (vagues) si disponibles. `fetchImpl`
 * est injectable pour les tests. `pastDays` ajoute des **jours passés** aux séries quotidiennes
 * (jusqu'à 92 chez Open-Meteo) — sans lui, une sortie de pêche saisie après coup enregistrerait
 * la météo du jour de la saisie (issue #3).
 */
export async function fetchWeather(
  latitude: number,
  longitude: number,
  days = 3,
  fetchImpl: FetchLike = fetch,
  extraSeaPoints: SeaPoint[] = [],
  pastDays = 0
): Promise<WeatherResult> {
```

Dans le corps, après la construction de `forecastParams` et **avant** l'appel `getJson`, ajouter :

```ts
  if (pastDays > 0) forecastParams.set('past_days', String(pastDays));
```

Et de même pour `marineParams`, juste après sa construction :

```ts
    if (pastDays > 0) marineParams.set('past_days', String(pastDays));
```

Dans `server/src/routes/weather.ts`, supprimer les deux constantes locales `DEFAULT_LAT` / `DEFAULT_LON` et les importer :

```ts
import { DEFAULT_LAT, DEFAULT_LON, fetchWeather } from '../service/weather';
```

(Le commentaire « Zone par défaut : Belz… » de `routes/weather.ts` part avec les constantes : il vit désormais dans `service/weather.ts`.)

- [ ] **Step 4 : Écrire le service de capture**

Créer `server/src/service/fishingWeather.ts` :

```ts
import { DEFAULT_LAT, DEFAULT_LON, fetchWeather } from './weather';
import type { TripWeather } from '../db/fishingRepository';

/** Fenêtre exploitable d'Open-Meteo : 92 jours d'archive glissante, 7 jours de prévision. */
const MAX_PAST_DAYS = 92;
const MAX_FUTURE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Date locale `YYYY-MM-DD` d'un instant. */
function localDate(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Écart en jours entre deux dates `YYYY-MM-DD` (midi local : insensible au changement d'heure). */
function dayDiff(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / DAY_MS);
}

/**
 * Instantané météo d'une sortie de pêche (issue #3), **figé à la création**.
 *
 * Best-effort par construction : hors de la fenêtre Open-Meteo, sur échec réseau ou si la date
 * demandée manque à la réponse, renvoie `null` — jamais une exception. La sortie est la donnée ;
 * la météo n'est qu'un agrément et ne doit pas faire échouer un enregistrement.
 */
export async function captureTripWeather(
  date: string,
  now: Date,
  fetchImpl: typeof fetch = fetch
): Promise<TripWeather | null> {
  const today = localDate(now);
  const offset = dayDiff(today, date); // négatif = passé, positif = à venir
  if (offset < -MAX_PAST_DAYS || offset > MAX_FUTURE_DAYS) return null;

  const pastDays = Math.max(0, -offset);
  const days = Math.max(1, offset + 1);

  try {
    const weather = await fetchWeather(DEFAULT_LAT, DEFAULT_LON, days, fetchImpl, [], pastDays);
    const daily = weather.daily.find(d => d.date === date);
    if (!daily) return null;
    const marine = weather.marine?.daily.find(d => d.date === date) ?? null;
    return {
      tempMin: daily.tempMin ?? null,
      tempMax: daily.tempMax ?? null,
      windMax: daily.windMax ?? null,
      windDir: daily.windDirection ?? null,
      weatherCode: daily.weatherCode ?? null,
      seaTemperature: marine?.seaTemperatureMax ?? null
    };
  } catch {
    return null; // réseau indisponible : on enregistre la sortie sans météo
  }
}
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd server && npx vitest run src/service/fishingWeather.test.ts src/routes/weather.test.ts src/service/weather.test.ts`
Expected : PASS — les 6 nouveaux tests et les tests météo existants (non régressés par le 6ᵉ paramètre).

- [ ] **Step 6 : Commit**

```bash
git add server/src/service/weather.ts server/src/routes/weather.ts server/src/service/fishingWeather.ts server/src/service/fishingWeather.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): instantané météo d'une sortie, jours passés compris

fetchWeather gagne past_days : sans lui, une sortie saisie après coup
enregistrerait la météo du jour de la saisie. Échec réseau ou date hors
fenêtre → null, jamais d'exception.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 : Routeur `/api/fishing` et montage

**Files:**
- Create: `server/src/routes/fishing.ts`
- Modify: `server/src/app.ts`
- Test: `server/src/routes/fishing.test.ts`

**Interfaces:**
- Consumes: `listTrips`, `getTrip`, `createTrip`, `updateTrip`, `deleteTrip`, `FishingTripInput` (Task 3) ; `getRefs`, `addRef`, `updateRef`, `deleteRef`, `resetFishingRefs`, `refExists` (Task 2) ; `captureTripWeather` (Task 5) ; `requestRole` (existant).
- Produces: `createFishingRouter(logger: Logger): Router`, monté sous `/api` dans `createApp`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `server/src/routes/fishing.test.ts` :

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Application } from 'express';

const dataDir = path.join(os.tmpdir(), `marees-fishing-test-${process.pid}`);
process.env.DATA_DIR = dataDir;

// La capture météo sort sur le réseau : neutralisée ici, elle a ses propres tests.
vi.mock('../service/fishingWeather', () => ({
  captureTripWeather: vi.fn(async () => null)
}));

const fakeLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } as any;

let app: Application;

beforeAll(async () => {
  const { initStorage } = await import('../db/bootstrap');
  const { createApp } = await import('../app');
  await initStorage();
  app = createApp(fakeLogger);
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const validTrip = {
  date: '2026-08-10',
  startTime: '19:42',
  endTime: '21:10',
  notes: 'Vent d’ouest',
  catches: [{ speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true }]
};

describe('API /api/fishing/refs', () => {
  it('GET renvoie les référentiels amorcés', async () => {
    const res = await request(app).get('/api/fishing/refs');
    expect(res.status).toBe(200);
    expect(res.body.some((r: any) => r.id === 'casier-crevettes' && r.kind === 'gear')).toBe(true);
    expect(res.body.some((r: any) => r.id === 'bar' && r.kind === 'species')).toBe(true);
  });

  it('POST ajoute une espèce puis PUT la renomme', async () => {
    const post = await request(app).post('/api/fishing/refs').send({ kind: 'species', label: 'Homard' });
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ id: 'homard', kind: 'species', label: 'Homard' });

    const put = await request(app).put('/api/fishing/refs/homard').send({ label: 'Homard bleu' });
    expect(put.status).toBe(200);
    expect(put.body.label).toBe('Homard bleu');
  });

  it('POST refuse un type inconnu ou un libellé vide (400)', async () => {
    expect((await request(app).post('/api/fishing/refs').send({ kind: 'poisson', label: 'X' })).status).toBe(400);
    expect((await request(app).post('/api/fishing/refs').send({ kind: 'species', label: '  ' })).status).toBe(400);
  });

  it('DELETE renvoie 404 sur un id inconnu, 204 sinon', async () => {
    expect((await request(app).delete('/api/fishing/refs/inconnu')).status).toBe(404);
    expect((await request(app).delete('/api/fishing/refs/homard')).status).toBe(204);
  });
});

describe('API /api/fishing/trips', () => {
  it('POST crée une sortie et GET la relit', async () => {
    const post = await request(app).post('/api/fishing/trips').send(validTrip);
    expect(post.status).toBe(201);
    expect(post.body).toMatchObject({ date: '2026-08-10', startTime: '19:42', notes: 'Vent d’ouest' });
    expect(post.body.catches).toHaveLength(1);

    const get = await request(app).get('/api/fishing/trips');
    expect(get.status).toBe(200);
    expect(get.body.some((t: any) => t.id === post.body.id)).toBe(true);
  });

  it('GET filtre sur une plage inclusive et refuse des dates invalides', async () => {
    await request(app).post('/api/fishing/trips').send({ ...validTrip, date: '2026-07-01' });
    const inRange = await request(app).get('/api/fishing/trips?from=2026-08-01&to=2026-08-31');
    expect(inRange.body.every((t: any) => t.date >= '2026-08-01')).toBe(true);

    expect((await request(app).get('/api/fishing/trips?from=hier')).status).toBe(400);
    expect((await request(app).get('/api/fishing/trips?from=2026-08-31&to=2026-08-01')).status).toBe(400);
  });

  it('POST accepte une sortie bredouille', async () => {
    const res = await request(app).post('/api/fishing/trips').send({ ...validTrip, catches: [] });
    expect(res.status).toBe(201);
    expect(res.body.catches).toEqual([]);
  });

  it('POST refuse une date, une heure, une quantité ou un référentiel invalides (400)', async () => {
    const bad = (over: any) => request(app).post('/api/fishing/trips').send({ ...validTrip, ...over });
    expect((await bad({ date: '10/08/2026' })).status).toBe(400);
    expect((await bad({ startTime: '25:00' })).status).toBe(400);
    expect((await bad({ notes: 'x'.repeat(1001) })).status).toBe(400);
    expect((await bad({ catches: [{ ...validTrip.catches[0], quantity: 0 }] })).status).toBe(400);
    expect((await bad({ catches: [{ ...validTrip.catches[0], speciesId: 'licorne' }] })).status).toBe(400);
    // Un engin ne peut pas servir d'espèce, ni l'inverse.
    expect((await bad({ catches: [{ ...validTrip.catches[0], speciesId: 'ligne' }] })).status).toBe(400);
    expect((await bad({ catches: [{ ...validTrip.catches[0], gearId: 'bar' }] })).status).toBe(400);
  });

  it('PUT remplace les prises, DELETE supprime, 404 hors sortie existante', async () => {
    const post = await request(app).post('/api/fishing/trips').send(validTrip);
    const id = post.body.id;

    const put = await request(app)
      .put(`/api/fishing/trips/${id}`)
      .send({ ...validTrip, catches: [{ speciesId: 'seiche', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: 900, kept: false }] });
    expect(put.status).toBe(200);
    expect(put.body.catches).toHaveLength(1);
    expect(put.body.catches[0]).toMatchObject({ speciesId: 'seiche', kept: false });

    expect((await request(app).put('/api/fishing/trips/9999').send(validTrip)).status).toBe(404);
    expect((await request(app).delete(`/api/fishing/trips/${id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/fishing/trips/${id}`)).status).toBe(404);
  });

  it('refuse de supprimer un référentiel encore utilisé (409)', async () => {
    await request(app).post('/api/fishing/trips').send(validTrip);
    const res = await request(app).delete('/api/fishing/refs/bar');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/utilisé/i);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd server && npx vitest run src/routes/fishing.test.ts`
Expected : FAIL — 404 sur `/api/fishing/refs` (routeur non monté).

- [ ] **Step 3 : Écrire le routeur**

Créer `server/src/routes/fishing.ts` :

```ts
import { Router, type Request, type Response } from 'express';
import { Logger } from 'pino';
import { getDb } from '../db';
import {
  createTrip,
  deleteTrip,
  listTrips,
  updateTrip,
  type FishingCatch,
  type FishingTripInput
} from '../db/fishingRepository';
import {
  addRef,
  deleteRef,
  getRefs,
  refExists,
  resetFishingRefs,
  updateRef,
  type FishingRefKind
} from '../db/fishingRefsRepository';
import { FISHING_REFS_SEED } from '../service/fishingSeed';
import { captureTripWeather } from '../service/fishingWeather';
import { requestRole } from '../middleware/auth';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const MAX_NOTES = 1000;
const MAX_CATCHES = 50;
const MAX_LABEL = 60;

/** Heure `HH:MM` ou `null` ; `undefined` est traité comme absent. `false` = invalide. */
function optionalTime(value: unknown): string | null | false {
  if (value == null || value === '') return null;
  return typeof value === 'string' && TIME_RE.test(value) ? value : false;
}

/** Nombre optionnel borné ; `null` si absent, `false` si invalide. */
function optionalNumber(value: unknown, min: number, max: number): number | null | false {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : false;
}

/** Valide une ligne de prise ; `null` si invalide. Les référentiels sont vérifiés en base. */
function parseCatch(raw: unknown): FishingCatch | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const speciesId = typeof o.speciesId === 'string' ? o.speciesId : '';
  const gearId = typeof o.gearId === 'string' ? o.gearId : '';
  const quantity = Number(o.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9999) return null;
  const sizeCm = optionalNumber(o.sizeCm, 0, 300);
  const weightG = optionalNumber(o.weightG, 0, 100000);
  if (sizeCm === false || weightG === false) return null;
  const db = getDb();
  if (!refExists(db, speciesId, 'species')) return null;
  if (!refExists(db, gearId, 'gear')) return null;
  return { speciesId, gearId, quantity, sizeCm, weightG, kept: o.kept !== false };
}

/** Valide le corps d'une sortie ; `null` si invalide. */
function parseTrip(body: unknown): FishingTripInput | null {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (typeof o.date !== 'string' || !DATE_RE.test(o.date)) return null;
  const startTime = optionalTime(o.startTime);
  const endTime = optionalTime(o.endTime);
  if (startTime === false || endTime === false) return null;
  const notes = typeof o.notes === 'string' ? o.notes.trim() : '';
  if (notes.length > MAX_NOTES) return null;
  const rawCatches = Array.isArray(o.catches) ? o.catches : [];
  if (rawCatches.length > MAX_CATCHES) return null;
  const catches: FishingCatch[] = [];
  for (const raw of rawCatches) {
    const parsed = parseCatch(raw);
    if (!parsed) return null;
    catches.push(parsed);
  }
  return { date: o.date, startTime, endTime, notes: notes || null, catches };
}

/**
 * Routeur du **carnet de pêche** (issue #3), monté sous `/api`. Lecture ouverte à tout compte
 * connecté (comme les horaires), écriture réservée au rôle `admin` :
 * - `GET /fishing/trips?from&to` : sorties + prises, plage **inclusive**.
 * - `POST /fishing/trips` (**admin**) : crée ; la météo est **figée ici**, best-effort.
 * - `PUT /fishing/trips/:id` (**admin**) : remplace la sortie **et toutes ses prises** ; ne touche
 *   pas à la météo (la recapturer écraserait celle de juillet en corrigeant une note en janvier).
 * - `DELETE /fishing/trips/:id` (**admin**).
 * - `GET /fishing/refs`, `POST`/`PUT`/`DELETE /fishing/refs[/:id]`, `POST /fishing/refs/reset`.
 */
export function createFishingRouter(logger: Logger): Router {
  const router = Router();
  const isAdmin = (req: Request) => requestRole(req) === 'admin';
  const forbid = (res: Response) =>
    res.status(403).json({ error: 'Modification réservée au rôle administrateur.' });

  // ---------- Référentiels ----------

  router.get('/fishing/refs', (_req, res, next) => {
    try {
      res.json(getRefs(getDb()));
    } catch (err) {
      next(err);
    }
  });

  router.post('/fishing/refs', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const o = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const kind = o.kind === 'species' || o.kind === 'gear' ? (o.kind as FishingRefKind) : null;
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!kind || !label || label.length > MAX_LABEL) {
        return res.status(400).json({ error: 'kind (species|gear) et label requis.' });
      }
      res.status(201).json(addRef(getDb(), kind, label));
    } catch (err) {
      next(err);
    }
  });

  router.put('/fishing/refs/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const o = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!label || label.length > MAX_LABEL) return res.status(400).json({ error: 'label requis.' });
      const updated = updateRef(getDb(), req.params.id, label);
      if (!updated) return res.status(404).json({ error: 'Référentiel introuvable.' });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/fishing/refs/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const outcome = deleteRef(getDb(), req.params.id);
      if (outcome === 'missing') return res.status(404).json({ error: 'Référentiel introuvable.' });
      if (outcome === 'in-use') {
        return res
          .status(409)
          .json({ error: 'Ce référentiel est utilisé par des prises enregistrées : il ne peut pas être supprimé.' });
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  router.post('/fishing/refs/reset', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      resetFishingRefs(getDb(), FISHING_REFS_SEED);
      res.json(getRefs(getDb()));
    } catch (err) {
      next(err);
    }
  });

  // ---------- Sorties ----------

  router.get('/fishing/trips', (req, res, next) => {
    try {
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;
      if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
        return res.status(400).json({ error: 'Paramètres "from"/"to" au format YYYY-MM-DD.' });
      }
      if (from && to && from > to) {
        return res.status(400).json({ error: '"from" doit précéder "to".' });
      }
      res.json(listTrips(getDb(), from, to));
    } catch (err) {
      next(err);
    }
  });

  router.post('/fishing/trips', async (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const input = parseTrip(req.body);
      if (!input) return res.status(400).json({ error: 'Sortie invalide (date, heures, notes ou prises).' });
      // Best-effort : `captureTripWeather` avale ses erreurs et renvoie `null`.
      const weather = await captureTripWeather(input.date, new Date());
      const trip = createTrip(getDb(), input, weather, new Date().toISOString());
      logger.info({ id: trip.id, date: trip.date }, 'Sortie de pêche enregistrée');
      res.status(201).json(trip);
    } catch (err) {
      next(err);
    }
  });

  router.put('/fishing/trips/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
      const input = parseTrip(req.body);
      if (!input) return res.status(400).json({ error: 'Sortie invalide (date, heures, notes ou prises).' });
      const updated = updateTrip(getDb(), id, input, new Date().toISOString());
      if (!updated) return res.status(404).json({ error: 'Sortie introuvable.' });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/fishing/trips/:id', (req, res, next) => {
    try {
      if (!isAdmin(req)) return forbid(res);
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant invalide.' });
      if (!deleteTrip(getDb(), id)) return res.status(404).json({ error: 'Sortie introuvable.' });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
```

- [ ] **Step 4 : Monter le routeur**

Dans `server/src/app.ts`, ajouter l'import :

```ts
import { createFishingRouter } from './routes/fishing';
```

Puis, après `app.use('/api', createLexiconRouter(logger));` :

```ts
  app.use('/api', createFishingRouter(logger));
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd server && npx vitest run src/routes/fishing.test.ts`
Expected : PASS, 9 tests.

- [ ] **Step 6 : Vérifier la non-régression du serveur**

Run : `cd server && npx vitest run && npx tsc -p tsconfig.check.json --noEmit`
Expected : tous les tests serveur PASS, aucune erreur de type.

- [ ] **Step 7 : Commit**

```bash
git add server/src/routes/fishing.ts server/src/routes/fishing.test.ts server/src/app.ts
git commit -m "$(cat <<'EOF'
feat(peche): API REST du carnet de pêche

Lecture ouverte, écriture admin. Un référentiel encore utilisé par une
prise renvoie 409 plutôt que d'amputer l'historique.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 : Routeur client et lien de navigation

**Files:**
- Modify: `client/package.json` (dépendance `vue-router`)
- Create: `client/src/router.ts`
- Create: `client/src/views/FishingView.vue` (coquille minimale, étoffée en Task 12)
- Modify: `client/src/main.ts`, `client/src/App.vue`
- Test: `client/src/router.test.ts`

**Interfaces:**
- Consumes: `Dashboard.vue` (existant).
- Produces: `router` (export par défaut de `client/src/router.ts`), routes nommées `dashboard` (`/`) et `fishing` (`/peche`).

**Note :** le repli SPA côté Express **existe déjà** (`app.get('*')` dans `server/src/app.ts`, avec le garde `req.path.startsWith('/api')`). Rien à ajouter côté serveur ; ne pas le dupliquer.

- [ ] **Step 1 : Installer vue-router**

Run : `npm -w client install vue-router@^4.5.0`
Expected : `client/package.json` gagne `"vue-router": "^4.5.0"` dans `dependencies`.

- [ ] **Step 2 : Écrire le test qui échoue**

Créer `client/src/router.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import router from './router';

describe('router', () => {
  it('expose la route du dashboard et celle du carnet de pêche', () => {
    const paths = router.getRoutes().map(r => r.path);
    expect(paths).toContain('/');
    expect(paths).toContain('/peche');
  });

  it('nomme les routes pour que les liens ne dépendent pas des chemins', () => {
    expect(router.resolve({ name: 'fishing' }).path).toBe('/peche');
    expect(router.resolve({ name: 'dashboard' }).path).toBe('/');
  });

  it('renvoie une URL inconnue vers le dashboard plutôt que sur une page blanche', async () => {
    // Navigation réelle et non `resolve()` : `resolve()` ne suit jamais les redirections.
    await router.push('/nawak');
    expect(router.currentRoute.value.name).toBe('dashboard');
  });
});
```

- [ ] **Step 3 : Lancer le test pour vérifier qu'il échoue**

Run : `cd client && npx vitest run src/router.test.ts`
Expected : FAIL — `Cannot find module './router'`.

- [ ] **Step 4 : Écrire le routeur et la coquille de vue**

Créer `client/src/router.ts` :

```ts
import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from './views/Dashboard.vue';

/**
 * Routeur de l'application (issue #3). L'app était mono-vue ; le carnet de pêche justifie une
 * seconde page plein écran plutôt qu'un offcanvas de plus. Historique HTML5 : le repli SPA existe
 * déjà côté Express (`app.get('*')`) et côté PWA (`navigateFallback`).
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: Dashboard },
    // Chargée à la demande : le carnet n'est pas nécessaire pour afficher les marées.
    { path: '/peche', name: 'fishing', component: () => import('./views/FishingView.vue') },
    // Une URL inconnue (ancien favori, faute de frappe) revient au dashboard, pas sur du vide.
    // Redirection par **chemin** et non par nom : vers une route nommée, Vue Router tenterait de
    // lui transmettre le `pathMatch` capturé ici et avertirait « Discarded invalid param(s) ».
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
});

export default router;
```

Créer `client/src/views/FishingView.vue` (coquille, complétée en Task 12) :

```vue
<script setup lang="ts">
// Carnet de pêche (issue #3) — assemblage complété par la suite du plan.
</script>

<template>
  <div class="container-xxl py-3">
    <h1 class="h4 mb-3"><i class="bi bi-bucket me-2"></i>Carnet de pêche</h1>
  </div>
</template>
```

- [ ] **Step 5 : Monter le routeur**

Dans `client/src/main.ts`, remplacer la dernière ligne :

```ts
import router from './router';

createApp(App).use(router).mount('#app');
```

Dans `client/src/App.vue`, retirer l'import de `Dashboard` (`import Dashboard from './views/Dashboard.vue';`) et remplacer, dans le template, la balise `<Dashboard />` par :

```vue
    <RouterView />
```

- [ ] **Step 6 : Ajouter le lien de navigation**

Dans `client/src/App.vue`, insérer dans la navbar **juste avant** le bloc `<!-- ≥ sm : actions admin en ligne dans la navbar. -->` :

```vue
          <!-- Navigation entre les deux pages (lecture ouverte : visible de tous). -->
          <RouterLink
            v-if="$route.name === 'fishing'"
            class="btn btn-outline-light btn-sm d-inline-flex align-items-center"
            :to="{ name: 'dashboard' }"
            title="Marées"
            aria-label="Marées"
          >
            <i class="bi bi-water"></i>
          </RouterLink>
          <RouterLink
            v-else
            class="btn btn-outline-light btn-sm d-inline-flex align-items-center"
            :to="{ name: 'fishing' }"
            title="Carnet de pêche"
            aria-label="Carnet de pêche"
          >
            <i class="bi bi-bucket"></i>
          </RouterLink>
```

- [ ] **Step 7 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd client && npx vitest run src/router.test.ts`
Expected : PASS, 3 tests.

- [ ] **Step 8 : Vérifier que le build et les types tiennent**

Run : `npm run type-check && npm -w client run build`
Expected : aucune erreur de type ; build Vite réussi (le chunk `FishingView` apparaît séparément).

- [ ] **Step 9 : Commit**

```bash
git add client/package.json package-lock.json client/src/router.ts client/src/router.test.ts client/src/main.ts client/src/App.vue client/src/views/FishingView.vue
git commit -m "$(cat <<'EOF'
feat(peche): routeur client et page /peche

L'app cesse d'être mono-vue. Le repli SPA existait déjà côté Express et
côté PWA : rien à ajouter pour qu'un rechargement direct fonctionne.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 : Contrat client, appels REST et composables

**Files:**
- Modify: `client/src/types.ts`
- Create: `client/src/api/fishing.ts`
- Create: `client/src/composables/useFishingRefs.ts`
- Create: `client/src/composables/useFishing.ts`
- Test: `client/src/composables/useFishing.test.ts`

**Interfaces:**
- Consumes: `fetchJson` (`api/tides.ts`), routes de la Task 6.
- Produces (types dans `client/src/types.ts`) :
  - `type FishingRefKind = 'species' | 'gear'`
  - `interface FishingRef { id: string; kind: FishingRefKind; label: string }`
  - `interface FishingCatch { speciesId: string; gearId: string; quantity: number; sizeCm: number | null; weightG: number | null; kept: boolean }`
  - `interface TripWeather { tempMin: number | null; tempMax: number | null; windMax: number | null; windDir: number | null; weatherCode: number | null; seaTemperature: number | null }`
  - `interface FishingTrip { id: number; date: string; startTime: string | null; endTime: string | null; notes: string | null; weather: TripWeather | null; catches: FishingCatch[]; createdAt: string; updatedAt: string }`
  - `interface FishingTripInput { date: string; startTime: string | null; endTime: string | null; notes: string | null; catches: FishingCatch[] }`
- Produces (composables) :
  - `useFishing()` → `{ trips, loading, error, load, save, remove }` ; `resetFishingForTests()`
  - `useFishingRefs()` → `{ refs, species, gears, labelOf, load, add, update, remove, reset }` ; `resetFishingRefsForTests()`

- [ ] **Step 1 : Ajouter les types du contrat**

Ajouter à la fin de `client/src/types.ts` :

```ts
/** Référentiel du carnet de pêche : espèce ou engin (miroir du contrat `/api/fishing/refs`). */
export type FishingRefKind = 'species' | 'gear';

export interface FishingRef {
  id: string;
  kind: FishingRefKind;
  label: string;
}

/** Une ligne de prise. `sizeCm`/`weightG` sont optionnels : sans objet pour 40 crevettes. */
export interface FishingCatch {
  speciesId: string;
  gearId: string;
  quantity: number;
  sizeCm: number | null;
  weightG: number | null;
  kept: boolean;
}

/**
 * Instantané météo d'une sortie, **figé à la création côté serveur**. À l'inverse, le contexte
 * marée n'est jamais stocké : il est recalculé à l'affichage (`lib/fishing.tripTideContext`).
 */
export interface TripWeather {
  tempMin: number | null;
  tempMax: number | null;
  windMax: number | null;
  windDir: number | null;
  weatherCode: number | null;
  seaTemperature: number | null;
}

/** Une sortie de pêche (miroir du contrat `/api/fishing/trips`). */
export interface FishingTrip {
  id: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  weather: TripWeather | null;
  catches: FishingCatch[];
  createdAt: string;
  updatedAt: string;
}

/** Champs saisis d'une sortie (l'id, les horodatages et la météo viennent du serveur). */
export interface FishingTripInput {
  date: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  catches: FishingCatch[];
}
```

- [ ] **Step 2 : Écrire la couche API**

Créer `client/src/api/fishing.ts` :

```ts
import type { FishingRef, FishingRefKind, FishingTrip, FishingTripInput } from '../types';
import { fetchJson } from './tides';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** GET /api/fishing/trips — sorties + prises, plage inclusive optionnelle (lecture ouverte). */
export function getTrips(from?: string, to?: string): Promise<FishingTrip[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return fetchJson<FishingTrip[]>(`/api/fishing/trips${qs ? `?${qs}` : ''}`);
}

/** POST /api/fishing/trips — crée une sortie (**admin**) ; la météo est figée côté serveur. */
export function createTrip(input: FishingTripInput): Promise<FishingTrip> {
  return fetchJson<FishingTrip>('/api/fishing/trips', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

/** PUT /api/fishing/trips/:id — remplace la sortie et ses prises (**admin**). */
export function updateTrip(id: number, input: FishingTripInput): Promise<FishingTrip> {
  return fetchJson<FishingTrip>(`/api/fishing/trips/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input)
  });
}

/** DELETE /api/fishing/trips/:id (**admin**). */
export async function deleteTrip(id: number): Promise<void> {
  const res = await fetch(`/api/fishing/trips/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Erreur ${res.status}`);
}

/** GET /api/fishing/refs — espèces et engins (lecture ouverte). */
export function getRefs(): Promise<FishingRef[]> {
  return fetchJson<FishingRef[]>('/api/fishing/refs');
}

/** POST /api/fishing/refs (**admin**). */
export function addRef(kind: FishingRefKind, label: string): Promise<FishingRef> {
  return fetchJson<FishingRef>('/api/fishing/refs', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ kind, label })
  });
}

/** PUT /api/fishing/refs/:id (**admin**) — seul le libellé change ; l'id et le type sont figés. */
export function updateRef(id: string, label: string): Promise<FishingRef> {
  return fetchJson<FishingRef>(`/api/fishing/refs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ label })
  });
}

/**
 * DELETE /api/fishing/refs/:id (**admin**). Un **409** signifie que des prises s'y réfèrent :
 * le message du serveur est remonté tel quel, c'est lui qui explique le refus.
 */
export async function deleteRef(id: string): Promise<void> {
  const res = await fetch(`/api/fishing/refs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (res.ok) return;
  let message = `Erreur ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* corps non-JSON : message par défaut */
  }
  throw new Error(message);
}

/** POST /api/fishing/refs/reset (**admin**) — rétablit la graine. */
export function resetRefs(): Promise<FishingRef[]> {
  return fetchJson<FishingRef[]>('/api/fishing/refs/reset', { method: 'POST' });
}
```

- [ ] **Step 3 : Écrire le test des composables (il échoue)**

Créer `client/src/composables/useFishing.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = {
  getTrips: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  getRefs: vi.fn()
};

vi.mock('../api/fishing', () => ({
  getTrips: (...a: unknown[]) => api.getTrips(...a),
  createTrip: (...a: unknown[]) => api.createTrip(...a),
  updateTrip: (...a: unknown[]) => api.updateTrip(...a),
  deleteTrip: (...a: unknown[]) => api.deleteTrip(...a),
  getRefs: (...a: unknown[]) => api.getRefs(...a),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  resetRefs: vi.fn()
}));

import { resetFishingForTests, useFishing } from './useFishing';
import { resetFishingRefsForTests, useFishingRefs } from './useFishingRefs';

const trip = (over: Record<string, unknown> = {}) => ({
  id: 1,
  date: '2026-08-10',
  startTime: '19:42',
  endTime: null,
  notes: null,
  weather: null,
  catches: [],
  createdAt: 'x',
  updatedAt: 'x',
  ...over
});

describe('useFishing', () => {
  beforeEach(() => {
    Object.values(api).forEach(m => m.mockReset());
    resetFishingForTests();
    resetFishingRefsForTests();
  });

  it('charge les sorties une seule fois, puis les expose', async () => {
    api.getTrips.mockResolvedValue([trip()]);
    const { trips, load } = useFishing();
    await load();
    await load();
    expect(api.getTrips).toHaveBeenCalledTimes(1);
    expect(trips.value).toHaveLength(1);
  });

  it('remonte une erreur de chargement sans laisser loading à true', async () => {
    api.getTrips.mockRejectedValue(new Error('serveur muet'));
    const { error, loading, load } = useFishing();
    await load();
    expect(error.value).toBe('serveur muet');
    expect(loading.value).toBe(false);
  });

  it('insère une création en tête et remplace une mise à jour sur place', async () => {
    api.getTrips.mockResolvedValue([trip({ id: 1, date: '2026-08-01' })]);
    const { trips, load, save } = useFishing();
    await load();

    api.createTrip.mockResolvedValue(trip({ id: 2, date: '2026-08-09' }));
    await save({ date: '2026-08-09', startTime: null, endTime: null, notes: null, catches: [] });
    expect(trips.value.map(t => t.id)).toEqual([2, 1]);

    api.updateTrip.mockResolvedValue(trip({ id: 1, date: '2026-08-01', notes: 'corrigé' }));
    await save({ date: '2026-08-01', startTime: null, endTime: null, notes: 'corrigé', catches: [] }, 1);
    expect(api.updateTrip).toHaveBeenCalledWith(1, expect.objectContaining({ notes: 'corrigé' }));
    expect(trips.value.find(t => t.id === 1)!.notes).toBe('corrigé');
  });

  it('retire une sortie supprimée de la liste', async () => {
    api.getTrips.mockResolvedValue([trip({ id: 1 }), trip({ id: 2 })]);
    api.deleteTrip.mockResolvedValue(undefined);
    const { trips, load, remove } = useFishing();
    await load();
    await remove(1);
    expect(trips.value.map(t => t.id)).toEqual([2]);
  });

  it('donne le libellé d’un référentiel, et l’id brut s’il a disparu', async () => {
    api.getRefs.mockResolvedValue([
      { id: 'bar', kind: 'species', label: 'Bar' },
      { id: 'ligne', kind: 'gear', label: 'Ligne' }
    ]);
    const { species, gears, labelOf, load } = useFishingRefs();
    await load();
    expect(species.value.map(r => r.id)).toEqual(['bar']);
    expect(gears.value.map(r => r.id)).toEqual(['ligne']);
    expect(labelOf('bar')).toBe('Bar');
    expect(labelOf('espece-supprimee')).toBe('espece-supprimee');
  });
});
```

- [ ] **Step 4 : Lancer le test pour vérifier qu'il échoue**

Run : `cd client && npx vitest run src/composables/useFishing.test.ts`
Expected : FAIL — `Cannot find module './useFishing'`.

- [ ] **Step 5 : Écrire les composables**

Créer `client/src/composables/useFishingRefs.ts` :

```ts
import { computed, ref } from 'vue';
import {
  addRef as apiAdd,
  deleteRef as apiDelete,
  getRefs,
  resetRefs as apiReset,
  updateRef as apiUpdate
} from '../api/fishing';
import type { FishingRef, FishingRefKind } from '../types';

/**
 * Référentiels espèces/engins du carnet de pêche (issue #3), partagés (singleton) entre la vue
 * (libellés des prises, listes déroulantes du formulaire) et le panneau d'administration.
 */
const refs = ref<FishingRef[]>([]);
let loadPromise: Promise<void> | null = null;

/** Remet le singleton à zéro (tests uniquement). */
export function resetFishingRefsForTests(): void {
  refs.value = [];
  loadPromise = null;
}

export function useFishingRefs() {
  async function load(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    loadPromise = (async () => {
      try {
        refs.value = await getRefs();
      } catch {
        /* serveur indisponible : la vue affichera les ids bruts plutôt que rien */
      }
    })();
    return loadPromise;
  }

  const species = computed(() => refs.value.filter(r => r.kind === 'species'));
  const gears = computed(() => refs.value.filter(r => r.kind === 'gear'));

  /**
   * Libellé d'un référentiel. Repli sur l'**id brut** si l'entrée a disparu : une prise de 2026
   * doit rester lisible même après un nettoyage du référentiel.
   */
  function labelOf(id: string): string {
    return refs.value.find(r => r.id === id)?.label ?? id;
  }

  async function add(kind: FishingRefKind, label: string): Promise<void> {
    refs.value = [...refs.value, await apiAdd(kind, label)];
  }

  async function update(id: string, label: string): Promise<void> {
    const updated = await apiUpdate(id, label);
    refs.value = refs.value.map(r => (r.id === id ? updated : r));
  }

  async function remove(id: string): Promise<void> {
    await apiDelete(id);
    refs.value = refs.value.filter(r => r.id !== id);
  }

  async function reset(): Promise<void> {
    refs.value = await apiReset();
  }

  return { refs, species, gears, labelOf, load, add, update, remove, reset };
}
```

Créer `client/src/composables/useFishing.ts` :

```ts
import { ref } from 'vue';
import {
  createTrip,
  deleteTrip,
  getTrips,
  updateTrip
} from '../api/fishing';
import type { FishingTrip, FishingTripInput } from '../types';

/**
 * Sorties de pêche (issue #3), partagées (singleton). La liste arrive **déjà triée** de la plus
 * récente à la plus ancienne par le serveur ; on la maintient dans cet ordre à l'écriture.
 */
const trips = ref<FishingTrip[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let loadPromise: Promise<void> | null = null;

/** Remet le singleton à zéro (tests uniquement). */
export function resetFishingForTests(): void {
  trips.value = [];
  loading.value = false;
  error.value = null;
  loadPromise = null;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Réinsère une sortie à sa place (tri décroissant sur la date, puis sur l'id). */
function sortTrips(list: FishingTrip[]): FishingTrip[] {
  return [...list].sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
}

export function useFishing() {
  async function load(force = false): Promise<void> {
    if (loadPromise && !force) return loadPromise;
    loading.value = true;
    error.value = null;
    loadPromise = (async () => {
      try {
        trips.value = await getTrips();
      } catch (e) {
        error.value = message(e);
      } finally {
        loading.value = false;
      }
    })();
    return loadPromise;
  }

  /** Crée (`id` absent) ou remplace (`id` fourni) une sortie, puis met la liste à jour. */
  async function save(input: FishingTripInput, id?: number): Promise<FishingTrip> {
    const saved = id == null ? await createTrip(input) : await updateTrip(id, input);
    trips.value = sortTrips(
      id == null ? [saved, ...trips.value] : trips.value.map(t => (t.id === id ? saved : t))
    );
    return saved;
  }

  async function remove(id: number): Promise<void> {
    await deleteTrip(id);
    trips.value = trips.value.filter(t => t.id !== id);
  }

  return { trips, loading, error, load, save, remove };
}
```

- [ ] **Step 6 : Lancer le test pour vérifier qu'il passe**

Run : `cd client && npx vitest run src/composables/useFishing.test.ts`
Expected : PASS, 5 tests.

- [ ] **Step 7 : Commit**

```bash
git add client/src/types.ts client/src/api/fishing.ts client/src/composables/useFishing.ts client/src/composables/useFishingRefs.ts client/src/composables/useFishing.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): contrat client, appels REST et composables du carnet

labelOf retombe sur l'id brut : une prise de 2026 reste lisible après un
nettoyage du référentiel.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 : Fonctions pures du carnet (`lib/fishing.ts`)

**Files:**
- Create: `client/src/lib/fishing.ts`
- Test: `client/src/lib/fishing.test.ts`

**Interfaces:**
- Consumes: `aflotEvents` (`lib/navihan.ts`), `formatDate` / `addDays` (`lib/format.ts`), types `FlatTide`, `NavihanOffsets`, `FishingCatch`, `FishingRef`.
- Produces:
  - `summarizeCatches(catches: FishingCatch[], refs: FishingRef[]): string`
  - `interface AflotChoice { key: string; date: string; time: string; source: 'observed' | 'fixed'; coefficient: number | null; label: string }`
  - `aflotChoices(tides: FlatTide[], offsets: NavihanOffsets, observations: Record<string, string>, now: Date, daysBefore?: number, daysAfter?: number): AflotChoice[]`
  - `nearestAflot(choices: AflotChoice[], now: Date): AflotChoice | null`
  - `interface TripTideContext { coefficient: number | null; lowTides: string[]; aflot: string[] }`
  - `tripTideContext(date: string, tides: FlatTide[], offsets: NavihanOffsets): TripTideContext`

**Règles héritées du projet, à respecter :** l'heure retenue est celle **« Constaté »** si elle existe pour cette basse mer, sinon celle de **« Remise à flot »** (décalage fixe `offsets.aFlot`) — **jamais** l'estimation par seuil. Et un à-flot est daté du **jour où il a lieu**, pas de celui de sa basse mer.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `client/src/lib/fishing.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { aflotChoices, nearestAflot, summarizeCatches, tripTideContext } from './fishing';
import type { FishingCatch, FishingRef, FlatTide, NavihanOffsets } from '../types';

const REFS: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'tourteau', kind: 'species', label: 'Tourteau' },
  { id: 'crevette-bouquet', kind: 'species', label: 'Crevette bouquet' },
  { id: 'ligne', kind: 'gear', label: 'Ligne' },
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes' }
];

const OFFSETS: NavihanOffsets = { basseMer: 75, pleineMer: 75, aFlot: 160 };

function tide(over: Partial<FlatTide>): FlatTide {
  return {
    date: '2026-08-10',
    time: '12:00',
    height: 3,
    type: 'low',
    navihan: {},
    coefficient: null,
    ...over
  } as FlatTide;
}

const cat = (over: Partial<FishingCatch> = {}): FishingCatch => ({
  speciesId: 'bar',
  gearId: 'ligne',
  quantity: 1,
  sizeCm: null,
  weightG: null,
  kept: true,
  ...over
});

describe('summarizeCatches', () => {
  it('résume les prises en « quantité espèce », séparées par des points médians', () => {
    const text = summarizeCatches(
      [cat({ speciesId: 'crevette-bouquet', quantity: 12 }), cat({ speciesId: 'tourteau', quantity: 3 })],
      REFS
    );
    expect(text).toBe('12 crevettes bouquet · 3 tourteaux');
  });

  it('précise la taille ou le poids quand ils sont renseignés', () => {
    expect(summarizeCatches([cat({ quantity: 1, sizeCm: 42 })], REFS)).toBe('1 bar 42 cm');
    expect(summarizeCatches([cat({ quantity: 1, weightG: 900 })], REFS)).toBe('1 bar 900 g');
  });

  it('signale les prises relâchées', () => {
    expect(summarizeCatches([cat({ quantity: 2, kept: false })], REFS)).toBe('2 bars (relâchés)');
  });

  it('dit « bredouille » plutôt que de rendre une chaîne vide', () => {
    expect(summarizeCatches([], REFS)).toBe('Bredouille');
  });

  it('retombe sur l’id quand l’espèce a disparu du référentiel', () => {
    expect(summarizeCatches([cat({ speciesId: 'licorne', quantity: 1 })], REFS)).toBe('1 licorne');
  });
});

describe('aflotChoices', () => {
  const tides: FlatTide[] = [
    tide({ date: '2026-08-10', time: '07:10', type: 'low' }),
    tide({ date: '2026-08-10', time: '13:20', type: 'high', coefficient: 84, height: 5 }),
    tide({ date: '2026-08-10', time: '19:42', type: 'low' }),
    tide({ date: '2026-08-11', time: '01:50', type: 'high', coefficient: 88, height: 5 })
  ];

  it('date la remise à flot du jour où elle a lieu, minuit franchi', () => {
    // 19:42 + 2h40 = 22:22 le 10 ; une basse à 23:30 basculerait au lendemain.
    const tardive = [...tides, tide({ date: '2026-08-10', time: '23:30', type: 'low' })];
    const choices = aflotChoices(tardive, OFFSETS, {}, new Date('2026-08-10T12:00:00'));
    const wrapped = choices.find(c => c.time === '02:10');
    expect(wrapped?.date).toBe('2026-08-11');
  });

  it('préfère l’heure constatée au décalage fixe, et le signale', () => {
    const observations = { '2026-08-10 19:42': '22:05' };
    const choices = aflotChoices(tides, OFFSETS, observations, new Date('2026-08-10T12:00:00'));
    const fromEvening = choices.find(c => c.key === '2026-08-10 19:42')!;
    expect(fromEvening.time).toBe('22:05');
    expect(fromEvening.source).toBe('observed');

    const fromMorning = choices.find(c => c.key === '2026-08-10 07:10')!;
    expect(fromMorning.time).toBe('09:50');
    expect(fromMorning.source).toBe('fixed');
  });

  it('porte le coefficient du jour de la basse mer et un libellé lisible', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T12:00:00'));
    const evening = choices.find(c => c.key === '2026-08-10 19:42')!;
    expect(evening.coefficient).toBe(84);
    expect(evening.label).toContain('22:22');
    expect(evening.label).toContain('coef 84');
  });

  it('borne la liste à la fenêtre demandée autour d’aujourd’hui', () => {
    const large: FlatTide[] = [
      tide({ date: '2026-07-01', time: '10:00', type: 'low' }),
      tide({ date: '2026-08-09', time: '10:00', type: 'low' }),
      tide({ date: '2026-08-10', time: '10:00', type: 'low' }),
      tide({ date: '2026-09-30', time: '10:00', type: 'low' })
    ];
    const choices = aflotChoices(large, OFFSETS, {}, new Date('2026-08-10T12:00:00'), 7, 7);
    expect(choices.map(c => c.date)).toEqual(['2026-08-09', '2026-08-10']);
  });

  it('renvoie les choix par ordre chronologique', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T12:00:00'));
    const times = choices.map(c => `${c.date} ${c.time}`);
    expect([...times].sort()).toEqual(times);
  });
});

describe('nearestAflot', () => {
  const tides: FlatTide[] = [
    tide({ date: '2026-08-10', time: '07:10', type: 'low' }), // à-flot 09:50
    tide({ date: '2026-08-10', time: '19:42', type: 'low' }) // à-flot 22:22
  ];

  it('choisit l’à-flot passé quand il est le plus proche (saisie au retour)', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T11:00:00'));
    expect(nearestAflot(choices, new Date('2026-08-10T11:00:00'))!.time).toBe('09:50');
  });

  it('choisit l’à-flot à venir quand il est le plus proche (saisie avant de partir)', () => {
    const choices = aflotChoices(tides, OFFSETS, {}, new Date('2026-08-10T18:00:00'));
    expect(nearestAflot(choices, new Date('2026-08-10T18:00:00'))!.time).toBe('22:22');
  });

  it('renvoie null quand aucune marée n’est disponible', () => {
    expect(nearestAflot([], new Date('2026-08-10T12:00:00'))).toBeNull();
  });
});

describe('tripTideContext', () => {
  const tides: FlatTide[] = [
    tide({ date: '2026-08-10', time: '07:10', type: 'low' }),
    tide({ date: '2026-08-10', time: '13:20', type: 'high', coefficient: 84, height: 5 }),
    tide({ date: '2026-08-10', time: '19:42', type: 'low' }),
    tide({ date: '2026-08-10', time: '01:05', type: 'high', coefficient: 80, height: 5 })
  ];

  it('donne le coefficient du jour (le plus fort des pleines mers) et ses basses mers', () => {
    const ctx = tripTideContext('2026-08-10', tides, OFFSETS);
    expect(ctx.coefficient).toBe(84);
    expect(ctx.lowTides).toEqual(['07:10', '19:42']);
  });

  it('liste les remises à flot qui ont lieu ce jour-là, pas celles de ses basses mers', () => {
    const tardive = [...tides, tide({ date: '2026-08-09', time: '23:30', type: 'low' })];
    const ctx = tripTideContext('2026-08-10', tardive, OFFSETS);
    expect(ctx.aflot).toEqual(['02:10', '09:50', '22:22']);
  });

  it('renvoie un contexte vide pour un jour non couvert par les horaires', () => {
    expect(tripTideContext('2027-01-01', tides, OFFSETS)).toEqual({
      coefficient: null,
      lowTides: [],
      aflot: []
    });
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd client && npx vitest run src/lib/fishing.test.ts`
Expected : FAIL — `Cannot find module './fishing'`.

- [ ] **Step 3 : Écrire les fonctions pures**

Créer `client/src/lib/fishing.ts` :

```ts
import type { FishingCatch, FishingRef, FlatTide, NavihanOffsets } from '../types';
import { aflotEvents } from './navihan';
import { addDays, formatDate } from './format';

const pad = (n: number): string => String(n).padStart(2, '0');

/** Date locale `YYYY-MM-DD` d'un instant (donc la date **réelle**, après passage de minuit). */
function localDate(dt: Date): string {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Heure locale `HH:MM` d'un instant. */
function localTime(dt: Date): string {
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

/** Coefficient d'un jour = le plus fort de ses pleines mers (les basses mers n'en portent pas). */
function dayCoefficient(tides: FlatTide[], date: string): number | null {
  const coefs = tides
    .filter(t => t.date === date && t.coefficient != null)
    .map(t => t.coefficient as number);
  return coefs.length ? Math.max(...coefs) : null;
}

/**
 * Pluriel simple d'un libellé d'espèce : « 3 tourteaux ». Les libellés composés (« crevette
 * bouquet ») ne prennent la marque que sur leur premier mot, et un libellé déjà terminé par `s`
 * ou `x` est laissé tel quel.
 */
function plural(label: string, quantity: number): string {
  if (quantity < 2) return label;
  const [first, ...rest] = label.split(' ');
  if (/[sx]$/i.test(first)) return label;
  return [`${first}s`, ...rest].join(' ');
}

/**
 * Résumé d'une sortie en une ligne : « 12 crevette bouquet · 3 tourteaux · 1 bar 42 cm ».
 * Une sortie sans prise n'est **pas** une absence de donnée : elle se lit « Bredouille ».
 * Un id absent du référentiel s'affiche brut, pour qu'une prise ancienne reste lisible.
 */
export function summarizeCatches(catches: FishingCatch[], refs: FishingRef[]): string {
  if (catches.length === 0) return 'Bredouille';
  const labelOf = (id: string) => refs.find(r => r.id === id)?.label ?? id;
  return catches
    .map(c => {
      const parts = [`${c.quantity}`, plural(labelOf(c.speciesId).toLowerCase(), c.quantity)];
      if (c.sizeCm != null) parts.push(`${c.sizeCm} cm`);
      else if (c.weightG != null) parts.push(`${c.weightG} g`);
      const text = parts.join(' ');
      return c.kept ? text : `${text} (${c.quantity > 1 ? 'relâchés' : 'relâché'})`;
    })
    .join(' · ');
}

/** Une remise à flot proposée au pré-remplissage du formulaire de sortie. */
export interface AflotChoice {
  /** Clé de la basse mer Port-Tudy d'origine (`YYYY-MM-DD HH:MM`) — identifie le choix. */
  key: string;
  /** Date **réelle** de la remise à flot (minuit franchi compris). */
  date: string;
  /** Heure retenue : constatée si elle existe, sinon décalage fixe. */
  time: string;
  source: 'observed' | 'fixed';
  coefficient: number | null;
  /** Libellé du sélecteur, ex. « lun. 10 août · 22:22 · coef 84 ». */
  label: string;
}

/**
 * Remises à flot proposées autour d'aujourd'hui, pour le sélecteur du formulaire (issue #3).
 *
 * Construit **sur `aflotEvents`** (`lib/navihan.ts`) : aucune formule d'à-flot n'est réécrite ici,
 * sans quoi deux calculs cohabiteraient et finiraient par diverger. L'heure retenue est celle
 * **constatée** si elle a été saisie pour cette basse mer, sinon celle du **décalage fixe** — jamais
 * l'estimation par seuil, cantonnée au tableau du dashboard. `observations` est la map de
 * `useAflotObservations` (clé `` `${date} ${heure}` `` de la basse mer Port-Tudy).
 */
export function aflotChoices(
  tides: FlatTide[],
  offsets: NavihanOffsets,
  observations: Record<string, string>,
  now: Date,
  daysBefore = 7,
  daysAfter = 7
): AflotChoice[] {
  const today = localDate(now);
  const min = addDays(today, -daysBefore);
  const max = addDays(today, daysAfter);

  return aflotEvents(tides, offsets)
    .map(({ dt, basse }) => {
      const key = `${basse.date} ${basse.time}`;
      const observed = observations[key];
      const date = localDate(dt);
      const time = observed ?? localTime(dt);
      const coefficient = dayCoefficient(tides, basse.date);
      const coefText = coefficient == null ? '' : ` · coef ${coefficient}`;
      return {
        key,
        date,
        time,
        source: observed ? ('observed' as const) : ('fixed' as const),
        coefficient,
        label: `${formatDate(date)} · ${time}${coefText}`
      };
    })
    .filter(c => c.date >= min && c.date <= max)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

/**
 * Remise à flot **la plus proche de maintenant**, passée ou à venir. Le passé compte autant que
 * l'avenir : on note souvent ses prises en rentrant, et proposer alors l'à-flot du lendemain matin
 * obligerait à corriger à chaque saisie.
 */
export function nearestAflot(choices: AflotChoice[], now: Date): AflotChoice | null {
  let best: AflotChoice | null = null;
  let bestGap = Infinity;
  for (const choice of choices) {
    const gap = Math.abs(new Date(`${choice.date}T${choice.time}:00`).getTime() - now.getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = choice;
    }
  }
  return best;
}

/** Contexte marée d'un jour de sortie — **recalculé**, jamais stocké. */
export interface TripTideContext {
  coefficient: number | null;
  /** Heures des basses mers Port-Tudy du jour, chronologiques. */
  lowTides: string[];
  /** Heures des remises à flot **ayant lieu ce jour-là** (décalage fixe), chronologiques. */
  aflot: string[];
}

/**
 * Contexte marée d'une sortie, dérivé de sa date. Rien n'en est persisté : ce projet a déjà repris
 * 11 journées de graine depuis l'annuaire officiel, et une correction doit profiter aux sorties
 * déjà saisies. Un jour non couvert renvoie un contexte vide, sans jamais faire échouer l'affichage.
 */
export function tripTideContext(
  date: string,
  tides: FlatTide[],
  offsets: NavihanOffsets
): TripTideContext {
  return {
    coefficient: dayCoefficient(tides, date),
    lowTides: tides
      .filter(t => t.date === date && t.type === 'low')
      .map(t => t.time)
      .sort(),
    // Regroupement par date **réelle** de l'à-flot : une basse mer de la veille peut donner une
    // remise à flot de ce jour, et une basse mer tardive du jour la donne au lendemain.
    aflot: aflotEvents(tides, offsets)
      .filter(({ dt }) => localDate(dt) === date)
      .map(({ dt }) => localTime(dt))
  };
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd client && npx vitest run src/lib/fishing.test.ts`
Expected : PASS, 15 tests.

- [ ] **Step 5 : Commit**

```bash
git add client/src/lib/fishing.ts client/src/lib/fishing.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): fonctions pures du carnet (résumé, contexte marée, à-flot)

aflotChoices s'appuie sur aflotEvents plutôt que de refaire le calcul :
deux formules d'à-flot finiraient par diverger. L'heure constatée prime
sur le décalage fixe, et jamais l'estimation par seuil.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 : Carte d'une sortie en lecture

**Files:**
- Create: `client/src/components/FishingTripCard.vue`
- Test: `client/src/components/FishingTripCard.test.ts`

**Interfaces:**
- Consumes: `summarizeCatches`, `TripTideContext` (Task 9) ; `formatDate`, `relativeDayLabel` (`lib/format.ts`) ; `wmoIcon`, `degToCompass` (`lib/weather.ts`) ; types `FishingTrip`, `FishingRef`.
- Produces: composant `FishingTripCard` — props `{ trip: FishingTrip; refs: FishingRef[]; context: TripTideContext; today: string; canEdit: boolean }`, événements `edit` (payload `FishingTrip`) et `remove` (payload `number`).

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `client/src/components/FishingTripCard.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FishingTripCard from './FishingTripCard.vue';
import type { FishingRef, FishingTrip } from '../types';

const REFS: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'ligne', kind: 'gear', label: 'Ligne' }
];

const TRIP: FishingTrip = {
  id: 1,
  date: '2026-08-10',
  startTime: '19:42',
  endTime: '21:10',
  notes: 'Vent d’ouest',
  weather: { tempMin: 14, tempMax: 22, windMax: 18, windDir: 250, weatherCode: 3, seaTemperature: 19.5 },
  catches: [{ speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true }],
  createdAt: 'x',
  updatedAt: 'x'
};

const CONTEXT = { coefficient: 84, lowTides: ['07:10', '19:42'], aflot: ['09:50', '22:22'] };

function factory(over: Record<string, unknown> = {}) {
  return mount(FishingTripCard, {
    props: { trip: TRIP, refs: REFS, context: CONTEXT, today: '2026-08-10', canEdit: true, ...over }
  });
}

describe('FishingTripCard', () => {
  it('affiche le jour, le créneau et le résumé des prises', () => {
    const text = factory().text();
    expect(text).toContain("aujourd'hui");
    expect(text).toContain('19:42');
    expect(text).toContain('21:10');
    expect(text).toContain('1 bar 42 cm');
  });

  it('affiche le contexte marée recalculé', () => {
    const text = factory().text();
    expect(text).toContain('coef 84');
    expect(text).toContain('22:22');
  });

  it('affiche la météo figée quand elle existe', () => {
    expect(factory().text()).toContain('22');
    expect(factory().text()).toContain('19,5');
  });

  it('n’affiche pas de bloc météo quand elle est absente', () => {
    const wrapper = factory({ trip: { ...TRIP, weather: null } });
    expect(wrapper.find('.trip-weather').exists()).toBe(false);
  });

  it('dit « Bredouille » pour une sortie sans prise', () => {
    expect(factory({ trip: { ...TRIP, catches: [] } }).text()).toContain('Bredouille');
  });

  it('émet edit et remove pour un admin', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="edit"]').trigger('click');
    await wrapper.find('[data-test="remove"]').trigger('click');
    expect(wrapper.emitted('edit')![0]).toEqual([TRIP]);
    expect(wrapper.emitted('remove')![0]).toEqual([1]);
  });

  it('masque les actions hors admin', () => {
    const wrapper = factory({ canEdit: false });
    expect(wrapper.find('[data-test="edit"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="remove"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd client && npx vitest run src/components/FishingTripCard.test.ts`
Expected : FAIL — `Failed to resolve import "./FishingTripCard.vue"`.

- [ ] **Step 3 : Écrire le composant**

Créer `client/src/components/FishingTripCard.vue` :

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { FishingRef, FishingTrip } from '../types';
import { summarizeCatches, type TripTideContext } from '../lib/fishing';
import { relativeDayLabel } from '../lib/format';
import { degToCompass, wmoIcon } from '../lib/weather';

const props = defineProps<{
  trip: FishingTrip;
  refs: FishingRef[];
  context: TripTideContext;
  today: string;
  canEdit: boolean;
}>();

const emit = defineEmits<{ edit: [FishingTrip]; remove: [number] }>();

// Majuscule posée en JS : `text-capitalize` en mettrait une à chaque mot (« Lun. 10 Août »).
const dayLabel = computed(() => {
  const label = relativeDayLabel(props.trip.date, props.today);
  return label.charAt(0).toUpperCase() + label.slice(1);
});

const slot = computed(() => {
  const { startTime, endTime } = props.trip;
  if (startTime && endTime) return `${startTime} → ${endTime}`;
  return startTime ?? endTime ?? null;
});

const summary = computed(() => summarizeCatches(props.trip.catches, props.refs));

/**
 * Engins employés, **dédoublonnés** : une ligne par prise répéterait « Casier à crabes » autant de
 * fois qu'il y a d'espèces, sans rien apprendre. Repli sur l'id si le référentiel a disparu.
 */
const gearsUsed = computed(() => {
  const labelOf = (id: string) => props.refs.find(r => r.id === id)?.label ?? id;
  return [...new Set(props.trip.catches.map(c => labelOf(c.gearId)))];
});

/** Températures avec la virgule décimale française. */
function num(value: number): string {
  return String(value).replace('.', ',');
}
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
        <div>
          <h2 class="h6 mb-0">{{ dayLabel }}</h2>
          <div class="text-muted small">
            <span v-if="slot"><i class="bi bi-clock me-1"></i>{{ slot }}</span>
            <span v-else class="fst-italic">horaire non précisé</span>
          </div>
        </div>
        <div v-if="canEdit" class="btn-group btn-group-sm">
          <button
            type="button"
            class="btn btn-outline-secondary"
            data-test="edit"
            title="Modifier"
            aria-label="Modifier la sortie"
            @click="emit('edit', trip)"
          >
            <i class="bi bi-pencil"></i>
          </button>
          <button
            type="button"
            class="btn btn-outline-danger"
            data-test="remove"
            title="Supprimer"
            aria-label="Supprimer la sortie"
            @click="emit('remove', trip.id)"
          >
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>

      <!-- Contexte marée : **recalculé** à l'affichage, jamais stocké avec la sortie. -->
      <div class="small text-muted mb-2 trip-tide">
        <span v-if="context.coefficient != null" class="me-2">
          <i class="bi bi-graph-up me-1"></i>coef {{ context.coefficient }}
        </span>
        <span v-if="context.lowTides.length" class="me-2">
          <i class="bi bi-arrow-down-short"></i>{{ context.lowTides.join(' · ') }}
        </span>
        <span v-if="context.aflot.length">
          <i class="bi bi-check2-circle me-1"></i>à flot {{ context.aflot.join(' · ') }}
        </span>
        <span v-if="context.coefficient == null && !context.aflot.length" class="fst-italic">
          marée inconnue pour ce jour
        </span>
      </div>

      <p class="mb-2 fw-semibold trip-summary">{{ summary }}</p>

      <p v-if="gearsUsed.length" class="small text-muted mb-2 trip-gears">
        <i class="bi bi-tools me-1"></i>{{ gearsUsed.join(' \u00b7 ') }}
      </p>

      <p v-if="trip.notes" class="mb-2 small trip-notes">
        <i class="bi bi-journal-text me-1"></i>{{ trip.notes }}
      </p>

      <!-- Météo **figée à la création** : elle décrit ce jour-là, pas le jour de consultation. -->
      <div v-if="trip.weather" class="small text-muted trip-weather">
        <i :class="`bi ${wmoIcon(trip.weather.weatherCode ?? 0)} me-1`"></i>
        <span v-if="trip.weather.tempMin != null && trip.weather.tempMax != null" class="me-2">
          {{ num(trip.weather.tempMin) }} – {{ num(trip.weather.tempMax) }} °C
        </span>
        <span v-if="trip.weather.windMax != null" class="me-2">
          <i class="bi bi-wind me-1"></i>{{ num(trip.weather.windMax) }} km/h
          <template v-if="trip.weather.windDir != null">{{ degToCompass(trip.weather.windDir) }}</template>
        </span>
        <span v-if="trip.weather.seaTemperature != null">
          <i class="bi bi-thermometer-half me-1"></i>eau {{ num(trip.weather.seaTemperature) }} °C
        </span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd client && npx vitest run src/components/FishingTripCard.test.ts`
Expected : PASS, 7 tests.

Si `wmoIcon` ou `degToCompass` n'ont pas la signature attendue, ouvrir `client/src/lib/weather.ts` et adapter l'appel — ne pas dupliquer ces fonctions.

- [ ] **Step 5 : Commit**

```bash
git add client/src/components/FishingTripCard.vue client/src/components/FishingTripCard.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): carte de lecture d'une sortie

Le contexte marée est affiché depuis un calcul, la météo depuis
l'instantané figé : les deux natures de donnée restent distinctes.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 : Formulaire de saisie d'une sortie

**Files:**
- Create: `client/src/components/FishingTripForm.vue`
- Test: `client/src/components/FishingTripForm.test.ts`

**Interfaces:**
- Consumes: `AflotChoice` (Task 9) ; types `FishingRef`, `FishingTrip`, `FishingTripInput`, `FishingCatch`.
- Produces: composant `FishingTripForm` — props `{ species: FishingRef[]; gears: FishingRef[]; choices: AflotChoice[]; initial?: FishingTrip | null; defaultChoice?: AflotChoice | null; saving?: boolean }`, événements `save` (payload `FishingTripInput`) et `cancel`.

**Rappel de conception :** carte dépliée en haut de page, **pas une modale** — N lignes de prises à ajouter/retirer sont inutilisables dans une modale sur téléphone. Le `<select>` d'à-flot **réécrit** date et heure de début ; taper dans les champs reste libre et ne touche pas au sélecteur. **L'heure de fin n'est jamais pré-remplie.**

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `client/src/components/FishingTripForm.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FishingTripForm from './FishingTripForm.vue';
import type { AflotChoice } from '../lib/fishing';
import type { FishingRef, FishingTrip } from '../types';

const SPECIES: FishingRef[] = [
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'tourteau', kind: 'species', label: 'Tourteau' }
];
const GEARS: FishingRef[] = [
  { id: 'ligne', kind: 'gear', label: 'Ligne' },
  { id: 'casier-crabes', kind: 'gear', label: 'Casier à crabes' }
];

const CHOICES: AflotChoice[] = [
  { key: '2026-08-10 07:10', date: '2026-08-10', time: '09:50', source: 'fixed', coefficient: 84, label: 'lun. 10 août · 09:50 · coef 84' },
  { key: '2026-08-10 19:42', date: '2026-08-10', time: '22:22', source: 'fixed', coefficient: 84, label: 'lun. 10 août · 22:22 · coef 84' }
];

function factory(over: Record<string, unknown> = {}) {
  return mount(FishingTripForm, {
    props: { species: SPECIES, gears: GEARS, choices: CHOICES, defaultChoice: CHOICES[1], ...over }
  });
}

describe('FishingTripForm', () => {
  it('pré-remplit date et heure de début depuis la remise à flot la plus proche', () => {
    const wrapper = factory();
    expect((wrapper.find('[data-test="date"]').element as HTMLInputElement).value).toBe('2026-08-10');
    expect((wrapper.find('[data-test="start"]').element as HTMLInputElement).value).toBe('22:22');
  });

  it('ne pré-remplit jamais l’heure de fin', () => {
    expect((factory().find('[data-test="end"]').element as HTMLInputElement).value).toBe('');
  });

  it('réécrit date et heure quand on change d’à-flot dans le sélecteur', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="aflot"]').setValue('2026-08-10 07:10');
    expect((wrapper.find('[data-test="start"]').element as HTMLInputElement).value).toBe('09:50');
  });

  it('laisse modifier l’heure à la main sans que le sélecteur la remette', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="start"]').setValue('20:15');
    expect((wrapper.find('[data-test="start"]').element as HTMLInputElement).value).toBe('20:15');
  });

  it('ajoute et retire des lignes de prise', async () => {
    const wrapper = factory();
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(0);
    await wrapper.find('[data-test="add-catch"]').trigger('click');
    await wrapper.find('[data-test="add-catch"]').trigger('click');
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(2);
    await wrapper.findAll('[data-test="remove-catch"]')[0].trigger('click');
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(1);
  });

  it('émet save avec la sortie saisie, prises comprises', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="add-catch"]').trigger('click');
    await wrapper.find('[data-test="species"]').setValue('bar');
    await wrapper.find('[data-test="gear"]').setValue('ligne');
    await wrapper.find('[data-test="quantity"]').setValue('2');
    await wrapper.find('[data-test="notes"]').setValue('Belle soirée');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('save')![0][0]).toEqual({
      date: '2026-08-10',
      startTime: '22:22',
      endTime: null,
      notes: 'Belle soirée',
      catches: [{ speciesId: 'bar', gearId: 'ligne', quantity: 2, sizeCm: null, weightG: null, kept: true }]
    });
  });

  it('permet d’enregistrer une sortie bredouille', async () => {
    const wrapper = factory();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('save')![0][0]).toMatchObject({ catches: [] });
  });

  it('reprend une sortie existante en édition', () => {
    const trip: FishingTrip = {
      id: 7,
      date: '2026-07-04',
      startTime: '06:30',
      endTime: '09:00',
      notes: 'Casiers',
      weather: null,
      catches: [{ speciesId: 'tourteau', gearId: 'casier-crabes', quantity: 3, sizeCm: null, weightG: null, kept: true }],
      createdAt: 'x',
      updatedAt: 'x'
    };
    const wrapper = factory({ initial: trip });
    expect((wrapper.find('[data-test="date"]').element as HTMLInputElement).value).toBe('2026-07-04');
    expect((wrapper.find('[data-test="end"]').element as HTMLInputElement).value).toBe('09:00');
    expect(wrapper.findAll('[data-test="catch-row"]')).toHaveLength(1);
  });

  it('émet cancel', async () => {
    const wrapper = factory();
    await wrapper.find('[data-test="cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd client && npx vitest run src/components/FishingTripForm.test.ts`
Expected : FAIL — `Failed to resolve import "./FishingTripForm.vue"`.

- [ ] **Step 3 : Écrire le composant**

Créer `client/src/components/FishingTripForm.vue` :

```vue
<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import type { FishingCatch, FishingRef, FishingTrip, FishingTripInput } from '../types';
import type { AflotChoice } from '../lib/fishing';

const props = withDefaults(
  defineProps<{
    species: FishingRef[];
    gears: FishingRef[];
    choices: AflotChoice[];
    initial?: FishingTrip | null;
    defaultChoice?: AflotChoice | null;
    saving?: boolean;
  }>(),
  { initial: null, defaultChoice: null, saving: false }
);

const emit = defineEmits<{ save: [FishingTripInput]; cancel: [] }>();

/** Ligne de prise en cours de saisie : les nombres transitent en chaîne (champs `<input>`). */
interface CatchDraft {
  speciesId: string;
  gearId: string;
  quantity: string;
  sizeCm: string;
  weightG: string;
  kept: boolean;
}

const form = reactive({
  date: '',
  startTime: '',
  endTime: '',
  notes: ''
});

/**
 * Clé de l'à-flot sélectionné. Vide = « aucun » : une sortie à la ligne ne découle pas forcément
 * d'une remise à flot. Rien de tout cela n'est enregistré — c'est une commodité de saisie.
 */
const selectedAflot = ref('');
const catches = ref<CatchDraft[]>([]);

function draftFromCatch(c: FishingCatch): CatchDraft {
  return {
    speciesId: c.speciesId,
    gearId: c.gearId,
    quantity: String(c.quantity),
    sizeCm: c.sizeCm == null ? '' : String(c.sizeCm),
    weightG: c.weightG == null ? '' : String(c.weightG),
    kept: c.kept
  };
}

/** (Ré)initialise le formulaire : édition d'une sortie, ou création pré-remplie par l'à-flot. */
function reset(): void {
  if (props.initial) {
    form.date = props.initial.date;
    form.startTime = props.initial.startTime ?? '';
    form.endTime = props.initial.endTime ?? '';
    form.notes = props.initial.notes ?? '';
    selectedAflot.value = '';
    catches.value = props.initial.catches.map(draftFromCatch);
    return;
  }
  const choice = props.defaultChoice;
  form.date = choice?.date ?? '';
  form.startTime = choice?.time ?? '';
  // L'heure de fin reste vide : personne ne sait quand la sortie se terminera.
  form.endTime = '';
  form.notes = '';
  selectedAflot.value = choice?.key ?? '';
  catches.value = [];
}

reset();

/**
 * Le formulaire est monté par un `v-if` : `reset()` au setup suffit dans le cas normal. Ce watch
 * ne couvre qu'un cas : le formulaire ouvert **avant** que les marées ne soient chargées, donc sans
 * pré-remplissage possible. Il ne s'applique que si la date est encore vide — sinon une saisie déjà
 * commencée serait écrasée à l'arrivée des horaires.
 */
watch(
  () => props.defaultChoice,
  choice => {
    if (props.initial || form.date || !choice) return;
    form.date = choice.date;
    form.startTime = choice.time;
    selectedAflot.value = choice.key;
  }
);

/**
 * Choisir un à-flot **réécrit** date et heure de début : c'est la raison d'être du sélecteur.
 * L'inverse n'est pas vrai — modifier les champs à la main ne touche pas au sélecteur.
 */
function onAflotChange(): void {
  const choice = props.choices.find(c => c.key === selectedAflot.value);
  if (!choice) return;
  form.date = choice.date;
  form.startTime = choice.time;
}

function addCatch(): void {
  catches.value = [
    ...catches.value,
    {
      speciesId: props.species[0]?.id ?? '',
      gearId: props.gears[0]?.id ?? '',
      quantity: '1',
      sizeCm: '',
      weightG: '',
      kept: true
    }
  ];
}

function removeCatch(index: number): void {
  catches.value = catches.value.filter((_, i) => i !== index);
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function onSubmit(): void {
  emit('save', {
    date: form.date,
    startTime: form.startTime || null,
    endTime: form.endTime || null,
    notes: form.notes.trim() || null,
    catches: catches.value.map(d => ({
      speciesId: d.speciesId,
      gearId: d.gearId,
      quantity: Number(d.quantity) || 1,
      sizeCm: optionalNumber(d.sizeCm),
      weightG: optionalNumber(d.weightG),
      kept: d.kept
    }))
  });
}
</script>

<template>
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-body-tertiary">
      <h2 class="h6 mb-0">
        <i class="bi bi-pencil-square me-2"></i>{{ initial ? 'Modifier la sortie' : 'Nouvelle sortie' }}
      </h2>
    </div>
    <div class="card-body">
      <form @submit.prevent="onSubmit">
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-6">
            <label for="tripAflot" class="form-label small mb-1">Remise à flot</label>
            <select
              id="tripAflot"
              v-model="selectedAflot"
              class="form-select form-select-sm"
              data-test="aflot"
              @change="onAflotChange"
            >
              <option value="">Aucune (sortie à la ligne)</option>
              <option v-for="c in choices" :key="c.key" :value="c.key">{{ c.label }}</option>
            </select>
            <div class="form-text">Pré-remplit la date et l'heure de début ; rien n'est enregistré.</div>
          </div>
          <div class="col-6 col-md-2">
            <label for="tripDate" class="form-label small mb-1">Date</label>
            <input id="tripDate" v-model="form.date" type="date" class="form-control form-control-sm" data-test="date" required />
          </div>
          <div class="col-3 col-md-2">
            <label for="tripStart" class="form-label small mb-1">Début</label>
            <input id="tripStart" v-model="form.startTime" type="time" class="form-control form-control-sm" data-test="start" />
          </div>
          <div class="col-3 col-md-2">
            <label for="tripEnd" class="form-label small mb-1">Fin</label>
            <input id="tripEnd" v-model="form.endTime" type="time" class="form-control form-control-sm" data-test="end" />
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center mb-2">
          <h3 class="h6 mb-0 text-uppercase text-muted small fw-bold">Prises</h3>
          <button type="button" class="btn btn-sm btn-outline-primary" data-test="add-catch" @click="addCatch">
            <i class="bi bi-plus-lg me-1"></i>Ajouter une prise
          </button>
        </div>

        <p v-if="!catches.length" class="text-muted small fst-italic">
          Aucune prise : la sortie sera enregistrée comme bredouille.
        </p>

        <div v-for="(c, i) in catches" :key="i" class="row g-2 align-items-end mb-2" data-test="catch-row">
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1" :for="`species-${i}`">Espèce</label>
            <select :id="`species-${i}`" v-model="c.speciesId" class="form-select form-select-sm" data-test="species">
              <option v-for="s in species" :key="s.id" :value="s.id">{{ s.label }}</option>
            </select>
          </div>
          <div class="col-6 col-md-3">
            <label class="form-label small mb-1" :for="`gear-${i}`">Engin</label>
            <select :id="`gear-${i}`" v-model="c.gearId" class="form-select form-select-sm" data-test="gear">
              <option v-for="g in gears" :key="g.id" :value="g.id">{{ g.label }}</option>
            </select>
          </div>
          <div class="col-3 col-md-1">
            <label class="form-label small mb-1" :for="`qty-${i}`">Nb</label>
            <input :id="`qty-${i}`" v-model="c.quantity" type="number" min="1" max="9999" class="form-control form-control-sm" data-test="quantity" />
          </div>
          <div class="col-3 col-md-2">
            <label class="form-label small mb-1" :for="`size-${i}`">Taille (cm)</label>
            <input :id="`size-${i}`" v-model="c.sizeCm" type="number" min="0" max="300" class="form-control form-control-sm" data-test="size" />
          </div>
          <div class="col-3 col-md-2">
            <label class="form-label small mb-1" :for="`weight-${i}`">Poids (g)</label>
            <input :id="`weight-${i}`" v-model="c.weightG" type="number" min="0" max="100000" class="form-control form-control-sm" data-test="weight" />
          </div>
          <div class="col-3 col-md-1 d-flex align-items-center gap-2">
            <div class="form-check mb-0">
              <input :id="`kept-${i}`" v-model="c.kept" class="form-check-input" type="checkbox" data-test="kept" />
              <label class="form-check-label small" :for="`kept-${i}`">Gardé</label>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline-danger"
              data-test="remove-catch"
              :aria-label="`Retirer la prise ${i + 1}`"
              @click="removeCatch(i)"
            >
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
        </div>

        <div class="mb-3">
          <label for="tripNotes" class="form-label small mb-1">Notes</label>
          <textarea
            id="tripNotes"
            v-model="form.notes"
            class="form-control form-control-sm"
            rows="2"
            maxlength="1000"
            placeholder="Appât, état de la mer, ce qui s'est mal passé…"
            data-test="notes"
          ></textarea>
        </div>

        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-sm btn-primary" :disabled="saving">
            <i class="bi bi-check-lg me-1"></i>Enregistrer
          </button>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-test="cancel" @click="emit('cancel')">
            Annuler
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd client && npx vitest run src/components/FishingTripForm.test.ts`
Expected : PASS, 9 tests.

- [ ] **Step 5 : Commit**

```bash
git add client/src/components/FishingTripForm.vue client/src/components/FishingTripForm.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): formulaire de saisie d'une sortie

Le sélecteur d'à-flot réécrit date et heure de début ; l'heure de fin
n'est jamais pré-remplie, personne ne sait quand la sortie s'achèvera.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 : Vue `/peche` complète

**Files:**
- Modify: `client/src/views/FishingView.vue` (remplace la coquille de la Task 7)
- Test: `client/src/views/FishingView.test.ts`

**Interfaces:**
- Consumes: `useFishing`, `useFishingRefs` (Task 8) ; `aflotChoices`, `nearestAflot`, `tripTideContext` (Task 9) ; `FishingTripCard` (Task 10), `FishingTripForm` (Task 11) ; `getTides` (`api/tides.ts`), `flatten` (`lib/tides.ts`), `useSettings`, `useAflotObservations`, `useAuth`, `todayKey`/`addDays` (`lib/format.ts`).
- Produces: vue `/peche` — liste antichronologique, formulaire inline, états chargement / erreur / liste vide.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `client/src/views/FishingView.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const getTripsMock = vi.fn();
const createTripMock = vi.fn();
const deleteTripMock = vi.fn();
const getRefsMock = vi.fn();
const getTidesMock = vi.fn();
const getObservationsMock = vi.fn();

vi.mock('../api/fishing', () => ({
  getTrips: (...a: unknown[]) => getTripsMock(...a),
  createTrip: (...a: unknown[]) => createTripMock(...a),
  updateTrip: vi.fn(),
  deleteTrip: (...a: unknown[]) => deleteTripMock(...a),
  getRefs: (...a: unknown[]) => getRefsMock(...a),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  resetRefs: vi.fn()
}));

vi.mock('../api/tides', () => ({
  getTides: (...a: unknown[]) => getTidesMock(...a),
  getMeta: vi.fn(),
  getSites: vi.fn(),
  fetchJson: vi.fn()
}));

vi.mock('../api/aflotObservations', () => ({
  getObservations: (...a: unknown[]) => getObservationsMock(...a),
  saveObservation: vi.fn(),
  deleteObservation: vi.fn()
}));

// Rôle pilotable test par test. La ref est créée **dans la factory** (les factories `vi.mock` sont
// hissées au-dessus des imports du fichier, `ref` n'y est pas encore disponible autrement) puis
// récupérée via `useAuth()` lui-même. Une simple `{ value: … }` ne suffirait pas : le template
// n'unwrappe que les vraies refs, et l'objet serait toujours truthy.
vi.mock('../composables/useAuth', async () => {
  const { ref } = await import('vue');
  const isAdmin = ref(true);
  return { useAuth: () => ({ isAdmin }) };
});

import FishingView from './FishingView.vue';
import { useAuth } from '../composables/useAuth';
import { resetFishingForTests } from '../composables/useFishing';
import { resetFishingRefsForTests } from '../composables/useFishingRefs';

const REFS = [
  { id: 'bar', kind: 'species', label: 'Bar' },
  { id: 'ligne', kind: 'gear', label: 'Ligne' }
];

const TRIP = {
  id: 1,
  date: '2026-08-10',
  startTime: '19:42',
  endTime: null,
  notes: null,
  weather: null,
  catches: [{ speciesId: 'bar', gearId: 'ligne', quantity: 1, sizeCm: 42, weightG: null, kept: true }],
  createdAt: 'x',
  updatedAt: 'x'
};

const TIDES = {
  siteId: 'port-tudy',
  timezone: 'Europe/Paris',
  from: '2026-08-03',
  to: '2026-08-17',
  days: {
    '2026-08-10': [
      { time: '07:10', height: 1.8, type: 'low', navihan: {}, coefficient: null },
      { time: '13:20', height: 5.1, type: 'high', navihan: {}, coefficient: 84 },
      { time: '19:42', height: 1.7, type: 'low', navihan: {}, coefficient: null }
    ]
  }
};

describe('FishingView', () => {
  beforeEach(() => {
    // Ne feindre que `Date` : feindre les timers ferait boucler `flushPromises`.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-10T18:00:00'));
    useAuth().isAdmin.value = true;
    [getTripsMock, createTripMock, deleteTripMock, getRefsMock, getTidesMock, getObservationsMock].forEach(m =>
      m.mockReset()
    );
    getRefsMock.mockResolvedValue(REFS);
    getTidesMock.mockResolvedValue(TIDES);
    getObservationsMock.mockResolvedValue([]);
    resetFishingForTests();
    resetFishingRefsForTests();
  });

  it('affiche les sorties chargées', async () => {
    getTripsMock.mockResolvedValue([TRIP]);
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('1 bar 42 cm');
  });

  it('affiche un état vide explicite', async () => {
    getTripsMock.mockResolvedValue([]);
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('Aucune sortie');
  });

  it('affiche l’erreur de chargement', async () => {
    getTripsMock.mockRejectedValue(new Error('serveur muet'));
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.text()).toContain('serveur muet');
  });

  it('ouvre le formulaire sur « Nouvelle sortie » et l’envoie', async () => {
    getTripsMock.mockResolvedValue([]);
    createTripMock.mockResolvedValue(TRIP);
    const wrapper = mount(FishingView);
    await flushPromises();

    await wrapper.find('[data-test="new-trip"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(true);

    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(createTripMock).toHaveBeenCalledOnce();
  });

  it('masque « Nouvelle sortie » hors admin', async () => {
    useAuth().isAdmin.value = false;
    getTripsMock.mockResolvedValue([]);
    const wrapper = mount(FishingView);
    await flushPromises();
    expect(wrapper.find('[data-test="new-trip"]').exists()).toBe(false);
  });

  it('charge les marées Port-Tudy sur une plage couvrant sorties et fenêtre de saisie', async () => {
    getTripsMock.mockResolvedValue([TRIP]);
    mount(FishingView);
    await flushPromises();
    expect(getTidesMock).toHaveBeenCalledWith('2026-08-03', '2026-08-17', 'port-tudy');
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd client && npx vitest run src/views/FishingView.test.ts`
Expected : FAIL — la coquille de la Task 7 n'affiche ni sortie, ni bouton.

- [ ] **Step 3 : Écrire la vue**

Remplacer entièrement `client/src/views/FishingView.vue` :

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import FishingTripCard from '../components/FishingTripCard.vue';
import FishingTripForm from '../components/FishingTripForm.vue';
import { useFishing } from '../composables/useFishing';
import { useFishingRefs } from '../composables/useFishingRefs';
import { useSettings } from '../composables/useSettings';
import { useAflotObservations } from '../composables/useAflotObservations';
import { useAuth } from '../composables/useAuth';
import { getTides } from '../api/tides';
import { flatten } from '../lib/tides';
import { aflotChoices, nearestAflot, tripTideContext } from '../lib/fishing';
import { addDays, todayKey } from '../lib/format';
import type { FishingTrip, FishingTripInput, FlatTide } from '../types';

/** Fenêtre de pré-remplissage autour d'aujourd'hui (jours), de part et d'autre. */
const AFLOT_WINDOW_DAYS = 7;

const { trips, loading, error, load, save, remove } = useFishing();
const { species, gears, refs, load: loadRefs } = useFishingRefs();
const { settings, load: loadSettings } = useSettings();
const { map: observations, load: loadObservations } = useAflotObservations();
const { isAdmin } = useAuth();

const today = ref(todayKey());
const tides = ref<FlatTide[]>([]);
const editing = ref<FishingTrip | null>(null);
const formOpen = ref(false);
const saving = ref(false);
const actionError = ref<string | null>(null);

/**
 * Marées **Port-Tudy** couvrant les sorties existantes **et** la fenêtre de pré-remplissage :
 * le contexte marée est recalculé à l'affichage, il faut donc les horaires de chaque jour listé.
 */
async function loadTides(): Promise<void> {
  const dates = trips.value.map(t => t.date);
  const from = [addDays(today.value, -AFLOT_WINDOW_DAYS), ...dates].sort()[0];
  const to = [addDays(today.value, AFLOT_WINDOW_DAYS), ...dates].sort().at(-1)!;
  try {
    tides.value = flatten(await getTides(from, to, 'port-tudy'));
  } catch {
    tides.value = []; // horaires indisponibles : les cartes afficheront « marée inconnue »
  }
}

onMounted(async () => {
  await Promise.all([load(), loadRefs(), loadSettings(), loadObservations().catch(() => undefined)]);
  await loadTides();
});

// Une sortie ajoutée hors de la plage déjà chargée doit voir son contexte marée apparaître.
watch(() => trips.value.map(t => t.date).join(','), loadTides);

const choices = computed(() =>
  aflotChoices(tides.value, settings.navihan, observations, new Date(), AFLOT_WINDOW_DAYS, AFLOT_WINDOW_DAYS)
);
const defaultChoice = computed(() => nearestAflot(choices.value, new Date()));

function contextOf(trip: FishingTrip) {
  return tripTideContext(trip.date, tides.value, settings.navihan);
}

function openNew(): void {
  editing.value = null;
  formOpen.value = true;
  actionError.value = null;
}

function openEdit(trip: FishingTrip): void {
  editing.value = trip;
  formOpen.value = true;
  actionError.value = null;
}

function closeForm(): void {
  formOpen.value = false;
  editing.value = null;
}

async function onSave(input: FishingTripInput): Promise<void> {
  saving.value = true;
  actionError.value = null;
  try {
    await save(input, editing.value?.id);
    closeForm();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function onRemove(id: number): Promise<void> {
  const trip = trips.value.find(t => t.id === id);
  if (!confirm(`Supprimer la sortie du ${trip?.date ?? ''} ?`)) return;
  actionError.value = null;
  try {
    await remove(id);
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <div class="container-xxl py-3">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h1 class="h4 mb-0"><i class="bi bi-bucket me-2"></i>Carnet de pêche</h1>
      <button
        v-if="isAdmin"
        type="button"
        class="btn btn-primary btn-sm"
        data-test="new-trip"
        @click="openNew"
      >
        <i class="bi bi-plus-lg me-1"></i>Nouvelle sortie
      </button>
    </div>

    <div v-if="actionError" class="alert alert-warning py-2 small" role="alert">{{ actionError }}</div>

    <FishingTripForm
      v-if="formOpen"
      :species="species"
      :gears="gears"
      :choices="choices"
      :initial="editing"
      :default-choice="defaultChoice"
      :saving="saving"
      @save="onSave"
      @cancel="closeForm"
    />

    <div v-if="loading" class="d-flex justify-content-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Chargement…</span>
      </div>
    </div>

    <div v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <p v-else-if="!trips.length" class="text-muted fst-italic py-4 text-center">
      Aucune sortie enregistrée pour l'instant.
    </p>

    <FishingTripCard
      v-for="trip in trips"
      v-else
      :key="trip.id"
      :trip="trip"
      :refs="refs"
      :context="contextOf(trip)"
      :today="today"
      :can-edit="isAdmin"
      @edit="openEdit"
      @remove="onRemove"
    />
  </div>
</template>
```

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd client && npx vitest run src/views/FishingView.test.ts`
Expected : PASS, 6 tests.

- [ ] **Step 5 : Commit**

```bash
git add client/src/views/FishingView.vue client/src/views/FishingView.test.ts
git commit -m "$(cat <<'EOF'
feat(peche): vue /peche — liste des sorties et saisie inline

Les marées Port-Tudy sont chargées sur une plage couvrant les sorties et
la fenêtre de pré-remplissage : le contexte marée n'étant pas stocké, il
faut les horaires de chaque jour listé.

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 : Panneau d'administration des référentiels

**Files:**
- Create: `client/src/components/FishingRefsPanel.vue`
- Modify: `client/src/App.vue` (bouton navbar desktop + entrée du menu ⋮ mobile + montage du panneau)
- Test: `client/src/components/FishingRefsPanel.test.ts`

**Interfaces:**
- Consumes: `useFishingRefs` (Task 8).
- Produces: offcanvas `#fishingRefsOffcanvas`, **admin-only**, calqué sur `LexiconPanel.vue`.

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `client/src/components/FishingRefsPanel.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = {
  getRefs: vi.fn(),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  resetRefs: vi.fn()
};

vi.mock('../api/fishing', () => ({
  getRefs: (...a: unknown[]) => api.getRefs(...a),
  addRef: (...a: unknown[]) => api.addRef(...a),
  updateRef: (...a: unknown[]) => api.updateRef(...a),
  deleteRef: (...a: unknown[]) => api.deleteRef(...a),
  resetRefs: (...a: unknown[]) => api.resetRefs(...a),
  getTrips: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn()
}));

import FishingRefsPanel from './FishingRefsPanel.vue';
import { resetFishingRefsForTests } from '../composables/useFishingRefs';

describe('FishingRefsPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach(m => m.mockReset());
    api.getRefs.mockResolvedValue([
      { id: 'bar', kind: 'species', label: 'Bar' },
      { id: 'ligne', kind: 'gear', label: 'Ligne' }
    ]);
    resetFishingRefsForTests();
  });

  it('liste les engins et les espèces dans deux sections', async () => {
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Engins');
    expect(wrapper.text()).toContain('Espèces');
    expect(wrapper.text()).toContain('Ligne');
    expect(wrapper.text()).toContain('Bar');
  });

  it('ajoute une espèce', async () => {
    api.addRef.mockResolvedValue({ id: 'homard', kind: 'species', label: 'Homard' });
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();

    await wrapper.find('[data-test="new-label"]').setValue('Homard');
    await wrapper.find('[data-test="new-kind"]').setValue('species');
    await wrapper.find('[data-test="add"]').trigger('click');
    await flushPromises();

    expect(api.addRef).toHaveBeenCalledWith('species', 'Homard');
    expect(wrapper.text()).toContain('Homard');
  });

  it('affiche le message du serveur quand une suppression est refusée (409)', async () => {
    api.deleteRef.mockRejectedValue(new Error('Ce référentiel est utilisé par des prises enregistrées : il ne peut pas être supprimé.'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();

    await wrapper.findAll('[data-test="remove"]')[0].trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('utilisé par des prises enregistrées');
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier qu'ils échouent**

Run : `cd client && npx vitest run src/components/FishingRefsPanel.test.ts`
Expected : FAIL — `Failed to resolve import "./FishingRefsPanel.vue"`.

- [ ] **Step 3 : Écrire le panneau**

Créer `client/src/components/FishingRefsPanel.vue` :

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useFishingRefs } from '../composables/useFishingRefs';
import type { FishingRef, FishingRefKind } from '../types';

const { species, gears, load, add, update, remove, reset } = useFishingRefs();
onMounted(load);

const error = ref<string | null>(null);

const draft = reactive<{ kind: FishingRefKind; label: string }>({ kind: 'species', label: '' });

const editingId = ref<string | null>(null);
const editLabel = ref('');

function run(action: () => Promise<unknown>): void {
  error.value = null;
  action().catch(e => {
    error.value = e instanceof Error ? e.message : String(e);
  });
}

function onAdd(): void {
  const label = draft.label.trim();
  if (!label) return;
  run(async () => {
    await add(draft.kind, label);
    draft.label = '';
  });
}

function startEdit(ref_: FishingRef): void {
  editingId.value = ref_.id;
  editLabel.value = ref_.label;
}

function saveEdit(id: string): void {
  const label = editLabel.value.trim();
  if (!label) return;
  run(async () => {
    await update(id, label);
    editingId.value = null;
  });
}

function onRemove(ref_: FishingRef): void {
  if (confirm(`Supprimer « ${ref_.label} » ?`)) run(() => remove(ref_.id));
}

function onReset(): void {
  if (confirm('Rétablir les référentiels par défaut ? Vos ajouts seront perdus.')) run(reset);
}

const sections = computed(() => [
  { title: 'Engins', items: gears.value },
  { title: 'Espèces', items: species.value }
]);
</script>

<template>
  <div
    id="fishingRefsOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="fishingRefsOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <div>
        <h5 id="fishingRefsOffcanvasLabel" class="offcanvas-title mb-0">
          <i class="bi bi-bucket me-1"></i> Espèces et engins
        </h5>
        <span class="text-muted small">{{ gears.length }} engins · {{ species.length }} espèces</span>
      </div>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Fermer"></button>
    </div>

    <div class="offcanvas-body">
      <div v-if="error" class="alert alert-warning py-2 small" role="alert">{{ error }}</div>

      <h6 class="text-uppercase text-muted small fw-bold mb-2">Ajouter</h6>
      <form class="row g-2 mb-3" @submit.prevent="onAdd">
        <div class="col-7">
          <input
            v-model="draft.label"
            type="text"
            class="form-control form-control-sm"
            placeholder="Libellé"
            maxlength="60"
            data-test="new-label"
          />
        </div>
        <div class="col-5">
          <select v-model="draft.kind" class="form-select form-select-sm" aria-label="Type" data-test="new-kind">
            <option value="species">Espèce</option>
            <option value="gear">Engin</option>
          </select>
        </div>
        <div class="col-12 d-grid">
          <button type="submit" class="btn btn-sm btn-primary" :disabled="!draft.label.trim()" data-test="add">
            <i class="bi bi-plus-lg me-1"></i> Ajouter
          </button>
        </div>
      </form>

      <hr />

      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="text-uppercase text-muted small fw-bold mb-0">Référentiels</h6>
        <button type="button" class="btn btn-sm btn-outline-secondary" @click="onReset">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Rétablir les défauts
        </button>
      </div>

      <template v-for="section in sections" :key="section.title">
        <h6 class="small fw-bold mt-3">{{ section.title }}</h6>
        <ul class="list-group list-group-flush">
          <li v-for="item in section.items" :key="item.id" class="list-group-item px-0">
            <div v-if="editingId === item.id" class="d-flex gap-2">
              <input v-model="editLabel" type="text" class="form-control form-control-sm" maxlength="60" />
              <button type="button" class="btn btn-sm btn-primary" @click="saveEdit(item.id)">
                <i class="bi bi-check-lg"></i>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" @click="editingId = null">
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
            <div v-else class="d-flex justify-content-between align-items-center gap-2">
              <span>{{ item.label }}</span>
              <span class="btn-group btn-group-sm">
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  :aria-label="`Renommer ${item.label}`"
                  @click="startEdit(item)"
                >
                  <i class="bi bi-pencil"></i>
                </button>
                <button
                  type="button"
                  class="btn btn-outline-danger"
                  data-test="remove"
                  :aria-label="`Supprimer ${item.label}`"
                  @click="onRemove(item)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </span>
            </div>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4 : Brancher le panneau dans la navbar**

Dans `client/src/App.vue` :

1. Ajouter l'import à côté des autres panneaux :

```ts
import FishingRefsPanel from './components/FishingRefsPanel.vue';
```

2. Ajouter le bouton desktop **juste après** le bouton du lexique (celui qui cible `#lexiconOffcanvas`) :

```vue
          <button
            v-if="isAdmin"
            type="button"
            class="btn btn-outline-light btn-sm d-none d-sm-inline-flex align-items-center"
            data-bs-toggle="offcanvas"
            data-bs-target="#fishingRefsOffcanvas"
            aria-controls="fishingRefsOffcanvas"
            title="Espèces et engins"
            aria-label="Espèces et engins"
          >
            <i class="bi bi-bucket"></i>
          </button>
```

3. Dans le menu déroulant `⋮` (mobile), ajouter une entrée sur le modèle des autres `<li>` :

```vue
              <li>
                <button
                  class="dropdown-item"
                  type="button"
                  data-bs-toggle="offcanvas"
                  data-bs-target="#fishingRefsOffcanvas"
                >
                  <i class="bi bi-bucket me-2"></i>Espèces et engins
                </button>
              </li>
```

4. Monter le panneau à côté des autres offcanvas (`<LexiconPanel v-if="isAdmin" />`, etc.) :

```vue
    <FishingRefsPanel v-if="isAdmin" />
```

- [ ] **Step 5 : Lancer les tests pour vérifier qu'ils passent**

Run : `cd client && npx vitest run src/components/FishingRefsPanel.test.ts`
Expected : PASS, 3 tests.

- [ ] **Step 6 : Commit**

```bash
git add client/src/components/FishingRefsPanel.vue client/src/components/FishingRefsPanel.test.ts client/src/App.vue
git commit -m "$(cat <<'EOF'
feat(peche): panneau admin des espèces et des engins

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14 : Documentation et vérification d'ensemble

**Files:**
- Modify: `CLAUDE.md`
- Test: aucune nouvelle suite ; on fait tourner l'ensemble.

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `CLAUDE.md` à jour ; suite complète verte ; build de production réussi.

- [ ] **Step 1 : Documenter le serveur dans `CLAUDE.md`**

Dans la section « Serveur », après le bloc « Routes lexique du "mot du jour" », insérer :

```markdown
Routes carnet de pêche (`src/routes/fishing.ts`, issue #3) :
- `GET /api/fishing/trips?from&to` → sorties + prises (lecture ouverte, plage **inclusive**, 400 si
  dates invalides ou `from > to`).
- `POST /api/fishing/trips` (**admin**, 201) → crée. **La météo est figée ici**
  (`service/fishingWeather.captureTripWeather`) et **jamais au `PUT`** : la recapturer écraserait la
  météo de juillet le jour où l'on corrige une note en janvier. Capture **best-effort** — hors
  fenêtre Open-Meteo (92 j d'archive, 7 j de prévision) ou sur échec réseau, `weather` reste `null`
  et l'enregistrement aboutit quand même.
- `PUT /api/fishing/trips/:id` (**admin**) → remplace la sortie **et toutes ses prises** en une
  transaction. `DELETE` (**admin**, 204).
- `GET /api/fishing/refs` (lecture) ; `POST`/`PUT`/`DELETE /api/fishing/refs[/:id]` et
  `POST /api/fishing/refs/reset` (**admin**). ⚠️ Supprimer un référentiel **encore utilisé** par une
  prise renvoie **409** : il n'y a **pas** de clé étrangère vers `fishing_refs`, précisément pour
  qu'une sortie ancienne ne perde pas son espèce lors d'un nettoyage du référentiel.
- `service/weather.ts` expose désormais `DEFAULT_LAT`/`DEFAULT_LON` (la route météo les importe au
  lieu de les redéclarer) et `fetchWeather` prend un 6ᵉ paramètre **`pastDays`** : sans lui, une
  sortie saisie après coup enregistrerait la météo du **jour de la saisie**.
```

- [ ] **Step 2 : Documenter la persistance**

Dans le paragraphe « **Persistance : base SQLite** », remplacer « Schéma **v6** » par « Schéma **v7** »
et compléter l'énumération des tables par :

```markdown
**`fishing_trips`** / **`fishing_catches`** / **`fishing_refs`** (v7, issue #3 : carnet de pêche —
une sortie porte N prises ; `weather` est un instantané JSON **figé à la création**, le contexte
marée n'est **pas** stocké). ⚠️ `openDb` active désormais **`PRAGMA foreign_keys = ON`** :
better-sqlite3 le laisse à `OFF`, et le `ON DELETE CASCADE` de `fishing_catches` serait resté
lettre morte.
```

Compléter la liste des repositories par `fishingRepository.ts`, `fishingRefsRepository.ts`, et
mentionner `seedFishingRefsIfEmpty` dans la description de `bootstrap.ts`.

- [ ] **Step 3 : Documenter le client**

Dans la section « Client », ajouter :

```markdown
- **Routeur** (`src/router.ts`, issue #3) — l'application **cesse d'être mono-vue** : `/` = dashboard
  marées, `/peche` = carnet de pêche (chargé à la demande), toute autre URL redirige vers `/`.
  `createWebHistory` ne demande aucun changement de configuration : le repli SPA existait déjà côté
  Express (`app.get('*')`, monté **après** les routers `/api`) et côté PWA (`navigateFallback`).
- **Carnet de pêche** (`views/FishingView.vue`, `components/FishingTrip{Card,Form}.vue`,
  `components/FishingRefsPanel.vue`, `composables/useFishing.ts` + `useFishingRefs.ts`,
  `lib/fishing.ts`, issue #3) — liste antichronologique des sorties, formulaire **inline** (pas une
  modale : N lignes de prises y seraient inutilisables sur téléphone), panneau admin des espèces et
  des engins. Lecture ouverte à tout compte connecté, écriture réservée à `admin`.
  ⚠️ **Choix asymétrique assumé : la marée se recalcule, la météo se fige.** `tripTideContext`
  dérive coefficient, basses mers et remises à flot **de la date**, sans rien stocker — ce projet a
  déjà repris 11 journées de graine depuis l'annuaire officiel, et une correction doit profiter aux
  sorties déjà saisies. La météo, elle, n'est pas reproductible : elle est figée à la création.
  `aflotChoices` **s'appuie sur `aflotEvents`** (`lib/navihan.ts`) au lieu de refaire le calcul —
  deux formules d'à-flot finiraient par diverger ; l'heure retenue est celle **« Constaté »** si
  elle existe, sinon le **décalage fixe**, **jamais** l'estimation par seuil (cantonnée au tableau
  du dashboard) ; et un à-flot est daté du **jour où il a lieu**. `nearestAflot` retient le plus
  proche **passé ou à venir** : on note souvent ses prises en rentrant. Le sélecteur d'à-flot
  **réécrit** date et heure de début ; l'heure de fin n'est **jamais** pré-remplie. Rien de ce
  pré-remplissage n'est persisté.
  `summarizeCatches` rend « Bredouille » plutôt qu'une chaîne vide : une sortie sans prise est une
  donnée, pas une absence de donnée. `labelOf` retombe sur l'**id brut** quand un référentiel a
  disparu.
```

- [ ] **Step 4 : Documenter la commande de test**

Aucune nouvelle commande. Vérifier que la section « Commandes » n'a pas besoin d'ajustement (elle
mentionne déjà `npm test` et `npm run type-check`).

- [ ] **Step 5 : Lancer la suite complète**

Run : `npm test && npm run type-check`
Expected : tous les tests serveur **et** client PASS ; `vue-tsc` et `tsc -p tsconfig.check.json` sans erreur.

Si `npm run type-check` échoue sur un fichier existant non touché par ce plan, le corriger fait
partie de cette tâche : le dépôt doit rester vert.

- [ ] **Step 6 : Vérifier le build de production**

Run : `npm run build`
Expected : build serveur (`tsc` + copie `resources/`) et client (`vite build`) réussis.

- [ ] **Step 7 : Vérifier l'application réellement lancée**

Run : `npm run dev` puis ouvrir `http://localhost:5173/peche`.
Expected : la page s'affiche ; « Nouvelle sortie » ouvre le formulaire, pré-rempli sur la remise à
flot la plus proche ; un rechargement direct de `/peche` ne renvoie pas de 404. Arrêter le serveur
ensuite.

- [ ] **Step 8 : Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(peche): documente le carnet de pêche dans CLAUDE.md

Refs #3

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Points de vigilance transverses

À relire avant de considérer le chantier terminé — ce sont les pièges que ce plan a explicitement
cherché à éviter :

1. **`PRAGMA foreign_keys`** — activé dans `openDb`, **et** suppression explicite des prises dans la
   transaction. Un cascade silencieusement inactif ne se voit qu'au bout de plusieurs mois.
2. **La météo n'est capturée qu'au `POST`.** Si un jour on ajoute une action « rafraîchir la
   météo », elle doit être explicite et volontaire, jamais un effet de bord du `PUT`.
3. **`past_days`** — une sortie saisie rétroactivement sans ce paramètre enregistrerait la météo du
   jour de la saisie : pire que pas de météo.
4. **Une seule formule d'à-flot.** `aflotChoices` passe par `aflotEvents`. Ne jamais réécrire le
   décalage à la main dans `lib/fishing.ts` ni dans un composant.
5. **L'estimation par seuil reste au tableau du dashboard.** Le carnet n'utilise que l'heure
   « Remise à flot » (décalage fixe) ou l'heure constatée.
6. **Le repli SPA d'Express est monté après les routers `/api`** — le déplacer ferait renvoyer la
   coquille HTML sur une route d'API inconnue au lieu d'un 404 JSON.
7. **Aucun contexte marée n'est persisté.** Toute tentation de « figer le coefficient pour aller
   plus vite » casse le bénéfice des corrections de graine.
